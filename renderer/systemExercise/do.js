window.Theme?.initTheme();
const state = JSON.parse(sessionStorage.getItem('msykSystemExercise') || 'null');
if (!state?.questions?.length) {
  location.replace('./index.html');
} else {

const progress = document.getElementById('progress');
const timer = document.getElementById('timer');
let current = 0;
let loadedIndex = -1;
let submitting = false;
let operationQueue = Promise.resolve();
let questionSurfaceReady = false;

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
const FILL_CORRECT_SCRIPT = `(() => {
  const parseAnswer = (value) => {
    if (Array.isArray(value)) return value.flatMap((item) => parseAnswer(item));
    if (value === null || value === undefined) return [];
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return [];
      try {
        const parsed = JSON.parse(text);
        if (parsed !== text) return parseAnswer(parsed);
      } catch {}
      return [text];
    }
    return [String(value)];
  };
  const answerTokens = (value, multiple, judgement) => {
    let tokens = parseAnswer(value).map((item) => String(item).trim()).filter(Boolean);
    if (multiple) {
      tokens = tokens.flatMap((item) => /^[A-J]+$/i.test(item)
        ? item.toUpperCase().split('')
        : item.split(',').map((part) => part.trim()).filter(Boolean));
    } else {
      tokens = tokens.slice(0, 1);
    }
    if (judgement) {
      tokens = tokens.map((item) => item === '√' ? '对' : (item === '×' ? '错' : item));
    }
    return new Set(tokens);
  };
  const selectCorrect = (options, answer, multiple, judgement) => {
    const expected = answerTokens(answer, multiple, judgement);
    if (!options.length || !expected.size) return false;
    options.forEach((option) => {
      const value = String(option.getAttribute('answer-v') || '').trim();
      const shouldSelect = expected.has(value);
      const selected = option.classList.contains('optionLi-blue');
      if (shouldSelect !== selected) option.click();
    });
    return options.some((option) => option.classList.contains('optionLi-blue'));
  };
  const questionsFromScripts = () => {
    const source = [...document.scripts].map((script) => script.textContent || '')
      .find((text) => text.includes('var questions'));
    if (!source) return [];
    const marker = source.indexOf('var questions');
    const start = source.indexOf('[', marker);
    if (start < 0) return [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < source.length; index++) {
      const char = source[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === '[') depth++;
      else if (char === ']' && --depth === 0) {
        try { return JSON.parse(source.slice(start, index + 1)); } catch { return []; }
      }
    }
    return [];
  };
  const allQuestions = Array.isArray(window.questions) ? window.questions : questionsFromScripts();
  const parent = allQuestions.find((item) => !item.parent) || allQuestions[0];
  if (!parent) return JSON.stringify({ supported: false, filled: 0 });
  const type = Number(parent.type ?? parent.questionType);
  let filled = 0;
  if ([1, 2, 5].includes(type)) {
    const options = [...document.querySelectorAll('.title-new-list > li')];
    if (selectCorrect(options, parent.answer, type === 2, type === 5)) filled = 1;
  } else if ([7, 8, 9, 10, 11].includes(type)) {
    let children = Array.isArray(parent.children) ? parent.children : parseAnswer(parent.children);
    children = children.map((child) => typeof child === 'object'
      ? child
      : allQuestions.find((item) => String(item.id) === String(child))).filter(Boolean);
    children.forEach((child) => {
      const childId = String(child.id || '');
      const options = [...document.querySelectorAll('.title-new-list > li')]
        .filter((option) => option.classList.contains(childId));
      if (selectCorrect(options, child.answer, type === 10, type === 11)) filled++;
    });
  } else {
    return JSON.stringify({ supported: false, filled: 0, type });
  }
  return JSON.stringify({ supported: filled > 0, filled, type });
})()`;

function elapsedSeconds() { return Math.max(0, Math.floor((Date.now() - Number(state.startedAt || Date.now())) / 1000)); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
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
  if (!studentId || !questionId || !surface) throw new Error('缺少答案保存所需信息');
  if (typeof surface.postSystemExerciseAnswer === 'function') {
    const result = await surface.postSystemExerciseAnswer(studentId, questionId);
    if (!result?.saved) throw new Error(result?.message || '答案保存未得到服务器确认');
  } else if (typeof surface.executeJavaScript === 'function') {
    const token = `answer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await surface.executeJavaScript(`(() => {
      const token = ${JSON.stringify(token)};
      const callback = window.jsCallback && typeof window.jsCallback === 'object'
        ? window.jsCallback
        : {};
      const previousBack = !callback.__msykAnswerBridge && typeof callback.back === 'function'
        ? callback.back.bind(callback)
        : null;
      callback.__msykAnswerBridge = true;
      callback.back = (status) => {
        window.__msykAnswerSaveResult = { token, status: String(status ?? ''), saved: true };
        if (previousBack) {
          try { previousBack(status); } catch {}
        }
      };
      if (typeof callback.getQuestionType !== 'function') callback.getQuestionType = () => {};
      window.jsCallback = callback;
      window.__msykAnswerSaveResult = null;
      if (!window.SingleQuestion || typeof window.SingleQuestion.postAnswer !== 'function') {
        throw new Error('题目页未提供答案保存方法');
      }
      window.SingleQuestion.postAnswer(${JSON.stringify(studentId)}, ${JSON.stringify(questionId)});
      return true;
    })()`, true);

    const deadline = Date.now() + 15000;
    let result = null;
    while (Date.now() < deadline) {
      result = await surface.executeJavaScript(
        `window.__msykAnswerSaveResult && window.__msykAnswerSaveResult.token === ${JSON.stringify(token)}
          ? window.__msykAnswerSaveResult
          : null`,
        true,
      );
      if (result?.saved) break;
      await sleep(150);
    }
    if (!result?.saved) throw new Error('答案保存超时，请检查网络后重试');
  } else {
    throw new Error('当前题目视图不支持保存答案');
  }
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
    const attributes = {
      autosize: 'on',
      minwidth: String(width),
      maxwidth: String(width),
      minheight: String(height),
      maxheight: String(height),
    };
    Object.entries(attributes).forEach(([name, value]) => {
      if (surface.getAttribute(name) !== value) surface.setAttribute(name, value);
    });
    const guestFrame = surface.shadowRoot?.querySelector('iframe');
    if (guestFrame) {
      guestFrame.style.setProperty('width', '100%', 'important');
      guestFrame.style.setProperty('height', '100%', 'important');
    }
  }
}

function waitForQuestionSurfaceReady(surface) {
  if (surface?.tagName !== 'WEBVIEW' || questionSurfaceReady) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const onReady = () => {
      clearTimeout(timeout);
      questionSurfaceReady = true;
      resolve();
    };
    const timeout = setTimeout(() => {
      surface.removeEventListener('dom-ready', onReady);
      reject(new Error('题目视图初始化超时'));
    }, 10000);
    surface.addEventListener('dom-ready', onReady, { once: true });
  });
}

async function loadQuestionSurface(url) {
  const surface = document.getElementById('questionView');
  if (!surface || !url) return Promise.reject(new Error('题目地址无效'));

  if (typeof surface.loadURL === 'function') {
    await waitForQuestionSurfaceReady(surface);
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => finish(new Error('题目加载超时')), 30000);
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        surface.removeEventListener('did-finish-load', onFinish);
        surface.removeEventListener('did-fail-load', onFail);
        if (error) reject(error);
        else resolve();
      };
      const onFinish = () => finish();
      const onFail = (event) => {
        if (Number(event.errorCode) === -3) return;
        finish(new Error(event.errorDescription || '题目加载失败'));
      };
      surface.addEventListener('did-finish-load', onFinish);
      surface.addEventListener('did-fail-load', onFail);
      Promise.resolve(surface.loadURL(url)).catch((error) => {
        if (error?.code !== 'ERR_ABORTED' && Number(error?.errno) !== -3) finish(error);
      });
    });
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => finish(new Error('题目加载超时')), 30000);
    const onReady = (event) => {
      if (event.detail?.url && event.detail.url !== url) return;
      finish();
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      window.removeEventListener('msyk-inline-viewer-ready', onReady);
      if (error) reject(error);
      else resolve();
    };
    window.addEventListener('msyk-inline-viewer-ready', onReady);
    surface.src = url;
  });
}

async function showQuestionNow(index, saveCurrent = true) {
  if (saveCurrent && loadedIndex >= 0 && index !== current) await persistCurrentAnswer();
  const response = await window.msykAPI.systemExerciseQuestionUrl({
    questionId: state.questions[index], subjectCode: state.subjectCode, difficulty: state.difficulty,
  });
  if (response?.code !== 200) throw new Error(response?.msg || '题目加载失败');
  await loadQuestionSurface(response.data?.url || response.data?.data?.url || '');
  current = index;
  loadedIndex = index;
  progress.textContent = `第 ${index + 1} / ${state.questions.length} 题`;
  document.querySelectorAll('#answerBar button').forEach((button, i) => button.classList.toggle('active', i === index));
}

function enqueueOperation(task) {
  const next = operationQueue.then(task, task);
  operationQueue = next.catch(() => {});
  return next;
}

function showQuestion(index, saveCurrent = true) {
  return enqueueOperation(() => showQuestionNow(index, saveCurrent));
}

async function fillCurrentCorrect(studentId) {
  const surface = document.getElementById('questionView');
  const questionId = String(state.questions[current] || '');
  if (!surface || !questionId) return { supported: false, filled: 0 };

  if (typeof surface.fillSystemExerciseCorrect === 'function') {
    const result = await surface.fillSystemExerciseCorrect(studentId, questionId, FILL_CORRECT_SCRIPT);
    if (result?.supported) await sleep(1200);
    return result;
  }
  if (typeof surface.executeJavaScript !== 'function') {
    return { supported: false, filled: 0 };
  }

  const raw = await surface.executeJavaScript(FILL_CORRECT_SCRIPT, true);
  let result = raw;
  try { result = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch {}
  if (result?.supported) await persistCurrentAnswer();
  return result || { supported: false, filled: 0 };
}

async function fillAllCorrect() {
  const button = document.getElementById('debugFillCorrectBtn');
  if (button.disabled || submitting) return;
  if (typeof window.msykAPI?.debugGet !== 'function' || !(await window.msykAPI.debugGet())) {
    button.hidden = true;
    throw new Error('仅调试模式可使用一键正确');
  }
  const originalIndex = current;
  const navButtons = [...document.querySelectorAll('#answerBar button')];
  button.disabled = true;
  document.getElementById('submitBtn').disabled = true;
  navButtons.forEach((item) => { item.disabled = true; });

  try {
    const session = await window.msykAPI.apiGetSession();
    const studentId = String(state.studentId || session?.data?.studentId || '');
    if (!studentId) throw new Error('缺少学生信息');
    if (loadedIndex >= 0) await persistCurrentAnswer();

    let filled = 0;
    let skipped = 0;
    for (let index = 0; index < state.questions.length; index++) {
      button.textContent = `${index + 1}/${state.questions.length}`;
      await showQuestionNow(index, false);
      const result = await fillCurrentCorrect(studentId);
      if (result?.supported) filled++;
      else skipped++;
    }
    await showQuestionNow(originalIndex, false);
    alert(`已填入并保存 ${filled} 道客观题${skipped ? `，跳过 ${skipped} 道不支持的题目` : ''}，尚未提交`);
  } finally {
    button.textContent = '一键正确';
    button.disabled = false;
    document.getElementById('submitBtn').disabled = false;
    navButtons.forEach((item) => { item.disabled = false; });
  }
}

async function initDebugControls() {
  const button = document.getElementById('debugFillCorrectBtn');
  let enabled = false;
  try {
    enabled = typeof window.msykAPI?.debugGet === 'function'
      ? await window.msykAPI.debugGet()
      : localStorage.getItem('msyk_debug_mode') === '1';
  } catch {}
  button.hidden = !enabled;
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

async function verifySubmittedExercise(exerciseId) {
  const creationTime = new Date().toISOString().slice(0, 7);
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const response = await window.msykAPI.systemExerciseDetail({ id: exerciseId });
      if (response?.code === 200) {
        let detail = response.data;
        if (detail?.data && typeof detail.data === 'object') detail = detail.data;
        const code = String(detail?.code ?? '');
        const hasStatistics = detail && ['grade', 'correctQuestionNum', 'wrongQuestionNum', 'doTime']
          .some((key) => detail[key] !== undefined && detail[key] !== null);
        if ((!code || code === '10000' || code === '200') && hasStatistics) {
          return detail;
        }
      }
    } catch {}

    try {
      const historyResponse = await window.msykAPI.systemExerciseHistoryStats({
        subjectCode: state.subjectCode,
        gradeCode: state.gradeCode,
        pageNum: 1,
        creationTime,
      });
      let history = historyResponse?.data;
      if (history?.data && typeof history.data === 'object') history = history.data;
      const item = Array.isArray(history?.message)
        ? history.message.find((entry) => String(entry.id ?? entry.brushExerciseId ?? '') === String(exerciseId))
        : null;
      if (item) return item;
    } catch {}

    await sleep(1000);
  }
  return null;
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
    let data;
    if (state.submittedExerciseId) {
      data = { id: String(state.submittedExerciseId) };
    } else {
      await persistCurrentAnswer();
      const response = await window.msykAPI.systemExerciseSubmit({
        questionIds: `${state.questions.join(',')},`, subjectCode: state.subjectCode,
        gradeCode: state.gradeCode, bookId: state.bookId, doTime: elapsedSeconds(),
        teacherExamId: state.teacherExamId,
      });
      data = submissionResult(response);
      state.submittedExerciseId = data.id;
      sessionStorage.setItem('msykSystemExercise', JSON.stringify(state));
    }
    const detail = await verifySubmittedExercise(data.id);
    if (!detail) throw new Error(`服务器尚未确认记录 ${data.id}，本次答案已保留，请稍后重试`);
    sessionStorage.removeItem('msykSystemExercise');
    const grade = detail.grade ?? data.grade;
    alert(`提交成功${grade != null ? `，得分 ${grade}` : ''}，记录编号 ${data.id}`);
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
document.getElementById('debugFillCorrectBtn').addEventListener('click', () => {
  enqueueOperation(fillAllCorrect).catch((error) => alert(`一键正确失败: ${error.message}`));
});
document.getElementById('closeBtn').addEventListener('click', () => {
  if (confirm('退出后本次练习不会提交，确定退出？')) location.replace('./index.html');
});
setInterval(renderTimer, 1000); renderTimer();
document.getElementById('questionView').addEventListener('dom-ready', () => {
  questionSurfaceReady = true;
  applyQuestionTheme();
});
document.getElementById('questionView').addEventListener('did-finish-load', applyQuestionTheme);
document.getElementById('questionView').addEventListener('did-navigate', applyQuestionTheme);
if (typeof ResizeObserver === 'function') {
  new ResizeObserver(syncQuestionSurfaceSize).observe(document.querySelector('main'));
}
window.addEventListener('resize', syncQuestionSurfaceSize);
requestAnimationFrame(syncQuestionSurfaceSize);
initDebugControls();
showQuestion(0, false).catch((error) => alert(error.message));
}
