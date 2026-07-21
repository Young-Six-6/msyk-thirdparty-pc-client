window.msykPrepareNativeViewers?.();
window.Theme?.initTheme();
const $ = (s) => document.querySelector(s);

const QT = {
	DANXUAN: 1,
	DUOXUAN: 2,
	ZHUGUAN: 3,
	TIANKONG: 4,
	PANDUAN: 5,
	GAICUO: 6
};

const MEDIA_TYPE = {
	IMAGE: 0,
	AUDIO: 1
};
const MAX_IMAGE_ANSWERS = 8;
const MAX_AUDIO_ANSWERS = 1;

function qs() {
	const p = new URLSearchParams(location.search);
	return Object.fromEntries(p.entries());
}

function toWpStatic(u) {
	if (!u) return '';
	if (/^https?:\/\//i.test(u)) return u;
	return 'https://msyk.wpstatic.cn/' + String(u).replace(/^\/+/, '');
}


function getMaterialUrl(m) {
	if (!m) return '';
	return toWpStatic(
		m.resourceUrl ||
		m.url ||
		m.fileUrl ||
		m.sourceFileUrl ||
		m.pictureUrl ||
		m.path ||
		''
	);
}

function getMaterialsFromInfo(info) {
	const src = [];
	if (Array.isArray(info?.materialRelas)) src.push(...info.materialRelas);
	if (Array.isArray(info?.dtkMaterialInfoList)) src.push(...info.dtkMaterialInfoList);
	if (Array.isArray(info?.materials)) src.push(...info.materials);

	const seen = new Set();
	return src
		.map(m => ({ raw: m, url: getMaterialUrl(m), title: m?.title || m?.name || m?.fileName || '' }))
		.filter(m => {
			if (!m.url || seen.has(m.url)) return false;
			seen.add(m.url);
			return true;
		});
}

function getMaterialViewerType(item, url) {
	const raw = item?.raw || {};
	const hint = [
		item?.title,
		raw.fileName,
		raw.fileType,
		raw.resourceType,
		raw.materialType,
		raw.suffix,
	].filter(Boolean).join(' ').toLowerCase();
	const path = String(url || '').toLowerCase().split(/[?#]/, 1)[0];
	if (path.endsWith('.pdf') || /(?:^|[.\s])pdf(?:\s|$)/.test(hint)) return 'pdf';
	if (/\.(png|jpe?g|gif|webp|bmp)$/.test(path)
		|| /x-oss-process=image/i.test(url)
		|| /\b(pptx?|powerpoint)\b/.test(hint)
		|| /\b(png|jpe?g|gif|webp|bmp|image|图片)\b/.test(hint)) return 'image';
	return 'web';
}

function updateMaterialNav() {
	const nav = $('#materialNav');
	const indicator = $('#materialIndicator');
	const prev = $('#prevMaterialBtn');
	const next = $('#nextMaterialBtn');
	const total = ctx.materials.length;

	if (!nav || !indicator || !prev || !next) return;

	if (total <= 1) {
		nav.style.display = 'none';
		return;
	}

	nav.style.display = 'flex';
	indicator.textContent = (ctx.materialIndex + 1) + ' / ' + total;
	prev.disabled = ctx.materialIndex <= 0;
	next.disabled = ctx.materialIndex >= total - 1;
}

function loadMaterialAt(index) {
	const wv = $('#pdfWv');
	const empty = $('#pdfEmpty');
	const total = ctx.materials.length;

	setupMaterialWebview();

	if (!total) {
		if (wv) wv.style.display = 'none';
		if (empty) {
			empty.style.display = 'block';
			empty.textContent = '本作业没有材料';
		}
		updateMaterialNav();
		return;
	}

	ctx.materialIndex = Math.max(0, Math.min(total - 1, Number(index || 0)));
	const item = ctx.materials[ctx.materialIndex];
	const url = item?.url || '';

	if (!url) {
		if (wv) wv.style.display = 'none';
		if (empty) {
			empty.style.display = 'block';
			empty.textContent = '当前材料地址为空';
		}
		updateMaterialNav();
		return;
	}

	if (empty) empty.style.display = 'none';
	if (wv) {
		wv.style.display = 'inline-flex';
		wv.dataset.viewerTitle = item?.title || ('作业材料 ' + (ctx.materialIndex + 1));
		wv.dataset.viewerType = getMaterialViewerType(item, url);
		if (wv.src !== url) wv.src = url;
		if (wv.dataset.viewerType === 'pdf'
			&& typeof wv.openNativeViewer === 'function'
			&& wv.__lastAutoOpenedPdf !== url) {
			wv.__lastAutoOpenedPdf = url;
			setTimeout(() => {
				if (wv.src === url) wv.openNativeViewer();
			}, 80);
		}
	}

	updateMaterialNav();
}


function fmtSec(sec) {
	sec = Math.max(0, Number(sec || 0));
	const m = String(Math.floor(sec / 60)).padStart(2, '0');
	const s = String(sec % 60).padStart(2, '0');
	return m + ':' + s;
}

function toast(msg, duration = 1800) {
	const el = $('#toast');
	el.textContent = String(msg || '');
	el.style.display = 'block';
	clearTimeout(toast._t);
	if (duration > 0) {
		toast._t = setTimeout(() => el.style.display = 'none', duration);
	}
}

$('#backBtn')?.addEventListener('click', () => {
	location.replace('../main/index.html?page=homework');
});

const ctx = {
	homeworkId: 0,
	modifyNum: 0,
	studentId: '',
	unitId: '',
	info: null,
	currentQIndex: 0,
	answersMap: {},
	dirtyFlag: {},
	timerSec: 0,
	materials: [],
	materialIndex: 0,
	debugModeEnabled: false,
	customTimeEnabled: false,
	customAnswerSec: 0,
	timerInterval: null,
	uploadingMedia: false
};

window.addEventListener('msyk-upload-progress', event => {
	if (!ctx.uploadingMedia) return;
	toast(event.detail?.message || '正在上传...', 0);
});


function isDebugModeEnabled() {
	try {
		if (window.MSYK_DEBUG?.get) return !!window.MSYK_DEBUG.get();
		if (window.MSYK_DEBUG_ENABLED !== undefined) return !!window.MSYK_DEBUG_ENABLED;
		return localStorage.getItem('msyk_debug_mode') === '1';
	} catch {
		return false;
	}
}

function debugLog(...args) {
	try {
		if (isDebugModeEnabled()) console.debug('[MSYK_DEBUG]', ...args);
	} catch {}
}

function customAnswerTimeKey(name) {
	return 'msyk_debug_answer_time_' + name + '_' + String(ctx.homeworkId || 'global');
}

function parseAnswerTimeInput(v) {
	const s = String(v || '').trim();
	if (!s) return NaN;

	if (/^\d+$/.test(s)) {
		return Math.max(0, Number(s));
	}

	const parts = s.split(':').map(x => x.trim());
	if (parts.length === 2 && parts.every(x => /^\d+$/.test(x))) {
		const m = Number(parts[0]);
		const sec = Number(parts[1]);
		if (sec >= 60) return NaN;
		return m * 60 + sec;
	}

	if (parts.length === 3 && parts.every(x => /^\d+$/.test(x))) {
		const h = Number(parts[0]);
		const m = Number(parts[1]);
		const sec = Number(parts[2]);
		if (m >= 60 || sec >= 60) return NaN;
		return h * 3600 + m * 60 + sec;
	}

	return NaN;
}

function isCustomAnswerTimeActive() {
	return !!(ctx.debugModeEnabled && ctx.customTimeEnabled);
}

function getSubmitUsedSec() {
	if (!isCustomAnswerTimeActive()) return Math.max(0, Number(ctx.timerSec || 0));

	const input = $('#debugAnswerTimeInput');
	const sec = parseAnswerTimeInput(input?.value || ctx.customAnswerSec);
	if (Number.isFinite(sec)) {
		ctx.customAnswerSec = sec;
		return sec;
	}

	return Math.max(0, Number(ctx.customAnswerSec || ctx.timerSec || 0));
}

function updateTimerDisplay() {
	const sec = isCustomAnswerTimeActive() ? getSubmitUsedSec() : ctx.timerSec;
	const timer = $('#timer');
	if (timer) timer.textContent = fmtSec(sec);
}

function saveCustomAnswerTimeState() {
	try {
		localStorage.setItem(customAnswerTimeKey('enabled'), ctx.customTimeEnabled ? '1' : '0');
		localStorage.setItem(customAnswerTimeKey('value'), String(ctx.customAnswerSec || 0));
	} catch {}
}

function initDebugAnswerTimeControls() {
	ctx.debugModeEnabled = isDebugModeEnabled();

	const panel = $('#debugAnswerTimePanel');
	const enabled = $('#debugAnswerTimeEnabled');
	const input = $('#debugAnswerTimeInput');
	const fillCorrect = $('#debugFillCorrectBtn');

	if (!panel || !enabled || !input || !fillCorrect) return;

	if (!ctx.debugModeEnabled) {
		panel.style.display = 'none';
		ctx.customTimeEnabled = false;
		enabled.checked = false;
		input.disabled = true;
		fillCorrect.disabled = true;
		updateTimerDisplay();
		return;
	}

	panel.style.display = 'inline-flex';
	fillCorrect.disabled = false;

	let storedEnabled = false;
	let storedValue = '';
	try {
		storedEnabled = localStorage.getItem(customAnswerTimeKey('enabled')) === '1';
		storedValue = localStorage.getItem(customAnswerTimeKey('value')) || '';
	} catch {}

	ctx.customTimeEnabled = storedEnabled;
	ctx.customAnswerSec = Number(storedValue || ctx.timerSec || 0);

	enabled.checked = ctx.customTimeEnabled;
	input.disabled = !ctx.customTimeEnabled;
	input.value = storedValue ? String(ctx.customAnswerSec) : '';

	if (!input.__debugAnswerTimeBound) {
		input.__debugAnswerTimeBound = true;
		input.addEventListener('input', () => {
			const sec = parseAnswerTimeInput(input.value);
			if (Number.isFinite(sec)) {
				ctx.customAnswerSec = sec;
				saveCustomAnswerTimeState();
				updateTimerDisplay();
			}
		});
	}

	if (!enabled.__debugAnswerTimeBound) {
		enabled.__debugAnswerTimeBound = true;
		enabled.addEventListener('change', () => {
			ctx.customTimeEnabled = !!enabled.checked;
			input.disabled = !ctx.customTimeEnabled;

			if (ctx.customTimeEnabled && !input.value.trim()) {
				ctx.customAnswerSec = Math.max(0, Number(ctx.timerSec || 0));
				input.value = String(ctx.customAnswerSec);
			} else {
				const sec = parseAnswerTimeInput(input.value);
				if (Number.isFinite(sec)) ctx.customAnswerSec = sec;
			}

			saveCustomAnswerTimeState();
			updateTimerDisplay();
			debugLog('custom answer time', {
				enabled: ctx.customTimeEnabled,
				seconds: getSubmitUsedSec()
			});
		});
	}

	if (!fillCorrect.__debugFillCorrectBound) {
		fillCorrect.__debugFillCorrectBound = true;
		fillCorrect.addEventListener('click', fillCorrectAnswers);
	}

	updateTimerDisplay();
}


function getCards() {
	const d = ctx.info || {};
	return d.homeworkCardList || d.dtkExercises || [];
}

function getSavedStudentAnswer(question) {
	const candidates = [
		question?.studentAnswer,
		question?.savedAnswer,
		question?.studentAnswerValue,
	];
	for (const value of candidates) {
		if (value !== undefined && value !== null && String(value) !== '') return value;
	}
	return '';
}

function cardFields(q, idx) {
	const sn = q.serialNumber || q.orderNum || q.questionNum || (idx + 1),
		qt = Number(q.questionType ?? 0);
	let options = null;
	try {
		if (typeof q.options === 'string') options = JSON.parse(q.options);
		else if (Array.isArray(q.options)) options = q.options;
	} catch {}
	const homeworkResourceId = q.homeworkResourceId ?? q.resourceId ?? q.id ?? q.homeworkCardId ?? 0;
	const questionId = q.questionId || q.resId || q.questionResId || '';
	const studentAnswer = getSavedStudentAnswer(q);
	const existingAnswer = qt === QT.TIANKONG
		&& studentAnswer !== ''
		&& Array.isArray(q.blankList)
		? JSON.stringify(q.blankList.map(value => String(value ?? '')))
		: studentAnswer;
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

function isObjective(qt) {
	return qt === QT.DANXUAN || qt === QT.DUOXUAN || qt === QT.TIANKONG || qt === QT.PANDUAN;
}

function isImageType(qt) {
	return qt === QT.ZHUGUAN || qt === QT.GAICUO;
}

function escapeHtml(value) {
	const el = document.createElement('span');
	el.textContent = String(value ?? '');
	return el.innerHTML;
}

function parseListValue(value) {
	if (Array.isArray(value)) return value.map(item => String(item ?? '')).filter(Boolean);
	const text = String(value ?? '').trim();
	if (!text) return [];
	try {
		const parsed = JSON.parse(text);
		if (Array.isArray(parsed)) return parsed.map(item => String(item ?? '')).filter(Boolean);
	} catch {}
	return text.split(',').map(item => item.trim()).filter(Boolean);
}

function inferMediaType(url, fallback = 0) {
	return /\.(?:mp3|m4a|aac|wav|ogg|webm)(?:$|[?#])/i.test(String(url || ''))
		? MEDIA_TYPE.AUDIO
		: Number(fallback || 0);
}

function normalizeMediaAnswer(item, fallback = {}) {
	if (typeof item === 'string') item = { url: item };
	item = item || {};
	const url = toWpStatic(item.url || item.pictureUrl || item.downloadUrl || item.fileUrl || fallback.url || '');
	if (!url) return null;
	const rawType = item.answerType ?? item.pictureStatus ?? fallback.answerType ?? 0;
	return {
		url,
		uuid: String(item.uuid || item.UUID || fallback.uuid || ''),
		studentAnswerId: String(item.studentAnswerId ?? item.answerId ?? fallback.studentAnswerId ?? '-1'),
		answerType: inferMediaType(url, rawType),
		bitId: String(item.bitId ?? item.dzbId ?? fallback.bitId ?? '-1'),
		quesNum: String(item.quesNum ?? fallback.quesNum ?? ''),
		durationTime: String(item.durationTime ?? item.time ?? fallback.durationTime ?? '')
	};
}

function getQuestionMedia(question) {
	if (Array.isArray(question._mediaAnswers)) return question._mediaAnswers;

	const arraySource = [
		question.picUrlList,
		question.upLoadPicList,
		question.mUploadPicList,
		question.answerServerList,
		question.mediaAnswers
	].find(value => Array.isArray(value) && value.length);

	let media = [];
	if (arraySource) {
		media = arraySource.map(item => normalizeMediaAnswer(item)).filter(Boolean);
	} else {
		const urls = parseListValue(question.pictureUrl || question.studentAnswer || '');
		const ids = parseListValue(question.studentAnswerIds || question.studentAnswerId || '');
		const types = parseListValue(question.answerType || '');
		const bitIds = parseListValue(question.bitIds || question.bitId || '');
		const quesNums = parseListValue(question.quesNums || question.quesNum || '');
		media = urls.map((url, index) => normalizeMediaAnswer(url, {
			studentAnswerId: ids[index] || '-1',
			answerType: types[index] || 0,
			bitId: bitIds[index] || '-1',
			quesNum: quesNums[index] || ''
		})).filter(Boolean);
	}

	question._mediaAnswers = media;
	return media;
}

function syncQuestionMediaFields(question) {
	const media = getQuestionMedia(question);
	const previousMax = Number(question.quesMaxNum) || 0;
	question.pictureUrl = media.map(item => item.url).join(',');
	question.studentAnswerIds = media.map(item => item.studentAnswerId || '-1').join(',');
	question.answerType = media.map(item => item.answerType).join(',');
	question.bitIds = media.map(item => item.bitId || '-1').join(',');
	question.quesNums = media.map(item => item.quesNum || '').join(',');
	question.quesMaxNum = Math.max(previousMax, ...media.map(item => Number(item.quesNum) || 0));
}

function createAnswerUuid() {
	if (window.crypto?.randomUUID) return window.crypto.randomUUID();
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
		const random = window.crypto.getRandomValues(new Uint8Array(1))[0] & 15;
		const value = char === 'x' ? random : (random & 3) | 8;
		return value.toString(16);
	});
}

function nextMediaQuesNum(question) {
	const media = getQuestionMedia(question);
	return Math.max(Number(question.quesMaxNum) || 0, ...media.map(item => Number(item.quesNum) || 0)) + 1;
}

function renderMediaAnswers(question, questionIndex) {
	const media = getQuestionMedia(question);
	if (!media.length) return '<div class="qMeta">当前没有图片或音频答案</div>';

	return '<div class="mediaAnswerList">' + media.map((item, mediaIndex) => {
		const url = escapeHtml(item.url);
		const preview = item.answerType === MEDIA_TYPE.AUDIO
			? '<audio class="audioAnswer" controls preload="metadata" src="' + url + '"></audio>'
			: '<img class="thumb" src="' + url + '" alt="图片答案" />';
		const meta = item.answerType === MEDIA_TYPE.AUDIO
			? '音频' + (item.durationTime ? ' ' + escapeHtml(item.durationTime) : '')
			: '图片';
		return '<div class="mediaAnswerItem">' + preview + '<div class="mediaAnswerFooter"><span class="qMeta">' + meta + '</span><button class="btn mediaDeleteBtn" type="button" data-act="remove-media" data-idx="' + questionIndex + '" data-media-index="' + mediaIndex + '">删除</button></div></div>';
	}).join('') + '</div>';
}

function parseAnswerArray(value) {
	if (Array.isArray(value)) return value.map(v => String(v ?? ''));
	if (value === null || value === undefined) return [];

	const text = String(value).trim();
	if (!text) return [];
	try {
		const parsed = JSON.parse(text);
		if (Array.isArray(parsed)) return parsed.map(v => String(v ?? ''));
	} catch {}
	return [text];
}

function decodeChoiceAnswer(value, multiple) {
	const parts = parseAnswerArray(value);
	const raw = parts.join('');
	if (multiple && isBitmap(raw)) {
		let letters = '';
		for (let i = 0; i < raw.length && i < 10; i++) {
			if (raw[i] === '1') letters += String.fromCharCode(65 + i);
		}
		return letters;
	}
	return (raw.toUpperCase().match(/[A-J]/g) || []).join('');
}

function normalizeJudgmentAnswer(value) {
	const raw = parseAnswerArray(value)[0] || '';
	const text = String(raw).trim().toLowerCase();
	if (['true', '1', '对', '正确'].includes(text)) return '对';
	if (['false', '0', '错', '错误'].includes(text)) return '错';
	return raw;
}

function getCorrectAnswerValue(question, questionType) {
	const answer = question?.answer ?? question?.correctAnswer ?? question?.standardAnswer ?? '';
	if (questionType === QT.DANXUAN) return decodeChoiceAnswer(answer, false).slice(0, 1);
	if (questionType === QT.DUOXUAN) return decodeChoiceAnswer(answer, true);
	if (questionType === QT.TIANKONG) {
		const blanks = Array.isArray(question?.blankList) && question.blankList.length
			? question.blankList.map(v => String(v ?? ''))
			: parseAnswerArray(answer);
		return blanks.length ? JSON.stringify(blanks) : '';
	}
	if (questionType === QT.PANDUAN) return normalizeJudgmentAnswer(answer);
	return '';
}

async function fillCorrectAnswers() {
	if (!ctx.debugModeEnabled || !isDebugModeEnabled()) return;

	const button = $('#debugFillCorrectBtn');
	if (!button || button.disabled) return;
	button.disabled = true;
	button.textContent = '获取中...';

	try {
		const response = await window.msykAPI.getCorrectAnswers({
			homeworkId: ctx.homeworkId,
			modifyNum: ctx.modifyNum,
			unitId: ctx.unitId,
		});
		const answerCards = response?.data?.homeworkCardList;
		if (!response || response.code !== 200 || !Array.isArray(answerCards)) {
			throw new Error(response?.msg || '未获取到标准答案');
		}

		const bySerial = new Map();
		const byOrder = new Map();
		answerCards.forEach((question, index) => {
			const fields = cardFields(question, index);
			bySerial.set(String(fields.serialNumber), question);
			byOrder.set(String(fields.orderNum), question);
		});

		let filled = 0;
		getCards().forEach((question, index) => {
			const fields = cardFields(question, index);
			if (!isObjective(fields.questionType)) return;
			const answerQuestion = bySerial.get(String(fields.serialNumber)) || byOrder.get(String(fields.orderNum));
			if (!answerQuestion) return;
			const value = getCorrectAnswerValue(answerQuestion, fields.questionType);
			if (!value) return;
			setAnswer(fields.serialNumber, value);
			filled++;
		});

		renderQuestions();
		toast(filled ? `已填入 ${filled} 道客观题，尚未保存` : '没有可自动填入的客观题');
	} catch (error) {
		alert('获取正确答案失败: ' + (error?.message || String(error)));
	} finally {
		button.disabled = false;
		button.textContent = '一键正确';
	}
}

function navigateTo(i) {
	const c = getCards();
	if (!c.length) return;
	ctx.currentQIndex = Math.max(0, Math.min(c.length - 1, i));
	renderQuestions();
}

function updateNavButtons() {
	const c = getCards();
	const p = $('#prevQBtn'),
		n = $('#nextQBtn');
	if (p) p.disabled = ctx.currentQIndex <= 0;
	if (n) n.disabled = ctx.currentQIndex >= c.length - 1;
}

function updateIndicator() {
	const c = getCards(),
		el = $('#qIndicator');
	if (el) el.textContent = c.length ? '第 ' + (ctx.currentQIndex + 1) + ' / ' + c.length + ' 题' : '无题目';
}

function getAnswer(sn) {
	return ctx.answersMap[sn] ?? '';
}

function setAnswer(sn, val) {
	if (String(ctx.answersMap[sn] || '') !== String(val)) {
		ctx.answersMap[sn] = val;
		ctx.dirtyFlag[sn] = true;
	}
}

function isBitmap(s) {
	return /^[01]{4,}$/.test(s);
}

function encodeMultiChoice(letters) {
	if (isBitmap(letters)) return letters;
	const arr = new Array(10).fill('0');
	for (const ch of String(letters || '')) {
		const i = ch.toUpperCase().charCodeAt(0) - 65;
		if (i >= 0 && i < 10) arr[i] = '1';
	}
	return arr.join('');
}

function encodeFillBlank(v) {
	return JSON.stringify(parseAnswerArray(v));
}

async function saveAllAnswers() {
	const cards = getCards(),
		serials = [],
		answers = [],
		expected = new Map();
	for (let i = 0; i < cards.length; i++) {
		const f = cardFields(cards[i], i);
		if (!isObjective(f.questionType)) continue;
		const ans = getAnswer(f.serialNumber);
		if (!ans && !f.existingAnswer) continue;
		const raw = String(ans || f.existingAnswer || '');
		let encoded = raw;
		if (f.questionType === QT.DUOXUAN) encoded = encodeMultiChoice(raw);
		else if (f.questionType === QT.TIANKONG) encoded = encodeFillBlank(raw);
		serials.push(String(f.serialNumber));
		answers.push(encoded);
		expected.set(String(f.serialNumber), {
			answer: encoded,
			questionType: f.questionType,
		});
	}
	if (!serials.length) return { ok: true, verified: true, skipped: true };
	const resp = await window.msykAPI.saveCardAnswerObjectives({
		homeworkId: String(ctx.homeworkId),
		studentId: String(ctx.studentId),
		serialNumbers: serials.join(';'),
		answers: answers.join(';'),
		modifyNum: String(ctx.modifyNum),
		unitId: String(ctx.unitId)
	});
	if (!resp || resp.code !== 200) {
		alert('请求失败: ' + (resp?.msg || '无响应'));
		return { ok: false, verified: false };
	}
	const payload = parseApiPayload(resp.data, resp.raw);
	const businessCode = String(payload?.code ?? '');
	if (businessCode !== '10000') {
		const message = payload?.message || payload?.msg || resp.msg || `业务码 ${businessCode || '缺失'}`;
		alert('保存失败: ' + String(message).slice(0, 160));
		return { ok: false, verified: false };
	}

	for (let i = 0; i < cards.length; i++) {
		const fields = cardFields(cards[i], i);
		const saved = expected.get(String(fields.serialNumber));
		if (saved) {
			cards[i].studentAnswer = saved.answer;
			if (saved.questionType === QT.TIANKONG) cards[i].blankList = parseAnswerArray(saved.answer);
		}
	}
	saveLocalDraft(expected);
	Object.keys(ctx.dirtyFlag).forEach(k => ctx.dirtyFlag[k] = false);

	const verification = await verifySavedAnswers(expected);
	if (verification.info) ctx.info = verification.info;
	return { ok: true, verified: verification.verified, reason: verification.reason };
}

function parseApiPayload(data, raw) {
	if (data && typeof data === 'object') return data;
	for (const value of [data, raw]) {
		if (typeof value !== 'string' || !value.trim()) continue;
		try {
			const parsed = JSON.parse(value);
			if (parsed && typeof parsed === 'object') return parsed;
		} catch {}
	}
	return null;
}

function comparableAnswer(value, questionType) {
	const raw = String(value ?? '');
	if (questionType === QT.DUOXUAN) return encodeMultiChoice(raw);
	if (questionType === QT.TIANKONG) return JSON.stringify(parseAnswerArray(value));
	if (questionType === QT.PANDUAN) return normalizeJudgmentAnswer(raw);
	return raw.trim().toUpperCase();
}

function localDraftKey() {
	return `msyk-homework-draft:${ctx.studentId}:${ctx.homeworkId}:${ctx.modifyNum}`;
}

function saveLocalDraft(expected) {
	try {
		localStorage.setItem(localDraftKey(), JSON.stringify({
			savedAt: Date.now(),
			answers: Array.from(expected, ([serialNumber, value]) => ({ serialNumber, ...value })),
		}));
	} catch (error) {
		console.warn('[save] 本机草稿写入失败:', error);
	}
}

function loadLocalDraft() {
	try {
		const parsed = JSON.parse(localStorage.getItem(localDraftKey()) || 'null');
		if (!parsed || !Array.isArray(parsed.answers)) return [];
		if (Date.now() - Number(parsed.savedAt || 0) > 7 * 24 * 60 * 60 * 1000) {
			localStorage.removeItem(localDraftKey());
			return [];
		}
		return parsed.answers;
	} catch {
		return [];
	}
}

function clearLocalDraft() {
	try { localStorage.removeItem(localDraftKey()); } catch {}
}

function restoreLocalDraftFallback() {
	const bySerial = new Map(loadLocalDraft().map(item => [String(item.serialNumber), item]));
	let restored = 0;
	getCards().forEach((question, index) => {
		const fields = cardFields(question, index);
		if (!isObjective(fields.questionType) || fields.existingAnswer !== '') return;
		const draft = bySerial.get(String(fields.serialNumber));
		if (!draft || draft.answer === undefined || draft.answer === null) return;
		ctx.answersMap[fields.serialNumber] = String(draft.answer);
		restored++;
	});
	return restored;
}

async function verifySavedAnswers(expected) {
	let lastReason = '服务器暂未返回刚保存的答案';
	for (let attempt = 0; attempt < 2; attempt++) {
		if (attempt) await new Promise(resolve => setTimeout(resolve, 450));
		const response = await window.msykAPI.getHomeworkCardInfo({
			homeworkId: ctx.homeworkId,
			studentId: ctx.studentId,
			modifyNum: ctx.modifyNum,
			unitId: ctx.unitId,
		});
		if (!response || response.code !== 200) {
			lastReason = response?.msg || '重新读取作业失败';
			continue;
		}

		const freshInfo = response.data || {};
		const freshCards = freshInfo.homeworkCardList || freshInfo.dtkExercises || [];
		const actualBySerial = new Map();
		freshCards.forEach((question, index) => {
			const fields = cardFields(question, index);
			actualBySerial.set(String(fields.serialNumber), fields);
		});
		const missing = [];
		for (const [serialNumber, saved] of expected) {
			const actual = actualBySerial.get(serialNumber);
			if (!actual || comparableAnswer(actual.existingAnswer, saved.questionType)
				!== comparableAnswer(saved.answer, saved.questionType)) {
				missing.push(serialNumber);
			}
		}
		if (!missing.length) return { verified: true, info: freshInfo };
		lastReason = `第 ${missing.join('、')} 题尚未回读到保存值`;
	}
	console.warn('[save] 保存接口成功，但回读校验未通过:', lastReason);
	return { verified: false, reason: lastReason };
}

function renderObjInput(q, f) {
	const sn = f.serialNumber,
		existing = getAnswer(sn) || f.existingAnswer || '',
		qt = f.questionType,
		esc = (s) => {
			const el = document.createElement('span');
			el.textContent = s;
			return el.innerHTML;
		};
	if (qt === QT.DANXUAN) {
		const ls = f.options || ['A', 'B', 'C', 'D'];
		return '<div class="optGroup" data-sn="' + sn + '">' + ls.map((_, i) => {
			const lt = String.fromCharCode(65 + i);
			return '<label class="optLabel"><input type="radio" name="q_' + sn + '" value="' + lt + '"' + (existing === lt ? ' checked' : '') + '><span class="optBadge">' + lt + '</span></label>';
		}).join('') + '</div>';
	}
	if (qt === QT.DUOXUAN) {
		let checkedLetters = '';
		if (isBitmap(existing)) {
			for (let i = 0; i < existing.length && i < 10; i++) {
				if (existing[i] === '1') checkedLetters += String.fromCharCode(65 + i);
			}
		} else {
			checkedLetters = existing || '';
		}
		const ss = new Set(checkedLetters.split('')),
			ls = f.options || ['A', 'B', 'C', 'D'];
		return '<div class="optGroup" data-sn="' + sn + '">' + ls.map((_, i) => {
			const lt = String.fromCharCode(65 + i);
			return '<label class="optLabel"><input type="checkbox" name="q_' + sn + '" value="' + lt + '"' + (ss.has(lt) ? ' checked' : '') + '><span class="optBadge">' + lt + '</span></label>';
		}).join('') + '</div>';
	}
	if (qt === QT.TIANKONG) {
		const values = parseAnswerArray(existing);
		const blankCount = Math.max(
			1,
			Number(q.blankNum || 0),
			Array.isArray(q.blankList) ? q.blankList.length : 0,
			values.length,
		);
		while (values.length < blankCount) values.push('');
		return '<div class="tiankongRow" data-sn="' + sn + '">' + values.map((value, index) =>
			'<input type="text" class="tkInput" placeholder="第 ' + (index + 1) + ' 空" value="' + esc(value) + '" data-sn="' + sn + '" data-blank-index="' + index + '">'
		).join('') + '</div>';
	}
	if (qt === QT.PANDUAN) return '<div class="optGroup" data-sn="' + sn + '"><label class="optLabel"><input type="radio" name="q_' + sn + '" value="对"' + (existing === '对' || existing === 'true' ? ' checked' : '') + '><span class="optBadge">✓</span></label><label class="optLabel"><input type="radio" name="q_' + sn + '" value="错"' + (existing === '错' || existing === 'false' ? ' checked' : '') + '><span class="optBadge">✗</span></label></div>';
	return '';
}

function renderQuestions() {
	const list = $('#qList'),
		cards = getCards();
	if (!cards.length) {
		list.innerHTML = '<div class="empty">没有题目</div>';
		updateIndicator();
		updateNavButtons();
		return;
	}
	list.innerHTML = cards.map((q, idx) => {
		const f = cardFields(q, idx),
			isActive = idx === ctx.currentQIndex,
			qt = f.questionType,
			sn = f.serialNumber,
			tn = {
				1: '单选题',
				2: '多选题',
				3: '主观题',
				4: '填空题',
				5: '判断题',
				6: '改错题'
			} [qt] || ('题型' + qt);
		let body = '';
		if (isObjective(qt)) body = renderObjInput(q, f);
		else if (isImageType(qt)) {
			const media = getQuestionMedia(q);
			const imageCount = media.filter(item => item.answerType === MEDIA_TYPE.IMAGE).length;
			const audioCount = media.filter(item => item.answerType === MEDIA_TYPE.AUDIO).length;
			body = '<div class="qAnsRow"><button class="btn" type="button" data-act="upload-image" data-idx="' + idx + '"' + (imageCount >= MAX_IMAGE_ANSWERS ? ' disabled' : '') + '>上传图片</button><button class="btn" type="button" data-act="upload-audio" data-idx="' + idx + '"' + (audioCount >= MAX_AUDIO_ANSWERS ? ' disabled' : '') + '>添加音频</button></div>' + renderMediaAnswers(q, idx);
		} else body = '<div class="qMeta">暂不支持该题型作答</div>';
		const dm = ctx.dirtyFlag[sn] ? ' <span class="dirtyMark">*</span>' : '';
		return '<div class="qCard' + (isActive ? ' active' : '') + '" data-idx="' + idx + '"><div class="qTop"><div><div class="qName">第 ' + sn + ' 题 <span class="qTypeBadge">' + tn + '</span>' + dm + '</div><div class="qMeta">score=' + f.score + '</div></div><div class="qMeta">ID: ' + (f.resourceId || '-') + '</div></div><div class="qBody">' + body + '</div></div>';
	}).join('');
	list.querySelectorAll('.qCard').forEach(c => c.addEventListener('click', e => {
		if (!e.target.closest('button,input,label,audio')) navigateTo(Number(c.dataset.idx));
	}));
	list.querySelectorAll('button[data-act="upload-image"]').forEach(b => b.addEventListener('click', () => {
		ctx._uploadTarget = Number(b.dataset.idx);
		$('#fileInput').value = '';
		$('#fileInput').click();
	}));
	list.querySelectorAll('button[data-act="upload-audio"]').forEach(b => b.addEventListener('click', () => {
		ctx._uploadTarget = Number(b.dataset.idx);
		$('#audioInput').value = '';
		$('#audioInput').click();
	}));
	list.querySelectorAll('button[data-act="remove-media"]').forEach(b => b.addEventListener('click', async () => {
		await removeMediaAnswer(Number(b.dataset.idx), Number(b.dataset.mediaIndex));
	}));
	list.querySelectorAll('.optGroup input[type="radio"]').forEach(r => r.addEventListener('change', () => {
		const g = r.closest('.optGroup');
		setAnswer(g.dataset.sn, r.value);
		refreshDirtyMark(g.dataset.sn);
	}));
	list.querySelectorAll('.optGroup input[type="checkbox"]').forEach(cb => cb.addEventListener('change', () => {
		const g = cb.closest('.optGroup');
		const v = Array.from(g.querySelectorAll('input[type="checkbox"]:checked')).map(c => c.dataset.letter || c.value).sort().join('');
		setAnswer(g.dataset.sn, v);
		refreshDirtyMark(g.dataset.sn);
	}));
	list.querySelectorAll('.tkInput').forEach(inp => inp.addEventListener('input', () => {
		const row = inp.closest('.tiankongRow');
		const values = Array.from(row.querySelectorAll('.tkInput')).map(item => item.value);
		setAnswer(inp.dataset.sn, JSON.stringify(values));
		refreshDirtyMark(inp.dataset.sn);
	}));
	const ac = list.querySelector('.qCard.active');
	if (ac) ac.scrollIntoView({
		behavior: 'smooth',
		block: 'nearest'
	});
	updateIndicator();
	updateNavButtons();
}

function refreshDirtyMark(sn) {
	const card = document.querySelector('.optGroup[data-sn="' + sn + '"]')?.closest('.qCard') || document.querySelector('.tiankongRow[data-sn="' + sn + '"]')?.closest('.qCard');
	if (!card) return;
	const m = card.querySelector('.dirtyMark');
	if (ctx.dirtyFlag[sn]) {
		if (!m) {
			const n = card.querySelector('.qName');
			if (n) n.insertAdjacentHTML('beforeend', ' <span class="dirtyMark">*</span>');
		}
	} else {
		if (m) m.remove();
	}
}

async function refreshTime() {
	const t = await window.msykAPI.getHomeworkTime({
		homeworkId: ctx.homeworkId,
		studentId: ctx.studentId,
		unitId: ctx.unitId
	});
	if (t && t.code === 200) {
		const hs = t.data?.homeworkStatu || t.data?.homeworkStatus || t.data;
		const sec = Number(hs?.answerTime || 0);
		if (sec > 0) ctx.timerSec = sec;
	}
	if (ctx.timerSec === 0 && ctx.info) ctx.timerSec = Math.floor((Date.now() - (ctx.info.stuStartTime || Date.now())) / 1000);
	if (ctx.timerSec < 0) ctx.timerSec = 0;
	updateTimerDisplay();
}

async function boot() {
	const q = qs();
	ctx.homeworkId = Number(q.homeworkId || 0);
	ctx.modifyNum = Number(q.modifyNum || 0);
	if (!ctx.homeworkId) {
		alert('缺少 homeworkId');
		return;
	}
	const s = await window.msykAPI.apiGetSession();
	const ss = s?.data || s || {};
	ctx.studentId = ss.studentId || '';
	ctx.unitId = ss.unitId || '';
	if (!ctx.studentId || !ctx.unitId) {
		alert('缺少 studentId/unitId');
		return;
	}
	const ck = await window.msykAPI.checkHomeworkEndTime({
		homeworkId: ctx.homeworkId,
		unitId: ctx.unitId
	});
	if (!ck || ck.code !== 200) {
		alert(ck?.msg || 'checkHomeworkEndTime 失败');
		return;
	}
	const info = await window.msykAPI.getHomeworkCardInfo({
		homeworkId: ctx.homeworkId,
		studentId: ctx.studentId,
		modifyNum: ctx.modifyNum,
		unitId: ctx.unitId
	});
	if (!info || info.code !== 200) {
		alert(info?.msg || 'getHomeworkCardInfo 失败');
		return;
	}
	ctx.info = info.data || {};
	ctx.answersMap = {};
	getCards().forEach((question, index) => {
		const fields = cardFields(question, index);
		if (isObjective(fields.questionType) && fields.existingAnswer !== '') {
			ctx.answersMap[fields.serialNumber] = String(fields.existingAnswer);
		}
	});
	const restoredDraftCount = restoreLocalDraftFallback();
	$('#title').textContent = ctx.info.homeworkName || '做作业';
	ctx.materials = getMaterialsFromInfo(ctx.info);
	ctx.materialIndex = 0;
	loadMaterialAt(0);
	renderQuestions();
	if (restoredDraftCount) toast(`已恢复本机保存的 ${restoredDraftCount} 道答案`, 3000);
	await refreshTime();
	initDebugAnswerTimeControls();
	if (ctx.timerInterval) clearInterval(ctx.timerInterval);
	ctx.timerInterval = setInterval(() => {
		ctx.timerSec++;
		updateTimerDisplay();
	}, 1000);
}

function blobToBase64(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = String(reader.result || '');
			const comma = dataUrl.indexOf(',');
			if (comma < 0) reject(new Error('文件编码失败'));
			else resolve(dataUrl.slice(comma + 1));
		};
		reader.onerror = () => reject(reader.error || new Error('文件读取失败'));
		reader.readAsDataURL(blob);
	});
}

async function imageFileToJpeg(file) {
	let source = null;
	let closeSource = () => {};

	if (typeof createImageBitmap === 'function') {
		try {
			const bitmap = await createImageBitmap(file);
			source = bitmap;
			closeSource = () => bitmap.close();
		} catch (error) {
			console.warn('[upload] createImageBitmap failed, fallback to Image:', error);
		}
	}

	if (!source) {
		const objectUrl = URL.createObjectURL(file);
		try {
			source = await new Promise((resolve, reject) => {
				const image = new Image();
				image.onload = () => resolve(image);
				image.onerror = () => reject(new Error('手机 WebView 无法解码所选图片'));
				image.src = objectUrl;
			});
			closeSource = () => URL.revokeObjectURL(objectUrl);
		} catch (error) {
			URL.revokeObjectURL(objectUrl);
			throw error;
		}
	}

	try {
		const maxSide = 2560;
		const sourceWidth = Number(source.naturalWidth || source.width || 0);
		const sourceHeight = Number(source.naturalHeight || source.height || 0);
		if (!sourceWidth || !sourceHeight) throw new Error('所选图片尺寸无效');
		const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
		const width = Math.max(1, Math.round(sourceWidth * scale));
		const height = Math.max(1, Math.round(sourceHeight * scale));
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) throw new Error('无法处理图片');
		context.fillStyle = '#fff';
		context.fillRect(0, 0, width, height);
		context.drawImage(source, 0, 0, width, height);
		const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88));
		if (!blob) throw new Error('图片压缩失败');
		return blob;
	} finally {
		closeSource();
	}
}

