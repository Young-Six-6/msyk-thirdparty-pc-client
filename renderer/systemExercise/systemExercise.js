window.Theme?.initTheme();

const $ = (selector) => document.querySelector(selector);
const state = {
  session: {}, mode: 'chapter', grades: [], subjects: [], editions: [], books: [],
  gradeCode: '', subjectCode: '', bookId: '', bookName: '', path: [], selected: new Map(),
};

function payloadOf(response) {
  if (!response || response.code !== 200) throw new Error(response?.msg || '请求失败');
  let value = response.data;
  for (let i = 0; i < 3 && value && typeof value === 'object'; i++) {
    const code = String(value.code ?? '');
    if (code && code !== '10000' && code !== '200') throw new Error(value.message || value.msg || `服务端返回 ${code}`);
    if (value.data == null) break;
    value = value.data;
  }
  return value || {};
}

function setStatus(message, error = false) {
  $('#statusText').textContent = message;
  $('#statusText').style.color = error ? 'var(--danger)' : '';
}

function showNodeMessage(message) {
  const empty = document.createElement('div');
  empty.className = 'empty';
  empty.textContent = message;
  $('#nodeList').replaceChildren(empty);
}

function fillSelect(select, items, valueKey, labelKey, selected) {
  select.replaceChildren(...items.map((item) => {
    const option = document.createElement('option');
    option.value = String(item[valueKey] ?? '');
    option.textContent = String(item[labelKey] ?? item[valueKey] ?? '');
    option.selected = option.value === String(selected ?? '');
    return option;
  }));
}

function normalizeHistory(data) {
  const gradeList = Array.isArray(data.gradeList) ? data.gradeList : [];
  const codes = Array.isArray(data.subjectCodeList) ? data.subjectCodeList : [];
  const names = Array.isArray(data.subjectNameList) ? data.subjectNameList : [];
  return {
    grades: gradeList.map((item) => ({ code: String(item.gradeCode || ''), name: item.gradeName || item.gradeCode })),
    subjects: codes.map((code, index) => ({ code: String(code), name: names[index] || code })),
    history: data.sqDoExerciseHistory || {},
  };
}

function clearSelection() {
  state.path = [];
  state.selected.clear();
  updateSelection();
}

function updateSelection() {
  const count = state.selected.size;
  $('#selectedCount').textContent = `已选 ${count} 项`;
  $('#selectionSummary').textContent = count ? [...state.selected.values()].map((n) => n.tagName).join('、') : '请选择练习内容';
  $('#startBtn').disabled = count === 0;
}

async function loadHistory() {
  const data = payloadOf(await window.msykAPI.systemExerciseHistory({ gradeCode: state.session.gradeCode || '' }));
  const normalized = normalizeHistory(data);
  state.grades = normalized.grades;
  state.gradeCode = String(normalized.history.gradeCode || state.session.gradeCode || state.grades[0]?.code || '');
  state.subjects = normalized.subjects;
  state.subjectCode = String(normalized.history.subjectCode || state.subjects[0]?.code || '');
  state.bookId = String(normalized.history.bookId || '');
  state.bookName = String(normalized.history.bookName || '');
  fillSelect($('#gradeSelect'), state.grades, 'code', 'name', state.gradeCode);
  fillSelect($('#subjectSelect'), state.subjects, 'code', 'name', state.subjectCode);
}

async function refreshIncompleteSession() {
  if (state.session.gradeCode) return;

  const savedResponse = await window.msykAPI.getSavedLogin?.();
  const saved = savedResponse?.code === 200 ? savedResponse.data : null;
  if (!saved?.username || !saved?.password) {
    throw new Error('当前登录会话缺少年级信息，请退出账号后重新登录');
  }

  setStatus('正在更新年级和科目信息...');
  const loginResponse = await window.msykAPI.apiLogin({
    userName: saved.username,
    password: saved.password,
    macAddress: saved.macAddress || undefined,
  });
  if (!loginResponse || loginResponse.code !== 200) {
    throw new Error(loginResponse?.msg || '更新登录信息失败，请重新登录');
  }
  state.session = loginResponse.data || {};
}

