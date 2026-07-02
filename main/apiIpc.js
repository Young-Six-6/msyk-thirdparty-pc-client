// main/apiIpc.js
const { writeStore } = require('./store');

function registerApiIpc(ipcMain, apiClient) {
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
