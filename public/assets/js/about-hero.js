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

  fetch('/api/categories', { headers: { Accept: 'application/json' } })
    .then((res) => res.ok ? res.json() : Promise.reject(new Error('load failed')))
    .then((data) => {
      const rawItems = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      const categories = rawItems
        .map((item) => typeof item === 'string' ? { name: item.trim() } : { name: String(item?.name || '').trim() })
        .filter((item) => item.name);

      const links = [
        '<a class="posts-home-hero__category-link" href="/">전체</a>',
        ...categories.map((item) => `<a class="posts-home-hero__category-link" href="/?category=${encodeURIComponent(item.name)}">${escapeHtml(item.name)}</a>`),
        '<a class="posts-home-hero__about-link is-active" href="/about/">About</a>'
      ];

      heroBar.innerHTML = links.join('');
      if (typeof window.applyPostsHeroActiveState === 'function') window.applyPostsHeroActiveState(document);
    })
    .catch(() => {
      heroBar.innerHTML = '<a class="posts-home-hero__category-link" href="/">전체</a><a class="posts-home-hero__about-link is-active" href="/about/">About</a>';
      if (typeof window.applyPostsHeroActiveState === 'function') window.applyPostsHeroActiveState(document);
    });
})();