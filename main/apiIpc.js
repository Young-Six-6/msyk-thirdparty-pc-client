// main/apiIpc.js
const { safeStorage } = require('electron');
const { readStore, writeStore } = require('./store');

function encryptSavedPassword(password) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统加密服务不可用，无法安全记住密码');
  }
  return safeStorage.encryptString(String(password || '')).toString('base64');
}

function decryptSavedPassword(encryptedPassword) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统加密服务不可用，无法读取已保存密码');
  }
  return safeStorage.decryptString(Buffer.from(String(encryptedPassword || ''), 'base64'));
}

function registerApiIpc(ipcMain, apiClient) {
  ipcMain.handle('debug:get', () => !!readStore().debugMode);
  ipcMain.handle('debug:set', (event, enabled) => {
    const debugMode = !!enabled;
    writeStore({ debugMode });
    return debugMode;
  });

  ipcMain.handle('api:login', async (event, { userName, password, macAddress }) => {
    try {
      const session = await apiClient.padLogin({
        userName,
        password,
        macAddress: macAddress || '02:00:00:00:00:00',
      });
      writeStore({ session });
      return { code: 200, data: session };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('api:getSession', async () => {
    return { code: 200, data: apiClient.getSession() };
  });

  ipcMain.handle('api:logout', async () => {
    apiClient.setSession(null);
    writeStore({ session: null });
    return { code: 200 };
  });

  ipcMain.handle('credentials:getSavedLogin', async () => {
    try {
      const savedLogin = readStore()?.savedLogin;
      if (!savedLogin) return { code: 200, data: null };

      return {
        code: 200,
        data: {
          username: savedLogin.username || '',
          password: decryptSavedPassword(savedLogin.password),
          macAddress: savedLogin.macAddress || '',
        },
      };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('credentials:setSavedLogin', async (event, payload = {}) => {
    try {
      const { remember, username = '', password = '', macAddress = '' } = payload;

      if (!remember) {
        writeStore({ savedLogin: null });
        return { code: 200 };
      }

      writeStore({
        savedLogin: {
          version: 1,
          username: String(username || ''),
          password: encryptSavedPassword(password),
          macAddress: String(macAddress || ''),
        },
      });
      return { code: 200 };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:list', async (event, payload = {}) => {
    try {
      const {
        statu = 1,
        pageIndex = 1,
        pageSize = 12,
        subjectCode = '',
        homeworkType = -1,
        homeworkName = '',
      } = payload;

      const { status, data } = await apiClient.getHomeworkList({
        statu,
        pageIndex,
        pageSize,
        subjectCode,
        homeworkType,
        homeworkName,
        startTime: 0,
        endTime: 0,
      });

      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:status', async (event, payload = {}) => {
    try {
      const { homeworkId, modifyNum = 0 } = payload;
      const { status, data } = await apiClient.homeworkStatus({ homeworkId, modifyNum });

      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:pptInfo', async (event, payload = {}) => {
    try {
      const { pptResourceId, resSource = 1 } = payload;
      const { status, data } = await apiClient.homeworkPPTInfo({ pptResourceId, resSource });

      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:cardPreviewUrl', async (event, payload = {}) => {
    try {
      const { homeworkId, modifyNum = 0, isShowAnswer = 1, endHomeworkModel = 1 } = payload;
      const url = apiClient.getStudentHomeworkCardPreviewUrl({
        homeworkId,
        modifyNum,
        isShowAnswer,
        endHomeworkModel,
      });
      return { code: 200, data: { url } };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  // ====== 做作业（statu=1 && homeworkType=7）纯 API 流程 ======
  ipcMain.handle('hw:checkHomeworkEndTime', async (event, payload = {}) => {
    try {
      const { homeworkId, unitId } = payload;
      const { status, data } = await apiClient.checkHomeworkEndTime({ homeworkId, unitId });
      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:getHomeworkCardInfo', async (event, payload = {}) => {
    try {
      const { homeworkId, studentId, modifyNum = 0, unitId } = payload;
      const { status, data } = await apiClient.getHomeworkCardInfo({
        homeworkId,
        studentId,
        modifyNum,
        unitId,
      });
      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:getCorrectAnswers', async (event, payload = {}) => {
    try {
      if (!readStore().debugMode) return { code: 403, msg: '仅调试模式可用' };

      const { homeworkId, modifyNum = 0, unitId } = payload;
      const { status, data } = await apiClient.getHomeworkCardCorrectAnswers({
        homeworkId,
        modifyNum,
        unitId,
      });
      if (status !== 200) return { code: 500, msg: `HTTP ${status}` };
      return { code: 200, data };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:getHomeworkTime', async (event, payload = {}) => {
    try {
      const { homeworkId, studentId, unitId } = payload;
      const { status, data } = await apiClient.getHomeworkTime({ homeworkId, studentId, unitId });
      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:saveBitmap', async (event, payload = {}) => {
    try {
      const { status, data, raw } = await apiClient.saveHomeworkBitmap(payload);

      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };

      return { code: 200, data, raw };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:saveStuScoreAndAnswer', async (event, payload = {}) => {
    try {
      const { status, data, raw } = await apiClient.saveStuScoreAndAnswer(payload);
      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data, raw };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:doSubmitHomework', async (event, payload = {}) => {
    try {
      const { status, data, raw } = await apiClient.doSubmitHomework(payload);
      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data, raw };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  // ====== DTK 答题卡答案提交 ======
  ipcMain.handle('hw:saveCardAnswer', async (event, payload = {}) => {
    try {
      const { status, data, raw } = await apiClient.saveCardAnswer(payload);
      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data, raw };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:saveCardAnswerObjectives', async (event, payload = {}) => {
    try {
      const { status, data, raw } = await apiClient.saveCardAnswerObjectives(payload);
      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data, raw };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:addStudentExplainSign', async (event, payload = {}) => {
    try {
      const { status, data, raw } = await apiClient.addStudentExplainSign(payload);
      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data, raw };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:getOssParams', async () => {
    try {
      const { status, data, raw } = await apiClient.getOssParams();
      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data, raw };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:uploadToOss', async (event, payload = {}) => {
    try {
      const { status, data } = await apiClient.uploadToOss(payload);
      if (status !== 200) return { code: 500, msg: `OSS PUT ${status}`, raw: data };
      return { code: 200, data };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:uploadSubjectPic', async (event, payload = {}) => {
    try {
      const result = await apiClient.uploadSubjectPic(payload);
      return { code: 200, url: result.url };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:saveSubjectivesCardAnswer', async (event, payload = {}) => {
    try {
      const { status, data, raw } = await apiClient.saveSubjectivesCardAnswer(payload);
      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data, raw };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  // ====== 阅读材料 ======
  ipcMain.handle('hw:submitReadTime', async (event, payload = {}) => {
    try {
      const { status, data, raw } = await apiClient.submitReadHomeworkTime(payload);
      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data, raw };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  ipcMain.handle('hw:submitReadCountTime', async (event, payload = {}) => {
    try {
      const { status, data, raw } = await apiClient.submitReadHomeworkCountTime(payload);
      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data, raw };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });

  // ====== home ======
  ipcMain.handle('home:stats', async () => {
    try {
      const { status, data } = await apiClient.statisticUsedInfo();
      if (status !== 200) return { code: 500, msg: `HTTP ${status}`, raw: data };
      return { code: 200, data };
    } catch (e) {
      return { code: 500, msg: e?.message || String(e) };
    }
  });
}

module.exports = { registerApiIpc };
