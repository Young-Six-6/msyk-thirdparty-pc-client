window.Theme?.initTheme();

const $ = (s) => document.querySelector(s);

(async () => {
  const sessionResponse = await window.msykAPI.apiGetSession();
  const s = sessionResponse?.data || sessionResponse || {};

  $('#hello').textContent = s?.realName ? `你好，${s.realName}` : '你好';
  const schoolName = String(s?.schoolName || '').trim();
  const className = String(s?.className || s?.groupName || '').trim();
  const identityParts = [];
  if (schoolName) identityParts.push(`学校：${schoolName}`);
  if (className) identityParts.push(`班级：${className}`);
  $('#sub').textContent = identityParts.join('  |  ');
  if (s?.avatarUrl) $('#avatar').src = s.avatarUrl;
  else $('#avatar').src = 'https://msyk.wpstatic.cn/squirrel/img_student_profile_male.png';

  try {
    const debugEnabled = typeof window.msykAPI?.debugGet === 'function'
      && !!(await window.msykAPI.debugGet());
    if (debugEnabled) {
      const debugInfo = $('#debugInfo');
      const pre = $('#session');
      if (pre) pre.textContent = JSON.stringify(s, null, 2);
      if (debugInfo) debugInfo.hidden = false;
    }
  } catch (error) {
    console.warn('[home] 读取调试模式失败:', error);
  }

  const statsResp = await window.msykAPI.homeStats();
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
  await window.msykAPI.apiLogout();
  window.PrimaryPageTransition.open('../login/index.html');
});

// 进入作业
$('#homeworkBtn').addEventListener('click', () => {
  window.PrimaryPageTransition.navigate('homework');
});
// 进入我的
$('#meBtn')?.addEventListener('click', () => {
  window.PrimaryPageTransition.navigate('me');
});
