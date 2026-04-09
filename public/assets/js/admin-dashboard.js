async function initDashboard() {
  const emailEl = document.getElementById('adminDashboardEmail');
  const res = await fetch('/api/admin/session', { credentials: 'same-origin' });
  const json = await res.json().catch(() => ({}));
  if (!json.authenticated) {
    location.href = '/admin/';
    return;
  }
  emailEl.textContent = json.admin?.email || '관리자';
}

async function logout() {
  await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
  location.href = '/admin/';
}

document.getElementById('adminLogoutBtn')?.addEventListener('click', logout);
initDashboard();
