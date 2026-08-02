import { okJson, getAdminSession, requireAdmin } from "../_utils.js";
import { normalizeTags, buildPostTagReplaceStatements, parseStoredTags } from "../_post-tags.js";
import { scheduleContentCacheInvalidation } from "../_cache-invalidation.js";

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeIsoDate(value, fallback = "") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function clampInt(value, fallback, min, max) {
  const num = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const status = String(url.searchParams.get("status") || "published").trim().toLowerCase();
  const category = normalizeText(url.searchParams.get("category"));
  const tag = normalizeText(url.searchParams.get("tag"));
  const query = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const searchTitle = String(url.searchParams.get("search_title") || "1").trim() !== "0";
  const searchContent = String(url.searchParams.get("search_content") || "0").trim() === "1";
  const page = clampInt(url.searchParams.get("page"), 1, 1, 9999);
  const perPage = clampInt(url.searchParams.get("per_page"), 8, 1, 24);
  const offset = (page - 1) * perPage;

  const admin = await getAdminSession(env, request);
  const allowedStatuses = new Set(["published", "draft", "all"]);
  const requestedStatus = allowedStatuses.has(status) ? status : "published";
  const safeStatus = admin ? requestedStatus : "published";

  const where = [];
  const binds = [];

  if (safeStatus !== "all") {
    where.push("status = ?");
    binds.push(safeStatus);
  }

  if (category) {
    where.push("category = ?");
    binds.push(category);
  }

  if (tag) {
    where.push("EXISTS (SELECT 1 FROM post_tags pt WHERE pt.post_slug = posts.slug AND pt.normalized_tag = ?)");
    binds.push(tag.replace(/^#+/, "").toLowerCase());
  }

  if (query) {
    const qLike = `%${query}%`;
    const queryParts = [];

    if (searchTitle) {
      queryParts.push(`LOWER(COALESCE(title, '')) LIKE ?`);
      binds.push(qLike);
    }

    if (searchContent) {
      queryParts.push(`LOWER(COALESCE(summary, '')) LIKE ?`);
      queryParts.push(`LOWER(COALESCE(meta_description, '')) LIKE ?`);
      queryParts.push(`LOWER(category) LIKE ?`);
      queryParts.push(`LOWER(COALESCE(content_md, '')) LIKE ?`);
      queryParts.push(`EXISTS (
        SELECT 1
        FROM post_tags pt
        WHERE pt.post_slug = posts.slug
          AND pt.normalized_tag LIKE ?
      )`);
      binds.push(qLike, qLike, qLike, qLike, qLike);
    }

    if (!queryParts.length) {
      queryParts.push(`LOWER(COALESCE(title, '')) LIKE ?`);
      binds.push(qLike);
    }

    where.push(`(${queryParts.join(" OR ")})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const baseBind = [...binds];
  const statements = [
    env.BLOG_DB.prepare(`
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
        metadata_updated_at,
        updated_at
      FROM posts
      ${whereSql}
      ORDER BY updated_at DESC, first_published_at DESC
      LIMIT ? OFFSET ?
    `).bind(...baseBind, perPage, offset),
    env.BLOG_DB.prepare(`SELECT COUNT(*) AS total FROM posts ${whereSql}`).bind(...binds),
    env.BLOG_DB.prepare(`
      SELECT
        c.name AS category_name,
        COUNT(p.slug) AS count
      FROM categories c
      LEFT JOIN posts p
        ON p.category = c.name
       AND p.status = 'published'
      GROUP BY c.name, c.sort_order
      HAVING COUNT(p.slug) > 0
      ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC
      LIMIT 50
    `),
    env.BLOG_DB.prepare(`
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
    `).bind(...binds),
    env.BLOG_DB.prepare(`
      SELECT key, value
      FROM site_settings
      WHERE key = 'index_sidebar_ad_enabled'
    `)
  ];
  if (admin) {
    statements.push(env.BLOG_DB.prepare(`
      SELECT status, COUNT(*) AS count
      FROM posts
      ${whereSql}
      GROUP BY status
    `).bind(...binds));
  }

  const batchResults = await env.BLOG_DB.batch(statements);
  const [itemsRows, countRows, categoryRows, popularRows, settingsRows, statusRows] = batchResults;
  const countRow = countRows?.results?.[0] || null;
  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const publicCacheHeaders = !admin && safeStatus === "published"
    ? { "cache-control": "public, max-age=30, s-maxage=60" }
    : { "cache-control": "private, no-store" };
  if (page > totalPages && (total > 0 || page > 1)) {
    return okJson({ message: "존재하지 않는 목록 페이지입니다." }, {
      status: 404,
      headers: publicCacheHeaders
    });
  }
  const statusMap = admin
    ? new Map((statusRows?.results || []).map((row) => [String(row.status || "published").trim().toLowerCase(), Number(row.count || 0)]))
    : new Map([["published", total], ["draft", 0]]);

  return okJson({
    viewer: {
      is_admin: Boolean(admin)
    },
    items: itemsRows?.results || [],
    filters: {
      status: safeStatus,
      category,
      tag,
      q: query
    },
    pagination: {
      page,
      per_page: perPage,
      total,
      total_pages: totalPages,
      has_more: page < totalPages,
      next_page: page < totalPages ? page + 1 : null
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
      categories: (categoryRows?.results || []).map((row) => ({
        name: normalizeText(row.category_name) || "미분류",
        count: Number(row.count || 0)
      })),
      popular: (popularRows?.results || []).map((row) => ({
        slug: row.slug,
        title: row.title,
        view_count: Number(row.view_count || 0),
        updated_at: row.updated_at,
        published_at: row.published_at
      }))
    }
  }, { headers: publicCacheHeaders });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const admin = await requireAdmin(env, request);
  if (!admin) return okJson({ message: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body) {
    return okJson({ message: "JSON이 필요합니다." }, { status: 400 });
  }

  const slug = String(body.slug || "").trim();
  const title = String(body.title || "").trim();
  const category = normalizeText(body.category);
  const metaDescription = String(body.meta_description || "").trim();
  const summary = String(body.summary || "").trim();
  const coverImage = String(body.cover_image || "").trim();
  const coverImageAlt = String(body.cover_image_alt || "").trim();
  const focusKeyword = String(body.focus_keyword || "").trim();
  const longtailKeywords = Array.isArray(body.longtail_keywords) ? body.longtail_keywords : [];
  const contentMd = String(body.content_md || "").trim();
  const faqMd = String(body.faq_md || "").trim();
  const enableSidebarAd = body.enable_sidebar_ad === false ? 0 : 1;
  const enableInarticleAds = body.enable_inarticle_ads === false ? 0 : 1;
  const requestedStatus = String(body.status || "published").trim().toLowerCase();
  const status = requestedStatus === "draft" ? "draft" : "published";
  const normalizedTags = normalizeTags(body.tags);
  const tags = normalizedTags.map((item) => item.tag);

  if (!slug || !title || !contentMd) {
    return okJson(
      { message: "slug, title, content_md는 필수입니다." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const current = await env.BLOG_DB.prepare(`
    SELECT status, category, tags_json, published_at, first_published_at
    FROM posts
    WHERE slug = ?
  `).bind(slug).first();
  const legacyPublishedAt = normalizeIsoDate(current?.published_at, now);
  const existingFirstPublishedAt = normalizeIsoDate(current?.first_published_at);
  const firstPublishedAt = status === "published"
    ? (existingFirstPublishedAt || (current?.status === "published" ? legacyPublishedAt : now))
    : (existingFirstPublishedAt || null);

  const upsertPostStatement = env.BLOG_DB.prepare(`
    INSERT INTO posts (
      slug,
      title,
      category,
      meta_description,
      summary,
      cover_image,
      cover_image_alt,
      focus_keyword,
      longtail_keywords_json,
      tags_json,
      content_md,
      faq_md,
      enable_sidebar_ad,
      enable_inarticle_ads,
      status,
      published_at,
      first_published_at,
      metadata_updated_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      category = excluded.category,
      meta_description = excluded.meta_description,
      summary = excluded.summary,
      cover_image = excluded.cover_image,
      cover_image_alt = excluded.cover_image_alt,
      focus_keyword = excluded.focus_keyword,
      longtail_keywords_json = excluded.longtail_keywords_json,
      tags_json = excluded.tags_json,
      content_md = excluded.content_md,
      faq_md = excluded.faq_md,
      enable_sidebar_ad = excluded.enable_sidebar_ad,
      enable_inarticle_ads = excluded.enable_inarticle_ads,
      status = excluded.status,
      published_at = excluded.published_at,
      first_published_at = excluded.first_published_at,
      metadata_updated_at = excluded.metadata_updated_at,
      updated_at = excluded.updated_at
  `).bind(
    slug,
    title,
    category,
    metaDescription,
    summary,
    coverImage,
    coverImageAlt,
    focusKeyword,
    JSON.stringify(longtailKeywords),
    JSON.stringify(tags),
    contentMd,
    faqMd,
    enableSidebarAd,
    enableInarticleAds,
    status,
    legacyPublishedAt,
    firstPublishedAt,
    now,
    now
  );

  await env.BLOG_DB.batch([
    upsertPostStatement,
    ...buildPostTagReplaceStatements(env.BLOG_DB, slug, normalizedTags, now)
  ]);

  const previousTags = parseStoredTags(current?.tags_json).map((item) => item.tag);
  scheduleContentCacheInvalidation({
    waitUntil: (promise) => context.waitUntil(promise),
    slugs: [slug],
    categories: [current?.category, category],
    tags: [...previousTags, ...tags]
  });

  return okJson({ ok: true, slug });
}
