(function initStudyCircleDetail() {
  'use strict';

  window.Theme?.initTheme();
  const $ = (selector) => document.querySelector(selector);
  const params = new URLSearchParams(location.search);
  const uuid = String(params.get('uuid') || '').trim();
  const from = params.get('from') === 'mine' ? 'mine' : 'square';
  const elements = {
    status: $('#status'), question: $('#question'), discussion: $('#discussion'),
    replyList: $('#replyList'), emptyReplies: $('#emptyReplies'), replyCount: $('#replyCount'),
    replyForm: $('#replyForm'), replyContent: $('#replyContent'), replySubmit: $('#replySubmit'),
    imageViewer: $('#imageViewer'), viewerImage: $('#viewerImage'),
    replyAttachmentHint: $('#replyAttachmentHint'),
    questionActions: $('#questionActions'), publicBtn: $('#publicBtn'), endBtn: $('#endBtn'), deleteBtn: $('#deleteBtn'),
  };
  let question = null;
  const replyAttachments = window.StudyCircleAttachments.create({
    container: $('#replyAttachments'),
    imageInput: $('#replyImageInput'),
    audioInput: $('#replyAudioInput'),
    onChange: ({ count, uploading, failed, message }) => {
      elements.replyAttachmentHint.textContent = message || (uploading
        ? `正在上传 (${count}/9)`
        : failed ? '有附件上传失败' : `附件 ${count}/9`);
    },
  });

  function responseData(response, action, allowPrimitive = false) {
    if (!response || response.code !== 200) throw new Error(response?.msg || `${action}失败`);
    const outer = response.data;
    if (!outer || typeof outer !== 'object') {
      if (allowPrimitive) return outer;
      throw new Error(`${action}响应异常`);
    }
    const code = String(outer.code ?? '10000');
    if (code && code !== '10000') {
      throw new Error(outer.message || outer.msg || `${action}失败 (${code})`);
    }
    return outer.data && typeof outer.data === 'object' ? outer.data : outer;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[char]);
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  function listValue(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string' || !value.trim()) return [];
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }

  function formatTime(value) {
    const number = Number(value);
    const date = new Date(Number.isFinite(number) && number > 0 ? number : value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
  }

  function initials(name) {
    const text = String(name || '同学').trim();
    return escapeHtml(text.slice(-1) || '同');
  }

  function avatarHtml(name, avatarUrl) {
    const avatar = safeUrl(avatarUrl);
    return `<span class="avatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : initials(name)}</span>`;
  }

  function mediaHtml(item) {
    const pictures = listValue(item.picUrlList).map(safeUrl).filter(Boolean);
    const audio = listValue(item.audioUrlList)
      .map((entry) => safeUrl(typeof entry === 'string' ? entry : entry?.url)).filter(Boolean);
    const images = pictures.length ? `<div class="media-grid">${pictures.map((url, index) =>
      `<button class="media-thumb" type="button" data-image="${escapeHtml(url)}" aria-label="查看第 ${index + 1} 张图片"><img src="${escapeHtml(url)}" alt="问题图片" loading="lazy"></button>`).join('')}</div>` : '';
    const audios = audio.length ? `<div class="audio-list">${audio.map((url) =>
      `<audio controls preload="none" src="${escapeHtml(url)}"></audio>`).join('')}</div>` : '';
    return images + audios;
  }

  function renderQuestion() {
    const name = String(question.studentName || question.realName || '同学');
    const ended = Number(question.endQuestionType) === 2;
    elements.question.innerHTML = `
      <div class="question-head">
        ${avatarHtml(name, question.avatarUrl)}
        <div class="author"><strong>${escapeHtml(name)}</strong><time>${escapeHtml(formatTime(question.creationTime))}</time></div>
        <span class="subject-tag">${escapeHtml(question.subjectName || '未分类')}</span>
      </div>
      <div class="question-content">${escapeHtml(question.questionDescribe || question.content || '')}</div>
      ${question.fromDescribe ? `<div class="source">来自：${escapeHtml(question.fromDescribe)}</div>` : ''}
      ${mediaHtml(question)}
      <div class="detail-badges"><span class="state-tag${ended ? ' ended' : ''}">${ended ? '已结束' : '进行中'}</span>${Number(question.isPublic) === 1 ? '<span class="state-tag">公开问题</span>' : ''}</div>`;
    elements.question.hidden = false;
    elements.replyForm.hidden = ended;
    elements.questionActions.hidden = from !== 'mine';
    elements.publicBtn.textContent = Number(question.isPublic) === 1 ? '取消公开' : '公开问题';
    elements.endBtn.hidden = ended;
  }

  function replyHtml(item) {
    const teacher = Number(item.ownerType) === 2;
    const name = String(item.realName || (teacher ? '老师' : '同学'));
    return `<article class="reply-item${teacher ? ' teacher' : ''}">
      ${avatarHtml(name, item.avatarUrl)}
      <div class="reply-body">
        <div class="reply-meta"><strong>${escapeHtml(name)}<span class="role-tag">${teacher ? '老师' : '学生'}</span></strong><time>${escapeHtml(formatTime(item.creationTime))}</time></div>
        <div class="reply-content">${escapeHtml(item.chatContent || item.content || '')}</div>
        ${mediaHtml(item)}
      </div>
    </article>`;
  }

  function renderChat(data) {
    const list = data.chattingRecordsList || data.list || [];
    const replies = Array.isArray(list) ? list : [];
    elements.replyList.innerHTML = replies.map(replyHtml).join('');
    elements.replyCount.textContent = `${Number(data.chattingRecordsNum) || replies.length} 条回复`;
    elements.emptyReplies.hidden = replies.length > 0;
    elements.discussion.hidden = false;
  }

  function setStatus(message = '', error = false) {
    elements.status.textContent = message;
    elements.status.classList.toggle('error', error);
    elements.status.hidden = !message;
  }

  async function loadQuestion() {
    const data = responseData(await window.msykAPI.studyCircleDetail({ submitQuestionUuId: uuid }), '加载问题详情');
    question = data.submitQuestionDto || data.question || data;
    renderQuestion();
  }

  async function loadChat() {
    const data = responseData(await window.msykAPI.studyCircleChat({ submitQuestionUuId: uuid }), '加载问题回复');
    renderChat(data);
  }

  async function loadAll() {
    if (!uuid) {
      setStatus('问题标识无效', true);
      return;
    }
    setStatus('正在加载...');
    try {
      await Promise.all([loadQuestion(), loadChat()]);
      setStatus('');
    } catch (error) {
      setStatus(error?.message || '加载失败', true);
    }
  }

  async function submitReply(event) {
    event.preventDefault();
    const content = elements.replyContent.value.trim();
    if (replyAttachments.isUploading()) {
      elements.replyAttachmentHint.textContent = '请等待附件上传完成';
      return;
    }
    if (replyAttachments.hasFailed()) {
      elements.replyAttachmentHint.textContent = '请重试或删除上传失败的附件';
      return;
    }
    const attachmentPayload = replyAttachments.payload();
    if (!content && !attachmentPayload.picUrls.length && !attachmentPayload.audioList.length) return;
    elements.replySubmit.disabled = true;
    try {
      responseData(await window.msykAPI.studyCircleAddReply({
        submitQuestionUuId: uuid,
        content,
        ...attachmentPayload,
      }), '发送回复');
      elements.replyContent.value = '';
      replyAttachments.clear();
      await loadChat();
      elements.replyList.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      setStatus(error?.message || '发送失败', true);
    } finally {
      elements.replySubmit.disabled = false;
    }
  }

  async function operate(action, confirmText, done) {
    if (!question || !confirm(confirmText)) return;
    elements.questionActions.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    try {
      responseData(await action(), '操作', true);
      await done();
    } catch (error) {
      setStatus(error?.message || '操作失败', true);
    } finally {
      elements.questionActions.querySelectorAll('button').forEach((button) => { button.disabled = false; });
    }
  }

  $('#backBtn').addEventListener('click', () => location.replace(`./index.html?tab=${encodeURIComponent(from)}`));
  $('#refreshBtn').addEventListener('click', loadAll);
  $('#replyImageBtn').addEventListener('click', () => $('#replyImageInput').click());
  $('#replyAudioBtn').addEventListener('click', () => $('#replyAudioInput').click());
  elements.replyForm.addEventListener('submit', submitReply);
  elements.publicBtn.addEventListener('click', () => operate(
    () => window.msykAPI.studyCircleSetPublic({ submitQuestionUuId: uuid, isPublic: Number(question.isPublic) === 1 ? 0 : 1 }),
    Number(question?.isPublic) === 1 ? '确认取消公开这个问题？' : '确认将这个问题公开到问题广场？',
    loadQuestion,
  ));
  elements.endBtn.addEventListener('click', () => operate(
    () => window.msykAPI.studyCircleEnd({ submitQuestionUuId: uuid }), '结束后将不能继续回复，确认结束？', loadAll,
  ));
  elements.deleteBtn.addEventListener('click', () => operate(
    () => window.msykAPI.studyCircleDelete({ submitQuestionUuId: uuid }), '删除后无法恢复，确认删除？',
    async () => location.replace('./index.html?tab=mine'),
  ));
  document.body.addEventListener('click', (event) => {
    const image = event.target.closest('[data-image]');
    if (!image) return;
    if (typeof window.msykOpenNativeViewer === 'function'
      && window.msykOpenNativeViewer(image.dataset.image, '问题图片', 'image')) return;
    elements.viewerImage.src = image.dataset.image;
    elements.imageViewer.showModal();
  });
  $('#imageCloseBtn').addEventListener('click', () => elements.imageViewer.close());
  elements.imageViewer.addEventListener('close', () => { elements.viewerImage.src = ''; });

  async function init() {
    try {
      const access = await window.StudyCircleAccess.resolve(window.msykAPI);
      if (!access.allows('questions')) {
        setStatus('学校暂未开通学习圈', true);
        return;
      }
      document.body.dataset.debugBypass = access.bypasses('questions') ? 'true' : 'false';
      await loadAll();
    } catch (error) {
      setStatus(error?.message || '无法确认学习圈开通状态', true);
    }
  }

  init();
})();
