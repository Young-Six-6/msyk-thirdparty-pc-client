window.Theme?.initTheme();

const $ = (s) => document.querySelector(s);

(async () => {
  const s = await window.electronAPI.apiGetSession();

  $('#hello').textContent = s?.realName ? `你好，${s.realName}` : '你好';
  $('#sub').textContent = s?.schoolId ? `学校：${s.schoolId}  |  班级：${s.unitId}` : '';
  if (s?.avatarUrl) $('#avatar').src = s.avatarUrl;
  else $('#avatar').src = 'https://msyk.wpstatic.cn/squirrel/img_student_profile_male.png';

  // 调试信息保留
  const pre = $('#session');
  if (pre) pre.textContent = JSON.stringify(s, null, 2);

  const statsResp = await window.electronAPI.homeStats();
  if (statsResp?.code === 200) {
    const d = statsResp.data?.data || statsResp.data; // 兼容包一层/不包
    $('#finishNum').textContent = String(d?.finishHomeworkNum ?? '--');
    $('#usedDays').textContent = String(d?.usedDayNum ?? '--');
  } else {
    // 不强制提示，失败就留空
    $('#finishNum').textContent = '--';
    $('#usedDays').textContent = '--';
  }

})();

$('#logout').addEventListener('click', async () => {
  await window.electronAPI.apiLogout();
  location.replace('../login/index.html');
});

// 进入作业
$('#homeworkBtn').addEventListener('click', () => {
  location.replace('../homework/index.html?from=home');
});
// 进入我的
$('#meBtn')?.addEventListener('click', () => {
  location.replace('../me/index.html?from=home');
});

// Tabbar
document.querySelectorAll('.tabbar .tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const go = btn.dataset.go;
    if (go === 'home') location.replace('./index.html');
    if (go === 'homework') location.replace('../homework/index.html?from=home');
    if (go === 'me') location.replace('../me/index.html?from=home');
  });
});