function readAudioDuration(file) {
	return new Promise(resolve => {
		const audio = document.createElement('audio');
		const objectUrl = URL.createObjectURL(file);
		let settled = false;
		const finish = value => {
			if (settled) return;
			settled = true;
			URL.revokeObjectURL(objectUrl);
			audio.removeAttribute('src');
			resolve(value);
		};
		const timeout = setTimeout(() => finish(''), 5000);
		audio.addEventListener('loadedmetadata', () => {
			clearTimeout(timeout);
			const seconds = Math.max(0, Math.round(Number(audio.duration) || 0));
			finish(seconds ? fmtSec(seconds) : '');
		}, { once: true });
		audio.addEventListener('error', () => {
			clearTimeout(timeout);
			finish('');
		}, { once: true });
		audio.preload = 'metadata';
		audio.src = objectUrl;
	});
}

async function uploadMediaBlob(questionIndex, blob, { mediaType, extension, contentType, durationTime = '' }) {
	const question = getCards()[questionIndex];
	if (!question) throw new Error('未找到上传目标题目');
	const fields = cardFields(question, questionIndex);
	if (!fields.questionId) throw new Error('缺少 questionId');

	const media = getQuestionMedia(question);
	const count = media.filter(item => item.answerType === mediaType).length;
	if (mediaType === MEDIA_TYPE.IMAGE && count >= MAX_IMAGE_ANSWERS) throw new Error('图片答案已达到 8 张上限');
	if (mediaType === MEDIA_TYPE.AUDIO && count >= MAX_AUDIO_ANSWERS) throw new Error('音频答案已达到上限');

	const answerUuid = createAnswerUuid();
	const bitId = String(Date.now()).slice(-7);
	const quesNum = nextMediaQuesNum(question);
	const result = await window.msykAPI.uploadHomeworkMedia({
		base64: await blobToBase64(blob),
		ext: extension,
		contentType,
		mediaType,
		durationTime,
		uuid: answerUuid,
		bitId,
		questionId: String(fields.questionId),
		quesNum: String(quesNum),
		homeworkId: String(ctx.homeworkId),
		studentId: String(ctx.studentId),
		modifyNum: String(ctx.modifyNum),
		unitId: String(ctx.unitId)
	});
	if (!result || result.code !== 200 || !result.data) {
		throw new Error(result?.msg || '上传失败');
	}

	const savedAnswer = normalizeMediaAnswer(result.data, {
		uuid: answerUuid,
		bitId,
		quesNum,
		answerType: mediaType,
		durationTime
	});
	if (!savedAnswer) throw new Error('上传成功但返回的媒体地址为空');
	media.push(savedAnswer);
	syncQuestionMediaFields(question);
}

