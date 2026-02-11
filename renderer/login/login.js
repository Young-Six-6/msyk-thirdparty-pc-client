window.Theme?.initTheme();

const $ = (s) => document.querySelector(s);

$('#btn').addEventListener('click', async () => {
  const username = $('#username').value.trim();
  const password = $('#password').value.trim();
  const macAddressInput = $('#macAddress')?.value.trim();
  $('#tips').textContent = '';

  if (!username || !password) {
    $('#tips').textContent = '请输入账号和密码';
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

  // 跳首页
  location.href = '../home/index.html';
});
