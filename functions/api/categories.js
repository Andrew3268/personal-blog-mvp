import { okJson, requireAdmin } from "../_utils.js";

const DEFAULT_CATEGORIES = [
  "생활 꿀팁",
  "살림 노하우",
  "청소",
  "주방",
  "욕실",
  "세탁",
  "정리수납",
  "리뷰",
  "쇼핑",
  "반려동물",
  "건강",
  "디지털"
];

function normalizeCategoryName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function ensureCategoriesTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS categories (
      name TEXT PRIMARY KEY,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  const countRow = await db.prepare(`SELECT COUNT(*) AS count FROM categories`).first();
  const count = Number(countRow?.count || 0);
  if (count > 0) return;

  const now = new Date().toISOString();
  for (const [index, name] of DEFAULT_CATEGORIES.entries()) {
    await db.prepare(`
      INSERT OR IGNORE INTO categories (name, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).bind(name, index + 1, now, now).run();
  }
}

async function getCategories(db) {
  const rows = await db.prepare(`
    SELECT name, sort_order, created_at, updated_at
    FROM categories
    ORDER BY sort_order ASC, name COLLATE NOCASE ASC
  `).all();
  return rows.results || [];
}

export async function onRequestGet({ env }) {
  return okJson(
    { items: await getCategories(env.BLOG_DB) },
    { headers: { "cache-control": "public, max-age=60, s-maxage=3600" } }
  );
}

export async function onRequestPost({ env, request }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return okJson({ message: "관리자 로그인이 필요합니다." }, { status: 401 });
  await ensureCategoriesTable(env.BLOG_DB);
  const body = await request.json().catch(() => null);
  const name = normalizeCategoryName(body?.name);
  if (!name) return okJson({ message: "카테고리 이름을 입력하세요." }, { status: 400 });

  const exists = await env.BLOG_DB.prepare(`SELECT name FROM categories WHERE name = ?`).bind(name).first();
  if (exists) return okJson({ message: "같은 이름의 카테고리가 이미 있습니다." }, { status: 409 });

  const maxRow = await env.BLOG_DB.prepare(`SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM categories`).first();
  const now = new Date().toISOString();
  await env.BLOG_DB.prepare(`
    INSERT INTO categories (name, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).bind(name, Number(maxRow?.max_sort || 0) + 1, now, now).run();

  return okJson({ ok: true, item: { name }, items: await getCategories(env.BLOG_DB) });
}

export async function onRequestPut({ env, request }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return okJson({ message: "관리자 로그인이 필요합니다." }, { status: 401 });
  await ensureCategoriesTable(env.BLOG_DB);
  const body = await request.json().catch(() => null);
  const currentName = normalizeCategoryName(body?.current_name);
  const newName = normalizeCategoryName(body?.new_name);

  if (!currentName || !newName) {
    return okJson({ message: "현재 이름과 새 이름이 모두 필요합니다." }, { status: 400 });
  }

  const current = await env.BLOG_DB.prepare(`SELECT name FROM categories WHERE name = ?`).bind(currentName).first();
  if (!current) return okJson({ message: "수정할 카테고리를 찾지 못했습니다." }, { status: 404 });

  if (currentName !== newName) {
    const duplicate = await env.BLOG_DB.prepare(`SELECT name FROM categories WHERE name = ?`).bind(newName).first();
    if (duplicate) return okJson({ message: "같은 이름의 카테고리가 이미 있습니다." }, { status: 409 });
  }

  const now = new Date().toISOString();
  await env.BLOG_DB.prepare(`
    UPDATE categories
    SET name = ?, updated_at = ?
    WHERE name = ?
  `).bind(newName, now, currentName).run();

  if (currentName !== newName) {
    await env.BLOG_DB.prepare(`
      UPDATE posts
      SET category = ?, updated_at = ?
      WHERE TRIM(COALESCE(category, '')) = ?
    `).bind(newName, now, currentName).run();
  }

  return okJson({ ok: true, item: { name: newName }, items: await getCategories(env.BLOG_DB) });
}

export async function onRequestDelete({ env, request }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return okJson({ message: "관리자 로그인이 필요합니다." }, { status: 401 });
  await ensureCategoriesTable(env.BLOG_DB);
  const body = await request.json().catch(() => null);
  const name = normalizeCategoryName(body?.name);
  if (!name) return okJson({ message: "삭제할 카테고리 이름이 필요합니다." }, { status: 400 });

  const current = await env.BLOG_DB.prepare(`SELECT name FROM categories WHERE name = ?`).bind(name).first();
  if (!current) return okJson({ message: "삭제할 카테고리를 찾지 못했습니다." }, { status: 404 });

  const now = new Date().toISOString();
  await env.BLOG_DB.prepare(`DELETE FROM categories WHERE name = ?`).bind(name).run();
  await env.BLOG_DB.prepare(`
    UPDATE posts
    SET category = '', updated_at = ?
    WHERE TRIM(COALESCE(category, '')) = ?
  `).bind(now, name).run();

  return okJson({ ok: true, items: await getCategories(env.BLOG_DB) });
}
