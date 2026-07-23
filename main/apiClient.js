// main/apiClient.js
'use strict';

const crypto = require('crypto');

const OSS_BUCKET = 'msyk';
const OSS_ENDPOINT = 'oss-cn-shanghai.aliyuncs.com';
const OSS_PUBLIC_BASE = 'https://msyk.wpstatic.cn/';
const STUDY_CENTER_BASE = 'https://learningapp.msyk.cn';

// ====== 配置区 ======
const DEFAULT_SECRET_KEY = 'DxlE8wwbZt8Y2ULQfgGywAgZfJl82G9S';

// PUBLIC_KEY64（SPKI DER base64）
const DEFAULT_PUBLIC_KEY64 =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAj7YWxpOwulFyf+zQU77Y2cd9chZUMfiwokgUaigyeD8ac5E8LQpVHWzkm+1CuzH0GxTCWvAUVHWfefOEe4AThk4AbFBNCXqB+MqofroED6Uec1jrLGNcql9IWX3CN2J6mqJQ8QLB/xPg/7FUTmd8KtGPrtOrKKP64BM5cqaB1xCc4xmQTuWvtK9fRei6LVTHZyH0Ui7nP/TSF3PJV3ywMlkkQxKi8JBkz1fx1ZO5TVLYRKxzMQdeD6whq+kOsSXhlLIiC/Y8skdBJmsBWDMfQXxtMr5CyFbVMrG+lip/V5n22EdigHcLOmFW9nnB+sgiifLHeXx951lcTmaGy4uChQIDAQAB';
// =================================

function md5Hex(s) {
  return crypto.createHash('md5').update(String(s), 'utf8').digest('hex');
}

function nowSalt() {
  return String(Date.now());
}

function apiErrorMessage(data, fallback) {
  if (!data || typeof data !== 'object') return fallback;
  return data.message || data.msg || data.ErrorMessage || data.errorMessage || fallback;
}

function assertBusinessSuccess(response, action) {
  if (!response || response.status !== 200) {
    throw new Error(`${action} HTTP ${response?.status || 0}`);
  }
  if (!response.data || typeof response.data !== 'object') {
    throw new Error(`${action}响应异常`);
  }

  const code = String(response.data.code ?? '');
  if (code && code !== '10000') {
    throw new Error(apiErrorMessage(response.data, `${action} code=${code}`));
  }
  return response.data;
}

function normalizeExtension(ext, mediaType) {
  const value = String(ext || '').trim().toLowerCase().replace(/^\./, '');
  if (mediaType === 0) return 'jpg';
  if (mediaType === 1 && ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'webm'].includes(value)) return value;
  if (mediaType === 1) return 'mp3';
  throw new Error(`不支持的作业媒体类型: ${mediaType}`);
}

function normalizeStudyCircleExtension(ext, mediaType) {
  const value = String(ext || '').trim().toLowerCase().replace(/^\./, '');
  if (mediaType === 0 && ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(value)) return value;
  if (mediaType === 0) return 'jpg';
  return normalizeExtension(value, mediaType);
}

function createHomeworkObjectKey(extension) {
  const timestamp = Date.now();
  const objectName = `${crypto.randomUUID()}.${extension}`;
  return `squirrel/android/worldwide/${timestamp}0/${objectName}`;
}

function createStudyCircleObjectKey(extension) {
  const timestamp = Date.now();
  const objectName = `${crypto.randomUUID()}.${extension}`;
  return `squirrel/android/worldwide/${timestamp}0/${objectName}`;
}

function createHomeworkBitId() {
  return String(Date.now()).slice(-7);
}

function findMediaRegistration(data) {
  const candidates = [data?.data, data?.result, data?.object, data?.InfoMap, data];
  for (let item of candidates) {
    if (typeof item === 'string') {
      try { item = JSON.parse(item); } catch { continue; }
    }
    if (item && typeof item === 'object' && (
      item.studentAnswerId !== undefined || item.uuid !== undefined || item.questionId !== undefined
    )) return item;
  }
  return {};
}

// TreeMap(按 key 排序)取 value 拼接 + salt + sign + secret 再 md5
function buildKey(params, salt, sign, secretKey) {
  const keys = Object.keys(params).sort();
  const sb = [];
  for (const k of keys) sb.push(String(params[k] ?? ''));
  sb.push(String(salt ?? ''));
  sb.push(String(sign ?? ''));
  sb.push(String(secretKey ?? ''));
  return md5Hex(sb.join(''));
}