async function loadSubjects() {
  const data = payloadOf(await window.msykAPI.systemExerciseSubjects({ gradeCode: state.gradeCode }));
  const codes = data.subjectCodeList || [];
  const names = data.subjectNameList || [];
  state.subjects = codes.map((code, index) => ({ code: String(code), name: names[index] || code }));
  if (!state.subjects.some((item) => item.code === state.subjectCode)) state.subjectCode = state.subjects[0]?.code || '';
  fillSelect($('#subjectSelect'), state.subjects, 'code', 'name', state.subjectCode);
}

async function loadBooks() {
  if (state.mode === 'knowledge') return;
  const editionData = payloadOf(await window.msykAPI.systemExerciseEditions({ gradeCode: state.gradeCode, subjectCode: state.subjectCode }));
  const editionNames = editionData.zyBookList || [];
  const editionIds = editionData.zyBookIdList || [];
  state.editions = editionNames.map((name, index) => ({ id: String(editionIds[index] ?? ''), name: String(name) }));
  fillSelect($('#editionSelect'), state.editions, 'id', 'name', state.editions[0]?.id);
  if (!state.editions.length) {
    state.books = []; state.bookId = ''; state.bookName = '';
    fillSelect($('#bookSelect'), [], 'id', 'name', '');
    return;
  }
  await loadEditionBooks(state.editions[0].id);
}

async function loadEditionBooks(edition) {
  const data = payloadOf(await window.msykAPI.systemExerciseBooks({ edition, gradeCode: state.gradeCode, subjectCode: state.subjectCode }));
  state.books = (data.zyBookList || []).map((book) => ({
    id: String(book.id || ''), name: String(book.title || book.bookName || book.publish || book.id || ''),
  }));
  if (!state.books.some((book) => book.id === state.bookId)) state.bookId = state.books[0]?.id || '';
  state.bookName = state.books.find((book) => book.id === state.bookId)?.name || '';
  fillSelect($('#bookSelect'), state.books, 'id', 'name', state.bookId);
}

async function loadNodes(parentId = '') {
  const list = $('#nodeList');
  list.innerHTML = '<div class="empty">正在加载...</div>';
  $('#upBtn').disabled = state.path.length === 0;
  try {
    const data = payloadOf(await window.msykAPI.systemExerciseNodes({
      mode: state.mode, dirId: state.bookId, parentId,
      gradeCode: state.gradeCode, subjectCode: state.subjectCode,
    }));
    const nodes = Array.isArray(data.resultList) ? data.resultList : [];
    renderNodes(nodes);
    setStatus(nodes.length ? '请选择一个或多个末级内容' : '当前范围暂无可练习内容');
  } catch (error) {
    showNodeMessage(error.message);
    setStatus(error.message, true);
  }
}

function renderNodes(nodes) {
  const list = $('#nodeList');
  list.replaceChildren();
  if (!nodes.length) {
    list.innerHTML = '<div class="empty">暂无内容</div>';
    return;
  }
  nodes.forEach((raw) => {
    const node = {
      tagId: String(raw.tagId || raw.id || ''), tagName: String(raw.tagName || raw.name || '未命名'),
      nodeCode: String(raw.nodeCode || ''),
      isEndTag: [raw.isEndTag, raw.endtag].some((value) => value === true || value === 1
        || value === '1' || String(value).toLowerCase() === 'true'),
    };
    if (!node.tagId) return;

    const row = document.createElement('div');
    row.className = `node${state.selected.has(node.tagId) ? ' selected' : ''}`;

    const choice = document.createElement('label');
    choice.className = 'node-choice';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = state.selected.has(node.tagId);
    checkbox.setAttribute('aria-label', `选择${node.tagName}`);
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = node.tagName;
    choice.append(checkbox, name);

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selected.set(node.tagId, node);
      else state.selected.delete(node.tagId);
      row.classList.toggle('selected', checkbox.checked);
      updateSelection();
    });

    row.appendChild(choice);
    if (!node.isEndTag) {
      const next = document.createElement('button');
      next.type = 'button';
      next.className = 'node-next';
      next.textContent = '下一级 ›';
      next.setAttribute('aria-label', `进入${node.tagName}的下一级`);
      next.addEventListener('click', () => {
        state.path.push(node);
        $('#treeTitle').textContent = node.tagName;
        loadNodes(node.tagId);
      });
      row.appendChild(next);
    } else {
      const leaf = document.createElement('span');
      leaf.className = 'node-leaf';
      leaf.textContent = '末级';
      row.appendChild(leaf);
    }
    list.appendChild(row);
  });
}

