import { escapeHtml } from "../../functions/_utils.js";

const TOC_TOKEN_RE = /^\[\[TOC(?::(h2|h2,h3))?\]\]$/i;

const INLINE_IMAGE_TOKEN_RE = /^\[\[(POST_IMAGE_[12])\s+(.+?)\]\]$/i;

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
    caption: String(attrs.caption || "").trim()
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
    image1: { enabled: false, url: "", alt: "", caption: "" },
    image2: { enabled: false, url: "", alt: "", caption: "" }
  };
  String(md || "").split("\n").forEach((line) => {
    const token = parseInlineImageToken(line);
    if (!token) return;
    const target = token.key === "POST_IMAGE_1" ? result.image1 : result.image2;
    target.enabled = !!token.url;
    target.url = token.url;
    target.alt = token.alt;
    target.caption = token.caption;
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
  const inlineImages = options.inlineImages || { image1: {}, image2: {} };
  let h2Count = 0;

  const lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
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

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      flushOrdered();
      flushBlockquote();
      continue;
    }

    if (parseInlineImageToken(trimmed)) {
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
      pushBlock("heading", `<h${level} id="${escapeHtml(id)}">${inlineFormat(text)}</h${level}>`, { level, text, id });
      if (level === 2) {
        h2Count += 1;
        if (h2Count === 3 && inlineImages.image1?.enabled && (inlineImages.image1?.url || inlineImages.image1?.id)) {
          pushBlock("inline-image", renderInlineImageHtml(inlineImages.image1));
        }
        if (h2Count === 5 && inlineImages.image2?.enabled && (inlineImages.image2?.url || inlineImages.image2?.id)) {
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
