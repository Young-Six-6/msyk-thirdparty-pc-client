// main/main.js
const path = require('path');
const { app, BrowserWindow, ipcMain, session } = require('electron');
const { readStore } = require('./store');
const ApiClient = require('./apiClient');
const { registerApiIpc } = require('./apiIpc');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true

    }
  });

  mainWindow.setMenuBarVisibility(false);

  const store = readStore();
  const hasSession = store?.session?.sign;

  if (hasSession) {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'home', 'index.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'login', 'index.html'));
  }
}

app.whenReady().then(() => {
  // 让 webview 走“安卓 WebView/APP 内”分支
  const msykSes = session.fromPartition('persist:msyk');
  msykSes.webRequest.onBeforeSendHeaders((details, callback) => {
    const url = details.url || '';
    if (url.includes('www.msyk.cn') || url.includes('msyk.wpstatic.cn')) {
      details.requestHeaders['X-Requested-With'] = 'com.zdsoft.newsquirrel';
      details.requestHeaders['x-requested-with'] = 'com.zdsoft.newsquirrel';
      details.requestHeaders['Accept-Language'] = 'zh-CN,zh;q=0.9';
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  const apiClient = new ApiClient({
    baseURL: 'https://padapp.msyk.cn',
    padLoginPath: '/ws/app/padLogin',
    secretKey: 'DxlE8wwbZt8Y2ULQfgGywAgZfJl82G9S'
  });


  // 恢复 session
  const store = readStore();
  if (store?.session) apiClient.setSession(store.session);

  registerApiIpc(ipcMain, apiClient);

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});