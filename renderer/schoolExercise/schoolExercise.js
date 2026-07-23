window.Theme?.initTheme();
const $ = (selector) => document.querySelector(selector);
const state = { session: {}, subjects: [], books: [], subjectCode: '', bookId: '', bookName: '', path: [], selected: null };

function dataOf(response) {
  if (!response || response.code !== 200) throw new Error(response?.msg || '请求失败');
  let data = response.data || {};
  const code = String(data.code ?? '');
  if (code && code !== '10000' && code !== '200') throw new Error(data.message || data.msg || `服务端返回 ${code}`);
  if (data.data && typeof data.data === 'object') data = data.data;
  return data;
}
function status(text, error = false) { $('#statusText').textContent = text; $('#statusText').style.color = error ? 'var(--danger)' : ''; }
function message(text) { const item = document.createElement('div'); item.className = 'empty'; item.textContent = text; $('#nodeList').replaceChildren(item); }
function options(select, items, selected) { select.replaceChildren(...items.map((item) => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; option.selected = item.id === selected; return option; })); }

async function checkAccess() {
  if (!state.session.gradeCode) {
    const history = dataOf(await window.msykAPI.systemExerciseHistory({ gradeCode: '' }));
    state.session.gradeCode = String(history.sqDoExerciseHistory?.gradeCode || history.gradeList?.[0]?.gradeCode || '');
  }
  const subjectResponse = dataOf(await window.msykAPI.hwSubjects());
  const list = subjectResponse.studentSubjectList || subjectResponse.subjectList || [];
  state.subjects = list.map((item) => ({ id: String(item.code || item.subjectCode || ''), name: String(item.name || item.subjectName || item.code || '') })).filter((item) => item.id);
  const access = dataOf(await window.msykAPI.schoolExerciseAccess({ subjectCodeList: JSON.stringify(state.subjects.map((item) => item.id)), gradeCode: state.session.gradeCode }));
  const debug = typeof window.msykAPI.debugGet === 'function' && !!(await window.msykAPI.debugGet());
  if (!(Number(access.isSchoolDoExercise) === 1 || access.isSchoolDoExercise === true || debug)) throw new Error('学校暂未开通校本练习');
  status(Number(access.isSchoolDoExercise) === 1 ? '请选择校本教材和章节' : '调试模式已绕过开通限制');
}

async function loadBooks() {
  const data = dataOf(await window.msykAPI.schoolExerciseBooks({ subjectCode: state.subjectCode }));
  const list = data.schoolBookList || data.bookList || data.resultList || [];
  state.books = list.map((item) => ({ id: String(item.dirId || item.id || ''), name: String(item.bookName || item.title || item.name || '') })).filter((item) => item.id);
  state.bookId = state.books[0]?.id || ''; state.bookName = state.books[0]?.name || '';
  options($('#bookSelect'), state.books, state.bookId);
  await resetTree();
}

function choose(node, button) {
  state.selected = node;
  document.querySelectorAll('.node').forEach((item) => item.classList.remove('selected'));
  button.classList.add('selected');
  $('#selectionSummary').textContent = node.name;
  $('#startBtn').disabled = false;
}

function renderNodes(nodes) {
  const list = $('#nodeList'); list.replaceChildren();
  if (!nodes.length) return message('当前教材暂无章节');
  nodes.forEach((raw) => {
    const node = { id: String(raw.tagId || ''), name: String(raw.tagName || '未命名章节'), nodeCode: String(raw.nodeCode || ''), level: Number(raw.codeLevel || 0), hasChild: Number(raw.isHaveChildren || 0) !== 0, total: Number(raw.exerciseNum || 0), done: Number(raw.doExerciseNum || 0), correct: Number(raw.correct || 0) };
    const button = document.createElement('button'); button.type = 'button'; button.className = 'node';
    const name = document.createElement('span'); name.className = 'name'; name.textContent = node.name;
    const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = node.hasChild ? '下一级 ›' : `${node.done}/${node.total} · ${node.correct}%`;
    button.append(name, hint);
    button.addEventListener('click', () => { if (node.hasChild) { state.path.push(node); $('#treeTitle').textContent = node.name; loadChapters(node); } else choose(node, button); });
    list.appendChild(button);
  });
}

async function loadChapters(parent = null) {
  message('正在加载...');
  try {
    const data = dataOf(await window.msykAPI.schoolExerciseChapters({ codeLevel: parent?.level || 0, dirId: state.bookId, nodeCode: parent?.nodeCode || '', subjectCode: state.subjectCode }));
    const nodes = parent ? (data.childrenTagList || data.tagNodeDtoList || []) : (data.tagNodeDtoList || data.childrenTagList || []);
    renderNodes(nodes); $('#upBtn').disabled = state.path.length === 0;
  } catch (error) { message(error.message); status(error.message, true); }
}
async function resetTree() { state.path = []; state.selected = null; $('#startBtn').disabled = true; $('#selectionSummary').textContent = '请选择一个章节'; $('#treeTitle').textContent = '选择章节'; await loadChapters(); }

async function start() {
  $('#startBtn').disabled = true;
  try {
    const data = dataOf(await window.msykAPI.schoolExerciseQuestions({ dirId: state.bookId, tagId: state.selected.id, subjectCode: state.subjectCode }));
    const groups = data.doExerciseCardDtos || [];
    const questions = groups.flatMap((group) => (group.questionIdList || []).map((item) => ({ questionId: String(item.questionId || ''), orderNum: Number(item.orderNum || 0), tagId: String(group.tagId || state.selected.id), tagName: String(group.tagName || state.selected.name) }))).filter((item) => item.questionId);
    if (!questions.length) throw new Error('所选章节暂无可练习题目');
    sessionStorage.setItem('msykSchoolExercise', JSON.stringify({ questions, subjectCode: state.subjectCode, gradeCode: state.session.gradeCode || '', dirId: state.bookId, bookName: state.bookName, startedAt: Date.now() }));
    location.href = './do.html';
  } catch (error) { status(error.message, true); $('#startBtn').disabled = false; }
}

$('#backBtn').addEventListener('click', () => history.length > 1 ? history.back() : location.replace('../main/index.html?page=home'));
$('#subjectSelect').addEventListener('change', async (event) => { state.subjectCode = event.target.value; await loadBooks(); });
$('#bookSelect').addEventListener('change', async (event) => { state.bookId = event.target.value; state.bookName = state.books.find((item) => item.id === state.bookId)?.name || ''; await resetTree(); });
$('#upBtn').addEventListener('click', () => { state.path.pop(); const parent = state.path.at(-1) || null; $('#treeTitle').textContent = parent?.name || '选择章节'; loadChapters(parent); });
$('#startBtn').addEventListener('click', start);
(async () => { try { const session = await window.msykAPI.apiGetSession(); state.session = session?.data || {}; await checkAccess(); state.subjectCode = state.subjects[0]?.id || ''; options($('#subjectSelect'), state.subjects, state.subjectCode); if (!state.subjectCode) throw new Error('没有可用科目'); await loadBooks(); } catch (error) { status(error.message, true); message(error.message); } })();
