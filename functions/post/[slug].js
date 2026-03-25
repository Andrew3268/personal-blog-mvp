import { escapeHtml, jsonld, okHtml, edgeCache } from "../_utils.js";
import { renderMarkdown, getTemplateBadge } from "../../lib/posts/renderer.js";

export async function onRequestGet({ params, env, request }) {
  const slug = decodeURIComponent(String(params.slug || ""));
  if (!slug) return okHtml("Not Found", { status: 404 });

  const meta = await env.BLOG_DB.prepare(`
    SELECT updated_at FROM posts WHERE slug = ? AND status = 'published'
  `).bind(slug).first();

  if (!meta) {
    return okHtml(renderNotFound(slug), { status: 404, headers: { "cache-control": "no-store" } });
  }

  const updatedAt = String(meta.updated_at || "");
  const url = new URL(request.url);
  const cacheKeyUrl = `${url.origin}/post/${encodeURIComponent(slug)}?v=${encodeURIComponent(updatedAt)}`;

  return edgeCache({
    request,
    cacheKeyUrl,
    ttlSeconds: 600,
    buildResponse: async () => {
      const row = await env.BLOG_DB.prepare(`
        SELECT slug, title, category, summary, cover_image, template_name, tags_json, content_md, status, published_at, updated_at
        FROM posts
        WHERE slug = ? AND status = 'published'
      `).bind(slug).first();

      if (!row) {
        return okHtml(renderNotFound(slug), { status: 404, headers: { "cache-control": "no-store" } });
      }

      let tags = [];
      try { tags = JSON.parse(row.tags_json || '[]'); } catch { tags = []; }

      const canonical = new URL(request.url);
      canonical.pathname = `/post/${encodeURIComponent(slug)}`;
      canonical.search = "";
      canonical.hash = "";

      const bodyHtml = renderMarkdown(row.content_md || "");
      const title = `${row.title} | Wacky Blog`;
      const desc = row.summary || `${row.title}에 대한 글입니다.`;
      const ogImage = row.cover_image || `${new URL(request.url).origin}/assets/images/og-default.svg`;
      const templateBadge = getTemplateBadge(row.template_name);
      const publishedDate = formatDate(row.published_at);
      const updatedDate = formatDate(row.updated_at);

      const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(desc)}" />
  <link rel="canonical" href="${escapeHtml(canonical.toString())}" />
  <meta name="robots" content="index,follow" />
  <meta name="theme-color" content="#5B7CFF" />

  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="Wacky Blog" />
  <meta property="og:locale" content="ko_KR" />
  <meta property="og:url" content="${escapeHtml(canonical.toString())}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(desc)}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(desc)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />

  <link rel="stylesheet" href="/assets/css/app.css" />
  <link rel="stylesheet" href="/assets/css/components.css" />

  ${jsonld({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: row.title,
    description: desc,
    mainEntityOfPage: canonical.toString(),
    datePublished: row.published_at,
    dateModified: row.updated_at,
    image: [ogImage],
    author: { '@type': 'Person', name: 'Steve Lee' },
    publisher: { '@type': 'Organization', name: 'Wacky Blog' }
  })}
</head>
<body>
  ${topbar()}
  <main class="container">
    <article class="post-shell post-shell--${escapeHtml(row.template_name || 'basic')}">
      <header class="card post-hero">
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
          <div class="row" style="gap:8px;flex-wrap:wrap">
            ${row.category ? `<span class="badge">${escapeHtml(row.category)}</span>` : ''}
            <span class="badge">${escapeHtml(templateBadge)}</span>
            <span class="badge">SSR + Cache</span>
          </div>
          <div class="small">발행 ${escapeHtml(publishedDate)} · 수정 ${escapeHtml(updatedDate)}</div>
        </div>
        <h1 class="h1 post-title">${escapeHtml(row.title)}</h1>
        ${row.summary ? `<p class="p post-summary">${escapeHtml(row.summary)}</p>` : ''}
        ${tags.length ? `<div class="row" style="gap:8px;flex-wrap:wrap">${tags.map(tag => `<span class="tag-chip">#${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
        ${row.cover_image ? `<img class="post-cover" src="${escapeHtml(row.cover_image)}" alt="${escapeHtml(row.title)} 대표 이미지" loading="eager" />` : ''}
      </header>

      <div class="post-grid">
        <article class="card post-body">
          ${bodyHtml}
        </article>

        <aside class="card post-side">
          <h2 class="h2">운영 메모</h2>
          <div class="sep"></div>
          <p class="small">이 글은 D1에서 데이터를 읽어 SSR HTML로 렌더링됩니다.</p>
          <p class="small">응답 헤더에서 <b>x-blog-cache</b> 값을 보면 HIT / MISS를 확인할 수 있습니다.</p>
          <div class="sep"></div>
          <div class="row" style="flex-wrap:wrap">
            <a class="btn btn--brand" href="/edit.html?slug=${encodeURIComponent(slug)}">이 글 수정</a>
            <a class="btn" href="/posts/">글 목록</a>
          </div>
        </aside>
      </div>
    </article>

    ${footer()}
  </main>
  <script src="/assets/js/nav.js" defer></script>
</body>
</html>`;

      const res = okHtml(html, { headers: { "cache-control": "public, max-age=600" } });
      res.headers.set("x-blog-cache-version", updatedAt);
      return res;
    }
  });
}

function formatDate(v) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().slice(0, 10);
}

function renderNotFound(slug) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>글을 찾을 수 없습니다</title><link rel="stylesheet" href="/assets/css/app.css"><link rel="stylesheet" href="/assets/css/components.css"></head><body><main class="container"><section class="card"><h1 class="h1">글을 찾을 수 없습니다</h1><p class="p">요청한 slug: ${escapeHtml(slug)}</p><div class="row" style="margin-top:14px"><a class="btn btn--brand" href="/posts/">글 목록</a><a class="btn" href="/">홈</a></div></section></main></body></html>`;
}

function topbar() {
  return `<header class="topbar"><div class="topbar__inner"><a class="brand" href="/"><span class="brand__mark">W</span><span>Wacky Blog</span></a><nav class="nav" aria-label="주요 메뉴"><a href="/" data-path="/">홈</a><a href="/posts/" data-path="/posts">글 목록</a><a href="/about/" data-path="/about">소개</a><a href="/add.html" data-path="/add.html">글 작성</a></nav></div></header>`;
}

function footer() {
  return `<footer class="footer container"><div class="footer__inner"><div>© 2026 Wacky Blog</div><div>Git + Cloudflare Pages + SSR + Cache 구조의 개인 블로그 MVP</div></div></footer>`;
}
