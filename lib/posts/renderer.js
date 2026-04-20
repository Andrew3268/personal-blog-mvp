import { escapeHtml } from "../../functions/_utils.js";

const TOC_TOKEN_RE = /^\[\[TOC(?::(h2|h2,h3))?\]\]$/i;

const INLINE_IMAGE_TOKEN_RE = /^\[\[(POST_IMAGE_[12])\s+(.+?)\]\]$/i;
const AFFILIATE_TOKEN_RE = /^\[\[(POST_AFFILIATE_(?:[1-5]))\s+(.+?)\]\]$/i;

function parseTokenAttributes(raw = "") {
  const attrs = {};
  const re = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = re.exec(String(raw || ""))) !== null) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function parseInlineImageToken(line = "") {
  const match = String(line || "").trim().match(INLINE_IMAGE_TOKEN_RE);
  if (!match) return null;
  const attrs = parseTokenAttributes(match[2]);
  return {
    key: match[1].toUpperCase(),
    url: String(attrs.url || attrs.id || "").trim(),
    alt: String(attrs.alt || "").trim(),
    caption: String(attrs.caption || "").trim(),
    position: Math.max(1, parseInt(attrs.position || "0", 10) || (match[1].toUpperCase() === "POST_IMAGE_1" ? 3 : 5))
  };
}

