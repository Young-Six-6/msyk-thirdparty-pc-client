(function initScorePage() {
  'use strict';

  window.Theme?.initTheme();

  const $ = (selector) => document.querySelector(selector);
  const elements = {
    subject: $('#subjectSelect'),
    refresh: $('#refreshBtn'),
    tabs: $('#scoreTabs'),
    status: $('#pageStatus'),
    homeworkPanel: $('#homeworkPanel'),
    testPanel: $('#testPanel'),
    homeworkList: $('#homeworkList'),
    homeworkCount: $('#homeworkCount'),
    homeworkMore: $('#homeworkMore'),
    testList: $('#testList'),
    testCount: $('#testCount'),
    testMore: $('#testMore'),
    startDate: $('#startDate'),
    endDate: $('#endDate'),
    chart: $('#trendChart'),
    chartWrap: $('#chartWrap'),
    chartEmpty: $('#chartEmpty'),
    chartTooltip: $('#chartTooltip'),
    trendSummary: $('#trendSummary'),
    dialog: $('#scoreDialog'),
    dialogTitle: $('#dialogTitle'),
    dialogDetails: $('#dialogDetails'),
    dialogClose: $('#dialogClose'),
  };

  const state = {
    mode: 'homework',
    subjectCode: '',
    subjects: [],
    trend: [],
    homeworkItems: [],
    homeworkPage: 1,
    homeworkPages: 1,
    testItems: [],
    testPage: 1,
    testPages: 1,
    homeworkLoaded: false,
    testLoaded: false,
    requestId: 0,
    chartPoints: [],
    busy: false,
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character]));
  }

  function numberValue(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function formatNumber(value) {
    const number = numberValue(value, NaN);
    if (!Number.isFinite(number)) return '--';
    return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100);
  }

  function toDate(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;
    const date = new Date(number < 100000000000 ? number * 1000 : number);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatDate(value, withTime = false) {
    const date = toDate(value);
    if (!date) return '--';
    const pad = (part) => String(part).padStart(2, '0');
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    return withTime ? `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}` : day;
  }

  function formatDuration(value) {
    let seconds = Math.max(0, Math.round(numberValue(value)));
    if (!seconds) return '--';
    const hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    const minutes = Math.floor(seconds / 60);
    seconds %= 60;
    if (hours) return `${hours}小时${minutes}分`;
    if (minutes) return `${minutes}分${seconds}秒`;
    return `${seconds}秒`;
  }

  function responseData(response, action) {
    if (!response || response.code !== 200) {
      throw new Error(response?.msg || `${action}失败`);
    }
    const data = response.data;
    if (!data || typeof data !== 'object') throw new Error(`${action}响应异常`);
    const businessCode = String(data.code ?? '');
    if (businessCode && businessCode !== '10000') {
      throw new Error(data.message || data.msg || `${action}失败`);
    }
    return data;
  }

  function setStatus(message = '', type = '') {
    elements.status.textContent = message;
    elements.status.classList.toggle('error', type === 'error');
  }

  function setBusy(busy) {
    state.busy = busy;
    elements.refresh.disabled = busy;
    elements.subject.disabled = busy;
    elements.homeworkMore.disabled = busy;
    elements.testMore.disabled = busy;
  }

  function normalizeTranscript(item = {}) {
    return {
      homeworkId: String(item.homeworkId || item.uuid || ''),
      homeworkName: String(item.homeworkName || '未命名成绩'),
      homeworkType: numberValue(item.homeworkType),
      subjectName: String(item.subjectName || ''),
      score: numberValue(item.score),
      allScore: numberValue(item.allScore),
      average: numberValue(item.average),
      squadAverage: numberValue(item.squadAverage),
      rank: numberValue(item.rank),
      squadRank: numberValue(item.squadRank),
      rankStatus: numberValue(item.rankStatus),
      exceedNum: numberValue(item.exceedNum),
      startTime: numberValue(item.startTime),
      doHomeworkTime: numberValue(item.doHomeworkTime),
      source: numberValue(item.source),
      trueQuestionNum: numberValue(item.trueQuestionNum),
      allQuestionNum: numberValue(item.allQuestionNum),
    };
  }

  function renderSubjects() {
    const subjectOptions = state.subjects.map((subject) => {
      const label = subject.teacherName
        ? `${subject.name} - ${subject.teacherName}`
        : subject.name;
      return `<option value="${escapeHtml(subject.code)}">${escapeHtml(label)}</option>`;
    });
    elements.subject.innerHTML = [
      '<option value="">全部科目</option>',
      ...subjectOptions,
    ].join('');
    elements.subject.value = state.subjectCode;
    elements.subject.disabled = state.busy;
  }

  async function loadSubjects() {
    if (typeof window.msykAPI?.hwSubjects !== 'function') {
      throw new Error('当前运行环境未提供科目接口');
    }
    const data = responseData(await window.msykAPI.hwSubjects(), '获取科目');
    const list = Array.isArray(data.studentSubjectList) ? data.studentSubjectList : [];
    state.subjects = list.map((subject) => ({
      code: String(subject?.code || subject?.subjectCode || '').trim(),
      name: String(subject?.name || subject?.subjectName || '').trim(),
      teacherName: String(subject?.teacherName || '').trim(),
    })).filter((subject) => subject.code && subject.name);
    state.subjectCode = '';
    renderSubjects();
  }

  function homeworkCard(item, index) {
    const subject = item.subjectName || state.subjects.find((entry) => entry.code === state.subjectCode)?.name || '';
    const rank = item.rank > 0 ? `第 ${item.rank} 名` : '--';
    return `
      <button class="score-card" type="button" data-kind="homework" data-index="${index}">
        <span class="score-card-head">
          <span class="score-name">${escapeHtml(item.homeworkName)}</span>
          <span class="score-subject">${escapeHtml(subject)}</span>
        </span>
        <span class="score-card-values">
          <span>
            <span class="score-main">${formatNumber(item.score)}<small> / ${formatNumber(item.allScore)}</small></span>
            <span class="score-date">${formatDate(item.startTime)}</span>
          </span>
          <span class="score-metrics">
            <span class="metric"><span class="metric-label">平均分</span><span class="metric-value">${formatNumber(item.average)}</span></span>
            <span class="metric"><span class="metric-label">排名</span><span class="metric-value">${rank}</span></span>
          </span>
        </span>
      </button>`;
  }

  function renderHomeworkList() {
    elements.homeworkCount.textContent = `${state.homeworkItems.length} 条记录`;
    elements.homeworkList.innerHTML = state.homeworkItems.length
      ? state.homeworkItems.map(homeworkCard).join('')
      : '<div class="empty-state">暂无作业成绩</div>';
    elements.homeworkMore.hidden = state.homeworkPage >= state.homeworkPages || !state.homeworkItems.length;
  }

  function testRow(item, index) {
    const type = item.homeworkType === 99 ? '测验' : '答题卡';
    const correct = item.allQuestionNum > 0
      ? `${item.trueQuestionNum}/${item.allQuestionNum}`
      : '--';
    const rank = item.rank > 0 ? `第 ${item.rank} 名` : '--';
    return `
      <button class="test-row" type="button" data-kind="test" data-index="${index}">
        <span class="test-title">${escapeHtml(item.homeworkName)}</span>
        <span class="test-type">${type}</span>
        <span class="test-meta">${formatDuration(item.doHomeworkTime)}</span>
        <span>${formatNumber(item.score)} / ${formatNumber(item.allScore)}</span>
        <span>${correct === '--' ? rank : correct}</span>
      </button>`;
  }

  function renderTestList() {
    elements.testCount.textContent = `${state.testItems.length} 条记录`;
    const head = `
      <div class="test-head" aria-hidden="true">
        <span>名称</span><span>类型</span><span>用时</span><span>得分</span><span>正确题数</span>
      </div>`;
    elements.testList.innerHTML = state.testItems.length
      ? head + state.testItems.map(testRow).join('')
      : '<div class="empty-state">暂无考试成绩</div>';
    elements.testMore.hidden = state.testPage >= state.testPages || !state.testItems.length;
  }

  function normalizeTrend(items) {
    return (Array.isArray(items) ? items : []).map((item) => ({
      homeworkName: String(item?.homeworkName || '未命名作业'),
      startTime: numberValue(item?.startTime),
      myScore: numberValue(item?.myScore),
      totalScore: numberValue(item?.totalScore),
      scoreRate: Math.max(0, Math.min(100, numberValue(item?.scoreRate))),
    })).sort((left, right) => left.startTime - right.startTime);
  }

  function drawTrend() {
    const chart = elements.chart;
    const rect = elements.chartWrap.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    chart.setAttribute('viewBox', `0 0 ${rect.width} ${rect.height}`);
    chart.setAttribute('preserveAspectRatio', 'none');
    chart.innerHTML = '';
    state.chartPoints = [];

    const points = state.trend;
    elements.chartEmpty.hidden = points.length > 0;
    if (!points.length) {
      elements.trendSummary.textContent = '暂无成绩';
      return;
    }

    const average = points.reduce((sum, item) => sum + item.scoreRate, 0) / points.length;
    elements.trendSummary.textContent = `${points.length} 次作业，平均得分率 ${formatNumber(average)}%`;

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 18, right: 18, bottom: 34, left: 42 };
    const innerWidth = Math.max(1, width - padding.left - padding.right);
    const innerHeight = Math.max(1, height - padding.top - padding.bottom);

    const gridMarkup = [0, 25, 50, 75, 100].map((value) => {
      const y = padding.top + innerHeight - (value / 100) * innerHeight;
      return `<line class="chart-grid-line" x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}"></line>
        <text class="chart-axis-label" x="${padding.left - 8}" y="${y}" text-anchor="end" dominant-baseline="middle">${value}%</text>`;
    }).join('');

    const step = points.length > 1 ? innerWidth / (points.length - 1) : 0;
    state.chartPoints = points.map((item, index) => ({
      x: points.length > 1 ? padding.left + step * index : padding.left + innerWidth / 2,
      y: padding.top + innerHeight - (item.scoreRate / 100) * innerHeight,
      item,
    }));

    const labelEvery = Math.max(1, Math.ceil(points.length / 6));
    const labelMarkup = state.chartPoints.map((point, index) => {
      if (index % labelEvery !== 0 && index !== points.length - 1) return;
      const label = formatDate(point.item.startTime).slice(5);
      const text = label === '--' ? String(index + 1) : label;
      return `<text class="chart-axis-label" x="${point.x}" y="${height - padding.bottom + 18}" text-anchor="middle">${escapeHtml(text)}</text>`;
    }).join('');
    const linePath = state.chartPoints.map((point, index) => (
      `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
    )).join(' ');
    const pointMarkup = state.chartPoints.map((point) => (
      `<circle class="chart-point" cx="${point.x}" cy="${point.y}" r="4"></circle>`
    )).join('');

    chart.innerHTML = `${gridMarkup}${labelMarkup}<path class="chart-line" d="${linePath}"></path>${pointMarkup}`;
  }

  function showChartTooltip(event) {
    if (!state.chartPoints.length) return;
    const rect = elements.chartWrap.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const nearest = state.chartPoints.reduce((best, point) => (
      !best || Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best
    ), null);
    if (!nearest || Math.abs(nearest.x - x) > 28) {
      elements.chartTooltip.hidden = true;
      return;
    }
    const item = nearest.item;
    elements.chartTooltip.textContent = `${item.homeworkName}  ${formatNumber(item.myScore)}/${formatNumber(item.totalScore)}  ${formatNumber(item.scoreRate)}%`;
    elements.chartTooltip.hidden = false;
    const tooltipWidth = elements.chartTooltip.offsetWidth;
    const tooltipHeight = elements.chartTooltip.offsetHeight;
    elements.chartTooltip.style.left = `${Math.max(8, Math.min(rect.width - tooltipWidth - 8, nearest.x - tooltipWidth / 2))}px`;
    elements.chartTooltip.style.top = `${Math.max(8, nearest.y - tooltipHeight - 12)}px`;
  }

  async function loadHomework(reset = true) {
    if (typeof window.msykAPI?.scoreHomeworkList !== 'function'
      || typeof window.msykAPI?.scoreHomeworkTrend !== 'function') {
      throw new Error('当前运行环境未提供作业成绩接口');
    }

    const requestId = ++state.requestId;
    setBusy(true);
    if (reset) {
      state.homeworkPage = 1;
      setStatus('正在加载作业成绩...');
    } else {
      setStatus('正在加载更多作业成绩...');
    }
    try {
      if (reset) {
        const [trendResponse, listResponse] = await Promise.all([
          window.msykAPI.scoreHomeworkTrend({
            subjectCode: state.subjectCode,
            startTime: elements.startDate.value,
            endTime: elements.endDate.value,
            rows: 100,
            pageIndex: 1,
          }),
          window.msykAPI.scoreHomeworkList({
            subjectCode: state.subjectCode,
            pageIndex: 1,
            pageSize: 18,
          }),
        ]);
        if (requestId !== state.requestId) return;
        const trendData = responseData(trendResponse, '获取作业趋势');
        const listData = responseData(listResponse, '获取作业成绩');
        state.trend = normalizeTrend(trendData.scoreGraphList);
        state.homeworkItems = (Array.isArray(listData.scoreList) ? listData.scoreList : []).map(normalizeTranscript);
        state.homeworkPages = Math.max(1, numberValue(listData.page, 1));
      } else {
        const nextPage = state.homeworkPage + 1;
        const data = responseData(await window.msykAPI.scoreHomeworkList({
          subjectCode: state.subjectCode,
          pageIndex: nextPage,
          pageSize: 18,
        }), '获取更多作业成绩');
        if (requestId !== state.requestId) return;
        state.homeworkPage = nextPage;
        state.homeworkPages = Math.max(1, numberValue(data.page, state.homeworkPages));
        state.homeworkItems.push(...(Array.isArray(data.scoreList) ? data.scoreList : []).map(normalizeTranscript));
      }
      state.homeworkLoaded = true;
      renderHomeworkList();
      drawTrend();
      setStatus('');
    } catch (error) {
      if (requestId !== state.requestId) return;
      setStatus(error?.message || '加载作业成绩失败', 'error');
      if (reset) {
        state.trend = [];
        state.homeworkItems = [];
        renderHomeworkList();
        drawTrend();
      }
    } finally {
      if (requestId === state.requestId) setBusy(false);
    }
  }

  async function loadTrend() {
    if (typeof window.msykAPI?.scoreHomeworkTrend !== 'function') return;
    const requestId = ++state.requestId;
    setBusy(true);
    setStatus('正在更新趋势...');
    try {
      const data = responseData(await window.msykAPI.scoreHomeworkTrend({
        subjectCode: state.subjectCode,
        startTime: elements.startDate.value,
        endTime: elements.endDate.value,
        rows: 100,
        pageIndex: 1,
      }), '获取作业趋势');
      if (requestId !== state.requestId) return;
      state.trend = normalizeTrend(data.scoreGraphList);
      drawTrend();
      setStatus('');
    } catch (error) {
      if (requestId === state.requestId) setStatus(error?.message || '更新趋势失败', 'error');
    } finally {
      if (requestId === state.requestId) setBusy(false);
    }
  }

  async function loadTests(reset = true) {
    if (typeof window.msykAPI?.scoreTestList !== 'function') {
      throw new Error('当前运行环境未提供考试成绩接口');
    }
    const requestId = ++state.requestId;
    const pageIndex = reset ? 1 : state.testPage + 1;
    setBusy(true);
    setStatus(reset ? '正在加载考试成绩...' : '正在加载更多考试成绩...');
    try {
      const outer = responseData(await window.msykAPI.scoreTestList({
        subjectCode: state.subjectCode,
        pageIndex,
        pageSize: 20,
      }), '获取考试成绩');
      if (requestId !== state.requestId) return;
      const data = outer.data && typeof outer.data === 'object' ? outer.data : outer;
      const items = (Array.isArray(data.scoreList) ? data.scoreList : []).map(normalizeTranscript);
      state.testItems = reset ? items : state.testItems.concat(items);
      state.testPage = pageIndex;
      state.testPages = Math.max(1, numberValue(data.page, 1));
      state.testLoaded = true;
      renderTestList();
      setStatus('');
    } catch (error) {
      if (requestId !== state.requestId) return;
      setStatus(error?.message || '加载考试成绩失败', 'error');
      if (reset) {
        state.testItems = [];
        renderTestList();
      }
    } finally {
      if (requestId === state.requestId) setBusy(false);
    }
  }

  function switchMode(mode) {
    if (!['homework', 'test'].includes(mode) || state.mode === mode) return;
    state.mode = mode;
    elements.tabs.querySelectorAll('[data-mode]').forEach((button) => {
      const active = button.dataset.mode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    elements.homeworkPanel.hidden = mode !== 'homework';
    elements.testPanel.hidden = mode !== 'test';
    setStatus('');
    if (mode === 'homework') {
      requestAnimationFrame(drawTrend);
      if (!state.homeworkLoaded) loadHomework(true);
    } else if (!state.testLoaded) {
      loadTests(true);
    }
  }

  function detailItems(item, kind) {
    const details = [
      ['得分', `${formatNumber(item.score)} / ${formatNumber(item.allScore)}`],
      ['平均分', formatNumber(item.average)],
      ['个人排名', item.rank > 0 ? `第 ${item.rank} 名` : '--'],
      ['班级排名', item.squadRank > 0 ? `第 ${item.squadRank} 名` : '--'],
      ['班级平均分', formatNumber(item.squadAverage)],
      ['完成用时', formatDuration(item.doHomeworkTime)],
      ['作业日期', formatDate(item.startTime, true)],
    ];
    if (item.exceedNum > 0) details.push(['超过人数', String(item.exceedNum)]);
    if (kind === 'test' && item.allQuestionNum > 0) {
      details.push(['正确题数', `${item.trueQuestionNum} / ${item.allQuestionNum}`]);
    }
    if (item.subjectName) details.push(['科目', item.subjectName]);
    return details;
  }

  function openDetail(item, kind) {
    if (!item) return;
    elements.dialogTitle.textContent = item.homeworkName;
    elements.dialogDetails.innerHTML = detailItems(item, kind).map(([label, value]) => `
      <div class="detail-item">
        <span class="detail-label">${escapeHtml(label)}</span>
        <span class="detail-value">${escapeHtml(value)}</span>
      </div>`).join('');
    if (typeof elements.dialog.showModal === 'function') elements.dialog.showModal();
    else elements.dialog.setAttribute('open', '');
  }

  function validateDateRange() {
    const start = elements.startDate.value;
    const end = elements.endDate.value;
    const invalid = start && end && start > end;
    elements.startDate.setCustomValidity(invalid ? '开始日期需早于截止日期' : '');
    elements.endDate.setCustomValidity(invalid ? '截止日期需晚于开始日期' : '');
    elements.startDate.max = end || elements.endDate.max;
    elements.endDate.min = start || '';
    if (invalid) {
      elements.endDate.reportValidity();
      return false;
    }
    return true;
  }

  async function refreshActive() {
    if (state.busy) return;
    if (state.mode === 'homework') await loadHomework(true);
    else await loadTests(true);
  }

  function bindEvents() {
    elements.subject.addEventListener('change', () => {
      state.subjectCode = elements.subject.value;
      state.homeworkLoaded = false;
      state.testLoaded = false;
      state.trend = [];
      state.homeworkItems = [];
      state.testItems = [];
      renderHomeworkList();
      renderTestList();
      refreshActive();
    });
    elements.refresh.addEventListener('click', refreshActive);
    elements.tabs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-mode]');
      if (button) switchMode(button.dataset.mode);
    });
    elements.tabs.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      switchMode(state.mode === 'homework' ? 'test' : 'homework');
      elements.tabs.querySelector(`[data-mode="${state.mode}"]`)?.focus();
    });
    elements.homeworkMore.addEventListener('click', () => loadHomework(false));
    elements.testMore.addEventListener('click', () => loadTests(false));
    [elements.startDate, elements.endDate].forEach((input) => {
      input.addEventListener('change', () => {
        if (validateDateRange()) loadTrend();
      });
    });
    [elements.homeworkList, elements.testList].forEach((list) => {
      list.addEventListener('click', (event) => {
        const button = event.target.closest('[data-kind][data-index]');
        if (!button) return;
        const kind = button.dataset.kind;
        const items = kind === 'test' ? state.testItems : state.homeworkItems;
        openDetail(items[numberValue(button.dataset.index, -1)], kind);
      });
    });
    elements.dialogClose.addEventListener('click', () => elements.dialog.close());
    elements.dialog.addEventListener('click', (event) => {
      if (event.target === elements.dialog) elements.dialog.close();
    });
    elements.chartWrap.addEventListener('pointermove', showChartTooltip);
    elements.chartWrap.addEventListener('pointerdown', showChartTooltip);
    elements.chartWrap.addEventListener('pointerleave', () => {
      elements.chartTooltip.hidden = true;
    });
    document.querySelector('.score-nav')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-go]');
      if (button && button.dataset.go !== 'score') {
        window.PrimaryPageTransition?.navigate(button.dataset.go);
      }
    });
  }

  async function init() {
    const today = new Date();
    const maxDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    elements.startDate.max = maxDate;
    elements.endDate.max = maxDate;
    renderHomeworkList();
    renderTestList();
    bindEvents();
    new ResizeObserver(drawTrend).observe(elements.chartWrap);
    new MutationObserver(drawTrend).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style'],
    });

    setBusy(true);
    setStatus('正在加载科目...');
    try {
      await loadSubjects();
      await loadHomework(true);
    } catch (error) {
      setStatus(error?.message || '成绩页加载失败', 'error');
    } finally {
      setBusy(false);
    }
  }

  init();
})();