async function uploadSelectedImages(questionIndex, files) {
	if (ctx.uploadingMedia) return;
	if (!files.length) {
		toast('未能读取所选图片，请重新选择', 3000);
		return;
	}
	ctx.uploadingMedia = true;
	try {
		const question = getCards()[questionIndex];
		if (!question) throw new Error('未找到上传目标题目');
		const currentCount = getQuestionMedia(question).filter(item => item.answerType === MEDIA_TYPE.IMAGE).length;
		if (currentCount + files.length > MAX_IMAGE_ANSWERS) {
			throw new Error(`每题最多上传 ${MAX_IMAGE_ANSWERS} 张图片`);
		}
		for (let index = 0; index < files.length; index++) {
			toast(`正在处理图片 ${index + 1}/${files.length}`, 0);
			const jpeg = await imageFileToJpeg(files[index]);
			await uploadMediaBlob(questionIndex, jpeg, {
				mediaType: MEDIA_TYPE.IMAGE,
				extension: 'jpg',
				contentType: 'image/jpeg'
			});
			renderQuestions();
		}
		toast('图片已上传');
	} catch (error) {
		toast('图片上传失败', 3000);
		alert('图片上传失败: ' + (error?.message || String(error)));
	} finally {
		ctx.uploadingMedia = false;
	}
}

