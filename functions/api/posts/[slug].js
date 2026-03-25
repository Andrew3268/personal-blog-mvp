import { okJson } from "../_utils.js";

export async function onRequestGet({ env }) {
  const rows = await env.BLOG_DB
    .prepare(`
      SELECT
        slug,
        title,
        category,
        meta_description,
        summary,
        cover_image,
        tags_json,
        status,
        published_at,
        updated_at
      FROM posts
      WHERE status = 'published'
      ORDER BY published_at DESC
      LIMIT 200
    `)
    .all();

  return okJson({ items: rows.results || [] });
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
  const contentMd = String(body.content_md || "").trim();
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
      tags_json,
      content_md,
      status,
      published_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      category = excluded.category,
      meta_description = excluded.meta_description,
      summary = excluded.summary,
      cover_image = excluded.cover_image,
      tags_json = excluded.tags_json,
      content_md = excluded.content_md,
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
    JSON.stringify(tags),
    contentMd,
    status,
    now,
    now
  ).run();

  return okJson({ ok: true, slug });
}