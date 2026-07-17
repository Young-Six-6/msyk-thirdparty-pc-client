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

  const deviceType = detectDeviceType();
  const nativeApi = root.MSYK_NATIVE_API || null;
  const electronApi = root.electronAPI || null;
  const isMobileDevice = deviceType === 'phone' || deviceType === 'tablet';

  // A native shell injects MSYK_NATIVE_API with the same Promise-based contract as preload.
  // Viewport size is deliberately not used here; responsive CSS owns layout selection.
  const api = isMobileDevice
    ? (nativeApi || electronApi)
    : (electronApi || nativeApi);
  const runtime = api === nativeApi && nativeApi ? 'native' : (electronApi ? 'electron' : 'web');

  root.msykDevice = Object.freeze({
    type: deviceType,
    runtime,
    isMobile: isMobileDevice,
  });
  root.msykAPI = api;
})(window);
