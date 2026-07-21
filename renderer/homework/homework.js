window.Theme?.initTheme();

const pageParams = new URLSearchParams(location.search);
const listFrom = pageParams.get('from') === 'me' ? 'me' : 'home';

const $ = (s) => document.querySelector(s);

const TYPE_FILTER_FETCH_SIZE = 100;
const TYPE_FILTER_MAX_PAGES = 1000;
let loadRequestId = 0;

const state = {
  statu: 1,
  subjectCode: '',
  homeworkType: -1,
  homeworkName: '',
  pageIndex: 1,
  pageSize: 12,
  pages: 1,
  subjects: new Map(),
};

function setLoading(on) {
  const list = $('#list');
  if (on) list.innerHTML = `<div class="card"><div class="l">加载中...</div></div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function formatTime(ts) {
  if (!ts) return '';
  const n = Number(ts);
  if (!n || n < 1000000000000) return String(ts); // 非毫秒时间戳原样返回
  const d = new Date(n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function homeworkTypeName(value) {
  const names = {
    0: '预习作业',
    1: '复习作业',
    3: '课后作业',
    5: '阅读材料',
    6: '小测',
    7: '答题卡',
  };
  return names[Number(value)] || '推送';
}

function subjectLabel(name) {
  const value = String(name || '').trim();
  const known = {
    '语文': '语',
    '数学': '数',
    '英语': '英',
    '物理': '物',
    '化学': '化',
    '生物': '生',
    '历史': '史',
    '地理': '地',
    '政治': '政',
    '道德与法治': '政',
  };
  return known[value] || value.slice(0, 2) || '科目';
}

function renderSubjectFilters() {
  const container = $('#subjects');
  if (!container) return;

  const subjectButtons = Array.from(state.subjects.values()).map((subject) => {
    const hint = subject.teacherName ? `${subject.name} - ${subject.teacherName}` : subject.name;
    const active = state.subjectCode === subject.code ? ' active' : '';
    return `<button class="pill${active}" data-subject="${escapeHtml(subject.code)}" title="${escapeHtml(hint)}">${escapeHtml(subjectLabel(subject.name || subject.code))}</button>`;
  });
  const allActive = state.subjectCode ? '' : ' active';
  container.innerHTML = [
    `<button class="pill${allActive}" data-subject="">全</button>`,
    ...subjectButtons,
  ].join('');
}

function mergeSubjects(subjects) {
  (subjects || []).forEach((subject) => {
    const code = String(subject?.code || subject?.subjectCode || '').trim();
    if (!code) return;

    const previous = state.subjects.get(code) || {};
    const name = String(subject?.name || subject?.subjectName || subject?.subject || previous.name || code).trim();
    const teacherName = String(subject?.teacherName || previous.teacherName || '').trim();
    state.subjects.set(code, { code, name, teacherName });
  });
  renderSubjectFilters();
}

async function loadSubjects() {
  const container = $('#subjects');
  if (!container || typeof window.msykAPI?.hwSubjects !== 'function') return;

  try {
    const response = await window.msykAPI.hwSubjects();
    const businessCode = String(response?.data?.code ?? '');
    const subjects = response?.data?.studentSubjectList;

    if (!response || response.code !== 200 || (businessCode && businessCode !== '10000')) {
      throw new Error(response?.data?.message || response?.msg || '获取科目失败');
    }
    if (!Array.isArray(subjects)) return;

    const items = subjects
      .map((subject) => ({
        code: String(subject?.code || '').trim(),
        name: String(subject?.name || '').trim(),
        teacherName: String(subject?.teacherName || '').trim(),
      }))
      .filter((subject) => subject.code && subject.name);

    mergeSubjects(items);
  } catch (error) {
    console.warn('[homework] 科目列表加载失败，继续使用全部科目:', error);
  }
}

function toWpStatic(u) {
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return `https://msyk.wpstatic.cn/${String(u).replace(/^\/+/, '')}`;
}

