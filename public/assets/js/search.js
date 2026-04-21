(function () {
  const overlay = document.getElementById('siteSearchOverlay');
  if (!overlay) return;

  const panel = overlay.querySelector('.search-overlay__panel');
  const input = overlay.querySelector('.search-overlay__input');
  const form = overlay.querySelector('.search-overlay__bar');
  const openButtons = document.querySelectorAll('[data-search-open]');
  const closeButtons = overlay.querySelectorAll('[data-search-close]');
  const mobileMenu = document.getElementById('mobileSiteMenu');

  function setSearchButtonsExpanded(isOpen) {
    openButtons.forEach((button) => {
      button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      button.classList.toggle('is-open', isOpen);
    });
  }

  function openSearch() {
    if (mobileMenu && !mobileMenu.hidden) return;
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      setSearchButtonsExpanded(true);
      input?.focus();
      input?.select?.();
    });
    document.body.classList.add('search-open');
  }

  function closeSearch() {
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    setSearchButtonsExpanded(false);
    document.body.classList.remove('search-open');
    window.setTimeout(() => {
      if (!overlay.classList.contains('is-open')) {
        overlay.hidden = true;
      }
    }, 180);
  }

  openButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      if (!overlay.hidden && overlay.classList.contains('is-open')) {
        closeSearch();
      } else {
        openSearch();
      }
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
})();