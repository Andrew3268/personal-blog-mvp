

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

function isLocalImageOrigin(origin = "") {
  const host = getImageHostname(origin);
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
}


function isImageProxyUrl(url = "") {
  const value = String(url || "").trim();
  if (!value) return false;
  try {
    const parsed = new URL(value, window.location.origin);
    return parsed.pathname.startsWith("/img/");
  } catch (_) {
    return value.startsWith("/img/") || value.includes("/img/");
  }
}

function isR2DevImageUrl(url = "") {
  const raw = String(url || "").toLowerCase();
  const normalized = unwrapCfImageUrl(raw).toLowerCase();
  const host = getImageHostname(normalized);
  return raw.includes(".r2.dev") || normalized.includes(".r2.dev") || host.endsWith(".r2.dev") || host === "r2.dev";
}

function encodeImageBase64Url(value = "") {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function addProxyTransformParams(urlValue, options = {}) {
  if (!urlValue || !options || !Object.keys(options).length) return urlValue;
  try {
    const url = new URL(urlValue, window.location.origin);
    const width = Math.max(0, Math.min(2400, Number.parseInt(options.width, 10) || 0));
    const quality = Math.max(40, Math.min(95, Number.parseInt(options.quality, 10) || 82));
    const allowedFits = new Set(["scale-down", "contain", "cover", "crop", "pad"]);
    const fit = allowedFits.has(String(options.fit || "")) ? String(options.fit) : "scale-down";
    if (width) url.searchParams.set("width", String(width));
    if (quality) url.searchParams.set("quality", String(quality));
    url.searchParams.set("fit", fit);
    url.searchParams.set("format", String(options.format || "auto"));
    return url.toString();
  } catch (_) {
    return urlValue;
  }
}

function buildImageProxyUrl(src = "", options = {}) {
  const absolute = absolutizeImageUrl(src);
  if (!absolute || /^(data|blob):/i.test(absolute)) return absolute;
  if (!isR2DevImageUrl(absolute)) return absolute;
  return addProxyTransformParams(`${window.location.origin}/img/${encodeImageBase64Url(absolute)}`, options);
}

function canUseCloudflareImageTransform(absolute = "") {
  const normalized = unwrapCfImageUrl(absolute);
  if (isImageProxyUrl(normalized)) return false;

  const srcHost = getImageHostname(normalized);
  const originHost = getImageHostname(window.location.origin);
  if (!srcHost || !originHost) return false;
  if (isLocalImageOrigin(window.location.origin)) return false;
  if (srcHost === originHost) return true;
  return getImageBaseDomain(srcHost) === getImageBaseDomain(originHost);
}

function buildCfImageUrl(src = "", options = {}) {
  const raw = String(src || "").trim();
  const absolute = absolutizeImageUrl(raw);
  if (!absolute) return "";
  if (/^(data|blob):/i.test(absolute)) return absolute;
  if (isR2DevImageUrl(absolute)) return buildImageProxyUrl(absolute, options);
  if (!canUseCloudflareImageTransform(absolute)) return absolute;
  const config = { format: "auto", quality: 82, ...options };
  const params = Object.entries(config)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
  return `/cdn-cgi/image/${params}/${absolute}`;
}

function buildImageAttrs(src = "", config = {}) {
  const widths = Array.isArray(config.widths) && config.widths.length ? config.widths : [320, 640, 960, 1200];
  const normalized = [...new Set(widths.map((value) => Math.max(1, parseInt(value, 10) || 0)).filter(Boolean))].sort((a, b) => a - b);
  const baseOptions = { fit: config.fit || "scale-down", format: config.format || "auto", quality: config.quality || 82 };
  const absolute = absolutizeImageUrl(src);
  const isR2 = isR2DevImageUrl(absolute);
  const original = isR2 ? buildImageProxyUrl(absolute) : absolute;
  const transformed = isR2 || canUseCloudflareImageTransform(absolute);
  const srcset = transformed ? normalized.map((width) => `${buildCfImageUrl(src, { ...baseOptions, width })} ${width}w`).join(", ") : "";
  const fallbackWidth = config.fallbackWidth || normalized[Math.min(1, normalized.length - 1)] || 640;
  return {
    src: buildCfImageUrl(src, { ...baseOptions, width: fallbackWidth }),
    srcset,
    sizes: config.sizes || "100vw",
    original,
    directOriginal: absolute
  };
}

function renderOptimizedImageAttrs(src = "", config = {}) {
  const image = buildImageAttrs(src, config);
  const fallbackSrc = image.original || absolutizeImageUrl(src);
  const directFallbackSrc = image.directOriginal && image.directOriginal !== fallbackSrc ? image.directOriginal : "";
  const needsFallback = (image.src && image.src !== fallbackSrc) || directFallbackSrc;
  const onError = needsFallback
    ? ` onerror="this.removeAttribute('srcset');if(this.dataset.fallbackStep!=='proxy'&&this.dataset.originalSrc&&this.src!==this.dataset.originalSrc){this.dataset.fallbackStep='proxy';this.src=this.dataset.originalSrc;return;}if(this.dataset.directSrc&&this.src!==this.dataset.directSrc){this.dataset.fallbackStep='direct';this.src=this.dataset.directSrc;return;}this.onerror=null;"`
    : "";
  return `src="${escapeHtml(image.src)}"${image.srcset ? ` srcset="${escapeHtml(image.srcset)}"` : ""} sizes="${escapeHtml(image.sizes)}" data-original-src="${escapeHtml(fallbackSrc)}"${directFallbackSrc ? ` data-direct-src="${escapeHtml(directFallbackSrc)}"` : ""}${onError}`;
}
function canonicalCategoryName(value = '') {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const upper = normalized.toUpperCase();
  if (upper === 'LIVING' || upper === 'KITCHEN' || upper === 'HEALTH' || upper === 'CLEANING') return 'Life';
  return normalized;
}

function getPathCategory() {
  const parts = window.location.pathname.split('/').filter(Boolean);
  if (parts[0] !== 'category' || !parts[1]) return '';
  try {
    return canonicalCategoryName(decodeURIComponent(parts[1]));
  } catch (_) {
    return canonicalCategoryName(parts[1]);
  }
}

function buildCategoryUrl(name = '') {
  const safeName = canonicalCategoryName(name);
  return safeName ? `/category/${encodeURIComponent(safeName)}/` : '/';
}

function getPostsHeroActiveKey() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(window.location.search);
  const category = (params.get('category') || getPathCategory() || '').trim();

  if (path.includes('/about')) return 'about';
  if (category) return category;
  return 'all';
}


