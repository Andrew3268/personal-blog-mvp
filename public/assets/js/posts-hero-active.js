(function () {
  function normalizePath(pathname) {
    const path = String(pathname || '').replace(/\/+$/, '');
    return path || '/';
  }

  function getCurrentState() {
    const url = new URL(window.location.href);
    return {
      path: normalizePath(url.pathname),
      category: String(url.searchParams.get('category') || '').trim()
    };
  }

  function getLinkState(link) {
    try {
      const href = link.getAttribute('href') || '';
      const url = new URL(href, window.location.origin);
      return {
        path: normalizePath(url.pathname),
        category: String(url.searchParams.get('category') || '').trim()
      };
    } catch (_) {
      return { path: '', category: '' };
    }
  }

  function isActiveLink(link, current) {
    const linkState = getLinkState(link);
    const isAboutLink = link.classList.contains('posts-home-hero__about-link') || linkState.path === '/about';
    const isCategoryLink = link.classList.contains('posts-home-hero__category-link');

    if (isAboutLink) {
      return current.path === '/about';
    }

    if (!isCategoryLink) return false;

    if (!current.category) {
      return linkState.path === '/' && !linkState.category;
    }

    return linkState.path === '/' && linkState.category === current.category;
  }

  function applyPostsHeroActiveState(root) {
    const scope = root || document;
    const links = scope.querySelectorAll('.posts-home-hero__category-link, .posts-home-hero__about-link');
    if (!links.length) return;

    const current = getCurrentState();
    links.forEach((link) => {
      link.classList.toggle('is-active', isActiveLink(link, current));
      link.setAttribute('aria-current', link.classList.contains('is-active') ? 'page' : 'false');
    });
  }

  window.applyPostsHeroActiveState = applyPostsHeroActiveState;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      applyPostsHeroActiveState(document);
    }, { once: true });
  } else {
    applyPostsHeroActiveState(document);
  }
})();
