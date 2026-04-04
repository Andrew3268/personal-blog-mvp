import { escapeHtml, jsonld, okHtml, edgeCache } from "../_utils.js";
import { renderMarkdown } from "../../lib/posts/renderer.js";

export async function onRequestGet({ params, env, request }) {
  const slug = decodeURIComponent(String(params.slug || ""));
  if (!slug) return okHtml("Not Found", { status: 404 });

  const meta = await env.BLOG_DB.prepare(`
    SELECT updated_at
    FROM posts
    WHERE slug = ? AND status = 'published'
  `).bind(slug).first();

  if (!meta) {
    return okHtml(renderNotFound(slug), {
      status: 404,
      headers: { "cache-control": "no-store" }
    });
  }

  await env.BLOG_DB.prepare(`
    UPDATE posts
    SET view_count = COALESCE(view_count, 0) + 1
    WHERE slug = ? AND status = 'published'
  `).bind(slug).run();

  const updatedAt = String(meta.updated_at || "");
  const url = new URL(request.url);
  const cacheKeyUrl = `${url.origin}/post/${encodeURIComponent(slug)}?v=${encodeURIComponent(updatedAt)}`;

  return edgeCache({
    request,
    cacheKeyUrl,
    ttlSeconds: 600,
    buildResponse: async () => {
      const row = await env.BLOG_DB.prepare(`
        SELECT
          slug,
          title,
          category,
          meta_description,
          summary,
          cover_image,
          cover_image_alt,
          tags_json,
          content_md,
          faq_md,
          view_count,
          status,
          published_at,
          updated_at
        FROM posts
        WHERE slug = ? AND status = 'published'
      `).bind(slug).first();

      if (!row) {
        return okHtml(renderNotFound(slug), {
          status: 404,
          headers: { "cache-control": "no-store" }
        });
      }

      let tags = [];
      try {
        tags = JSON.parse(row.tags_json || "[]");
        if (!Array.isArray(tags)) tags = [];
      } catch {
        tags = [];
      }

      const origin = url.origin;

      const canonical = new URL(request.url);
      canonical.pathname = `/post/${encodeURIComponent(slug)}`;
      canonical.search = "";
      canonical.hash = "";

      const siteName = "Wacky Blog";
      const siteDescription = "실용적인 생활 정보와 정리된 가이드를 제공하는 블로그";
      const authorName = "Steve Lee";
      const bodyHtml = renderMarkdown(row.content_md || "");
      const faqItems = parseFaqMarkdown(row.faq_md || "");
      const relatedRows = row.category
        ? (await env.BLOG_DB.prepare(`
            SELECT slug, title
            FROM posts
            WHERE status = 'published'
              AND TRIM(COALESCE(category, '')) = ?
              AND slug != ?
            ORDER BY published_at DESC, updated_at DESC
            LIMIT 5
          `).bind(String(row.category).trim(), slug).all()).results || []
        : [];
      const popularRows = (await env.BLOG_DB.prepare(`
        SELECT slug, title, view_count
        FROM posts
        WHERE status = 'published'
          AND slug != ?
        ORDER BY COALESCE(view_count, 0) DESC, published_at DESC, updated_at DESC
        LIMIT 5
      `).bind(slug).all()).results || [];
      const faqSectionHtml = renderFaqSection(faqItems);
      const relatedPostsHtml = renderRelatedPostsSection(relatedRows, row.category);
      const tagHighlightsHtml = renderTagHighlights(tags);
      const popularPostsHtml = renderPopularPosts(popularRows);

      const titleText = String(row.title || "").trim();
      const descriptionText = buildDescription(
        row.meta_description,
        row.summary,
        row.content_md,
        titleText
      );
      const pageTitle = `${titleText} | ${siteName}`;
      const ogImage = row.cover_image || `${origin}/assets/images/og-default.svg`;
      const coverImageAltText = String(row.cover_image_alt || `${titleText} 대표 이미지`).trim();

      const publishedDate = formatDate(row.published_at);
      const updatedDate = formatDate(row.updated_at);
      const publishedIso = toIso(row.published_at);
      const updatedIso = toIso(row.updated_at);

      const breadcrumbItems = [
        { name: "홈", url: `${origin}/` },
        { name: "글 목록", url: `${origin}/posts/` }
      ];

      if (row.category) {
        breadcrumbItems.push({
          name: String(row.category),
          url: `${origin}/posts/?category=${encodeURIComponent(String(row.category))}`
        });
      }

      breadcrumbItems.push({
        name: titleText,
        url: canonical.toString()
      });

      const breadcrumbHtml = renderBreadcrumbs(breadcrumbItems);

      const breadcrumbJsonLd = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbItems.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.name,
          item: item.url
        }))
      };

      const blogPostingJsonLd = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        mainEntityOfPage: {
          "@type": "WebPage",
          "@id": canonical.toString()
        },
        headline: titleText,
        description: descriptionText,
        image: [ogImage],
        author: {
          "@type": "Person",
          name: authorName
        },
        publisher: {
          "@type": "Organization",
          name: siteName,
          logo: {
            "@type": "ImageObject",
            url: `${origin}/assets/images/logo.png`
          }
        },
        datePublished: publishedIso || row.published_at || "",
        dateModified: updatedIso || row.updated_at || "",
        url: canonical.toString(),
        inLanguage: "ko-KR",
        articleSection: row.category || "블로그",
        keywords: tags.join(", ")
      };

      const webPageJsonLd = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: pageTitle,
        url: canonical.toString(),
        description: descriptionText,
        inLanguage: "ko-KR",
        isPartOf: {
          "@type": "WebSite",
          name: siteName,
          url: `${origin}/`
        }
      };

      const faqJsonLd = faqItems.length
        ? {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            inLanguage: "ko-KR",
            mainEntity: faqItems.map((item) => ({
              "@type": "Question",
              name: item.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: stripMarkdown(item.answerMd || "")
              }
            }))
          }
        : null;

      const coverImagePreload = row.cover_image
        ? `<link rel="preload" as="image" href="${escapeHtml(row.cover_image)}" fetchpriority="high" />`
        : "";

      const categoryLink = row.category
        ? `/posts/?category=${encodeURIComponent(String(row.category))}`
        : "/posts/";


      const coverImageHtml = row.cover_image
        ? `
        <figure class="post-cover-wrap">
          <img
            class="post-cover"
            src="${escapeHtml(row.cover_image)}"
            alt="${escapeHtml(coverImageAltText)}"
            loading="eager"
            fetchpriority="high"
            decoding="async"
            width="1200"
            height="630"
          />
        </figure>
        `
        : "";

      const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(descriptionText)}" />
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
  <meta name="theme-color" content="#5B7CFF" />
  <meta name="author" content="${escapeHtml(authorName)}" />
  <meta name="keywords" content="${escapeHtml(buildKeywords(row.category, tags))}" />
  <link rel="canonical" href="${escapeHtml(canonical.toString())}" />
  ${coverImagePreload}

  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="${escapeHtml(siteName)}" />
  <meta property="og:locale" content="ko_KR" />
  <meta property="og:url" content="${escapeHtml(canonical.toString())}" />
  <meta property="og:title" content="${escapeHtml(pageTitle)}" />
  <meta property="og:description" content="${escapeHtml(descriptionText)}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:image:alt" content="${escapeHtml(coverImageAltText)}" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(pageTitle)}" />
  <meta name="twitter:description" content="${escapeHtml(descriptionText)}" />
  <meta name="twitter:image" content="${escapeHtml(ogImage)}" />

  <link rel="stylesheet" href="/assets/css/app.css" />
  <link rel="stylesheet" href="/assets/css/components.css" />

  ${jsonld(blogPostingJsonLd)}
  ${jsonld(breadcrumbJsonLd)}
  ${jsonld(webPageJsonLd)}
  ${faqJsonLd ? jsonld(faqJsonLd) : ""}
