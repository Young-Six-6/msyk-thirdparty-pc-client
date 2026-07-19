window.Theme?.initTheme();

const $ = (s) => document.querySelector(s);

(async () => {
  const resp = await window.msykAPI.apiGetSession();
  const s = resp?.data || resp;

  $('#realName').textContent = s?.realName || '--';
  $('#userName').textContent = s?.userName || '--';
  $('#studentId').textContent = s?.studentId || '--';

  const optionalNames = [
    ['#schoolRow', '#schoolName', s?.schoolName],
    ['#classRow', '#className', s?.className || s?.groupName],
  ];
  optionalNames.forEach(([rowSelector, valueSelector, rawValue]) => {
    const value = String(rawValue || '').trim();
    const row = $(rowSelector);
    if (row) row.hidden = !value;
    if (value) $(valueSelector).textContent = value;
  });

  const pre = $('#session');
  const debugPanel = document.querySelector('.debug');

  const debugEnabled = (() => {
    try {
      if (window.MSYK_DEBUG?.get) return !!window.MSYK_DEBUG.get();
      if (window.MSYK_DEBUG_ENABLED !== undefined) return !!window.MSYK_DEBUG_ENABLED;
      return localStorage.getItem('msyk_debug_mode') === '1';
    } catch {
      return false;
    }
  })();

  if (debugPanel) {
    debugPanel.classList.toggle('debug-hidden', !debugEnabled);
  }

  if (pre && debugEnabled) {
    pre.textContent = JSON.stringify(s, null, 2);
  } else if (pre) {
    pre.textContent = '';
  }
})();

$('#backBtn')?.addEventListener('click', () => {
  location.replace('../home/index.html');
});

$('#logout')?.addEventListener('click', async () => {
  await window.msykAPI.apiLogout();
  location.replace('../login/index.html');
});

document.querySelectorAll('.tabbar .tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const go = btn.dataset.go;
    if (go === 'home') location.replace('../home/index.html');
    if (go === 'homework') location.replace('../homework/index.html?from=me');
    if (go === 'me') location.replace('./index.html');
  });
});
$('#settingEntry')?.addEventListener('click', () => {
  location.replace('../settings/index.html?from=me');
});
$('#aboutEntry')?.addEventListener('click', () => {
  location.replace('../about/index.html?from=me');
});
