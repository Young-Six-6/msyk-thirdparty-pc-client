window.Theme?.initTheme();

const $ = (s) => document.querySelector(s);

(async () => {
  const resp = await window.electronAPI.apiGetSession();
  const s = resp?.data || resp;

  $('#realName').textContent = s?.realName || '--';
  $('#userName').textContent = s?.userName || '--';
  $('#studentId').textContent = s?.studentId || '--';
  $('#schoolId').textContent = s?.schoolId || '--';
  $('#unitId').textContent = s?.unitId || '--';

  const pre = $('#session');
  if (pre) pre.textContent = JSON.stringify(s, null, 2);
})();

$('#backBtn')?.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = '../home/index.html';
});

$('#logout')?.addEventListener('click', async () => {
  await window.electronAPI.apiLogout();
  location.href = '../login/index.html';
});

document.querySelectorAll('.tabbar .tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const go = btn.dataset.go;
    if (go === 'home') location.href = '../home/index.html';
    if (go === 'homework') location.href = '../homework/index.html?from=me';
    if (go === 'me') location.href = './index.html';
  });
});
$('#settingEntry')?.addEventListener('click', () => {
  location.href = '../settings/index.html?from=me';
});
