export function normalizeTags(values = []) {
  const seen = new Set();
  const out = [];

  for (const value of Array.isArray(values) ? values : []) {
    const tag = String(value || "")
      .replace(/^#+/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (!tag) continue;

    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ tag, key });
    if (out.length >= 30) break;
  }

  return out;
}

export function buildPostTagReplaceStatements(db, slug, normalizedTags, now) {
  const safeSlug = String(slug || "").trim();
  const statements = [
    db.prepare(`DELETE FROM post_tags WHERE post_slug = ?`).bind(safeSlug)
  ];

  for (const item of normalizedTags) {
    statements.push(db.prepare(`
      INSERT INTO post_tags (post_slug, tag, normalized_tag, created_at)
      VALUES (?, ?, ?, ?)
    `).bind(safeSlug, item.tag, item.key, now));
  }

  return statements;
}

export function parseStoredTags(value = "") {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return normalizeTags(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}
