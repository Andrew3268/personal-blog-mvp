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

  function buildLink(label, href, key, activeKey, extraClass = 'posts-home-hero__category-link') {
    const isActive = key === activeKey;
    return `<a class="${extraClass}${isActive ? ' is-active' : ''}" href="${href}" data-hero-nav-key="${escapeHtml(key)}"${isActive ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a>`;
  }

  const activeKey = 'about';

  fetch('/api/categories', { headers: { Accept: 'application/json' } })
    .then((res) => res.ok ? res.json() : Promise.reject(new Error('load failed')))
    .then((data) => {
      const rawItems = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      const categories = rawItems
        .map((item) => typeof item === 'string' ? { name: item.trim() } : { name: String(item?.name || '').trim() })
        .filter((item) => item.name);

      const links = [
        buildLink('전체', '/', 'all', activeKey),
        ...categories.map((item) => buildLink(item.name, `/?category=${encodeURIComponent(item.name)}`, item.name, activeKey)),
        buildLink('About', '/about/', 'about', activeKey, 'posts-home-hero__about-link')
      ];

      heroBar.innerHTML = links.join('');
    })
    .catch(() => {
      heroBar.innerHTML = [
        buildLink('전체', '/', 'all', activeKey),
        buildLink('About', '/about/', 'about', activeKey, 'posts-home-hero__about-link')
      ].join('');
    });
})();
