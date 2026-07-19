window.Theme?.initTheme();

const $ = (s) => document.querySelector(s);

$('#backBtn')?.addEventListener('click', () => {
  location.replace('../me/index.html');
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
  refreshThemeUI();
  refreshAccentUI();
});

function refreshAccentUI() {
  const current = window.Theme?.getAccent?.() || 'default';
  const options = window.Theme?.getAccentOptions?.() || [];
  const selected = options.find((item) => item.id === current);
  const text = $('#accentText');
  const picker = $('#customAccent');
  const reset = $('#resetAccent');

  if (text) text.textContent = selected?.name || '自定义';
  document.querySelectorAll('.color-swatch').forEach((button) => {
    const active = button.dataset.accent === current;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-checked', active ? 'true' : 'false');
  });

  const colors = window.Theme?.resolveAccent?.(current, detectThemeMode());
  if (picker && colors?.accent) picker.value = colors.accent;
  if (reset) reset.disabled = current === 'default';
}

function initAccentPalette() {
  const palette = $('#accentPalette');
  const options = window.Theme?.getAccentOptions?.() || [];
  if (!palette) return;

  options.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-swatch';
    button.dataset.accent = option.id;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-label', option.name);
    button.title = option.name;
    button.style.setProperty('--swatch-dark', option.dark);
    button.style.setProperty('--swatch-light', option.light);
    button.addEventListener('click', () => {
      window.Theme?.setAccent?.(option.id);
      refreshAccentUI();
    });
    palette.appendChild(button);
  });

  refreshAccentUI();
}

$('#customAccent')?.addEventListener('input', (event) => {
  window.Theme?.setAccent?.(event.target.value);
  refreshAccentUI();
});

$('#resetAccent')?.addEventListener('click', () => {
  window.Theme?.resetAccent?.();
  refreshAccentUI();
});

initAccentPalette();

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
    if (window.msykAPI?.debugGet) {
      return !!(await window.msykAPI.debugGet());
    }
  } catch (e) {
    console.warn('[settings] debugGet failed', e);
  }

  return localStorage.getItem('msyk_debug_mode') === '1';
}

async function writeDebugMode(enabled) {
  const on = !!enabled;
  try {
    if (window.msykAPI?.debugSet) {
      await window.msykAPI.debugSet(on);
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
