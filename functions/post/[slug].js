import { escapeHtml, jsonld, okHtml, edgeCache } from "../_utils.js";
import { renderMarkdown, renderMarkdownBlocks, buildTocItemsFromBlocks, renderTocHtml, parseInlineImages, stripInlineImageTokens } from "../../lib/posts/renderer.js";
import { buildImageAttrs, buildResponsiveImageSet, absolutizeImageUrl } from "../../lib/image-utils.js";

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
          enable_sidebar_ad,
          enable_inarticle_ads,
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

      const adConfig = buildAdsenseConfig(env);
      const contentTextLength = stripMarkdown(stripInlineImageTokens(row.content_md || "")).replace(/\s+/g, "").length;
      const shouldShowSidebarAd = toBool(row.enable_sidebar_ad, true);
      const shouldShowInarticleAds = toBool(row.enable_inarticle_ads, true);
      const inArticleAds = buildInArticleAds(adConfig, 2);
      const bodyHtml = buildArticleBodyHtml(row.content_md || "", inArticleAds, contentTextLength, env, origin);
      const faqSectionHtml = renderFaqSection(faqItems);
      const relatedPostsHtml = renderRelatedPostsSection(relatedRows, row.category);
      const tagHighlightsHtml = renderTagHighlights(tags);
      const popularPostsHtml = renderPopularPosts(popularRows);
      const sidebarAdHtml = shouldShowSidebarAd ? renderSidebarAd(adConfig) : "";
      const adsenseHeadScript = renderAdsenseHeadScript(adConfig, shouldShowSidebarAd || shouldShowInarticleAds);
      const adsenseRuntimeScript = renderAdsenseRuntimeScript(adConfig, shouldShowSidebarAd || shouldShowInarticleAds);

      const titleText = String(row.title || "").trim();
      const descriptionText = buildDescription(
        row.meta_description,
        row.summary,
        row.content_md,
        titleText
      );
      const pageTitle = `${titleText} | ${siteName}`;
      const ogImage = absolutizeImageUrl(row.cover_image || `${origin}/assets/images/og-default.svg`, origin);
      const coverImageAltText = String(row.cover_image_alt || `${titleText} 대표 이미지`).trim();

      const publishedDate = formatDate(row.published_at);
      const updatedDate = formatDate(row.updated_at);
      const publishedIso = toIso(row.published_at);
      const updatedIso = toIso(row.updated_at);

      const breadcrumbItems = [
        { name: "홈", url: `${origin}/` }
      ];

      if (row.category) {
        breadcrumbItems.push({
          name: String(row.category),
          url: `${origin}/?category=${encodeURIComponent(String(row.category))}`
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

      const coverImageData = row.cover_image
        ? buildImageAttrs(row.cover_image, {
            widths: [640, 960, 1280, 1600],
            sizes: "(min-width: 980px) 900px, 100vw",
            fallbackWidth: 960,
            fit: "cover",
            quality: 85,
            format: "auto",
          }, origin)
        : null;
      const coverImagePreload = coverImageData
        ? `<link rel="preload" as="image" href="${escapeHtml(coverImageData.src)}" imagesrcset="${escapeHtml(coverImageData.srcset)}" imagesizes="${escapeHtml(coverImageData.sizes)}" fetchpriority="high" />`
        : "";
      const categoryLink = row.category
        ? `/?category=${encodeURIComponent(String(row.category))}`
        : "/";
      const coverImageHtml = coverImageData
        ? `
        <figure class="post-cover-wrap">
          <img
            class="post-cover"
            ${coverImageData.attrs}
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
  ${adsenseHeadScript}

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

  ${topbar()}

  
  <div class="search-overlay" id="siteSearchOverlay" hidden aria-hidden="true">
    <div class="search-overlay__backdrop" data-search-close></div>
    <div class="search-overlay__panel" role="dialog" aria-modal="true" aria-labelledby="siteSearchTitle">
      <div class="search-overlay__head">
        <div>
          <div class="small">Search</div>
          <h2 class="h2" id="siteSearchTitle">검색</h2>
        </div>
        <button class="search-overlay__close" type="button" aria-label="검색 닫기" data-search-close>닫기</button>
      </div>
      <form class="search-overlay__form" id="siteSearchForm">
        <label class="search-overlay__field" for="siteSearchInput">
          <span class="search-overlay__icon" aria-hidden="true">⌕</span>
          <input class="search-overlay__input" id="siteSearchInput" name="q" type="search" placeholder="제목, 요약, 카테고리로 검색" autocomplete="off" />
        </label>
        <button class="btn btn--brand search-overlay__submit" type="submit">검색</button>
      </form>
      <div class="small">엔터를 누르거나 검색 버튼을 누르면 결과 페이지로 이동합니다.</div>
    </div>
  </div>


  <main id="main-content" class="container">
    ${breadcrumbHtml}

    <article class="post-shell" itemscope itemtype="https://schema.org/BlogPosting">
      <header class="card post-hero">
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
          <div class="row" style="gap:8px;flex-wrap:wrap">
            ${row.category ? `<a class="badge" href="${categoryLink}">${escapeHtml(String(row.category))}</a>` : ""}
          </div>
          <div class="row post-admin-actions" style="gap:8px;flex-wrap:wrap;align-items:center">
            <div class="small">
              <time datetime="${escapeHtml(publishedIso || "")}">발행 ${escapeHtml(publishedDate)}</time>
              <span aria-hidden="true"> · </span>
              <time datetime="${escapeHtml(updatedIso || "")}">수정 ${escapeHtml(updatedDate)}</time>
            </div>
            <a class="btn btn--sm" href="/edit.html?slug=${encodeURIComponent(slug)}" data-admin-only hidden>수정</a>
            <button class="btn btn--sm btn--danger" type="button" id="deletePostBtn" data-admin-only hidden data-slug="${encodeURIComponent(slug)}" data-title="${escapeHtml(titleText)}">삭제</button>
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
          ${sidebarAdHtml}
          ${popularPostsHtml}
        </aside>
      </div>
    </article>

    ${footer(siteName, siteDescription)}
  </main>

  <script>
  document.addEventListener('DOMContentLoaded', () => {
    const deleteBtn = document.getElementById('deletePostBtn');
    if (!deleteBtn) return;
    deleteBtn.addEventListener('click', async () => {
      const slug = decodeURIComponent(String(deleteBtn.dataset.slug || ''));
      const title = String(deleteBtn.dataset.title || slug || '이 글');
      const confirmed = window.confirm("'" + title + "' 글을 삭제할까요? 삭제 후 되돌릴 수 없습니다.");
      if (!confirmed) return;
      deleteBtn.disabled = true;
      deleteBtn.textContent = '삭제 중…';
      try {
        const res = await fetch('/api/posts/' + encodeURIComponent(slug), { method: 'DELETE' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error((json && json.message) || ('삭제 실패 (' + res.status + ')'));
        window.location.href = '/';
      } catch (err) {
        alert(err?.message || '삭제 중 오류가 발생했습니다.');
        deleteBtn.disabled = false;
        deleteBtn.textContent = '삭제';
      }
    });
  });
</script>
  ${adsenseRuntimeScript}
  <script src="/assets/js/admin-ui.js" defer></script>
  <script src="/assets/js/nav.js" defer></script>
  <script src="/assets/js/search.js" defer></script>
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

function toBool(value, defaultValue = true) {
  if (value === null || value === undefined || value === "") return defaultValue;
  if (typeof value === "number") return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  return !(normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no");
}

function buildAdsenseConfig(env) {
  return {
    client: String(env.ADSENSE_CLIENT || "").trim(),
    sidebarSlot: String(env.ADSENSE_SLOT_SIDEBAR || "").trim(),
    inArticleSlot1: String(env.ADSENSE_SLOT_INARTICLE_1 || "").trim(),
    inArticleSlot2: String(env.ADSENSE_SLOT_INARTICLE_2 || "").trim()
  };
}

function renderAdsenseHeadScript(config, shouldLoad) {
  if (!shouldLoad || !config.client) return "";
  return `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${escapeHtml(config.client)}" crossorigin="anonymous"></script>`;
}

function renderAdsenseRuntimeScript(config, shouldLoad) {
  if (!shouldLoad || !config.client) return "";
  return `<script>
  document.addEventListener('DOMContentLoaded', () => {
    const adSlots = Array.from(document.querySelectorAll('.js-lazy-ad[data-ad-loaded="false"]'));
    if (!adSlots.length) return;

    const loadAd = (slot) => {
      if (!slot || slot.dataset.adLoaded === 'true') return;
      const client = String(slot.dataset.adClient || '').trim();
      const adSlot = String(slot.dataset.adSlot || '').trim();
      if (!client || !adSlot) return;

      slot.dataset.adLoaded = 'true';
      slot.innerHTML = '<ins class="adsbygoogle" style="display:block" data-ad-client="' + client + '" data-ad-slot="' + adSlot + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';

      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (error) {
        slot.dataset.adLoaded = 'error';
        slot.innerHTML = '';
      }
    };

    if (!('IntersectionObserver' in window)) {
      adSlots.forEach(loadAd);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        loadAd(entry.target);
        observer.unobserve(entry.target);
      });
    }, {
      root: null,
      rootMargin: '800px 0px 800px 0px',
      threshold: 0.01
    });

    adSlots.forEach((slot) => observer.observe(slot));
  });
  </script>`;
}

function renderAdUnit({ config, slot, label, kind }) {
  const safeLabel = escapeHtml(label);
  if (config.client && slot) {
    return `
      <section class="post-ad post-ad--${escapeHtml(kind)}" aria-label="${safeLabel}">
        <div
          class="post-ad__slot js-lazy-ad"
          data-ad-client="${escapeHtml(config.client)}"
          data-ad-slot="${escapeHtml(slot)}"
          data-ad-kind="${escapeHtml(kind)}"
          data-ad-loaded="false"
        >
          <div class="post-ad__skeleton" aria-hidden="true">
            <span class="post-ad__skeleton-label">${safeLabel}</span>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="post-ad post-ad--placeholder post-ad--${escapeHtml(kind)}" aria-label="${safeLabel}">
      <div class="post-ad__placeholder-title">${safeLabel}</div>
      <div class="small">광고 코드는 전역 설정에서 한 번만 관리합니다.</div>
    </section>
  `;
}

function renderSidebarAd(config) {
  return `
    <section class="post-side__section post-side__ad" aria-label="광고 영역">
      <h2 class="h2">광고 영역</h2>
      <p class="small">사이드바 고정 광고 영역입니다.</p>
      ${renderAdUnit({ config, slot: config.sidebarSlot, label: "사이드바 광고", kind: "sidebar" })}
    </section>
  `;
}

function buildInArticleAds(config, count) {
  const ads = [];
  if (count >= 1) ads.push(renderAdUnit({ config, slot: config.inArticleSlot1, label: "본문 광고 1", kind: "inline" }));
  if (count >= 2) ads.push(renderAdUnit({ config, slot: config.inArticleSlot2 || config.inArticleSlot1, label: "본문 광고 2", kind: "inline" }));
  return ads;
}

function buildArticleBodyHtml(contentMd, adHtmlList = [], contentTextLength = 0, env = {}, imageOrigin = "") {
  const inlineImages = parseInlineImages(contentMd || "");
  const blocks = renderMarkdownBlocks(contentMd || "", { inlineImages, imageOrigin });
  if (!blocks.length) return "";

  const tocBlock = blocks.find((block) => block.type === "toc");
  const tocItems = tocBlock ? buildTocItemsFromBlocks(blocks, tocBlock.mode || "h2") : [];
  const renderedBlocks = blocks.map((block) => {
    if (block.type !== "toc") return block;
    return {
      ...block,
      html: tocItems.length ? renderTocHtml(tocItems, block.mode || "h2") : ""
    };
  });

  const insertPositions = getAdInsertPositions(renderedBlocks, contentTextLength, adHtmlList.length);
  if (!insertPositions.length) {
    return renderedBlocks.map((block) => block.html).join("\n");
  }

  const adsByPosition = new Map();
  insertPositions.forEach((position, index) => {
    const adHtml = adHtmlList[index];
    if (!adHtml) return;
    const safePosition = Math.max(0, Math.min(position, renderedBlocks.length));
    if (!adsByPosition.has(safePosition)) adsByPosition.set(safePosition, []);
    adsByPosition.get(safePosition).push(adHtml);
  });

  const html = [];
  for (let i = 0; i <= renderedBlocks.length; i += 1) {
    const queuedAds = adsByPosition.get(i) || [];
    queuedAds.forEach((ad) => html.push(ad));
    if (i < renderedBlocks.length) html.push(renderedBlocks[i].html);
  }
  return html.join("\n");
}

function getAdInsertPositions(blocks, contentTextLength, maxAds) {
  if (!maxAds) return [];
  const h2Positions = blocks
    .map((block, index) => ({ block, index }))
    .filter((entry) => entry.block.type === "heading" && entry.block.level === 2)
    .map((entry) => entry.index);

  const positions = [];
  const firstPosition = getSectionEndPosition(blocks, h2Positions, 0) ?? getFallbackPosition(blocks, 0.42);
  positions.push(firstPosition);

  const shouldAddSecond = contentTextLength >= 2000 && h2Positions.length >= 3 && maxAds >= 2;
  if (shouldAddSecond) {
    positions.push(getSectionEndPosition(blocks, h2Positions, 2) ?? getFallbackPosition(blocks, 0.74));
  }

  return dedupePositions(positions, blocks.length);
}

function getSectionEndPosition(blocks, h2Positions, sectionIndex) {
  if (!h2Positions.length) return null;
  const safeSectionIndex = Math.min(sectionIndex, h2Positions.length - 1);
  const nextH2Index = h2Positions[safeSectionIndex + 1];
  if (typeof nextH2Index === "number") return nextH2Index;
  return blocks.length;
}

function getFallbackPosition(blocks, ratio) {
  if (!blocks.length) return 0;
  const contentBlockIndexes = blocks
    .map((block, index) => ({ block, index }))
    .filter((entry) => entry.block.type !== "heading")
    .map((entry) => entry.index);
  if (!contentBlockIndexes.length) return blocks.length;
  const target = Math.max(0, Math.min(contentBlockIndexes.length - 1, Math.floor(contentBlockIndexes.length * ratio)));
  return contentBlockIndexes[target] + 1;
}

function dedupePositions(positions, blockLength) {
  const result = [];
  for (const position of positions) {
    let safePosition = Math.max(0, Math.min(position, blockLength));
    while (result.includes(safePosition) && safePosition < blockLength) {
      safePosition += 1;
    }
    result.push(safePosition);
  }
  return result;
}

function renderTagHighlights(tags) {
  if (!Array.isArray(tags) || !tags.length) return "";
  const cleanTags = tags.map((tag) => String(tag || "").trim()).filter(Boolean);
  if (!cleanTags.length) return "";
  return `
    <section class="post-tags-highlight" aria-labelledby="post-tags-highlight-title" style="margin-top:32px;padding-top:24px;border-top:1px solid var(--border)">
      <h2 id="post-tags-highlight-title" class="h2">핵심 키워드</h2>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:14px">
        ${cleanTags.map((tag) => `<span class="tag-chip tag-chip--static">#${escapeHtml(tag)}</span>`).join("")}
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
        ${categoryText ? `<a class="btn" href="/?category=${encodeURIComponent(categoryText)}">카테고리 전체 보기</a>` : ""}
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
      const content = isLast
        ? `<span>${escapeHtml(item.name)}</span>`
        : `<a href="${escapeHtml(item.url)}">${escapeHtml(item.name)}</a>`;
      return `<li${isLast ? ' aria-current="page"' : ''}>${content}</li>`;
    })
    .join("");

  return `
  <nav class="breadcrumb small" aria-label="브레드크럼" style="margin:16px 0 20px">
    <ol class="list-reset">
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
        <a class="btn btn--brand" href="/">블로그 홈</a>
        <a class="btn" href="/">홈</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function topbar() {
  return `<header class="topbar topbar--editorial">
    <div class="topbar__inner topbar__inner--editorial">
      <button class="topbar-hamburger" type="button" aria-expanded="false" aria-controls="mobileSiteMenu" aria-label="메뉴 열기">
        <span></span><span></span><span></span>
      </button>

      <div class="topbar-left-slot">
        <div class="topbar-admin-status" data-admin-status hidden aria-live="polite">관리자 로그인 중</div>
      </div>

      <a class="brand brand--center" href="/" aria-label="Wacky Blog 홈">
        <span class="brand__mark">W</span>
        <span class="brand__text">Wacky Wiki</span>
      </a>

      <nav class="nav nav--utility nav--right" aria-label="오른쪽 메뉴">
        <button class="nav__search-btn" type="button" data-search-open aria-label="검색 열기">검색</button>
        <a href="/about/" data-path="/about">소개</a>
        <a href="/admin/dashboard.html" data-admin-link hidden>대시보드</a>
      </nav>

      <div class="topbar-mobile-spacer" aria-hidden="true"></div>
    </div>
  </header>

  <aside id="mobileSiteMenu" class="mobile-site-menu" hidden aria-hidden="true">
    <div class="mobile-site-menu__panel">
      <div class="mobile-site-menu__head">
        <strong>메뉴</strong>
        <button class="mobile-site-menu__close" type="button" aria-label="메뉴 닫기">닫기</button>
      </div>
      <nav class="mobile-site-menu__nav" aria-label="모바일 주요 메뉴">
        <button class="mobile-site-menu__icon-link nav__icon-btn nav__search-btn--mobile" type="button" data-search-open aria-label="검색">
          <span class="nav__icon" aria-hidden="true">⌕</span>
          <span>검색</span>
        </button>
        <a class="mobile-site-menu__icon-link" href="/" data-path="/">
          <span class="nav__icon" aria-hidden="true">⌂</span>
          <span>홈</span>
        </a>
        <a class="mobile-site-menu__text-link" href="/about/" data-path="/about">소개</a>
        <a class="mobile-site-menu__text-link" href="/admin/dashboard.html" data-admin-link hidden>대시보드</a>
      </nav>
      <div class="mobile-site-menu__section">
        <div class="mobile-site-menu__title">카테고리</div>
        <div id="mobileSiteCategoryBar" class="topbar-categories__list topbar-categories__list--mobile"></div>
      </div>
    </div>
  </aside>`;
}

function footer(siteName, siteDescription) {
  return `<footer class="footer container">
    <div class="footer__inner">
      <div>© 2026 ${escapeHtml(siteName)}</div>
      <div>${escapeHtml(siteDescription)}</div>
    </div>
  </footer>`;
}