function isPptResource(resource) {
  const title = String(resource?.resTitle || resource?.title || resource?.fileName || '');
  return Number(resource?.resourceType) === 5 || /\.pptx?$/i.test(title);
}

function toPptPageUrl(path) {
  const url = toWpStatic(path);
  if (!url) return '';
  return `${url}${url.includes('?') ? '&' : '?'}x-oss-process=image/rotate,0`;
}

async function resolveReadMaterials(resList) {
  const urls = [];
  const resIds = [];
  const errors = [];

  for (const resource of resList) {
    const resourceId = String(resource?.id || resource?.resourceId || '');

    if (!isPptResource(resource)) {
      const url = resource?.resourceUrl ? toWpStatic(resource.resourceUrl) : '';
      if (url) {
        urls.push(url);
        resIds.push(resourceId);
      }
      continue;
    }

    const pptResourceId = resource?.resourceUrl || resource?.resId;
    if (!pptResourceId) {
      errors.push(`${resource?.resTitle || 'PPT'} 缺少资源 ID`);
      continue;
    }

    const response = await window.msykAPI.hwPptInfo({
      pptResourceId,
      resSource: resource?.resSource ?? 1,
    });
    const pages = response?.data?.sqPptConvertList;

    if (!response || response.code !== 200 || !Array.isArray(pages) || !pages.length) {
      errors.push(response?.msg || `${resource?.resTitle || 'PPT'} 转换图片为空`);
      continue;
    }

    pages
      .slice()
      .sort((a, b) => Number(a?.displayNum || 0) - Number(b?.displayNum || 0))
      .forEach((page) => {
        const url = page?.path ? toPptPageUrl(page.path) : '';
        if (!url) return;
        urls.push(url);
        resIds.push(resourceId);
      });
  }

  return { urls, resIds, errors };
}

function getCardMaterialGroups(info) {
  const collect = (keys) => keys.flatMap((key) => Array.isArray(info?.[key]) ? info[key] : []);
  return {
    questions: collect(['materialRelas', 'dtkMaterialInfoList', 'dtkMaterialList', 'materials']),
    answers: collect(['analysistList', 'analysisList', 'dtkAnswerMaterialList', 'answerMaterialRelas', 'answerMaterials']),
  };
}

function uniqueUrls(urls) {
  return Array.from(new Set((urls || []).filter(Boolean)));
}

function isAnswerMaterialVisible(info, answers) {
  if (info?.isShowAnswer !== undefined && info?.isShowAnswer !== null && info?.isShowAnswer !== '') {
    return Number(info.isShowAnswer) === 1;
  }
  return Array.isArray(answers) && answers.length > 0;
}

async function isDebugModeEnabled() {
  try {
    if (typeof window.msykAPI?.debugGet === 'function') {
      return !!(await window.msykAPI.debugGet());
    }
  } catch (error) {
    console.warn('[homework] 读取调试模式失败:', error);
  }

  try {
    return !!window.MSYK_DEBUG?.get?.();
  } catch {
    return false;
  }
}

