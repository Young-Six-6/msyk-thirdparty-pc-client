(function initPrimaryShell() {
  'use strict';

  const pages = ['home', 'homework', 'score', 'me'];
  const track = document.getElementById('primaryTrack');
  const tabbar = document.getElementById('primaryTabbar');
  const frames = new Map(
    [...document.querySelectorAll('[data-primary-page]')]
      .map((frame) => [frame.dataset.primaryPage, frame])
  );
  let currentIndex = Math.max(0, pages.indexOf(
    new URLSearchParams(location.search).get('page') || 'home'
  ));
  const loadedPages = new Set();
  let pendingTarget = '';
  const allowedApiMethods = new Set([
    'apiGetSession',
    'apiLogout',
    'debugGet',
    'getCorrectAnswers',
    'getHomeworkCardInfo',
    'homeStats',
    'hwCardPreviewUrl',
    'hwList',
    'withdrawHomework',
    'hwPptInfo',
    'hwStatus',
    'hwSubjects',
    'scoreHomeworkList',
    'scoreHomeworkTrend',
    'scoreTestList',
    'schoolExerciseAccess',
    'studyCircleAuthority',
  ]);

  function frameIsOnPrimaryPage(page, frame) {
    try {
      const path = frame.contentWindow.location.pathname.replace(/\\/g, '/').toLowerCase();
      return path.endsWith(`/renderer/${page}/index.html`);
    } catch {
      return true;
    }
  }

  function trustedRendererUrl(value) {
    try {
      const url = new URL(value, location.href);
      const path = url.pathname.replace(/\\/g, '/').toLowerCase();
      const rendererRoot = new URL('../', location.href);
      const rootPath = rendererRoot.pathname.replace(/\\/g, '/').toLowerCase();
      if (!path.startsWith(rootPath)) return null;
      if (rendererRoot.protocol === 'file:' && url.protocol === 'file:') return url;
      if (url.origin === rendererRoot.origin) return url;
    } catch {
      return null;
    }
    return null;
  }

  function openPage(value) {
    const url = trustedRendererUrl(value);
    if (url) location.replace(url.href);
  }

  async function handleApiRequest(event, message) {
    const { id, method, args } = message;
    let result;
    try {
      if (!allowedApiMethods.has(method)) throw new Error('该页面无权调用此 API');
      const fn = window.msykAPI?.[method];
      if (typeof fn !== 'function') throw new Error(`API 不可用: ${method}`);
      result = await fn(...(Array.isArray(args) ? args : []));
    } catch (error) {
      result = { code: 500, msg: error?.message || String(error) };
    }
    event.source.postMessage({ type: 'msyk:api-response', id, result }, '*');
  }

  function render(target, animate = true) {
    const nextIndex = pages.indexOf(target);
    if (nextIndex < 0) return;
    if (animate && !loadedPages.has(target)) {
      pendingTarget = target;
      return;
    }

    const distance = Math.abs(nextIndex - currentIndex);
    track.style.setProperty('--primary-slide-duration', distance > 1 ? '520ms' : '400ms');
    track.classList.toggle('initializing', !animate);
    track.style.transform = `translate3d(${-nextIndex * 100}%, 0, 0)`;
    tabbar.style.setProperty('--primary-tab-index', String(nextIndex));
    tabbar.querySelectorAll('[data-go]').forEach((button) => {
      const active = button.dataset.go === target;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    frames.forEach((frame, page) => {
      const active = page === target;
      frame.toggleAttribute('inert', !active);
      frame.setAttribute('aria-hidden', active ? 'false' : 'true');
      frame.tabIndex = active ? 0 : -1;
    });

    currentIndex = nextIndex;
    const url = new URL(location.href);
    url.searchParams.set('page', target);
    history.replaceState({ page: target }, '', url.href);

    if (!animate) requestAnimationFrame(() => track.classList.remove('initializing'));
  }

  tabbar.addEventListener('click', (event) => {
    const button = event.target.closest('[data-go]');
    if (button) render(button.dataset.go);
  });

  window.addEventListener('message', (event) => {
    const sourcePage = pages.find((page) => frames.get(page)?.contentWindow === event.source);
    if (!sourcePage || !event.data || typeof event.data !== 'object') return;
    if (event.data.type === 'msyk:api-request') {
      handleApiRequest(event, event.data);
      return;
    }
    if (event.data.type === 'msyk:primary-navigate') render(event.data.target);
    if (event.data.type === 'msyk:open-page') openPage(event.data.url);
  });

  frames.forEach((frame, page) => {
    const button = tabbar.querySelector(`[data-go="${page}"]`);
    if (button && page !== pages[currentIndex]) button.disabled = true;
    frame.addEventListener('load', () => {
      if (!frameIsOnPrimaryPage(page, frame)) {
        try { openPage(frame.contentWindow.location.href); } catch {}
        return;
      }
      loadedPages.add(page);
      if (button) button.disabled = false;
      if (pendingTarget === page) {
        pendingTarget = '';
        render(page);
      }
    });
    frame.src = frame.dataset.src;
  });

  render(pages[currentIndex], false);
})();