function mergeCategoryCounts(baseCategories = [], countedCategories = []) {
  const countMap = new Map(
    (Array.isArray(countedCategories) ? countedCategories : []).map((item) => [
      canonicalCategoryName(item?.name),
      Number(item?.count || 0)
    ])
  );

  const merged = [];
  const seen = new Set();

  (Array.isArray(baseCategories) ? baseCategories : []).forEach((item) => {
    const name = canonicalCategoryName(item?.name);
    if (!name || seen.has(name)) return;
    seen.add(name);
    merged.push({
      name,
      count: countMap.has(name) ? countMap.get(name) : Number(item?.count || 0)
    });
  });

  (Array.isArray(countedCategories) ? countedCategories : []).forEach((item) => {
    const name = canonicalCategoryName(item?.name);
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
  const links = container.querySelectorAll('.posts-home-hero__category-link');
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
    const name = canonicalCategoryName(cat?.name);
    if (!name || seen.has(name)) return;
    seen.add(name);
    unique.push({ name, count: Number(cat?.count || 0) });
  });

  const items = [
    `<a class="posts-home-hero__category-link ${activeKey === 'all' ? 'is-active' : ''}" data-active-key="all" ${activeKey === 'all' ? 'aria-current="page"' : ''} href="/">ALL</a>`,
    ...unique.map((cat) => {
      const safeName = cat.name;
      const isActive = activeKey === safeName;
      const href = buildCategoryUrl(safeName);
      return `<a class="posts-home-hero__category-link ${isActive ? 'is-active' : ''}" data-active-key="${escapeHtml(safeName)}" ${isActive ? 'aria-current="page"' : ''} href="${href}">${escapeHtml(safeName)}</a>`;
    })
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
  const postsCategoryPopularEl = $('#postsCategoryPopular');
  const postsOverallPopularEl = $('#postsOverallPopular');
  const mobileSiteCategoryBarEl = $('#mobileSiteCategoryBar');
  const indexSidebarAdEl = document.querySelector('[data-index-sidebar-ad]');

  const postsHomeHeroEl = $('#postsHomeHero');



  function setHomeHeroMode() {
    if (!postsHomeHeroEl) return;
    const isHomeDefault = !category && !tag && safeStatus === 'published';
    postsHomeHeroEl.classList.toggle('posts-home-hero--index', isHomeDefault);
    postsHomeHeroEl.classList.toggle('posts-home-hero--category', !isHomeDefault);

    if (pageTitleEl) {
      pageTitleEl.classList.toggle('posts-home-hero__title--editorial', isHomeDefault);
      pageTitleEl.classList.toggle('posts-home-hero__title--visually-hidden', isHomeDefault);
      pageTitleEl.textContent = getPageTitle();
    }

    if (pageDescEl) {
      pageDescEl.classList.toggle('posts-home-hero__desc--editorial', isHomeDefault);
      if (isHomeDefault) {
        pageDescEl.textContent = initialPage > 1
          ? `실생활에 바로 적용할 수 있는 생활 정보 글 목록의 ${initialPage}페이지입니다.`
          : '실생활에 바로 적용할 수 있는 생활 꿀팁과 정리된 가이드를 전하는 블로그입니다.';
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
  const category = String(url.searchParams.get('category') || getPathCategory() || '').trim();
  const tag = String(url.searchParams.get('tag') || '').trim();
  const initialPage = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const perPage = 10;
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
    const basePath = category ? buildCategoryUrl(category) : '/';
    const nextUrl = new URL(basePath, window.location.origin);
    if (safeStatus && safeStatus !== 'published') nextUrl.searchParams.set('status', safeStatus);
    if (tag) nextUrl.searchParams.set('tag', tag);
    if (page > 1) nextUrl.searchParams.set('page', String(page));
    return `${nextUrl.pathname}${nextUrl.search}`;
  }

  function getCategoryPageTitle(name = '') {
    const normalized = canonicalCategoryName(name);
    const headings = {
      Life: 'Life, 일상을 더 편리하게',
      Tech: 'Tech, 더 똑똑한 선택',
      Pet: 'Pet, 함께하는 일상을 위해'
    };
    return headings[normalized] || `${normalized} 이야기`;
  }

  function getPageTitle() {
    const pageSuffix = initialPage > 1 ? ` - ${initialPage}페이지` : '';
    if (safeStatus === 'draft') return `초안 글 목록${pageSuffix}`;
    if (safeStatus === 'all') return `전체 글 목록${pageSuffix}`;
    if (category) return `${getCategoryPageTitle(category)}${pageSuffix}`;
    if (tag) return `#${tag} 관련 글${pageSuffix}`;
    return `생활에 바로 쓰는 제품 정보와 실용 가이드${pageSuffix}`;
  }

  function getPageDescription() {
    if (safeStatus === 'draft') return '관리 중인 초안 글만 빠르게 확인할 수 있습니다.';
    if (safeStatus === 'all') return '발행글과 초안글을 모두 확인할 수 있습니다.';
    if (category) return `<b>${escapeHtml(category)}</b> 카테고리의 글만 모아 보여드립니다.`;
    if (tag) return `<b>#${escapeHtml(tag)}</b> 태그가 포함된 글만 모아 보여드립니다.`;
    return '정리된 생활 팁과 가이드를 빠르게 둘러보고 필요한 글만 골라 읽어보세요.';
  }

  function renderPostsSkeleton(count = 10, append = false) {
    if (!listEl) return;
    const markup = Array.from({ length: count }).map(() => `
      <article class="category-post-card category-post-card--skeleton" aria-hidden="true">
        <div class="home-life-card__media category-post-card__media skeleton-box skeleton-box--category-media"></div>
        <div class="home-life-card__body category-post-card__body">
          <div class="category-skeleton-title">
            <span class="skeleton-box skeleton-box--category-title"></span>
            <span class="skeleton-box skeleton-box--category-title skeleton-box--category-title-short"></span>
          </div>
          <div class="home-life-card__meta category-post-card__meta category-post-card__meta--skeleton">
            <span class="skeleton-box skeleton-box--category-meta"></span>
            <span class="skeleton-box skeleton-box--category-meta skeleton-box--category-meta-short"></span>
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
    const popularSkeleton = Array.from({ length: 5 }).map((_, index) => `
      <li class="post-side__popular-link post-side__popular-link--skeleton" aria-hidden="true">
        <span class="post-side__popular-rank post-side__popular-rank--skeleton">${index + 1}</span>
        <span class="skeleton-box skeleton-box--popular"></span>
      </li>
    `).join('');
    if (postsPopularEl) postsPopularEl.innerHTML = popularSkeleton;
    if (postsCategoryPopularEl) postsCategoryPopularEl.innerHTML = popularSkeleton;
    if (postsOverallPopularEl) postsOverallPopularEl.innerHTML = popularSkeleton;
  }

  function formatCountLabel(count, label) {
    return `<div class="posts-summary-card"><strong>${count}</strong><span>${label}</span></div>`;
  }

  function renderSidebar(sidebarData = {}) {
    const counts = sidebarData.counts || {};
    const categories = Array.isArray(sidebarData.categories) ? sidebarData.categories : [];
    const popular = Array.isArray(sidebarData.popular) ? sidebarData.popular : [];
    const categoryPopular = Array.isArray(sidebarData.category_popular) ? sidebarData.category_popular : [];
    const overallPopular = Array.isArray(sidebarData.overall_popular) ? sidebarData.overall_popular : [];
    const settings = sidebarData.settings || {};
    const showIndexSidebarAd = Boolean(settings.index_sidebar_ad_enabled);

    if (indexSidebarAdEl) {
      indexSidebarAdEl.hidden = !showIndexSidebarAd;
    }

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
          return `<a class="topbar-categories__chip" href="${buildCategoryUrl(name)}">${escapeHtml(name)} <span>${Number(item.count || 0)}</span></a>`;
        }).join('')
      : '<span class="small">표시할 카테고리가 없습니다.</span>';

    const categoriesHtml = `<a class="topbar-categories__chip topbar-categories__chip--utility" href="/">ALL</a>${categoryLinksHtml}`;

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

    const renderPopularItems = (items = []) => items.length
      ? items.map((item, index) => `
          <li>
            <a class="post-side__popular-link" href="/post/${encodeURIComponent(String(item.slug || ''))}">
              <span class="post-side__popular-rank">${index + 1}</span>
              <span class="post-side__popular-text">${escapeHtml(String(item.title || '제목 없음'))}</span>
            </a>
          </li>
        `).join('')
      : '<li class="small">인기글이 없습니다.</li>';

    if (postsPopularEl) postsPopularEl.innerHTML = renderPopularItems(popular);
    if (postsCategoryPopularEl) postsCategoryPopularEl.innerHTML = renderPopularItems(categoryPopular);
    if (postsOverallPopularEl) postsOverallPopularEl.innerHTML = renderPopularItems(overallPopular);
  }

  function bindArchiveImageLoading(scope = document) {
    scope.querySelectorAll('.archive-loading-media').forEach((media) => {
      if (media.dataset.archiveImageBound === '1') return;
      media.dataset.archiveImageBound = '1';
      const img = media.querySelector('img');
      if (!img) {
        media.classList.add('is-loaded');
        return;
      }
      const markLoaded = () => {
        media.classList.remove('is-loading');
        media.classList.add('is-loaded');
      };
      media.classList.add('is-loading');
      if (img.complete) markLoaded();
      else {
        img.addEventListener('load', markLoaded, { once: true });
        img.addEventListener('error', markLoaded, { once: true });
      }
    });
  }

  function waitForArchiveCriticalImages(timeoutMs = 1600) {
    const images = Array.from(document.querySelectorAll('.category-post-card__media img')).slice(0, 2);
    if (!images.length) return Promise.resolve();

    const pending = images.map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        const done = () => resolve();
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      });
    });

    return Promise.race([
      Promise.all(pending),
      new Promise((resolve) => window.setTimeout(resolve, timeoutMs))
    ]);
  }

  async function finishArchiveSkeleton() {
    await waitForArchiveCriticalImages();
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    document.documentElement.classList.remove('archive-skeleton-active');
  }

  function renderItems(items, { append = false, pageNumber = currentPage } = {}) {
    const markup = items.map((it, index) => {
      const rawTitle = String(it.title || '(제목 없음)');
      const title = escapeHtml(rawTitle);
      const categoryText = canonicalCategoryName(it.category);
      const slug = String(it.slug || '');
      const updated = escapeHtml(String(it.first_published_at || it.published_at || it.updated_at || '').slice(0, 10));
      const cover = String(it.cover_image || '').trim();
      const coverAlt = escapeHtml(String(it.cover_image_alt || `${rawTitle} 대표 이미지`).trim());
      const itemStatus = String(it.status || 'published').trim().toLowerCase();
      const postHref = itemStatus === 'published' ? `/post/${encodeURIComponent(slug)}` : `/edit.html?slug=${encodeURIComponent(slug)}`;
      const shouldPrioritizeImage = !append && index < 2 && Number(pageNumber) === 1;
      const imageLoadingAttrs = shouldPrioritizeImage
        ? 'loading="eager" fetchpriority="high" decoding="async"'
        : 'loading="lazy" decoding="async"';

      return `
        <article class="category-post-card js-post-card" data-href="${postHref}" tabindex="0" aria-label="${title} 글로 이동">
          <a class="home-life-card__media category-post-card__media archive-loading-media" href="${postHref}" aria-label="${title} 글 보기">
            ${cover ? `<img ${renderOptimizedImageAttrs(cover, { widths: [480, 720, 960], sizes: "(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 34vw", fallbackWidth: 720, fit: "contain", quality: 84 })} alt="${coverAlt}" ${imageLoadingAttrs} />` : '<div class="category-post-card__placeholder">대표 이미지 없음</div>'}
          </a>
          <div class="home-life-card__body category-post-card__body">
            <h2 class="home-life-card__title category-post-card__title"><a href="${postHref}">${title}</a></h2>
            <div class="home-life-card__meta category-post-card__meta">
              ${updated ? `<span>${updated}</span>` : ''}
              ${categoryText ? `<span>${escapeHtml(categoryText)}</span>` : ''}
            </div>
          </div>
        </article>
      `;
    }).join('');

    if (append) listEl.insertAdjacentHTML('beforeend', markup);
    else listEl.innerHTML = markup;
    bindArchiveImageLoading(listEl || document);
  }

  function updateLoadMore(pagination = {}) {
    hasMore = Boolean(pagination.has_more);
    show(loadMoreWrap, hasMore);
    if (loadMoreBtn) {
      show(loadMoreBtn, hasMore);
      loadMoreBtn.disabled = !hasMore || isLoading;
      loadMoreBtn.textContent = isLoading ? '불러오는 중…' : '더 보기';
      if (pagination.next_page) loadMoreBtn.dataset.nextUrl = buildPostsPageUrl(Number(pagination.next_page));
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
      renderPostsSkeleton(perPage, true);
    }

    try {
      const res = await fetch(buildApiUrl(page).toString(), { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error('API 오류: ' + res.status);
      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      const pagination = data?.pagination || {};
      const sidebar = data?.sidebar || {};
      isAdmin = Boolean(data?.viewer?.is_admin);
      if (!siteCategories.length && Array.isArray(sidebar.categories)) {
        siteCategories = sidebar.categories;
      }

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
      renderItems(items, { append, pageNumber: page });
      currentPage = Number(pagination.page || page);
      updateLoadMore(pagination);

    } catch (err) {
      clearAppendSkeleton();
      if (!append) {
        listEl.innerHTML = '';
        renderSidebar({ counts: { total: 0, published: 0, draft: 0 }, categories: [], popular: [], category_popular: [], overall_popular: [] });
      }
      show(emptyEl, false);
      show(errorEl, true);
      errorEl.textContent = '목록을 불러오지 못했습니다. ' + (err?.message || '');
    } finally {
      if (!append) await finishArchiveSkeleton();
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

  listEl?.addEventListener('click', (event) => {
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

  const initialData = window.__WACKY_INITIAL_POSTS__;
  const initialFilters = initialData?.filters || {};
  const initialPagination = initialData?.pagination || {};
  const initialSidebar = initialData?.sidebar || {};
  isAdmin = Boolean(initialData?.viewer?.is_admin);
  siteCategories = Array.isArray(initialSidebar.categories) ? initialSidebar.categories : [];

  if (heroCategoryBarEl && siteCategories.length) {
    heroCategoryBarEl.innerHTML = buildPostsHeroNav(siteCategories);
  }

  const canHydrateInitial = initialData
    && Number(initialPagination.page || 1) === initialPage
    && String(initialFilters.category || '') === category
    && String(initialFilters.tag || '') === tag
    && String(initialFilters.status || 'published') === safeStatus;

  if (canHydrateInitial) {
    const items = Array.isArray(initialData.items) ? initialData.items : [];
    renderSidebar(initialSidebar);
    if (items.length) {
      const hasServerRenderedCards = Boolean(listEl?.querySelector('.js-post-card'));
      if (!hasServerRenderedCards || isAdmin || safeStatus !== 'published') {
        renderItems(items, { append: false, pageNumber: initialPage });
      }
      show(emptyEl, false);
    } else {
      if (listEl) listEl.innerHTML = '';
      show(emptyEl, true);
      if (emptyEl) {
        if (safeStatus === 'draft') emptyEl.textContent = '등록된 초안 글이 없습니다.';
        else if (category) emptyEl.textContent = `'${category}' 카테고리 글이 없습니다.`;
        else if (tag) emptyEl.textContent = `'#${tag}' 태그 글이 없습니다.`;
        else emptyEl.textContent = '등록된 글이 없습니다.';
      }
    }
    currentPage = Number(initialPagination.page || initialPage);
    updateLoadMore(initialPagination);
    bindArchiveImageLoading(listEl || document);
    finishArchiveSkeleton();
    window.__WACKY_INITIAL_POSTS__ = null;
  } else {
    fetchPage(initialPage, { append: false });
  }
})();
