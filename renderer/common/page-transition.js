(function initPrimaryPageBridge(root) {
  'use strict';

  const pageOrder = ['home', 'homework', 'score', 'me'];
  const currentPage = pageOrder.find((page) => {
    const path = String(location.pathname || '').replace(/\\/g, '/').toLowerCase();
    return path.endsWith(`/renderer/${page}/index.html`);
  }) || '';
  const embedded = root.parent !== root
    && new URLSearchParams(location.search).get('embedded') === '1';

  function shellUrl(page) {
    return `../main/index.html?page=${encodeURIComponent(page)}`;
  }

  function navigate(target) {
    if (!pageOrder.includes(target)) return;
    if (embedded) {
      root.parent.postMessage({ type: 'msyk:primary-navigate', target }, '*');
      return;
    }
    location.replace(shellUrl(target));
  }

  function open(url) {
    const target = new URL(String(url || ''), location.href).href;
    if (embedded) {
      root.parent.postMessage({ type: 'msyk:open-page', url: target }, '*');
      return;
    }
    location.replace(target);
  }

  if (embedded) {
    document.documentElement.classList.add('primary-page-embedded');
  } else if (root.parent === root && currentPage) {
    document.documentElement.style.visibility = 'hidden';
    location.replace(shellUrl(currentPage));
  }

  root.PrimaryPageTransition = Object.freeze({ navigate, open, embedded });
})(window);