async function uploadSelectedAudio(questionIndex, file) {
	if (ctx.uploadingMedia || !file) return;
	ctx.uploadingMedia = true;
	try {
		const extension = String(file.name.split('.').pop() || '').toLowerCase();
		if (extension !== 'mp3') throw new Error('原版作业音频使用 MP3，请选择 .mp3 文件');
		toast('正在上传音频');
		const durationTime = await readAudioDuration(file);
		await uploadMediaBlob(questionIndex, file, {
			mediaType: MEDIA_TYPE.AUDIO,
			extension: 'mp3',
			contentType: file.type || 'audio/mpeg',
			durationTime
		});
		toast('音频已上传');
		renderQuestions();
	} catch (error) {
		toast('音频上传失败', 3000);
		alert('音频上传失败: ' + (error?.message || String(error)));
	} finally {
		ctx.uploadingMedia = false;
	}
}

async function removeMediaAnswer(questionIndex, mediaIndex) {
	if (ctx.uploadingMedia) return;
	const question = getCards()[questionIndex];
	const media = question ? getQuestionMedia(question) : [];
	const answer = media[mediaIndex];
	if (!answer) return;

	ctx.uploadingMedia = true;
	try {
		const answerId = String(answer.studentAnswerId || '');
		if (answerId && answerId !== '-1' && answerId !== '-10001') {
			const response = await window.msykAPI.removeCardAnswer({
				answerId,
				unitId: String(ctx.unitId)
			});
			if (!response || response.code !== 200) throw new Error(response?.msg || '删除失败');
		}
		media.splice(mediaIndex, 1);
		syncQuestionMediaFields(question);
		toast('已删除');
		renderQuestions();
	} catch (error) {
		alert('删除答案失败: ' + (error?.message || String(error)));
	} finally {
		ctx.uploadingMedia = false;
	}
}

