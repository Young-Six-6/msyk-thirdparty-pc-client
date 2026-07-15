window.Theme?.initTheme();

const $ = (s) => document.querySelector(s);

async function initSavedLogin() {
  let legacySaved = null;
  try {
    legacySaved = JSON.parse(localStorage.getItem('savedLogin') || 'null');
    localStorage.removeItem('savedLogin');
  } catch {
    localStorage.removeItem('savedLogin');
  }

  const resp = await window.electronAPI?.getSavedLogin?.();
  const saved = resp?.code === 200 && resp.data ? resp.data : legacySaved;

  if (saved) {
    $('#username').value = saved.username || '';
    $('#password').value = saved.password || '';
    $('#macAddress').value = saved.macAddress || '';
    $('#remember').checked = true;
  }
}

initSavedLogin().catch(() => {
  $('#tips').textContent = '应用组件加载失败，请重新安装';
});

$('#btn').addEventListener('click', async () => {
  const username = $('#username').value.trim();
  const password = $('#password').value.trim();
  const macAddressInput = $('#macAddress')?.value.trim();
  const remember = $('#remember').checked;
  $('#tips').textContent = '';

  if (!username || !password) {
    $('#tips').textContent = '请输入账号和密码';
    return;
  }

  if (!window.electronAPI?.apiLogin) {
    $('#tips').textContent = '应用组件加载失败，请重新安装';
    return;
  }

  $('#btn').disabled = true;
  $('#btn').textContent = '登录中...';

  const resp = await window.electronAPI.apiLogin({
    userName: username,
    password,
    macAddress: macAddressInput || undefined,
  });

  $('#btn').disabled = false;
  $('#btn').textContent = '登录';

  if (!resp || resp.code !== 200) {
    $('#tips').textContent = resp?.msg || '登录失败';
    return;
  }

  const saveResp = await window.electronAPI?.setSavedLogin?.({
    remember,
    username,
    password,
    macAddress: macAddressInput,
  });

  if (!saveResp || saveResp.code !== 200) {
    $('#tips').textContent = saveResp?.msg || '登录成功，但保存登录信息失败';
    return;
  }

  location.replace('../home/index.html');
});
