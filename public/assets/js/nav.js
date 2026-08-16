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

/* Mobile / tablet portrait preference
   - Installed/standalone or fullscreen contexts: request a real portrait lock when supported.
   - Normal browser tabs: keep the site's responsive layout in portrait mode while the device is landscape.
*/
(function () {
  const root = document.documentElement;
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const landscape = window.matchMedia('(orientation: landscape)');
  const standalone = window.matchMedia('(display-mode: standalone)');

  function isMobileOrTablet() {
    const hasTouch = coarsePointer.matches || Number(navigator.maxTouchPoints || 0) > 0;
    const screenWidth = Number(window.screen && window.screen.width) || 0;
    const screenHeight = Number(window.screen && window.screen.height) || 0;
    const largestSide = Math.max(screenWidth, screenHeight, window.innerWidth, window.innerHeight);
    return hasTouch && largestSide <= 1366;
  }

  function syncPortraitLayout() {
    const usePortraitLayout = isMobileOrTablet() && landscape.matches;
    root.classList.toggle('is-portrait-layout-locked', usePortraitLayout);
  }

  async function requestPortraitLock() {
    if (!isMobileOrTablet()) return;
    const orientation = window.screen && window.screen.orientation;
    if (!orientation || typeof orientation.lock !== 'function') return;

    const canRequestLock = standalone.matches || navigator.standalone === true || Boolean(document.fullscreenElement);
    if (!canRequestLock) return;

    try {
      await orientation.lock('portrait-primary');
    } catch (_) {
      try {
        await orientation.lock('portrait');
      } catch (_) {
        // Browser/platform policy can reject orientation locking. The CSS portrait-layout fallback remains active.
      }
    }
  }

  function sync() {
    syncPortraitLayout();
    requestPortraitLock();
  }

  sync();
  window.addEventListener('resize', syncPortraitLayout, { passive: true });
  window.addEventListener('orientationchange', sync, { passive: true });
  document.addEventListener('fullscreenchange', requestPortraitLock);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) sync();
  });

  if (typeof landscape.addEventListener === 'function') {
    landscape.addEventListener('change', sync);
    standalone.addEventListener('change', requestPortraitLock);
  }
})();
