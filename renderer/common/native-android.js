(function initAndroidNativeApi(root) {
  'use strict';

  const bridge = root.MSYK_ANDROID;
  if (!bridge || typeof bridge.postMessage !== 'function') return;
  const viewerBridge = root.MSYK_VIEWER;
  const inlineViewerBridge = root.MSYK_INLINE_VIEWER;

  const pending = new Map();
  const UPLOAD_CHUNK_SIZE = 192 * 1024;
  let sequence = 0;
  let debugEnabled = false;

  function invoke(method, payload = {}, timeoutMs = 90000) {
    const id = `${Date.now()}-${++sequence}`;
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        resolve({ code: 500, msg: `Android API 超时: ${method}` });
      }, timeoutMs);
      pending.set(id, { resolve, timeout });
      try {
        bridge.postMessage(JSON.stringify({ id, method, payload: payload || {} }));
      } catch (error) {
        clearTimeout(timeout);
        pending.delete(id);
        resolve({ code: 500, msg: error?.message || `Android API 调用失败: ${method}` });
      }
    });
  }

  function reportUploadProgress(message, progress) {
    root.dispatchEvent(new CustomEvent('msyk-upload-progress', {
      detail: { message, progress },
    }));
  }

  async function uploadHomeworkMedia(payload = {}) {
    const base64 = String(payload.base64 || '');
    if (!base64) return { code: 500, msg: '上传文件为空' };

    const uploadId = `${Date.now()}-${++sequence}`;
    const metadata = { ...payload, uploadId, expectedLength: base64.length };
    delete metadata.base64;

    reportUploadProgress('正在准备上传...', 0);
    let result = await invoke('uploadHomeworkMediaStart', metadata);
    if (!result || result.code !== 200) return result;

    const chunkCount = Math.ceil(base64.length / UPLOAD_CHUNK_SIZE);
    for (let index = 0; index < chunkCount; index++) {
      const start = index * UPLOAD_CHUNK_SIZE;
      result = await invoke('uploadHomeworkMediaChunk', {
        uploadId,
        chunk: base64.slice(start, start + UPLOAD_CHUNK_SIZE),
      });
      if (!result || result.code !== 200) return result;

      const progress = Math.round(((index + 1) / chunkCount) * 100);
      reportUploadProgress(`正在准备上传 ${progress}%`, progress);
    }

    reportUploadProgress('正在上传到服务器...', 100);
    return invoke('uploadHomeworkMediaFinish', { uploadId }, 180000);
  }

  bridge.onmessage = (event) => {
    let response = null;
    try {
      response = JSON.parse(String(event.data || ''));
    } catch {
      return;
    }
    const entry = pending.get(response?.id);
    if (!entry) return;
    clearTimeout(entry.timeout);
    pending.delete(response.id);
    entry.resolve(response.result);
  };

  function inferViewerType(url, hint = '') {
    const explicitType = String(hint || '').trim().toLowerCase();
    if (['pdf', 'image', 'web'].includes(explicitType)) return explicitType;
    const probe = `${hint} ${url}`.toLowerCase().split('#', 1)[0];
    const path = String(url || '').toLowerCase().split(/[?#]/, 1)[0];
    if (/\.pdf(?:\s|$)/.test(probe) || path.endsWith('.pdf')) return 'pdf';
    if (/\.(png|jpe?g|gif|webp|bmp)(?:\s|$)/.test(probe)
      || /x-oss-process=image/.test(probe)) return 'image';
    return 'web';
  }

  function openNativeViewer(url, title = '材料查看', type = '') {
    const value = String(url || '').trim();
    if (!/^https:\/\//i.test(value)
      || !viewerBridge
      || typeof viewerBridge.postMessage !== 'function') return false;
    try {
      viewerBridge.postMessage(JSON.stringify({
        url: value,
        title: String(title || '材料查看'),
        type: inferViewerType(value, type),
        theme: root.Theme?.getTheme?.() || 'dark',
      }));
      return true;
    } catch (error) {
      console.warn('[android-viewer] open failed', error);
      return false;
    }
  }

  function enableImageGestures(stage, image) {
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let lastX = 0;
    let lastY = 0;
    let lastDistance = 0;
    let lastTap = 0;

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const apply = () => {
      const maxX = Math.max(0, stage.clientWidth * (scale - 1) / 2);
      const maxY = Math.max(0, stage.clientHeight * (scale - 1) / 2);
      offsetX = clamp(offsetX, -maxX, maxX);
      offsetY = clamp(offsetY, -maxY, maxY);
      image.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    };
    const distance = (touches) => Math.hypot(
      touches[0].clientX - touches[1].clientX,
      touches[0].clientY - touches[1].clientY,
    );

    stage.style.touchAction = 'none';
    stage.addEventListener('touchstart', (event) => {
      if (event.target.closest('button')) return;
      event.preventDefault();
      if (event.touches.length >= 2) {
        lastDistance = distance(event.touches);
      } else if (event.touches.length === 1) {
        lastX = event.touches[0].clientX;
        lastY = event.touches[0].clientY;
      }
    }, { passive: false });
    stage.addEventListener('touchmove', (event) => {
      if (event.target.closest('button')) return;
      event.preventDefault();
      if (event.touches.length >= 2) {
        const nextDistance = distance(event.touches);
        if (lastDistance > 0) scale = clamp(scale * nextDistance / lastDistance, 1, 5);
        lastDistance = nextDistance;
        if (scale === 1) offsetX = offsetY = 0;
      } else if (event.touches.length === 1 && scale > 1) {
        const touch = event.touches[0];
        offsetX += touch.clientX - lastX;
        offsetY += touch.clientY - lastY;
        lastX = touch.clientX;
        lastY = touch.clientY;
      }
      apply();
    }, { passive: false });
    stage.addEventListener('touchend', (event) => {
      if (event.target.closest('button')) return;
      lastDistance = 0;
      if (event.touches.length) {
        lastX = event.touches[0].clientX;
        lastY = event.touches[0].clientY;
        return;
      }
      const now = Date.now();
      if (now - lastTap < 280) {
        scale = scale > 1 ? 1 : 2.5;
        if (scale === 1) offsetX = offsetY = 0;
        apply();
        lastTap = 0;
      } else {
        lastTap = now;
      }
    }, { passive: true });
  }

  function makeOpenButton(surface, label, url, type) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'msyk-native-viewer-open';
    button.textContent = label;
    Object.assign(button.style, {
      minHeight: '40px',
      padding: '0 14px',
      border: '1px solid var(--primary, #3b82f6)',
      borderRadius: '8px',
      background: 'var(--primary, #3b82f6)',
      color: '#fff',
      fontSize: '14px',
      cursor: 'pointer',
    });
    button.addEventListener('click', () => openNativeViewer(
      url,
      surface.dataset.viewerTitle || '材料查看',
      type,
    ));
    return button;
  }

  function renderNativeViewer(surface, url) {
    surface.__nativeViewerCleanup?.();
    surface.__nativeViewerCleanup = null;
    surface.replaceChildren();
    if (!url || url === 'about:blank') return;

    const type = inferViewerType(url, surface.dataset.viewerType || surface.dataset.viewerTitle || '');
    const stage = document.createElement('div');
    Object.assign(stage.style, {
      position: 'absolute',
      inset: '0',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      overflow: 'hidden',
      background: 'var(--panel2, #10131a)',
      color: 'var(--text, #e7e7e7)',
    });
    surface.appendChild(stage);

    if (type === 'image') {
      const image = document.createElement('img');
      image.alt = surface.dataset.viewerTitle || '作业材料';
      Object.assign(image.style, {
        display: 'block',
        maxWidth: '100%',
        maxHeight: '100%',
        width: 'auto',
        height: 'auto',
        objectFit: 'contain',
        transformOrigin: 'center center',
        userSelect: 'none',
        webkitUserDrag: 'none',
      });
      image.addEventListener('error', () => {
        stage.replaceChildren(
          Object.assign(document.createElement('span'), { textContent: '图片加载失败' }),
          makeOpenButton(surface, '重新打开', url, type),
        );
      }, { once: true });
      stage.appendChild(image);
      stage.appendChild(makeOpenButton(surface, '全屏查看', url, type));
      const openButton = stage.lastElementChild;
      Object.assign(openButton.style, {
        position: 'absolute',
        right: '10px',
        bottom: '10px',
        zIndex: '2',
      });
      enableImageGestures(stage, image);
      image.src = url;
      return;
    }

    if (type === 'web') {
      if (inlineViewerBridge && typeof inlineViewerBridge.postMessage === 'function') {
        const label = document.createElement('span');
        label.textContent = '正在加载答题卡...';
        label.style.fontSize = '14px';
        stage.appendChild(label);

        let frameRequest = 0;
        const send = (payload) => {
          try { inlineViewerBridge.postMessage(JSON.stringify(payload)); } catch {}
        };
        const sync = () => {
          frameRequest = 0;
          const rect = surface.getBoundingClientRect();
          if (!surface.isConnected || rect.width < 1 || rect.height < 1) {
            send({ action: 'hide' });
            return;
          }
          const ratio = root.devicePixelRatio || 1;
          send({
            action: 'show',
            url,
            theme: root.Theme?.getTheme?.() || 'dark',
            left: Math.round(rect.left * ratio),
            top: Math.round(rect.top * ratio),
            width: Math.round(rect.width * ratio),
            height: Math.round(rect.height * ratio),
          });
        };
        const scheduleSync = () => {
          if (!frameRequest) frameRequest = requestAnimationFrame(sync);
        };
        const resizeObserver = root.ResizeObserver ? new ResizeObserver(scheduleSync) : null;
        resizeObserver?.observe(surface);
        root.addEventListener('resize', scheduleSync);
        surface.__nativeViewerCleanup = () => {
          if (frameRequest) cancelAnimationFrame(frameRequest);
          resizeObserver?.disconnect();
          root.removeEventListener('resize', scheduleSync);
          send({ action: 'hide' });
        };
        scheduleSync();
        return;
      }

      const frame = document.createElement('iframe');
      const theme = root.Theme?.getTheme?.() || 'dark';
      frame.src = url;
      frame.title = surface.dataset.viewerTitle || '网页材料';
      frame.setAttribute('allow', 'autoplay; fullscreen');
      frame.setAttribute('referrerpolicy', 'no-referrer-when-downgrade');
      Object.assign(frame.style, {
        width: '100%',
        height: '100%',
        border: '0',
        background: theme === 'dark' ? '#0f1115' : '#fff',
        colorScheme: theme,
        filter: theme === 'dark' ? 'invert(.9) hue-rotate(180deg)' : 'none',
      });
      stage.style.gap = '0';
      stage.appendChild(frame);
      const openButton = makeOpenButton(surface, '全屏查看', url, type);
      Object.assign(openButton.style, {
        position: 'absolute',
        right: '10px',
        bottom: '10px',
        zIndex: '2',
      });
      stage.appendChild(openButton);
      return;
    }

    const label = document.createElement('span');
    label.textContent = 'PDF 材料';
    label.style.fontSize = '14px';
    stage.appendChild(label);
    stage.appendChild(makeOpenButton(surface, '打开 PDF', url, type));
  }

  function replaceNativeViewers() {
    document.querySelectorAll('webview').forEach((viewer) => {
      const surface = document.createElement('div');
      const initialUrl = viewer.getAttribute('src') || '';
      for (const attribute of viewer.attributes) {
        if (['src', 'partition', 'useragent', 'allowpopups'].includes(attribute.name)) continue;
        surface.setAttribute(attribute.name, attribute.value);
      }
      surface.classList.add('msyk-native-viewer');
      Object.assign(surface.style, {
        position: 'relative',
        minWidth: '0',
        minHeight: '0',
        overflow: 'hidden',
        border: '0',
      });

      let currentUrl = '';
      Object.defineProperty(surface, 'src', {
        configurable: true,
        get: () => currentUrl,
        set: (value) => {
          currentUrl = String(value || '');
          surface.dataset.src = currentUrl;
          renderNativeViewer(surface, currentUrl);
        },
      });
      surface.getURL = () => currentUrl;
      surface.insertCSS = () => Promise.resolve();
      surface.openNativeViewer = () => openNativeViewer(
        currentUrl,
        surface.dataset.viewerTitle || '材料查看',
        surface.dataset.viewerType || '',
      );
      viewer.replaceWith(surface);
      if (initialUrl) surface.src = initialUrl;
    });
  }

  const observer = new MutationObserver(replaceNativeViewers);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  root.msykPrepareNativeViewers = replaceNativeViewers;
  root.msykOpenNativeViewer = openNativeViewer;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', replaceNativeViewers, { once: true });
  } else {
    replaceNativeViewers();
  }

  const api = {
    apiLogin: (payload) => invoke('apiLogin', payload),
    apiGetSession: () => invoke('apiGetSession'),
    apiLogout: () => invoke('apiLogout'),
    getSavedLogin: () => invoke('getSavedLogin'),
    setSavedLogin: (payload) => invoke('setSavedLogin', payload),
    homeStats: () => invoke('homeStats'),
    hwSubjects: () => invoke('hwSubjects'),
    hwList: (payload) => invoke('hwList', payload),
    hwCardPreviewUrl: (payload) => invoke('hwCardPreviewUrl', payload),
    hwStatus: (payload) => invoke('hwStatus', payload),
    hwPptInfo: (payload) => invoke('hwPptInfo', payload),
    checkHomeworkEndTime: (payload) => invoke('checkHomeworkEndTime', payload),
    getHomeworkCardInfo: (payload) => invoke('getHomeworkCardInfo', payload),
    getCorrectAnswers: (payload) => invoke('getCorrectAnswers', payload),
    getHomeworkTime: (payload) => invoke('getHomeworkTime', payload),
    saveCardAnswer: (payload) => invoke('saveCardAnswer', payload),
    saveCardAnswerObjectives: (payload) => invoke('saveCardAnswerObjectives', payload),
    addStudentExplainSign: (payload) => invoke('addStudentExplainSign', payload),
    uploadHomeworkMedia,
    removeCardAnswer: (payload) => invoke('removeCardAnswer', payload),
    submitReadTime: (payload) => invoke('submitReadTime', payload),
    submitReadCountTime: (payload) => invoke('submitReadCountTime', payload),
    debugGet: async () => {
      debugEnabled = (await invoke('debugGet')) === true;
      try { localStorage.setItem('msyk_debug_mode', debugEnabled ? '1' : '0'); } catch {}
      return debugEnabled;
    },
    debugSet: async (enabled) => {
      debugEnabled = (await invoke('debugSet', { enabled: !!enabled })) === true;
      try { localStorage.setItem('msyk_debug_mode', debugEnabled ? '1' : '0'); } catch {}
      return debugEnabled;
    },
  };

  root.MSYK_NATIVE_API = Object.freeze(api);
  root.MSYK_DEBUG = {
    get: () => debugEnabled,
    set: (enabled) => {
      debugEnabled = !!enabled;
      return debugEnabled;
    },
    log: (...args) => { if (debugEnabled) console.debug('[MSYK_DEBUG]', ...args); },
    warn: (...args) => { if (debugEnabled) console.warn('[MSYK_DEBUG]', ...args); },
    error: (...args) => { if (debugEnabled) console.error('[MSYK_DEBUG]', ...args); },
  };
  api.debugGet().catch(() => {});
})(window);
