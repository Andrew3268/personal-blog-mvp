(function () {
  const heroBar = document.getElementById('heroCategoryBar');
  if (!heroBar) return;

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function getActiveKey() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(window.location.search);
    const category = (params.get('category') || '').trim();
    if (path.includes('/about')) return 'about';
    if (category) return category;
    return 'all';
  }

  function applyActiveState(container) {
    const activeKey = getActiveKey();
    container.querySelectorAll('.posts-home-hero__category-link, .posts-home-hero__about-link').forEach((link) => {
      const key = String(link.getAttribute('data-active-key') || '').trim();
      const isActive = key && key === activeKey;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  fetch('/api/categories', { headers: { Accept: 'application/json' } })
    .then((res) => res.ok ? res.json() : Promise.reject(new Error('load failed')))
    .then((data) => {
      const rawItems = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      const categories = rawItems
        .map((item) => typeof item === 'string' ? { name: item.trim() } : { name: String(item?.name || '').trim() })
        .filter((item) => item.name);

      const links = [
        '<a class="posts-home-hero__category-link" data-active-key="all" href="/">전체</a>',
        ...categories.map((item) => `<a class="posts-home-hero__category-link" data-active-key="${escapeHtml(item.name)}" href="/?category=${encodeURIComponent(item.name)}">${escapeHtml(item.name)}</a>`),
        '<a class="posts-home-hero__about-link" data-active-key="about" href="/about/">About</a>'
      ];

      heroBar.innerHTML = links.join('');
      applyActiveState(heroBar);
    })
    .catch(() => {
      heroBar.innerHTML = '<a class="posts-home-hero__category-link" data-active-key="all" href="/">전체</a><a class="posts-home-hero__about-link" data-active-key="about" href="/about/">About</a>';
      applyActiveState(heroBar);
    });
})();