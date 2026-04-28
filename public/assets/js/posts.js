

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function unwrapCfImageUrl(src = "") {
  const value = String(src || "").trim();
  if (!value || !value.includes("/cdn-cgi/image/")) return value;

  const marker = "/cdn-cgi/image/";
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return value;

  const afterMarker = value.slice(markerIndex + marker.length);
  const optionEnd = afterMarker.indexOf("/");
  if (optionEnd < 0) return value;

  const embedded = afterMarker.slice(optionEnd + 1);
  if (!embedded) return value;
  return embedded;

}

function absolutizeImageUrl(src = "") {
  const unwrapped = unwrapCfImageUrl(src);
  const value = String(unwrapped || "").trim();
  if (!value) return "";
  if (/^(data|blob):/i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  try {
    return new URL(value, window.location.origin).toString();
  } catch (_) {
    return value;
  }
}

function getImageHostname(url = "") {
  try { return new URL(url).hostname.toLowerCase(); } catch (_) { return ""; }
}

function getImageBaseDomain(hostname = "") {
  const parts = String(hostname || "").toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

function isR2DevImageUrl(url = "") {
  const raw = String(url || "").toLowerCase();
  const normalized = unwrapCfImageUrl(raw).toLowerCase();
  const host = getImageHostname(normalized);
  return raw.includes(".r2.dev") || normalized.includes(".r2.dev") || host.endsWith(".r2.dev") || host === "r2.dev";
}

function canUseCloudflareImageTransform(absolute = "") {
  const normalized = unwrapCfImageUrl(absolute);
  const srcHost = getImageHostname(normalized);
  const originHost = getImageHostname(window.location.origin);
  if (!srcHost || !originHost) return false;
  if (isR2DevImageUrl(normalized)) return false;
  if (srcHost === originHost) return true;
  return getImageBaseDomain(srcHost) === getImageBaseDomain(originHost);
}

function buildCfImageUrl(src = "", options = {}) {
  const raw = String(src || "").trim();
  const absolute = absolutizeImageUrl(raw);
  if (!absolute) return "";
  if (/^(data|blob):/i.test(absolute)) return absolute;
  if (isR2DevImageUrl(raw) || isR2DevImageUrl(absolute)) return absolute;
  if (!canUseCloudflareImageTransform(absolute)) return absolute;
  const config = { format: "auto", quality: 85, ...options };
  const params = Object.entries(config)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
  return `/cdn-cgi/image/${params}/${absolute}`;
}

function buildImageAttrs(src = "", config = {}) {
  const widths = Array.isArray(config.widths) && config.widths.length ? config.widths : [480, 768, 960, 1280];
  const normalized = [...new Set(widths.map((value) => Math.max(1, parseInt(value, 10) || 0)).filter(Boolean))].sort((a, b) => a - b);
  const baseOptions = { fit: config.fit || "scale-down", format: config.format || "auto", quality: config.quality || 85 };
  const absolute = absolutizeImageUrl(src);
  const transformed = canUseCloudflareImageTransform(absolute);
  const srcset = transformed ? normalized.map((width) => `${buildCfImageUrl(src, { ...baseOptions, width })} ${width}w`).join(", ") : "";
  const fallbackWidth = config.fallbackWidth || normalized[Math.min(1, normalized.length - 1)] || 768;
  return {
    src: buildCfImageUrl(src, { ...baseOptions, width: fallbackWidth }),
    srcset,
    sizes: config.sizes || "100vw",
    original: absolute
  };
}

function renderOptimizedImageAttrs(src = "", config = {}) {
  const image = buildImageAttrs(src, config);
  const fallbackSrc = image.original || absolutizeImageUrl(src);
  return `src="${escapeHtml(image.src)}"${image.srcset ? ` srcset="${escapeHtml(image.srcset)}"` : ""} sizes="${escapeHtml(image.sizes)}" data-original-src="${escapeHtml(fallbackSrc)}" onerror="this.onerror=null;this.removeAttribute('srcset');this.src=this.dataset.originalSrc;"`;
}

function getPostsHeroActiveKey() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(window.location.search);
  const category = (params.get('category') || '').trim();

  if (path.includes('/about')) return 'about';
  if (category) return category;
  return 'all';
}


async function loadSiteCategories() {
  try {
    const res = await fetch('/api/categories', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('Failed to load categories');
    const data = await res.json().catch(() => ({}));
    const rawItems = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    return rawItems
      .map((item) => {
        if (typeof item === 'string') return { name: item.trim(), count: 0 };
        return {
          name: String(item?.name || '').trim(),
          count: Number(item?.count || 0)
        };
      })
      .filter((item) => item.name);
  } catch (_) {
    return [];
  }
}

function mergeCategoryCounts(baseCategories = [], countedCategories = []) {
  const countMap = new Map(
    (Array.isArray(countedCategories) ? countedCategories : []).map((item) => [
      String(item?.name || '').trim(),
      Number(item?.count || 0)
    ])
  );

  const merged = [];
  const seen = new Set();

  (Array.isArray(baseCategories) ? baseCategories : []).forEach((item) => {
    const name = String(item?.name || '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    merged.push({
      name,
      count: countMap.has(name) ? countMap.get(name) : Number(item?.count || 0)
    });
  });

  (Array.isArray(countedCategories) ? countedCategories : []).forEach((item) => {
    const name = String(item?.name || '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    merged.push({
      name,
      count: Number(item?.count || 0)
    });
  });

  return merged;
}