$('#fileInput')?.addEventListener('change', async event => {
	const files = Array.from(event.target.files || []);
	await uploadSelectedImages(Number(ctx._uploadTarget), files);
});

$('#audioInput')?.addEventListener('change', async event => {
	const file = event.target.files && event.target.files[0];
	await uploadSelectedAudio(Number(ctx._uploadTarget), file);
});

function buildAnswerInfo() {
	const cards = getCards(),
		info = [];
	for (let i = 0; i < cards.length; i++) {
		const q = cards[i],
			f = cardFields(q, i),
			qt = f.questionType;
		if (isObjective(qt)) {
			const ans = getAnswer(f.serialNumber);
			if (!ans && !f.existingAnswer) continue;
			let encoded = String(ans || f.existingAnswer || '');
			if (qt === QT.DUOXUAN) encoded = encodeMultiChoice(encoded);
			else if (qt === QT.TIANKONG) encoded = encodeFillBlank(encoded);
			info.push({
				answer: encoded,
				homeworkResourceId: f.homeworkResourceId,
				orderNum: String(f.orderNum),
				pictureStatus: '',
				quesMaxNum: 0,
				quesNums: '',
				questionId: String(f.questionId),
				questionType: qt,
				serialNumber: String(f.serialNumber),
				studentAnswerIds: '-10001'
			});
		} else if (isImageType(qt)) {
			const media = getQuestionMedia(q);
			if (!media.length) continue;
			const quesMaxNum = Math.max(Number(q.quesMaxNum) || 0, ...media.map(item => Number(item.quesNum) || 0));
			info.push({
				answer: '',
				homeworkResourceId: f.homeworkResourceId,
				orderNum: String(f.orderNum),
				pictureStatus: media.map(item => item.answerType).join(','),
				quesMaxNum,
				quesNums: media.map(item => item.quesNum || '').join(','),
				questionId: String(f.questionId),
				questionType: qt,
				serialNumber: String(f.serialNumber),
				studentAnswerIds: media.map(item => item.studentAnswerId || '-1').join(','),
				pictureUrl: media.map(item => item.url).join(','),
				dzbList: media.map(item => item.bitId || '-1')
			});
		}
	}
	return info;
}

