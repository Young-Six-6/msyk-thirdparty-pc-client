window.Theme?.initTheme();

const $ = (s) => document.querySelector(s);

function qs() {
  const p = new URLSearchParams(location.search);
  return Object.fromEntries(p.entries());
}

function toWpStatic(resourceUrl) {
  if (!resourceUrl) return '';
  if (/^https?:\/\//i.test(resourceUrl)) return resourceUrl;
  return `https://msyk.wpstatic.cn/${String(resourceUrl).replace(/^\/+/, '')}`;
}

function fmtSec(sec) {
  sec = Math.max(0, Number(sec || 0));
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = String(msg || '');
  el.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.style.display = 'none'), 1800);
}

function isDarkMode() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

$('#backBtn')?.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = '../homework/index.html';
});

const ctx = {
  homeworkId: 0,
  modifyNum: 0,
  studentId: '',
  unitId: '',
  info: null,
  selectedQ: null,
  currentQIndex: 0, // ★ 当前正在做/查看的题目索引
};

/* ========== 从 info 中获取题目列表（兼容多字段名） ========== */
function getCards() {
  const data = ctx.info || {};
  return data.homeworkCardList || data.dtkExercises || [];
}

/* ========== 兼容字段取值 ========== */
function cardFields(q, idx) {
  return {
    serialNumber: q.serialNumber || q.orderNum || (idx + 1),
    score: q.score ?? '',
    questionType: q.questionType ?? '',
    answerUrl: q.studentAnswer || q.pictureUrl || '',
    resourceId: q.resourceId || q.id || '',
    questionId: q.questionId || q.resId || '',
    quesNum: q.quesNum || q.quesNums || q.quesMaxNum || q.serialNumber || q.orderNum || (idx + 1),
    studentAnswerIds: q.studentAnswerId || q.studentAnswerIds || '',
    answerType: q.answerType || q.questionType || '',
  };
}

/* ========== 导航 ========== */
function navigateTo(index) {
  const cards = getCards();
  if (cards.length === 0) return;
  ctx.currentQIndex = Math.max(0, Math.min(cards.length - 1, index));
  renderQuestions();
}

function updateNavButtons() {
  const cards = getCards();
  const prevBtn = $('#prevQBtn');
  const nextBtn = $('#nextQBtn');
  if (prevBtn) prevBtn.disabled = ctx.currentQIndex <= 0;
  if (nextBtn) nextBtn.disabled = ctx.currentQIndex >= cards.length - 1;
}

function updateIndicator() {
  const cards = getCards();
  const el = $('#qIndicator');
  if (el) {
    el.textContent = cards.length > 0
      ? `第 ${ctx.currentQIndex + 1} / ${cards.length} 题`
      : '无题目';
  }
}

