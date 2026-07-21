(function initMsykPlatform(root) {
  'use strict';

  function normalizeDeviceType(value) {
    const type = String(value || '').trim().toLowerCase();
    if (['phone', 'mobile', 'handset'].includes(type)) return 'phone';
    if (['tablet', 'pad', 'ipad'].includes(type)) return 'tablet';
    if (['desktop', 'pc', 'electron'].includes(type)) return 'desktop';
    return '';
  }

  function detectDeviceType() {
    const nativeApi = root.MSYK_NATIVE_API || null;
    const explicit = normalizeDeviceType(
      root.MSYK_DEVICE_TYPE || root.MSYK_NATIVE_DEVICE?.type || nativeApi?.deviceType
    );
    if (explicit) return explicit;

    const nav = root.navigator || {};
    const userAgent = String(nav.userAgent || '');
    const platform = String(nav.platform || '');

    if (/iPad/i.test(userAgent) || (platform === 'MacIntel' && Number(nav.maxTouchPoints) > 1)) {
      return 'tablet';
    }
    if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent) ? 'phone' : 'tablet';
    if (/iPhone|iPod|Windows Phone|Mobile/i.test(userAgent)) return 'phone';
    return 'desktop';
  }

  function createParentApiProxy() {
    const pending = new Map();
    let sequence = 0;

    root.addEventListener('message', (event) => {
      if (event.source !== root.parent || event.data?.type !== 'msyk:api-response') return;
      const entry = pending.get(event.data.id);
      if (!entry) return;
      clearTimeout(entry.timeout);
      pending.delete(event.data.id);
      entry.resolve(event.data.result);
    });

    return new Proxy({}, {
      get: (target, method) => {
        if (method === 'then' || typeof method !== 'string') return undefined;
        return (...args) => new Promise((resolve) => {
          const id = `${Date.now()}-${++sequence}`;
          const timeout = setTimeout(() => {
            pending.delete(id);
            resolve({ code: 500, msg: `页面 API 超时: ${method}` });
          }, 90000);
          pending.set(id, { resolve, timeout });
          root.parent.postMessage({
            type: 'msyk:api-request',
            id,
            method,
            args,
          }, '*');
        });
      },
    });
  }

  const deviceType = detectDeviceType();
  const nativeApi = root.MSYK_NATIVE_API || null;
  const electronApi = root.electronAPI || null;
  const embeddedPrimary = root.parent !== root
    && root.PrimaryPageTransition?.embedded === true;
  const parentApi = embeddedPrimary ? createParentApiProxy() : null;
  const isMobileDevice = deviceType === 'phone' || deviceType === 'tablet';

  // A native shell injects MSYK_NATIVE_API with the same Promise-based contract as preload.
  // Viewport size is deliberately not used here; responsive CSS owns layout selection.
  const api = parentApi || (isMobileDevice
    ? (nativeApi || electronApi)
    : (electronApi || nativeApi));
  const runtime = parentApi
    ? 'embedded'
    : (api === nativeApi && nativeApi ? 'native' : (electronApi ? 'electron' : 'web'));

  root.msykDevice = Object.freeze({
    type: deviceType,
    runtime,
    isMobile: isMobileDevice,
  });
  root.msykAPI = api;
})(window);
