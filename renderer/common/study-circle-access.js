(function initStudyCircleAccess(root) {
  'use strict';

  const FEATURES = Object.freeze({ questions: 0, projects: 1, cases: 2 });

  function businessData(response) {
    if (!response || response.code !== 200) {
      throw new Error(response?.msg || '学习圈开通状态请求失败');
    }
    let value = response.data;
    for (let depth = 0; depth < 3 && value && typeof value === 'object'; depth++) {
      const code = String(value.code ?? '10000');
      if (code && code !== '10000') {
        throw new Error(value.message || value.msg || `学习圈权限检查失败 (${code})`);
      }
      if (!Object.prototype.hasOwnProperty.call(value, 'data')) break;
      value = value.data;
    }
    return value;
  }

  function parseObject(value) {
    if (typeof value !== 'string') return value;
    const text = value.trim();
    if (!text.startsWith('{') && !text.startsWith('[')) return value;
    try { return JSON.parse(text); } catch { return value; }
  }

  function findConfig(value, depth = 0) {
    const parsed = parseObject(value);
    if (typeof parsed === 'string') return parsed.includes(',') ? parsed : '';
    if (!parsed || typeof parsed !== 'object' || depth > 3) return '';
    if (typeof parsed.learningProjectCfg === 'string') return parsed.learningProjectCfg;
    for (const key of ['data', 'result', 'object', 'info']) {
      const found = findConfig(parsed[key], depth + 1);
      if (found) return found;
    }
    return '';
  }

  function parseAuthority(response) {
    const config = findConfig(businessData(response));
    const flags = config.split(',').map((value) => value.trim());
    if (flags.length < 3 || flags.slice(0, 3).some((value) => value !== '0' && value !== '1')) {
      throw new Error('服务器返回的 learningProjectCfg 无效');
    }
    return Object.freeze({
      config,
      questions: flags[FEATURES.questions] === '1',
      projects: flags[FEATURES.projects] === '1',
      cases: flags[FEATURES.cases] === '1',
    });
  }

  async function resolve(api) {
    const [debugResult, authorityResult] = await Promise.allSettled([
      typeof api?.debugGet === 'function' ? api.debugGet() : false,
      api?.studyCircleAuthority?.({}),
    ]);
    const debug = debugResult.status === 'fulfilled' && debugResult.value === true;
    let modules = Object.freeze({ config: '', questions: false, projects: false, cases: false });
    let authorityError = null;
    try {
      if (authorityResult.status === 'rejected') throw authorityResult.reason;
      modules = parseAuthority(authorityResult.value);
    } catch (error) {
      authorityError = error instanceof Error ? error : new Error(String(error));
      if (!debug) throw authorityError;
    }
    return Object.freeze({
      debug,
      modules,
      authorityError,
      allows(feature) {
        if (!Object.prototype.hasOwnProperty.call(FEATURES, feature)) return false;
        return debug || modules[feature] === true;
      },
      bypasses(feature) {
        return debug && modules[feature] !== true;
      },
    });
  }

  root.StudyCircleAccess = Object.freeze({ parseAuthority, resolve });
})(window);
