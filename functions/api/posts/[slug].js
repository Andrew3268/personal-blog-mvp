import { okJson, requireAdmin } from "../../_utils.js";
import { normalizeTags, buildPostTagReplaceStatements, parseStoredTags } from "../../_post-tags.js";
import { scheduleContentCacheInvalidation } from "../../_cache-invalidation.js";
import { normalizePostLinkStyle, parsePostLinkStyle, setPostLinkStyleToken } from "../../../lib/posts/link-style.js";
import { defaultAuthorKeyForCategory, normalizeAuthorKey } from "../../_authors.js";
import { hasEditorialChanges } from "../../_post-editorial.js";

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeIsoDate(value, fallback = "") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function safeDecodePathParam(value = "") {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return "";
  }
}

export async function onRequestGet({ env, params, request }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return okJson({ message: "관리자 로그인이 필요합니다." }, { status: 401 });
  const slug = safeDecodePathParam(params.slug);
  if (!slug) {
    return okJson({ message: "slug가 필요합니다." }, { status: 400 });
  }

  const row = await env.BLOG_DB.prepare(`
    SELECT
      slug,
      title,
      category,
      author_key,
      COALESCE((
        SELECT ps.subcategory_name
        FROM post_subcategories ps
        WHERE ps.post_slug = posts.slug
        LIMIT 1
      ), '') AS subcategory,
      meta_description,
      summary,
      cover_image,
      cover_image_alt,
      focus_keyword,
      longtail_keywords_json,
      enable_sidebar_ad,
      enable_inarticle_ads,
      tags_json,
      content_md,
      faq_md,
      status,
      CASE WHEN status = 'published' THEN first_published_at ELSE published_at END AS published_at,
      first_published_at,
      metadata_updated_at,
      updated_at
    FROM posts
    WHERE slug = ?
  `).bind(slug).first();

  if (!row) {
    return okJson({ message: "not_found" }, { status: 404 });
  }

  return okJson({
    item: {
      ...row,
      content_link_style: parsePostLinkStyle(row.content_md || "")
    }
  }, {
    headers: { "cache-control": "private, no-store" }
  });
}

