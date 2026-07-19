(function () {
  const THEME_KEY = 'app-theme';
  const ACCENT_KEY = 'app-accent';
  const ACCENT_PRESETS = Object.freeze([
    { id: 'default', name: '默认', dark: '#00c2ff', darkPrimary: '#0369a1', light: '#2563eb', lightPrimary: '#2563eb' },
    { id: 'indigo', name: '靛蓝', dark: '#a5b4fc', darkPrimary: '#4f46e5', light: '#4338ca', lightPrimary: '#4338ca' },
    { id: 'forest', name: '青绿', dark: '#6ee7b7', darkPrimary: '#047857', light: '#047857', lightPrimary: '#047857' },
    { id: 'rose', name: '玫红', dark: '#fda4af', darkPrimary: '#be123c', light: '#be123c', lightPrimary: '#be123c' },
    { id: 'orange', name: '橙色', dark: '#fdba74', darkPrimary: '#c2410c', light: '#c2410c', lightPrimary: '#c2410c' },
    { id: 'violet', name: '紫罗兰', dark: '#d8b4fe', darkPrimary: '#7e22ce', light: '#7e22ce', lightPrimary: '#7e22ce' },
  ]);
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;

  function getTheme() {
    return localStorage.getItem(THEME_KEY) || 'dark';
  }

  function normalizeAccent(value) {
    const accent = String(value || '').trim().toLowerCase();
    if (HEX_COLOR.test(accent)) return accent;
    return ACCENT_PRESETS.some((item) => item.id === accent) ? accent : 'default';
  }

  function getAccent() {
    return normalizeAccent(localStorage.getItem(ACCENT_KEY) || 'default');
  }

  function resolveAccent(accent = getAccent(), theme = getTheme()) {
    const normalized = normalizeAccent(accent);
    if (HEX_COLOR.test(normalized)) {
      return { accent: normalized, primary: normalized };
    }

    const preset = ACCENT_PRESETS.find((item) => item.id === normalized) || ACCENT_PRESETS[0];
    const light = theme === 'light';
    return {
      accent: light ? preset.light : preset.dark,
      primary: light ? preset.lightPrimary : preset.darkPrimary,
    };
  }

  function applyAccent(accent = getAccent()) {
    const root = document.documentElement;
    const normalized = normalizeAccent(accent);
    if (normalized === 'default') {
      root.style.removeProperty('--accent');
      root.style.removeProperty('--primary');
      return;
    }

    const colors = resolveAccent(normalized, getTheme());
    root.style.setProperty('--accent', colors.accent);
    root.style.setProperty('--primary', colors.primary);
  }

  function setAccent(accent) {
    const normalized = normalizeAccent(accent);
    if (normalized === 'default') localStorage.removeItem(ACCENT_KEY);
    else localStorage.setItem(ACCENT_KEY, normalized);
    applyAccent(normalized);
    window.dispatchEvent(new CustomEvent('msyk-accent-change', { detail: normalized }));
    return normalized;
  }

  function resetAccent() {
    return setAccent('default');
  }

  function setTheme(theme) {
    const normalized = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', normalized);
    localStorage.setItem(THEME_KEY, normalized);
    applyAccent();
    window.dispatchEvent(new CustomEvent('msyk-theme-change', { detail: normalized }));
  }

  function initTheme() {
    setTheme(getTheme());
  }

  function toggleTheme() {
    const cur = getTheme();
    setTheme(cur === 'dark' ? 'light' : 'dark');
  }

  // 挂到全局
  window.Theme = {
    getTheme,
    setTheme,
    initTheme,
    toggleTheme,
    getAccent,
    setAccent,
    resetAccent,
    resolveAccent,
    getAccentOptions: () => ACCENT_PRESETS.map((item) => ({ ...item })),
  };
})();
