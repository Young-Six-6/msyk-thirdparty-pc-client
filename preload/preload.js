// preload/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ===== auth/session =====
  apiLogin: (payload) => ipcRenderer.invoke('api:login', payload),
  apiGetSession: () => ipcRenderer.invoke('api:getSession'),
  apiLogout: () => ipcRenderer.invoke('api:logout'),

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
});
