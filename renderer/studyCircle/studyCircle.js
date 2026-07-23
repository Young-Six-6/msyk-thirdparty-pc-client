(function initStudyCircle() {
  'use strict';

  window.Theme?.initTheme();

  const $ = (selector) => document.querySelector(selector);
  const FILTER_STORAGE_KEY = 'msyk_study_circle_filters';
  const elements = {
    status: $('#status'), grid: $('#questionGrid'), subject: $('#subjectSelect'),
    stateField: $('#stateField'), state: $('#stateSelect'), startDate: $('#startDate'),
    endDate: $('#endDate'), sortField: $('#sortField'), sort: $('#sortSelect'),
    startDateField: $('#startDateField'), endDateField: $('#endDateField'),
    loadMore: $('#loadMoreBtn'), askDialog: $('#askDialog'),
    askForm: $('#askForm'), askSubject: $('#askSubject'), askContent: $('#askContent'),
    askSubmit: $('#askSubmitBtn'), mineDot: $('#mineDot'), imageViewer: $('#imageViewer'),
    viewerImage: $('#viewerImage'), askAttachmentHint: $('#askAttachmentHint'),
  };
  let savedFilters = {};
  try { savedFilters = JSON.parse(sessionStorage.getItem(FILTER_STORAGE_KEY) || '{}'); } catch {}
  const tabParam = new URLSearchParams(location.search).get('tab');
  const moduleParam = new URLSearchParams(location.search).get('module');
  const initialScope = tabParam === 'mine' || (!tabParam && savedFilters.scope === 'mine') ? 'mine' : 'square';
  const initialModule = ['questions', 'projects', 'cases'].includes(moduleParam)
    ? moduleParam
    : (['questions', 'projects', 'cases'].includes(savedFilters.module) ? savedFilters.module : 'questions');
  const state = {
    module: initialModule, scope: initialScope, page: 1, pages: 1,
    loading: false, subjects: [], items: [], access: null,
  };
  const askAttachments = window.StudyCircleAttachments.create({
    container: $('#askAttachments'),
    imageInput: $('#askImageInput'),
    audioInput: $('#askAudioInput'),
    onChange: ({ count, uploading, failed, message }) => {
      elements.askAttachmentHint.textContent = message || (uploading
        ? `正在上传附件 (${count}/9)`
        : failed ? '有附件上传失败，请重试或删除' : `已选择 ${count}/9 个附件`);
    },
  });

  function messageOf(payload, fallback) {
    return payload?.message || payload?.msg || payload?.errorMessage || fallback;
  }

  function responseData(response, action) {
    if (!response || response.code !== 200) throw new Error(response?.msg || `${action}失败`);
    const outer = response.data;
    if (outer && typeof outer === 'object') {
      const code = String(outer.code ?? '10000');
      if (code && code !== '10000') throw new Error(messageOf(outer, `${action}失败 (${code})`));
      return outer.data && typeof outer.data === 'object' ? outer.data : outer;
    }
    throw new Error(`${action}响应异常`);
  }

  function listValue(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[char]);
  }

  function formatTime(value) {
    const number = Number(value);
    const date = new Date(Number.isFinite(number) && number > 0 ? number : value);
    if (Number.isNaN(date.getTime())) return '';
    const distance = Date.now() - date.getTime();
    if (distance >= 0 && distance < 60000) return '刚刚';
    if (distance >= 0 && distance < 3600000) return `${Math.floor(distance / 60000)}分钟前`;
    if (distance >= 0 && distance < 86400000) return `${Math.floor(distance / 3600000)}小时前`;
    return new Intl.DateTimeFormat('zh-CN', {
      year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
  }

  function dateTimestamp(value) {
    if (!value) return '';
    const time = new Date(`${value}T00:00:00`).getTime();
    return Number.isFinite(time) ? String(time) : '';
  }

  function initials(name) {
    const text = String(name || '同学').trim();
    return escapeHtml(text.slice(-1) || '同');
  }

  function mediaHtml(item) {
    const pictures = listValue(item.picUrlList).map(safeUrl).filter(Boolean);
    const audio = listValue(item.audioUrlList)
      .map((entry) => safeUrl(typeof entry === 'string' ? entry : entry?.url))
      .filter(Boolean);
    const pictureHtml = pictures.length ? `<div class="media-grid">${pictures.slice(0, 3).map((url, index) => `
      <button class="media-thumb" type="button" data-image="${escapeHtml(url)}" aria-label="查看第 ${index + 1} 张图片">
        <img src="${escapeHtml(url)}" alt="问题图片" loading="lazy">
        ${index === 2 && pictures.length > 3 ? `<span class="media-count">共${pictures.length}张</span>` : ''}
      </button>`).join('')}</div>` : '';
    const audioHtml = audio.length ? `<div class="audio-list">${audio.map((url) =>
      `<audio controls preload="none" src="${escapeHtml(url)}"></audio>`).join('')}</div>` : '';
    return pictureHtml + audioHtml;
  }

  function cardHtml(item, index) {
    const uuid = String(item.uuid || item.submitQuestionUuId || '');
    const name = String(item.studentName || item.realName || '同学');
    const avatar = safeUrl(item.avatarUrl);
    const ended = Number(item.endQuestionType) === 2;
    const praised = Number(item.prais) === 1;
    const canPraise = state.scope !== 'mine' || Number(item.isPublic) === 1;
    return `<article class="question-card" data-index="${index}" data-uuid="${escapeHtml(uuid)}" tabindex="0">
      <div class="question-head">
        <span class="avatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : initials(name)}</span>
        <div class="author"><strong>${escapeHtml(name)}</strong><time>${escapeHtml(formatTime(item.creationTime))}</time></div>
        <span class="subject-tag">${escapeHtml(item.subjectName || '未分类')}</span>
      </div>
      <div class="question-content">${escapeHtml(item.questionDescribe || item.content || '')}</div>
      ${Number(item.fromType) === 1 && item.fromDescribe ? `<div class="source">来自：${escapeHtml(item.fromDescribe)}</div>` : ''}
      ${mediaHtml(item)}
      <div class="question-foot">
        <span class="state-tag${ended ? ' ended' : ''}">${ended ? '已结束' : '进行中'}${Number(item.isPublic) === 1 ? ' · 公开' : ''}</span>
        <span class="question-actions">
          ${canPraise ? `<button class="action-button praise-button${praised ? ' active' : ''}" type="button" data-action="praise" aria-label="点赞">赞 ${Number(item.praiseNum) || 0}</button>` : ''}
          <button class="action-button" type="button" data-action="detail">回复 ${Number(item.chattingRecordsNum) || 0}</button>
        </span>
      </div>
    </article>`;
  }

  function projectCardHtml(item) {
    const ended = Number(item.projectEndTime || item.endTime) > 0
      && Number(item.projectEndTime || item.endTime) < Date.now();
    const id = String(item.projectUuId || item.projectUuid || item.uuid || '');
    return `<article class="module-card" data-module-detail="project" data-id="${escapeHtml(id)}" tabindex="0">
      <div class="question-head">
        <span class="avatar">课</span>
        <div class="author"><strong>${escapeHtml(item.teacherName || '老师')}</strong><time>${escapeHtml(item.subjectName || '未分类')}</time></div>
        <span class="state-tag${ended ? ' ended' : ''}">${ended ? '已结束' : '进行中'}</span>
      </div>
      <h2>${escapeHtml(item.projectName || '未命名课题')}</h2>
      <div class="module-meta">
        <span>${Number(item.joinGroupNum) || 0} 个小组参与</span>
        <span>截止 ${escapeHtml(formatTime(item.projectEndTime || item.endTime))}</span>
        ${Number(item.showRedDot) === 1 ? '<span class="subject-tag">有新动态</span>' : ''}
      </div>
    </article>`;
  }

  function caseResourceHtml(item) {
    const resources = [item.resourceList || {}, item.answerList || {}];
    const pictures = resources.flatMap((group) => listValue(group.picUrlList)).map((entry) =>
      safeUrl(typeof entry === 'string' ? entry : entry?.fileUrl || entry?.url || entry?.resourceUrl)).filter(Boolean);
    const voices = resources.flatMap((group) => listValue(group.voiceUrlList)).map((entry) =>
      safeUrl(typeof entry === 'string' ? entry : entry?.fileUrl || entry?.url || entry?.resourceUrl)).filter(Boolean);
    const pdfs = resources.flatMap((group) => listValue(group.pdfUrlList)).map((entry) =>
      safeUrl(typeof entry === 'string' ? entry : entry?.fileUrl || entry?.url || entry?.resourceUrl)).filter(Boolean);
    const images = pictures.length ? `<div class="media-grid">${pictures.slice(0, 3).map((url, index) =>
      `<button class="media-thumb" type="button" data-image="${escapeHtml(url)}" aria-label="查看第 ${index + 1} 张图片"><img src="${escapeHtml(url)}" alt="案例图片" loading="lazy"></button>`).join('')}</div>` : '';
    const audio = voices.length ? `<div class="audio-list">${voices.map((url) =>
      `<audio controls preload="none" src="${escapeHtml(url)}"></audio>`).join('')}</div>` : '';
    const documents = pdfs.length ? `<div class="case-documents">${pdfs.map((url, index) =>
      `<button class="secondary-button" type="button" data-resource="${escapeHtml(url)}">查看 PDF${pdfs.length > 1 ? ` ${index + 1}` : ''}</button>`).join('')}</div>` : '';
    return images + audio + documents;
  }

  function caseCardHtml(item) {
    const author = Number(item.isShareAnonymous) === 1
      ? '匿名分享'
      : (item.studentName || item.teacherName || '老师');
    const id = String(item.uuid || item.typicalCaseUuid || '');
    return `<article class="module-card" data-module-detail="case" data-id="${escapeHtml(id)}" data-case-type="${Number(item.caseType) || 1}" tabindex="0">
      <div class="question-head">
        <span class="avatar">案</span>
        <div class="author"><strong>${escapeHtml(author)}</strong><time>${escapeHtml(formatTime(item.creationTime))}</time></div>
        <span class="subject-tag">${escapeHtml(item.subjectName || '未分类')}</span>
      </div>
      <h2>${escapeHtml(item.title || '典型案例')}</h2>
      ${item.content ? `<p>${escapeHtml(item.content)}</p>` : ''}
      ${caseResourceHtml(item)}
      <div class="module-meta"><span>阅读 ${Number(item.readTimes) || 0}</span><span>赞 ${Number(item.praiseNum) || 0}</span>${Number(item.isTop) === 1 ? '<span class="subject-tag">置顶</span>' : ''}</div>
    </article>`;
  }

  function itemHtml(item, index) {
    if (state.module === 'projects') return projectCardHtml(item);
    if (state.module === 'cases') return caseCardHtml(item);
    return cardHtml(item, index);
  }

  function setStatus(message = '', error = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle('error', error);
    elements.status.hidden = !message;
  }

  function openResource(url, title = '学习圈材料', type = '') {
    if (typeof window.msykOpenNativeViewer === 'function'
      && window.msykOpenNativeViewer(url, title, type)) return;
    window.msykAPI.openExternal(url);
  }

  async function checkAccess() {
    try {
      const access = await window.StudyCircleAccess.resolve(window.msykAPI);
      state.access = access;
      document.querySelectorAll('.module-tab').forEach((button) => {
        const allowed = access.allows(button.dataset.module);
        button.disabled = !allowed;
        button.title = allowed ? '' : '学校暂未开通该模块';
      });
      if (['questions', 'projects', 'cases'].some((feature) => access.allows(feature))) {
        document.body.dataset.debugBypass = ['questions', 'projects', 'cases']
          .some((feature) => access.bypasses(feature)) ? 'true' : 'false';
        return true;
      }
      setStatus('学校暂未开通学习圈', true);
    } catch (error) {
      setStatus(error?.message || '无法确认学习圈开通状态', true);
    }
    document.querySelector('.circle-tabs').hidden = true;
    document.querySelector('.filters').hidden = true;
    $('#askBtn').hidden = true;
    return false;
  }

  function saveFilters() {
    try {
      sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
        module: state.module,
        scope: state.scope,
        subjectCode: elements.subject.value,
        endQuestionType: elements.state.value,
        startDate: elements.startDate.value,
        endDate: elements.endDate.value,
      }));
    } catch {}
  }

  function render(append = false) {
    if (!append) elements.grid.innerHTML = '';
    const start = append ? elements.grid.children.length : 0;
    elements.grid.insertAdjacentHTML('beforeend', state.items.slice(start)
      .map((item, index) => itemHtml(item, start + index)).join(''));
    const emptyText = state.module === 'projects' ? '这里还没有课题'
      : state.module === 'cases' ? '这里还没有典型案例' : '这里还没有问题';
    setStatus(state.items.length ? '' : emptyText);
    elements.loadMore.hidden = state.page >= state.pages || !state.items.length;
  }

  function parseList(data) {
    const list = state.module === 'projects'
      ? (data.projectList || data.list || [])
      : state.module === 'cases'
        ? (data.list || data.caseList || [])
        : (data.submitQuestionList || data.list || data.rows || []);
    return {
      list: Array.isArray(list) ? list : [],
      pages: Math.max(1, Number(data.pages || data.totalPage || 1)),
      red: state.module === 'questions' && Number(data.redDto) === 1,
    };
  }

  async function loadQuestions({ append = false } = {}) {
    if (state.loading) return;
    state.loading = true;
    if (!append) setStatus('正在加载...');
    elements.loadMore.disabled = true;
    try {
      const startTime = state.module === 'projects' ? '' : dateTimestamp(elements.startDate.value);
      const endTime = state.module === 'projects' ? '' : dateTimestamp(elements.endDate.value);
      if (startTime && endTime && Number(endTime) < Number(startTime)) {
        throw new Error('结束日期不能早于开始日期');
      }
      let response;
      if (state.module === 'projects') {
        response = await window.msykAPI.studyCircleProjects({
          subjectCode: elements.subject.value,
          projectType: 0,
          sortType: elements.sort.value,
          pageIndex: state.page,
          pageSize: 18,
        });
      } else if (state.module === 'cases') {
        response = await window.msykAPI.studyCircleCases({
          subjectCode: elements.subject.value,
          startTime,
          endTime,
          topType: 0,
          pageIndex: state.page,
          pageSize: 20,
        });
      } else {
        response = await window.msykAPI.studyCircleList({
          scope: state.scope,
          subjectCode: elements.subject.value,
          startTime,
          endTime,
          endQuestionType: state.scope === 'mine' ? elements.state.value : '',
          pageIndex: state.page,
          pageSize: 20,
        });
      }
      const data = responseData(response, state.module === 'questions' ? '加载问题' : '加载学习圈内容');
      const parsed = parseList(data);
      state.pages = parsed.pages;
      state.items = append ? state.items.concat(parsed.list) : parsed.list;
      if (state.module === 'questions' && state.scope === 'mine') elements.mineDot.hidden = !parsed.red;
      render(append);
    } catch (error) {
      if (append) state.page = Math.max(1, state.page - 1);
      if (!append) {
        state.items = [];
        elements.grid.innerHTML = '';
      }
      setStatus(error?.message || '加载失败', true);
    } finally {
      state.loading = false;
      elements.loadMore.disabled = false;
    }
  }

  async function loadSubjects() {
    try {
      const data = responseData(await window.msykAPI.hwSubjects(), '加载科目');
      const list = data.studentSubjectList || data.subjectList || data.list || [];
      state.subjects = (Array.isArray(list) ? list : []).map((item) => ({
        code: String(item.code || item.subjectCode || ''),
        name: String(item.name || item.subjectName || item.code || ''),
        teacherId: String(item.teacherId || item.userId || ''),
        teacherName: String(item.teacherName || ''),
      })).filter((item) => item.code);
      const options = state.subjects.map((item) =>
        `<option value="${escapeHtml(item.code)}">${escapeHtml(item.name)}</option>`).join('');
      elements.subject.innerHTML = `<option value="">全部学科</option>${options}`;
      elements.askSubject.innerHTML = `<option value="">请选择科目</option>${state.subjects.map((item, index) =>
        `<option value="${index + 1}">${escapeHtml(item.name)}${item.teacherName ? ` · ${escapeHtml(item.teacherName)}` : ''}</option>`).join('')}`;
      elements.subject.disabled = false;
      elements.subject.value = state.subjects.some((item) => item.code === savedFilters.subjectCode)
        ? savedFilters.subjectCode
        : '';
    } catch {
      elements.subject.disabled = true;
      elements.askSubject.innerHTML = '<option value="">科目加载失败</option>';
    }
  }

  function selectScope(scope, reload = true) {
    state.scope = scope === 'mine' ? 'mine' : 'square';
    state.page = 1;
    document.querySelectorAll('.circle-tab').forEach((button) => {
      const active = button.dataset.scope === state.scope;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    elements.stateField.hidden = state.scope !== 'mine';
    const url = new URL(location.href);
    url.searchParams.set('tab', state.scope);
    history.replaceState(null, '', url.href);
    saveFilters();
    if (reload) loadQuestions();
  }

  function selectModule(module, reload = true) {
    const feature = ['questions', 'projects', 'cases'].includes(module) ? module : 'questions';
    if (!state.access?.allows(feature)) return;
    state.module = feature;
    state.page = 1;
    state.items = [];
    document.querySelectorAll('.module-tab').forEach((button) => {
      const active = button.dataset.module === feature;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    document.querySelector('.circle-tabs').hidden = feature !== 'questions';
    elements.stateField.hidden = feature !== 'questions' || state.scope !== 'mine';
    elements.sortField.hidden = feature !== 'projects';
    elements.startDateField.hidden = feature === 'projects';
    elements.endDateField.hidden = feature === 'projects';
    $('#askBtn').hidden = feature !== 'questions';
    const url = new URL(location.href);
    url.searchParams.set('module', feature);
    history.replaceState(null, '', url.href);
    saveFilters();
    if (reload) loadQuestions();
  }

  function openDetail(card) {
    const uuid = card?.dataset.uuid;
    if (uuid) location.replace(`./detail.html?uuid=${encodeURIComponent(uuid)}&from=${encodeURIComponent(state.scope)}`);
  }

  async function praise(card, button) {
    const item = state.items[Number(card.dataset.index)];
    if (!item || !card.dataset.uuid || button.disabled) return;
    const wasPraised = Number(item.prais) === 1;
    button.disabled = true;
    try {
      responseData(await window.msykAPI.studyCirclePraise({
        submitQuestionUuId: card.dataset.uuid,
        praiseType: wasPraised ? 0 : 1,
      }), wasPraised ? '取消点赞' : '点赞');
      item.prais = wasPraised ? 0 : 1;
      item.praiseNum = Math.max(0, (Number(item.praiseNum) || 0) + (wasPraised ? -1 : 1));
      button.classList.toggle('active', !wasPraised);
      button.textContent = `赞 ${item.praiseNum}`;
    } catch (error) {
      setStatus(error?.message || '操作失败', true);
    } finally {
      button.disabled = false;
    }
  }

  function showAskDialog() {
    elements.askContent.value = '';
    elements.askSubject.value = '';
    askAttachments.clear();
    elements.askDialog.showModal();
  }

  function closeAskDialog() {
    elements.askDialog.close();
    askAttachments.clear();
  }

  async function submitQuestion(event) {
    event.preventDefault();
    const subject = state.subjects[Number(elements.askSubject.value) - 1];
    if (!subject) {
      elements.askSubject.focus();
      return;
    }
    if (askAttachments.isUploading()) {
      elements.askAttachmentHint.textContent = '请等待附件上传完成';
      return;
    }
    if (askAttachments.hasFailed()) {
      elements.askAttachmentHint.textContent = '请重试或删除上传失败的附件';
      return;
    }
    const attachmentPayload = askAttachments.payload();
    elements.askSubmit.disabled = true;
    try {
      responseData(await window.msykAPI.studyCircleAddQuestion({
        content: elements.askContent.value.trim() || '老师，求解答',
        teacherId: subject.teacherId,
        subjectCode: subject.code,
        ...attachmentPayload,
      }), '发布问题');
      elements.askDialog.close();
      askAttachments.clear();
      selectScope('mine');
    } catch (error) {
      setStatus(error?.message || '发布失败', true);
    } finally {
      elements.askSubmit.disabled = false;
    }
  }

  $('#backBtn').addEventListener('click', () => location.replace('../main/index.html?page=home'));
  $('#refreshBtn').addEventListener('click', () => { state.page = 1; loadQuestions(); });
  $('#askBtn').addEventListener('click', showAskDialog);
  $('#askCloseBtn').addEventListener('click', closeAskDialog);
  $('#askCancelBtn').addEventListener('click', closeAskDialog);
  $('#askImageBtn').addEventListener('click', () => $('#askImageInput').click());
  $('#askAudioBtn').addEventListener('click', () => $('#askAudioInput').click());
  elements.askForm.addEventListener('submit', submitQuestion);
  document.querySelector('.circle-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-scope]');
    if (button && button.dataset.scope !== state.scope) selectScope(button.dataset.scope);
  });
  document.querySelector('.module-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-module]');
    if (button && !button.disabled && button.dataset.module !== state.module) selectModule(button.dataset.module);
  });
  [elements.subject, elements.state, elements.sort, elements.startDate, elements.endDate].forEach((control) => {
    control.addEventListener('change', () => { state.page = 1; saveFilters(); loadQuestions(); });
  });
  elements.loadMore.addEventListener('click', () => {
    if (state.page < state.pages) { state.page += 1; loadQuestions({ append: true }); }
  });
  elements.grid.addEventListener('click', (event) => {
    const image = event.target.closest('[data-image]');
    if (image) {
      event.stopPropagation();
      if (typeof window.msykOpenNativeViewer === 'function'
        && window.msykOpenNativeViewer(image.dataset.image, '学习圈图片', 'image')) return;
      elements.viewerImage.src = image.dataset.image;
      elements.imageViewer.showModal();
      return;
    }
    const resource = event.target.closest('[data-resource]');
    if (resource) {
      event.stopPropagation();
      openResource(resource.dataset.resource, '学习圈材料');
      return;
    }
    if (event.target.closest('audio')) return;
    const moduleCard = event.target.closest('[data-module-detail]');
    if (moduleCard?.dataset.id) {
      const params = new URLSearchParams({ type: moduleCard.dataset.moduleDetail, id: moduleCard.dataset.id });
      if (moduleCard.dataset.caseType) params.set('caseType', moduleCard.dataset.caseType);
      location.href = `./moduleDetail.html?${params}`;
      return;
    }
    const card = event.target.closest('.question-card');
    if (!card) return;
    const action = event.target.closest('[data-action]');
    if (action?.dataset.action === 'praise') {
      event.stopPropagation();
      praise(card, action);
      return;
    }
    openDetail(card);
  });
  elements.grid.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-module-detail]')) {
      event.preventDefault();
      event.target.click();
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.classList.contains('question-card')) {
      event.preventDefault();
      openDetail(event.target);
    }
  });
  $('#imageCloseBtn').addEventListener('click', () => elements.imageViewer.close());
  elements.imageViewer.addEventListener('close', () => { elements.viewerImage.src = ''; });

  async function init() {
    if (!await checkAccess()) return;
    elements.state.value = String(savedFilters.endQuestionType || '');
    elements.startDate.value = String(savedFilters.startDate || '');
    elements.endDate.value = String(savedFilters.endDate || '');
    selectScope(initialScope, false);
    const firstAllowed = [initialModule, 'questions', 'projects', 'cases']
      .find((feature, index, values) => values.indexOf(feature) === index && state.access.allows(feature));
    selectModule(firstAllowed || 'questions', false);
    await loadSubjects();
    await loadQuestions();
  }

  init();
})();