async function resetRange() {
  clearSelection();
  if (state.mode === 'chapter') await loadBooks();
  $('#editionField').hidden = state.mode !== 'chapter';
  $('#bookField').hidden = state.mode !== 'chapter';
  $('#treeTitle').textContent = state.mode === 'chapter' ? '选择章节' : '选择知识点';
  await loadNodes('');
}

async function startExercise() {
  const button = $('#startBtn');
  button.disabled = true;
  try {
    const selected = [...state.selected.values()];
    const request = {
      subjectCode: state.subjectCode, gradeCode: state.gradeCode,
      tagIds: selected.map((item) => item.tagId).join(','),
      nodeCodes: selected.map((item) => item.nodeCode).join(','),
      bookId: state.mode === 'chapter' ? state.bookId : '', type: state.mode === 'chapter' ? 1 : 2,
    };
    const data = payloadOf(await window.msykAPI.systemExerciseStart(request));
    const questions = Array.isArray(data.questions) ? data.questions.map(String) : [];
    if (!questions.length) throw new Error(state.mode === 'chapter' ? '所选章节下没有题目' : '所选知识点下没有题目');
    await window.msykAPI.systemExerciseSaveHistory({
      gradeCode: state.gradeCode, subjectCode: state.subjectCode,
      bookId: request.bookId, bookName: state.bookName,
    });
    sessionStorage.setItem('msykSystemExercise', JSON.stringify({
      ...request, questions, teacherExamId: String(data.teacherExamId || ''),
      difficulty: data.difficulty ?? '', studentId: String(state.session.studentId || ''), startedAt: Date.now(),
    }));
    location.href = './do.html';
  } catch (error) {
    setStatus(error.message, true);
    button.disabled = false;
  }
}

$('#backBtn').addEventListener('click', () => history.length > 1 ? history.back() : location.replace('../main/index.html?page=home'));
$('#gradeSelect').addEventListener('change', async (event) => { state.gradeCode = event.target.value; state.bookId = ''; await loadSubjects(); await resetRange(); });
$('#subjectSelect').addEventListener('change', async (event) => { state.subjectCode = event.target.value; state.bookId = ''; await resetRange(); });
$('#editionSelect').addEventListener('change', async (event) => { clearSelection(); await loadEditionBooks(event.target.value); await loadNodes(''); });
$('#bookSelect').addEventListener('change', async (event) => { state.bookId = event.target.value; state.bookName = state.books.find((b) => b.id === state.bookId)?.name || ''; clearSelection(); await loadNodes(''); });
$('#upBtn').addEventListener('click', () => { state.path.pop(); const parent = state.path.at(-1); $('#treeTitle').textContent = parent?.tagName || (state.mode === 'chapter' ? '选择章节' : '选择知识点'); loadNodes(parent?.tagId || ''); });
document.querySelectorAll('[data-mode]').forEach((button) => button.addEventListener('click', async () => {
  state.mode = button.dataset.mode;
  document.querySelectorAll('[data-mode]').forEach((item) => item.classList.toggle('active', item === button));
  await resetRange();
}));
$('#startBtn').addEventListener('click', startExercise);

(async () => {
  try {
    const sessionResponse = await window.msykAPI.apiGetSession();
    state.session = sessionResponse?.data || sessionResponse || {};
    await refreshIncompleteSession();
    await loadHistory();
    if (!state.gradeCode || !state.subjectCode) throw new Error('服务器未返回可用的年级或科目');
    await resetRange();
  } catch (error) {
    setStatus(error.message, true);
    showNodeMessage(error.message);
  }
})();
