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

  function getPathCategory() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'category' || !parts[1]) return '';
    try { return decodeURIComponent(parts[1]).replace(/\s+/g, ' ').trim(); }
    catch (_) { return String(parts[1] || '').replace(/\s+/g, ' ').trim(); }
  }

  function buildCategoryUrl(name = '') {
    const safeName = String(name || '').replace(/\s+/g, ' ').trim();
    return safeName ? `/category/${encodeURIComponent(safeName)}/` : '/';
  }

  function getActiveKey() {
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(window.location.search);
    const category = (params.get('category') || getPathCategory() || '').trim();
    if (category) return category;
    return 'all';
  }

  function applyActiveState(container) {
    const activeKey = getActiveKey();
    container.querySelectorAll('.posts-home-hero__category-link').forEach((link) => {
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
        '<a class="posts-home-hero__category-link" data-active-key="all" href="/">ALL</a>',
        ...categories.map((item) => `<a class="posts-home-hero__category-link" data-active-key="${escapeHtml(item.name)}" href="${buildCategoryUrl(item.name)}">${escapeHtml(item.name)}</a>`)
      ];

      heroBar.innerHTML = links.join('');
      applyActiveState(heroBar);
    })
    .catch(() => {
      heroBar.innerHTML = '<a class="posts-home-hero__category-link" data-active-key="all" href="/">ALL</a>';
      applyActiveState(heroBar);
    });
})();