function renderList(data) {
  const list = $('#list');
  const items = data?.sqHomeworkDtoList || [];

  mergeSubjects(items);

  if (!items.length) {
    list.innerHTML = `<div class="card"><div class="l">暂无作业</div></div>`;
    return;
  }

  list.innerHTML = items.map((it) => {
    const title = it.homeworkName || it.name || '未命名作业';
    const subject = it.subjectName || it.subject || '';
    const teacher = it.teacherName || '';
    const count = it.totalCount ?? it.questionNum ?? '';
    const endTime = it.endTimeStr || formatTime(it.endTime) || '';
    const hwId = it.homeworkId || it.id || '';
    const modifyNum = it.modifyNum ?? it.modifyTimes ?? 0;

    const hwType = Number(it.homeworkType ?? it.type ?? -1); //homeworkType 起作用
    const btnText = state.statu === 1 ? '去做作业' : '查看';

    return `
      <div class="card" data-id="${hwId}" data-mod="${modifyNum}" data-type="${hwType}">
        <div class="l">
          <div class="name">${escapeHtml(title)}</div>
          <div class="meta">
            ${subject ? `<span>${escapeHtml(subject)}</span>` : ''}
            ${teacher ? `<span>${escapeHtml(teacher)}</span>` : ''}
            ${count !== '' ? `<span>题数：${escapeHtml(String(count))}</span>` : ''}
            ${endTime ? `<span>截止：${escapeHtml(String(endTime))}</span>` : ''}
            <span>类型：${escapeHtml(homeworkTypeName(hwType))}</span>
          </div>
        </div>
        <div class="r">
          <div class="badge">statu=${state.statu}</div>
          <button class="primary doBtn">${btnText}</button>
        </div>
      </div>
    `;
  }).join('');

  list.querySelectorAll('.doBtn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const card = e.target.closest('.card');
      const homeworkId = card?.dataset?.id;
      const modifyNum = Number(card?.dataset?.mod || 0);
      const hwType = Number(card?.dataset?.type || -1);

      if (!homeworkId) return;

      // homeworkType=7：答题卡
      if (hwType === 7) {
        // statu=1：新作业
        if (state.statu === 1) {
          window.PrimaryPageTransition.open(`../doHomework/index.html?homeworkId=${encodeURIComponent(
            homeworkId
          )}&modifyNum=${encodeURIComponent(modifyNum)}&from=${listFrom}`);
          return;
        }

        // 已提交/待批改/已结束：答题卡、题干材料和答案材料使用同一详情页。
        let cardInfo = null;
        try {
          const infoResponse = await window.msykAPI.getHomeworkCardInfo({
            homeworkId,
            modifyNum,
          });
          if (infoResponse?.code === 200 && infoResponse.data) {
            cardInfo = infoResponse.data;
          } else {
            console.warn('[homework] 获取答题卡材料失败，继续打开答题卡:', infoResponse);
          }
        } catch (error) {
          console.warn('[homework] 获取答题卡材料异常，继续打开答题卡:', error);
        }

        const materialGroups = getCardMaterialGroups(cardInfo);
        const showAnswer = cardInfo ? isAnswerMaterialVisible(cardInfo, materialGroups.answers) : true;
        let debugModeEnabled = false;
        let debugAnswerResources = [];

        if (cardInfo && !showAnswer) {
          debugModeEnabled = await isDebugModeEnabled();
          if (debugModeEnabled) {
            debugAnswerResources = materialGroups.answers;

            if (!debugAnswerResources.length && typeof window.msykAPI?.getCorrectAnswers === 'function') {
              try {
                const debugResponse = await window.msykAPI.getCorrectAnswers({
                  homeworkId,
                  modifyNum,
                });
                if (debugResponse?.code === 200 && debugResponse.data) {
                  debugAnswerResources = getCardMaterialGroups(debugResponse.data).answers;
                } else {
                  console.warn('[homework] 调试答案材料获取失败:', debugResponse);
                }
              } catch (error) {
                console.warn('[homework] 调试答案材料获取异常:', error);
              }
            }
          }
        }

        const resp = await window.msykAPI.hwCardPreviewUrl({
          homeworkId,
          modifyNum,
          isShowAnswer: showAnswer ? 1 : 0,
          endHomeworkModel: 1,
        });

        if (!resp || resp.code !== 200 || !resp.data?.url) {
          alert(resp?.msg || '生成作业预览链接失败');
          return;
        }

        const detailParams = new URLSearchParams({
          url: resp.data.url,
          from: listFrom,
        });

        if (cardInfo) {
          const [questionResult, answerResult, debugAnswerResult] = await Promise.all([
            resolveReadMaterials(materialGroups.questions),
            showAnswer ? resolveReadMaterials(materialGroups.answers) : Promise.resolve({ urls: [], errors: [] }),
            debugModeEnabled && debugAnswerResources.length
              ? resolveReadMaterials(debugAnswerResources)
              : Promise.resolve({ urls: [], errors: [] }),
          ]);
          const questionUrls = uniqueUrls(questionResult.urls);
          const answerUrls = uniqueUrls(answerResult.urls);
          const debugAnswerUrls = uniqueUrls(debugAnswerResult.urls);

          detailParams.set('detailModes', '1');
          detailParams.set('questionUrls', JSON.stringify(questionUrls));
          detailParams.set('answerUrls', JSON.stringify(answerUrls));
          detailParams.set('answerState', showAnswer ? (answerUrls.length ? 'available' : 'empty') : 'hidden');

          if (debugModeEnabled && debugAnswerUrls.length) {
            detailParams.set('debugForceAllowed', '1');
            detailParams.set('debugAnswerUrls', JSON.stringify(debugAnswerUrls));
          }

          [...(questionResult.errors || []), ...(answerResult.errors || []), ...(debugAnswerResult.errors || [])]
            .forEach((error) => console.warn('[homework] 材料解析失败:', error));
        }

        window.PrimaryPageTransition.open(`../homeworkDetail/index.html?${detailParams.toString()}`);
        return;
      }

      // homeworkType=5：HTM/图片直接加载；PPT 按原版流程换取逐页图片。
      if (hwType === 5) {
        const st = await window.msykAPI.hwStatus({ homeworkId, modifyNum });
        if (!st || st.code !== 200) {
          alert(st?.msg || 'homeworkStatus 失败');
          return;
        }

        const resList = st.data?.resourceList || [];
        const resolved = await resolveReadMaterials(resList);
        const urlArr = resolved.urls;

        if (!urlArr.length) {
          alert(resolved.errors[0] || '未找到可阅读的作业材料');
          return;
        }

        const debugModeEnabled = state.statu !== 1 && await isDebugModeEnabled();
        const detailParams = new URLSearchParams({
          homeworkId,
          modifyNum: String(modifyNum),
          isRead: '1',
          readOnly: state.statu === 1 || debugModeEnabled ? '0' : '1',
          urls: JSON.stringify(urlArr),
          resIds: JSON.stringify(resolved.resIds),
          from: listFrom,
        });
        window.PrimaryPageTransition.open(`../homeworkDetail/index.html?${detailParams.toString()}`);
        return;
      }

      const st = await window.msykAPI.hwStatus({ homeworkId, modifyNum });
      if (st && st.code === 200) {
        const resList = st.data?.resourceList || [];
        const urlArr = resList
          .map(x => x?.resourceUrl ? toWpStatic(x.resourceUrl) : '')
          .filter(u => u);

        if (urlArr.length) {
          const urlsJson = encodeURIComponent(JSON.stringify(urlArr));
          window.PrimaryPageTransition.open(`../homeworkDetail/index.html?urls=${urlsJson}&from=${listFrom}`);
          return;
        }
      }

      // 兜底：hwCardPreviewUrl（仍然单 URL）
      {
        const resp = await window.msykAPI.hwCardPreviewUrl({
          homeworkId,
          modifyNum,
          isShowAnswer: state.statu === 1 ? 0 : 1,
          endHomeworkModel: state.statu === 1 ? 0 : 1,
        });

        if (!resp || resp.code !== 200 || !resp.data?.url) {
          alert(resp?.msg || '生成作业链接失败');
          return;
        }
        window.PrimaryPageTransition.open(`../homeworkDetail/index.html?url=${encodeURIComponent(resp.data.url)}&from=${listFrom}`);
      }
    });
  });
}

