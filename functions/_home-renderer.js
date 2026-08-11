import { escapeHtml, jsonld, okHtml, edgeCache, getAdminSession, hasAdminSessionCookie } from "./_utils.js";
import { buildImageAttrs } from "../lib/image-utils.js";
import { canonicalCategoryName, categoryPath } from "./_category-utils.js";

export const SITE_ORIGIN = "https://wacky-wiki.com";
const SITE_NAME = "Wacky Wiki";
const PER_PAGE = 10;
const ARCHIVE_CACHE_VERSION = "9";

function clampInt(value, fallback, min, max) {
  const num = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeTagKey(value = "") {
  return normalizeText(value).replace(/^#+/, "").toLowerCase();
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

function excludeFeaturedFromSection(items = [], featured = null, limit = 4) {
  const featuredSlug = String(featured?.slug || "").trim();
  return (items || [])
    .filter((item) => !featuredSlug || String(item?.slug || "").trim() !== featuredSlug)
    .slice(0, limit);
}

function mapPopularRows(rows = []) {
  return (rows || []).map((row) => ({
    slug: row.slug,
    title: row.title,
    view_count: Number(row.view_count || 0),
    updated_at: row.updated_at,
    published_at: row.published_at
  }));
}

function categoryPageHeading(category = "", pageSuffix = "") {
  const name = canonicalCategoryName(category);
  const headings = {
    Life: "Life, 일상을 더 편리하게",
    Tech: "Tech, 더 똑똑한 선택",
    Pet: "Pet, 함께하는 일상을 위해"
  };
  return `${headings[name] || `${name} 이야기`}${pageSuffix}`;
}


async function fetchHomeData({ db, request, category = "", tag = "", page = 1, status = "published" }) {
  const admin = hasAdminSessionCookie(request)
    ? await getAdminSession({ BLOG_DB: db }, request).catch(() => null)
    : null;
  const requestedStatus = ["published", "draft", "all"].includes(status) ? status : "published";
  const safeStatus = admin ? requestedStatus : "published";
  const safeCategory = canonicalCategoryName(category);
  const safeTag = normalizeText(tag);
  const safePage = clampInt(page, 1, 1, 9999);
  const offset = (safePage - 1) * PER_PAGE;
  const editorialHome = !safeCategory && !safeTag && safeStatus === "published" && safePage === 1;

  const where = [];
  const binds = [];

  if (safeStatus !== "all") {
    where.push("status = ?");
    binds.push(safeStatus);
  }

  if (safeCategory) {
    where.push("category = ?");
    binds.push(safeCategory);
  }

  if (safeTag) {
    where.push("EXISTS (SELECT 1 FROM post_tags pt WHERE pt.post_slug = posts.slug AND pt.normalized_tag = ?)");
    binds.push(normalizeTagKey(safeTag));
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const baseBind = [...binds];
  const itemsStatement = db.prepare(`
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
      CASE WHEN status = 'published' THEN first_published_at ELSE published_at END AS published_at,
      updated_at
    FROM posts
    ${whereSql}
    ORDER BY updated_at DESC, first_published_at DESC
    LIMIT ? OFFSET ?
  `).bind(...baseBind, PER_PAGE, offset);
  const countStatement = db.prepare(`SELECT COUNT(*) AS total FROM posts ${whereSql}`).bind(...binds);
  const categoryStatement = db.prepare(`
    SELECT c.name, COUNT(p.slug) AS count, MAX(p.updated_at) AS updated_at
    FROM categories c
    LEFT JOIN posts p
      ON p.category = c.name
     AND p.status = 'published'
    GROUP BY c.name, c.sort_order
    ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC
  `);
  const popularStatement = db.prepare(`
    SELECT
      slug,
      title,
      view_count,
      updated_at,
      CASE WHEN status = 'published' THEN first_published_at ELSE published_at END AS published_at
    FROM posts
    ${whereSql}
    ORDER BY view_count DESC, updated_at DESC, first_published_at DESC
    LIMIT 10
  `).bind(...binds);
  const settingsStatement = db.prepare(`
    SELECT key, value
    FROM site_settings
    WHERE key = 'index_sidebar_ad_enabled'
  `);
  const categoryPopularStatement = db.prepare(`
    SELECT
      slug,
      title,
      view_count,
      updated_at,
      first_published_at AS published_at
    FROM posts
    WHERE status = 'published' AND category = ?
    ORDER BY view_count DESC, updated_at DESC, first_published_at DESC
    LIMIT 5
  `).bind(safeCategory || '__none__');
  const overallPopularStatement = db.prepare(`
    SELECT
      slug,
      title,
      view_count,
      updated_at,
      first_published_at AS published_at
    FROM posts
    WHERE status = 'published'
    ORDER BY view_count DESC, updated_at DESC, first_published_at DESC
    LIMIT 5
  `);
  const featuredStatement = editorialHome ? db.prepare(`
    SELECT
      slug,
      title,
      category,
      meta_description,
      summary,
      cover_image,
      cover_image_alt,
      view_count,
      first_published_at,
      published_at,
      updated_at
    FROM posts
    WHERE status = 'published'
    ORDER BY COALESCE(first_published_at, published_at, updated_at) DESC, updated_at DESC
    LIMIT 1
  `) : null;
  const lifeStatement = editorialHome ? db.prepare(`
    SELECT
      slug,
      title,
      category,
      meta_description,
      summary,
      cover_image,
      cover_image_alt,
      view_count,
      first_published_at,
      published_at,
      updated_at
    FROM posts
    WHERE status = 'published' AND category = 'Life'
    ORDER BY COALESCE(first_published_at, published_at, updated_at) DESC, updated_at DESC
    LIMIT 5
  `) : null;

  const statements = [
    itemsStatement,
    countStatement,
    categoryStatement,
    popularStatement,
    settingsStatement,
    categoryPopularStatement,
    overallPopularStatement
  ];
  if (editorialHome) {
    statements.push(featuredStatement, lifeStatement);
  }
  if (admin) {
    statements.push(db.prepare(`
      SELECT status, COUNT(*) AS count
      FROM posts
      ${whereSql}
      GROUP BY status
    `).bind(...binds));
  }

  const batchResults = await db.batch(statements);
  const [itemsRows, countRows, categoryRows, popularRows, settingsRows, categoryPopularRows, overallPopularRows] = batchResults;
  let resultIndex = 7;
  const featuredRows = editorialHome ? batchResults[resultIndex++] : null;
  const lifeRows = editorialHome ? batchResults[resultIndex++] : null;
  const statusRows = admin ? batchResults[resultIndex] : null;
  const featured = featuredRows?.results?.[0] || null;
  // Hero에 노출된 글은 같은 카테고리 섹션에서 다시 노출하지 않습니다.
  // 이후 Tech/Pet 섹션을 추가할 때도 동일 helper를 사용하면 같은 규칙이 적용됩니다.
  const lifeItems = excludeFeaturedFromSection(lifeRows?.results || [], featured, 4);
  const countRow = countRows?.results?.[0] || null;
  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const invalidPage = safePage > totalPages && (total > 0 || safePage > 1);
  const statusMap = admin
    ? new Map((statusRows?.results || []).map((row) => [String(row.status || "published").trim().toLowerCase(), Number(row.count || 0)]))
    : new Map([["published", total], ["draft", 0]]);
  const categoryExists = !safeCategory || (categoryRows?.results || []).some((row) => normalizeText(row.name) === safeCategory);

  return {
    archive: {
      category_exists: categoryExists
    },
    viewer: {
      is_admin: Boolean(admin)
    },
    items: itemsRows?.results || [],
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
    editorial_home: {
      enabled: editorialHome,
      featured,
      life: lifeItems
    },
    sidebar: {
      settings: {
        index_sidebar_ad_enabled: (settingsRows?.results || []).some((row) => row.key === "index_sidebar_ad_enabled" && String(row.value) === "1")
      },
      counts: {
        total,
        published: statusMap.get("published") || 0,
        draft: statusMap.get("draft") || 0
      },
      categories: aggregateCategories(categoryRows?.results || []),
      popular: mapPopularRows(popularRows?.results || []),
      category_popular: mapPopularRows(categoryPopularRows?.results || []),
      overall_popular: mapPopularRows(overallPopularRows?.results || [])
    }
  };
}


function aggregateCategories(rows = []) {
  const merged = new Map();
  for (const row of rows || []) {
    const name = canonicalCategoryName(row?.name);
    if (!name) continue;
    const current = merged.get(name) || { name, count: 0, updated_at: "" };
    current.count += Number(row?.count || 0);
    const candidateUpdated = String(row?.updated_at || "");
    if (candidateUpdated && (!current.updated_at || candidateUpdated > current.updated_at)) {
      current.updated_at = candidateUpdated;
    }
    merged.set(name, current);
  }
  return [...merged.values()].filter((row) => row.count > 0);
}

function renderCategoryNav(categories = [], activeCategory = "") {
  const active = normalizeText(activeCategory);
  const allLink = `<a class="posts-home-hero__category-link ${!active ? "is-active" : ""}" data-active-key="all" ${!active ? 'aria-current="page"' : ""} href="/">ALL</a>`;
  const links = categories
    .filter((item) => normalizeText(item.name))
    .map((item) => {
      const name = canonicalCategoryName(item.name);
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
      const name = canonicalCategoryName(item.name);
      return `<a class="topbar-categories__chip" href="${escapeHtml(categoryPath(name))}">${escapeHtml(name)} <span>${Number(item.count || 0)}</span></a>`;
    })
    .join("");
  return `<a class="topbar-categories__chip topbar-categories__chip--utility" href="/">ALL</a>${links}`;
}

function renderPostCard(item, index, page) {
  const slug = String(item.slug || "");
  const title = normalizeText(item.title || "제목 없음");
  const category = canonicalCategoryName(item.category || "");
  const updated = formatDate(item.first_published_at || item.published_at || item.updated_at);
  const href = postPath(slug);
  const cover = normalizeText(item.cover_image || "");
  const alt = normalizeText(item.cover_image_alt || `${title} 대표 이미지`);
  const imageLoadingAttrs = index < 2 && Number(page) === 1
    ? 'loading="eager" fetchpriority="high" decoding="async"'
    : 'loading="lazy" decoding="async"';
  const image = cover
    ? buildImageAttrs(cover, {
        widths: [480, 720, 960],
        sizes: "(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 34vw",
        fallbackWidth: 720,
        fit: "contain",
        quality: 84
      }, SITE_ORIGIN)
    : null;

  return `
    <article class="category-post-card js-post-card" data-href="${escapeHtml(href)}" tabindex="0" aria-label="${escapeHtml(title)} 글로 이동">
      <a class="home-life-card__media category-post-card__media archive-loading-media" href="${escapeHtml(href)}" aria-label="${escapeHtml(title)} 글 보기">
        ${image ? `<img ${image.attrs} alt="${escapeHtml(alt)}" ${imageLoadingAttrs} />` : '<div class="category-post-card__placeholder">대표 이미지 없음</div>'}
      </a>
      <div class="home-life-card__body category-post-card__body">
        <h2 class="home-life-card__title category-post-card__title"><a href="${escapeHtml(href)}">${escapeHtml(title)}</a></h2>
        <div class="home-life-card__meta category-post-card__meta">
          ${updated ? `<span>${escapeHtml(updated)}</span>` : ""}
          ${category ? `<span>${escapeHtml(category)}</span>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderHomeImage(item, { featured = false } = {}) {
  const title = normalizeText(item?.title || "제목 없음");
  const cover = normalizeText(item?.cover_image || "");
  const alt = normalizeText(item?.cover_image_alt || `${title} 대표 이미지`);
  if (!cover) {
    return `<div class="home-editorial__image-placeholder" aria-hidden="true">WACKY WIKI</div>`;
  }
  const image = buildImageAttrs(cover, {
    widths: featured ? [640, 960, 1280] : [320, 480, 640, 800],
    sizes: featured ? "(max-width: 840px) 100vw, 58vw" : "(max-width: 720px) 100vw, 25vw",
    fallbackWidth: featured ? 960 : 640,
    fit: "contain",
    quality: 84
  }, SITE_ORIGIN);
  const fallback = image.original || cover;
  return `<img ${image.attrs} alt="${escapeHtml(alt)}" ${featured ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'} decoding="async" data-home-image data-original-src="${escapeHtml(fallback)}" />`;
}

function renderEditorialHero(item) {
  if (!item) {
    return `<section class="home-editorial-hero home-editorial-hero--empty" aria-label="최신 글"><p class="home-editorial-empty">아직 발행된 글이 없습니다.</p></section>`;
  }
  const title = normalizeText(item.title || "제목 없음");
  const summary = normalizeText(item.summary || item.meta_description || "새롭게 발행된 글을 확인해 보세요.");
  const category = canonicalCategoryName(item.category || "");
  const date = formatDate(item.first_published_at || item.published_at || item.updated_at);
  const href = postPath(item.slug);
  return `
    <section class="home-editorial-hero" aria-labelledby="home-featured-title">
      <a class="home-editorial-hero__media home-loading-media" href="${escapeHtml(href)}" aria-label="${escapeHtml(title)} 글 보기">
        ${renderHomeImage(item, { featured: true })}
      </a>
      <div class="home-editorial-hero__content">
        <div class="home-editorial-hero__meta">
          ${category ? `<a href="${escapeHtml(categoryPath(category))}">${escapeHtml(category)}</a>` : ""}
          ${date ? `<span>${escapeHtml(date)}</span>` : ""}
        </div>
        <h1 id="home-featured-title" class="home-editorial-hero__title"><a href="${escapeHtml(href)}">${escapeHtml(title)}</a></h1>
        <p class="home-editorial-hero__summary">${escapeHtml(summary)}</p>
        <a class="home-editorial-hero__read" href="${escapeHtml(href)}">글 읽기 <span aria-hidden="true">→</span></a>
      </div>
    </section>`;
}

function renderLifeCard(item) {
  const title = normalizeText(item?.title || "제목 없음");
  const date = formatDate(item?.first_published_at || item?.published_at || item?.updated_at);
  const href = postPath(item?.slug || "");
  return `
    <article class="home-life-card">
      <a class="home-life-card__media home-loading-media" href="${escapeHtml(href)}" aria-label="${escapeHtml(title)} 글 보기">
        ${renderHomeImage(item)}
      </a>
      <div class="home-life-card__body">
        <h3 class="home-life-card__title"><a href="${escapeHtml(href)}">${escapeHtml(title)}</a></h3>
        <div class="home-life-card__meta">
          ${date ? `<span>${escapeHtml(date)}</span>` : ""}
          <span>Life</span>
        </div>
      </div>
    </article>`;
}

function renderLifeSection(items = []) {
  const cards = items.slice(0, 4).map(renderLifeCard).join("");
  return `
    <section class="home-life-section" aria-labelledby="home-life-title">
      <div class="home-section-heading">
        <h2 id="home-life-title">Life</h2>
        <a class="home-section-more" href="${escapeHtml(categoryPath("Life"))}">더보기</a>
      </div>
      ${cards ? `<div class="home-life-grid">${cards}</div>` : '<p class="home-editorial-empty">Life 카테고리에 발행된 글이 없습니다.</p>'}
    </section>`;
}

function renderHomeLowerSection(sidebar = {}) {
  const settings = sidebar.settings || {};
  const showAd = Boolean(settings.index_sidebar_ad_enabled);
  const popular = Array.isArray(sidebar.popular) ? sidebar.popular : [];
  return `
    <section class="home-lower-section ${showAd ? "home-lower-section--with-ad" : ""}" aria-labelledby="home-popular-title">
      ${showAd ? `<div class="home-lower-section__ad" data-index-sidebar-ad aria-label="광고 영역"><div class="post-side__ad-slot post-side__ad-slot--placeholder"><span>애드센스 광고가 들어갈 자리</span></div></div>` : ""}
      <div class="home-popular-block">
        <div class="home-section-heading home-section-heading--popular">
          <h2 id="home-popular-title">인기글</h2>
        </div>
        <ul id="postsPopular" class="home-popular-list">${renderPopularList(popular)}</ul>
      </div>
    </section>`;
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
  if (totalPages <= 1 || !hasMore) return "";
  const nextUrl = buildArchivePath(path, { page: page + 1, tag, status });

  return `
    <nav id="postsLoadMoreWrap" class="posts-pagination" aria-label="글 목록 더 보기">
      <button id="postsLoadMoreBtn" class="btn btn--brand posts-load-more__btn" type="button" data-next-url="${escapeHtml(nextUrl)}">더 보기</button>
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
  <link rel="stylesheet" href="/assets/css/app-20260812-v14.css" />
  <link rel="stylesheet" href="/assets/css/components.css?v=20260811v4" />
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
  const activeCategory = canonicalCategoryName(category);

  const data = await fetchHomeData({
    db: env.BLOG_DB,
    request,
    category: activeCategory,
    tag,
    page,
    status
  });

  if (activeCategory && !data.archive?.category_exists) {
    return archiveNotFoundResponse({
      title: "카테고리를 찾을 수 없습니다",
      description: `‘${activeCategory}’ 카테고리는 존재하지 않거나 삭제되었습니다.`
    });
  }

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

  const isDefaultHome = !activeCategory && !tag && data.filters.status === "published" && page === 1;
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
      : `${SITE_NAME} | Life · Tech · Pet 실용 가이드${pageSuffix}`;
  const baseDescription = activeCategory
    ? `${activeCategory} 카테고리에 발행된 Wacky Wiki 글을 모아 확인할 수 있습니다.`
    : tag
      ? `#${tag} 태그가 포함된 Wacky Wiki 글을 모아 확인할 수 있습니다.`
      : "Life, Tech, Pet 분야에서 선택과 사용에 필요한 실용 정보를 정리합니다.";
  const description = page > 1 ? `${baseDescription} 현재 ${page}페이지입니다.` : baseDescription;
  const pageHeading = activeCategory
    ? categoryPageHeading(activeCategory, pageSuffix)
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
  const homeAdsenseClient = String(env.ADSENSE_CLIENT || "ca-pub-7298667883751711").trim();
  const homeAdsenseHeadScript = data.sidebar.settings.index_sidebar_ad_enabled && homeAdsenseClient
    ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${escapeHtml(homeAdsenseClient)}" crossorigin="anonymous"></script>`
    : "";

  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: `${SITE_ORIGIN}/`,
    inLanguage: "ko-KR"
  };

  const structuredItems = isDefaultHome
    ? [data.editorial_home?.featured, ...(data.editorial_home?.life || [])]
        .filter(Boolean)
        .filter((item, index, items) => items.findIndex((candidate) => String(candidate.slug || "") === String(item.slug || "")) === index)
    : data.items;

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
      itemListElement: structuredItems.map((item, index) => ({
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
  ${homeAdsenseHeadScript}
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
  <meta name="theme-color" content="#ffffff" />
  ${isDefaultHome ? '<script>document.documentElement.classList.add("home-skeleton-active");</script>' : activeCategory ? '<script>document.documentElement.classList.add("archive-skeleton-active");</script>' : ""}
  <link rel="stylesheet" href="/assets/css/app-20260812-v14.css" />
  <link rel="preload" href="/assets/css/components.css?v=20260811v4" as="style" onload="this.onload=null;this.rel='stylesheet'" />
  <noscript><link rel="stylesheet" href="/assets/css/components.css?v=20260811v4" /></noscript>
  ${jsonld(websiteJsonLd)}
  ${jsonld(collectionJsonLd)}
</head>
<body class="page-home${activeCategory ? " page-category" : " page-archive"}">
  ${topbar(mobileCategoryHtml)}

  ${isDefaultHome ? `
  <main class="home-editorial-main">
    <div class="home-editorial-container">
      ${renderEditorialHero(data.editorial_home?.featured)}
      ${renderLifeSection(data.editorial_home?.life || [])}
      ${renderHomeLowerSection(data.sidebar)}
    </div>
  </main>` : `
  <main class="container posts-page">
    <section id="postsHomeHero" class="posts-home-hero posts-home-hero--category" aria-labelledby="postsPageTitle">
      <div class="posts-home-hero__content posts-home-hero__content--editorial">
        <h1 id="postsPageTitle" class="posts-home-hero__title">${escapeHtml(pageHeading)}</h1>
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
          <div class="post-side__ad-slot post-side__ad-slot--placeholder"><span>애드센스 광고가 들어갈 자리</span></div>
        </div>
        ${activeCategory ? `
        <div class="posts-sidebar__popular-shell" aria-labelledby="posts-category-popular-title">
          <h2 id="posts-category-popular-title" class="h2">${escapeHtml(activeCategory)} 인기글</h2>
          <ul id="postsCategoryPopular" class="post-side__popular-list posts-popular-list">${renderPopularList(data.sidebar.category_popular)}</ul>
        </div>
        <div class="posts-sidebar__popular-shell" aria-labelledby="posts-overall-popular-title">
          <h2 id="posts-overall-popular-title" class="h2">전체 인기글</h2>
          <ul id="postsOverallPopular" class="post-side__popular-list posts-popular-list">${renderPopularList(data.sidebar.overall_popular)}</ul>
        </div>` : `
        <div class="posts-sidebar__popular-shell" aria-labelledby="posts-popular-title">
          <h2 id="posts-popular-title" class="h2">인기글</h2>
          <ul id="postsPopular" class="post-side__popular-list posts-popular-list">${renderPopularList(data.sidebar.popular)}</ul>
        </div>`}
      </aside>
    </div>
  </main>`}

  ${footer()}
  ${isDefaultHome ? "" : `<script>window.__WACKY_INITIAL_POSTS__=${safeJson(data)};</script>`}
  <script src="/assets/js/nav.js?v=20260428v11" defer></script>
  <script src="/assets/js/site-search.js?v=20260428v10" defer></script>
  ${isDefaultHome ? '<script src="/assets/js/home.js?v=20260811v2" defer></script>' : '<script src="/assets/js/posts.js?v=20260811v3" defer></script><script src="/assets/js/post-layout.js?v=20260811v2" defer></script>'}
</body>
</html>`;

  return okHtml(html, {
    headers: {
      "cache-control": data.filters.status === "published" ? "public, max-age=120, s-maxage=600" : "private, no-store"
    }
  });
}

export async function renderHomePageCached({ env, request, category = "", waitUntil }) {
  const url = new URL(request.url);
  const page = clampInt(url.searchParams.get("page"), 1, 1, 9999);
  const tag = normalizeText(url.searchParams.get("tag"));
  const status = normalizeText(url.searchParams.get("status") || "published").toLowerCase();
  const activeCategory = canonicalCategoryName(category);

  if (status !== "published" || hasAdminSessionCookie(request)) {
    return renderHomePage({ env, request, category: activeCategory });
  }

  const cacheUrl = new URL(activeCategory ? categoryPath(activeCategory) : "/", SITE_ORIGIN);
  cacheUrl.searchParams.set("__cv", ARCHIVE_CACHE_VERSION);
  cacheUrl.searchParams.set("page", String(page));
  if (tag) cacheUrl.searchParams.set("tag", tag);
  const cacheKeyUrl = cacheUrl.toString();
  return edgeCache({
    request,
    cacheKeyUrl,
    ttlSeconds: 300,
    waitUntil,
    buildResponse: () => renderHomePage({ env, request, category: activeCategory })
  });
}