function encodeForm(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v ?? '')}`)
    .join('&');
}

// --- RSA 公钥解密---
function pkcs1Unpad(buf) {
  // 00 01/02 ... 00 <data>
  if (!buf || buf.length < 11) throw new Error('Not PKCS#1 v1.5');
  if (buf[0] !== 0x00) throw new Error('Not PKCS#1 v1.5');
  if (buf[1] !== 0x01 && buf[1] !== 0x02) throw new Error('Not PKCS#1 v1.5');

  const sep = buf.indexOf(0x00, 2);
  if (sep < 0) throw new Error('No separator');
  return buf.slice(sep + 1);
}

function publicKey64ToPem(publicKey64) {
  const spkiDer = Buffer.from(String(publicKey64 || '').trim(), 'base64');
  const b64 = spkiDer.toString('base64').match(/.{1,64}/g).join('\n');
  return `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----`;
}

function decodeServerSignToSessionSign(serverSignB64, publicKey64) {
  const pem = publicKey64ToPem(publicKey64);
  const ct = Buffer.from(String(serverSignB64 || '').replace(/\s+/g, ''), 'base64');

  const block = crypto.publicDecrypt(
    { key: pem, padding: crypto.constants.RSA_NO_PADDING },
    ct
  );

  const pt = pkcs1Unpad(block).toString('utf8'); // "userId:token:ts"
  const parts = pt.split(':');
  if (parts.length < 2) throw new Error(`Unexpected plaintext: ${pt}`);
  const userId = parts[0];
  const token = parts[1];
  return token + userId;
}


async function requestForm({ url, method = 'POST', form = {}, headers = {} }) {
  const body = encodeForm(form);
  const canHaveBody = !['GET', 'HEAD'].includes(String(method).toUpperCase());

  // 尝试使用 Electron net
  let electronNet = null;
  try {
    // eslint-disable-next-line global-require
    electronNet = require('electron').net;
  } catch {}

  if (electronNet) {
    return await new Promise((resolve, reject) => {
      const req = electronNet.request({ method, url });

      if (canHaveBody) req.setHeader('content-type', 'application/x-www-form-urlencoded');
      for (const [k, v] of Object.entries(headers || {})) {
        req.setHeader(k, v);
      }

      const chunks = [];
      req.on('response', (res) => {
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = raw;
          try {
            data = JSON.parse(raw);
          } catch {}
          resolve({ status: res.statusCode || 0, data, raw });
        });
      });

      req.on('error', reject);
      if (canHaveBody && body) req.write(body);
      req.end();
    });
  }

  // fallback：非 Electron 环境才走 fetch
  const requestOptions = {
    method,
    headers: {
      ...(canHaveBody ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      ...headers,
    },
  };
  if (canHaveBody) requestOptions.body = body;

  const res = await fetch(url, requestOptions);

  const raw = await res.text();
  let data = raw;
  try {
    data = JSON.parse(raw);
  } catch {}

  return { status: res.status, data, raw };
}

class ApiClient {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'https://padapp.msyk.cn';
    this.secretKey = options.secretKey || DEFAULT_SECRET_KEY;
    this.publicKey64 = options.publicKey64 || DEFAULT_PUBLIC_KEY64;
    this.userAgent = options.userAgent || 'okhttp/3.12.1';

    // 会话态（padLogin 成功后填充）
    this.session = {
      sessionSign: '', // token+userId
      studentId: '',
      unitId: '',
      schoolId: '',
      schoolName: '',
      classId: '',
      className: '',
      ip: '',
      userName: '',
      realName: '',
      gradeCode: '',
      gradeName: '',
    };
  }

  setSession(obj = {}) {
    if (!obj) {
      this.session = {
        sessionSign: '',
        studentId: '',
        unitId: '',
        schoolId: '',
        schoolName: '',
        classId: '',
        className: '',
        ip: '',
        userName: '',
        realName: '',
        gradeCode: '',
        gradeName: '',
      };
      return;
    }
    Object.assign(this.session, obj);
  }

  getSession() {
    return { ...this.session };
  }

  // padLogin：auth = md5(userName + password + "HHOO") 你说说这(っ °Д °;)っ
  async padLogin({
    userName,
    password,
    macAddress = '02:00:00:00:00:00',
    sn = 'unknown',
    versionCode = '35',
  }) {
    if (!userName || !password) throw new Error('padLogin 缺少 userName/password');

    const auth = md5Hex(`${userName}${password}HHOO`);
    const params = { userName, auth, macAddress, sn, versionCode };

    const salt = nowSalt();
    const sign = ''; // padLogin 固定空
    const key = buildKey(params, salt, sign, this.secretKey);

    const form = { ...params, salt, sign, key };

    const { status, data, raw } = await requestForm({
      url: `${this.baseUrl}/ws/app/padLogin`,
      method: 'POST',
      form,
      headers: { 'user-agent': this.userAgent, 'accept-encoding': 'gzip' },
    });

    if (status !== 200) throw new Error(`padLogin HTTP ${status}`);

    // data 可能是 JSON，也可能是字符串
    if (!data || typeof data !== 'object') {
      throw new Error(`padLogin 响应异常：${raw?.slice?.(0, 200) || raw}`);
    }

    // 兼容：code 可能是 "10000" 或 10000
    const code = String(data.code ?? '');
    if (code !== '10000') {
      throw new Error(data.message || data.msg || `padLogin code=${code}`);
    }

    const serverSign =
      data.serverSign || data.sign || data.data?.serverSign || data.data?.sign || '';
    if (!serverSign) throw new Error('padLogin 缺少 serverSign');

    const sessionSign = decodeServerSignToSessionSign(serverSign, this.publicKey64);

    // 登录态字段
    const info = data.InfoMap || data.infoMap || data.data?.InfoMap || data.data?.infoMap || {};

    // studentId 在 InfoMap.id
    const studentId =
      info.id ||
      data.studentId ||
      data.data?.studentId ||
      data.userId ||
      data.data?.userId ||
      '';

    // unitId 在 InfoMap.unitId
    const unitId =
      info.unitId ||
      data.unitId ||
      data.data?.unitId ||
      data.schoolId ||
      data.data?.schoolId ||
      '';

    const schoolId = data.schoolId || data.data?.schoolId || unitId || '';
    const schoolName =
      info.schoolName || data.schoolName || data.data?.schoolName || '';
    const classId =
      info.classId ||
      info.groupId ||
      data.classId ||
      data.groupId ||
      data.data?.classId ||
      data.data?.groupId ||
      '';
    const className =
      info.groupName ||
      info.className ||
      data.groupName ||
      data.className ||
      data.data?.groupName ||
      data.data?.className ||
      '';
    const ip = data.ip || data.data?.ip || '';
    const realName = info.realName || data.realName || data.data?.realName || '';
    const gradeCode = info.gradeCode || data.gradeCode || data.data?.gradeCode || '';
    const gradeName = info.gradeName || info.gredeName || data.gradeName || data.gredeName
      || data.data?.gradeName || data.data?.gredeName || '';
    const userNameOut = info.userName || data.userName || data.data?.userName || userName;

    const session = {
      sessionSign,
      studentId,
      unitId,
      schoolId,
      schoolName,
      classId,
      className,
      ip,
      userName: userNameOut,
      realName,
      gradeCode,
      gradeName,
      macAddress,
      sn,
      versionCode,
    };

    this.setSession(session);
    return session;
  }

  async postSigned(path, params = {}) {
    const salt = nowSalt();
    const sign = this.session.sessionSign;
    if (!sign) throw new Error('Missing sessionSign：请先 padLogin 或 setSession({sessionSign})');

    const key = buildKey(params, salt, sign, this.secretKey);
    const form = { ...params, salt, sign, key };

    return await requestForm({
      url: `${this.baseUrl}${path}`,
      method: 'POST',
      form,
      headers: { 'user-agent': this.userAgent, 'accept-encoding': 'gzip' },
    });
  }

  async postStudyCenter(path, params = {}) {
    return await requestForm({
      url: `${STUDY_CENTER_BASE}${path}`,
      method: 'POST',
      form: params,
      headers: { 'user-agent': this.userAgent, 'accept-encoding': 'gzip' },
    });
  }

  // 学生当前可用科目。subjectCode 必须使用服务端返回的真实 code。
  async getHomeworkSubjects({ studentId, unitId } = {}) {
    const sid = studentId || this.session.studentId;
    const uid = unitId || this.session.unitId;
    if (!sid) throw new Error('getHomeworkSubjects 缺少 studentId');
    if (!uid) throw new Error('getHomeworkSubjects 缺少 unitId');

    const params = {
      studentId: String(sid),
      unitId: String(uid),
    };

    return await this.postSigned('/ws/student/homework/studentHomework/searchSubjectInfo', params);
  }

  // 学生作业成绩趋势。原版使用班级 ID 作为 groupId。
  async getStudentScoreGraph({
    subjectCode,
    groupId,
    studentId,
    teacherId = '',
    startTime = '',
    endTime = '',
    rows = 18,
    pageIndex = 1,
    unitId,
  } = {}) {
    const sid = studentId || this.session.studentId;
    const uid = unitId || this.session.unitId;
    const gid = groupId || this.session.classId || this.session.groupId;
    if (!sid) throw new Error('getStudentScoreGraph 缺少 studentId');
    if (!uid) throw new Error('getStudentScoreGraph 缺少 unitId');
    if (!gid) throw new Error('getStudentScoreGraph 缺少 groupId，请重新登录');

    return await this.postSigned('/ws/teacher/scoreAnalysis/singleStuScoreGraph', {
      subjectCode: String(subjectCode || ''),
      groupId: String(gid),
      stuId: String(sid),
      teacherId: String(teacherId || ''),
      startTime: String(startTime || ''),
      endTime: String(endTime || ''),
      rows: String(rows),
      pageIndex: String(pageIndex),
      unitId: String(uid),
    });
  }

  // 原版接口参数名就是 pagIndex，不能改成 pageIndex。
  async getStudentScoreList({
    subjectCode,
    studentId,
    pageIndex = 1,
    pageSize = 18,
    groupId,
    unitId,
  } = {}) {
    const sid = studentId || this.session.studentId;
    const uid = unitId || this.session.unitId;
    const gid = groupId || this.session.classId || this.session.groupId;
    if (!sid) throw new Error('getStudentScoreList 缺少 studentId');
    if (!uid) throw new Error('getStudentScoreList 缺少 unitId');
    if (!gid) throw new Error('getStudentScoreList 缺少 groupId，请重新登录');

    return await this.postSigned('/ws/student/scoreAnalysis/transcript/transcriptlist', {
      subjectCode: String(subjectCode || ''),
      studentId: String(sid),
      pagIndex: String(pageIndex),
      pageSize: String(pageSize),
      groupId: String(gid),
      unitId: String(uid),
    });
  }

  async getStudentTestScores({
    subjectCode,
    userId,
    pageIndex = 1,
    pageSize = 20,
  } = {}) {
    const sid = userId || this.session.studentId;
    if (!sid) throw new Error('getStudentTestScores 缺少 userId');

    return await this.postSigned('/ws/onlineTest/doOnlineTest/showStudentTest', {
      subjectCode: String(subjectCode || ''),
      userId: String(sid),
      pageIndex: String(pageIndex),
      pageSize: String(pageSize),
    });
  }

  async getSystemExerciseHistory({ gradeCode } = {}) {
    const studentId = String(this.session.studentId || '').trim();
    const unitId = String(this.session.unitId || '').trim();
    const grade = String(gradeCode || this.session.gradeCode || '').trim();
    if (!studentId || !unitId) throw new Error('系统练习缺少学生或学校信息');
    return await this.postSigned('/ws/student/exercise/doexercise/getDoExercisHistory', {
      studentId, gradeCode: grade, unitId,
    });
  }

  async getSystemExerciseMonthStats({ subjectCode, gradeCode } = {}) {
    return await this.postSigned('/ws/student/exercise/month', {
      studentId: String(this.session.studentId || ''),
      subjectCode: String(subjectCode || ''),
      gradeCode: String(gradeCode || this.session.gradeCode || ''),
    });
  }

  async getSystemExerciseHistoryStats({
    subjectCode,
    gradeCode,
    pageNum = 1,
    creationTime = '',
  } = {}) {
    return await this.postSigned('/ws/student/exercise/historyStatistics', {
      studentId: String(this.session.studentId || ''),
      subjectCode: String(subjectCode || ''),
      gradeCode: String(gradeCode || this.session.gradeCode || ''),
      pageNum: String(Math.max(1, Number(pageNum) || 1)),
      creationTime: String(creationTime || ''),
    });
  }

  async getSystemExerciseSubjects({ gradeCode } = {}) {
    const unitId = String(this.session.unitId || '').trim();
    const grade = String(gradeCode || this.session.gradeCode || '').trim();
    if (!unitId || !grade) throw new Error('系统练习缺少学校或年级信息');
    return await this.postSigned('/ws/student/exercise/doexercise/getSubjectByUnitIdAndGradeCode', {
      unitId, gradeCode: grade,
    });
  }

  async getSystemExerciseEditions({ gradeCode, subjectCode } = {}) {
    return await this.postSigned('/ws/brushTest/getZyBookByGradeAndSubject', {
      unitId: String(this.session.unitId || ''),
      gradeCode: String(gradeCode || this.session.gradeCode || ''),
      subjectCode: String(subjectCode || ''),
    });
  }

  async getSystemExerciseBooks({ edition, gradeCode, subjectCode } = {}) {
    return await this.postSigned('/ws/brushTest/getZyBookByEdition', {
      unitId: String(this.session.unitId || ''),
      edition: String(edition || ''),
      gradeCode: String(gradeCode || this.session.gradeCode || ''),
      subjectCode: String(subjectCode || ''),
    });
  }

  async getSystemExerciseDefaultBook({ gradeCode, subjectCode } = {}) {
    return await this.postSigned('/ws/student/exercise/doexercise/getDefaultzyBookAndTree', {
      unitId: String(this.session.unitId || ''),
      gradeCode: String(gradeCode || this.session.gradeCode || ''),
      subjectCode: String(subjectCode || ''),
    });
  }

  async getSystemExerciseNodes({ mode = 'chapter', dirId, parentId = '', gradeCode, subjectCode } = {}) {
    if (mode === 'knowledge') {
      return await this.postSigned('/ws/teacher/courseware/ChapterAndKnowledge/selectKnowledgeBySubAndGra', {
        unitId: String(this.session.unitId || ''),
        gradeCode: String(gradeCode || this.session.gradeCode || ''),
        subjectCode: String(subjectCode || ''),
        parentId: String(parentId || ''),
      });
    }
    if (!dirId) throw new Error('章节练习缺少教材 ID');
    return await this.postSigned('/ws/teacher/courseware/ChapterAndKnowledge/selectChapterByDirIdAndParentId', {
      dirId: String(dirId), parentId: String(parentId || ''),
    });
  }

  async saveSystemExerciseHistory({ gradeCode, subjectCode, bookId = '', bookName = '' } = {}) {
    return await this.postSigned('/ws/student/exercise/doexercise/saveDoExercisHistory', {
      studentId: String(this.session.studentId || ''),
      subjectCode: String(subjectCode || ''),
      gradeCode: String(gradeCode || this.session.gradeCode || ''),
      bookId: String(bookId || ''), bookName: String(bookName || ''),
    });
  }

  async startSystemExercise({ subjectCode, tagIds, bookId = '', type = 1, nodeCodes = '', gradeCode } = {}) {
    return await this.postSigned('/ws/student/exercise/doexercise/getQuestions', {
      studentId: String(this.session.studentId || ''),
      subjectCode: String(subjectCode || ''), tagIds: String(tagIds || ''),
      bookId: String(bookId || ''), type: String(type), nodeCodes: String(nodeCodes || ''),
      gradeCode: String(gradeCode || this.session.gradeCode || ''),
    });
  }

  async submitSystemExercise({ questionIds, subjectCode, gradeCode, bookId = '', doTime = 0, teacherExamId } = {}) {
    const examId = String(teacherExamId || '').trim();
    if (!examId) throw new Error('系统练习缺少练习编号');
    return await this.postSigned('/ws/student/homework/homeworkError/brushingSubmit', {
      questionIds: String(questionIds || ''), studentId: String(this.session.studentId || ''),
      subjectCode: String(subjectCode || ''), gradeCode: String(gradeCode || this.session.gradeCode || ''),
      bookId: String(bookId || ''), doTime: String(Math.max(0, Number(doTime) || 0)),
      teacherExamId: examId,
    });
  }

  async getSystemExerciseDetail({ id } = {}) {
    const exerciseId = String(id || '').trim();
    if (!exerciseId) throw new Error('系统练习缺少记录编号');
    return await this.postSigned('/ws/student/exercise/statistics', { id: exerciseId });
  }

  getSystemExerciseQuestionUrl({ questionId, subjectCode, difficulty = '', showAnswer = 0, auth = '' } = {}) {
    const studentId = String(this.session.studentId || '');
    const classId = String(this.session.classId || this.session.groupId || '');
    const unitId = String(this.session.unitId || '');
    const salt = nowSalt();
    const judgeAnswer = showAnswer ? 1 : 0;
    const type = 2;
    const keySource = showAnswer
      ? '1'
      : `0${questionId}${studentId}1${subjectCode}${classId}${unitId}0${judgeAnswer}${type}${salt}${this.secretKey}`;
    const url = new URL('https://www.msyk.cn/webview/question/singleDoErrorQuestion');
    Object.entries({ showAnswer: showAnswer ? 1 : 0, questionId, studentId, isFinished: 1,
      subjectCode, classId, auth, unitId, judgeAnswer, type, salt, key: md5Hex(keySource) })
      .forEach(([key, value]) => url.searchParams.set(key, String(value ?? '')));
    if (!showAnswer && difficulty !== '') url.searchParams.set('difficulty', String(difficulty));
    return url.toString();
  }

  async getSchoolExerciseAccess({ subjectCodeList = [], gradeCode } = {}) {
    return await this.postSigned('/ws/student/schoolDoExercise/intoSchoolDoExercise', {
      subjectCodeList: typeof subjectCodeList === 'string' ? subjectCodeList : JSON.stringify(subjectCodeList),
      unitId: String(this.session.schoolId || this.session.unitId || ''),
      userId: String(this.session.studentId || ''),
      gradeCode: String(gradeCode || this.session.gradeCode || ''),
    });
  }

  async getSchoolExerciseBooks({ subjectCode, gradeCode } = {}) {
    return await this.postSigned('/ws/student/schoolDoExercise/getSchoolBooks', {
      studentId: String(this.session.studentId || ''),
      unitId: String(this.session.schoolId || this.session.unitId || ''),
      gradeCode: String(gradeCode || this.session.gradeCode || ''),
      subjectCode: String(subjectCode || ''),
    });
  }

  async getSchoolExerciseChapters({ codeLevel = 0, dirId, nodeCode = '', subjectCode, gradeCode } = {}) {
    return await this.postSigned('/ws/student/schoolDoExercise/getSchoolDoexerciseTree', {
      codeLevel: String(codeLevel), dirId: String(dirId || ''),
      gradeCode: String(gradeCode || this.session.gradeCode || ''), nodeCode: String(nodeCode || ''),
      subjectCode: String(subjectCode || ''), unitId: String(this.session.schoolId || this.session.unitId || ''),
      userId: String(this.session.studentId || ''),
    });
  }

  async getSchoolExerciseQuestions({ dirId, tagId, subjectCode, gradeCode } = {}) {
    return await this.postSigned('/ws/student/schoolDoExercise/sequenceDoExercise', {
      studentId: String(this.session.studentId || ''), unitId: String(this.session.schoolId || this.session.unitId || ''),
      gradeCode: String(gradeCode || this.session.gradeCode || ''), subjectCode: String(subjectCode || ''),
      dirId: String(dirId || ''), tagId: String(tagId || ''),
    });
  }

  async saveSchoolExerciseResult({ doTime = 0, questionRef = [], subjectCode, gradeCode,
    errorNum = 0, correctNum = 0, dirId } = {}) {
    return await this.postSigned('/ws/student/schoolDoExercise/saveOneDoExerciseResult', {
      doTime: String(Math.max(0, Number(doTime) || 0)),
      questionRef: typeof questionRef === 'string' ? questionRef : JSON.stringify(questionRef),
      subjectCode: String(subjectCode || ''), gradeCode: String(gradeCode || this.session.gradeCode || ''),
      errorNnm: String(Math.max(0, Number(errorNum) || 0)), correctNum: String(Math.max(0, Number(correctNum) || 0)),
      studnetId: String(this.session.studentId || ''), dirId: String(dirId || ''),
    });
  }

  getSchoolExerciseQuestionUrl({ questionId, showAnswer = 0, myAnswer = '', gradeCode } = {}) {
    const url = new URL('https://www.msyk.cn/webview/question/singleDoSchoolExercise');
    url.searchParams.set('questionId', String(questionId || ''));
    url.searchParams.set('showAnswer', showAnswer ? '1' : '0');
    if (showAnswer && myAnswer) url.searchParams.set('myAnswer', String(myAnswer));
    url.searchParams.set('unitId', String(this.session.schoolId || this.session.unitId || ''));
    url.searchParams.set('gradeCode', String(gradeCode || this.session.gradeCode || ''));
    url.searchParams.set('classId', String(this.session.classId || this.session.groupId || ''));
    url.searchParams.set('judgeAnswer', '0');
    return url.toString();
  }

  async getStudyCircleQuestions({
    scope = 'square',
    subjectCode = '',
    startTime = '',
    endTime = '',
    endQuestionType = '',
    onlyShowPublic = '',
    pageIndex = 1,
    pageSize = 20,
  } = {}) {
    const userId = this.session.studentId;
    const unitId = this.session.unitId;
    if (!userId) throw new Error('学习圈缺少 studentId');
    if (!unitId) throw new Error('学习圈缺少 unitId');

    const mine = scope === 'mine';
    const params = {
      userId: String(userId),
      unitId: String(unitId),
      subjectCode: String(subjectCode || ''),
      startTime: String(startTime || ''),
      endTime: String(endTime || ''),
      pageIndex: String(pageIndex),
      pageSize: String(pageSize),
    };
    if (mine) {
      params.ownerType = '1';
      params.endQuestionType = String(endQuestionType || '');
      params.onlyShowPublic = String(onlyShowPublic || '');
    }

    return await this.postStudyCenter(
      mine
        ? '/ws/submitQuestion/getSubmitQuestion'
        : '/ws/submitQuestion/getPublicSubmitQuestion',
      params
    );
  }

  async getStudyCircleAuthority({ unitId } = {}) {
    const uid = String(unitId || this.session.unitId || '').trim();
    if (!uid) throw new Error('学习圈权限检查缺少 unitId');
    return await this.postStudyCenter('/ws/submitQuestion/studentSubmitQuestionAuthority', {
      unitId: uid,
    });
  }

  async getStudyCircleProjects({
    subjectCode = '', projectType = 0, sortType = 0, pageIndex = 1, pageSize = 18,
  } = {}) {
    return await this.postStudyCenter('/ws/teacher/project/studentGetProjectList', {
      userId: String(this.session.studentId || ''),
      subjectCode: String(subjectCode || ''),
      projectType: String(Number(projectType) || 0),
      sortType: String(Number(sortType) === 1 ? 1 : 0),
      pageIndex: String(pageIndex),
      pageSize: String(pageSize),
    });
  }

  async getStudyCircleCases({
    subjectCode = '', startTime = '', endTime = '', topType = 0,
    pageIndex = 1, pageSize = 20,
  } = {}) {
    return await this.postStudyCenter('/ws/typicalCase/teacher/listCase', {
      startTime: String(startTime || ''),
      endTime: String(endTime || ''),
      subjectCode: String(subjectCode || ''),
      classId: String(this.session.classId || this.session.groupId || ''),
      topType: String(Number(topType) || 0),
      pageIndex: String(pageIndex),
      pageSize: String(pageSize),
      userId: String(this.session.studentId || ''),
      unitId: String(this.session.unitId || ''),
      userType: '1',
    });
  }

  async getStudyCircleCaseDetail({ uuid, caseType = 1 } = {}) {
    const id = String(uuid || '').trim();
    if (!id) throw new Error('案例详情缺少 uuid');
    return await this.postStudyCenter('/ws/typicalCase/student/getCaseDetail', {
      uuid: id,
      userId: String(this.session.studentId || ''),
      caseType: String(Number(caseType) || 1),
      userType: '1',
      unitId: String(this.session.unitId || ''),
    });
  }

  async praiseStudyCircleCase({ uuid, isPraise = 1 } = {}) {
    const id = String(uuid || '').trim();
    if (!id) throw new Error('案例点赞缺少 uuid');
    return await this.postStudyCenter('/ws/typicalCase/student/modifyPraise', {
      typicalCaseUuid: id,
      unitId: String(this.session.unitId || ''),
      userId: String(this.session.studentId || ''),
      isPraise: String(Number(isPraise) === 1 ? 1 : 0),
    });
  }

  async getStudyCircleProjectDetail({ projectUuId } = {}) {
    const id = String(projectUuId || '').trim();
    if (!id) throw new Error('课题详情缺少 projectUuId');
    return await this.postStudyCenter('/ws/teacher/project/studentGetProjectInfo', {
      studentId: String(this.session.studentId || ''),
      projectUuId: id,
      unitId: String(this.session.unitId || ''),
    });
  }

  async getStudyCircleProjectChat({ projectUuId, groupUuId, pageIndex = 1, submitTime = '' } = {}) {
    return await this.postStudyCenter('/ws/teacher/discussionGroup/getChitchatList', {
      userId: String(this.session.studentId || ''),
      groupUuId: String(groupUuId || '').trim(),
      projectUuId: String(projectUuId || '').trim(),
      unitId: String(this.session.unitId || ''),
      pageIndex: String(pageIndex),
      submitTime: String(submitTime || ''),
      pageSize: '30',
    });
  }

  async sendStudyCircleProjectChat({ projectUuId, groupUuId, content, uuid, sendTime } = {}) {
    const text = String(content || '').trim();
    if (!text) throw new Error('请输入讨论内容');
    return await this.postStudyCenter('/ws/teacher/discussionGroup/studentSendInformation', {
      studentId: String(this.session.studentId || ''),
      groupId: String(groupUuId || '').trim(),
      projectUuId: String(projectUuId || '').trim(),
      resourceType: '0',
      content: text,
      sendTime: String(sendTime || Date.now()),
      longTime: '0',
      uuid: String(uuid || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
    });
  }

  async getStudyCircleProjectSummary({ projectUuId, groupUuId = '' } = {}) {
    const group = String(groupUuId || '').trim();
    return await this.postStudyCenter(
      group
        ? '/ws/teacher/project/getProjectGroupSummarizeInfo'
        : '/ws/teacher/project/getProjectSummarizeInfo',
      group
        ? { projectUuId: String(projectUuId || ''), groupUuId: group, unitId: String(this.session.unitId || '') }
        : { projectUuId: String(projectUuId || ''), unitId: String(this.session.unitId || '') }
    );
  }

  async getStudyCircleProjectState({ projectUuId, groupUuId } = {}) {
    return await this.postStudyCenter('/ws/teacher/project/getSpeechState', {
      projectUuId: String(projectUuId || ''), groupUuId: String(groupUuId || ''),
      studentId: String(this.session.studentId || ''), unitId: String(this.session.unitId || ''),
    });
  }

  async saveStudyCircleProjectResult({ projectUuId, groupUuId, summarizeUuId = '', content = '',
    resources = [], submitType = 1 } = {}) {
    if (!String(content || '').trim() && (!Array.isArray(resources) || resources.length === 0)) {
      throw new Error('请输入小组成果或添加图片');
    }
    return await this.postStudyCenter('/ws/teacher/project/studentSaveSummarize', {
      summarizeUuId: String(summarizeUuId || ''), projectUuId: String(projectUuId || ''),
      groupUuId: String(groupUuId || ''), content: String(content || '').trim(),
      studentId: String(this.session.studentId || ''), resourceJsonStr: JSON.stringify(resources || []),
      submitType: Number(submitType) === 1 ? '1' : '0',
    });
  }

  async getStudyCircleQuestionDetail({ submitQuestionUuId } = {}) {
    const uuid = String(submitQuestionUuId || '').trim();
    if (!uuid) throw new Error('问题详情缺少 submitQuestionUuId');
    return await this.postStudyCenter('/ws/submitQuestion/getSubmitQuestionInfo', {
      submitQuestionUuId: uuid,
      unitId: String(this.session.unitId || ''),
    });
  }

  async getStudyCircleChat({ submitQuestionUuId } = {}) {
    const uuid = String(submitQuestionUuId || '').trim();
    if (!uuid) throw new Error('问题对话缺少 submitQuestionUuId');
    return await this.postStudyCenter('/ws/chattingRecords/getChattingRecords', {
      submitQuestionUuId: uuid,
      unitId: String(this.session.unitId || ''),
      userId: String(this.session.studentId || ''),
    });
  }

  async addStudyCircleQuestion({
    content,
    teacherId,
    subjectCode,
    classId,
    homeworkName = '',
    orderNum = '0',
    questionId = '',
    picUrls = [],
    audioList = [],
  } = {}) {
    const text = String(content || '').trim() || '老师，求解答';
    const tid = String(teacherId || '').trim();
    const subject = String(subjectCode || '').trim();
    const groupId = String(classId || this.session.classId || this.session.groupId || '').trim();
    if (!tid || !subject) throw new Error('请选择提问科目和教师');
    if (!groupId) throw new Error('提问缺少班级 ID，请重新登录');

    return await this.postStudyCenter('/ws/submitQuestion/addSubmitQuestion', {
      studentId: String(this.session.studentId || ''),
      content: text,
      picUrls: JSON.stringify(Array.isArray(picUrls) ? picUrls : []),
      aduioList: JSON.stringify(Array.isArray(audioList) ? audioList : []),
      unitId: String(this.session.unitId || ''),
      homeworkName: String(homeworkName || ''),
      orderNum: String(orderNum || '0'),
      teacherId: tid,
      subjectCode: subject,
      questionId: String(questionId || ''),
      classId: groupId,
    });
  }

  async addStudyCircleReply({
    submitQuestionUuId,
    content,
    picUrls = [],
    audioList = [],
    showAnalysis = 0,
  } = {}) {
    const uuid = String(submitQuestionUuId || '').trim();
    const text = String(content || '').trim();
    if (!uuid) throw new Error('回复缺少 submitQuestionUuId');
    if (!text && !picUrls.length && !audioList.length) throw new Error('请输入回复内容或添加附件');

    return await this.postStudyCenter('/ws/chattingRecords/addChattingRecord', {
      userId: String(this.session.studentId || ''),
      ownerType: '1',
      content: text,
      picUrls: JSON.stringify(Array.isArray(picUrls) ? picUrls : []),
      aduioList: JSON.stringify(Array.isArray(audioList) ? audioList : []),
      submitQuestionUuIds: uuid,
      unitId: String(this.session.unitId || ''),
      showAnalysis: String(Number(showAnalysis) || 0),
    });
  }

  async praiseStudyCircleQuestion({ submitQuestionUuId, praiseType = 1 } = {}) {
    const uuid = String(submitQuestionUuId || '').trim();
    if (!uuid) throw new Error('点赞缺少 submitQuestionUuId');
    return await this.postStudyCenter('/ws/submitQuestion/praise', {
      userId: String(this.session.studentId || ''),
      ownerType: '1',
      unitId: String(this.session.unitId || ''),
      submitQuestionUuId: uuid,
      praiseType: String(Number(praiseType) === 0 ? 0 : 1),
    });
  }

  async setStudyCircleQuestionPublic({ submitQuestionUuId, isPublic } = {}) {
    const uuid = String(submitQuestionUuId || '').trim();
    if (!uuid) throw new Error('公开问题缺少 submitQuestionUuId');
    return await this.postStudyCenter('/ws/submitQuestion/isPublicSubmitQuestion', {
      submitQuestionUuIds: JSON.stringify([uuid]), unitId: String(this.session.unitId || ''),
      type: Number(isPublic) === 1 ? '1' : '0',
    });
  }

  async endStudyCircleQuestion({ submitQuestionUuId } = {}) {
    const uuid = String(submitQuestionUuId || '').trim();
    if (!uuid) throw new Error('结束问题缺少 submitQuestionUuId');
    return await this.postStudyCenter('/ws/submitQuestion/endSubmitQuestion', {
      submitQuestionUuIds: JSON.stringify([uuid]), unitId: String(this.session.unitId || ''),
    });
  }

  async deleteStudyCircleQuestion({ submitQuestionUuId } = {}) {
    const uuid = String(submitQuestionUuId || '').trim();
    if (!uuid) throw new Error('删除问题缺少 submitQuestionUuId');
    return await this.postStudyCenter('/ws/submitQuestion/delSubmitQuestion', {
      submitQuestionUuIds: JSON.stringify([uuid]), unitId: String(this.session.unitId || ''), type: '2',
    });
  }

  // 作业列表
  async getHomeworkList({
    studentId,
    unitId,
    statu = 1,
    subjectCode = '',
    homeworkType = -1,
    pageIndex = 1,
    pageSize = 12,
    homeworkName = '',
    startTime = 0,
    endTime = 0,
  }) {
    const sid = studentId || this.session.studentId;
    const uid = unitId || this.session.unitId;
    if (!sid) throw new Error('getHomeworkList 缺少 studentId');
    if (!uid) throw new Error('getHomeworkList 缺少 unitId');

    const params = {
      studentId: String(sid),
      subjectCode: String(subjectCode || ''),
      homeworkType: String(homeworkType),
      pageIndex: String(pageIndex),
      pageSize: String(pageSize),
      statu: String(statu),
      homeworkName: String(homeworkName || ''),
      unitId: String(uid),
      startTime: String(startTime || 0),
      endTime: String(endTime || 0),
    };

    return await this.postSigned('/ws/student/homework/studentHomework/getHomeworkList', params);
  }

  async withdrawStudentHomework({ homeworkId, studentId, unitId } = {}) {
    const id = String(homeworkId || '').trim();
    const sid = String(studentId || this.session.studentId || '').trim();
    const uid = String(unitId || this.session.unitId || '').trim();
    if (!id) throw new Error('撤回作业缺少 homeworkId');
    if (!sid || !uid) throw new Error('撤回作业缺少学生或学校信息');
    return await this.postSigned('/ws/student/homework/studentHomework/studentWithdrawHomework', {
      homeworkId: id, studentId: sid, unitId: uid,
    });
  }

  async changePassword({ userId, oldPassword, newPassword } = {}) {
    const uid = String(userId || this.session.studentId || '').trim();
    const oldValue = String(oldPassword || '').trim();
    const newValue = String(newPassword || '').trim();
    if (!uid) throw new Error('修改密码缺少用户信息');
    if (!oldValue) throw new Error('请输入原密码');
    if (newValue.length < 6 || newValue.length > 18) throw new Error('新密码长度应为 6–18 位');
    return await this.postSigned('/ws/app/changePassword', {
      userId: uid,
      newPassword: newValue,
      oldPassword: oldValue,
    });
  }

  async statisticUsedInfo({ studentId } = {}) {
    const sid = studentId || this.session.studentId;
    if (!sid) throw new Error('statisticUsedInfo 缺少 studentId');

    const params = { studentId: String(sid) };
    return await this.postSigned('/ws/student/statisticUsedInfo', params);
  }

  // 作业状态（阅读材料：resourceList[].resourceUrl）
  async homeworkStatus({ homeworkId, modifyNum = 0, userId, unitId } = {}) {
    const sid = userId || this.session.studentId;
    const uid = unitId || this.session.unitId;
    if (!homeworkId) throw new Error('homeworkStatus 缺少 homeworkId');
    if (!sid) throw new Error('homeworkStatus 缺少 userId/studentId');
    if (!uid) throw new Error('homeworkStatus 缺少 unitId');

    const params = {
      homeworkId: String(homeworkId),
      modifyNum: String(modifyNum ?? 0),
      userId: String(sid),
      unitId: String(uid),
    };

    return await this.postSigned('/ws/common/homework/homeworkStatus', params);
  }

  // PPT 阅读材料：服务端已将 PPT 转为逐页图片。
  async homeworkPPTInfo({ pptResourceId, resSource = 1 } = {}) {
    if (!pptResourceId) throw new Error('homeworkPPTInfo 缺少 pptResourceId');

    const params = {
      pptResourceId: String(pptResourceId),
      resSource: String(resSource ?? 1),
    };

    return await this.postSigned('/ws/student/homework/studentHomework/homeworkPPTInfo', params);
  }

  // 新作业做作业：截止校验
  async checkHomeworkEndTime({ homeworkId, unitId } = {}) {
    const uid = unitId || this.session.unitId;
    if (!homeworkId) throw new Error('checkHomeworkEndTime 缺少 homeworkId');
    if (!uid) throw new Error('checkHomeworkEndTime 缺少 unitId');

    const params = { homeworkId: String(homeworkId), unitId: String(uid) };
    return await this.postSigned('/ws/student/homework/studentHomework/checkHomeworkEndTime', params);
  }

  // 新作业做作业：题卡信息（含 materialRelas PDF、homeworkCardList）
  async getHomeworkCardInfo({ homeworkId, studentId, modifyNum = 0, unitId } = {}) {
    const sid = studentId || this.session.studentId;
    const uid = unitId || this.session.unitId;
    if (!homeworkId) throw new Error('getHomeworkCardInfo 缺少 homeworkId');
    if (!sid) throw new Error('getHomeworkCardInfo 缺少 studentId');
    if (!uid) throw new Error('getHomeworkCardInfo 缺少 unitId');

    const params = {
      homeworkId: String(homeworkId),
      studentId: String(sid),
      modifyNum: String(modifyNum ?? 0),
      unitId: String(uid),
    };

    return await this.postSigned('/ws/teacher/homeworkCard/getHomeworkCardInfo', params);
  }

  // 调试工具：按原版测试流程读取题卡标准答案，不包含保存或提交操作。
  async getHomeworkCardCorrectAnswers({ homeworkId, modifyNum = 0, unitId } = {}) {
    const uid = unitId || this.session.unitId;
    if (!homeworkId) throw new Error('getHomeworkCardCorrectAnswers 缺少 homeworkId');
    if (!uid) throw new Error('getHomeworkCardCorrectAnswers 缺少 unitId');

    const query = encodeForm({
      homeworkId: String(homeworkId),
      studentId: '',
      modifyNum: String(modifyNum ?? 0),
      unitId: String(uid),
    });

    return await requestForm({
      url: `${this.baseUrl}/ws/teacher/homeworkCard/getHomeworkCardInfo?${query}`,
      method: 'GET',
      headers: { 'user-agent': this.userAgent, 'accept-encoding': 'gzip' },
    });
  }

  // 计时/时长
  async getHomeworkTime({ homeworkId, studentId, unitId } = {}) {
    const sid = studentId || this.session.studentId;
    const uid = unitId || this.session.unitId;
    if (!homeworkId) throw new Error('getHomeworkTime 缺少 homeworkId');
    if (!sid) throw new Error('getHomeworkTime 缺少 studentId');
    if (!uid) throw new Error('getHomeworkTime 缺少 unitId');

    const params = { homeworkId: String(homeworkId), studentId: String(sid), unitId: String(uid) };
    return await this.postSigned('/ws/common/homework/homeworkStatus/getTime', params);
  }

  // 上传图片/点阵：ws/student/homework/studentHomework/saveBitmap
  async saveHomeworkBitmap({
    homeworkId,
    resourceId,
    studentId,
    startPointY = '0',
    points = '',
    bitId = '',
    time = '',
    unitId,
  } = {}) {
    const sid = studentId || this.session.studentId;
    const uid = unitId || this.session.unitId;

    if (!homeworkId) throw new Error('saveHomeworkBitmap 缺少 homeworkId');
    if (!resourceId) throw new Error('saveHomeworkBitmap 缺少 resourceId');
    if (!sid) throw new Error('saveHomeworkBitmap 缺少 studentId');
    if (!uid) throw new Error('saveHomeworkBitmap 缺少 unitId');

    const params = {
      homeworkId: String(homeworkId),
      resourceId: String(resourceId),
      studentId: String(sid),
      startPointY: String(startPointY ?? '0'),
      points: String(points ?? ''),
      bitId: String(bitId ?? ''),
      time: String(time || Date.now()),
      unitId: String(uid),
    };

    return await this.postSigned('/ws/student/homework/studentHomework/saveBitmap', params);
  }

  // 保存分数与答案：ws/student/homework/studentHomework/saveScoreAndAnswer
  async saveStuScoreAndAnswer({
    score = '',
    homeworkId,
    resourceId,
    studentId,
    answer = '',
    quesNum = '',
    url = '',
    modifyNum = 0,
    questionId = '',
    bitId = '',
    time = '',
    answerType = '',
    studentAnswerIds = '',
    unitId,
  } = {}) {
    const sid = studentId || this.session.studentId;
    const uid = unitId || this.session.unitId;

    if (!homeworkId) throw new Error('saveStuScoreAndAnswer 缺少 homeworkId');
    if (!resourceId) throw new Error('saveStuScoreAndAnswer 缺少 resourceId');
    if (!sid) throw new Error('saveStuScoreAndAnswer 缺少 studentId');
    if (!uid) throw new Error('saveStuScoreAndAnswer 缺少 unitId');

    const params = {
      score: String(score ?? ''),
      homeworkId: String(homeworkId),
      resourceId: String(resourceId),
      studentId: String(sid),
      answer: String(answer ?? ''),
      quesNum: String(quesNum ?? ''),
      url: String(url ?? ''),
      modifyNum: String(modifyNum ?? 0),
      questionId: String(questionId ?? ''),
      bitId: String(bitId ?? ''),
      time: String(time || Date.now()),
      answerType: String(answerType ?? ''),
      studentAnswerIds: String(studentAnswerIds ?? ''),
      unitId: String(uid),
    };

    return await this.postSigned('/ws/student/homework/studentHomework/saveScoreAndAnswer', params);
  }

  // 提交：ws/common/homework/homeworkStatus/modifyWithNoScore
  async doSubmitHomework({
    homeworkId,
    userId,
    groupId = '',
    startTime = '',
    endTime = '',
    time = '',
    unitId,
  } = {}) {
    const sid = userId || this.session.studentId;
    const uid = unitId || this.session.unitId;

    if (!homeworkId) throw new Error('doSubmitHomework 缺少 homeworkId');
    if (!sid) throw new Error('doSubmitHomework 缺少 userId/studentId');
    if (!uid) throw new Error('doSubmitHomework 缺少 unitId');

    const now = Date.now();
    const params = {
      homeworkId: String(homeworkId),
      userId: String(sid),
      groupId: String(groupId ?? ''),
      startTime: String(startTime || now),
      endTime: String(endTime || now),
      time: String(time || now),
      unitId: String(uid),
    };

    return await this.postSigned('/ws/common/homework/homeworkStatus/modifyWithNoScore', params);
  }

  // DTK答题卡：提交答案  ws/teacher/homeworkCard/saveCardAnswer
  async saveCardAnswer({
    answerInfo = '[]',
    studentId,
    homeworkId,
    type = 0,
    startTime = '',
    endTime = '',
    time = '',
    modifyNum = 0,
    unitId,
  } = {}) {
    const sid = studentId || this.session.studentId;
    const uid = unitId || this.session.unitId;
    if (!homeworkId) throw new Error('saveCardAnswer 缺少 homeworkId');
    if (!sid) throw new Error('saveCardAnswer 缺少 studentId');
    if (!uid) throw new Error('saveCardAnswer 缺少 unitId');

    const now = Date.now();
    // 官方 DTK 提交允许 startTime 为空；不要把空字符串强制替换成当前时间。
    const start = startTime === undefined || startTime === null ? '' : String(startTime);
    const end = endTime === undefined || endTime === null || endTime === '' ? String(now) : String(endTime);
    let usedTime = String(time ?? '');
    if (!usedTime) {
      const st = Number(start);
      const et = Number(end);
      usedTime = start && Number.isFinite(st) && Number.isFinite(et) && et >= st
        ? String(Math.floor((et - st) / 1000))
        : '0';
    }

    // 字段集合与官方包保持一致：answerInfo + 学生/作业/时间/单位信息。
    const params = {
      answerInfo: typeof answerInfo === 'string' ? answerInfo : JSON.stringify(answerInfo),
      studentId: String(sid),
      homeworkId: String(homeworkId),
      type: String(type ?? 0),
      startTime: start,
      endTime: end,
      time: usedTime,
      modifyNum: String(modifyNum ?? 0),
      unitId: String(uid),
    };
    return await this.postSigned('/ws/teacher/homeworkCard/saveCardAnswer', params);
  }

  // 添加讲评标记  /ws/student/homeworkChecked/addStudentExplainSign
  async addStudentExplainSign({
    studentId,
    homeworkId,
    homeworkResourceIds = '[]',
    unitId,
  } = {}) {
    const sid = studentId || this.session.studentId;
    const uid = unitId || this.session.unitId;
    if (!homeworkId) throw new Error('addStudentExplainSign 缺少 homeworkId');
    if (!sid) throw new Error('addStudentExplainSign 缺少 studentId');
    if (!uid) throw new Error('addStudentExplainSign 缺少 unitId');

    const params = {
      studentId: String(sid),
      homeworkId: String(homeworkId),
      homeworkResourceIds: typeof homeworkResourceIds === 'string' ? homeworkResourceIds : JSON.stringify(homeworkResourceIds || []),
      unitId: String(uid),
    };
    return await this.postSigned('/ws/student/homeworkChecked/addStudentExplainSign', params);
  }

  // DTK答题卡：保存客观题答案（分号分隔） ws/teacher/homeworkCard/saveCardAnswerObjectives
  async saveCardAnswerObjectives({
    homeworkId,
    studentId,
    serialNumbers = '',
    answers = '',
    modifyNum = 0,
    unitId,
  } = {}) {
    const sid = studentId || this.session.studentId;
    const uid = unitId || this.session.unitId;
    if (!homeworkId) throw new Error('saveCardAnswerObjectives 缺少 homeworkId');
    if (!sid) throw new Error('saveCardAnswerObjectives 缺少 studentId');
    if (!uid) throw new Error('saveCardAnswerObjectives 缺少 unitId');

    const params = {
      serialNumbers: String(serialNumbers ?? ''),
      answers: String(answers ?? ''),
      studentId: String(sid),
      homeworkId: String(homeworkId),
      unitId: String(uid),
      modifyNum: String(modifyNum ?? 0),
    };
    return await this.postSigned('/ws/teacher/homeworkCard/saveCardAnswerObjectives', params);
  }

  // OSS 上传凭证  /ws/common/uploadController/getParams
  async getOssParams({ retry = '0' } = {}) {
    const retryValue = String(retry ?? '0');
    const salt = nowSalt();
    const params = {
      retry: retryValue,
      salt,
      key: md5Hex(retryValue + salt + this.secretKey),
    };
    const res = await requestForm({
      url: `${this.baseUrl}/ws/common/uploadController/getParams`,
      method: 'POST',
      form: params,
      headers: { 'user-agent': this.userAgent },
    });
    const data = assertBusinessSuccess(res, '获取OSS凭证');
    for (const field of ['AccessKeyId', 'AccessKeySecret', 'SecurityToken', 'Expiration']) {
      if (!data[field]) throw new Error(`获取OSS凭证缺少 ${field}`);
    }
    return res;
  }

  // OSS 直传（HMAC-SHA1签名）
  async uploadToOss({ base64, key, accessKeyId, accessKeySecret, securityToken, contentType }) {
    const objectKey = String(key || '').replace(/^\/+/, '');
    if (!objectKey || objectKey.includes('..')) throw new Error('OSS对象键无效');
    if (!accessKeyId || !accessKeySecret || !securityToken) throw new Error('OSS临时凭证不完整');

    const encoded = String(base64 || '').replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(encoded, 'base64');
    if (!buf.length) throw new Error('上传文件为空');

    const ct = contentType || 'application/octet-stream';
    const contentMd5 = crypto.createHash('md5').update(buf).digest('base64');
    const dateStr = new Date().toUTCString();
    const resource = `/${OSS_BUCKET}/${objectKey}`;
    const stringToSign = 'PUT\n' + contentMd5 + '\n' + ct + '\n' + dateStr + '\nx-oss-security-token:' + securityToken + '\n' + resource;
    const signature = crypto.createHmac('sha1', accessKeySecret).update(stringToSign).digest('base64');
    const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
    const url = `https://${OSS_BUCKET}.${OSS_ENDPOINT}/${encodedKey}`;
    const electronNet = require('electron').net;
    return await new Promise((resolve, reject) => {
      const req = electronNet.request({ method: 'PUT', url });
      req.setHeader('Content-Type', ct);
      req.setHeader('Content-MD5', contentMd5);
      req.setHeader('Date', dateStr);
      req.setHeader('Authorization', 'OSS ' + accessKeyId + ':' + signature);
      req.setHeader('x-oss-security-token', securityToken);
      const chunks = [];
      req.on('response', (res) => { res.on('data', (c) => chunks.push(Buffer.from(c))); res.on('end', () => resolve({ status: res.statusCode, data: Buffer.concat(chunks).toString('utf8') })); });
      req.on('error', reject);
      req.write(buf);
      req.end();
    });
  }

  // 作业媒体：获取STS -> OSS直传 -> 登记媒体答案。
  async uploadHomeworkMedia({
    base64,
    ext,
    contentType,
    mediaType = 0,
    durationTime = '',
    uuid = '',
    bitId = '',
    questionId,
    quesNum,
    homeworkId,
    studentId,
    modifyNum,
    unitId,
  } = {}) {
    const type = Number(mediaType);
    if (![0, 1].includes(type)) throw new Error('目前仅支持图片或音频答案');
    if (!questionId) throw new Error('上传作业媒体缺少 questionId');

    const extension = normalizeExtension(ext, type);
    const answerUuid = String(uuid || crypto.randomUUID());
    const answerBitId = String(bitId || createHomeworkBitId());
    const key = createHomeworkObjectKey(extension);

    const ossRes = await this.getOssParams();
    const ossData = ossRes.data;
    const uploadRes = await this.uploadToOss({
      base64,
      key,
      accessKeyId: ossData.AccessKeyId,
      accessKeySecret: ossData.AccessKeySecret,
      securityToken: ossData.SecurityToken,
      contentType: contentType || (type === 0 ? 'image/jpeg' : 'audio/mpeg'),
    });
    if (uploadRes.status < 200 || uploadRes.status >= 300) {
      const detail = String(uploadRes.data || '').replace(/\s+/g, ' ').slice(0, 240);
      throw new Error(`OSS上传失败 HTTP ${uploadRes.status}${detail ? `: ${detail}` : ''}`);
    }

    const url = OSS_PUBLIC_BASE + key;
    const saveRes = await this.saveSubjectivesCardAnswer({
      questionId,
      quesNum,
      picturUrl: url,
      uuid: answerUuid,
      studentId,
      homeworkId,
      unitId,
      modifyNum,
      pictureStatus: type,
    });
    const saveData = assertBusinessSuccess(saveRes, '登记作业媒体答案');
    const registration = findMediaRegistration(saveData);
    const studentAnswerId = registration.studentAnswerId ?? registration.answerId;
    if (studentAnswerId === undefined || studentAnswerId === null || studentAnswerId === '') {
      throw new Error('登记作业媒体答案成功但缺少 studentAnswerId');
    }

    return {
      url,
      key,
      uuid: String(registration.uuid || answerUuid),
      questionId: String(registration.questionId || questionId),
      studentAnswerId: String(studentAnswerId),
      answerType: type,
      bitId: answerBitId,
      quesNum: String(quesNum ?? registration.quesNum ?? ''),
      durationTime: String(durationTime || ''),
    };
  }

  // 学习圈附件只需要直传资源，不登记为作业答题卡答案。
  async uploadStudyCircleMedia({ base64, ext, contentType, mediaType = 0 } = {}) {
    const type = Number(mediaType);
    if (![0, 1].includes(type)) throw new Error('学习圈仅支持图片或音频附件');
    const extension = normalizeStudyCircleExtension(ext, type);
    const key = createStudyCircleObjectKey(extension);
    const ossData = (await this.getOssParams()).data;
    const uploadRes = await this.uploadToOss({
      base64,
      key,
      accessKeyId: ossData.AccessKeyId,
      accessKeySecret: ossData.AccessKeySecret,
      securityToken: ossData.SecurityToken,
      contentType: contentType || (type === 0 ? 'image/jpeg' : 'audio/mpeg'),
    });
    if (uploadRes.status < 200 || uploadRes.status >= 300) {
      const detail = String(uploadRes.data || '').replace(/\s+/g, ' ').slice(0, 240);
      throw new Error(`OSS上传失败 HTTP ${uploadRes.status}${detail ? `: ${detail}` : ''}`);
    }
    return { url: OSS_PUBLIC_BASE + key, key, mediaType: type };
  }

  // 一站式上传图片：获取OSS凭证 → OSS直传 → saveSubjectivesCardAnswer
  async uploadSubjectPic(payload = {}) {
    return await this.uploadHomeworkMedia({ ...payload, mediaType: 0 });
  }

  // 主观题图片保存  ws/teacher/homeworkCard/saveSubjectivesCardAnswer
  async saveSubjectivesCardAnswer({
    questionId,
    quesNum = '',
    picturUrl = '',
    uuid = '',
    studentId,
    homeworkId,
    unitId,
    modifyNum = 0,
    pictureStatus = 0,
  } = {}) {
    const sid = studentId || this.session.studentId;
    const uid = unitId || this.session.unitId;
    if (!questionId) throw new Error('saveSubjectivesCardAnswer 缺少 questionId');
    if (!sid) throw new Error('saveSubjectivesCardAnswer 缺少 studentId');
    if (!homeworkId) throw new Error('saveSubjectivesCardAnswer 缺少 homeworkId');
    if (!uid) throw new Error('saveSubjectivesCardAnswer 缺少 unitId');

    const params = {
      questionId: String(questionId),
      quesNum: String(quesNum ?? ''),
      picturUrl: String(picturUrl ?? ''),
      uuid: String(uuid || this.session.studentId + '_' + Date.now()),
      studentId: String(sid),
      homeworkId: String(homeworkId),
      unitId: String(uid),
      modifyNum: String(modifyNum ?? 0),
      pictureStatus: String(pictureStatus ?? 0),
    };
    return await this.postSigned('/ws/teacher/homeworkCard/saveSubjectivesCardAnswer', params);
  }

  async removeCardAnswer({ answerId, unitId } = {}) {
    const uid = unitId || this.session.unitId;
    if (!answerId || String(answerId) === '-1' || String(answerId) === '-10001') {
      throw new Error('删除作业媒体缺少有效 answerId');
    }
    if (!uid) throw new Error('删除作业媒体缺少 unitId');

    return await this.postSigned('/ws/teacher/homeworkCard/studentRemoveAnswer', {
      answerId: String(answerId),
      unitId: String(uid),
    });
  }

  // 阅读材料：单题用时提交  ws/student/homework/studentHomework/readHomeworksubmitTime
  async submitReadHomeworkTime({
    homeworkId,
    resourceId,
    studentId,
    quesNum = '',
    usedTime = '',
    unitId,
  } = {}) {
    const sid = studentId || this.session.studentId;
    const uid = unitId || this.session.unitId;
    if (!homeworkId) throw new Error('submitReadHomeworkTime 缺少 homeworkId');
    if (!resourceId) throw new Error('submitReadHomeworkTime 缺少 resourceId');
    if (!sid) throw new Error('submitReadHomeworkTime 缺少 studentId');
    if (!uid) throw new Error('submitReadHomeworkTime 缺少 unitId');

    const params = {
      homeworkId: String(homeworkId),
      resourceId: String(resourceId),
      studentId: String(sid),
      quesNum: String(quesNum ?? ''),
      usedTime: String(usedTime || Date.now()),
      unitId: String(uid),
    };
    return await this.postSigned('/ws/student/homework/studentHomework/readHomeworksubmitTime', params);
  }

  // 阅读材料：总计用时提交（完成阅读） ws/common/homework/homeworkStatus/readHomeworkModify
  async submitReadHomeworkCountTime({
    homeworkId,
    userId,
    groupId = '',
    startTime = '',
    endTime = '',
    time = '',
    unitId,
  } = {}) {
    const sid = userId || this.session.studentId;
    const uid = unitId || this.session.unitId;
    if (!homeworkId) throw new Error('submitReadHomeworkCountTime 缺少 homeworkId');
    if (!sid) throw new Error('submitReadHomeworkCountTime 缺少 userId/studentId');
    if (!uid) throw new Error('submitReadHomeworkCountTime 缺少 unitId');

    const now = Date.now();
    const params = {
      homeworkId: String(homeworkId),
      userId: String(sid),
      groupId: String(groupId ?? ''),
      startTime: String(startTime || now),
      endTime: String(endTime || now),
      time: String(time || now),
      unitId: String(uid),
    };
    return await this.postSigned('/ws/common/homework/homeworkStatus/readHomeworkModify', params);
  }

  // 已完成/查看：H5 预览 URL（仍保留给 homeworkType=7 && statu!=1）
  getStudentHomeworkCardPreviewUrl({
    homeworkId,
    modifyNum = 0,
    isShowAnswer = 1,
    endHomeworkModel = 1,
  }) {
    const { studentId, unitId, sessionSign } = this.session;
    if (!studentId) throw new Error('Missing studentId：请先登录');
    if (!unitId) throw new Error('Missing unitId：请先登录');
    if (!homeworkId) throw new Error('Missing homeworkId');

    const salt = String(Date.now());
    const sign = String(sessionSign || '');

    const paramsForKey = {
      studentId: String(studentId),
      homeworkId: String(homeworkId),
      isShowAnswer: String(isShowAnswer),
      unitId: String(unitId),
      endHomeworkModel: String(endHomeworkModel),
      modifyNum: String(modifyNum ?? 0),
    };

    const key = buildKey(paramsForKey, salt, sign, this.secretKey);

    const u = new URL('https://www.msyk.cn/webview/newQuestion/studentHomeworkCardPreview');
    u.searchParams.set('studentId', studentId);
    u.searchParams.set('homeworkId', String(homeworkId));
    u.searchParams.set('isShowAnswer', String(isShowAnswer));
    u.searchParams.set('unitId', unitId);
    u.searchParams.set('endHomeworkModel', String(endHomeworkModel));
    u.searchParams.set('modifyNum', String(modifyNum));
    u.searchParams.set('salt', salt);
    u.searchParams.set('sign', sign);
    u.searchParams.set('key', key);

    return u.toString();
  }
}

module.exports = ApiClient;
