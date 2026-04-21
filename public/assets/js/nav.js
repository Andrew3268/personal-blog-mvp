(function () {
  const menu = document.getElementById('mobileSiteMenu');
  const panel = menu ? menu.querySelector('.mobile-site-menu__panel') : null;
  const openBtn = document.querySelector('.topbar-hamburger');
  const closeBtn = menu ? menu.querySelector('[data-mobile-menu-close]') : null;
  const categoryBar = document.getElementById('mobileSiteCategoryBar');
  if (!menu || !panel || !openBtn) return;

  let isOpen = false;
  let closeTimer = null;

  function ensureMenuTopbar() {
    if (panel.querySelector('.mobile-site-menu__topbar')) return;

    const topbar = document.createElement('div');
    topbar.className = 'mobile-site-menu__topbar';

    const closeWrap = panel.querySelector('.mobile-site-menu__close-wrap');
    if (closeWrap) topbar.appendChild(closeWrap);

    const brandSource = document.querySelector('.brand.brand--center');
    if (brandSource) {
      const brandClone = brandSource.cloneNode(true);
      brandClone.classList.add('mobile-site-menu__brand');
      topbar.appendChild(brandClone);
    }

    const searchSource = document.querySelector('.topbar-mobile-search, .nav__search-btn');
    if (searchSource) {
      const searchClone = searchSource.cloneNode(true);
      searchClone.classList.add('mobile-site-menu__search-btn');
      searchClone.classList.remove('topbar-mobile-search');
      topbar.appendChild(searchClone);
    }

    panel.insertBefore(topbar, panel.firstChild);
  }

  ensureMenuTopbar();

  function syncButtons(open) {
    openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    openBtn.classList.toggle('is-open', open);
    if (closeBtn) {
      closeBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      closeBtn.classList.toggle('is-open', open);
    }
  }

  function applyState(open) {
    isOpen = open;
    syncButtons(open);
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
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen) closeMenu();
  });

  menu.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('[data-path], [data-admin-link], .js-mobile-logout');
    if (link) closeMenu();
  });

  if (categoryBar) {
    categoryBar.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('a')) closeMenu();
    });
  }
})();
