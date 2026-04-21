
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

  function buildNav(categories) {
    const links = [
      '<a class="posts-home-hero__category-link" href="/">전체</a>',
      ...categories.map((item) => {
        const name = String(item?.name || '').trim();
        return `<a class="posts-home-hero__category-link" href="/?category=${encodeURIComponent(name)}">${escapeHtml(name)}</a>`;
      }),
      '<a class="posts-home-hero__about-link is-active" href="/about/">About</a>'
    ];
    heroBar.innerHTML = links.join('');
  }

  fetch('/api/categories', { headers: { Accept: 'application/json' } })
    .then((res) => res.ok ? res.json() : Promise.reject(new Error('load failed')))
    .then((data) => {
      const items = Array.isArray(data?.items) ? data.items : [];
      buildNav(items);
    })
    .catch(() => {
      buildNav([]);
    });
})();