</head>
<body>
  <a href="#main-content" class="skip-link">본문 바로가기</a>

  ${topbar()}

  <main id="main-content" class="container">
    ${breadcrumbHtml}

    <article class="post-shell" itemscope itemtype="https://schema.org/BlogPosting">
      <header class="card post-hero">
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
          <div class="row" style="gap:8px;flex-wrap:wrap">
            ${row.category ? `<a class="badge" href="${categoryLink}">${escapeHtml(String(row.category))}</a>` : ""}
            <span class="badge">SSR + Cache</span>
          </div>
          <div class="small">
            <time datetime="${escapeHtml(publishedIso || "")}">발행 ${escapeHtml(publishedDate)}</time>
            <span aria-hidden="true"> · </span>
            <time datetime="${escapeHtml(updatedIso || "")}">수정 ${escapeHtml(updatedDate)}</time>
          </div>
        </div>

        <h1 class="h1 post-title" itemprop="headline">${escapeHtml(titleText)}</h1>

        ${row.summary ? `<p class="p post-summary" itemprop="description">${escapeHtml(String(row.summary))}</p>` : ""}

        ${coverImageHtml}

        <meta itemprop="author" content="${escapeHtml(authorName)}" />
        <meta itemprop="datePublished" content="${escapeHtml(publishedIso || "")}" />
        <meta itemprop="dateModified" content="${escapeHtml(updatedIso || "")}" />
        <meta itemprop="mainEntityOfPage" content="${escapeHtml(canonical.toString())}" />
        <meta itemprop="image" content="${escapeHtml(ogImage)}" />
      </header>

      <div class="post-grid">
        <section class="card post-body" aria-label="본문">
          ${bodyHtml}
          ${tagHighlightsHtml}
          ${faqSectionHtml}
          ${relatedPostsHtml}
        </section>

        <aside class="card post-side" aria-label="추가 콘텐츠">
          <section class="post-side__section post-side__ad" aria-label="광고 영역">
            <h2 class="h2">광고 영역</h2>
            <p class="small">이 자리는 추후 Google AdSense를 배치할 예정입니다.</p>
            <div class="post-side__ad-slot" aria-hidden="true">AdSense Placeholder</div>
          </section>

          ${popularPostsHtml}

          <section class="post-side__section post-side__extra" aria-label="추가 콘텐츠 영역">
            <h2 class="h2">추가 콘텐츠 영역</h2>
            <p class="small">나중에 다른 콘텐츠를 넣을 수 있도록 여유 공간을 확보했습니다.</p>
          </section>
        </aside>
      </div>
    </article>

    ${footer(siteName, siteDescription)}
  </main>

  <script src="/assets/js/nav.js" defer></script>