export function stripInlineImageTokens(md = "") {
  return String(md || "")
    .split("\n")
    .filter((line) => !parseInlineImageToken(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseInlineImages(md = "") {
  const result = {
    image1: { enabled: false, url: "", alt: "", caption: "", position: 3 },
    image2: { enabled: false, url: "", alt: "", caption: "", position: 5 }
  };
  String(md || "").split("\n").forEach((line) => {
    const token = parseInlineImageToken(line);
    if (!token) return;
    const target = token.key === "POST_IMAGE_1" ? result.image1 : result.image2;
    target.enabled = !!token.url;
    target.url = token.url;
    target.alt = token.alt;
    target.caption = token.caption;
    target.position = token.position;
  });
  return result;
}

export function renderInlineImageHtml(data = {}, options = {}) {
  const src = String((data.url || data.id || "")).trim();
  if (!src) return "";
  const alt = String(data.alt || "본문 이미지").trim();
  const caption = String(data.caption || "").trim();
  return `
    <figure class="post-inline-image">
      <img class="post-inline-image__img" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
      ${caption ? `<figcaption class="post-inline-image__caption">${escapeHtml(caption)}</figcaption>` : ""}
    </figure>
  `;
}

function parseAffiliateToken(line = "") {
  const match = String(line || "").trim().match(AFFILIATE_TOKEN_RE);
  if (!match) return null;
  const attrs = parseTokenAttributes(match[2]);
  return {
    key: match[1].toUpperCase(),
    imageUrl: String(attrs.image || attrs.imageUrl || "").trim(),
    linkUrl: String(attrs.link || attrs.linkUrl || "").trim(),
    productName: String(attrs.name || attrs.productName || "").trim(),
    currentPrice: String(attrs.current || attrs.currentPrice || "").trim(),
    salePrice: String(attrs.sale || attrs.salePrice || "").trim(),
    discountRate: String(attrs.discount || attrs.discountRate || "").trim(),
    buttonText: String(attrs.button || attrs.buttonText || "상품 보기").trim() || "상품 보기",
    position: Math.max(1, parseInt(attrs.position || attrs.h2 || "1", 10) || 1)
  };
}

export function stripAffiliateTokens(md = "") {
  return String(md || "")
    .split("\n")
    .filter((line) => !parseAffiliateToken(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseAffiliates(md = "") {
  const items = [];
  String(md || "").split("\n").forEach((line) => {
    const token = parseAffiliateToken(line);
    if (!token) return;
    items.push({
      enabled: !!(token.imageUrl || token.linkUrl || token.productName),
      imageUrl: token.imageUrl,
      linkUrl: token.linkUrl,
      productName: token.productName,
      currentPrice: token.currentPrice,
      salePrice: token.salePrice,
      discountRate: token.discountRate,
      buttonText: token.buttonText || "상품 보기",
      position: token.position
    });
  });
  return { enabled: items.some((item) => item.enabled), items };
}

export function renderAffiliateHtml(data = {}) {
  if (!data || !(data.imageUrl || data.linkUrl || data.productName)) return "";
  const buttonText = String(data.buttonText || "상품 보기").trim() || "상품 보기";
  return `
    <article class="post-affiliate-card">
      <div class="post-affiliate-card__media">
        ${data.imageUrl ? `<img class="post-affiliate-card__img" src="${escapeHtml(data.imageUrl)}" alt="${escapeHtml(data.productName || "제휴 상품")}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />` : `<div class="post-affiliate-card__placeholder">상품 이미지</div>`}
      </div>
      <div class="post-affiliate-card__content">
        ${data.productName ? `<h3 class="post-affiliate-card__title">${escapeHtml(data.productName)}</h3>` : ""}
        <div class="post-affiliate-card__prices">
          ${data.currentPrice ? `<span class="post-affiliate-card__current">현재가 ${escapeHtml(data.currentPrice)}</span>` : ""}
          ${data.salePrice ? `<span class="post-affiliate-card__sale">할인가 ${escapeHtml(data.salePrice)}</span>` : ""}
          ${data.discountRate ? `<span class="post-affiliate-card__discount">${escapeHtml(data.discountRate)}</span>` : ""}
        </div>
        ${data.linkUrl ? `<a class="post-affiliate-card__button" href="${escapeHtml(data.linkUrl)}" target="_blank" rel="noopener noreferrer nofollow sponsored">${escapeHtml(buttonText)}</a>` : `<span class="post-affiliate-card__button is-disabled">${escapeHtml(buttonText)}</span>`}
      </div>
    </article>
  `;
}


function inlineFormat(text = "") {
  return escapeHtml(text)
    .replace(/\n/g, "<br />")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\[([^\]]+)\]\((\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

function slugifyHeading(text = "") {
  const base = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9\-가-힣\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "section";
}

export function parseTocMode(raw = "") {
  const match = String(raw || "").trim().match(TOC_TOKEN_RE);
  if (!match) return null;
  return (match[1] || "h2").toLowerCase();
}

export function isTocToken(raw = "") {
  return !!parseTocMode(raw);
}

export function stripTocTokens(md = "") {
  return String(md || "")
    .replace(/^\s*\[\[TOC(?::(?:h2|h2,h3))?\]\]\s*\n?/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


function parseLsiKeywordsToken(line = "") {
  const match = String(line || "").trim().match(/^\[\[POST_LSI\s+keywords="([^"]*)"\]\]$/);
  if (!match) return null;
  const raw = String(match[1] || "").replace(/&quot;/g, '"').trim();
  const keywords = raw ? raw.split("||").map((item) => item.trim()).filter(Boolean) : [];
  return { keywords };
}

function stripLsiKeywordsTokenLines(md = "") {
  return String(md || "")
    .split("\n")
    .filter((line) => !parseLsiKeywordsToken(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


function splitMarkdownTableRow(row = "") {
  let value = String(row || "").trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  return value.split("|").map((cell) => cell.trim());
}

function isMarkdownTableSeparatorRow(row = "") {
  const cells = splitMarkdownTableRow(row);
  if (!cells.length) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function getMarkdownTableAlignments(row = "") {
  return splitMarkdownTableRow(row).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "";
  });
}

function renderMarkdownTableFromLines(lines = []) {
  if (lines.length < 2) return "";
  const headerCells = splitMarkdownTableRow(lines[0]);
  const alignments = getMarkdownTableAlignments(lines[1]);
  const bodyRows = lines.slice(2).map((line) => splitMarkdownTableRow(line));

  const thead = `<thead><tr>${headerCells.map((cell, idx) => {
    const align = alignments[idx] || "";
    const alignClass = align ? ` table-cell--${align}` : "";
    return `<th class="table-cell${alignClass}">${inlineFormat(cell)}</th>`;
  }).join("")}</tr></thead>`;

  const tbody = bodyRows.length
    ? `<tbody>${bodyRows.map((row) => `<tr>${headerCells.map((_, idx) => {
        const align = alignments[idx] || "";
        const alignClass = align ? ` table-cell--${align}` : "";
        const cell = row[idx] ?? "";
        return `<td class="table-cell${alignClass}">${inlineFormat(cell)}</td>`;
      }).join("")}</tr>`).join("")}</tbody>`
    : "";

  return `<div class="table-wrap"><table>${thead}${tbody}</table></div>`;
}

export function buildTocItemsFromBlocks(blocks = [], mode = "h2") {
  const includeH3 = mode === "h2,h3";
  return blocks
    .filter((block) => block.type === "heading" && (block.level === 2 || (includeH3 && block.level === 3)))
    .map((block) => ({ id: block.id, text: block.text, level: block.level }));
}

export function renderTocHtml(items = [], mode = "h2") {
  if (!Array.isArray(items) || !items.length) return "";
  const includeH3 = mode === "h2,h3";
  let h2Count = 0;
  let h3Count = 0;
  const numberedItems = items.map((item) => {
    if (item.level === 2) {
      h2Count += 1;
      h3Count = 0;
      return { ...item, indexLabel: `${h2Count}.` };
    }
    h3Count += 1;
    return { ...item, indexLabel: `${Math.max(h2Count, 1)}.${h3Count}` };
  });

  return `
    <details class="post-toc">
      <summary class="post-toc__summary">
        <span class="post-toc__summary-main">
          <span class="post-toc__title">목차</span>
        </span>
        <span class="post-toc__summary-meta" aria-hidden="true"></span>
      </summary>
      <div class="post-toc__body">
        <ol class="post-toc__list${includeH3 ? " post-toc__list--with-h3" : ""}">
          ${numberedItems.map((item) => `
            <li class="post-toc__item post-toc__item--h${item.level}">
              <a href="#${escapeHtml(item.id)}">
                <span class="post-toc__index">${escapeHtml(item.indexLabel)}</span>
                <span class="post-toc__text">${escapeHtml(item.text)}</span>
              </a>
            </li>
          `).join("")}
        </ol>
      </div>
    </details>
  `;
}

export function renderMarkdownBlocks(md = "", options = {}) {
  const normalizedMd = stripLsiKeywordsTokenLines(String(md || ""));
  const inlineImages = options.inlineImages || parseInlineImages(normalizedMd);
  const affiliates = options.affiliates || parseAffiliates(normalizedMd);
  let h2Count = 0;

  const lines = normalizedMd.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let listItems = [];
  let orderedItems = [];
  let inBlockquote = false;
  let blockquoteLines = [];
  const headingIdCounts = new Map();

  function pushBlock(type, html, meta = {}) {
    blocks.push({ type, html, ...meta });
  }

  function flushParagraph() {
    if (!paragraph.length) return;
    pushBlock("paragraph", `<p>${inlineFormat(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function flushList() {
    if (!listItems.length) return;
    pushBlock("list", `<ul>${listItems.map((item) => `<li>${inlineFormat(item)}</li>`).join("")}</ul>`);
    listItems = [];
  }

  function flushOrdered() {
    if (!orderedItems.length) return;
    pushBlock("ordered", `<ol>${orderedItems.map((item) => `<li>${inlineFormat(item)}</li>`).join("")}</ol>`);
    orderedItems = [];
  }

  function flushBlockquote() {
    if (!inBlockquote) return;
    pushBlock("blockquote", `<blockquote><p>${inlineFormat(blockquoteLines.join(" "))}</p></blockquote>`);
    inBlockquote = false;
    blockquoteLines = [];
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushOrdered();
      flushBlockquote();
      continue;
    }

    if (parseInlineImageToken(trimmed) || parseAffiliateToken(trimmed)) {
      flushParagraph();
      flushList();
      flushOrdered();
      flushBlockquote();
      continue;
    }

    const tocMode = parseTocMode(trimmed);
    if (tocMode) {
      flushParagraph();
      flushList();
      flushOrdered();
      flushBlockquote();
      pushBlock("toc", "", { mode: tocMode });
      continue;
    }

    if (
      trimmed.includes("|") &&
      index + 1 < lines.length &&
      isMarkdownTableSeparatorRow(String(lines[index + 1] || "").trim())
    ) {
      flushParagraph();
      flushList();
      flushOrdered();
      flushBlockquote();

      const tableLines = [trimmed, String(lines[index + 1] || "").trim()];
      let rowIndex = index + 2;
      while (rowIndex < lines.length) {
        const rowTrimmed = String(lines[rowIndex] || "").trim();
        if (!rowTrimmed || !rowTrimmed.includes("|")) break;
        if (/^(#{1,4})\s+/.test(rowTrimmed)) break;
        if (/^>\s?/.test(rowTrimmed)) break;
        if (/^[-*]\s+/.test(rowTrimmed)) break;
        if (/^\d+\.\s+/.test(rowTrimmed)) break;
        if (parseInlineImageToken(rowTrimmed) || parseAffiliateToken(rowTrimmed)) break;
        if (parseTocMode(rowTrimmed)) break;
        tableLines.push(rowTrimmed);
        rowIndex += 1;
      }

      pushBlock("table", renderMarkdownTableFromLines(tableLines));
      index = rowIndex - 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      flushOrdered();
      flushBlockquote();
      const level = heading[1].length;
      const text = heading[2].trim();
      const baseId = slugifyHeading(text);
      const currentCount = headingIdCounts.get(baseId) || 0;
      headingIdCounts.set(baseId, currentCount + 1);
      const id = currentCount ? `${baseId}-${currentCount + 1}` : baseId;
      if (level === 2) {
        h2Count += 1;
        (affiliates.items || []).forEach((item, itemIndex) => {
          const target = Math.max(1, parseInt(item?.position || itemIndex + 1, 10) || itemIndex + 1);
          if (item?.enabled && h2Count === target) {
            pushBlock("affiliate", renderAffiliateHtml(item));
          }
        });
      }
      pushBlock("heading", `<h${level} id="${escapeHtml(id)}">${inlineFormat(text)}</h${level}>`, { level, text, id });
      if (level === 2) {
        const image1Target = Math.max(1, parseInt(inlineImages.image1?.position || 3, 10) || 3);
        const image2Target = Math.max(1, parseInt(inlineImages.image2?.position || 5, 10) || 5);
        if (h2Count === image1Target && inlineImages.image1?.enabled && (inlineImages.image1?.url || inlineImages.image1?.id)) {
          pushBlock("inline-image", renderInlineImageHtml(inlineImages.image1));
        }
        if (h2Count === image2Target && inlineImages.image2?.enabled && (inlineImages.image2?.url || inlineImages.image2?.id)) {
          pushBlock("inline-image", renderInlineImageHtml(inlineImages.image2));
        }
      }
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      flushList();
      flushOrdered();
      inBlockquote = true;
      blockquoteLines.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }

    const ul = trimmed.match(/^[-*]\s+(.*)$/);
    if (ul) {
      flushParagraph();
      flushOrdered();
      flushBlockquote();
      listItems.push(ul[1]);
      continue;
    }

    const ol = trimmed.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      flushParagraph();
      flushList();
      flushBlockquote();
      orderedItems.push(ol[1]);
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  flushOrdered();
  flushBlockquote();

  return blocks;
}

export function renderMarkdown(md = "", options = {}) {
  return renderMarkdownBlocks(md, options)
    .filter((block) => block.type !== "toc")
    .map((block) => block.html)
    .join("\n");
}