async function doSaveOnly() {
	if (ctx.uploadingMedia) {
		toast('请等待图片或音频上传完成');
		return;
	}
	toast('保存中...');
	let result;
	try {
		result = await saveAllAnswers();
	} catch (error) {
		console.error('[save] 保存异常:', error);
		alert('保存异常: ' + (error?.message || String(error)));
		result = { ok: false, verified: false };
	}
	if (!result.ok) toast('保存失败');
	else if (result.skipped) toast('没有需要保存的客观题答案');
	else if (result.verified) toast('已保存并确认');
	else {
		toast('保存成功，回读待确认', 3000);
		alert('保存接口已返回成功，但重新读取时未确认到答案：' + result.reason);
	}
	renderQuestions();
}
async function doSubmit() {
	if (ctx.uploadingMedia) {
		toast('请等待图片或音频上传完成');
		return;
	}
	if (!confirm('确认提交作业？')) return;
	toast('提交作业中...');

	const endTime = Date.now();
	const usedSec = getSubmitUsedSec();

	const saved = await saveAllAnswers();
	if (!saved.ok) return;

	try {
		const explainResp = await window.msykAPI.addStudentExplainSign?.({
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

	debugLog('[submit] answerInfo=', answerInfo);
	const finalResp = await window.msykAPI.saveCardAnswer({
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

	toast('提交成功');
	clearLocalDraft();
	setTimeout(() => location.replace('../main/index.html?page=homework'), 600);
}


$('#prevQBtn')?.addEventListener('click', () => navigateTo(ctx.currentQIndex - 1));
$('#nextQBtn')?.addEventListener('click', () => navigateTo(ctx.currentQIndex + 1));
window.addEventListener('keydown', (e) => {
	if (e.altKey && e.key === 'ArrowLeft') return;
	if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable || e.target.closest('.optGroup')) return;
	if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
		e.preventDefault();
		navigateTo(ctx.currentQIndex - 1);
	} else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
		e.preventDefault();
		navigateTo(ctx.currentQIndex + 1);
	}
});
$('#saveBtn')?.addEventListener('click', doSaveOnly);
$('#submitBtn')?.addEventListener('click', doSubmit);
$('#submitBtn2')?.addEventListener('click', doSubmit);

function setupMaterialWebview() {
	const wv = $('#pdfWv');
	if (!wv || wv.__sizeFixed) return;
	wv.__sizeFixed = true;

	const fixOuterSize = () => {
		const box = wv.closest('.pdfContainer');
		if (!box) return;

		const r = box.getBoundingClientRect();
		if (r.width > 0 && r.height > 0) {
			wv.style.width = r.width + 'px';
			wv.style.height = r.height + 'px';
		}
	};

	const guestCss = `
    html, body {
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
    }

    iframe,
    embed,
    object,
    webview,
    #viewer,
    #viewerContainer,
    .pdfViewer {
      width: 100% !important;
      height: 100% !important;
      min-height: 100vh !important;
      border: 0 !important;
    }
  `;

	const fixGuest = async () => {
		fixOuterSize();
		if (typeof wv.insertCSS !== 'function') return;
		try {
			await wv.insertCSS(guestCss);
		} catch (e) {
			console.warn('[material] insertCSS failed', e);
		}
	};

	wv.addEventListener('dom-ready', fixGuest);
	wv.addEventListener('did-finish-load', fixGuest);
	window.addEventListener('resize', fixOuterSize);

	if (window.ResizeObserver) {
		new ResizeObserver(fixOuterSize).observe(wv.closest('.pdfContainer'));
	}

	requestAnimationFrame(fixOuterSize);
}

$('#prevMaterialBtn')?.addEventListener('click', () => loadMaterialAt(ctx.materialIndex - 1));
$('#nextMaterialBtn')?.addEventListener('click', () => loadMaterialAt(ctx.materialIndex + 1));

boot();