</body>
</html>`;

      const res = okHtml(html, {
        headers: {
          "cache-control": "public, max-age=600"
        }
      });

      res.headers.set("x-blog-cache-version", updatedAt);
      return res;
    }
  });
}


function renderTagHighlights(tags) {
  if (!Array.isArray(tags) || !tags.length) return "";
  const cleanTags = tags.map(tag => String(tag || "").trim()).filter(Boolean);
  if (!cleanTags.length) return "";
  return `
    <section class="post-tags-highlight" aria-labelledby="post-tags-highlight-title" style="margin-top:32px;padding-top:24px;border-top:1px solid var(--border)">
      <h2 id="post-tags-highlight-title" class="h2">핵심 키워드</h2>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:14px">
        ${cleanTags.map(tag => `<span class="tag-chip tag-chip--static">#${escapeHtml(tag)}</span>`).join("")}
      </div>
    </section>
  `;
}

function renderPopularPosts(items) {
  if (!Array.isArray(items) || !items.length) return "";
  return `
    <section class="post-side__section post-side__popular" aria-labelledby="post-popular-title">
      <div class="row" style="justify-content:space-between;align-items:flex-end;gap:10px">
        <h2 id="post-popular-title" class="h2">인기글</h2>
        <span class="small">조회순</span>
      </div>
      <ul class="post-side__popular-list">
        ${items.map((item, index) => `
          <li>
            <a class="post-side__popular-link" href="/post/${encodeURIComponent(String(item.slug || ""))}">
              <span class="post-side__popular-rank">${index + 1}</span>
              <span class="post-side__popular-text">${escapeHtml(String(item.title || "제목 없음"))}</span>
            </a>
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function parseFaqMarkdown(raw) {
  const lines = String(raw || "").replace(/\r/g, "").split("\n");
  const items = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    const questionMatch = trimmed.match(/^(?:#{1,6}\s*)?(?:Q|질문)\s*[.:：]?\s*(.+)$/i);

    if (questionMatch) {
      if (current && current.question && current.answerLines.some((entry) => entry.trim())) {
        items.push({
          question: current.question.trim(),
          answerMd: current.answerLines.join("\n").trim()
        });
      }
      current = { question: questionMatch[1].trim(), answerLines: [] };
      continue;
    }

    if (!current) continue;
    current.answerLines.push(line);
  }

  if (current && current.question && current.answerLines.some((entry) => entry.trim())) {
    items.push({
      question: current.question.trim(),
      answerMd: current.answerLines.join("\n").trim()
    });
  }

  return items.slice(0, 8);
}

function renderFaqSection(items) {
  if (!items.length) return "";
  return `
    <section class="post-faq" aria-labelledby="post-faq-title" style="margin-top:36px;padding-top:28px;border-top:1px solid var(--border)">
      <h2 id="post-faq-title" class="h2">자주 묻는 질문</h2>
      <div style="display:grid;gap:14px;margin-top:14px">
        ${items.map((item) => `
          <article class="card" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
            <h3 class="h3" itemprop="name" style="margin:0 0 10px">Q. ${escapeHtml(item.question)}</h3>
            <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
              <div itemprop="text">${renderMarkdown(item.answerMd || "")}</div>
            </div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}


function renderRelatedPostsSection(items, category) {
  if (!Array.isArray(items) || !items.length) return "";
  const categoryText = String(category || "").trim();
  const headingText = categoryText ? `${categoryText} 관련글 더보기` : "관련글 더보기";
  return `
    <section class="post-related" aria-labelledby="post-related-title" style="margin-top:36px;padding-top:28px;border-top:1px solid var(--border)">
      <div class="row" style="justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
        <div>
          <h2 id="post-related-title" class="h2" style="margin:0">${escapeHtml(headingText)}</h2>
          <p class="small" style="margin:8px 0 0">같은 카테고리의 최신 글 5개를 보여드립니다.</p>
        </div>
        ${categoryText ? `<a class="btn" href="/posts/?category=${encodeURIComponent(categoryText)}">카테고리 전체 보기</a>` : ""}
      </div>
      <ul class="list-reset" style="display:grid;gap:10px;margin-top:16px">
        ${items.map((item, index) => `
          <li>
            <a href="/post/${encodeURIComponent(String(item.slug || ""))}" class="post-related-link" style="display:inline-flex;gap:8px;align-items:flex-start;text-decoration:none;line-height:1.55">
              <span aria-hidden="true" style="color:var(--brand);font-weight:800;min-width:1.5em">${index + 1}.</span>
              <span>${escapeHtml(String(item.title || "(제목 없음)"))}</span>
            </a>
          </li>
        `).join("")}
      </ul>
    </section>
  `;
}

function buildDescription(metaDescription, summary, markdown, title) {
  const cleanMetaDescription = String(metaDescription || "").trim();
  if (cleanMetaDescription) return truncateText(cleanMetaDescription, 155);

  const cleanSummary = String(summary || "").trim();
  if (cleanSummary) return truncateText(cleanSummary, 155);

  const plain = stripMarkdown(markdown || "");
  if (plain) return truncateText(plain, 155);

  return truncateText(`${title}에 대한 글입니다.`, 155);
}

function buildKeywords(category, tags) {
  const parts = [];
  if (category) parts.push(String(category).trim());

  for (const tag of tags || []) {
    const t = String(tag).trim();
    if (t) parts.push(t);
  }

  return parts.filter(Boolean).join(", ");
}

function stripMarkdown(md) {
  return String(md || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>-]/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(text, maxLength = 155) {
  const value = String(text || "").trim();
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength - 1).trim() + "…";
}

function toIso(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString();
}

function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().slice(0, 10);
}

function renderBreadcrumbs(items) {
  const list = items
    .map((item, index) => {
      const isLast = index === items.length - 1;
      if (isLast) {
        return `<li aria-current="page"><span>${escapeHtml(item.name)}</span></li>`;
      }
      return `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.name)}</a></li>`;
    })
    .join("");

  return `
  <nav class="breadcrumb small" aria-label="브레드크럼" style="margin:16px 0 20px">
    <ol class="list-reset" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">
      ${list}
    </ol>
  </nav>`;
}

function renderNotFound(slug) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>글을 찾을 수 없습니다</title>
  <meta name="robots" content="noindex,nofollow" />
  <link rel="stylesheet" href="/assets/css/app.css" />
  <link rel="stylesheet" href="/assets/css/components.css" />
</head>
<body>
  <main class="container">
    <section class="card">
      <h1 class="h1">글을 찾을 수 없습니다</h1>
      <p class="p">요청한 slug: ${escapeHtml(slug)}</p>
      <div class="row" style="margin-top:14px">
        <a class="btn btn--brand" href="/posts/">글 목록</a>
        <a class="btn" href="/">홈</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function topbar() {
  return `<header class="topbar">
    <div class="topbar__inner">
      <a class="brand" href="/">
        <span class="brand__mark">W</span>
        <span>Wacky Blog</span>
      </a>
      <nav class="nav" aria-label="주요 메뉴">
        <a href="/" data-path="/">홈</a>
        <a href="/posts/" data-path="/posts">글 목록</a>
        <a href="/posts/?status=draft">초안글 보기</a>
        <a href="/about/" data-path="/about">소개</a>
        <a href="/add.html" data-path="/add.html">글 작성</a>
      </nav>
    </div>
  </header>`;
}

function footer(siteName, siteDescription) {
  return `<footer class="footer container">
    <div class="footer__inner">
      <div>© 2026 ${escapeHtml(siteName)}</div>
      <div>${escapeHtml(siteDescription)}</div>
    </div>
  </footer>`;
}