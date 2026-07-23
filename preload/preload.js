// preload/preload.js
const { contextBridge, ipcRenderer } = require('electron');


const DEBUG_STORAGE_KEY = 'msyk_debug_mode';

function getDebugMode() {
  try {
    return globalThis.localStorage?.getItem(DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function setDebugMode(enabled) {
  const on = !!enabled;
  try {
    globalThis.localStorage?.setItem(DEBUG_STORAGE_KEY, on ? '1' : '0');
  } catch {}
  return on;
}

// 主进程也保留一份调试状态，用于保护仅调试模式开放的 IPC。
ipcRenderer.invoke('debug:set', getDebugMode()).catch(() => {});


contextBridge.exposeInMainWorld('electronAPI', {
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  // ===== auth/session =====
  apiLogin: (payload) => ipcRenderer.invoke('api:login', payload),
  apiGetSession: () => ipcRenderer.invoke('api:getSession'),
  apiLogout: () => ipcRenderer.invoke('api:logout'),
  getSavedLogin: () => ipcRenderer.invoke('credentials:getSavedLogin'),
  setSavedLogin: (payload) => ipcRenderer.invoke('credentials:setSavedLogin', payload),
  changePassword: (payload) => ipcRenderer.invoke('account:changePassword', payload),

  // ===== home =====
  homeStats: () => ipcRenderer.invoke('home:stats'),

  // ===== homework list & view =====
  hwSubjects: () => ipcRenderer.invoke('hw:subjects'),
  hwList: (payload) => ipcRenderer.invoke('hw:list', payload),
  withdrawHomework: (payload) => ipcRenderer.invoke('hw:withdraw', payload),
  hwCardPreviewUrl: (payload) => ipcRenderer.invoke('hw:cardPreviewUrl', payload),
  hwStatus: (payload) => ipcRenderer.invoke('hw:status', payload),
  hwPptInfo: (payload) => ipcRenderer.invoke('hw:pptInfo', payload),

  // ===== student scores =====
  scoreHomeworkTrend: (payload) => ipcRenderer.invoke('score:homeworkTrend', payload),
  scoreHomeworkList: (payload) => ipcRenderer.invoke('score:homeworkList', payload),
  scoreTestList: (payload) => ipcRenderer.invoke('score:testList', payload),

  // ===== study circle =====
  studyCircleList: (payload) => ipcRenderer.invoke('studyCircle:list', payload),
  studyCircleAuthority: (payload) => ipcRenderer.invoke('studyCircle:authority', payload),
  studyCircleProjects: (payload) => ipcRenderer.invoke('studyCircle:projects', payload),
  studyCircleCases: (payload) => ipcRenderer.invoke('studyCircle:cases', payload),
  studyCircleCaseDetail: (payload) => ipcRenderer.invoke('studyCircle:caseDetail', payload),
  studyCircleCasePraise: (payload) => ipcRenderer.invoke('studyCircle:casePraise', payload),
  studyCircleProjectDetail: (payload) => ipcRenderer.invoke('studyCircle:projectDetail', payload),
  studyCircleProjectChat: (payload) => ipcRenderer.invoke('studyCircle:projectChat', payload),
  studyCircleProjectSend: (payload) => ipcRenderer.invoke('studyCircle:projectSend', payload),
  studyCircleProjectSummary: (payload) => ipcRenderer.invoke('studyCircle:projectSummary', payload),
  studyCircleProjectState: (payload) => ipcRenderer.invoke('studyCircle:projectState', payload),
  studyCircleProjectResultSave: (payload) => ipcRenderer.invoke('studyCircle:projectResultSave', payload),
  studyCircleDetail: (payload) => ipcRenderer.invoke('studyCircle:detail', payload),
  studyCircleChat: (payload) => ipcRenderer.invoke('studyCircle:chat', payload),
  studyCircleAddQuestion: (payload) => ipcRenderer.invoke('studyCircle:addQuestion', payload),
  studyCircleAddReply: (payload) => ipcRenderer.invoke('studyCircle:addReply', payload),
  studyCirclePraise: (payload) => ipcRenderer.invoke('studyCircle:praise', payload),
  studyCircleSetPublic: (payload) => ipcRenderer.invoke('studyCircle:setPublic', payload),
  studyCircleEnd: (payload) => ipcRenderer.invoke('studyCircle:end', payload),
  studyCircleDelete: (payload) => ipcRenderer.invoke('studyCircle:delete', payload),
  uploadStudyCircleMedia: (payload) => ipcRenderer.invoke('studyCircle:uploadMedia', payload),

  // ===== system exercise =====
  systemExerciseHistory: (payload) => ipcRenderer.invoke('systemExercise:history', payload),
  systemExerciseMonthStats: (payload) => ipcRenderer.invoke('systemExercise:monthStats', payload),
  systemExerciseHistoryStats: (payload) => ipcRenderer.invoke('systemExercise:historyStats', payload),
  systemExerciseSubjects: (payload) => ipcRenderer.invoke('systemExercise:subjects', payload),
  systemExerciseEditions: (payload) => ipcRenderer.invoke('systemExercise:editions', payload),
  systemExerciseBooks: (payload) => ipcRenderer.invoke('systemExercise:books', payload),
  systemExerciseDefaultBook: (payload) => ipcRenderer.invoke('systemExercise:defaultBook', payload),
  systemExerciseNodes: (payload) => ipcRenderer.invoke('systemExercise:nodes', payload),
  systemExerciseSaveHistory: (payload) => ipcRenderer.invoke('systemExercise:saveHistory', payload),
  systemExerciseStart: (payload) => ipcRenderer.invoke('systemExercise:start', payload),
  systemExerciseSubmit: (payload) => ipcRenderer.invoke('systemExercise:submit', payload),
  systemExerciseDetail: (payload) => ipcRenderer.invoke('systemExercise:detail', payload),
  systemExerciseQuestionUrl: (payload) => ipcRenderer.invoke('systemExercise:questionUrl', payload),
  schoolExerciseAccess: (payload) => ipcRenderer.invoke('schoolExercise:access', payload),
  schoolExerciseBooks: (payload) => ipcRenderer.invoke('schoolExercise:books', payload),
  schoolExerciseChapters: (payload) => ipcRenderer.invoke('schoolExercise:chapters', payload),
  schoolExerciseQuestions: (payload) => ipcRenderer.invoke('schoolExercise:questions', payload),
  schoolExerciseSaveResult: (payload) => ipcRenderer.invoke('schoolExercise:saveResult', payload),
  schoolExerciseQuestionUrl: (payload) => ipcRenderer.invoke('schoolExercise:questionUrl', payload),

  // ===== do homework (API flow) =====
  checkHomeworkEndTime: (payload) => ipcRenderer.invoke('hw:checkHomeworkEndTime', payload),
  getHomeworkCardInfo: (payload) => ipcRenderer.invoke('hw:getHomeworkCardInfo', payload),
  getCorrectAnswers: (payload) => ipcRenderer.invoke('hw:getCorrectAnswers', payload),
  getHomeworkTime: (payload) => ipcRenderer.invoke('hw:getHomeworkTime', payload),

  saveBitmap: (payload) => ipcRenderer.invoke('hw:saveBitmap', payload),
  saveStuScoreAndAnswer: (payload) => ipcRenderer.invoke('hw:saveStuScoreAndAnswer', payload),
  doSubmitHomework: (payload) => ipcRenderer.invoke('hw:doSubmitHomework', payload),
  saveCardAnswer: (payload) => ipcRenderer.invoke('hw:saveCardAnswer', payload),
  saveCardAnswerObjectives: (payload) => ipcRenderer.invoke('hw:saveCardAnswerObjectives', payload),
  addStudentExplainSign: (payload) => ipcRenderer.invoke('hw:addStudentExplainSign', payload),
  uploadSubjectPic: (payload) => ipcRenderer.invoke('hw:uploadSubjectPic', payload),
  uploadHomeworkMedia: (payload) => ipcRenderer.invoke('hw:uploadHomeworkMedia', payload),
  removeCardAnswer: (payload) => ipcRenderer.invoke('hw:removeCardAnswer', payload),

  // ===== 阅读材料 =====
  submitReadTime: (payload) => ipcRenderer.invoke('hw:submitReadTime', payload),
  submitReadCountTime: (payload) => ipcRenderer.invoke('hw:submitReadCountTime', payload),

  // ===== debug mode =====
  debugGet: async () => {
    const enabled = !!(await ipcRenderer.invoke('debug:get'));
    setDebugMode(enabled);
    return enabled;
  },
  debugSet: async (enabled) => {
    const on = setDebugMode(enabled);
    return await ipcRenderer.invoke('debug:set', on);
  },
});


contextBridge.exposeInMainWorld('MSYK_DEBUG', {
  enabled: getDebugMode(),

  get: () => getDebugMode(),
  set: (enabled) => setDebugMode(enabled),

  log: (...args) => {
    if (getDebugMode()) console.debug('[MSYK_DEBUG]', ...args);
  },
  warn: (...args) => {
    if (getDebugMode()) console.warn('[MSYK_DEBUG]', ...args);
  },
  error: (...args) => {
    if (getDebugMode()) console.error('[MSYK_DEBUG]', ...args);
  },
});
