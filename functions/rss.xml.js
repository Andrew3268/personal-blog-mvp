
const SITE_ORIGIN = "https://wacky-wiki.com";
const SITE_TITLE = "Wacky Wiki";
const SITE_DESCRIPTION = "실용적인 생활 정보와 정리된 가이드를 제공하는 블로그";
const RSS_PATH = "/rss.xml";

export async function onRequestGet({ env }) {
  const origin = SITE_ORIGIN;
  const feedUrl = `${origin}${RSS_PATH}`;

  const rows = await env.BLOG_DB.prepare(`
    SELECT
      slug,
      title,
      category,
      meta_description,
      summary,
      cover_image,
      tags_json,
      first_published_at AS published_at,
      updated_at
    FROM posts
    WHERE status = 'published'
    ORDER BY first_published_at DESC, updated_at DESC
    LIMIT 50
  `).all();

  const items = rows.results || [];
  const lastBuildDate = toRssDate(
    items[0]?.updated_at || items[0]?.published_at || new Date().toISOString()
  );

  const rssItems = items.map((item) => {
    const postUrl = `${origin}/post/${encodeURIComponent(String(item.slug || ""))}`;
    const title = String(item.title || "제목 없음").trim();
    const description = buildDescription(item);
    const pubDate = toRssDate(item.published_at || item.updated_at);
    const categories = buildCategories(item);

    return `
    <item>
      <title>${escapeXml(title)}</title>
      <link>${escapeXml(postUrl)}</link>
      <guid isPermaLink="true">${escapeXml(postUrl)}</guid>
      ${description ? `<description>${escapeXml(description)}</description>` : ""}
      ${pubDate ? `<pubDate>${escapeXml(pubDate)}</pubDate>` : ""}
      ${categories}
    </item>`;
  }).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(SITE_TITLE)}</title>
    <link>${escapeXml(origin + "/")}</link>
    <description>${escapeXml(SITE_DESCRIPTION)}</description>
    <language>ko-KR</language>
    <lastBuildDate>${escapeXml(lastBuildDate)}</lastBuildDate>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
    <ttl>60</ttl>${rssItems}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "content-type": "application/rss+xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=900"
    }
  });
}

function buildDescription(item) {
  return String(item.summary || item.meta_description || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

function buildCategories(item) {
  const values = [];
  const category = String(item.category || "").trim();
  if (category) values.push(category);

  try {
    const tags = JSON.parse(item.tags_json || "[]");
    if (Array.isArray(tags)) {
      tags.forEach((tag) => {
        const safeTag = String(tag || "").trim();
        if (safeTag) values.push(safeTag);
      });
    }
  } catch (_) {
    // 태그 JSON이 깨진 글이 있어도 RSS 전체가 실패하지 않도록 무시합니다.
  }

  return [...new Set(values)]
    .map((value) => `<category>${escapeXml(value)}</category>`)
    .join("\n      ");
}

function toAbsoluteUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, SITE_ORIGIN).toString();
  } catch (_) {
    return "";
  }
}

function toRssDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "";
  return date.toUTCString();
}

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