function renderPager(data) {
  state.pages = Number(data?.pages || 1);
  state.pageIndex = Number(data?.pageIndex || state.pageIndex);

  const pager = $('#pager');
  if (state.pages <= 1) {
    pager.style.display = 'none';
    return;
  }
  pager.style.display = 'flex';
  $('#pageInfo').textContent = `${state.pageIndex} / ${state.pages}`;

  $('#prev').disabled = state.pageIndex <= 1;
  $('#next').disabled = state.pageIndex >= state.pages;
}

async function requestHomeworkList(request) {
  if (Number(request.homeworkType) === -1) {
    return window.msykAPI.hwList(request);
  }

  const targetType = Number(request.homeworkType);
  const fetchSize = Math.max(TYPE_FILTER_FETCH_SIZE, Number(request.pageSize) || 12);
  const allItems = [];
  let firstResponse = null;
  let serverPage = 1;
  let serverPages = 1;

  do {
    const response = await window.msykAPI.hwList({
      ...request,
      homeworkType: -1,
      pageIndex: serverPage,
      pageSize: fetchSize,
    });

    if (!response || response.code !== 200) return response;
    if (!firstResponse) firstResponse = response;

    const data = response.data || {};
    if (data.code !== undefined && String(data.code) !== '10000') return response;

    const items = Array.isArray(data.sqHomeworkDtoList) ? data.sqHomeworkDtoList : [];
    allItems.push(...items);
    serverPages = Math.min(
      TYPE_FILTER_MAX_PAGES,
      Math.max(1, Number(data.pages) || 1)
    );
    serverPage += 1;
  } while (serverPage <= serverPages);

  const filteredItems = allItems.filter(
    (item) => Number(item?.homeworkType) === targetType
  );
  const pageSize = Math.max(1, Number(request.pageSize) || 12);
  const pages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pageIndex = Math.min(Math.max(1, Number(request.pageIndex) || 1), pages);
  const start = (pageIndex - 1) * pageSize;

  return {
    ...firstResponse,
    data: {
      ...(firstResponse?.data || {}),
      sqHomeworkDtoList: filteredItems.slice(start, start + pageSize),
      homeworkNum: filteredItems.length,
      pages,
      pageIndex,
    },
  };
}

