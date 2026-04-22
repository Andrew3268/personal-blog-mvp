(function () {
  const overlay = document.getElementById('siteSearchOverlay');
  if (!overlay) return;

  const input = overlay.querySelector('.search-overlay__input');
  const form = overlay.querySelector('.search-overlay__form, .search-overlay__bar');
  const openButtons = document.querySelectorAll('[data-search-open]');
  const closeButtons = overlay.querySelectorAll('[data-search-close]');
  const mobileMenu = document.getElementById('mobileSiteMenu');
  const header = document.querySelector('.topbar.topbar--editorial');
  const desktopMain = document.querySelector('.container.posts-page');
  const genericMain = document.querySelector('main.container') || document.querySelector('main');
  const pageMain = desktopMain || genericMain;

  function setSearchButtonsExpanded(isOpen) {
    openButtons.forEach((button) => {
      button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      button.classList.remove('is-open');
    });
  }

  function getHeaderHeight() {
    return header ? Math.round(header.getBoundingClientRect().height) : 64;
  }

  function getPanelHeight() {
    const panel = overlay.querySelector('.search-overlay__panel');
    if (!panel) return 0;
    const rect = panel.getBoundingClientRect();
    return Math.ceil(rect.height || 0);
  }

  function applyOffsets(isOpen) {
    const headerHeight = getHeaderHeight();
    document.documentElement.style.setProperty('--search-header-offset', `${headerHeight}px`);

    const push = isOpen ? Math.max(0, getPanelHeight() + 8) : 0;
    document.documentElement.style.setProperty('--search-push-offset', `${push}px`);

    if (pageMain) {
      pageMain.style.marginTop = isOpen ? `var(--search-push-offset)` : '';
    }
  }

  function openSearch() {
    if (mobileMenu && !mobileMenu.hidden) return;

    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('search-open-inline');
    setSearchButtonsExpanded(true);

    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      applyOffsets(true);
      input?.focus();
      if (input && typeof input.select === 'function') input.select();
    });
  }

  function closeSearch() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('search-open-inline');
    setSearchButtonsExpanded(false);
    document.documentElement.style.setProperty('--search-push-offset', '0px');
    if (pageMain) pageMain.style.marginTop = '';

    window.setTimeout(() => {
      if (!overlay.classList.contains('is-open')) {
        overlay.hidden = true;
      }
    }, 180);
  }

  openButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (!overlay.hidden && overlay.classList.contains('is-open')) closeSearch();
      else openSearch();
    });
  });

  closeButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      closeSearch();
    });
  });

  form?.addEventListener('submit', () => {
    closeSearch();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !overlay.hidden) closeSearch();
  });

  window.addEventListener('resize', () => {
    if (!overlay.hidden && overlay.classList.contains('is-open')) {
      applyOffsets(true);
    } else {
      applyOffsets(false);
    }
  });

  window.addEventListener('orientationchange', () => {
    if (!overlay.hidden && overlay.classList.contains('is-open')) {
      applyOffsets(true);
    } else {
      applyOffsets(false);
    }
  });
})();