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
  // 注意：这些事件名要与 main/apiIpc.js 里的 ipcMain.handle完全一致
  checkHomeworkEndTime: (payload) => ipcRenderer.invoke('hw:checkHomeworkEndTime', payload),
  getHomeworkCardInfo: (payload) => ipcRenderer.invoke('hw:getHomeworkCardInfo', payload),
  getHomeworkTime: (payload) => ipcRenderer.invoke('hw:getHomeworkTime', payload),

  saveBitmap: (payload) => ipcRenderer.invoke('hw:saveBitmap', payload),
  saveStuScoreAndAnswer: (payload) => ipcRenderer.invoke('hw:saveStuScoreAndAnswer', payload),
  doSubmitHomework: (payload) => ipcRenderer.invoke('hw:doSubmitHomework', payload),
});
