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


contextBridge.exposeInMainWorld('electronAPI', {
  // ===== auth/session =====
  apiLogin: (payload) => ipcRenderer.invoke('api:login', payload),
  apiGetSession: () => ipcRenderer.invoke('api:getSession'),
  apiLogout: () => ipcRenderer.invoke('api:logout'),
  getSavedLogin: () => ipcRenderer.invoke('credentials:getSavedLogin'),
  setSavedLogin: (payload) => ipcRenderer.invoke('credentials:setSavedLogin', payload),

  // ===== home =====
  homeStats: () => ipcRenderer.invoke('home:stats'),

  // ===== homework list & view =====
  hwList: (payload) => ipcRenderer.invoke('hw:list', payload),
  hwCardPreviewUrl: (payload) => ipcRenderer.invoke('hw:cardPreviewUrl', payload),
  hwStatus: (payload) => ipcRenderer.invoke('hw:status', payload),

  // ===== do homework (API flow) =====
  checkHomeworkEndTime: (payload) => ipcRenderer.invoke('hw:checkHomeworkEndTime', payload),
  getHomeworkCardInfo: (payload) => ipcRenderer.invoke('hw:getHomeworkCardInfo', payload),
  getHomeworkTime: (payload) => ipcRenderer.invoke('hw:getHomeworkTime', payload),

  saveBitmap: (payload) => ipcRenderer.invoke('hw:saveBitmap', payload),
  saveStuScoreAndAnswer: (payload) => ipcRenderer.invoke('hw:saveStuScoreAndAnswer', payload),
  doSubmitHomework: (payload) => ipcRenderer.invoke('hw:doSubmitHomework', payload),
  saveCardAnswer: (payload) => ipcRenderer.invoke('hw:saveCardAnswer', payload),
  saveCardAnswerObjectives: (payload) => ipcRenderer.invoke('hw:saveCardAnswerObjectives', payload),
  addStudentExplainSign: (payload) => ipcRenderer.invoke('hw:addStudentExplainSign', payload),
  getOssParams: () => ipcRenderer.invoke('hw:getOssParams'),
  uploadToOss: (payload) => ipcRenderer.invoke('hw:uploadToOss', payload),
  uploadSubjectPic: (payload) => ipcRenderer.invoke('hw:uploadSubjectPic', payload),
  saveSubjectivesCardAnswer: (payload) => ipcRenderer.invoke('hw:saveSubjectivesCardAnswer', payload),

  // ===== 阅读材料 =====
  submitReadTime: (payload) => ipcRenderer.invoke('hw:submitReadTime', payload),
  submitReadCountTime: (payload) => ipcRenderer.invoke('hw:submitReadCountTime', payload),

  // ===== debug mode =====
  debugGet: () => Promise.resolve(getDebugMode()),
  debugSet: (enabled) => Promise.resolve(setDebugMode(enabled)),
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