export async function onRequestPut(context) {
  const { env, params, request } = context;
  const admin = await requireAdmin(env, request);
  if (!admin) return okJson({ message: "관리자 로그인이 필요합니다." }, { status: 401 });
  const slug = safeDecodePathParam(params.slug);
  if (!slug) {
    return okJson({ message: "slug가 필요합니다." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return okJson({ message: "JSON이 필요합니다." }, { status: 400 });
  }

  const title = String(body.title || "").trim();
  const category = normalizeText(body.category);
  const requestedAuthorKey = String(body.author_key || "").trim();
  const normalizedAuthorKey = normalizeAuthorKey(requestedAuthorKey);
  if (requestedAuthorKey && !normalizedAuthorKey) {
    return okJson({ message: "유효하지 않은 작성자입니다." }, { status: 400 });
  }
  const subcategory = category ? normalizeText(body.subcategory) : "";
  const metaDescription = String(body.meta_description || "").trim();
  const summary = String(body.summary || "").trim();
  const coverImage = String(body.cover_image || "").trim();
  const coverImageAlt = String(body.cover_image_alt || "").trim();
  const focusKeyword = String(body.focus_keyword || "").trim();
  const longtailKeywords = Array.isArray(body.longtail_keywords) ? body.longtail_keywords : [];
  const requestedContentLinkStyle = normalizePostLinkStyle(
    body.content_link_style || parsePostLinkStyle(body.content_md || "")
  );
  const contentMd = setPostLinkStyleToken(
    String(body.content_md || "").trim(),
    requestedContentLinkStyle
  );
  const faqMd = String(body.faq_md || "").trim();
  const enableSidebarAd = body.enable_sidebar_ad === false ? 0 : 1;
  const enableInarticleAds = body.enable_inarticle_ads === false ? 0 : 1;
  const requestedStatus = String(body.status || "published").trim().toLowerCase();
  const status = requestedStatus === "draft" ? "draft" : "published";
  const normalizedTags = normalizeTags(body.tags);
  const tags = normalizedTags.map((item) => item.tag);

  if (!title || !contentMd) {
    return okJson(
      { message: "title, content_md는 필수입니다." },
      { status: 400 }
    );
  }

  if (subcategory) {
    const validSubcategory = await env.BLOG_DB.prepare(`
      SELECT name FROM subcategories WHERE category_name = ? AND name = ?
    `).bind(category, subcategory).first();
    if (!validSubcategory) {
      return okJson({ message: "선택한 서브 카테고리가 메인 카테고리에 속하지 않습니다." }, { status: 400 });
    }
  }

  const current = await env.BLOG_DB
    .prepare(`
      SELECT
        status, category, author_key, title, summary, cover_image, cover_image_alt,
        content_md, faq_md, tags_json, published_at, first_published_at, metadata_updated_at, updated_at
      FROM posts
      WHERE slug = ?
    `)
    .bind(slug)
    .first();

  if (!current) {
    return okJson({ message: "not_found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const authorKey = normalizedAuthorKey
    || normalizeAuthorKey(current.author_key)
    || defaultAuthorKeyForCategory(category);
  const publishedAt = normalizeIsoDate(current.published_at, now);
  const existingFirstPublishedAt = normalizeIsoDate(current.first_published_at);
  const firstPublishedAt = status === "published"
    ? (existingFirstPublishedAt || (current.status === "published" ? publishedAt : now))
    : (existingFirstPublishedAt || null);
  const editorialChanged = hasEditorialChanges(current, {
    title,
    category,
    author_key: authorKey,
    summary,
    cover_image: coverImage,
    cover_image_alt: coverImageAlt,
    content_md: contentMd,
    faq_md: faqMd
  });
  const becamePublished = current.status !== "published" && status === "published";
  const existingUpdatedAt = normalizeIsoDate(current.updated_at);
  const updatedAt = (editorialChanged || becamePublished)
    ? now
    : (existingUpdatedAt || firstPublishedAt || publishedAt || now);

  const updatePostStatement = env.BLOG_DB.prepare(`
    UPDATE posts
    SET
      title = ?,
      category = ?,
      author_key = ?,
      meta_description = ?,
      summary = ?,
      cover_image = ?,
      cover_image_alt = ?,
      focus_keyword = ?,
      longtail_keywords_json = ?,
      tags_json = ?,
      content_md = ?,
      faq_md = ?,
      enable_sidebar_ad = ?,
      enable_inarticle_ads = ?,
      status = ?,
      published_at = ?,
      first_published_at = ?,
      metadata_updated_at = ?,
      updated_at = ?
    WHERE slug = ?
  `).bind(
    title,
    category,
    authorKey,
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
    publishedAt,
    firstPublishedAt,
    now,
    updatedAt,
    slug
  );

  const subcategoryStatement = subcategory
    ? env.BLOG_DB.prepare(`
        INSERT INTO post_subcategories (post_slug, category_name, subcategory_name, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(post_slug) DO UPDATE SET
          category_name = excluded.category_name,
          subcategory_name = excluded.subcategory_name,
          updated_at = excluded.updated_at
      `).bind(slug, category, subcategory, now)
    : env.BLOG_DB.prepare(`DELETE FROM post_subcategories WHERE post_slug = ?`).bind(slug);

  await env.BLOG_DB.batch([
    updatePostStatement,
    subcategoryStatement,
    ...buildPostTagReplaceStatements(env.BLOG_DB, slug, normalizedTags, now)
  ]);

  const previousTags = parseStoredTags(current.tags_json).map((item) => item.tag);
  scheduleContentCacheInvalidation({
    waitUntil: (promise) => context.waitUntil(promise),
    slugs: [slug],
    categories: [current.category, category],
    tags: [...previousTags, ...tags]
  });

  return okJson({
    ok: true,
    slug,
    updated_at: updatedAt,
    modified_date_updated: editorialChanged || becamePublished,
    content_link_style: requestedContentLinkStyle
  });
}

export async function onRequestDelete(context) {
  const { env, params, request } = context;
  const admin = await requireAdmin(env, request);
  if (!admin) return okJson({ message: "관리자 로그인이 필요합니다." }, { status: 401 });
  const slug = safeDecodePathParam(params.slug);
  if (!slug) {
    return okJson({ message: "slug가 필요합니다." }, { status: 400 });
  }

  const existing = await env.BLOG_DB.prepare(`SELECT slug, category, tags_json FROM posts WHERE slug = ?`).bind(slug).first();
  if (!existing) {
    return okJson({ message: "not_found" }, { status: 404 });
  }

  await env.BLOG_DB.batch([
    env.BLOG_DB.prepare(`DELETE FROM post_tags WHERE post_slug = ?`).bind(slug),
    env.BLOG_DB.prepare(`DELETE FROM post_subcategories WHERE post_slug = ?`).bind(slug),
    env.BLOG_DB.prepare(`DELETE FROM post_view_accumulator WHERE post_slug = ?`).bind(slug),
    env.BLOG_DB.prepare(`DELETE FROM posts WHERE slug = ?`).bind(slug)
  ]);

  scheduleContentCacheInvalidation({
    waitUntil: (promise) => context.waitUntil(promise),
    slugs: [slug],
    categories: [existing.category],
    tags: parseStoredTags(existing.tags_json).map((item) => item.tag)
  });

  return okJson({ ok: true, slug });
}