/* ========== 渲染题目列表 ========== */
function renderQuestions() {
  const list = $('#qList');
  const cards = getCards();

  if (!cards.length) {
    list.innerHTML = `<div class="empty">没有题目（homeworkCardList / dtkExercises 为空）</div>`;
    updateIndicator();
    updateNavButtons();
    return;
  }

  list.innerHTML = cards.map((q, idx) => {
    const f = cardFields(q, idx);
    const isActive = idx === ctx.currentQIndex;

    let imgHtml = '';
    if (f.answerUrl) {
      imgHtml = `<img class="thumb" src="${f.answerUrl}" alt="answer" />`;
    } else {
      imgHtml = `<div class="qMeta">当前未上传图片</div>`;
    }

    return `
      <div class="qCard${isActive ? ' active' : ''}" data-idx="${idx}">
        <div class="qTop">
          <div>
            <div class="qName">第 ${f.serialNumber} 题</div>
            <div class="qMeta">questionType=${f.questionType}  score=${f.score}</div>
          </div>
          <div class="qMeta">resourceId=${f.resourceId || '-'}</div>
        </div>

        <div class="qBody">
          <div class="qAnsRow">
            <button class="btn" data-act="pick" data-idx="${idx}">上传图片</button>
            <button class="btn" data-act="clear" data-idx="${idx}">清空</button>
            <span class="qMeta">questionId=${f.questionId || '-'}</span>
          </div>
          ${imgHtml}
        </div>
      </div>
    `;
  }).join('');

  // 题号列 — 点击卡片切换当前题
  list.querySelectorAll('.qCard').forEach((card) => {
    card.addEventListener('click', (e) => {
      // 不拦截按钮点击
      if (e.target.closest('button')) return;
      const idx = Number(card.dataset.idx);
      navigateTo(idx);
    });
  });

  // 上传图片
  list.querySelectorAll('button[data-act="pick"]').forEach((b) => {
    b.addEventListener('click', () => {
      const idx = Number(b.dataset.idx);
      ctx.selectedQ = idx;
      $('#fileInput').value = '';
      $('#fileInput').click();
    });
  });

  // 清空
  list.querySelectorAll('button[data-act="clear"]').forEach((b) => {
    b.addEventListener('click', () => {
      const idx = Number(b.dataset.idx);
      const q = cards[idx];
      if (!q) return;
      // 兼容字段
      if (q.studentAnswer !== undefined) q.studentAnswer = '';
      if (q.pictureUrl !== undefined) q.pictureUrl = '';
      toast('已清空（未提交）');
      renderQuestions();
    });
  });

  // 自动滚动到当前题目
  const activeCard = list.querySelector('.qCard.active');
  if (activeCard) {
    activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  updateIndicator();
  updateNavButtons();
}

/* ========== 计时 ========== */
async function refreshTime() {
  const t = await window.electronAPI.getHomeworkTime({
    homeworkId: ctx.homeworkId,
    studentId: ctx.studentId,
    unitId: ctx.unitId,
  });
  if (t && t.code === 200) {
    const hs = t.data?.homeworkStatu || t.data?.homeworkStatus || t.data;
    const sec = Number(hs?.answerTime || 0);
    $('#timer').textContent = fmtSec(sec);
  }
}

/* ========== 启动 ========== */
async function boot() {
  const q = qs();
  ctx.homeworkId = Number(q.homeworkId || 0);
  ctx.modifyNum = Number(q.modifyNum || 0);

  if (!ctx.homeworkId) {
    alert('缺少 homeworkId');
    return;
  }

  const s = await window.electronAPI.apiGetSession();
  const ss = s?.data || s || {};
  ctx.studentId = ss.studentId || '';
  ctx.unitId = ss.unitId || '';

  if (!ctx.studentId || !ctx.unitId) {
    alert('缺少 studentId/unitId（未登录或 session 异常）');
    return;
  }

  $('#statusText').textContent = isDarkMode() ? '暗色模式' : '浅色模式';

  // 截止校验
  const ck = await window.electronAPI.checkHomeworkEndTime({
    homeworkId: ctx.homeworkId,
    unitId: ctx.unitId,
  });
  if (!ck || ck.code !== 200) {
    alert(ck?.msg || 'checkHomeworkEndTime 失败');
    return;
  }

  // 获取题卡信息（材料 PDF + homeworkCardList / dtkExercises）
  const info = await window.electronAPI.getHomeworkCardInfo({
    homeworkId: ctx.homeworkId,
    studentId: ctx.studentId,
    modifyNum: ctx.modifyNum,
    unitId: ctx.unitId,
  });

  if (!info || info.code !== 200) {
    alert(info?.msg || 'getHomeworkCardInfo 失败');
    return;
  }

  ctx.info = info.data || {};
  $('#title').textContent = ctx.info.homeworkName || '做作业';

  // DEBUG: 输出完整返回结构方便排查字段名
  console.log('[doHomework] getHomeworkCardInfo 返回:', JSON.stringify(ctx.info, null, 2));
  const cards = getCards();
  console.log('[doHomework] 解析到的题目列表(' + cards.length + '条):', cards);

  // 材料 PDF
  const rel = (ctx.info.materialRelas || ctx.info.dtkMaterialInfoList || [])[0];
  const pdfUrl = toWpStatic(rel?.resourceUrl || rel?.url);
  const pdfWv = $('#pdfWv');
  const pdfEmpty = $('#pdfEmpty');

  if (pdfUrl) {
    pdfEmpty.style.display = 'none';
    pdfWv.style.display = 'block';
    pdfWv.src = pdfUrl;
  } else {
    pdfWv.src = 'about:blank';
    pdfWv.style.display = 'none';
    pdfEmpty.style.display = 'block';
  }

  renderQuestions();

  refreshTime();
  setInterval(refreshTime, 10_000);
}

/* ========== 上传图片 ========== */
$('#fileInput')?.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const idx = Number(ctx.selectedQ);
  const cards = getCards();
  const q = cards[idx];
  if (!q) return;

  const f = cardFields(q, idx);

  if (!f.resourceId) {
    alert('该题缺少 resourceId，无法上传');
    return;
  }

  toast('读取图片中...');

  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });

  const bitId = String(Date.now());
  const time = String(Date.now());

  toast('上传中...');

  const up = await window.electronAPI.saveBitmap({
    homeworkId: String(ctx.homeworkId),
    resourceId: String(f.resourceId),
    studentId: String(ctx.studentId),
    startPointY: '0',
    points: String(dataUrl || ''),
    bitId,
    time,
    unitId: String(ctx.unitId),
  });

  if (!up || up.code !== 200) {
    alert(up?.msg || 'saveBitmap 失败');
    return;
  }

  // 解析图片 URL
  let imgUrl = '';
  const raw = up.raw || '';
  if (typeof up.data === 'string' && /^https?:\/\//.test(up.data)) imgUrl = up.data;
  if (!imgUrl && typeof raw === 'string' && raw.includes('http')) {
    const m = raw.match(/https?:\/\/[^"'\s]+/);
    if (m) imgUrl = m[0];
  }
  if (!imgUrl && up.data && typeof up.data === 'object') {
    imgUrl = up.data.url || up.data.data?.url || '';
  }

  if (!imgUrl) {
    alert('上传成功但未解析到图片 URL（请查看控制台 up.raw）');
    console.log('[doHomework] saveBitmap raw:', up.raw);
    return;
  }

  // 写回当前题目（兼容两种字段名）
  if (q.studentAnswer !== undefined) q.studentAnswer = imgUrl;
  if (q.pictureUrl !== undefined) q.pictureUrl = imgUrl;

  toast('保存答案中...');

  const sv = await window.electronAPI.saveStuScoreAndAnswer({
    score: String(f.score),
    homeworkId: String(ctx.homeworkId),
    resourceId: String(f.resourceId),
    studentId: String(ctx.studentId),
    answer: '',
    quesNum: String(f.quesNum),
    url: String(imgUrl),
    modifyNum: String(ctx.modifyNum),
    questionId: String(f.questionId),
    bitId: String(bitId),
    time: String(Date.now()),
    answerType: String(f.answerType),
    studentAnswerIds: String(f.studentAnswerIds),
    unitId: String(ctx.unitId),
  });

  if (!sv || sv.code !== 200) {
    alert(sv?.msg || 'saveScoreAndAnswer 失败');
    return;
  }

  toast('已上传并保存');
  renderQuestions();
});

/* ========== 保存（批量保存所有已上传图片但可能未 commit 的题） ========== */
async function doSaveOnly() {
  const cards = getCards();
  if (!cards.length) {
    toast('没有题目可保存');
    return;
  }

  let saved = 0;
  let skipped = 0;
  let failed = 0;

  toast('批量保存中...');

  for (let idx = 0; idx < cards.length; idx++) {
    const q = cards[idx];
    const f = cardFields(q, idx);

    // 没有图片答案，跳过
    if (!f.answerUrl) {
      skipped++;
      continue;
    }
    // 没有 resourceId，无法提交
    if (!f.resourceId) {
      skipped++;
      continue;
    }

    const bitId = String(Date.now()) + '_' + idx;

    const sv = await window.electronAPI.saveStuScoreAndAnswer({
      score: String(f.score),
      homeworkId: String(ctx.homeworkId),
      resourceId: String(f.resourceId),
      studentId: String(ctx.studentId),
      answer: '',
      quesNum: String(f.quesNum),
      url: String(f.answerUrl),
      modifyNum: String(ctx.modifyNum),
      questionId: String(f.questionId),
      bitId: String(bitId),
      time: String(Date.now()),
      answerType: String(f.answerType),
      studentAnswerIds: String(f.studentAnswerIds),
      unitId: String(ctx.unitId),
    });

    if (sv && sv.code === 200) {
      saved++;
    } else {
      failed++;
    }
  }

  toast(`保存完成：成功 ${saved} 题，跳过 ${skipped} 题${failed > 0 ? '，失败 ' + failed + ' 题' : ''}`);
}

/* ========== 提交作业 ========== */
async function doSubmit() {
  if (!confirm('确认提交作业？')) return;

  toast('提交中...');

  const now = Date.now();
  const start = String(ctx.info?.stuStartTime || now);

  const resp = await window.electronAPI.doSubmitHomework({
    homeworkId: String(ctx.homeworkId),
    userId: String(ctx.studentId),
    groupId: '',
    startTime: start,
    endTime: String(now),
    time: String(now),
    unitId: String(ctx.unitId),
  });

  if (!resp || resp.code !== 200) {
    alert(resp?.msg || '提交失败（doSubmitHomework）');
    return;
  }

  toast('提交成功');
  setTimeout(() => {
    location.href = '../homework/index.html';
  }, 600);
}

/* ========== 导航按钮事件 ========== */
$('#prevQBtn')?.addEventListener('click', () => {
  navigateTo(ctx.currentQIndex - 1);
});

$('#nextQBtn')?.addEventListener('click', () => {
  navigateTo(ctx.currentQIndex + 1);
});

/* ========== 键盘快捷键 ========== */
window.addEventListener('keydown', (e) => {
  // 在输入框中不拦截
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    navigateTo(ctx.currentQIndex - 1);
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    navigateTo(ctx.currentQIndex + 1);
  }
});

/* ========== 保存/提交按钮 ========== */
$('#saveBtn')?.addEventListener('click', doSaveOnly);
$('#submitBtn')?.addEventListener('click', doSubmit);
$('#submitBtn2')?.addEventListener('click', doSubmit);

boot();
