import { okJson } from "../_utils.js";

function clampInt(value, fallback, min, max) {
  const num = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const status = String(url.searchParams.get("status") || "published").trim().toLowerCase();
  const category = String(url.searchParams.get("category") || "").trim();
  const tag = String(url.searchParams.get("tag") || "").trim();
  const page = clampInt(url.searchParams.get("page"), 1, 1, 9999);
  const perPage = clampInt(url.searchParams.get("per_page"), 8, 1, 24);
  const offset = (page - 1) * perPage;

  const allowedStatuses = new Set(["published", "draft", "all"]);
  const safeStatus = allowedStatuses.has(status) ? status : "published";

  const where = [];
  const binds = [];

  if (safeStatus !== "all") {
    where.push("status = ?");
    binds.push(safeStatus);
  }

  if (category) {
    where.push("TRIM(COALESCE(category, '')) = ?");
    binds.push(category);
  }

  if (tag) {
    where.push("EXISTS (SELECT 1 FROM json_each(COALESCE(tags_json, '[]')) WHERE TRIM(json_each.value) = ?)");
    binds.push(tag);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const itemsSql = `
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
      published_at,
      updated_at
    FROM posts
    ${whereSql}
    ORDER BY updated_at DESC, published_at DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `SELECT COUNT(*) AS total FROM posts ${whereSql}`;

  const baseBind = [...binds];
  const [itemsRows, countRow, categoryRows, popularRows, statusRows] = await Promise.all([
    env.BLOG_DB.prepare(itemsSql).bind(...baseBind, perPage, offset).all(),
    env.BLOG_DB.prepare(countSql).bind(...binds).first(),
    env.BLOG_DB.prepare(`
      SELECT TRIM(COALESCE(category, '')) AS category_name, COUNT(*) AS count
      FROM posts
      ${whereSql}
      GROUP BY TRIM(COALESCE(category, ''))
      ORDER BY count DESC, category_name COLLATE NOCASE ASC
      LIMIT 20
    `).bind(...binds).all(),
    env.BLOG_DB.prepare(`
      SELECT slug, title, view_count, updated_at, published_at
      FROM posts
      ${whereSql}
      ORDER BY view_count DESC, updated_at DESC, published_at DESC
      LIMIT 5
    `).bind(...binds).all(),
    env.BLOG_DB.prepare(`
      SELECT status, COUNT(*) AS count
      FROM posts
      ${whereSql}
      GROUP BY status
    `).bind(...binds).all()
  ]);

  const total = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const statusMap = new Map((statusRows?.results || []).map((row) => [String(row.status || "published").trim().toLowerCase(), Number(row.count || 0)]));

  return okJson({
    items: itemsRows.results || [],
    filters: {
      status: safeStatus,
      category,
      tag
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
      counts: {
        total,
        published: statusMap.get("published") || 0,
        draft: statusMap.get("draft") || 0
      },
      categories: (categoryRows.results || []).map((row) => ({
        name: String(row.category_name || "").trim() || "미분류",
        count: Number(row.count || 0)
      })),
      popular: (popularRows.results || []).map((row) => ({
        slug: row.slug,
        title: row.title,
        view_count: Number(row.view_count || 0),
        updated_at: row.updated_at,
        published_at: row.published_at
      }))
    }
  });
}

export async function onRequestPost({ env, request }) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return okJson({ message: "JSON이 필요합니다." }, { status: 400 });
  }

  const slug = String(body.slug || "").trim();
  const title = String(body.title || "").trim();
  const category = String(body.category || "").trim();
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
  const status = String(body.status || "published").trim() || "published";
  const tags = Array.isArray(body.tags) ? body.tags : [];

  if (!slug || !title || !contentMd) {
    return okJson(
      { message: "slug, title, content_md는 필수입니다." },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  await env.BLOG_DB.prepare(`
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
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    now,
    now
  ).run();

  return okJson({ ok: true, slug });
}
