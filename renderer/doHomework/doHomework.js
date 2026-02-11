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
};

function renderQuestions() {
  const list = $('#qList');
  const data = ctx.info || {};
  const cards = data.homeworkCardList || [];
  if (!cards.length) {
    list.innerHTML = `<div class="empty">没有题目（homeworkCardList 为空）</div>`;
    return;
  }

  list.innerHTML = cards.map((q, idx) => {
    const num = q.serialNumber || (idx + 1);
    const score = q.score ?? '';
    const qType = q.questionType ?? '';
    const answerUrl = q.studentAnswer || '';
    const resourceId = q.resourceId || '';
    const questionId = q.questionId || '';
    const quesNum = q.quesNums || q.quesMaxNum || q.quesNum || num;

    return `
      <div class="qCard" data-idx="${idx}">
        <div class="qTop">
          <div>
            <div class="qName">第 ${num} 题</div>
            <div class="qMeta">questionType=${qType}  score=${score}  quesNum=${quesNum}</div>
          </div>
          <div class="qMeta">resourceId=${resourceId || '-'} </div>
        </div>

        <div class="qBody">
          <div class="qAnsRow">
            <button class="btn" data-act="pick" data-idx="${idx}">上传图片</button>
            <button class="btn" data-act="clear" data-idx="${idx}">清空</button>
            <span class="qMeta">questionId=${questionId || '-'}</span>
          </div>

          ${answerUrl
            ? `<img class="thumb" src="${answerUrl}" alt="answer" />`
            : `<div class="qMeta">当前未上传图片</div>`
          }
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('button[data-act="pick"]').forEach((b) => {
    b.addEventListener('click', () => {
      const idx = Number(b.dataset.idx);
      ctx.selectedQ = idx;
      $('#fileInput').value = '';
      $('#fileInput').click();
    });
  });

  list.querySelectorAll('button[data-act="clear"]').forEach((b) => {
    b.addEventListener('click', () => {
      const idx = Number(b.dataset.idx);
      const q = ctx.info.homeworkCardList[idx];
      if (!q) return;
      q.studentAnswer = '';
      toast('已清空（未提交）');
      renderQuestions();
    });
  });
}

async function refreshTime() {
  const t = await window.electronAPI.getHomeworkTime({
    homeworkId: ctx.homeworkId,
    studentId: ctx.studentId,
    unitId: ctx.unitId,
  });
  if (t && t.code === 200) {
    // 兼容字段：homeworkStatu / homeworkStatus
    const hs = t.data?.homeworkStatu || t.data?.homeworkStatus || t.data;
    const sec = Number(hs?.answerTime || 0);
    $('#timer').textContent = fmtSec(sec);
  }
}

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

  //截止校验
  const ck = await window.electronAPI.checkHomeworkEndTime({
    homeworkId: ctx.homeworkId,
    unitId: ctx.unitId,
  });
  if (!ck || ck.code !== 200) {
    alert(ck?.msg || 'checkHomeworkEndTime 失败');
    return;
  }

  //获取题卡信息（材料 PDF + homeworkCardList）
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

  //材料 PDF
  const rel = (ctx.info.materialRelas || [])[0];
  const pdfUrl = toWpStatic(rel?.resourceUrl);
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

$('#fileInput')?.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const idx = Number(ctx.selectedQ);
  const q = ctx.info?.homeworkCardList?.[idx];
  if (!q) return;

  const resourceId = q.resourceId || '';
  const questionId = q.questionId || '';
  const quesNum = q.quesNums || q.quesMaxNum || q.quesNum || q.serialNumber || (idx + 1);
  if (!resourceId) {
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
    resourceId: String(resourceId),
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

  // up.data 可能是 JSON，也可能是字符串；up.raw 更可靠
  let imgUrl = '';
  const raw = up.raw || '';
  if (typeof up.data === 'string' && /^https?:\/\//.test(up.data)) imgUrl = up.data;
  if (!imgUrl && typeof raw === 'string' && raw.includes('http')) {
    const m = raw.match(/https?:\/\/[^"'\s]+/);
    if (m) imgUrl = m[0];
  }
  //如果服务端直接返回 {url: "..."}
  if (!imgUrl && up.data && typeof up.data === 'object') {
    imgUrl = up.data.url || up.data.data?.url || '';
  }

  if (!imgUrl) {
    alert('上传成功但未解析到图片 URL（请把 up.raw 发我）');
    return;
  }

  // 写回当前题目
  q.studentAnswer = imgUrl;

  toast('保存答案中...');

  // 保存答案按安卓 saveScoreAndAnswer 字段表
  const sv = await window.electronAPI.saveStuScoreAndAnswer({
    score: String(q.score ?? ''),
    homeworkId: String(ctx.homeworkId),
    resourceId: String(resourceId),
    studentId: String(ctx.studentId),
    answer: '',               // 图片作答时 answer 可空
    quesNum: String(quesNum),
    url: String(imgUrl),      // 图片 URL
    modifyNum: String(ctx.modifyNum),
    questionId: String(questionId),
    bitId: String(bitId),
    time: String(Date.now()),
    answerType: String(q.questionType ?? ''),
    studentAnswerIds: String(q.studentAnswerId ?? q.studentAnswerIds ?? ''),
    unitId: String(ctx.unitId),
  });

  if (!sv || sv.code !== 200) {
    alert(sv?.msg || 'saveScoreAndAnswer 失败');
    return;
  }

  toast('已上传并保存');
  renderQuestions();
});

async function doSaveOnly() {
  toast('提示：当前版本“保存”= 仅保存你刚上传的题；其它题后续再补（你要我做批量保存我也可以）');
}

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

$('#saveBtn')?.addEventListener('click', doSaveOnly);
$('#submitBtn')?.addEventListener('click', doSubmit);
$('#submitBtn2')?.addEventListener('click', doSubmit);

boot();
