async function fetchSession() {
  const res = await fetch('/api/admin/session', { credentials: 'same-origin' });
  return res.json();
}

function setMode(mode) {
  const title = document.getElementById('adminAuthTitle');
  const desc = document.getElementById('adminAuthDesc');
  const button = document.getElementById('adminAuthSubmit');
  const password = document.getElementById('adminPassword');
  if (mode === 'setup') {
    title.textContent = '관리자 계정 만들기';
    desc.textContent = '최초 1회만 관리자 이메일과 비밀번호를 만들 수 있습니다. 이 계정이 유일한 관리자 계정이 됩니다.';
    button.textContent = '관리자 계정 생성';
    password.autocomplete = 'new-password';
  } else {
    title.textContent = '관리자 로그인';
    desc.textContent = '이 페이지에서는 관리자 계정만 로그인할 수 있습니다. 일반 회원가입은 제공하지 않습니다.';
    button.textContent = '로그인';
    password.autocomplete = 'current-password';
  }
  document.body.dataset.adminMode = mode;
}

async function init() {
  const state = await fetchSession().catch(() => ({ has_admin: true, authenticated: false }));
  if (state.authenticated) {
    location.href = '/admin/dashboard.html';
    return;
  }
  setMode(state.has_admin ? 'login' : 'setup');
}

async function submitAuth(event) {
  event.preventDefault();
  const statusEl = document.getElementById('adminAuthStatus');
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  const mode = document.body.dataset.adminMode || 'login';
  const endpoint = mode === 'setup' ? '/api/admin/setup' : '/api/admin/login';
  statusEl.textContent = mode === 'setup' ? '관리자 계정 생성 중…' : '로그인 중…';

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ email, password })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    statusEl.textContent = json?.message || '처리에 실패했습니다.';
    return;
  }
  statusEl.textContent = mode === 'setup' ? '관리자 계정이 만들어졌습니다. 이동합니다…' : '로그인되었습니다. 이동합니다…';
  location.href = '/admin/dashboard.html';
}

document.getElementById('adminAuthForm')?.addEventListener('submit', submitAuth);
init();
