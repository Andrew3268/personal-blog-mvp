import { escapeHtml, jsonld, okHtml, edgeCache } from "../_utils.js";
import { renderMarkdown, renderMarkdownBlocks, buildTocItemsFromBlocks, renderTocHtml, parseInlineImages, stripInlineImageTokens } from "../../lib/posts/renderer.js";
import { buildImageAttrs, absolutizeImageUrl } from "../../lib/image-utils.js";
import { canonicalCategoryName, categoryPath } from "../_category-utils.js";

const SITE_ORIGIN = "https://wacky-wiki.com";
const ADSENSE_CLIENT = "ca-pub-7298667883751711";

function safeDecodePathParam(value = "") {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return "";
  }
}

export async function onRequestGet(context) {
  const { params, env, request } = context;
  const slug = safeDecodePathParam(params.slug).trim();
  if (!slug) return okHtml("Not Found", { status: 404 });

  const cacheKeyUrl = `${SITE_ORIGIN}/post/${encodeURIComponent(slug)}`;

  return edgeCache({
    request,
    cacheKeyUrl,
    ttlSeconds: 600,
    waitUntil: (promise) => context.waitUntil(promise),
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
          first_published_at AS published_at,
          metadata_updated_at,
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


      const origin = SITE_ORIGIN;
      const canonical = new URL(`/post/${encodeURIComponent(slug)}`, SITE_ORIGIN);

      const siteName = "Wacky Wiki";
      const siteDescription = "실용적인 생활 정보와 정리된 가이드를 제공하는 블로그";
      const authorName = "W. Archiver";
      const faqItems = parseFaqMarkdown(row.faq_md || "");
      const relatedStatement = row.category
        ? env.BLOG_DB.prepare(`
            SELECT slug, title
            FROM posts
            WHERE status = 'published'
              AND category = ?
              AND slug != ?
            ORDER BY first_published_at DESC, updated_at DESC
            LIMIT 5
          `).bind(String(row.category).trim(), slug)
        : env.BLOG_DB.prepare(`
            SELECT slug, title
            FROM posts
            WHERE 1 = 0
          `);
      const [relatedResult, popularResult, categoryResult] = await env.BLOG_DB.batch([
        relatedStatement,
        env.BLOG_DB.prepare(`
          SELECT slug, title, view_count
          FROM posts
          WHERE status = 'published'
            AND slug != ?
          ORDER BY view_count DESC, updated_at DESC, first_published_at DESC
          LIMIT 5
        `).bind(slug),
        getMobileCategoryStatement(env.BLOG_DB)
      ]);
      const relatedRows = relatedResult?.results || [];
      const popularRows = popularResult?.results || [];
      const mobileCategoryHtml = renderMobileCategoryLinks(categoryResult?.results || []);

      const adConfig = buildAdsenseConfig(env);
      const contentTextLength = stripMarkdown(stripInlineImageTokens(row.content_md || "")).replace(/\s+/g, "").length;
      const shouldShowSidebarAd = toBool(row.enable_sidebar_ad, true);
      const shouldShowInarticleAds = toBool(row.enable_inarticle_ads, true);
      const hasRenderableSidebarAd = shouldShowSidebarAd && Boolean(adConfig.client && adConfig.sidebarSlot);
      const hasRenderableInarticleAd = shouldShowInarticleAds && Boolean(adConfig.client && (adConfig.inArticleSlot1 || adConfig.inArticleSlot2));
      const shouldLoadAdsense = hasRenderableSidebarAd || hasRenderableInarticleAd;
      const inArticleAds = shouldShowInarticleAds ? buildInArticleAds(adConfig, 2) : [];
      const bodyHtml = buildArticleBodyHtml(row.content_md || "", inArticleAds, contentTextLength, env);
      const faqSectionHtml = renderFaqSection(faqItems);
      const relatedPostsHtml = renderRelatedPostsSection(relatedRows, canonicalCategoryName(row.category));
      const popularPostsHtml = renderPopularPosts(popularRows);
      const sidebarAdHtml = shouldShowSidebarAd ? renderSidebarAd(adConfig) : "";
      const adsenseHeadScript = renderAdsenseHeadScript(adConfig, shouldLoadAdsense);
      const adsenseRuntimeScript = renderAdsenseRuntimeScript(adConfig, shouldLoadAdsense);

      const titleText = String(row.title || "").trim();
      const descriptionText = buildDescription(
        row.meta_description,
        row.summary,
        row.content_md,
        titleText
      );
      const pageTitle = `${titleText} | ${siteName}`;
      const ogImage = absolutizeImageUrl(row.cover_image || `${origin}/assets/images/logo.png`, origin);
      const coverImageAltText = String(row.cover_image_alt || `${titleText} 대표 이미지`).trim();

      const publishedDate = formatDate(row.published_at);
      const updatedDate = formatDate(row.updated_at);
      const publishedIso = toIso(row.published_at);
      const updatedIso = toIso(row.updated_at);
      const authorCardHtml = `
        <div class="post-author-card" aria-label="작성자 정보">
          <img class="post-author-card__avatar" src="/assets/images/favicon-32x32.png" alt="" width="40" height="40" loading="lazy" decoding="async" />
          <div class="post-author-card__body">
            <div class="post-author-card__name">${escapeHtml(authorName)}</div>
            <div class="post-author-card__meta">
              <time datetime="${escapeHtml(publishedIso || "")}">발행 ${escapeHtml(publishedDate)}</time>
              <span aria-hidden="true"> · </span>
              <time datetime="${escapeHtml(updatedIso || "")}">수정 ${escapeHtml(updatedDate)}</time>
            </div>
          </div>
        </div>
      `;

      const breadcrumbItems = [
        { name: "홈", url: `${origin}/` }
      ];

      if (row.category) {
        breadcrumbItems.push({
          name: canonicalCategoryName(row.category),
          url: `${origin}${categoryPath(row.category)}`
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
            url: `${origin}/assets/images/logo.png`,
            width: 520,
            height: 520
          }
        },
        datePublished: publishedIso || row.published_at || "",
        dateModified: updatedIso || row.updated_at || "",
        url: canonical.toString(),
        inLanguage: "ko-KR",
        articleSection: canonicalCategoryName(row.category) || "블로그",
        wordCount: stripMarkdown(row.content_md || "").split(/\s+/).filter(Boolean).length
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

      const coverImage = row.cover_image
        ? buildImageAttrs(row.cover_image, {
            widths: [480, 768, 960, 1200],
            sizes: "(max-width: 900px) 100vw, 900px",
            fallbackWidth: 960,
            fit: "cover",
            quality: 82
          }, SITE_ORIGIN)
        : null;
      const coverImagePreload = coverImage
        ? `<link rel="preload" as="image" href="${escapeHtml(coverImage.src)}"${coverImage.srcset ? ` imagesrcset="${escapeHtml(coverImage.srcset)}"` : ""}${coverImage.sizes ? ` imagesizes="${escapeHtml(coverImage.sizes)}"` : ""} fetchpriority="high" />`
        : "";
      const categoryLink = row.category
        ? categoryPath(String(row.category))
        : "/";
      const coverImageHtml = coverImage
        ? `
        <figure class="post-cover-wrap">
          <img
            class="post-cover"
            ${coverImage.attrs}
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
  <meta name="naver-site-verification" content="e49bca383d3b342f512aeaaf82017d3705a638b3" />
  <title>${escapeHtml(pageTitle)}</title>
  <meta name="description" content="${escapeHtml(descriptionText)}" />
  <meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1" />
  <meta name="theme-color" content="#111111" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/images/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/images/favicon-192x192.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/images/apple-touch-icon.png" />
  <meta name="author" content="${escapeHtml(authorName)}" />
  <link rel="canonical" href="${escapeHtml(canonical.toString())}" />
  <link rel="alternate" type="application/rss+xml" title="Wacky Wiki RSS" href="https://wacky-wiki.com/rss.xml" />
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

  <link rel="stylesheet" href="/assets/css/app.css?v=20260811v3" />
  <link rel="stylesheet" href="/assets/css/components.css?v=20260731v2" />

  ${jsonld(blogPostingJsonLd)}
  ${jsonld(breadcrumbJsonLd)}
  ${jsonld(webPageJsonLd)}
  ${faqJsonLd ? jsonld(faqJsonLd) : ""}
</head>
<body class="post-page-body">

  ${topbar(mobileCategoryHtml)}

  <main id="main-content" class="container">
    ${breadcrumbHtml}

    <article class="post-shell" itemscope itemtype="https://schema.org/BlogPosting">
      <div class="post-grid">
        <div class="post-main">
          <header class="card post-hero">
            <h1 class="h1 post-title" itemprop="headline">${escapeHtml(titleText)}</h1>

            ${row.summary ? `<p class="p post-summary" itemprop="description">${escapeHtml(String(row.summary))}</p>` : ""}

            ${authorCardHtml}

            ${coverImageHtml}

            <meta itemprop="author" content="${escapeHtml(authorName)}" />
            <meta itemprop="datePublished" content="${escapeHtml(publishedIso || "")}" />
            <meta itemprop="dateModified" content="${escapeHtml(updatedIso || "")}" />
            <meta itemprop="mainEntityOfPage" content="${escapeHtml(canonical.toString())}" />
            <meta itemprop="image" content="${escapeHtml(ogImage)}" />
          </header>

          <section class="card post-body" aria-label="본문">
            <div class="post-content" itemprop="articleBody">
              ${bodyHtml}
            </div>
            ${faqSectionHtml}
            ${relatedPostsHtml}
          </section>
        </div>

        <aside class="card post-side" aria-label="추가 콘텐츠">
          ${sidebarAdHtml}
          ${popularPostsHtml}
        </aside>
      </div>
    </article>

    ${footer(siteName, siteDescription)}
  </main>

  ${adsenseRuntimeScript}
  <script>
    window.addEventListener('load', () => {
      const encodedSlug = ${JSON.stringify(encodeURIComponent(slug)).replace(/</g, "\\u003c")};
      const viewKey = 'wacky-post-view:' + encodedSlug;
      const viewInterval = 6 * 60 * 60 * 1000;
      try {
        const lastViewedAt = Number(localStorage.getItem(viewKey) || 0);
        if (Date.now() - lastViewedAt < viewInterval) return;
      } catch (_) {}
      fetch('/api/views/' + encodedSlug, {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: '{}'
      }).then((response) => {
        if (!response.ok) return;
        try { localStorage.setItem(viewKey, String(Date.now())); } catch (_) {}
      }).catch(() => {});
    }, { once: true });
  </script>
  <script src="/assets/js/nav.js" defer></script>
  <script src="/assets/js/post-layout.js?v=20260811v1" defer></script>
</body>
</html>`;

      const res = okHtml(html, {
        headers: {
          "cache-control": "public, max-age=600"
        }
      });

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
    client: String(env.ADSENSE_CLIENT || ADSENSE_CLIENT).trim(),
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
      slot.innerHTML = '<ins class="adsbygoogle adsbygoogle--block" data-ad-client="' + client + '" data-ad-slot="' + adSlot + '" data-ad-format="auto" data-full-width-responsive="true"></ins>';

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
    <section class="post-side__section post-side__ad" aria-label="사이드바 광고">
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

function buildArticleBodyHtml(contentMd, adHtmlList = [], contentTextLength = 0, env = {}) {
  const inlineImages = parseInlineImages(contentMd || "");
  const blocks = renderMarkdownBlocks(contentMd || "", { inlineImages, origin: SITE_ORIGIN });
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

function renderPopularPosts(items) {
  if (!Array.isArray(items) || !items.length) return "";
  return `
    <section class="post-side__section post-side__popular" aria-labelledby="post-popular-title">
      <div class="row post-section-header post-section-header--compact">
        <p id="post-popular-title" class="post-side__title">인기글</p>
        
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
    <section class="post-faq post-section-divider post-section-divider--faq" aria-labelledby="post-faq-title">
      <h2 id="post-faq-title" class="h2">자주 묻는 질문</h2>
      <div class="post-faq__list">
        ${items.map((item) => `
          <article class="card">
            <h3 class="h3 post-faq__question">Q. ${escapeHtml(item.question)}</h3>
            <div class="post-faq__answer">${renderMarkdown(item.answerMd || "", { origin: SITE_ORIGIN })}</div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderRelatedPostsSection(items, category) {
  if (!Array.isArray(items) || !items.length) return "";
  const categoryText = canonicalCategoryName(category);
  const headingText = categoryText ? `${categoryText} 관련글 더보기` : "관련글 더보기";
  const categoryActionHtml = categoryText
    ? `<div class="post-related__action"><a class="btn post-related__more-btn" href="${categoryPath(categoryText)}">카테고리 전체 보기</a></div>`
    : "";
  return `
    <section class="post-related post-section-divider post-section-divider--related" aria-labelledby="post-related-title">
      <div class="post-related__layout">
        <div class="row post-section-header post-section-header--related">
          <div>
            <h2 id="post-related-title" class="h2 post-section-title">${escapeHtml(headingText)}</h2>
          </div>
        </div>
        ${categoryActionHtml}
        <ul class="list-reset post-related__list">
          ${items.map((item, index) => `
            <li>
              <a href="/post/${encodeURIComponent(String(item.slug || ""))}" class="post-related-link">
                <span>${escapeHtml(String(item.title || "(제목 없음)"))}</span>
              </a>
            </li>
          `).join("")}
        </ul>
      </div>
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
  <nav class="breadcrumb small breadcrumb--post" aria-label="브레드크럼">
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
  <meta name="naver-site-verification" content="e49bca383d3b342f512aeaaf82017d3705a638b3" />
  <title>글을 찾을 수 없습니다</title>
  <link rel="alternate" type="application/rss+xml" title="Wacky Wiki RSS" href="https://wacky-wiki.com/rss.xml" />
  <meta name="robots" content="noindex,nofollow" />
  <link rel="icon" href="/favicon.ico" sizes="any" />
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/images/favicon-32x32.png" />
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/images/favicon-192x192.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/images/apple-touch-icon.png" />
  <meta name="theme-color" content="#111111" />
  <link rel="stylesheet" href="/assets/css/app.css?v=20260811v3" />
  <link rel="stylesheet" href="/assets/css/components.css?v=20260731v2" />
</head>
<body>
  <main class="container">
    <section class="card">
      <h1 class="h1">글을 찾을 수 없습니다</h1>
      <p class="p">요청한 slug: ${escapeHtml(slug)}</p>
      <div class="row row--top-gap-lg">
        <a class="btn btn--brand" href="/">블로그 홈</a>
        <a class="btn" href="/">홈</a>
      </div>
    </section>
  </main>
</body>
</html>`;
}

function getMobileCategoryStatement(db) {
  return db.prepare(`
    SELECT c.name, COUNT(p.slug) AS count
    FROM categories c
    LEFT JOIN posts p
      ON p.category = c.name
     AND p.status = 'published'
    GROUP BY c.name, c.sort_order
    ORDER BY c.sort_order ASC, c.name COLLATE NOCASE ASC
  `);
}

function renderMobileCategoryLinks(items = []) {
  const links = (items || [])
    .filter((item) => Number(item?.count || 0) > 0)
    .map((item) => canonicalCategoryName(item?.name))
    .filter(Boolean)
    .map((name) => '<a class="topbar-categories__chip" href="' + categoryPath(name) + '">' + escapeHtml(name) + '</a>')
    .join('');

  return '<a class="topbar-categories__chip topbar-categories__chip--utility" href="/">ALL</a>' + links;
}

function topbar(mobileCategoryHtml = "") {
  return `<header class="topbar topbar--editorial">
    <div class="topbar__inner topbar__inner--editorial">
      <button class="topbar-hamburger" type="button" aria-expanded="false" aria-controls="mobileSiteMenu" aria-label="메뉴 열기">
        <span></span><span></span><span></span>
      </button>

      <div class="topbar-left-slot"></div>

      <a class="brand brand--center" href="/" aria-label="Wacky Wiki 홈">
        <span class="brand__mark">W</span>
        <span class="brand__text">Wacky Wiki</span>
      </a>

      <nav class="nav nav--utility nav--right" aria-label="오른쪽 메뉴"></nav>
    </div>
  </header>

  <aside id="mobileSiteMenu" class="mobile-site-menu" hidden aria-hidden="true">
    <div class="mobile-site-menu__panel">
      <div class="mobile-site-menu__close-wrap">
        <button class="mobile-site-menu__close-toggle topbar-hamburger is-open" type="button" aria-label="메뉴 닫기" data-mobile-menu-close>
          <span></span><span></span><span></span>
        </button>
      </div>
      <nav class="mobile-site-menu__nav" aria-label="모바일 주요 메뉴">
      </nav>
      <div class="mobile-site-menu__section mobile-site-menu__section--categories">
        <div id="mobileSiteCategoryBar" class="topbar-categories__list topbar-categories__list--mobile">${mobileCategoryHtml}</div>
      </div>
    </div>
  </aside>`;
}

function footer(siteName, siteDescription) {
  return `<footer class="footer container">
    <div class="footer__inner">
      <div class="footer__copy">
        <div>© 2026 ${escapeHtml(siteName)}</div>
        <div>${escapeHtml(siteDescription)}</div>
      </div>
      <nav class="footer__links" aria-label="하단 메뉴">
        <a class="footer__link" href="/about/">Wacky-Wiki 소개</a>
        <a class="footer__link" href="/privacy-policy/">개인정보 처리방침</a>
      </nav>
    </div>
  </footer>`;
}
