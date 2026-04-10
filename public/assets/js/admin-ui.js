(function () {
  const statePromise = fetch('/api/admin/session', { credentials: 'same-origin' })
    .then((res) => res.ok ? res.json() : { authenticated: false, admin: null })
    .catch(() => ({ authenticated: false, admin: null }));

  window.__adminSessionPromise = statePromise;

  function applyAdminUi(state) {
    const isAdmin = Boolean(state && state.authenticated);
    document.documentElement.dataset.adminAuthenticated = isAdmin ? 'true' : 'false';

    document.querySelectorAll('[data-admin-link]').forEach((el) => {
      if (isAdmin) {
        el.hidden = false;
        el.setAttribute('href', '/admin/dashboard.html');
        if (!el.textContent.trim()) el.textContent = '관리자';
      } else {
        el.hidden = true;
      }
    });

    document.querySelectorAll('[data-admin-only]').forEach((el) => {
      el.hidden = !isAdmin;
    });

    document.querySelectorAll('[data-dashboard-link]').forEach((el) => {
      const href = '/admin/dashboard.html';
      if (isAdmin) {
        if (el.tagName === 'A') {
          el.setAttribute('href', href);
        } else {
          el.dataset.hrefTarget = href;
          el.tabIndex = 0;
          if (!el.dataset.dashboardBound) {
            el.dataset.dashboardBound = 'true';
            el.addEventListener('click', () => { location.href = href; });
            el.addEventListener('keydown', (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                location.href = href;
              }
            });
          }
        }
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    });

    document.querySelectorAll('a[href="/admin/"]:not([data-admin-link])').forEach((el) => {
      el.hidden = isAdmin;
    });

    document.querySelectorAll('[data-admin-status]').forEach((el) => {
      const alwaysReserved = document.body.classList.contains('page-home');
      if (isAdmin) {
        el.hidden = false;
        el.textContent = '관리자 로그인 중';
      } else if (alwaysReserved) {
        el.hidden = false;
        el.textContent = '';
      } else {
        el.hidden = true;
        el.textContent = '';
      }
    });
  }

  statePromise.then(applyAdminUi);
})();