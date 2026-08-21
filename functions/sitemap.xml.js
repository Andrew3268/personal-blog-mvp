import { canonicalCategoryName, categoryPath } from "./_category-utils.js";


const SITE_ORIGIN = "https://wacky-wiki.com";

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatLastmod(value = "") {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}


function renderUrl(loc, lastmod = "") {
  const safeLastmod = lastmod ? `<lastmod>${escapeXml(formatLastmod(lastmod))}</lastmod>` : "";
  return `<url><loc>${escapeXml(loc)}</loc>${safeLastmod}</url>`;
}

export async function onRequestGet({ env }) {
  const origin = SITE_ORIGIN;
  const [postRows, categoryRows] = await env.BLOG_DB.batch([
    env.BLOG_DB.prepare(`
      SELECT slug, updated_at
      FROM posts
      WHERE status = 'published'
      ORDER BY updated_at DESC
    `),
    env.BLOG_DB.prepare(`
      SELECT category AS name, MAX(updated_at) AS updated_at
      FROM posts
      WHERE status = 'published'
        AND category <> ''
      GROUP BY category
      ORDER BY category COLLATE NOCASE ASC
    `)
  ]);

  const staticUrls = [
    renderUrl(`${origin}/`),
    renderUrl(`${origin}/about/`),
    renderUrl(`${origin}/author/life-archiver/`),
    renderUrl(`${origin}/author/tech-archiver/`),
    renderUrl(`${origin}/author/pet-archiver/`),
    renderUrl(`${origin}/privacy-policy/`)
  ];

  const categoryMap = new Map();
  for (const item of categoryRows.results || []) {
    const name = canonicalCategoryName(item.name);
    if (!name) continue;
    const current = categoryMap.get(name);
    if (!current || String(item.updated_at || "") > String(current.updated_at || "")) {
      categoryMap.set(name, { name, updated_at: item.updated_at || "" });
    }
  }
  const categoryUrls = [...categoryMap.values()]
    .map((item) => renderUrl(`${origin}${categoryPath(item.name)}`, item.updated_at));

  const postUrls = (postRows.results || [])
    .map((item) => renderUrl(`${origin}/post/${encodeURIComponent(String(item.slug || ""))}`, item.updated_at));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${[...staticUrls, ...categoryUrls, ...postUrls].join("\n  ")}
</urlset>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=3600"
    }
  });
}
