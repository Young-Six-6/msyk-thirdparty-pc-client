window.Theme?.initTheme();

const $ = (s) => document.querySelector(s);

$('#backBtn')?.addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.href = '../me/index.html';
});

document.querySelector('.row.theme')?.addEventListener('click', () => {
  window.Theme?.toggleTheme();
  location.reload();
});


