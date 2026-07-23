(() => {
  'use strict';
  const params = new URLSearchParams(location.search);
  const type = params.get('type') === 'project' ? 'project' : 'case';
  const id = params.get('id') || '';
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  const list = (value) => Array.isArray(value) ? value : [];
  const dataOf = (response, label) => {
    if (!response || Number(response.code) !== 200) throw new Error(response?.msg || `${label}失败`);
    return response.data ?? {};
  };
  const urlOf = (entry) => String(typeof entry === 'string' ? entry : entry?.fileUrl || entry?.resourceUrl || entry?.url || '').trim();
  const safeUrl = (value) => /^https:\/\//i.test(String(value || '').trim()) ? String(value).trim() : '';
  const time = (value) => { const date = new Date(Number(value) || value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { hour12: false }); };
  let detail = null;
  let activeGroup = null;
  let resultSummary = null;
  const resultAttachments = window.StudyCircleAttachments.create({
    container: $('#resultAttachments'), imageInput: $('#resultImageInput'), audioInput: $('#resultAudioInput'),
    onChange: ({ message }) => { if (message) setStatus(message, true); },
  });

  function setStatus(message = '', error = false) {
    $('#status').textContent = message;
    $('#status').classList.toggle('error', error);
    $('#status').hidden = !message;
  }

  function mediaHtml(value) {
    const resource = value.resourceList || {};
    const answer = value.answerList || {};
    const images = [...list(resource.picUrlList), ...list(answer.picUrlList), ...list(value.picUrlList)].map(urlOf).map(safeUrl).filter(Boolean);
    const audio = [...list(resource.voiceUrlList), ...list(answer.audioUrlList)].map(urlOf).map(safeUrl).filter(Boolean);
    const docs = [...list(resource.pdfUrlList), ...list(value.pdfList), ...list(value.pptList)].map((entry) => ({ url: safeUrl(urlOf(entry)), name: entry?.fileName || '查看材料' })).filter((entry) => entry.url);
    return `${images.length ? `<div class="detail-images">${images.map((url, index) => `<button type="button" data-image="${esc(url)}" aria-label="查看第 ${index + 1} 张图片"><img src="${esc(url)}" alt="材料图片" loading="lazy"></button>`).join('')}</div>` : ''}
      ${audio.length ? `<div class="resource-list">${audio.map((url) => `<audio controls preload="none" src="${esc(url)}"></audio>`).join('')}</div>` : ''}
      ${docs.length ? `<div class="resource-list">${docs.map((entry) => `<button class="secondary-button" type="button" data-resource="${esc(entry.url)}">${esc(entry.name)}</button>`).join('')}</div>` : ''}`;
  }

  async function loadCase() {
    detail = dataOf(await window.msykAPI.studyCircleCaseDetail({ uuid: id, caseType: params.get('caseType') || 1 }), '加载案例');
    $('#pageTitle').textContent = '典型案例';
    $('#detail').innerHTML = `<div class="detail-meta"><span>${esc(detail.subjectName || '未分类')}</span><span>${esc(detail.teacherName || detail.studentName || '')}</span><span>${esc(time(detail.creationTime))}</span></div>
      <h2>${esc(detail.title || '典型案例')}</h2><p>${esc(detail.content || '')}</p>${mediaHtml(detail)}
      <div class="detail-meta"><span>阅读 ${Number(detail.readTimes) || 0}</span><span>赞 ${Number(detail.praiseNum) || 0}</span></div>
      <button class="secondary-button case-praise${Number(detail.isPraise) === 1 ? ' active' : ''}" id="casePraiseBtn" type="button">${Number(detail.isPraise) === 1 ? '已赞' : '点赞'} ${Number(detail.praiseNum) || 0}</button>`;
    $('#detail').hidden = false;
    $('#casePraiseBtn').addEventListener('click', praiseCase);
  }

  async function praiseCase() {
    const button = $('#casePraiseBtn');
    button.disabled = true;
    try {
      const next = Number(detail.isPraise) === 1 ? 0 : 1;
      dataOf(await window.msykAPI.studyCircleCasePraise({ uuid: id, isPraise: next }), '案例点赞');
      await loadCase();
    } catch (error) { setStatus(error.message, true); } finally { button.disabled = false; }
  }

  function renderGroups() {
    const groups = list(detail.groupVoList).filter((group) => Number(group.isMyGroup) === 1 || Number(group.publicType) === 1);
    $('#groupList').innerHTML = groups.length ? groups.map((group) => `<button class="group-button" type="button" data-group="${esc(group.groupUuId)}"><strong>${esc(group.groupName || '研究小组')}</strong><small>${esc(group.studentNames || `${Number(group.studentNum) || 0} 名成员`)}</small></button>`).join('') : '<p class="empty-state">暂无可查看的小组</p>';
    $('#groupSection').hidden = false;
    const mine = groups.find((group) => Number(group.isMyGroup) === 1);
    if (mine) selectGroup(mine);
  }

  async function loadProject() {
    detail = dataOf(await window.msykAPI.studyCircleProjectDetail({ projectUuId: id }), '加载课题');
    $('#pageTitle').textContent = '项目化学习';
    $('#detail').innerHTML = `<div class="detail-meta"><span>${esc(detail.subjectName || '未分类')}</span><span>${esc(detail.teacherName || '')}</span><span>截止 ${esc(time(detail.projectEndTime || detail.endTime))}</span></div><h2>${esc(detail.projectName || '未命名课题')}</h2><p>${esc(detail.content || '')}</p>${mediaHtml(detail)}`;
    $('#detail').hidden = false;
    renderGroups();
    $('#summaryBtn').hidden = !detail.summarizeUuId;
  }

  async function selectGroup(group) {
    activeGroup = group;
    document.querySelectorAll('[data-group]').forEach((button) => button.classList.toggle('active', button.dataset.group === group.groupUuId));
    $('#chatTitle').textContent = `${group.groupName || '小组'}讨论`;
    $('#chatSection').hidden = false;
    const ended = Number(detail.projectEndTime || detail.endTime) > 0 && Number(detail.projectEndTime || detail.endTime) < Date.now();
    const canUploadResult = Number(group.isMyGroup) === 1 && Number(group.groupLeader) === 1 && !ended;
    const canViewResult = Number(group.submitType) === 1;
    $('#resultBtn').hidden = !canUploadResult && !canViewResult;
    $('#resultBtn').textContent = canViewResult ? '查看成果' : '上传成果';
    const writable = Number(group.isMyGroup) === 1 && Number(group.speechState) === 0 && !ended;
    $('#chatForm').hidden = !writable;
    try {
      const data = dataOf(await window.msykAPI.studyCircleProjectChat({ projectUuId: id, groupUuId: group.groupUuId }), '加载小组讨论');
      group.allowedToDiscuss = data.allowedToDiscuss;
      group.speechState = data.speechState;
      const messages = list(data.chitChatListVoList || data.list);
      $('#chatList').innerHTML = messages.length ? messages.map((item) => `<article class="chat-message${Number(item.isMyInfo) === 1 ? ' mine' : ''}"><strong>${esc(item.studentName || (Number(item.ownerType) === 2 ? '老师' : '同学'))}</strong><time>${esc(time(item.submitTime))}</time><p>${esc(item.content || '')}</p>${item.resourceUrl ? `<button class="secondary-button" data-resource="${esc(safeUrl(item.resourceUrl))}" type="button">查看附件</button>` : ''}</article>`).join('') : '<p class="empty-state">还没有讨论内容</p>';
      $('#chatForm').hidden = !(Number(group.isMyGroup) === 1 && Number(group.speechState) === 0 && !ended);
    } catch (error) { setStatus(error.message, true); }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const content = $('#chatInput').value.trim();
    if (!content || !activeGroup) return;
    $('#sendBtn').disabled = true;
    try {
      dataOf(await window.msykAPI.studyCircleProjectSend({ projectUuId: id, groupUuId: activeGroup.groupUuId, content }), '发送消息');
      $('#chatInput').value = '';
      await selectGroup(activeGroup);
    } catch (error) { setStatus(error.message, true); } finally { $('#sendBtn').disabled = false; }
  }

  async function showSummary() {
    try {
      const data = dataOf(await window.msykAPI.studyCircleProjectSummary({ projectUuId: id }), '加载项目总结');
      const summary = data.summarizeVo || data;
      $('#summarySection').innerHTML = `<h2>项目总结</h2><div class="detail-meta"><span>${esc(summary.groupName || '')}</span><span>${esc(time(summary.submitTime))}</span></div><p class="summary-content">${esc(summary.content || '暂无总结内容')}</p>${mediaHtml({ picUrlList: summary.picUrlList, pdfList: summary.pdfUrlList, pptList: summary.pptUrlList })}`;
      $('#summarySection').hidden = false;
      $('#summarySection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) { setStatus(error.message, true); }
  }

  async function openResultEditor() {
    if (!activeGroup) return;
    try {
      const data = dataOf(await window.msykAPI.studyCircleProjectSummary({ projectUuId: id, groupUuId: activeGroup.groupUuId }), '加载小组成果');
      resultSummary = data.summarizeVo || {};
      const ended = Number(detail.projectEndTime || detail.endTime) > 0 && Number(detail.projectEndTime || detail.endTime) < Date.now();
      const editable = Number(activeGroup.isMyGroup) === 1 && Number(activeGroup.groupLeader) === 1 && !ended;
      if (!editable) {
        $('#summarySection').innerHTML = `<h2>${esc(activeGroup.groupName || '小组')}成果</h2><div class="detail-meta"><span>${esc(time(resultSummary.submitTime))}</span></div><p class="summary-content">${esc(resultSummary.content || '暂无成果说明')}</p>${mediaHtml({ picUrlList: resultSummary.picUrlList, pdfList: resultSummary.pdfUrlList, pptList: resultSummary.pptUrlList })}`;
        $('#summarySection').hidden = false;
        $('#summarySection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const state = dataOf(await window.msykAPI.studyCircleProjectState({ projectUuId: id, groupUuId: activeGroup.groupUuId }), '校验小组状态');
      if (state.checkedCode && String(state.checkedCode) !== '10000') throw new Error('该项目已被老师修改，请刷新后重试');
      if (Number(state.isGroupLeader) !== 1) throw new Error('仅组长可以上传小组成果');
      $('#resultContent').value = resultSummary.content || '';
      const images = list(resultSummary.picUrlList).map(urlOf).map(safeUrl).filter(Boolean);
      $('#existingResultImages').innerHTML = images.map((url) => `<img src="${esc(url)}" alt="已上传成果图片">`).join('');
      resultAttachments.clear();
      $('#resultDialog').showModal();
    } catch (error) { setStatus(error.message, true); }
  }

  async function saveResult(submitType) {
    if (!activeGroup || resultAttachments.isUploading()) { setStatus('图片仍在上传，请稍后', true); return; }
    if (resultAttachments.hasFailed()) { setStatus('有图片上传失败，请重试或删除', true); return; }
    const existing = list(resultSummary?.picUrlList).map((entry) => ({
      fileName: entry?.fileName || '成果图片', fileUrl: urlOf(entry), resourceSize: Number(entry?.resourceSize || entry?.size) || 0,
      resourceType: 2, resourceUuId: entry?.resourceUuId || '', sourceFileUrl: entry?.sourceFileUrl || '', statu: 3, state: 3,
    })).filter((entry) => entry.fileUrl);
    const added = resultAttachments.payload().picUrls.map((url, index) => ({
      fileName: `成果图片${index + 1}.jpg`, fileUrl: url, resourceSize: 0, resourceType: 2,
      resourceUuId: '', sourceFileUrl: '', statu: 3, state: 3,
    }));
    const state = dataOf(await window.msykAPI.studyCircleProjectState({ projectUuId: id, groupUuId: activeGroup.groupUuId }), '校验小组状态');
    if (state.checkedCode && String(state.checkedCode) !== '10000') throw new Error('该项目已被老师修改，请刷新后重试');
    if (Number(state.isGroupLeader) !== 1) throw new Error('仅组长可以上传小组成果');
    dataOf(await window.msykAPI.studyCircleProjectResultSave({
      projectUuId: id, groupUuId: activeGroup.groupUuId, summarizeUuId: resultSummary?.summarizeUuId || '',
      content: $('#resultContent').value, resources: [...existing, ...added], submitType,
    }), submitType === 1 ? '上传成果' : '保存草稿');
    $('#resultDialog').close();
    setStatus(submitType === 1 ? '小组成果已上传' : '草稿已保存');
    await loadProject();
  }

  document.addEventListener('click', (event) => {
    const image = event.target.closest('[data-image]');
    if (image) {
      if (typeof window.msykOpenNativeViewer === 'function'
        && window.msykOpenNativeViewer(image.dataset.image, '学习圈图片', 'image')) return;
      $('#viewerImage').src = image.dataset.image;
      $('#imageViewer').showModal();
      return;
    }
    const resource = event.target.closest('[data-resource]');
    if (resource?.dataset.resource) {
      if (!(typeof window.msykOpenNativeViewer === 'function'
        && window.msykOpenNativeViewer(resource.dataset.resource, '学习圈材料'))) {
        window.msykAPI.openExternal(resource.dataset.resource);
      }
    }
    const groupButton = event.target.closest('[data-group]');
    if (groupButton) selectGroup(list(detail.groupVoList).find((group) => group.groupUuId === groupButton.dataset.group));
  });
  $('#backBtn').addEventListener('click', () => history.length > 1 ? history.back() : location.replace('./index.html'));
  $('#refreshBtn').addEventListener('click', () => init());
  $('#imageCloseBtn').addEventListener('click', () => $('#imageViewer').close());
  $('#chatForm').addEventListener('submit', sendMessage);
  $('#summaryBtn').addEventListener('click', showSummary);
  $('#resultBtn').addEventListener('click', openResultEditor);
  $('#resultImageBtn').addEventListener('click', () => $('#resultImageInput').click());
  $('#resultCloseBtn').addEventListener('click', () => $('#resultDialog').close());
  $('#resultDraftBtn').addEventListener('click', async () => { try { await saveResult(0); } catch (error) { setStatus(error.message, true); } });
  $('#resultForm').addEventListener('submit', async (event) => { event.preventDefault(); try { await saveResult(1); } catch (error) { setStatus(error.message, true); } });

  async function init() {
    if (!id) { setStatus('详情参数不完整', true); return; }
    setStatus('正在加载...');
    $('#detail').hidden = true;
    try {
      const access = await window.StudyCircleAccess.resolve(window.msykAPI);
      const feature = type === 'project' ? 'projects' : 'cases';
      if (!access.allows(feature)) throw new Error('学校暂未开通该模块');
      document.body.dataset.debugBypass = String(access.bypasses(feature));
      if (type === 'project') await loadProject(); else await loadCase();
      setStatus();
    }
    catch (error) { setStatus(error.message || '加载失败', true); }
  }
  init();
})();
