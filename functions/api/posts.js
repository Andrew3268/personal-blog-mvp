import { okJson } from "../_utils.js";

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const status = String(url.searchParams.get("status") || "published").trim().toLowerCase();
  const category = String(url.searchParams.get("category") || "").trim();
  const tag = String(url.searchParams.get("tag") || "").trim();

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

  const sql = `
    SELECT
      slug,
      title,
      category,
      meta_description,
      summary,
      cover_image,
      cover_image_alt,
      tags_json,
      status,
      published_at,
      updated_at
    FROM posts
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY updated_at DESC, published_at DESC
    LIMIT 200
  `;

  const rows = await env.BLOG_DB.prepare(sql).bind(...binds).all();

  return okJson({
    items: rows.results || [],
    filters: {
      status: safeStatus,
      category,
      tag
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
      cover_image_alt,
      tags_json,
      content_md,
      status,
      published_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      category = excluded.category,
      meta_description = excluded.meta_description,
      summary = excluded.summary,
      cover_image = excluded.cover_image,
      cover_image_alt = excluded.cover_image_alt,
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
    coverImageAlt,
    JSON.stringify(tags),
    contentMd,
    status,
    now,
    now
  ).run();

  return okJson({ ok: true, slug });
}
