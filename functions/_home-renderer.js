import { escapeHtml, jsonld, okHtml, edgeCache, getAdminSession, hasAdminSessionCookie } from "./_utils.js";
import { buildImageAttrs } from "../lib/image-utils.js";

export const SITE_ORIGIN = "https://wacky-wiki.com";
const SITE_NAME = "Wacky Wiki";
const PER_PAGE = 8;

function clampInt(value, fallback, min, max) {
  const num = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function categoryPath(name = "") {
  const safeName = normalizeText(name);
  return safeName ? `/category/${encodeURIComponent(safeName)}/` : "/";
}

function postPath(slug = "") {
  return `/post/${encodeURIComponent(String(slug || ""))}`;
}


function buildArchivePath(path, { page = 1, tag = "", status = "published" } = {}) {
  const url = new URL(path, SITE_ORIGIN);
  if (normalizeText(tag)) url.searchParams.set("tag", normalizeText(tag));
  if (status && status !== "published") url.searchParams.set("status", status);
  if (Number(page) > 1) url.searchParams.set("page", String(page));
  return `${url.pathname}${url.search}`;
}

function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function truncateText(value = "", max = 155) {
  const text = normalizeText(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

function safeJson(data) {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}


async function getAllCategoryRows(db) {
  try {
    const rows = await db.prepare(`
      SELECT c.name, COUNT(p.slug) AS count, MAX(p.updated_at) AS updated_at
      FROM categories c
      LEFT JOIN posts p
        ON TRIM(COALESCE(p.category, '')) = TRIM(c.name)
       AND p.status = 'published'
      GROUP BY c.name, c.sort_order
      ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC
    `).all();
    const items = rows.results || [];
    if (items.length) return items;
  } catch (_) {
    // categories 테이블이 없는 초기 배포 환경에서도 홈 SSR이 실패하지 않도록 fallback 사용
  }

  const fallback = await db.prepare(`
    SELECT TRIM(COALESCE(category, '')) AS name, COUNT(*) AS count, MAX(updated_at) AS updated_at
    FROM posts
    WHERE status = 'published'
      AND TRIM(COALESCE(category, '')) != ''
    GROUP BY TRIM(COALESCE(category, ''))
    ORDER BY name COLLATE NOCASE ASC
  `).all();
  return fallback.results || [];
}

async function fetchHomeData({ db, request, category = "", tag = "", page = 1, status = "published" }) {
  const admin = hasAdminSessionCookie(request)
    ? await getAdminSession({ BLOG_DB: db }, request).catch(() => null)
    : null;
  const requestedStatus = ["published", "draft", "all"].includes(status) ? status : "published";
  const safeStatus = admin ? requestedStatus : "published";
  const safeCategory = normalizeText(category);
  const safeTag = normalizeText(tag);
  const safePage = clampInt(page, 1, 1, 9999);
  const offset = (safePage - 1) * PER_PAGE;

  const where = [];
  const binds = [];

  if (safeStatus !== "all") {
    where.push("status = ?");
    binds.push(safeStatus);
  }

  if (safeCategory) {
    where.push("TRIM(COALESCE(category, '')) = ?");
    binds.push(safeCategory);
  }

  if (safeTag) {
    where.push("EXISTS (SELECT 1 FROM json_each(COALESCE(tags_json, '[]')) WHERE TRIM(json_each.value) = ?)");
    binds.push(safeTag);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const baseBind = [...binds];

  const [itemsRows, countRow, categoryRows, popularRows, statusRows, settingsRows] = await Promise.all([
    db.prepare(`
      SELECT
        slug,
        title,
        category,
        meta_description,
        summary,
        cover_image,
        cover_image_alt,
        focus_keyword,
        longtail_keywords_json,
        enable_sidebar_ad,
        enable_inarticle_ads,
        tags_json,
        status,
        view_count,
        COALESCE(first_published_at, published_at) AS published_at,
        updated_at
      FROM posts
      ${whereSql}
      ORDER BY updated_at DESC, COALESCE(first_published_at, published_at) DESC
      LIMIT ? OFFSET ?
    `).bind(...baseBind, PER_PAGE, offset).all(),
    db.prepare(`SELECT COUNT(*) AS total FROM posts ${whereSql}`).bind(...binds).first(),
    getAllCategoryRows(db),
    db.prepare(`
      SELECT slug, title, view_count, updated_at,
             COALESCE(first_published_at, published_at) AS published_at
      FROM posts
      ${whereSql}
      ORDER BY COALESCE(view_count, 0) DESC, updated_at DESC, COALESCE(first_published_at, published_at) DESC
      LIMIT 10
    `).bind(...binds).all(),
    db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM posts
      ${whereSql}
      GROUP BY status
    `).bind(...binds).all(),
    db.prepare(`SELECT key, value FROM site_settings WHERE key = 'index_sidebar_ad_enabled'`).all()
  ]);

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const invalidPage = safePage > totalPages && (total > 0 || safePage > 1);
  const statusMap = new Map((statusRows?.results || []).map((row) => [String(row.status || "published").trim().toLowerCase(), Number(row.count || 0)]));

  return {
    viewer: {
      is_admin: Boolean(admin)
    },
    items: itemsRows.results || [],
    filters: {
      status: safeStatus,
      category: safeCategory,
      tag: safeTag,
      q: ""
    },
    pagination: {
      page: safePage,
      per_page: PER_PAGE,
      total,
      total_pages: totalPages,
      has_more: safePage < totalPages,
      next_page: safePage < totalPages ? safePage + 1 : null,
      invalid_page: invalidPage
    },
    sidebar: {
      settings: {
        index_sidebar_ad_enabled: (settingsRows.results || []).some((row) => row.key === "index_sidebar_ad_enabled" && String(row.value) === "1")
      },
      counts: {
        total,
        published: statusMap.get("published") || 0,
        draft: statusMap.get("draft") || 0
      },
      categories: (categoryRows || [])
        .map((row) => ({
          name: normalizeText(row.name || row.category_name),
          count: Number(row.count || 0),
          updated_at: row.updated_at || ""
        }))
        .filter((row) => row.name && row.count > 0),
      popular: (popularRows.results || []).map((row) => ({
        slug: row.slug,
        title: row.title,
        view_count: Number(row.view_count || 0),
        updated_at: row.updated_at,
        published_at: row.published_at
      }))
    }
  };
}

function renderCategoryNav(categories = [], activeCategory = "") {
  const active = normalizeText(activeCategory);
  const allLink = `<a class="posts-home-hero__category-link ${!active ? "is-active" : ""}" data-active-key="all" ${!active ? 'aria-current="page"' : ""} href="/">ALL</a>`;
  const links = categories
    .filter((item) => normalizeText(item.name))
    .map((item) => {
      const name = normalizeText(item.name);
      const isActive = name === active;
      return `<a class="posts-home-hero__category-link ${isActive ? "is-active" : ""}" data-active-key="${escapeHtml(name)}" ${isActive ? 'aria-current="page"' : ""} href="${escapeHtml(categoryPath(name))}">${escapeHtml(name)}</a>`;
    })
    .join("");
  return allLink + links;
}

function renderChipCategories(categories = []) {
  const links = categories
    .filter((item) => normalizeText(item.name))
    .map((item) => {
      const name = normalizeText(item.name);
      return `<a class="topbar-categories__chip" href="${escapeHtml(categoryPath(name))}">${escapeHtml(name)} <span>${Number(item.count || 0)}</span></a>`;
    })
    .join("");
  return `<a class="topbar-categories__chip topbar-categories__chip--utility" href="/">ALL</a>${links}`;
}

function renderPostCard(item, index, page) {
  const slug = String(item.slug || "");
  const title = normalizeText(item.title || "제목 없음");
  const category = normalizeText(item.category || "");
  const summary = normalizeText(item.summary || item.meta_description || "요약이 아직 없습니다.");
  const updated = formatDate(item.updated_at || item.published_at);
  const href = postPath(slug);
  const cover = normalizeText(item.cover_image || "");
  const alt = normalizeText(item.cover_image_alt || `${title} 대표 이미지`);
  const imageLoadingAttrs = index === 0 && Number(page) === 1
    ? 'loading="eager" fetchpriority="high" decoding="async" width="640" height="360"'
    : 'loading="lazy" decoding="async" width="640" height="360"';
  const image = cover
    ? buildImageAttrs(cover, {
        widths: [320, 640, 960],
        sizes: "(max-width: 720px) 100vw, 320px",
        fallbackWidth: 640,
        fit: "cover",
        quality: 82
      }, SITE_ORIGIN)
    : null;

  return `
    <article class="card post-card post-card--row js-post-card" data-href="${escapeHtml(href)}" tabindex="0" aria-label="${escapeHtml(title)} 글로 이동">
      <div class="post-card__thumb post-card__thumb--row">
        ${image ? `<img ${image.attrs} alt="${escapeHtml(alt)}" ${imageLoadingAttrs} />` : '<div class="post-card__thumb-placeholder">대표 이미지 없음</div>'}
      </div>
      <div class="post-card__body">
        <div class="post-meta post-meta--row">
          <div class="row row--chips">
            ${category ? `<a class="badge" href="${escapeHtml(categoryPath(category))}">${escapeHtml(category)}</a>` : '<span class="badge">미분류</span>'}
          </div>
          ${updated ? `<div class="small">${escapeHtml(updated)}</div>` : ""}
        </div>
        <h2 class="post-card__title"><a href="${escapeHtml(href)}">${escapeHtml(title)}</a></h2>
        <p class="post-card__summary">${escapeHtml(summary)}</p>
        <div class="row post-admin-actions post-admin-actions--wrap">
          <a class="post-card__readmore" href="${escapeHtml(href)}"><span class="post-card__readmore-text">Read more</span><svg class="post-card__readmore-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h11"></path><path d="M13 7l5 5-5 5"></path></svg></a>
        </div>
      </div>
    </article>
  `;
}

function renderPopularList(items = []) {
  if (!items.length) return '<li class="small">인기글이 없습니다.</li>';
  return items.map((item, index) => `
    <li>
      <a class="post-side__popular-link" href="${escapeHtml(postPath(item.slug))}">
        <span class="post-side__popular-rank">${index + 1}</span>
        <span class="post-side__popular-text">${escapeHtml(normalizeText(item.title || "제목 없음"))}</span>
      </a>
    </li>
  `).join("");
}

function renderPagination({ path, page, totalPages, tag = "", status = "published", hasMore = false }) {
  if (totalPages <= 1) return "";
  const previousUrl = page > 1
    ? buildArchivePath(path, { page: page - 1, tag, status })
    : "";
  const nextUrl = hasMore
    ? buildArchivePath(path, { page: page + 1, tag, status })
    : "";

  return `
    <nav id="postsLoadMoreWrap" class="posts-pagination" aria-label="글 목록 페이지 이동">
      <div class="posts-pagination__links">
        ${previousUrl ? `<a class="btn posts-pagination__link" rel="prev" href="${escapeHtml(previousUrl)}">이전 페이지</a>` : `<span class="btn posts-pagination__link is-disabled" aria-disabled="true">이전 페이지</span>`}
        <span id="postsPaginationCurrent" class="posts-pagination__current" aria-current="page">${Number(page)} / ${Number(totalPages)} 페이지</span>
        ${nextUrl ? `<a id="postsNextPageLink" class="btn posts-pagination__link" rel="next" href="${escapeHtml(nextUrl)}">다음 페이지</a>` : `<span class="btn posts-pagination__link is-disabled" aria-disabled="true">다음 페이지</span>`}
      </div>
      ${nextUrl ? `<button id="postsLoadMoreBtn" class="btn btn--brand posts-load-more__btn" type="button" data-next-url="${escapeHtml(nextUrl)}">현재 화면에서 더보기</button>` : ""}
    </nav>
  `;
}

function renderArchiveNotFound({ title = "페이지를 찾을 수 없습니다", description = "요청한 글 목록 페이지가 존재하지 않습니다." } = {}) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} | ${escapeHtml(SITE_NAME)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <meta name="robots" content="noindex,follow" />
  <link rel="stylesheet" href="/assets/css/app.css?v=20260523v3" />
  <link rel="stylesheet" href="/assets/css/components.css?v=20260731v2" />
</head>
<body>
  <main class="container">
    <section class="card">
      <h1 class="h1">${escapeHtml(title)}</h1>
      <p class="p">${escapeHtml(description)}</p>
      <a class="btn btn--brand" href="/">블로그 홈으로 이동</a>
    </section>
  </main>
</body>
</html>`;
}

export function archiveNotFoundResponse(options = {}) {
  return okHtml(renderArchiveNotFound(options), {
    status: 404,
    headers: { "cache-control": "public, max-age=60, s-maxage=60" }
  });
}

function topbar(mobileCategoryHtml = "") {
  return `<header class="topbar topbar--editorial">
    <div class="topbar__inner topbar__inner--editorial">
      <button class="topbar-hamburger" type="button" aria-expanded="false" aria-controls="mobileSiteMenu" aria-label="메뉴 열기">
        <span></span><span></span><span></span>
      </button>

      <div class="topbar-left-slot"></div>

      <a class="brand brand--center" href="/" aria-label="Wacky Wiki 홈">
        <span class="brand__text">Wacky Wiki</span>
      </a>

      <nav class="nav nav--utility nav--right" aria-label="오른쪽 메뉴">
        <button class="nav__icon-btn nav__search-btn" type="button" data-site-search-toggle aria-label="검색 열기" aria-expanded="false">
          <svg class="nav__icon-svg nav__icon-svg--search" viewBox="0 0 24 24" aria-hidden="true" fill="none">
            <circle cx="11" cy="11" r="6.5"></circle>
            <path d="M16 16l5 5"></path>
          </svg>
        </button>
      </nav>
    </div>
  </header>

  <aside id="mobileSiteMenu" class="mobile-site-menu" hidden aria-hidden="true">
    <div class="mobile-site-menu__panel">
      <div class="mobile-site-menu__close-wrap">
        <button class="mobile-site-menu__close-toggle topbar-hamburger is-open" type="button" aria-label="메뉴 닫기" data-mobile-menu-close>
          <span></span><span></span><span></span>
        </button>
      </div>
      <nav class="mobile-site-menu__nav" aria-label="모바일 주요 메뉴"></nav>
      <div class="mobile-site-menu__section mobile-site-menu__section--categories">
        <div id="mobileSiteCategoryBar" class="topbar-categories__list topbar-categories__list--mobile">${mobileCategoryHtml}</div>
      </div>
    </div>
  </aside>`;
}

function footer() {
  return `<footer class="footer container">
    <div class="footer__inner">
      <div class="footer__copy">
        <div>© 2026 ${escapeHtml(SITE_NAME)}</div>
      </div>
      <nav class="footer__links" aria-label="하단 메뉴">
        <a class="footer__link" href="/about/">Wacky-Wiki 소개</a>
        <a class="footer__link" href="/privacy-policy/">개인정보 처리방침</a>
      </nav>
    </div>
  </footer>`;
}

function renderEmptyText({ category = "", tag = "", status = "published" }) {
  if (status === "draft") return "등록된 초안 글이 없습니다.";
  if (category) return `'${category}' 카테고리 글이 없습니다.`;
  if (tag) return `'#${tag}' 태그 글이 없습니다.`;
  return "등록된 글이 없습니다.";
}

export async function renderHomePage({ env, request, category = "" }) {
  const url = new URL(request.url);
  const page = clampInt(url.searchParams.get("page"), 1, 1, 9999);
  const tag = normalizeText(url.searchParams.get("tag"));
  const status = normalizeText(url.searchParams.get("status") || "published").toLowerCase();
  const activeCategory = normalizeText(category);

  const data = await fetchHomeData({
    db: env.BLOG_DB,
    request,
    category: activeCategory,
    tag,
    page,
    status
  });

  if (data.pagination.invalid_page) {
    return archiveNotFoundResponse({
      title: "존재하지 않는 목록 페이지입니다",
      description: "요청한 페이지 번호가 현재 글 목록 범위를 벗어났습니다."
    });
  }

  if (tag && data.pagination.total === 0) {
    return archiveNotFoundResponse({
      title: "태그 글을 찾을 수 없습니다",
      description: `‘#${tag}’ 태그가 포함된 공개 글이 없습니다.`
    });
  }

  const isDefaultHome = !activeCategory && !tag && data.filters.status === "published";
  const path = activeCategory ? categoryPath(activeCategory) : "/";
  const canonicalPath = buildArchivePath(path, {
    page,
    tag,
    status: data.filters.status
  });
  const canonicalUrl = new URL(canonicalPath, SITE_ORIGIN).toString();
  const pageSuffix = page > 1 ? ` - ${page}페이지` : "";
  const title = activeCategory
    ? `${activeCategory} 글 목록${pageSuffix} | ${SITE_NAME}`
    : tag
      ? `#${tag} 글 목록${pageSuffix} | ${SITE_NAME}`
      : `${SITE_NAME} 생활 꿀팁 블로그${pageSuffix}`;
  const baseDescription = activeCategory
    ? `${activeCategory} 카테고리에 발행된 Wacky Wiki 글을 모아 확인할 수 있습니다.`
    : tag
      ? `#${tag} 태그가 포함된 Wacky Wiki 글을 모아 확인할 수 있습니다.`
      : "실생활에 바로 적용할 수 있는 생활 꿀팁과 정리된 가이드를 전하는 블로그입니다.";
  const description = page > 1 ? `${baseDescription} 현재 ${page}페이지입니다.` : baseDescription;
  const pageHeading = activeCategory
    ? `${activeCategory} 글 모음${pageSuffix}`
    : tag
      ? `#${tag} 관련 글${pageSuffix}`
      : `생활에 바로 쓰는 제품 정보와 실용 가이드${pageSuffix}`;
  const shouldIndex = data.filters.status === "published" && !tag && (!activeCategory || data.pagination.total > 0);
  const robotsValue = shouldIndex
    ? "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1"
    : data.filters.status === "published"
      ? "noindex,follow,max-image-preview:large"
      : "noindex,nofollow";
  const mobileCategoryHtml = renderChipCategories(data.sidebar.categories);
  const heroCategoryHtml = renderCategoryNav(data.sidebar.categories, activeCategory);
  const postsHtml = data.items.length
    ? data.items.map((item, index) => renderPostCard(item, index, page)).join("")
    : "";
  const emptyText = renderEmptyText(data.filters);
  const adHidden = data.sidebar.settings.index_sidebar_ad_enabled ? "" : " hidden";
  const paginationHtml = renderPagination({
    path,
    page,
    totalPages: data.pagination.total_pages,
    tag,
    status: data.filters.status,
    hasMore: data.pagination.has_more
  });
  const previousUrl = page > 1
    ? new URL(buildArchivePath(path, { page: page - 1, tag, status: data.filters.status }), SITE_ORIGIN).toString()
    : "";
  const nextUrl = data.pagination.has_more
    ? new URL(buildArchivePath(path, { page: page + 1, tag, status: data.filters.status }), SITE_ORIGIN).toString()
    : "";

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: `${SITE_ORIGIN}/`,
    inLanguage: "ko-KR"
  };

  const collectionJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    url: canonicalUrl,
    description,
    inLanguage: "ko-KR",
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: `${SITE_ORIGIN}/`
    },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: data.items.map((item, index) => ({
        "@type": "ListItem",
        position: (page - 1) * PER_PAGE + index + 1,
        url: `${SITE_ORIGIN}${postPath(item.slug)}`,
        name: normalizeText(item.title || "제목 없음")
      }))
    }
  };

  const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="naver-site-verification" content="e49bca383d3b342f512aeaaf82017d3705a638b3" />
  <!-- Google AdSense: 사이트 소유권 확인 및 광고 기능 -->
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7298667883751711"
     crossorigin="anonymous"></script>
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(truncateText(description, 155))}" />
  <meta name="robots" content="${robotsValue}" />
  <link rel="alternate" type="application/rss+xml" title="Wacky Wiki RSS" href="${SITE_ORIGIN}/rss.xml" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  ${previousUrl ? `<link rel="prev" href="${escapeHtml(previousUrl)}" />` : ""}
  ${nextUrl ? `<link rel="next" href="${escapeHtml(nextUrl)}" />` : ""}
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:image" content="${SITE_ORIGIN}/assets/images/logo.png" />
  <meta property="og:image:width" content="520" />
  <meta property="og:image:height" content="520" />
  <meta property="og:image:alt" content="Wacky Wiki 로고" />
  <meta property="og:locale" content="ko_KR" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${SITE_ORIGIN}/assets/images/logo.png" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/images/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/images/favicon-192x192.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/images/apple-touch-icon.png" />
  <meta name="theme-color" content="#5B7CFF" />
  <link rel="stylesheet" href="/assets/css/app.css?v=20260523v3" />
  <link rel="preload" href="/assets/css/components.css?v=20260731v2" as="style" onload="this.onload=null;this.rel='stylesheet'" />
  <noscript><link rel="stylesheet" href="/assets/css/components.css?v=20260731v2" /></noscript>
  ${jsonld(websiteJsonLd)}
  ${jsonld(collectionJsonLd)}
</head>
<body class="page-home">
  ${topbar(mobileCategoryHtml)}

  <main class="container posts-page">
    <section id="postsHomeHero" class="posts-home-hero ${isDefaultHome ? "posts-home-hero--index" : "posts-home-hero--category"}" aria-label="카테고리 바로가기">
      <div class="posts-home-hero__content posts-home-hero__content--editorial">
        <h1 id="postsPageTitle" class="posts-home-hero__title ${isDefaultHome ? "posts-home-hero__title--editorial" : ""}">${escapeHtml(pageHeading)}</h1>
        <p id="postsPageDescription" class="posts-home-hero__desc ${isDefaultHome ? "posts-home-hero__desc--editorial" : ""}">${escapeHtml(description)}</p>
        <div class="posts-home-hero__category-wrap" aria-label="카테고리 바로가기">
          <div id="heroCategoryBar" class="topbar-categories__list topbar-categories__list--hero">${heroCategoryHtml}</div>
        </div>
      </div>
    </section>

    <div class="posts-layout posts-layout--clean posts-layout--home posts-layout--home-top">
      <section class="posts-main" aria-label="글 목록 영역">
        <div id="postsLoading" class="small posts-loading-text" aria-hidden="true"></div>
        <div id="postsError" class="small posts-error" hidden></div>
        <div id="postsEmpty" class="small"${data.items.length ? " hidden" : ""}>${escapeHtml(emptyText)}</div>
        <div id="postsList" class="grid post-list-grid post-list-grid--rows">${postsHtml}</div>

        ${paginationHtml}
      </section>

      <aside class="post-side posts-sidebar posts-sidebar--simple" aria-label="글 목록 사이드바">
        <div class="posts-sidebar__ad-shell" data-index-sidebar-ad${adHidden} aria-label="향후 애드센스 광고 영역">
          <div class="post-side__ad-slot post-side__ad-slot--placeholder">
            <span>애드센스 광고가 들어갈 자리</span>
          </div>
        </div>

        <div class="posts-sidebar__popular-shell" aria-labelledby="posts-popular-title">
          <h2 id="posts-popular-title" class="h2">인기글</h2>
          <ul id="postsPopular" class="post-side__popular-list posts-popular-list">${renderPopularList(data.sidebar.popular)}</ul>
        </div>
      </aside>
    </div>
  </main>

  ${footer()}
  <script>window.__WACKY_INITIAL_POSTS__=${safeJson(data)};</script>
  <script src="/assets/js/nav.js?v=20260428v11" defer></script>
  <script src="/assets/js/site-search.js?v=20260428v10" defer></script>
  <script src="/assets/js/posts.js?v=20260802v1" defer></script>
</body>
</html>`;

  return okHtml(html, {
    headers: {
      "cache-control": data.filters.status === "published" ? "public, max-age=120, s-maxage=600" : "private, no-store"
    }
  });
}

export async function renderHomePageCached({ env, request, category = "" }) {
  const url = new URL(request.url);
  const page = clampInt(url.searchParams.get("page"), 1, 1, 9999);
  const tag = normalizeText(url.searchParams.get("tag"));
  const status = normalizeText(url.searchParams.get("status") || "published").toLowerCase();
  const activeCategory = normalizeText(category);

  if (status !== "published" || hasAdminSessionCookie(request)) {
    return renderHomePage({ env, request, category: activeCategory });
  }

  const cacheKeyUrl = `${SITE_ORIGIN}${activeCategory ? categoryPath(activeCategory) : "/"}?page=${page}${tag ? `&tag=${encodeURIComponent(tag)}` : ""}`;
  return edgeCache({
    request,
    cacheKeyUrl,
    ttlSeconds: 300,
    buildResponse: () => renderHomePage({ env, request, category: activeCategory })
  });
}
