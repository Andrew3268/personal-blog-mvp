(function () {
  const menu = document.getElementById('mobileSiteMenu');
  const panel = menu ? menu.querySelector('.mobile-site-menu__panel') : null;
  const openBtn = document.querySelector('.topbar-hamburger');
  const categoryBar = document.getElementById('mobileSiteCategoryBar');
  if (!menu || !panel || !openBtn) return;

  let isOpen = false;
  let closeTimer = null;

  function applyState(open) {
    isOpen = open;
    openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    openBtn.classList.toggle('is-open', open);
    document.body.classList.toggle('has-mobile-menu-open', open);
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    menu.classList.toggle('is-open', open);
  }

  function openMenu() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    menu.hidden = false;
    requestAnimationFrame(() => applyState(true));
  }

  function closeMenu() {
    applyState(false);
    closeTimer = setTimeout(() => {
      if (!isOpen) menu.hidden = true;
    }, 320);
  }

  function toggleMenu() {
    if (isOpen) closeMenu();
    else openMenu();
  }

  openBtn.addEventListener('click', toggleMenu);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) closeMenu();
  });

  menu.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('[data-path], [data-admin-link], .js-mobile-logout');
    if (link) {
      closeMenu();
    }
  });

  if (categoryBar) {
    categoryBar.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('a')) closeMenu();
    });
  }
})();
