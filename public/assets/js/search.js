(function () {
  const overlay = document.getElementById('siteSearchOverlay');
  if (!overlay) return;

  const input = overlay.querySelector('.search-overlay__input');
  const form = overlay.querySelector('.search-overlay__bar');
  const openButtons = document.querySelectorAll('[data-search-open]');
  const closeButtons = overlay.querySelectorAll('[data-search-close]');
  const mobileMenu = document.getElementById('mobileSiteMenu');
  const header = document.querySelector('.topbar.topbar--editorial');
  const pageMain = document.querySelector('.container.posts-page') || document.querySelector('main.container') || document.querySelector('main');

  function setSearchButtonsExpanded(isOpen) {
    openButtons.forEach((button) => {
      button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      button.classList.toggle('is-open', isOpen);
    });
  }

  function setOffsets() {
    const headerHeight = header ? header.offsetHeight : 64;
    document.documentElement.style.setProperty('--search-header-offset', `${headerHeight}px`);
    if (pageMain) {
      const panelHeight = overlay.classList.contains('is-open')
        ? (overlay.querySelector('.search-overlay__panel')?.offsetHeight || 88)
        : 0;
      document.documentElement.style.setProperty('--search-push-offset', `${panelHeight + 8}px`);
    }
  }

  function openSearch() {
    if (mobileMenu && !mobileMenu.hidden) return;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    setOffsets();
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      document.body.classList.add('search-open-inline');
      setSearchButtonsExpanded(true);
      setOffsets();
      input?.focus();
      input?.select?.();
    });
  }

  function closeSearch() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('search-open-inline');
    setSearchButtonsExpanded(false);
    document.documentElement.style.setProperty('--search-push-offset', '0px');
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
    if (event.key === 'Escape' && !overlay.hidden) {
      closeSearch();
    }
  });

  window.addEventListener('resize', setOffsets);
  window.addEventListener('orientationchange', setOffsets);
})();