function applyPostsHeroActiveState(container) {
  if (!container) return;
  const activeKey = getPostsHeroActiveKey();
  const links = container.querySelectorAll('.posts-home-hero__category-link, .posts-home-hero__about-link');
  links.forEach((link) => {
    const key = String(link.getAttribute('data-active-key') || '').trim();
    const isActive = key && key === activeKey;
    link.classList.toggle('is-active', isActive);
    if (isActive) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function buildPostsHeroNav(categories = []) {
  const activeKey = getPostsHeroActiveKey();
  const unique = [];
  const seen = new Set();

  (Array.isArray(categories) ? categories : []).forEach((cat) => {
    const name = String(cat?.name || '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    unique.push({ name, count: Number(cat?.count || 0) });
  });

  const items = [
    `<a class="posts-home-hero__category-link ${activeKey === 'all' ? 'is-active' : ''}" data-active-key="all" ${activeKey === 'all' ? 'aria-current="page"' : ''} href="/">전체</a>`,
    ...unique.map((cat) => {
      const safeName = cat.name;
      const isActive = activeKey === safeName;
      const href = `/?category=${encodeURIComponent(safeName)}`;
      return `<a class="posts-home-hero__category-link ${isActive ? 'is-active' : ''}" data-active-key="${escapeHtml(safeName)}" ${isActive ? 'aria-current="page"' : ''} href="${href}">${escapeHtml(safeName)}</a>`;
    }),
    `<a class="posts-home-hero__about-link ${activeKey === 'about' ? 'is-active' : ''}" data-active-key="about" ${activeKey === 'about' ? 'aria-current="page"' : ''} href="/about/">About</a>`
  ];

  return items.join('');
}

(function () {
  const $ = (sel) => document.querySelector(sel);
  const listEl = $('#postsList');
  const loadingEl = $('#postsLoading');
  const errorEl = $('#postsError');
  const emptyEl = $('#postsEmpty');
  const pageTitleEl = $('#postsPageTitle');
  const pageDescEl = $('#postsPageDescription');
  const postsSummaryEl = $('#postsSummary');
  const postsCategoriesEl = $('#postsCategories');
  const postsCategoriesBarEl = $('#postsCategoriesBar');
  const heroCategoryBarEl = $('#heroCategoryBar');
  const postsCategoriesToggleEl = $('#postsCategoriesToggle');
  const postsCategoriesMenuEl = $('#postsCategoriesMenu');
  const postsCategoriesCloseEl = $('#postsCategoriesClose');
  const postsPopularEl = $('#postsPopular');
  const mobileSiteCategoryBarEl = $('#mobileSiteCategoryBar');

  const postsHomeHeroEl = $('#postsHomeHero');



  function setHomeHeroMode() {
    if (!postsHomeHeroEl) return;
    const isHomeDefault = !category && !tag && safeStatus === 'published';
    postsHomeHeroEl.classList.toggle('posts-home-hero--index', isHomeDefault);
    postsHomeHeroEl.classList.toggle('posts-home-hero--category', !isHomeDefault);

    if (pageTitleEl) {
      pageTitleEl.classList.toggle('posts-home-hero__title--editorial', isHomeDefault);
      pageTitleEl.textContent = isHomeDefault ? 'Wacky Wiki' : getPageTitle();
    }

    if (pageDescEl) {
      pageDescEl.classList.toggle('posts-home-hero__desc--editorial', isHomeDefault);
      if (isHomeDefault) {
        pageDescEl.textContent = '정리된 생활 팁과 가이드를 빠르게 살펴보세요.';
      } else {
        pageDescEl.innerHTML = getPageDescription();
      }
    }

    const kickerEl = postsHomeHeroEl.querySelector('.posts-home-hero__kicker');
    const heroCategoryWrap = postsHomeHeroEl.querySelector('.posts-home-hero__category-wrap');
    if (kickerEl) kickerEl.hidden = !isHomeDefault;
    if (heroCategoryWrap) heroCategoryWrap.hidden = false;
  }
  const loadMoreWrap = $('#postsLoadMoreWrap');
  const loadMoreBtn = $('#postsLoadMoreBtn');

  const show = (el, on) => { if (el) el.hidden = !on; };
  const escapeHtml = (s) => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const url = new URL(window.location.href);
  const status = String(url.searchParams.get('status') || 'published').trim().toLowerCase();
  const category = String(url.searchParams.get('category') || '').trim();
  const tag = String(url.searchParams.get('tag') || '').trim();
  const initialPage = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const perPage = 8;
  const safeStatus = ['published', 'draft', 'all'].includes(status) ? status : 'published';

  let currentPage = initialPage;
  let hasMore = false;
  let isLoading = false;
  let isAdmin = false;
  let siteCategories = [];

  function buildApiUrl(page) {
    const apiUrl = new URL('/api/posts', window.location.origin);
    apiUrl.searchParams.set('page', String(page));
    apiUrl.searchParams.set('per_page', String(perPage));
    if (safeStatus) apiUrl.searchParams.set('status', safeStatus);
    if (category) apiUrl.searchParams.set('category', category);
    if (tag) apiUrl.searchParams.set('tag', tag);
    return apiUrl;
  }

  function buildPostsPageUrl(page) {
    const nextUrl = new URL('/', window.location.origin);
    if (safeStatus && safeStatus !== 'published') nextUrl.searchParams.set('status', safeStatus);
    if (category) nextUrl.searchParams.set('category', category);
    if (tag) nextUrl.searchParams.set('tag', tag);
    if (page > 1) nextUrl.searchParams.set('page', String(page));
    return `${nextUrl.pathname}${nextUrl.search}`;
  }

  function getPageTitle() {
    if (safeStatus === 'draft') return '초안 글 목록';
    if (safeStatus === 'all') return '전체 글 목록';
    if (category) return `카테고리: ${category}`;
    if (tag) return `태그: #${tag}`;
    return 'Wacky Wiki';
  }

  function getPageDescription() {
    if (safeStatus === 'draft') return '관리 중인 초안 글만 빠르게 확인할 수 있습니다.';
    if (safeStatus === 'all') return '발행글과 초안글을 모두 확인할 수 있습니다.';
    if (category) return `<b>${escapeHtml(category)}</b> 카테고리의 글만 모아 보여드립니다.`;
    if (tag) return `<b>#${escapeHtml(tag)}</b> 태그가 포함된 글만 모아 보여드립니다.`;
    return '정리된 생활 팁과 가이드를 빠르게 둘러보고 필요한 글만 골라 읽어보세요.';
  }

  async function loadAdminState() {
    const state = await (window.__adminSessionPromise || fetch('/api/admin/session', { credentials: 'same-origin' }).then((res) => res.ok ? res.json() : { authenticated: false }));
    isAdmin = Boolean(state && state.authenticated);
    return state;
  }

  function renderPostsSkeleton(count = 5, append = false) {
    if (!listEl) return;
    const markup = Array.from({ length: count }).map(() => `
      <article class="card post-card post-card--row post-card--skeleton" aria-hidden="true">
        <div class="post-card__thumb post-card__thumb--row skeleton-box skeleton-box--media"></div>
        <div class="post-card__body">
          <div class="post-meta post-meta--row">
            <div class="row row--chips">
              <span class="skeleton-box skeleton-box--chip"></span>
              <span class="skeleton-box skeleton-box--chip skeleton-box--chip-short"></span>
            </div>
            <span class="skeleton-box skeleton-box--date"></span>
          </div>
          <div class="skeleton-stack">
            <span class="skeleton-box skeleton-box--title"></span>
            <span class="skeleton-box skeleton-box--text"></span>
            <span class="skeleton-box skeleton-box--text skeleton-box--text-short"></span>
          </div>
          <div class="row post-admin-actions post-admin-actions--wrap">
            <span class="skeleton-box skeleton-box--button"></span>
            <span class="skeleton-box skeleton-box--button skeleton-box--button-muted"></span>
          </div>
        </div>
      </article>
    `).join('');

    if (append) listEl.insertAdjacentHTML('beforeend', `<div class="posts-skeleton-chunk">${markup}</div>`);
    else listEl.innerHTML = markup;
  }

  function clearAppendSkeleton() {
    listEl?.querySelectorAll('.posts-skeleton-chunk').forEach((el) => el.remove());
  }

  function renderSidebarSkeleton() {
    const categorySkeleton = Array.from({ length: 8 }).map(() => '<span class="topbar-categories__chip topbar-categories__chip--skeleton skeleton-box"></span>').join('');
    if (postsCategoriesBarEl) postsCategoriesBarEl.innerHTML = categorySkeleton;
    if (heroCategoryBarEl) heroCategoryBarEl.innerHTML = categorySkeleton;
    if (mobileSiteCategoryBarEl) mobileSiteCategoryBarEl.innerHTML = categorySkeleton;
    if (postsPopularEl) {
      postsPopularEl.innerHTML = Array.from({ length: 5 }).map((_, index) => `
        <li class="post-side__popular-link post-side__popular-link--skeleton" aria-hidden="true">
          <span class="post-side__popular-rank post-side__popular-rank--skeleton">${index + 1}</span>
          <span class="skeleton-box skeleton-box--popular"></span>
        </li>
      `).join('');
    }
  }

  function formatCountLabel(count, label) {
    return `<div class="posts-summary-card"><strong>${count}</strong><span>${label}</span></div>`;
  }

  function renderSidebar(sidebarData = {}) {
    const counts = sidebarData.counts || {};
    const categories = Array.isArray(sidebarData.categories) ? sidebarData.categories : [];
    const popular = Array.isArray(sidebarData.popular) ? sidebarData.popular : [];

    if (postsSummaryEl) {
      postsSummaryEl.innerHTML = [
        formatCountLabel(Number(counts.total || 0), safeStatus === 'draft' ? '초안 글' : '전체 글'),
        formatCountLabel(Number(counts.published || 0), '발행'),
        formatCountLabel(Number(counts.draft || 0), '초안')
      ].join('');
    }

    if (postsCategoriesEl) {
      postsCategoriesEl.innerHTML = '';
    }

    const navCategories = mergeCategoryCounts(siteCategories, categories);
    

    const categoryLinksHtml = navCategories.length
      ? navCategories.map((item) => {
          const name = String(item.name || '').trim();
          return `<a class="topbar-categories__chip" href="/?category=${encodeURIComponent(name)}">${escapeHtml(name)} <span>${Number(item.count || 0)}</span></a>`;
        }).join('')
      : '<span class="small">표시할 카테고리가 없습니다.</span>';

    const categoriesHtml = `<a class="topbar-categories__chip topbar-categories__chip--utility" href="/">전체</a>${categoryLinksHtml}<a class="topbar-categories__chip topbar-categories__chip--utility" href="/about/">About</a>`;

    if (postsCategoriesBarEl) {
      postsCategoriesBarEl.innerHTML = categoriesHtml;
    }

    if (heroCategoryBarEl) {
      heroCategoryBarEl.innerHTML = buildPostsHeroNav(navCategories);
      applyPostsHeroActiveState(heroCategoryBarEl);
    }

    if (mobileSiteCategoryBarEl) {
      mobileSiteCategoryBarEl.innerHTML = categoriesHtml;
    }

    if (postsPopularEl) {
      postsPopularEl.innerHTML = popular.length
        ? popular.map((item, index) => `
            <li>
              <a class="post-side__popular-link" href="/post/${encodeURIComponent(String(item.slug || ''))}">
                <span class="post-side__popular-rank">${index + 1}</span>
                <span class="post-side__popular-text">${escapeHtml(String(item.title || '제목 없음'))}</span>
              </a>
            </li>
          `).join('')
        : '<li class="small">인기글이 없습니다.</li>';
    }
  }

  function renderItems(items, { append = false } = {}) {
    const markup = items.map((it, index) => {
      const rawTitle = String(it.title || '(제목 없음)');
      const title = escapeHtml(rawTitle);
      const categoryText = String(it.category || '').trim();
      const categoryHtml = categoryText
        ? `<a class="badge" href="/?category=${encodeURIComponent(categoryText)}">${escapeHtml(categoryText)}</a>`
        : `<span class="badge">미분류</span>`;
      const summary = escapeHtml(it.summary || '요약이 아직 없습니다.');
      const slug = String(it.slug || '');
      const updated = escapeHtml(String(it.updated_at || '').slice(0, 10));
      const cover = String(it.cover_image || '').trim();
      const itemStatus = String(it.status || 'published').trim().toLowerCase();
      const statusBadge = itemStatus === 'draft'
        ? '<span class="badge badge--draft">초안</span>'
        : '<span class="badge">발행</span>';
      const postHref = itemStatus === 'published' ? `/post/${encodeURIComponent(slug)}` : `/edit.html?slug=${encodeURIComponent(slug)}`;
      const shouldPrioritizeImage = !append && index === 0 && page === 1;
      const imageLoadingAttrs = shouldPrioritizeImage
        ? 'loading="eager" fetchpriority="high" decoding="async" width="627" height="350"'
        : 'loading="lazy" decoding="async" width="627" height="350"';


      return `
        <article class="card post-card post-card--row js-post-card" data-href="${postHref}" tabindex="0" aria-label="${title} 글로 이동">
          <div class="post-card__thumb post-card__thumb--row">
            ${cover ? `<img ${renderOptimizedImageAttrs(cover, { widths: [320, 480, 640, 768], sizes: "(max-width: 760px) 36vw, 260px", fallbackWidth: 480, fit: "cover", quality: 85 })} alt="${title} 대표 이미지" ${imageLoadingAttrs} />` : '<div class="post-card__thumb-placeholder">대표 이미지 없음</div>'}
          </div>
          <div class="post-card__body">
            <div class="post-meta post-meta--row">
              <div class="row row--chips">
                ${categoryHtml}
                ${isAdmin ? statusBadge : ''}
              </div>
              <div class="small">${updated}</div>
            </div>
            <div class="post-card__title">${title}</div>
            <div class="post-card__summary">${summary}</div>
            <div class="row post-admin-actions post-admin-actions--wrap">
              ${itemStatus === 'published' ? `<a class="post-card__readmore" href="/post/${encodeURIComponent(slug)}"><span class="post-card__readmore-text">Read more</span><svg class="post-card__readmore-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h11"></path><path d="M13 7l5 5-5 5"></path></svg></a>` : ''}
              ${isAdmin ? `<span class="post-admin-actions__controls"><a class="btn" href="/edit.html?slug=${encodeURIComponent(slug)}">수정</a><button class="btn btn--danger js-delete-post" type="button" data-slug="${encodeURIComponent(slug)}" data-title="${escapeHtml(rawTitle)}">삭제</button></span>` : ''}
            </div>
          </div>
        </article>
      `;
    }).join('');

    if (append) listEl.insertAdjacentHTML('beforeend', markup);
    else listEl.innerHTML = markup;
  }

  function updateLoadMore(pagination = {}) {
    hasMore = Boolean(pagination.has_more);
    show(loadMoreWrap, hasMore);
    if (loadMoreBtn) {
      loadMoreBtn.disabled = !hasMore || isLoading;
      loadMoreBtn.textContent = isLoading ? '불러오는 중…' : '더보기';
    }
  }

  async function fetchPage(page, { append = false } = {}) {
    if (isLoading) return;
    isLoading = true;
    updateLoadMore({ has_more: hasMore, next_page: page });
    show(errorEl, false);
    if (!append) {
      show(loadingEl, false);
      show(emptyEl, false);
      renderPostsSkeleton();
      renderSidebarSkeleton();
    } else {
      renderPostsSkeleton(2, true);
    }

    try {
      const res = await fetch(buildApiUrl(page).toString(), { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('API 오류: ' + res.status);
      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      const pagination = data?.pagination || {};
      const sidebar = data?.sidebar || {};

      clearAppendSkeleton();

      if (!items.length && !append) {
        listEl.innerHTML = '';
        renderSidebar(sidebar);
        show(emptyEl, true);
        if (emptyEl) {
          if (safeStatus === 'draft') emptyEl.textContent = '등록된 초안 글이 없습니다.';
          else if (category) emptyEl.textContent = `'${category}' 카테고리 글이 없습니다.`;
          else if (tag) emptyEl.textContent = `'#${tag}' 태그 글이 없습니다.`;
          else emptyEl.textContent = '등록된 글이 없습니다.';
        }
        updateLoadMore({ has_more: false, next_page: null });
        return;
      }

      renderSidebar(sidebar);
      renderItems(items, { append });
      currentPage = Number(pagination.page || page);
      updateLoadMore(pagination);

      const nextUrl = new URL(window.location.href);
      if (currentPage > 1) nextUrl.searchParams.set('page', String(currentPage));
      else nextUrl.searchParams.delete('page');
      window.history.replaceState({ page: currentPage }, '', `${nextUrl.pathname}${nextUrl.search}`);
    } catch (err) {
      clearAppendSkeleton();
      if (!append) {
        listEl.innerHTML = '';
        renderSidebar({ counts: { total: 0, published: 0, draft: 0 }, categories: [], popular: [] });
      }
      show(emptyEl, false);
      show(errorEl, true);
      errorEl.textContent = '목록을 불러오지 못했습니다. ' + (err?.message || '');
    } finally {
      isLoading = false;
      updateLoadMore({ has_more: hasMore, next_page: currentPage + 1 });
    }
  }

  if (pageTitleEl) pageTitleEl.textContent = getPageTitle();
  if (pageDescEl) pageDescEl.innerHTML = getPageDescription();

  function closeCategoriesMenu() {
    if (!postsCategoriesMenuEl || !postsCategoriesToggleEl) return;
    postsCategoriesMenuEl.hidden = true;
    postsCategoriesToggleEl.setAttribute('aria-expanded', 'false');
  }

  function openCategoriesMenu() {
    if (!postsCategoriesMenuEl || !postsCategoriesToggleEl) return;
    postsCategoriesMenuEl.hidden = false;
    postsCategoriesToggleEl.setAttribute('aria-expanded', 'true');
  }

  postsCategoriesToggleEl?.addEventListener('click', () => {
    if (!postsCategoriesMenuEl) return;
    if (postsCategoriesMenuEl.hidden) openCategoriesMenu();
    else closeCategoriesMenu();
  });

  postsCategoriesCloseEl?.addEventListener('click', closeCategoriesMenu);

  document.addEventListener('click', (event) => {
    if (!postsCategoriesMenuEl || postsCategoriesMenuEl.hidden) return;
    const inside = event.target.closest('#postsCategoriesMenu, #postsCategoriesToggle');
    if (!inside) closeCategoriesMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCategoriesMenu();
  });

  loadMoreBtn?.addEventListener('click', () => {
    if (!hasMore || isLoading) return;
    fetchPage(currentPage + 1, { append: true });
  });

  listEl?.addEventListener('click', async (event) => {
    const deleteBtn = event.target.closest('.js-delete-post');
    if (deleteBtn) {
      const slug = decodeURIComponent(String(deleteBtn.dataset.slug || ''));
      const title = String(deleteBtn.dataset.title || slug || '이 글');
      if (!slug) return;
      const confirmed = window.confirm(`'${title}' 글을 삭제할까요? 삭제 후 되돌릴 수 없습니다.`);
      if (!confirmed) return;
      deleteBtn.disabled = true;
      deleteBtn.textContent = '삭제 중…';
      try {
        const res = await fetch(`/api/posts/${encodeURIComponent(slug)}`, { method: 'DELETE' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.message || `삭제 실패 (${res.status})`);
        const card = deleteBtn.closest('.post-card');
        if (card) card.remove();
        if (!listEl.children.length) {
          show(emptyEl, true);
          emptyEl.textContent = '등록된 글이 없습니다.';
        }
      } catch (err) {
        alert(err?.message || '삭제 중 오류가 발생했습니다.');
        deleteBtn.disabled = false;
        deleteBtn.textContent = '삭제';
      }
      return;
    }

    const blockedTarget = event.target.closest('a, button, input, select, textarea, label');
    if (blockedTarget) return;

    const card = event.target.closest('.js-post-card');
    const href = card?.dataset.href;
    if (href) window.location.href = href;
  });

  listEl?.addEventListener('keydown', (event) => {
    const card = event.target.closest('.js-post-card');
    if (!card) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const href = card.dataset.href;
    if (!href) return;
    event.preventDefault();
    window.location.href = href;
  });

  Promise.all([
    loadAdminState().catch(() => ({ authenticated: false })),
    loadSiteCategories().catch(() => [])
  ]).then(([_, categoriesResult]) => {
    siteCategories = Array.isArray(categoriesResult) ? categoriesResult : [];
    if (heroCategoryBarEl && siteCategories.length) {
      heroCategoryBarEl.innerHTML = buildPostsHeroNav(siteCategories);
    }
    fetchPage(initialPage, { append: false });
  });
})();
