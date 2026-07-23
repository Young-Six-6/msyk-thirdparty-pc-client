window.Theme?.initTheme();
const state = JSON.parse(sessionStorage.getItem('msykSystemExercise') || 'null');
if (!state?.questions?.length) location.replace('./index.html');

const progress = document.getElementById('progress');
const timer = document.getElementById('timer');
let current = 0;
let submitting = false;

const QUESTION_LAYOUT_CSS = `
  html,body{width:100%!important;min-height:100%!important;margin:0!important;padding:0!important}
  body{min-height:100vh!important;box-sizing:border-box!important;overflow-y:auto!important}
  .dtk-container,.title-container{width:100%!important;max-width:none!important;box-sizing:border-box!important}
  body>.title-container,.dtk-container{min-height:calc(100vh - 2px)!important}
  body>.title-container{display:flex!important;flex-direction:column!important;height:100vh!important}
  body>.title-container .title-new-list{
    flex:1 1 0!important;
    min-height:0!important;
    display:flex!important;
    flex-direction:column!important;
    justify-content:space-evenly!important;
  }
  @media(min-width:801px){
    body>.title-container{overflow-y:auto!important}
    body>.title-container .title-new-list{padding-block:16px!important}
  }
  @media(max-width:800px){
    body>.title-container{
      min-height:100vh!important;
      height:auto!important;
      padding:16px!important;
      overflow-y:auto!important;
    }
    .title-container .title-top-new{font-size:13px!important;line-height:1.5!important;margin-bottom:10px!important}
    .title-container .title-new-content{font-size:16px!important;line-height:1.65!important}
    .title-new-content img,.right-detail img{max-width:100%!important;height:auto!important}
    body>.title-container .title-new-list{
      flex:1 0 auto!important;
      gap:12px!important;
      margin:14px 0!important;
      justify-content:center!important;
    }
    .title-new-list>li{
      flex:0 0 auto!important;
      min-height:54px!important;
      margin:0!important;
      border-radius:8px!important;
    }
    .title-new-list>li .left-selection{flex:0 0 44px!important;width:44px!important;font-size:16px!important}
    .title-new-list>li .right-detail{
      display:flex!important;
      align-items:center!important;
      min-width:0!important;
      margin:12px 12px 12px 0!important;
      padding-left:12px!important;
      font-size:16px!important;
      line-height:1.5!important;
    }
    .wxtk-container,.wxtk-container-height{
      display:block!important;
      width:100%!important;
      min-height:100vh!important;
      height:auto!important;
      overflow:visible!important;
    }
    .wxtk-container .title-container,.wxtk-container .right-fixed{
      display:block!important;
      width:100%!important;
      max-width:none!important;
      min-height:0!important;
      height:auto!important;
      padding:16px!important;
      border-left:0!important;
      overflow:visible!important;
    }
  }
`;
const QUESTION_DARK_CSS = `
  html,body{background:#0f1226!important;color:#eaf2ff!important;color-scheme:dark!important}
  *{color:inherit!important;background-color:transparent!important;background-image:none!important;border-color:rgba(255,255,255,.15)!important}
  .dtk-container,.title-container{background:#161929!important;color:#eaf2ff!important}
  .col-333{color:#eaf2ff!important}.col-999{color:#8899bb!important}
  .right-score,.left-scroe{background:rgba(255,255,255,.08)!important;color:#7ecbff!important}
  .right-answer-my span,.span-class{background:#1e2a45!important;color:#eaf2ff!important}
  .right-answer-my span.active,.span-class.active{background:#2a5298!important;color:#fff!important}
  input,textarea,select{background:#1e2a45!important;color:#eaf2ff!important}
  a{color:#9cc8ff!important}
`;

