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

    document.querySelectorAll('.brand').forEach((brand) => {
      const isIndex = document.body.classList.contains('page-home');
      let badge = brand.querySelector('.topbar-admin-badge');
      if (isAdmin && !isIndex) {
        if (!badge) {
          badge = document.createElement('small');
          badge.className = 'topbar-admin-badge';
          badge.textContent = '관리자 로그인 중';
          brand.appendChild(badge);
        }
      } else if (badge) {
        badge.remove();
      }
    });

    document.querySelectorAll('[data-admin-status]').forEach((el) => {
      el.hidden = !isAdmin;
      el.textContent = isAdmin ? '관리자 로그인 중' : '';
    });

    document.querySelectorAll('.nav').forEach((nav) => {
      const isIndexLeftSlot = nav.classList.contains('nav--left') && document.body.classList.contains('page-home');
      let logoutBtn = nav.querySelector('.js-topbar-logout');
      if (isAdmin && !isIndexLeftSlot) {
        if (!logoutBtn) {
          logoutBtn = document.createElement('button');
          logoutBtn.type = 'button';
          logoutBtn.className = 'nav__logout js-topbar-logout';
          logoutBtn.textContent = '로그아웃';
          logoutBtn.addEventListener('click', async () => {
            await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null);
            location.href = '/';
          });
          nav.appendChild(logoutBtn);
        }
      } else if (logoutBtn) {
        logoutBtn.remove();
      }
    });
  }

  statePromise.then(applyAdminUi);
})();
