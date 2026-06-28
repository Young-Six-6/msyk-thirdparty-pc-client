window.Theme?.initTheme();

const $ = (s) => document.querySelector(s);

//自动填入账号密码
const saved = JSON.parse(localStorage.getItem('savedLogin') || 'null');
if (saved) {
  $('#username').value = saved.username || '';
  $('#password').value = saved.password || '';
  $('#macAddress').value = saved.macAddress || '';
  $('#remember').checked = true;
}

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

  // 根据勾选决定是否保存
  if (remember) {
    localStorage.setItem('savedLogin', JSON.stringify({ username, password, macAddress: macAddressInput }));
  } else {
    localStorage.removeItem('savedLogin');
  }

  location.href = '../home/index.html';
});