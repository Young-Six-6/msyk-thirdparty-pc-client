window.Theme?.initTheme();

const pageParams = new URLSearchParams(location.search);
const listFrom = pageParams.get('from') === 'me' ? 'me' : 'home';

document.querySelector('#backBtn')?.addEventListener('click', () => {
  location.replace(listFrom === 'me' ? '../me/index.html' : '../home/index.html');
});

const $ = (s) => document.querySelector(s);


const state = {
  statu: 1,
  subjectCode: '',
  homeworkType: -1,
  homeworkName: '',
  pageIndex: 1,
  pageSize: 12,
  pages: 1,
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

    const response = await window.electronAPI.hwPptInfo({
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

function renderList(data) {
  const list = $('#list');
  const items = data?.sqHomeworkDtoList || [];

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
            <span>homeworkType=${hwType}</span>
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
          location.replace(`../doHomework/index.html?homeworkId=${encodeURIComponent(
            homeworkId
          )}&modifyNum=${encodeURIComponent(modifyNum)}&from=${listFrom}`);
          return;
        }

        // 其它状态走 webview 预览
        const resp = await window.electronAPI.hwCardPreviewUrl({
          homeworkId,
          modifyNum,
          isShowAnswer: 1,
          endHomeworkModel: 1,
        });

        if (!resp || resp.code !== 200 || !resp.data?.url) {
          alert(resp?.msg || '生成作业预览链接失败');
          return;
        }

        location.replace(`../homeworkDetail/index.html?url=${encodeURIComponent(resp.data.url)}&from=${listFrom}`);
        return;
      }

      // homeworkType=5：HTM/图片直接加载；PPT 按原版流程换取逐页图片。
      if (hwType === 5) {
        const st = await window.electronAPI.hwStatus({ homeworkId, modifyNum });
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

        const urlsJson = encodeURIComponent(JSON.stringify(urlArr));
        const resIdsJson = encodeURIComponent(JSON.stringify(resolved.resIds));
        const params = `homeworkId=${encodeURIComponent(homeworkId)}&modifyNum=${encodeURIComponent(modifyNum)}&isRead=1&urls=${urlsJson}&resIds=${resIdsJson}&from=${listFrom}`;
        location.replace(`../homeworkDetail/index.html?${params}`);
        return;
      }

      const st = await window.electronAPI.hwStatus({ homeworkId, modifyNum });
      if (st && st.code === 200) {
        const resList = st.data?.resourceList || [];
        const urlArr = resList
          .map(x => x?.resourceUrl ? toWpStatic(x.resourceUrl) : '')
          .filter(u => u);

        if (urlArr.length) {
          const urlsJson = encodeURIComponent(JSON.stringify(urlArr));
          location.replace(`../homeworkDetail/index.html?urls=${urlsJson}&from=${listFrom}`);
          return;
        }
      }

      // 兜底：hwCardPreviewUrl（仍然单 URL）
      {
        const resp = await window.electronAPI.hwCardPreviewUrl({
          homeworkId,
          modifyNum,
          isShowAnswer: state.statu === 1 ? 0 : 1,
          endHomeworkModel: state.statu === 1 ? 0 : 1,
        });

        if (!resp || resp.code !== 200 || !resp.data?.url) {
          alert(resp?.msg || '生成作业链接失败');
          return;
        }
        location.replace(`../homeworkDetail/index.html?url=${encodeURIComponent(resp.data.url)}&from=${listFrom}`);
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

async function load() {
  setLoading(true);

  const resp = await window.electronAPI.hwList({
    statu: state.statu,
    pageIndex: state.pageIndex,
    pageSize: state.pageSize,
    subjectCode: state.subjectCode,
    homeworkType: state.homeworkType,
    homeworkName: state.homeworkName,
  });

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

load();
