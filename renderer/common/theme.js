(function () {
  const THEME_KEY = 'app-theme';

  function getTheme() {
    return localStorage.getItem(THEME_KEY) || 'dark';
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
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
  };
})();