async function load() {
  const requestId = ++loadRequestId;
  setLoading(true);

  const resp = await requestHomeworkList({
    statu: state.statu,
    pageIndex: state.pageIndex,
    pageSize: state.pageSize,
    subjectCode: state.subjectCode,
    homeworkType: state.homeworkType,
    homeworkName: state.homeworkName,
  });

  if (requestId !== loadRequestId) return;

  if (!resp || resp.code !== 200) {
    $('#list').innerHTML = `<div class="card"><div class="l">加载失败：${escapeHtml(
      resp?.msg || 'unknown'
    )}</div></div>`;
    return;
  }

  const data = resp.data;
  renderList(data);
  renderPager(data);
}

// --- events ---
$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
  btn.classList.add('active');

  state.statu = Number(btn.dataset.statu);
  state.pageIndex = 1;
  load();
});

$('#subjects').addEventListener('click', (e) => {
  const btn = e.target.closest('.pill');
  if (!btn) return;
  document.querySelectorAll('.pill').forEach((x) => x.classList.remove('active'));
  btn.classList.add('active');

  state.subjectCode = btn.dataset.subject || '';
  state.pageIndex = 1;
  load();
});

$('#typeSel').addEventListener('change', (e) => {
  state.homeworkType = Number(e.target.value);
  state.pageIndex = 1;
  load();
});

$('#sizeSel').addEventListener('change', (e) => {
  state.pageSize = Number(e.target.value);
  state.pageIndex = 1;
  load();
});

$('#searchBtn').addEventListener('click', () => {
  state.homeworkName = $('#kw').value.trim();
  state.pageIndex = 1;
  load();
});

$('#kw').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#searchBtn').click();
});

$('#prev').addEventListener('click', () => {
  if (state.pageIndex > 1) state.pageIndex -= 1;
  load();
});
$('#next').addEventListener('click', () => {
  if (state.pageIndex < state.pages) state.pageIndex += 1;
  load();
});

loadSubjects();
load();
