(function () {
  const postBody = document.querySelector('.post-page-body');
  const sidebar = document.querySelector('.post-page-body .post-side');
  const header = document.querySelector('.topbar');
  if (!postBody || !sidebar || !header) return;

  const desktopQuery = window.matchMedia('(min-width: 980px)');
  let frameId = 0;
  let transitionFrameId = 0;
  let headerTransitioning = false;

  function readGap() {
    const value = Number.parseFloat(getComputedStyle(sidebar).getPropertyValue('--post-side-gap'));
    return Number.isFinite(value) ? value : 26;
  }

  function syncSidebarTop() {
    frameId = 0;
    if (!desktopQuery.matches) {
      sidebar.style.removeProperty('--post-side-sticky-top');
      return;
    }

    const headerRect = header.getBoundingClientRect();
    const visibleHeaderBottom = Math.max(0, Math.min(window.innerHeight, headerRect.bottom));
    const nextTop = Math.round(visibleHeaderBottom + readGap());
    sidebar.style.setProperty('--post-side-sticky-top', `${nextTop}px`);
  }

  function requestSync() {
    if (frameId) return;
    frameId = window.requestAnimationFrame(syncSidebarTop);
  }

  function trackHeaderTransition() {
    if (!headerTransitioning) {
      transitionFrameId = 0;
      return;
    }
    syncSidebarTop();
    transitionFrameId = window.requestAnimationFrame(trackHeaderTransition);
  }

  function startTransitionTracking() {
    headerTransitioning = true;
    if (!transitionFrameId) {
      transitionFrameId = window.requestAnimationFrame(trackHeaderTransition);
    }
  }

  function stopTransitionTracking() {
    headerTransitioning = false;
    if (transitionFrameId) {
      window.cancelAnimationFrame(transitionFrameId);
      transitionFrameId = 0;
    }
    requestSync();
  }

  window.addEventListener('scroll', requestSync, { passive: true });
  window.addEventListener('resize', requestSync, { passive: true });
  header.addEventListener('transitionrun', startTransitionTracking);
  header.addEventListener('transitionend', stopTransitionTracking);
  header.addEventListener('transitioncancel', stopTransitionTracking);

  if (typeof ResizeObserver === 'function') {
    const resizeObserver = new ResizeObserver(requestSync);
    resizeObserver.observe(header);
  }

  if (typeof MutationObserver === 'function') {
    const mutationObserver = new MutationObserver(requestSync);
    mutationObserver.observe(header, { attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
  }

  if (typeof desktopQuery.addEventListener === 'function') {
    desktopQuery.addEventListener('change', requestSync);
  } else if (typeof desktopQuery.addListener === 'function') {
    desktopQuery.addListener(requestSync);
  }

  requestSync();
})();
