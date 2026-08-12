import { okJson, requireAdmin } from "../_utils.js";
import { scheduleContentCacheInvalidation } from "../_cache-invalidation.js";

function normalizeName(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function listSubcategories(db, categoryName = "") {
  const filter = normalizeName(categoryName);
  const sql = `
    SELECT
      s.category_name,
      s.name,
      s.sort_order,
      s.created_at,
      s.updated_at,
      COUNT(ps.post_slug) AS count
    FROM subcategories s
    LEFT JOIN post_subcategories ps
      ON ps.category_name = s.category_name
     AND ps.subcategory_name = s.name
    ${filter ? "WHERE s.category_name = ?" : ""}
    GROUP BY s.category_name, s.name, s.sort_order, s.created_at, s.updated_at
    ORDER BY s.category_name COLLATE NOCASE ASC, s.sort_order ASC, s.name COLLATE NOCASE ASC
  `;
  const result = filter
    ? await db.prepare(sql).bind(filter).all()
    : await db.prepare(sql).all();
  return result.results || [];
}

async function getAffectedSlugs(db, categoryName, subcategoryName) {
  const rows = await db.prepare(`
    SELECT post_slug AS slug
    FROM post_subcategories
    WHERE category_name = ? AND subcategory_name = ?
  `).bind(categoryName, subcategoryName).all();
  return (rows.results || []).map((row) => String(row.slug || "")).filter(Boolean);
}

export async function onRequestGet({ env, request }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return okJson({ message: "관리자 로그인이 필요합니다." }, { status: 401 });
  const url = new URL(request.url);
  const categoryName = normalizeName(url.searchParams.get("category"));
  return okJson({ items: await listSubcategories(env.BLOG_DB, categoryName) }, {
    headers: { "cache-control": "private, no-store" }
  });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const admin = await requireAdmin(env, request);
  if (!admin) return okJson({ message: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const categoryName = normalizeName(body?.category_name);
  const name = normalizeName(body?.name);
  if (!categoryName || !name) {
    return okJson({ message: "메인 카테고리와 서브 카테고리 이름을 입력하세요." }, { status: 400 });
  }

  const category = await env.BLOG_DB.prepare(`SELECT name FROM categories WHERE name = ?`).bind(categoryName).first();
  if (!category) return okJson({ message: "메인 카테고리를 찾지 못했습니다." }, { status: 404 });

  const exists = await env.BLOG_DB.prepare(`
    SELECT name FROM subcategories WHERE category_name = ? AND name = ?
  `).bind(categoryName, name).first();
  if (exists) return okJson({ message: "같은 이름의 서브 카테고리가 이미 있습니다." }, { status: 409 });

  const maxRow = await env.BLOG_DB.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM subcategories WHERE category_name = ?
  `).bind(categoryName).first();
  const now = new Date().toISOString();
  await env.BLOG_DB.prepare(`
    INSERT INTO subcategories (category_name, name, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(categoryName, name, Number(maxRow?.max_sort || 0) + 1, now, now).run();

  return okJson({ ok: true, item: { category_name: categoryName, name }, items: await listSubcategories(env.BLOG_DB) });
}

export async function onRequestPut(context) {
  const { env, request } = context;
  const admin = await requireAdmin(env, request);
  if (!admin) return okJson({ message: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const categoryName = normalizeName(body?.category_name);
  const currentName = normalizeName(body?.current_name);
  const newName = normalizeName(body?.new_name);
  if (!categoryName || !currentName || !newName) {
    return okJson({ message: "메인 카테고리와 현재/새 서브 카테고리 이름이 모두 필요합니다." }, { status: 400 });
  }

  const current = await env.BLOG_DB.prepare(`
    SELECT name FROM subcategories WHERE category_name = ? AND name = ?
  `).bind(categoryName, currentName).first();
  if (!current) return okJson({ message: "수정할 서브 카테고리를 찾지 못했습니다." }, { status: 404 });

  if (currentName !== newName) {
    const duplicate = await env.BLOG_DB.prepare(`
      SELECT name FROM subcategories WHERE category_name = ? AND name = ?
    `).bind(categoryName, newName).first();
    if (duplicate) return okJson({ message: "같은 이름의 서브 카테고리가 이미 있습니다." }, { status: 409 });
  }

  const affectedSlugs = currentName !== newName
    ? await getAffectedSlugs(env.BLOG_DB, categoryName, currentName)
    : [];
  const now = new Date().toISOString();
  const statements = [
    env.BLOG_DB.prepare(`
      UPDATE subcategories
      SET name = ?, updated_at = ?
      WHERE category_name = ? AND name = ?
    `).bind(newName, now, categoryName, currentName)
  ];

  if (currentName !== newName) {
    statements.push(
      env.BLOG_DB.prepare(`
        UPDATE post_subcategories
        SET subcategory_name = ?, updated_at = ?
        WHERE category_name = ? AND subcategory_name = ?
      `).bind(newName, now, categoryName, currentName)
    );
    if (affectedSlugs.length) {
      const placeholders = affectedSlugs.map(() => "?").join(",");
      statements.push(env.BLOG_DB.prepare(`
        UPDATE posts SET metadata_updated_at = ? WHERE slug IN (${placeholders})
      `).bind(now, ...affectedSlugs));
    }
  }

  await env.BLOG_DB.batch(statements);
  if (affectedSlugs.length) {
    scheduleContentCacheInvalidation({
      waitUntil: (promise) => context.waitUntil(promise),
      slugs: affectedSlugs,
      categories: [categoryName]
    });
  }
  return okJson({ ok: true, item: { category_name: categoryName, name: newName }, items: await listSubcategories(env.BLOG_DB) });
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  const admin = await requireAdmin(env, request);
  if (!admin) return okJson({ message: "관리자 로그인이 필요합니다." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const categoryName = normalizeName(body?.category_name);
  const name = normalizeName(body?.name);
  if (!categoryName || !name) {
    return okJson({ message: "삭제할 메인/서브 카테고리 이름이 필요합니다." }, { status: 400 });
  }

  const current = await env.BLOG_DB.prepare(`
    SELECT name FROM subcategories WHERE category_name = ? AND name = ?
  `).bind(categoryName, name).first();
  if (!current) return okJson({ message: "삭제할 서브 카테고리를 찾지 못했습니다." }, { status: 404 });

  const affectedSlugs = await getAffectedSlugs(env.BLOG_DB, categoryName, name);
  const now = new Date().toISOString();
  const statements = [
    env.BLOG_DB.prepare(`DELETE FROM post_subcategories WHERE category_name = ? AND subcategory_name = ?`).bind(categoryName, name),
    env.BLOG_DB.prepare(`DELETE FROM subcategories WHERE category_name = ? AND name = ?`).bind(categoryName, name)
  ];
  if (affectedSlugs.length) {
    const placeholders = affectedSlugs.map(() => "?").join(",");
    statements.push(env.BLOG_DB.prepare(`
      UPDATE posts SET metadata_updated_at = ? WHERE slug IN (${placeholders})
    `).bind(now, ...affectedSlugs));
  }
  await env.BLOG_DB.batch(statements);

  if (affectedSlugs.length) {
    scheduleContentCacheInvalidation({
      waitUntil: (promise) => context.waitUntil(promise),
      slugs: affectedSlugs,
      categories: [categoryName]
    });
  }
  return okJson({ ok: true, items: await listSubcategories(env.BLOG_DB) });
}
