(function(){
  const path = location.pathname.replace(/\/$/, "") || "/";
  const currentCategory = String(new URL(location.href).searchParams.get('category') || '').trim();

  document.querySelectorAll('a[data-path]').forEach((a) => {
    const p = a.getAttribute('data-path');
    if (p === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  const menuEl = document.getElementById('mobileSiteMenu');
  const openBtn = document.querySelector('.topbar-hamburger');
  const closeBtn = document.querySelector('.mobile-site-menu__close');

  function setMenuState(open) {
    if (!menuEl || !openBtn) return;
    menuEl.hidden = !open;
    menuEl.setAttribute('aria-hidden', open ? 'false' : 'true');
    openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
  }

  openBtn?.addEventListener('click', () => setMenuState(true));
  closeBtn?.addEventListener('click', () => setMenuState(false));
  menuEl?.addEventListener('click', (event) => {
    if (event.target === menuEl) setMenuState(false);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenuState(false);
  });

  const desktopCategoryBar = document.getElementById('siteCategoryBar');
  const mobileCategoryBar = document.getElementById('mobileSiteCategoryBar');

  function renderCategories(target, categories) {
    if (!target) return;
    if (!Array.isArray(categories) || !categories.length) {
      target.innerHTML = '<span class="small">카테고리가 없습니다.</span>';
      return;
    }
    target.innerHTML = categories.map((item) => {
      const name = String(item.name || '').trim();
      const count = Number(item.count || 0);
      const isCurrent = currentCategory && currentCategory === name;
      const href = `/?category=${encodeURIComponent(name)}`;
      const currentAttr = isCurrent ? ' aria-current="true"' : '';
      return `<a class="topbar-categories__chip" href="${href}"${currentAttr}>${escapeHtml(name)} <span>${count}</span></a>`;
    }).join('');
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function loadCategories() {
    if (!desktopCategoryBar && !mobileCategoryBar) return;
    const skeleton = Array.from({ length: 7 }).map(() => '<span class="topbar-categories__chip topbar-categories__chip--skeleton"></span>').join('');
    if (desktopCategoryBar) desktopCategoryBar.innerHTML = skeleton;
    if (mobileCategoryBar) mobileCategoryBar.innerHTML = skeleton;

    try {
      const apiUrl = new URL('/api/posts', window.location.origin);
      apiUrl.searchParams.set('page', '1');
      apiUrl.searchParams.set('per_page', '1');
      apiUrl.searchParams.set('status', 'published');
      const res = await fetch(apiUrl.toString(), { headers: { accept: 'application/json' } });
      const json = await res.json();
      const categories = Array.isArray(json?.sidebar?.categories) ? json.sidebar.categories : [];
      renderCategories(desktopCategoryBar, categories);
      renderCategories(mobileCategoryBar, categories);
    } catch (error) {
      if (desktopCategoryBar) desktopCategoryBar.innerHTML = '<span class="small">카테고리를 불러오지 못했습니다.</span>';
      if (mobileCategoryBar) mobileCategoryBar.innerHTML = '<span class="small">카테고리를 불러오지 못했습니다.</span>';
    }
  }

  loadCategories();
})();