function elapsedSeconds() { return Math.max(0, Math.floor((Date.now() - Number(state.startedAt || Date.now())) / 1000)); }
function renderTimer() {
  const total = elapsedSeconds();
  const hours = String(Math.floor(total / 3600)).padStart(2, '0');
  const minutes = String(Math.floor(total % 3600 / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  timer.textContent = `${hours}:${minutes}:${seconds}`;
}

async function persistCurrentAnswer() {
  const surface = document.getElementById('questionView');
  const studentId = String(state.studentId || (await window.msykAPI.apiGetSession())?.data?.studentId || '');
  const questionId = String(state.questions[current] || '');
  if (!studentId || !questionId || !surface) return;
  if (typeof surface.postSystemExerciseAnswer === 'function') {
    surface.postSystemExerciseAnswer(studentId, questionId);
  } else if (typeof surface.executeJavaScript === 'function') {
    await surface.executeJavaScript(
      `SingleQuestion.postAnswer(${JSON.stringify(studentId)},${JSON.stringify(questionId)})`,
      true,
    ).catch(() => {});
  }
  await new Promise((resolve) => setTimeout(resolve, 1200));
}

async function applyQuestionTheme() {
  const surface = document.getElementById('questionView');
  if (!surface) return;
  const css = QUESTION_LAYOUT_CSS + (window.Theme?.getTheme?.() === 'dark' ? QUESTION_DARK_CSS : '');
  const operations = [];
  if (typeof surface.insertCSS === 'function') {
    operations.push(surface.insertCSS(css));
  }
  if (typeof surface.executeJavaScript === 'function') {
    const script = `(() => {
      let style = document.getElementById('__msyk_question_layout');
      if (!style) {
        style = document.createElement('style');
        style.id = '__msyk_question_layout';
        (document.head || document.documentElement).appendChild(style);
      }
      style.textContent = ${JSON.stringify(css)};
      return true;
    })()`;
    operations.push(surface.executeJavaScript(script, true));
  }
  await Promise.allSettled(operations);
}

function syncQuestionSurfaceSize() {
  const surface = document.getElementById('questionView');
  const host = surface?.parentElement;
  if (!surface || !host) return;
  const rect = host.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  surface.style.setProperty('width', `${width}px`, 'important');
  surface.style.setProperty('height', `${height}px`, 'important');
  if (surface.tagName === 'WEBVIEW') {
    surface.setAttribute('autosize', 'on');
    surface.setAttribute('minwidth', String(width));
    surface.setAttribute('maxwidth', String(width));
    surface.setAttribute('minheight', String(height));
    surface.setAttribute('maxheight', String(height));
    const guestFrame = surface.shadowRoot?.querySelector('iframe');
    if (guestFrame) {
      guestFrame.style.setProperty('width', '100%', 'important');
      guestFrame.style.setProperty('height', '100%', 'important');
    }
  }
}

async function showQuestion(index, saveCurrent = true) {
  if (saveCurrent && index !== current) await persistCurrentAnswer();
  current = index;
  progress.textContent = `第 ${index + 1} / ${state.questions.length} 题`;
  document.querySelectorAll('#answerBar button').forEach((button, i) => button.classList.toggle('active', i === index));
  const response = await window.msykAPI.systemExerciseQuestionUrl({
    questionId: state.questions[index], subjectCode: state.subjectCode, difficulty: state.difficulty,
  });
  if (response?.code !== 200) throw new Error(response?.msg || '题目加载失败');
  document.getElementById('questionView').src = response.data?.url || response.data?.data?.url || '';
}

function submissionResult(response) {
  if (!response || response.code !== 200) throw new Error(response?.msg || '提交失败');
  let result = response.data;
  for (let i = 0; i < 2 && result?.data && typeof result.data === 'object'; i++) {
    const code = String(result.code ?? '');
    if (code && code !== '10000' && code !== '200') {
      throw new Error(result.message || result.msg || `提交失败 (${code})`);
    }
    result = result.data;
  }
  const code = String(result?.code ?? response.data?.code ?? '');
  if (code && code !== '10000' && code !== '200') {
    throw new Error(result?.message || result?.msg || response.data?.message || `提交失败 (${code})`);
  }
  const exerciseId = String(result?.id ?? response.data?.id ?? '').trim();
  const uuid = String(result?.uuid ?? response.data?.uuid ?? '').trim();
  const answerStatus = result?.answerStatus ?? response.data?.answerStatus;
  if (!exerciseId || exerciseId === '0' || !uuid || !Array.isArray(answerStatus)) {
    throw new Error('服务器未确认生成练习记录，请稍后重试');
  }
  return { ...result, id: exerciseId, uuid, answerStatus };
}

state.questions.forEach((question, index) => {
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = String(index + 1); button.title = `第 ${index + 1} 题`;
  button.addEventListener('click', () => showQuestion(index).catch((error) => alert(error.message)));
  document.getElementById('answerBar').appendChild(button);
});

async function submit() {
  if (submitting || !confirm('确认提交本次系统练习？')) return;
  submitting = true;
  document.getElementById('submitBtn').disabled = true;
  try {
    await persistCurrentAnswer();
    const response = await window.msykAPI.systemExerciseSubmit({
      questionIds: `${state.questions.join(',')},`, subjectCode: state.subjectCode,
      gradeCode: state.gradeCode, bookId: state.bookId, doTime: elapsedSeconds(),
      teacherExamId: state.teacherExamId,
    });
    const data = submissionResult(response);
    sessionStorage.removeItem('msykSystemExercise');
    alert(`提交成功${data.grade != null ? `，得分 ${data.grade}` : ''}，记录编号 ${data.id}`);
    sessionStorage.setItem('msykSystemExerciseHistoryFilter', JSON.stringify({
      gradeCode: state.gradeCode,
      subjectCode: state.subjectCode,
      subjectName: state.subjectCode,
    }));
    location.replace('./history.html');
  } catch (error) {
    alert(error.message);
    submitting = false;
    document.getElementById('submitBtn').disabled = false;
  }
}

document.getElementById('submitBtn').addEventListener('click', submit);
document.getElementById('closeBtn').addEventListener('click', () => {
  if (confirm('退出后本次练习不会提交，确定退出？')) location.replace('./index.html');
});
setInterval(renderTimer, 1000); renderTimer();
document.getElementById('questionView').addEventListener('dom-ready', applyQuestionTheme);
document.getElementById('questionView').addEventListener('did-finish-load', applyQuestionTheme);
document.getElementById('questionView').addEventListener('did-navigate', applyQuestionTheme);
if (typeof ResizeObserver === 'function') {
  new ResizeObserver(syncQuestionSurfaceSize).observe(document.querySelector('main'));
}
window.addEventListener('resize', syncQuestionSurfaceSize);
requestAnimationFrame(syncQuestionSurfaceSize);
showQuestion(0, false).catch((error) => alert(error.message));
