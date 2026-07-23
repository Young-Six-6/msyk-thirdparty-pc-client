window.Theme?.initTheme();

const $ = (s) => document.querySelector(s);
let studyCircleAllowed = false;

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

  const studyCircleButton = $('#studyCircleBtn');
  const studyCircleState = $('#studyCircleState');
  try {
    const access = await window.StudyCircleAccess.resolve(window.msykAPI);
    studyCircleAllowed = ['questions', 'projects', 'cases'].some((feature) => access.allows(feature));
    studyCircleButton.disabled = !studyCircleAllowed;
    studyCircleButton.classList.toggle('unavailable', !studyCircleAllowed);
    if (studyCircleAllowed) {
      const enabledNames = [
        access.allows('questions') && '<span>答疑置辩</span>',
        access.allows('projects') && '<span class="struck-label">项目化学习</span>',
        access.allows('cases') && '<span class="struck-label">典型案例</span>',
      ].filter(Boolean);
      const bypassing = ['questions', 'projects', 'cases'].some((feature) => access.bypasses(feature));
      if (bypassing) {
        studyCircleState.textContent = '调试模式进入（学校未开通）';
      } else {
        studyCircleState.innerHTML = enabledNames.join(' / ');
      }
      studyCircleButton.title = bypassing ? '调试模式已绕过部分开通限制' : '';
    } else {
      studyCircleState.textContent = '学校暂未开通';
      studyCircleButton.title = '该功能尚未由学校开通';
    }
  } catch (error) {
    studyCircleAllowed = false;
    studyCircleButton.disabled = true;
    studyCircleButton.classList.add('unavailable');
    studyCircleState.textContent = '开通状态暂不可用';
    studyCircleButton.title = error?.message || '无法确认学习圈开通状态';
  }

  const schoolButton = $('#schoolExerciseBtn');
  const schoolState = $('#schoolExerciseState');
  try {
    const subjectsResponse = await window.msykAPI.hwSubjects();
    const subjectData = subjectsResponse?.data?.data || subjectsResponse?.data || {};
    const subjects = subjectData.studentSubjectList || subjectData.subjectList || [];
    const codes = subjects.map((item) => String(item.code || item.subjectCode || '')).filter(Boolean);
    const accessResponse = await window.msykAPI.schoolExerciseAccess({ subjectCodeList: JSON.stringify(codes) });
    const accessData = accessResponse?.data?.data || accessResponse?.data || {};
    const debugEnabled = typeof window.msykAPI.debugGet === 'function' && !!(await window.msykAPI.debugGet());
    const opened = Number(accessData.isSchoolDoExercise) === 1 || accessData.isSchoolDoExercise === true;
    schoolButton.disabled = !opened && !debugEnabled;
    schoolButton.classList.toggle('unavailable', schoolButton.disabled);
    schoolState.textContent = opened ? '学校题库自主练习' : debugEnabled ? '调试模式进入（学校未开通）' : '学校暂未开通';
  } catch (error) {
    const debugEnabled = typeof window.msykAPI.debugGet === 'function' && !!(await window.msykAPI.debugGet().catch(() => false));
    schoolButton.disabled = !debugEnabled;
    schoolState.textContent = debugEnabled ? '调试模式进入（状态未知）' : '开通状态暂不可用';
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
$('#studyCircleBtn')?.addEventListener('click', () => {
  if (studyCircleAllowed) window.PrimaryPageTransition.open('../studyCircle/index.html');
});
$('#systemExerciseBtn')?.addEventListener('click', () => {
  window.PrimaryPageTransition.open('../systemExercise/index.html');
});
$('#schoolExerciseBtn')?.addEventListener('click', () => {
  if (!$('#schoolExerciseBtn').disabled) window.PrimaryPageTransition.open('../schoolExercise/index.html');
});
// 进入我的
$('#meBtn')?.addEventListener('click', () => {
  window.PrimaryPageTransition.navigate('me');
});
