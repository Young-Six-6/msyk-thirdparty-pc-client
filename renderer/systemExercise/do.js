window.Theme?.initTheme();
const state = JSON.parse(sessionStorage.getItem('msykSystemExercise') || 'null');
if (!state?.questions?.length) location.replace('./index.html');

const progress = document.getElementById('progress');
const timer = document.getElementById('timer');
let current = 0;
let submitting = false;

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
  await new Promise((resolve) => setTimeout(resolve, 650));
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
    if (response?.code !== 200) throw new Error(response?.msg || '提交失败');
    const data = response.data?.data || response.data || {};
    const businessCode = String(response.data?.code ?? '');
    if (businessCode && businessCode !== '10000' && businessCode !== '200') {
      throw new Error(response.data?.message || response.data?.msg || `提交失败 (${businessCode})`);
    }
    sessionStorage.removeItem('msykSystemExercise');
    alert(`提交成功${data.grade != null ? `，得分 ${data.grade}` : ''}`);
    location.replace('./index.html');
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
showQuestion(0, false).catch((error) => alert(error.message));
