(function () {
  const statePromise = fetch('/api/admin/session', { credentials: 'same-origin' })
    .then((res) => res.ok ? res.json() : { authenticated: false, admin: null })
    .catch(() => ({ authenticated: false, admin: null }));

  window.__adminSessionPromise = statePromise;

  function bindLogout(button) {
    if (!button || button.dataset.logoutBound === 'true') return;
    button.dataset.logoutBound = 'true';
    button.addEventListener('click', async () => {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => null);
      location.href = '/';
    });
  }

  function syncLogoutButtons(isAdmin) {
    const desktopNavs = document.querySelectorAll('.nav--utility.nav--right');
    desktopNavs.forEach((nav) => {
      const dashboardLink = nav.querySelector('[data-admin-link]');
      let logoutBtn = nav.querySelector('.js-topbar-logout');

      if (isAdmin) {
        if (!logoutBtn) {
          logoutBtn = document.createElement('button');
          logoutBtn.type = 'button';
          logoutBtn.className = 'nav__icon-btn nav__logout js-topbar-logout';
          logoutBtn.setAttribute('aria-label', '로그아웃');
          logoutBtn.innerHTML = '<svg class="nav__icon-svg nav__icon-svg--logout" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"></path><path d="M10 17l5-5-5-5"></path><path d="M15 12H4"></path></svg>';
        }
        bindLogout(logoutBtn);
        logoutBtn.hidden = false;

        if (dashboardLink && dashboardLink.parentNode === nav) {
          dashboardLink.insertAdjacentElement('afterend', logoutBtn);
        } else if (!nav.contains(logoutBtn)) {
          nav.appendChild(logoutBtn);
        }
      } else if (logoutBtn) {
        logoutBtn.remove();
      }
    });

    const mobileNavs = document.querySelectorAll('.mobile-site-menu__nav');
    mobileNavs.forEach((nav) => {
      let logoutBtn = nav.querySelector('.js-mobile-logout');

      if (isAdmin) {
        if (!logoutBtn) {
          logoutBtn = document.createElement('button');
          logoutBtn.type = 'button';
          logoutBtn.className = 'mobile-site-menu__icon-link nav__icon-btn nav__logout js-mobile-logout';
          logoutBtn.setAttribute('aria-label', '로그아웃');
          logoutBtn.innerHTML = '<svg class="nav__icon-svg nav__icon-svg--logout" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"></path><path d="M10 17l5-5-5-5"></path><path d="M15 12H4"></path></svg><span>로그아웃</span>';
        }
        bindLogout(logoutBtn);
        logoutBtn.hidden = false;

        const dashboardLink = nav.querySelector('[data-admin-link]');
        if (dashboardLink && dashboardLink.parentNode === nav) {
          dashboardLink.insertAdjacentElement('afterend', logoutBtn);
        } else if (!nav.contains(logoutBtn)) {
          nav.appendChild(logoutBtn);
        }
      } else if (logoutBtn) {
        logoutBtn.remove();
      }
    });
  }

  function applyAdminUi(state) {
    const isAdmin = Boolean(state && state.authenticated);
    document.documentElement.dataset.adminAuthenticated = isAdmin ? 'true' : 'false';

    document.querySelectorAll('[data-admin-link]').forEach((el) => {
      if (isAdmin) {
        el.hidden = false;
        el.setAttribute('href', '/admin/dashboard.html');
        if (!el.textContent.trim()) el.textContent = '대시보드';
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

    syncLogoutButtons(isAdmin);
  }

  statePromise.then(applyAdminUi);
})();