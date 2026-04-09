import { okJson, requireAdmin } from "../../_utils.js";

export async function onRequestGet({ env, params, request }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return okJson({ message: "관리자 로그인이 필요합니다." }, { status: 401 });
  const slug = decodeURIComponent(String(params.slug || ""));
  if (!slug) {
    return okJson({ message: "slug가 필요합니다." }, { status: 400 });
  }

  const row = await env.BLOG_DB.prepare(`
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
      content_md,
      faq_md,
      status,
      published_at,
      updated_at
    FROM posts
    WHERE slug = ?
  `).bind(slug).first();

  if (!row) {
    return okJson({ message: "not_found" }, { status: 404 });
  }

  return okJson({ item: row });
}

export async function onRequestPut({ env, params, request }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return okJson({ message: "관리자 로그인이 필요합니다." }, { status: 401 });
  const slug = decodeURIComponent(String(params.slug || ""));
  if (!slug) {
    return okJson({ message: "slug가 필요합니다." }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return okJson({ message: "JSON이 필요합니다." }, { status: 400 });
  }

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

  if (!title || !contentMd) {
    return okJson(
      { message: "title, content_md는 필수입니다." },
      { status: 400 }
    );
  }

  const current = await env.BLOG_DB
    .prepare(`SELECT published_at FROM posts WHERE slug = ?`)
    .bind(slug)
    .first();

  if (!current) {
    return okJson({ message: "not_found" }, { status: 404 });
  }

  const now = new Date().toISOString();
  const publishedAt = String(current.published_at || now);

  await env.BLOG_DB.prepare(`
    UPDATE posts
    SET
      title = ?,
      category = ?,
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
      updated_at = ?
    WHERE slug = ?
  `).bind(
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
    publishedAt,
    now,
    slug
  ).run();

  return okJson({ ok: true, slug });
}

export async function onRequestDelete({ env, params, request }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return okJson({ message: "관리자 로그인이 필요합니다." }, { status: 401 });
  const slug = decodeURIComponent(String(params.slug || ""));
  if (!slug) {
    return okJson({ message: "slug가 필요합니다." }, { status: 400 });
  }

  const existing = await env.BLOG_DB.prepare(`SELECT slug FROM posts WHERE slug = ?`).bind(slug).first();
  if (!existing) {
    return okJson({ message: "not_found" }, { status: 404 });
  }

  await env.BLOG_DB.prepare(`DELETE FROM posts WHERE slug = ?`).bind(slug).run();
  return okJson({ ok: true, slug });
}
