import { renderHomePageCached, archiveNotFoundResponse } from "../_home-renderer.js";

function normalizeCategory(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

async function categoryExists(db, category) {
  try {
    const row = await db.prepare(`
      SELECT name
      FROM categories
      WHERE TRIM(name) = ?
      LIMIT 1
    `).bind(category).first();
    if (row) return true;
  } catch (_) {
    // 초기 배포에서 categories 테이블이 아직 없을 수 있습니다.
  }

  const postRow = await db.prepare(`
    SELECT slug
    FROM posts
    WHERE TRIM(COALESCE(category, '')) = ?
    LIMIT 1
  `).bind(category).first();
  return !!postRow;
}

export async function onRequestGet({ params, env, request }) {
  let decoded = "";
  try {
    decoded = decodeURIComponent(String(params.category || ""));
  } catch {
    return archiveNotFoundResponse({
      title: "카테고리를 찾을 수 없습니다",
      description: "카테고리 주소 형식이 올바르지 않습니다."
    });
  }

  const category = normalizeCategory(decoded);
  if (!category) return Response.redirect(new URL("/", request.url).toString(), 301);

  if (!await categoryExists(env.BLOG_DB, category)) {
    return archiveNotFoundResponse({
      title: "카테고리를 찾을 수 없습니다",
      description: `‘${category}’ 카테고리는 존재하지 않거나 삭제되었습니다.`
    });
  }

  return renderHomePageCached({ env, request, category });
}
