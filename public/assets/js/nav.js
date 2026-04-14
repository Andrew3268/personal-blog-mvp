(function () {
  const menu = document.getElementById('mobileSiteMenu');
  const openBtn = document.querySelector('.topbar-hamburger');
  const categoryBar = document.getElementById('mobileSiteCategoryBar');

  if (!menu || !openBtn) return;

  function setOpen(open) {
    menu.hidden = !open;
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    openBtn.classList.toggle('is-open', open);
    document.body.classList.toggle('has-mobile-menu-open', open);
  }

  openBtn.addEventListener('click', () => {
    const isOpen = openBtn.getAttribute('aria-expanded') === 'true';
    setOpen(!isOpen);
  });

  menu.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.matches('[data-path]') || target.closest('[data-path]') || target.matches('[data-admin-link]') || target.closest('[data-admin-link]')) {
      setOpen(false);
      return;
    }
    if (target === menu || target.classList.contains('mobile-site-menu__panel')) return;
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (menu.hidden) return;
    if (target.closest('#mobileSiteMenu .mobile-site-menu__panel')) return;
    if (target.closest('.topbar-hamburger')) return;
  });

  if (categoryBar && !categoryBar.dataset.boundCategoryClicks) {
    categoryBar.dataset.boundCategoryClicks = 'true';
    categoryBar.addEventListener('click', (event) => {
      const link = event.target.closest('a');
      if (link) setOpen(false);
    });
  }
})();