window.Theme?.initTheme();
const $ = (s) => document.querySelector(s);

const QT = { DANXUAN: 1, DUOXUAN: 2, ZHUGUAN: 3, TIANKONG: 4, PANDUAN: 5, GAICUO: 6 };

function qs() { const p = new URLSearchParams(location.search); return Object.fromEntries(p.entries()); }
function toWpStatic(u) { if (!u) return ''; if (/^https?:\/\//i.test(u)) return u; return 'https://msyk.wpstatic.cn/' + String(u).replace(/^\/+/, ''); }
function fmtSec(sec) { sec = Math.max(0, Number(sec || 0)); const m = String(Math.floor(sec / 60)).padStart(2, '0'); const s = String(sec % 60).padStart(2, '0'); return m + ':' + s; }
function toast(msg) { const el = $('#toast'); el.textContent = String(msg || ''); el.style.display = 'block'; clearTimeout(toast._t); toast._t = setTimeout(() => el.style.display = 'none', 1800); }

$('#backBtn')?.addEventListener('click', () => { if (history.length > 1) history.back(); else location.href = '../homework/index.html'; });

const ctx = { homeworkId: 0, modifyNum: 0, studentId: '', unitId: '', info: null, currentQIndex: 0, answersMap: {}, dirtyFlag: {}, timerSec: 0 };
function getCards() { const d = ctx.info || {}; return d.homeworkCardList || d.dtkExercises || []; }
function cardFields(q, idx) {
  const sn = q.serialNumber || q.orderNum || q.questionNum || (idx + 1), qt = Number(q.questionType ?? 0);
  let options = null; try { if (typeof q.options === 'string') options = JSON.parse(q.options); else if (Array.isArray(q.options)) options = q.options; } catch {}
  const homeworkResourceId = q.homeworkResourceId ?? q.resourceId ?? q.id ?? q.homeworkCardId ?? 0;
  const questionId = q.questionId || q.resId || q.questionResId || '';
  const existingAnswer = q.answer ?? q.studentAnswer ?? q.answerStr ?? '';
  return {
    serialNumber: sn,
    score: q.score ?? '',
    questionType: qt,
    answerUrl: q.pictureUrl || q.studentAnswer || '',
    resourceId: homeworkResourceId,
    questionId,
    quesNum: q.quesNum || q.quesNums || q.quesMaxNum || sn,
    existingAnswer,
    options,
    orderNum: q.orderNum || sn,
    homeworkResourceId,
  };
}
function isObjective(qt) { return qt === QT.DANXUAN || qt === QT.DUOXUAN || qt === QT.TIANKONG || qt === QT.PANDUAN; }
function isImageType(qt) { return qt === QT.ZHUGUAN || qt === QT.GAICUO; }

function navigateTo(i) { const c = getCards(); if (!c.length) return; ctx.currentQIndex = Math.max(0, Math.min(c.length - 1, i)); renderQuestions(); }
function updateNavButtons() { const c = getCards(); const p = $('#prevQBtn'), n = $('#nextQBtn'); if (p) p.disabled = ctx.currentQIndex <= 0; if (n) n.disabled = ctx.currentQIndex >= c.length - 1; }
function updateIndicator() { const c = getCards(), el = $('#qIndicator'); if (el) el.textContent = c.length ? '第 ' + (ctx.currentQIndex + 1) + ' / ' + c.length + ' 题' : '无题目'; }

function getAnswer(sn) { return ctx.answersMap[sn] ?? ''; }
function setAnswer(sn, val) { if (String(ctx.answersMap[sn] || '') !== String(val)) { ctx.answersMap[sn] = val; ctx.dirtyFlag[sn] = true; } }

function isBitmap(s) { return /^[01]{4,}$/.test(s); }
function encodeMultiChoice(letters) { if (isBitmap(letters)) return letters; const arr = new Array(10).fill('0'); for (const ch of String(letters || '')) { const i = ch.toUpperCase().charCodeAt(0) - 65; if (i >= 0 && i < 10) arr[i] = '1'; } return arr.join(''); }
function encodeFillBlank(v) { const s = String(v || ''); if (/^\[/.test(s)) return s; return '["' + s.replace(/"/g, '\\"') + '"]'; }

async function saveAllAnswers() {
  const cards = getCards(), serials = [], answers = [];
  for (let i = 0; i < cards.length; i++) {
    const f = cardFields(cards[i], i); if (!isObjective(f.questionType)) continue;
    const ans = getAnswer(f.serialNumber); if (!ans && !f.existingAnswer) continue;
    const raw = String(ans || f.existingAnswer || '');
    let encoded = raw;
    if (f.questionType === QT.DUOXUAN) encoded = encodeMultiChoice(raw);
    else if (f.questionType === QT.TIANKONG) encoded = encodeFillBlank(raw);
    serials.push(String(f.serialNumber)); answers.push(encoded);
  }
  if (!serials.length) return true;
  const resp = await window.electronAPI.saveCardAnswerObjectives({ homeworkId: String(ctx.homeworkId), studentId: String(ctx.studentId), serialNumbers: serials.join(';'), answers: answers.join(';'), modifyNum: String(ctx.modifyNum), unitId: String(ctx.unitId) });
  if (!resp || resp.code !== 200) { alert('请求失败: ' + (resp?.msg || '无响应')); return false; }
  const raw = resp.raw || ''; if (raw && !raw.includes('"code":"10000"')) { alert('保存失败: ' + raw.slice(0, 100)); return false; }
  Object.keys(ctx.dirtyFlag).forEach(k => ctx.dirtyFlag[k] = false); return true;
}

function renderObjInput(q, f) {
  const sn = f.serialNumber, existing = getAnswer(sn) || f.existingAnswer || '', qt = f.questionType, esc = (s) => { const el = document.createElement('span'); el.textContent = s; return el.innerHTML; };
  if (qt === QT.DANXUAN) { const ls = f.options || ['A', 'B', 'C', 'D']; return '<div class="optGroup" data-sn="' + sn + '">' + ls.map((_, i) => { const lt = String.fromCharCode(65 + i); return '<label class="optLabel"><input type="radio" name="q_' + sn + '" value="' + lt + '"' + (existing === lt ? ' checked' : '') + '><span class="optBadge">' + lt + '</span></label>'; }).join('') + '</div>'; }
  if (qt === QT.DUOXUAN) {
    let checkedLetters = '';
    if (isBitmap(existing)) { for (let i = 0; i < existing.length && i < 10; i++) { if (existing[i] === '1') checkedLetters += String.fromCharCode(65 + i); } } else { checkedLetters = existing || ''; }
    const ss = new Set(checkedLetters.split('')), ls = f.options || ['A', 'B', 'C', 'D'];
    return '<div class="optGroup" data-sn="' + sn + '">' + ls.map((_, i) => { const lt = String.fromCharCode(65 + i); return '<label class="optLabel"><input type="checkbox" name="q_' + sn + '" value="' + lt + '"' + (ss.has(lt) ? ' checked' : '') + '><span class="optBadge">' + lt + '</span></label>'; }).join('') + '</div>';
  }
  if (qt === QT.TIANKONG) { let dv = existing; try { const p = JSON.parse(existing); if (Array.isArray(p) && p.length > 0) dv = String(p[0]); } catch {} return '<div class="tiankongRow" data-sn="' + sn + '"><input type="text" class="tkInput" placeholder="请输入答案" value="' + esc(dv) + '" data-sn="' + sn + '"></div>'; }
  if (qt === QT.PANDUAN) return '<div class="optGroup" data-sn="' + sn + '"><label class="optLabel"><input type="radio" name="q_' + sn + '" value="对"' + (existing === '对' || existing === 'true' ? ' checked' : '') + '><span class="optBadge">✓</span></label><label class="optLabel"><input type="radio" name="q_' + sn + '" value="错"' + (existing === '错' || existing === 'false' ? ' checked' : '') + '><span class="optBadge">✗</span></label></div>';
  return '';
}

function renderQuestions() {
  const list = $('#qList'), cards = getCards(); if (!cards.length) { list.innerHTML = '<div class="empty">没有题目</div>'; updateIndicator(); updateNavButtons(); return; }
  list.innerHTML = cards.map((q, idx) => {
    const f = cardFields(q, idx), isActive = idx === ctx.currentQIndex, qt = f.questionType, sn = f.serialNumber, tn = { 1: '单选题', 2: '多选题', 3: '主观题', 4: '填空题', 5: '判断题', 6: '改错题' }[qt] || ('题型' + qt);
    let body = '';
    if (isObjective(qt)) body = renderObjInput(q, f);
    else if (isImageType(qt)) body = '<div class="qAnsRow"><button class="btn" data-act="upload" data-idx="' + idx + '">上传图片</button><button class="btn" data-act="clear" data-idx="' + idx + '">清空</button></div>' + (f.answerUrl ? '<img class="thumb" src="' + f.answerUrl + '" alt="answer" />' : '<div class="qMeta">当前未上传图片</div>');
    else body = '<div class="qAnsRow"><button class="btn" data-act="upload" data-idx="' + idx + '">上传图片</button></div>';
    const dm = ctx.dirtyFlag[sn] ? ' <span class="dirtyMark">*</span>' : '';
    return '<div class="qCard' + (isActive ? ' active' : '') + '" data-idx="' + idx + '"><div class="qTop"><div><div class="qName">第 ' + sn + ' 题 <span class="qTypeBadge">' + tn + '</span>' + dm + '</div><div class="qMeta">score=' + f.score + '</div></div><div class="qMeta">ID: ' + (f.resourceId || '-') + '</div></div><div class="qBody">' + body + '</div></div>';
  }).join('');
  list.querySelectorAll('.qCard').forEach(c => c.addEventListener('click', e => { if (!e.target.closest('button,input,label')) navigateTo(Number(c.dataset.idx)); }));
  list.querySelectorAll('button[data-act="upload"]').forEach(b => b.addEventListener('click', () => { ctx._uploadTarget = Number(b.dataset.idx); $('#fileInput').value = ''; $('#fileInput').click(); }));
  list.querySelectorAll('button[data-act="clear"]').forEach(b => b.addEventListener('click', () => { const q = cards[Number(b.dataset.idx)]; if (q) { q.studentAnswer = ''; q.pictureUrl = ''; toast('已清空'); renderQuestions(); } }));
  list.querySelectorAll('.optGroup input[type="radio"]').forEach(r => r.addEventListener('change', () => { const g = r.closest('.optGroup'); setAnswer(g.dataset.sn, r.value); refreshDirtyMark(g.dataset.sn); }));
  list.querySelectorAll('.optGroup input[type="checkbox"]').forEach(cb => cb.addEventListener('change', () => { const g = cb.closest('.optGroup'); const v = Array.from(g.querySelectorAll('input[type="checkbox"]:checked')).map(c => c.dataset.letter || c.value).sort().join(''); setAnswer(g.dataset.sn, v); refreshDirtyMark(g.dataset.sn); }));
  list.querySelectorAll('.tkInput').forEach(inp => inp.addEventListener('input', () => { setAnswer(inp.dataset.sn, inp.value); refreshDirtyMark(inp.dataset.sn); }));
  const ac = list.querySelector('.qCard.active'); if (ac) ac.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  updateIndicator(); updateNavButtons();
}
function refreshDirtyMark(sn) {
  const card = document.querySelector('.optGroup[data-sn="' + sn + '"]')?.closest('.qCard') || document.querySelector('.tiankongRow[data-sn="' + sn + '"]')?.closest('.qCard');
  if (!card) return; const m = card.querySelector('.dirtyMark');
  if (ctx.dirtyFlag[sn]) { if (!m) { const n = card.querySelector('.qName'); if (n) n.insertAdjacentHTML('beforeend', ' <span class="dirtyMark">*</span>'); } } else { if (m) m.remove(); }
}

async function refreshTime() {
  const t = await window.electronAPI.getHomeworkTime({ homeworkId: ctx.homeworkId, studentId: ctx.studentId, unitId: ctx.unitId });
  if (t && t.code === 200) { const hs = t.data?.homeworkStatu || t.data?.homeworkStatus || t.data; const sec = Number(hs?.answerTime || 0); if (sec > 0) ctx.timerSec = sec; }
  if (ctx.timerSec === 0 && ctx.info) ctx.timerSec = Math.floor((Date.now() - (ctx.info.stuStartTime || Date.now())) / 1000);
  if (ctx.timerSec < 0) ctx.timerSec = 0; $('#timer').textContent = fmtSec(ctx.timerSec);
}

async function boot() {
  const q = qs(); ctx.homeworkId = Number(q.homeworkId || 0); ctx.modifyNum = Number(q.modifyNum || 0);
  if (!ctx.homeworkId) { alert('缺少 homeworkId'); return; }
  const s = await window.electronAPI.apiGetSession(); const ss = s?.data || s || {}; ctx.studentId = ss.studentId || ''; ctx.unitId = ss.unitId || '';
  if (!ctx.studentId || !ctx.unitId) { alert('缺少 studentId/unitId'); return; }
  const ck = await window.electronAPI.checkHomeworkEndTime({ homeworkId: ctx.homeworkId, unitId: ctx.unitId }); if (!ck || ck.code !== 200) { alert(ck?.msg || 'checkHomeworkEndTime 失败'); return; }
  const info = await window.electronAPI.getHomeworkCardInfo({ homeworkId: ctx.homeworkId, studentId: ctx.studentId, modifyNum: ctx.modifyNum, unitId: ctx.unitId }); if (!info || info.code !== 200) { alert(info?.msg || 'getHomeworkCardInfo 失败'); return; }
  ctx.info = info.data || {}; $('#title').textContent = ctx.info.homeworkName || '做作业';
  const rel = (ctx.info.materialRelas || ctx.info.dtkMaterialInfoList || [])[0]; const pdfUrl = toWpStatic(rel?.resourceUrl || rel?.url);
  if (pdfUrl) { $('#pdfEmpty').style.display = 'none'; $('#pdfWv').style.display = 'block'; $('#pdfWv').src = pdfUrl; } else { $('#pdfWv').style.display = 'none'; $('#pdfEmpty').style.display = 'block'; }
  renderQuestions(); refreshTime(); setInterval(() => { ctx.timerSec++; $('#timer').textContent = fmtSec(ctx.timerSec); }, 1000);
}

$('#fileInput')?.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0]; if (!file) return;
  const idx = Number(ctx._uploadTarget), cards = getCards(), q = cards[idx]; if (!q) return;
  const f = cardFields(q, idx);
  if (!f.resourceId) { alert('缺少 resourceId'); return; }

  toast('上传中...');
  const reader = new FileReader();
  const dataUrl = await new Promise((res, rej) => { reader.onload = () => res(reader.result); reader.onerror = rej; reader.readAsDataURL(file); });
  const pureBase64 = String(dataUrl || '').replace(/^data:image\/\w+;base64,/, '');

  const result = await window.electronAPI.uploadSubjectPic({
    base64: pureBase64,
    ext: (file.name.match(/\.(\w+)$/) || [, 'jpg'])[1],
    contentType: file.type || 'image/jpeg',
    questionId: f.questionId,
    quesNum: f.quesNum || f.serialNumber,
    homeworkId: ctx.homeworkId,
    studentId: ctx.studentId,
    modifyNum: ctx.modifyNum,
    unitId: ctx.unitId,
  });
  if (!result || result.code !== 200) { alert(result?.msg || '上传失败'); return; }
  q.studentAnswer = result.url; q.pictureUrl = result.url;
  toast('已上传'); renderQuestions();
});

function buildAnswerInfo() {
  const cards = getCards(), info = [];
  for (let i = 0; i < cards.length; i++) {
    const q = cards[i], f = cardFields(q, i), qt = f.questionType;
    if (isObjective(qt)) {
      const ans = getAnswer(f.serialNumber);
      if (!ans && !f.existingAnswer) continue;
      let encoded = String(ans || f.existingAnswer || '');
      if (qt === QT.DUOXUAN) encoded = encodeMultiChoice(encoded);
      else if (qt === QT.TIANKONG) encoded = encodeFillBlank(encoded);
      info.push({ answer: encoded, homeworkResourceId: f.homeworkResourceId, orderNum: String(f.orderNum), pictureStatus: '', quesMaxNum: 0, quesNums: '', questionId: String(f.questionId), questionType: qt, serialNumber: String(f.serialNumber), studentAnswerIds: '-10001' });
    } else if (isImageType(qt)) {
      const picUrl = q.studentAnswer || q.pictureUrl || '';
      if (!picUrl) continue;
      info.push({ answer: '', homeworkResourceId: f.homeworkResourceId, orderNum: String(f.orderNum), pictureStatus: '0', quesMaxNum: 0, quesNums: '', questionId: String(f.questionId), questionType: qt, serialNumber: String(f.serialNumber), studentAnswerIds: '-10001', pictureUrl: picUrl });
    }
  }
  return info;
}

async function doSaveOnly() { toast('保存中...'); const ok = await saveAllAnswers(); toast(ok ? '已保存' : '保存失败'); renderQuestions(); }
async function doSubmit() {
  if (!confirm('确认提交作业？')) return;
  toast('提交作业中...');

  const endTime = Date.now();
  const usedSec = Math.max(0, Number(ctx.timerSec || 0));

  const saved = await saveAllAnswers();
  if (!saved) return;

  try {
    const explainResp = await window.electronAPI.addStudentExplainSign?.({
      studentId: String(ctx.studentId),
      homeworkId: String(ctx.homeworkId),
      homeworkResourceIds: '[]',
      unitId: String(ctx.unitId),
    });
    const explainCode = String(explainResp?.data?.code ?? '');
    if (explainResp && explainResp.code !== 200) {
      console.warn('[submit] addStudentExplainSign HTTP 失败', explainResp);
    } else if (explainResp && explainCode && explainCode !== '10000') {
      console.warn('[submit] addStudentExplainSign 业务失败', explainResp);
    }
  } catch (e) {
    console.warn('[submit] addStudentExplainSign 异常，继续提交', e);
  }

  const answerInfo = buildAnswerInfo();
  if (!answerInfo.length) {
    alert('没有可提交的答案');
    return;
  }

  const miss = answerInfo.find(x => !x.questionId || !x.homeworkResourceId);
  if (miss) {
    console.error('[submit] answerInfo 字段缺失', miss, answerInfo);
    alert('提交失败：answerInfo 缺少 questionId 或 homeworkResourceId，请检查 getHomeworkCardInfo 字段映射');
    return;
  }

  console.log('[submit] answerInfo=', answerInfo);
  const finalResp = await window.electronAPI.saveCardAnswer({
    answerInfo: JSON.stringify(answerInfo),
    studentId: String(ctx.studentId),
    homeworkId: String(ctx.homeworkId),
    type: '0',
    startTime: '',
    endTime: String(endTime),
    time: String(usedSec),
    modifyNum: String(ctx.modifyNum),
    unitId: String(ctx.unitId),
  });
  const finalCode = String(finalResp?.data?.code ?? '');
  if (!finalResp || finalResp.code !== 200 || finalCode !== '10000') {
    alert('saveCardAnswer 失败: ' + (finalResp?.raw || finalResp?.msg || '').slice(0, 200));
    return;
  }

  toast('提交成功'); setTimeout(() => location.href = '../homework/index.html', 600);
}


$('#prevQBtn')?.addEventListener('click', () => navigateTo(ctx.currentQIndex - 1));
$('#nextQBtn')?.addEventListener('click', () => navigateTo(ctx.currentQIndex + 1));
window.addEventListener('keydown', (e) => {
  if (e.altKey && e.key === 'ArrowLeft') return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable || e.target.closest('.optGroup')) return;
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); navigateTo(ctx.currentQIndex - 1); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); navigateTo(ctx.currentQIndex + 1); }
});
$('#saveBtn')?.addEventListener('click', doSaveOnly);
$('#submitBtn')?.addEventListener('click', doSubmit);
$('#submitBtn2')?.addEventListener('click', doSubmit);
boot();
