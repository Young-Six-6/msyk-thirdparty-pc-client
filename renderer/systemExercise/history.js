window.Theme?.initTheme();

const $ = (selector) => document.querySelector(selector);
const filter = JSON.parse(sessionStorage.getItem('msykSystemExerciseHistoryFilter') || '{}');
const state = {
  gradeCode: String(filter.gradeCode || ''),
  subjectCode: String(filter.subjectCode || ''),
  subjectName: String(filter.subjectName || filter.subjectCode || ''),
  page: 1,
  pageCount: 1,
  month: new Date().toISOString().slice(0, 7),
};

function payloadOf(response) {
  if (!response || response.code !== 200) throw new Error(response?.msg || '请求失败');
  let value = response.data;
  for (let i = 0; i < 2 && value?.data && typeof value.data === 'object'; i++) {
    const code = String(value.code ?? '');
    if (code && code !== '10000' && code !== '200') throw new Error(value.message || value.msg || `服务端返回 ${code}`);
    value = value.data;
  }
  const code = String(value?.code ?? '');
  if (code && code !== '10000' && code !== '200') throw new Error(value.message || value.msg || `服务端返回 ${code}`);
  return value || {};
}

function metric(value, label) {
  const node = document.createElement('div');
  node.className = 'metric';
  const strong = document.createElement('strong');
  strong.textContent = value || '0';
  const span = document.createElement('span');
  span.textContent = label;
  node.append(strong, span);
  return node;
}

function renderMonth(data) {
  const records = Array.isArray(data.monthRecord) ? data.monthRecord : [];
  const record = records.find((item) => String(item.yearAndMonth || '') === state.month) || {};
  $('#monthSummary').replaceChildren(
    metric(String(record.questionNumber ?? 0), '练习题数'),
    metric(String(record.accuracy || '0%'), '正确率'),
    metric(String(record.doExerciseTime || '0秒'), '练习时长'),
    metric(String(record.knowMastery || '0%'), '知识掌握度'),
  );
}

function historyCell(label, value) {
  const span = document.createElement('span');
  span.textContent = `${label} `;
  const bold = document.createElement('b');
  bold.textContent = value;
  span.appendChild(bold);
  return span;
}

function renderHistory(items, append) {
  const list = $('#historyList');
  if (!append) list.replaceChildren();
  if (!items.length && !append) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '本月暂无练习记录';
    list.appendChild(empty);
    return;
  }
  items.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'history-item';
    const title = document.createElement('strong');
    title.textContent = item.createDate || (item.createTime ? new Date(Number(item.createTime)).toLocaleString() : '练习记录');
    row.append(
      title,
      historyCell('得分', String(item.grade ?? '--')),
      historyCell('正确', String(item.correctQuestionNum ?? 0)),
      historyCell('错误', String(item.wrongQuestionNum ?? 0)),
      historyCell('用时', String(item.doExerciseTime || '--')),
    );
    list.appendChild(row);
  });
}

async function loadMonthSummary() {
  const data = payloadOf(await window.msykAPI.systemExerciseMonthStats({
    subjectCode: state.subjectCode,
    gradeCode: state.gradeCode,
  }));
  renderMonth(data);
}

async function loadHistory(append = false) {
  const button = $('#moreBtn');
  button.disabled = true;
  const data = payloadOf(await window.msykAPI.systemExerciseHistoryStats({
    subjectCode: state.subjectCode,
    gradeCode: state.gradeCode,
    pageNum: state.page,
    creationTime: state.month,
  }));
  const items = Array.isArray(data.message) ? data.message : [];
  state.pageCount = Math.max(1, Number(data.pageCounts) || 1);
  renderHistory(items, append);
  button.hidden = state.page >= state.pageCount;
  button.disabled = false;
}

$('#backBtn').addEventListener('click', () => location.replace('./index.html'));
$('#monthInput').addEventListener('change', async (event) => {
  state.month = event.target.value || new Date().toISOString().slice(0, 7);
  state.page = 1;
  try {
    await loadMonthSummary();
    await loadHistory();
  } catch (error) {
    renderHistory([], false);
    $('#subtitle').textContent = error.message;
  }
});
$('#moreBtn').addEventListener('click', async () => {
  if (state.page >= state.pageCount) return;
  state.page += 1;
  try {
    await loadHistory(true);
  } catch (error) {
    state.page -= 1;
    alert(error.message);
  }
});

(async () => {
  try {
    if (!state.gradeCode || !state.subjectCode) throw new Error('请先在系统练习中选择年级和科目');
    $('#subtitle').textContent = `${state.subjectName} · ${state.gradeCode}`;
    $('#monthInput').value = state.month;
    await Promise.all([loadMonthSummary(), loadHistory()]);
  } catch (error) {
    $('#subtitle').textContent = error.message;
    renderMonth({});
    renderHistory([], false);
  }
})();
