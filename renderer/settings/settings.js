window.Theme?.initTheme();

const $ = (s) => document.querySelector(s);

$('#backBtn')?.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = '../me/index.html';
});

function detectThemeMode() {
  const root = document.documentElement;
  const body = document.body;

  const attr =
    root.getAttribute('data-theme') ||
    body?.getAttribute('data-theme') ||
    localStorage.getItem('theme') ||
    localStorage.getItem('msyk_theme') ||
    localStorage.getItem('app_theme') ||
    localStorage.getItem('theme_mode') ||
    '';

  if (String(attr).toLowerCase().includes('light')) return 'light';
  if (String(attr).toLowerCase().includes('dark')) return 'dark';

  const bg = getComputedStyle(document.body).backgroundColor;
  const nums = (bg.match(/\d+/g) || []).map(Number);
  if (nums.length >= 3) {
    const brightness = (nums[0] * 299 + nums[1] * 587 + nums[2] * 114) / 1000;
    return brightness > 128 ? 'light' : 'dark';
  }

  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function setThemeUI(mode) {
  const isLight = mode === 'light';
  const text = $('#themeText');
  const sw = $('#themeSwitch');

  if (text) text.textContent = isLight ? '浅色' : '深色';
  if (sw) sw.classList.toggle('on', isLight);

  // 当前页面备用全局变量
  window.MSYK_THEME_MODE = isLight ? 'light' : 'dark';
  document.documentElement.dataset.currentTheme = window.MSYK_THEME_MODE;
}

function refreshThemeUI() {
  setThemeUI(detectThemeMode());
}

refreshThemeUI();

$('#themeRow')?.addEventListener('click', () => {
  window.Theme?.toggleTheme?.();

  // Theme.toggleTheme 可能会异步写 localStorage / DOM，延迟刷新一次 UI。
  setTimeout(refreshThemeUI, 0);

  // 继续保留原来的 reload 行为，确保全局主题 CSS 在所有页面状态一致。
  setTimeout(() => location.reload(), 80);
});

function setDebugUI(enabled) {
  const on = !!enabled;
  const text = $('#debugText');
  const sw = $('#debugSwitch');

  if (text) text.textContent = on ? '开启' : '关闭';
  if (sw) sw.classList.toggle('on', on);

  // 当前页面备用全局变量
  window.MSYK_DEBUG_ENABLED = on;
  document.documentElement.dataset.debug = on ? '1' : '0';
}

async function readDebugMode() {
  try {
    if (window.electronAPI?.debugGet) {
      return !!(await window.electronAPI.debugGet());
    }
  } catch (e) {
    console.warn('[settings] debugGet failed', e);
  }

  return localStorage.getItem('msyk_debug_mode') === '1';
}

async function writeDebugMode(enabled) {
  const on = !!enabled;
  try {
    if (window.electronAPI?.debugSet) {
      await window.electronAPI.debugSet(on);
    } else {
      localStorage.setItem('msyk_debug_mode', on ? '1' : '0');
    }
  } catch (e) {
    console.warn('[settings] debugSet failed, fallback to localStorage', e);
    localStorage.setItem('msyk_debug_mode', on ? '1' : '0');
  }

  if (window.MSYK_DEBUG?.set) {
    try { window.MSYK_DEBUG.set(on); } catch {}
  }

  setDebugUI(on);
}

(async function initDebugMode() {
  setDebugUI(await readDebugMode());
})();

$('#debugRow')?.addEventListener('click', async () => {
  const current = await readDebugMode();
  await writeDebugMode(!current);
});
