(function () {
  const menu = document.getElementById('mobileSiteMenu');
  const panel = menu ? menu.querySelector('.mobile-site-menu__panel') : null;
  const openBtn = document.querySelector('.topbar-hamburger');
  const closeBtn = menu ? menu.querySelector('[data-mobile-menu-close]') : null;
  const categoryBar = document.getElementById('mobileSiteCategoryBar');
  if (!menu || !panel || !openBtn) return;

  let isOpen = false;
  let closeTimer = null;

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

(function () {
  const postSidebar = document.querySelector('.post-shell .post-side');
  const topbar = document.querySelector('.topbar--editorial');
  if (!postSidebar || !topbar) return;

  const root = document.documentElement;
  let ticking = false;

  function updatePostSidebarOffset() {
    const rect = topbar.getBoundingClientRect();
    const headerVisible = rect.bottom > 4 && rect.top < window.innerHeight;
    const baseGap = 15;
    const visibleGap = 20;
    const nextTop = headerVisible ? Math.ceil(rect.bottom + visibleGap) : baseGap;
    root.style.setProperty('--post-sidebar-sticky-top', `${nextTop}px`);
    ticking = false;
  }

  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updatePostSidebarOffset);
  }

  requestUpdate();
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
})();
