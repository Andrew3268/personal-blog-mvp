const $ = (id) => document.getElementById(id);

function slugify(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-가-힣]/g, "")
    .replace(/\-+/g, "-");
}

function parseTags(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseKeywords(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((item, index, arr) => arr.indexOf(item) === index);
}


function normalizeCategoryName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

let categoryItems = [];
let editingCategoryName = "";

function getCurrentCategoryValue() {
  return $("category")?.value?.trim() || "";
}

function renderCategoryOptions(selectedValue = "") {
  const selectEl = $("category");
  if (!selectEl) return;
  const currentValue = normalizeCategoryName(selectedValue || getCurrentCategoryValue());
  const names = categoryItems.map((item) => normalizeCategoryName(item.name || item)).filter(Boolean);
  const uniqueNames = [...new Set(names)];
  if (currentValue && !uniqueNames.includes(currentValue)) uniqueNames.unshift(currentValue);
  selectEl.innerHTML = [
    '<option value="">카테고리 선택</option>',
    ...uniqueNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)
  ].join("");
  selectEl.value = currentValue || "";
}

function setCategoryManagerStatus(message = "", isError = false) {
  const statusEl = $("categoryManagerStatus");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b91c1c" : "";
}

function renderCategoryManagerList() {
  const listEl = $("categoryManagerList");
  if (!listEl) return;
  if (!categoryItems.length) {
    listEl.innerHTML = '<div class="category-manager__empty small">등록된 카테고리가 없습니다. 위 입력창에서 새 카테고리를 추가해 주세요.</div>';
    return;
  }

  listEl.innerHTML = categoryItems.map((item) => {
    const name = normalizeCategoryName(item.name || item);
    const isEditing = editingCategoryName === name;
    return `
      <div class="category-manager__item" data-category-item="${escapeHtml(name)}">
        <div>
          ${isEditing
            ? `<input class="input" data-category-edit-input="${escapeHtml(name)}" value="${escapeHtml(name)}" />`
            : `<div class="category-manager__name">${escapeHtml(name)}</div>`}
        </div>
        <div class="category-manager__actions">
          ${isEditing
            ? `
              <button class="btn btn--brand" type="button" data-category-save="${escapeHtml(name)}">저장</button>
              <button class="btn" type="button" data-category-cancel>취소</button>
            `
            : `
              <button class="btn" type="button" data-category-edit="${escapeHtml(name)}">수정</button>
              <button class="btn" type="button" data-category-delete="${escapeHtml(name)}">삭제</button>
            `}
        </div>
      </div>
    `;
  }).join("");
}

async function requestCategoryApi(method, payload = {}) {
  const res = await fetch('/api/categories', {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(payload)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || '카테고리 요청에 실패했습니다.');
  return json;
}

async function loadCategories(selectedValue = "") {
  try {
    const json = await requestCategoryApi('GET');
    categoryItems = Array.isArray(json.items) ? json.items : [];
    renderCategoryOptions(selectedValue);
    renderCategoryManagerList();
  } catch (error) {
    setCategoryManagerStatus(error.message || '카테고리를 불러오지 못했습니다.', true);
  }
}

function openCategoryModal() {
  const modal = $('categoryModal');
  const backdrop = $('categoryModalBackdrop');
  const openBtn = $('openCategoryModalBtn');
  if (!modal || !backdrop || !openBtn) return;
  backdrop.hidden = false;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  openBtn.setAttribute('aria-expanded', 'true');
  document.body.classList.add('has-preview-open');
  setCategoryManagerStatus('');
  $('newCategoryName')?.focus();
}

function closeCategoryModal() {
  const modal = $('categoryModal');
  const backdrop = $('categoryModalBackdrop');
  const openBtn = $('openCategoryModalBtn');
  if (!modal || !backdrop || !openBtn) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  backdrop.hidden = true;
  openBtn.setAttribute('aria-expanded', 'false');
  editingCategoryName = '';
  renderCategoryManagerList();
  document.body.classList.remove('has-preview-open');
}

async function addCategory() {
  const inputEl = $('newCategoryName');
  const name = normalizeCategoryName(inputEl?.value || '');
  if (!name) {
    setCategoryManagerStatus('카테고리 이름을 입력해 주세요.', true);
    inputEl?.focus();
    return;
  }
  try {
    const json = await requestCategoryApi('POST', { name });
    categoryItems = Array.isArray(json.items) ? json.items : categoryItems;
    renderCategoryOptions(name);
    renderCategoryManagerList();
    if (inputEl) inputEl.value = '';
    setCategoryManagerStatus('카테고리가 추가되었습니다.');
    handleRealtimeChange();
  } catch (error) {
    setCategoryManagerStatus(error.message || '카테고리 추가에 실패했습니다.', true);
  }
}

async function saveEditedCategory(currentName) {
  const inputEl = document.querySelector(`[data-category-edit-input="${CSS.escape(currentName)}"]`);
  const newName = normalizeCategoryName(inputEl?.value || '');
  if (!newName) {
    setCategoryManagerStatus('새 카테고리 이름을 입력해 주세요.', true);
    inputEl?.focus();
    return;
  }
  try {
    const json = await requestCategoryApi('PUT', { current_name: currentName, new_name: newName });
    const previousSelected = getCurrentCategoryValue();
    categoryItems = Array.isArray(json.items) ? json.items : categoryItems;
    editingCategoryName = '';
    renderCategoryOptions(previousSelected === currentName ? newName : previousSelected);
    renderCategoryManagerList();
    setCategoryManagerStatus('카테고리가 수정되었습니다.');
    handleRealtimeChange();
  } catch (error) {
    setCategoryManagerStatus(error.message || '카테고리 수정에 실패했습니다.', true);
  }
}

async function deleteCategory(name) {
  const ok = window.confirm(`'${name}' 카테고리를 삭제할까요?\n기존 글에 연결된 카테고리는 비워집니다.`);
  if (!ok) return;
  try {
    const json = await requestCategoryApi('DELETE', { name });
    const previousSelected = getCurrentCategoryValue();
    categoryItems = Array.isArray(json.items) ? json.items : categoryItems;
    editingCategoryName = '';
    renderCategoryOptions(previousSelected === name ? '' : previousSelected);
    renderCategoryManagerList();
    setCategoryManagerStatus('카테고리가 삭제되었습니다.');
    handleRealtimeChange();
  } catch (error) {
    setCategoryManagerStatus(error.message || '카테고리 삭제에 실패했습니다.', true);
  }
}

function bindCategoryManagerEvents() {
  $('openCategoryModalBtn')?.addEventListener('click', openCategoryModal);
  $('closeCategoryModalBtn')?.addEventListener('click', closeCategoryModal);
  $('categoryModalBackdrop')?.addEventListener('click', closeCategoryModal);
  $('addCategoryBtn')?.addEventListener('click', addCategory);
  $('newCategoryName')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addCategory();
    }
  });
  $('categoryManagerList')?.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    const editName = target.dataset.categoryEdit;
    const saveName = target.dataset.categorySave;
    const deleteName = target.dataset.categoryDelete;
    if (editName) {
      editingCategoryName = editName;
      renderCategoryManagerList();
      document.querySelector(`[data-category-edit-input="${CSS.escape(editName)}"]`)?.focus();
      return;
    }
    if (saveName) {
      saveEditedCategory(saveName);
      return;
    }
    if (deleteName) {
      deleteCategory(deleteName);
      return;
    }
    if (target.hasAttribute('data-category-cancel')) {
      editingCategoryName = '';
      renderCategoryManagerList();
    }
  });
}


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

function stripInlineImageTokenLines(md = "") {
  return String(md || "")
    .split("\n")
    .filter((line) => !parseInlineImageToken(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseInlineImageMetaFromMarkdown(md = "") {
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

function buildInlineImageToken(key, data) {
  if (!data || !data.enabled || !String((data.url || data.id || "")).trim()) return "";
  const safeUrl = String((data.url || data.id || "")).trim().replace(/"/g, "&quot;");
  const safeAlt = String(data.alt || "").trim().replace(/"/g, "&quot;");
  const safeCaption = String(data.caption || "").trim().replace(/"/g, "&quot;");
  return `[[${key} url="${safeUrl}" alt="${safeAlt}" caption="${safeCaption}"]]`;
}

function collectInlineImageFormData() {
  return {
    image1: {
      enabled: !!($("enableInlineImage1")?.checked),
      url: $("inlineImage1Id")?.value.trim() || "",
      alt: $("inlineImage1Alt")?.value.trim() || "",
      caption: $("inlineImage1Caption")?.value.trim() || ""
    },
    image2: {
      enabled: !!($("enableInlineImage2")?.checked),
      url: $("inlineImage2Id")?.value.trim() || "",
      alt: $("inlineImage2Alt")?.value.trim() || "",
      caption: $("inlineImage2Caption")?.value.trim() || ""
    }
  };
}

function applyInlineImageFormData(meta = {}) {
  const image1 = meta.image1 || {};
  const image2 = meta.image2 || {};
  if ($("enableInlineImage1")) $("enableInlineImage1").checked = !!image1.enabled;
  if ($("inlineImage1Id")) $("inlineImage1Id").value = image1.url || image1.id || "";
  if ($("inlineImage1Alt")) $("inlineImage1Alt").value = image1.alt || "";
  if ($("inlineImage1Caption")) $("inlineImage1Caption").value = image1.caption || "";
  if ($("enableInlineImage2")) $("enableInlineImage2").checked = !!image2.enabled;
  if ($("inlineImage2Id")) $("inlineImage2Id").value = image2.url || image2.id || "";
  if ($("inlineImage2Alt")) $("inlineImage2Alt").value = image2.alt || "";
  if ($("inlineImage2Caption")) $("inlineImage2Caption").value = image2.caption || "";
  syncInlineImageVisibility();
}

function syncInlineImageVisibility() {
  [["enableInlineImage1", "inlineImage1Fields"], ["enableInlineImage2", "inlineImage2Fields"]].forEach(([toggleId, fieldId]) => {
    const toggle = $(toggleId);
    const field = $(fieldId);
    if (!toggle || !field) return;
    field.hidden = !toggle.checked;
  });
}

function buildContentWithInlineImageTokens(md = "") {
  const cleanMd = stripInlineImageTokenLines(md);
  const meta = collectInlineImageFormData();
  const tokens = [
    buildInlineImageToken("POST_IMAGE_1", meta.image1),
    buildInlineImageToken("POST_IMAGE_2", meta.image2)
  ].filter(Boolean);
  return [...tokens, cleanMd].filter(Boolean).join("\n\n").trim();
}

function renderInlineImageFigure(data = {}, index = 1) {
  const imageUrl = String((data.url || data.id || "")).trim();
  if (!imageUrl) return "";
  const alt = String(data.alt || `본문 이미지 ${index}`).trim();
  const caption = String(data.caption || "").trim();
  return `
    <figure class="preview-inline-image">
      <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
      ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
    </figure>
  `;
}


function parseTocModeFromLine(line) {
  const match = String(line || "").trim().match(TOC_TOKEN_RE);
  return match ? (match[1] || "h2").toLowerCase() : null;
}

function stripTocTokenLines(md) {
  return String(md || "")
    .split("\n")
    .filter((line) => !parseTocModeFromLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildHeadingSlug(text, slugCounts) {
  const base = String(text || "")
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^a-z0-9\-가-힣\s]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "section";
  const currentCount = slugCounts.get(base) || 0;
  slugCounts.set(base, currentCount + 1);
  return currentCount ? `${base}-${currentCount + 1}` : base;
}

function extractTocItems(md, mode = "h2") {
  const includeH3 = mode === "h2,h3";
  const lines = String(md || "").replace(/\r/g, "").split("\n");
  const slugCounts = new Map();
  const items = [];
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const headingMatch = trimmed.match(/^(#{2,3})\s+(.+)$/);
    if (!headingMatch) continue;
    const level = headingMatch[1].length;
    if (level === 3 && !includeH3) continue;
    const textValue = headingMatch[2].trim();
    const id = buildHeadingSlug(textValue, slugCounts);
    items.push({ level, text: textValue, id });
  }
  return items;
}

function renderTocHtml(items, mode = "h2") {
  if (!items.length) return "";
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

function getSelectedTocMode() {
  return $("includeTocH3")?.checked ? "h2,h3" : "h2";
}

function renderPreviewTocPlaceholder(mode = "h2") {
  const label = mode === "h2,h3" ? "H2 + H3 포함" : "H2만 포함";
  return `<div class="preview-toc-placeholder"><span>목차가 여기에 표시됩니다</span><span class="preview-toc-placeholder__meta">${label}</span></div>`;
}

function insertTocTokenAtIdealPosition(md, mode = "h2") {
  const token = `[[TOC:${mode}]]`;
  const clean = stripTocTokenLines(md || "");
  if (!clean) return `${token}\n\n`;

  const lines = clean.replace(/\r/g, "").split("\n");
  const firstH2Index = lines.findIndex((line) => /^##\s+/.test(line.trim()));

  if (firstH2Index > -1) {
    const before = lines.slice(0, firstH2Index).join("\n").replace(/\s+$/, "");
    const after = lines.slice(firstH2Index).join("\n").replace(/^\s+/, "");
    return `${before}\n\n${token}\n\n${after}`.replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n");
  }

  const blocks = clean.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length <= 1) return `${token}\n\n${clean}`;
  return `${blocks[0]}\n\n${token}\n\n${blocks.slice(1).join("\n\n")}`.replace(/\n{3,}/g, "\n\n");
}

function applyTocControls() {
  const contentEl = $("content_md");
  const statusEl = $("tocStatus");
  const enableTocEl = $("enableToc");
  if (!contentEl || !enableTocEl) return;

  if (!enableTocEl.checked) {
    contentEl.value = stripTocTokenLines(contentEl.value || "");
    if (statusEl) statusEl.textContent = "목차가 제거되었습니다.";
    handleRealtimeChange();
    return;
  }

  const mode = getSelectedTocMode();
  const items = extractTocItems(contentEl.value || "", mode);
  if (!items.length) {
    enableTocEl.checked = false;
    if (statusEl) statusEl.textContent = mode === "h2,h3" ? "H2 또는 H3 소제목이 있어야 목차를 만들 수 있습니다." : "H2 소제목이 있어야 목차를 만들 수 있습니다.";
    handleRealtimeChange();
    return;
  }

  contentEl.value = insertTocTokenAtIdealPosition(contentEl.value || "", mode);
  if (statusEl) statusEl.textContent = `목차가 적용되었습니다. (${mode === "h2,h3" ? "H2 + H3" : "H2만"})`;
  handleRealtimeChange();
}

function syncTocControlsFromContent() {
  const contentEl = $("content_md");
  const enableTocEl = $("enableToc");
  const includeTocH3El = $("includeTocH3");
  if (!contentEl || !enableTocEl || !includeTocH3El) return;
  const mode = String(contentEl.value || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => parseTocModeFromLine(line))
    .find(Boolean) || null;
  enableTocEl.checked = !!mode;
  includeTocH3El.checked = mode === "h2,h3";
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

function countText(value) {
  return String(value || "").length;
}

function countTextWithoutSpaces(value) {
  return String(value || "").replace(/\s/g, "").length;
}

function setCountState(outputEl, value, min, max) {
  if (!outputEl) return;
  outputEl.classList.remove("is-good", "is-warn", "is-bad");
  if (!value) {
    outputEl.classList.add("is-bad");
    return;
  }
  if (value >= min && value <= max) {
    outputEl.classList.add("is-good");
    return;
  }
  outputEl.classList.add(value >= Math.max(1, Math.floor(min * 0.7)) ? "is-warn" : "is-bad");
}

function updateCount(inputId, outputId) {
  const inputEl = $(inputId);
  const outputEl = $(outputId);
  if (!inputEl || !outputEl) return;
  const includedValue = countText(inputEl.value);
  const excludedValue = countTextWithoutSpaces(inputEl.value);
  outputEl.textContent = `공백 포함 ${includedValue}자 / 제외 ${excludedValue}자`;

  if (outputId === "titleCount") setCountState(outputEl, excludedValue, 20, 60);
  else if (outputId === "metaDescriptionCount") setCountState(outputEl, excludedValue, 70, 160);
  else outputEl.classList.remove("is-good", "is-warn", "is-bad");
}

function updateAllCounts() {
  updateCount("title", "titleCount");
  updateCount("meta_description", "metaDescriptionCount");
  updateCount("summary", "summaryCount");
  updateCount("content_md", "contentCount");
  updateCount("faq_md", "faqCount");
}

function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

function updateSlugPreview() {
  const title = $("title").value.trim();
  const slugEl = $("slug");
  const slugValue = slugEl && slugEl.value.trim() ? slugEl.value.trim() : (title ? slugify(title) : "");
  $("slugPreview").value = slugValue;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function stripMarkdown(md) {
  return String(md || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/^>\s?/gm, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[\-*_[\]()`>#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getHeadings(md, level) {
  const re = new RegExp(`^#{${level}}\\s+(.+)$`, "gm");
  const results = [];
  let match;
  while ((match = re.exec(String(md || ""))) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

function getLinks(md) {
  const re = /\[[^\]]+\]\((https?:\/\/[^)]+|\/[^)]+)\)/g;
  const results = [];
  let match;
  while ((match = re.exec(String(md || ""))) !== null) {
    results.push(match[1]);
  }
  return results;
}

function getImages(md) {
  const re = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const results = [];
  let match;
  while ((match = re.exec(String(md || ""))) !== null) {
    results.push({ alt: String(match[1] || "").trim(), src: match[2] });
  }
  return results;
}

function countKeywordOccurrences(text, keyword) {
  const source = normalizeText(text).toLowerCase();
  const target = normalizeText(keyword).toLowerCase();
  if (!source || !target) return 0;
  return source.split(target).length - 1;
}

function getFirstParagraph(md) {
  const parts = String(md || "")
    .split(/\n\s*\n/)
    .map((s) => stripMarkdown(s))
    .map((s) => s.trim())
    .filter(Boolean);
  return parts[0] || "";
}

function containsKeyword(text, keyword) {
  return normalizeText(text).toLowerCase().includes(normalizeText(keyword).toLowerCase());
}

function evaluateLongtailKeywords(texts, keywords) {
  if (!keywords.length) {
    return { count: 0, total: 0, missing: [], matched: [] };
  }

  const matched = keywords.filter((keyword) => texts.some((text) => containsKeyword(text, keyword)));
  const missing = keywords.filter((keyword) => !matched.includes(keyword));

  return { count: matched.length, total: keywords.length, missing, matched };
}

function evaluateStuffing(keyword, contentText) {
  if (!keyword) {
    return {
      status: "warn",
      detail: "메인 키워드를 입력하면 과다 반복 여부를 계산합니다."
    };
  }

  const occurrence = countKeywordOccurrences(contentText, keyword);
  const sourceLen = normalizeText(contentText).length;
  const keywordLen = normalizeText(keyword).length || 1;
  const ratio = sourceLen > 0 ? ((occurrence * keywordLen) / sourceLen) * 100 : 0;

  let status = "good";
  if (occurrence === 0) status = "bad";
  else if (ratio > 3.5 || occurrence > 20) status = "bad";
  else if (ratio > 2.2 || occurrence > 14) status = "warn";

  return {
    status,
    detail: `본문 내 ${occurrence}회 · 추정 밀도 ${ratio.toFixed(2)}% · 권장 0.5~2.2% 정도`
  };
}

function getImageSeoData(contentMd, coverImage, coverImageAlt, focusKeyword) {
  const bodyImages = getImages(contentMd);
  const bodyImagesWithoutAlt = bodyImages.filter((img) => !img.alt).length;
  const bodyAlts = bodyImages.map((img) => img.alt).filter(Boolean);
  const hasCoverImage = !!String(coverImage || "").trim();
  const hasCoverAlt = !!String(coverImageAlt || "").trim();
  const allAlts = [
    ...(hasCoverAlt ? [String(coverImageAlt).trim()] : []),
    ...bodyAlts
  ];
  const totalImages = bodyImages.length + (hasCoverImage ? 1 : 0);
  const missingAltCount = bodyImagesWithoutAlt + (hasCoverImage && !hasCoverAlt ? 1 : 0);
  const keywordIncludedInAlt = focusKeyword
    ? allAlts.some((alt) => containsKeyword(alt, focusKeyword))
    : false;

  let status = "warn";
  let detail = "대표 이미지나 본문 이미지가 없습니다.";
  if (totalImages > 0) {
    status = missingAltCount === 0 ? "good" : "bad";
    detail = `대표 이미지 ${hasCoverImage ? 1 : 0}개${hasCoverImage ? ` · ALT ${hasCoverAlt ? "입력 완료" : "누락"}` : ""} · 본문 이미지 ${bodyImages.length}개 · ALT 누락 ${bodyImagesWithoutAlt}개`;
  }

  return {
    totalImages,
    hasCoverImage,
    hasCoverAlt,
    bodyImages,
    bodyImagesWithoutAlt,
    keywordIncludedInAlt,
    status,
    detail
  };
}

function groupSeoChecks(checks) {
  const order = ["basic", "keywords", "structure", "media"];
  const grouped = {
    basic: [],
    keywords: [],
    structure: [],
    media: []
  };

  checks.forEach((item) => {
    const key = grouped[item.group] ? item.group : "basic";
    grouped[key].push(item);
  });

  return order
    .map((key) => {
      const items = grouped[key];
      const baseLabel = key === "basic" ? "기본" : key === "keywords" ? "키워드" : key === "structure" ? "구조/링크" : "이미지/FAQ";
      const hasPassingItem = items.some((item) => item.status === "good");
      return {
        key,
        label: hasPassingItem ? baseLabel : `${baseLabel} !`,
        items
      };
    })
    .filter((group) => group.items.length);
}

function evaluateSeo() {
  const title = $("title").value.trim();
  const slug = $("slugPreview").value.trim();
  const metaDescription = $("meta_description").value.trim();
  const summary = $("summary").value.trim();
  const contentMd = $("content_md").value || "";
  const inlineImages = collectInlineImageFormData();
  const contentLengthWithoutSpaces = countTextWithoutSpaces(contentMd);
  const previewAdPositions = getPreviewAdInsertPositions(contentMd, contentLengthWithoutSpaces);
  const faqMd = $("faq_md")?.value || "";
  const faqItems = parseFaqMarkdown(faqMd);
  const focusKeyword = $("focusKeyword")?.value.trim() || "";
  const longtailKeywords = parseKeywords($("longtailKeywords")?.value || "");
  const coverImage = $("cover_image")?.value.trim() || "";
  const coverImageAlt = $("cover_image_alt")?.value.trim() || "";

  const plainContent = stripMarkdown(contentMd);
  const titleLen = countText(title);
  const metaLen = countText(metaDescription);
  const summaryLen = countText(summary);
  const contentLen = countText(plainContent);
  const bodyH1List = getHeadings(contentMd, 1);
  const h2List = getHeadings(contentMd, 2);
  const h3List = getHeadings(contentMd, 3);
  const links = getLinks(contentMd);
  const internalLinks = links.filter((href) => href.startsWith("/")).length;
  const externalLinks = links.filter((href) => /^https?:\/\//.test(href)).length;
  const imageSeo = getImageSeoData(contentMd, coverImage, coverImageAlt, focusKeyword);
  const firstParagraph = getFirstParagraph(contentMd);
  const keywordInTitle = focusKeyword ? containsKeyword(title, focusKeyword) : false;
  const keywordInMeta = focusKeyword ? containsKeyword(metaDescription, focusKeyword) : false;
  const keywordInSummary = focusKeyword ? containsKeyword(summary, focusKeyword) : false;
  const keywordInSlug = focusKeyword ? containsKeyword(slug, slugify(focusKeyword)) : false;
  const keywordInFirstParagraph = focusKeyword ? containsKeyword(firstParagraph, focusKeyword) : false;
  const h2KeywordCount = focusKeyword ? h2List.filter((h) => containsKeyword(h, focusKeyword)).length : 0;
  const h3KeywordCount = focusKeyword ? h3List.filter((h) => containsKeyword(h, focusKeyword)).length : 0;
  const keywordInH2 = h2KeywordCount > 0;
  const keywordCount = focusKeyword ? countKeywordOccurrences(plainContent, focusKeyword) : 0;
  const longtailResult = evaluateLongtailKeywords(
    [plainContent],
    longtailKeywords
  );
  const stuffingResult = evaluateStuffing(focusKeyword, plainContent);

  const checks = [
    {
      key: "titleLength",
      group: "basic",
      label: "제목 길이",
      status: titleLen >= 20 && titleLen <= 60 ? "good" : titleLen >= 14 ? "warn" : "bad",
      detail: `현재 ${titleLen}자 · 권장 20~60자`
    },
    {
      key: "metaLength",
      group: "basic",
      label: "메타 디스크립션 길이",
      status: metaLen >= 70 && metaLen <= 160 ? "good" : metaLen >= 40 ? "warn" : "bad",
      detail: `현재 ${metaLen}자 · 권장 70~160자`
    },
    {
      key: "summaryLength",
      group: "basic",
      label: "요약문 길이",
      status: summaryLen >= 40 && summaryLen <= 140 ? "good" : summaryLen >= 20 ? "warn" : "bad",
      detail: `현재 ${summaryLen}자 · 권장 40~140자`
    },
    {
      key: "contentLength",
      group: "basic",
      label: "본문 길이",
      status: contentLen >= 1200 ? "good" : contentLen >= 500 ? "warn" : "bad",
      detail: `현재 ${contentLen}자 · 권장 1,200자 이상`
    },
    {
      key: "h1Count",
      group: "structure",
      label: "H1 구조",
      status: title ? (bodyH1List.length === 0 ? "good" : "warn") : "bad",
      detail: title
        ? bodyH1List.length === 0
          ? "제목 입력값이 공개 페이지의 H1로 사용됩니다. 본문 내 추가 H1이 없어 좋습니다."
          : `제목이 H1로 사용되며, 본문에 H1이 ${bodyH1List.length}개 더 있어 보완이 필요합니다.`
        : "제목이 비어 있어 공개 페이지 H1이 없습니다."
    },
    {
      key: "h2Count",
      group: "structure",
      label: "H2 소제목 구조",
      status: h2List.length >= 2 ? "good" : h2List.length === 1 ? "warn" : "bad",
      detail: `현재 ${h2List.length}개 · 권장 2개 이상`
    },
    {
      key: "h3Count",
      group: "structure",
      label: "H3 소제목 구조",
      status: h3List.length >= 2 ? "good" : "warn",
      detail: `현재 ${h3List.length}개 · 세부 구조 정리에 도움`
    },
    {
      key: "internalLinks",
      group: "structure",
      label: "내부 링크",
      status: internalLinks >= 1 ? "good" : "warn",
      detail: `현재 ${internalLinks}개 · 관련 글 링크 1개 이상 권장`
    },
    {
      key: "externalLinks",
      group: "structure",
      label: "외부 링크",
      status: externalLinks >= 1 ? "good" : "warn",
      detail: `현재 ${externalLinks}개 · 근거 링크가 있으면 신뢰도에 도움`
    },
    {
      key: "faqCount",
      group: "media",
      label: "FAQ 입력 여부",
      status: faqItems.length >= 4 ? "good" : faqItems.length >= 1 ? "warn" : "warn",
      detail: faqItems.length
        ? `FAQ ${faqItems.length}개 인식됨 · 입력된 FAQ만 공개 페이지와 FAQPage JSON-LD에 반영됩니다.`
        : "FAQ를 입력하지 않으면 FAQ 섹션과 FAQPage JSON-LD가 생성되지 않습니다."
    },
    {
      key: "imageAlt",
      group: "media",
      label: "이미지 ALT 텍스트",
      status: imageSeo.status,
      detail: imageSeo.detail
    }
  ];

  if (!focusKeyword) {
    checks.push(
      {
        key: "focusKeywordMissing",
        group: "keywords",
        label: "메인 키워드 설정",
        status: "bad",
        detail: "메인 키워드를 입력해야 핵심 SEO 점검이 활성화됩니다."
      },
      {
        key: "keywordStuffing",
        group: "keywords",
        label: "키워드 스터핑 체크",
        status: stuffingResult.status,
        detail: stuffingResult.detail
      }
    );
  } else {
    checks.push(
      {
        key: "keywordTitle",
        group: "keywords",
        label: "메인 키워드 - 제목 포함",
        status: keywordInTitle ? "good" : "bad",
        detail: keywordInTitle ? "제목에 메인 키워드가 포함되어 있습니다." : "제목에 메인 키워드를 포함하세요."
      },
      {
        key: "keywordMeta",
        group: "keywords",
        label: "메인 키워드 - 메타 디스크립션 포함",
        status: keywordInMeta ? "good" : "warn",
        detail: keywordInMeta ? "메타 디스크립션에 메인 키워드가 포함되어 있습니다." : "메타 디스크립션에 메인 키워드를 넣어보세요."
      },
      {
        key: "keywordSummary",
        group: "keywords",
        label: "메인 키워드 - 요약문 포함",
        status: keywordInSummary ? "good" : "warn",
        detail: keywordInSummary ? "요약문에 메인 키워드가 포함되어 있습니다." : "요약문에도 메인 키워드를 자연스럽게 넣어보세요."
      },
      {
        key: "keywordSlug",
        group: "keywords",
        label: "메인 키워드 - 슬러그 포함",
        status: keywordInSlug ? "good" : "warn",
        detail: keywordInSlug ? "슬러그에도 키워드가 반영되어 있습니다." : "슬러그에 키워드가 드러나면 더 좋습니다."
      },
      {
        key: "keywordIntro",
        group: "keywords",
        label: "메인 키워드 - 첫 문단 포함",
        status: keywordInFirstParagraph ? "good" : "bad",
        detail: keywordInFirstParagraph ? "첫 문단에 메인 키워드가 포함되어 있습니다." : "첫 문단 초반에 메인 키워드를 포함하세요."
      },
      {
        key: "keywordH2",
        group: "keywords",
        label: "메인 키워드 - 소제목 포함",
        status: keywordInH2 ? "good" : "warn",
        detail: keywordInH2 ? "H2 소제목에 키워드가 반영되어 있습니다." : "H2 소제목 중 하나에 키워드를 포함하면 좋습니다."
      },
      {
        key: "keywordDensity",
        group: "keywords",
        label: "메인 키워드 언급 횟수",
        status: keywordCount >= 3 && keywordCount <= 12 ? "good" : keywordCount >= 1 ? "warn" : "bad",
        detail: `본문 내 ${keywordCount}회 언급 · 권장 3~12회`
      },
      {
        key: "keywordHeadingCoverage",
        group: "structure",
        label: "H2/H3 메인 키워드 포함 수",
        status: (h2KeywordCount + h3KeywordCount) >= 2 ? "good" : (h2KeywordCount + h3KeywordCount) >= 1 ? "warn" : "bad",
        detail: `H2 ${h2List.length}개 중 ${h2KeywordCount}개 · H3 ${h3List.length}개 중 ${h3KeywordCount}개에 메인 키워드가 포함되어 있습니다.`
      },
      {
        key: "keywordStuffing",
        group: "keywords",
        label: "키워드 스터핑 체크",
        status: stuffingResult.status,
        detail: stuffingResult.detail
      }
    );
  }

  if (!longtailKeywords.length) {
    checks.push({
      key: "longtailKeywords",
      group: "keywords",
      label: "롱테일 키워드 설정",
      status: "warn",
      detail: "롱테일 키워드를 콤마로 입력하면 포함 여부를 함께 점검합니다."
    });
  } else {
    checks.push({
      key: "longtailCoverage",
      group: "keywords",
      label: "롱테일 키워드 본문 포함 여부",
      status: longtailResult.count === longtailResult.total ? "good" : longtailResult.count >= 1 ? "warn" : "bad",
      detail: longtailResult.count === longtailResult.total
        ? `${longtailResult.total}개 모두 본문에 포함되었습니다.`
        : `총 ${longtailResult.total}개 중 ${longtailResult.count}개 포함 · 미포함: ${longtailResult.missing.join(", ")}`
    });
  }

  return checks;
}

function getScoreSummary(checks) {
  const weights = { good: 10, warn: 6, bad: 0 };
  const total = checks.reduce((sum, item) => sum + (weights[item.status] || 0), 0);
  const max = checks.length * 10 || 10;
  const score = Math.round((total / max) * 100);

  let grade = "점검 필요";
  if (score >= 85) grade = "매우 좋음";
  else if (score >= 70) grade = "좋음";
  else if (score >= 50) grade = "보통";

  return { score, grade };
}

function renderSeoChecklist(activeGroupKey) {
  const tabsWrap = $("seoTabs");
  const wrap = $("seoChecklist");
  const scoreEl = $("seoScore");
  const gradeEl = $("seoGrade");
  if (!wrap || !scoreEl || !gradeEl) return;

  const checks = evaluateSeo();
  const groups = groupSeoChecks(checks);
  const selectedGroup = groups.find((group) => group.key === activeGroupKey) || groups[0];
  const { score, grade } = getScoreSummary(checks);

  scoreEl.textContent = String(score);
  gradeEl.textContent = grade;
  scoreEl.dataset.grade = grade;

  if (tabsWrap) {
    tabsWrap.innerHTML = groups.map((group) => `
      <button class="seo-tab ${selectedGroup && selectedGroup.key === group.key ? "is-active" : ""}" type="button" data-seo-group="${group.key}">${group.label}</button>
    `).join("");

    tabsWrap.querySelectorAll("[data-seo-group]").forEach((button) => {
      button.addEventListener("click", () => renderSeoChecklist(button.dataset.seoGroup || "basic"));
    });
  }

  wrap.innerHTML = (selectedGroup?.items || checks).map((item) => {
    const icon = item.status === "good" ? "통과" : item.status === "warn" ? "보완" : "부족";
    return `
      <div class="seo-check seo-check--${item.status}">
        <div class="seo-check__head">
          <strong>${item.label}</strong>
          <span class="seo-pill seo-pill--${item.status}">${icon}</span>
        </div>
        <div class="small">${item.detail}</div>
      </div>
    `;
  }).join("");
}

function inlineFormat(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function getPreviewAdInsertPositions(md, contentLengthWithoutSpaces) {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  const h2Lines = [];
  let nonEmptyCount = 0;
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    nonEmptyCount += 1;
    if (/^##\s+/.test(trimmed)) h2Lines.push(index);
  });

  const positions = [];
  if (h2Lines.length) {
    positions.push(h2Lines[0]);
    if (contentLengthWithoutSpaces >= 2000 && h2Lines.length >= 3) positions.push(h2Lines[2]);
    return positions;
  }

  if (nonEmptyCount > 0) {
    positions.push(Math.max(1, Math.floor(nonEmptyCount * 0.42)));
    if (contentLengthWithoutSpaces >= 2000) positions.push(Math.max(2, Math.floor(nonEmptyCount * 0.74)));
  }
  return positions;
}

function renderPreviewAdBox(index) {
  return `
    <div class="post-ad post-ad--inline post-ad--placeholder" aria-label="본문 광고 ${index + 1}">
      <div class="post-ad__placeholder-title">본문 광고 ${index + 1}</div>
      <div class="small">실제 페이지에서는 화면 근처에서만 지연 로드됩니다.</div>
    </div>
  `;
}

function markdownToHtml(md, options = {}) {
  const inlineImages = options.inlineImages || parseInlineImageMetaFromMarkdown(md);
  const sourceMd = stripInlineImageTokenLines(String(md || "").replace(/\r/g, ""));
  const lines = sourceMd.split("\n");
  const tocModeInContent = lines.map((line) => parseTocModeFromLine(line)).find(Boolean) || null;
  const tocItems = tocModeInContent ? extractTocItems(sourceMd, tocModeInContent) : [];
  const htmlParts = [];
  let inUl = false;
  let inOl = false;
  let inBlockquote = false;
  const slugCounts = new Map();
  const adPositions = Array.isArray(options.adPositions) ? [...options.adPositions] : [];
  let contentBlockCount = 0;
  let adPointer = 0;
  let h2Count = 0;

  function maybeInsertAd() {
    while (options.showAds && adPointer < adPositions.length && adPositions[adPointer] === contentBlockCount) {
      htmlParts.push(renderPreviewAdBox(adPointer));
      adPointer += 1;
    }
  }

  function closeLists() {
    if (inUl) {
      htmlParts.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      htmlParts.push("</ol>");
      inOl = false;
    }
  }

  function closeQuote() {
    if (inBlockquote) {
      htmlParts.push("</blockquote>");
      inBlockquote = false;
    }
  }

  function pushContentBlock(html) {
    maybeInsertAd();
    htmlParts.push(html);
    contentBlockCount += 1;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      closeLists();
      closeQuote();
      continue;
    }

    const tocMode = parseTocModeFromLine(line);
    if (tocMode) {
      closeLists();
      closeQuote();
      pushContentBlock(tocItems.length ? renderTocHtml(tocItems, tocMode) : renderPreviewTocPlaceholder(tocMode));
      continue;
    }

    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      closeLists();
      closeQuote();
      pushContentBlock(`<figure class="preview-figure"><img src="${escapeHtml(imageMatch[2])}" alt="${escapeHtml(imageMatch[1])}" loading="lazy"></figure>`);
      continue;
    }

    const headingMatch = line.match(/^(#{2,6})\s+(.+)$/);
    if (headingMatch) {
      closeLists();
      closeQuote();
      const level = Math.min(6, headingMatch[1].length);
      const headingText = headingMatch[2].trim();
      const headingId = buildHeadingSlug(headingText, slugCounts);
      pushContentBlock(`<h${level} id="${escapeHtml(headingId)}">${inlineFormat(headingText)}</h${level}>`);
      if (level === 2) {
        h2Count += 1;
        if (h2Count === 3 && inlineImages.image1?.enabled && (inlineImages.image1?.url || inlineImages.image1?.id)) {
          pushContentBlock(renderInlineImageFigure(inlineImages.image1, 1));
        }
        if (h2Count === 5 && inlineImages.image2?.enabled && (inlineImages.image2?.url || inlineImages.image2?.id)) {
          pushContentBlock(renderInlineImageFigure(inlineImages.image2, 2));
        }
      }
      continue;
    }

    if (/^>\s?/.test(line)) {
      closeLists();
      if (!inBlockquote) {
        maybeInsertAd();
        htmlParts.push("<blockquote>");
        inBlockquote = true;
      }
      htmlParts.push(`<p>${inlineFormat(line.replace(/^>\s?/, ""))}</p>`);
      contentBlockCount += 1;
      continue;
    }

    const ulMatch = line.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      closeQuote();
      if (!inUl) {
        closeLists();
        maybeInsertAd();
        htmlParts.push("<ul>");
        inUl = true;
      }
      htmlParts.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      contentBlockCount += 1;
      continue;
    }

    const olMatch = line.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      closeQuote();
      if (!inOl) {
        closeLists();
        maybeInsertAd();
        htmlParts.push("<ol>");
        inOl = true;
      }
      htmlParts.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      contentBlockCount += 1;
      continue;
    }

    closeLists();
    closeQuote();
    pushContentBlock(`<p>${inlineFormat(line)}</p>`);
  }

  closeLists();
  closeQuote();

  while (options.showAds && adPointer < adPositions.length) {
    htmlParts.push(renderPreviewAdBox(adPointer));
    adPointer += 1;
  }

  const html = htmlParts.join("");
  return html || '<p class="preview-empty">본문을 입력하면 여기에 미리보기가 표시됩니다.</p>';
}

function renderPreview() {
  const previewEl = $("previewContent");
  if (!previewEl) return;

  const title = $("title").value.trim() || "제목을 입력해 주세요";
  const category = $("category").value.trim();
  const summary = $("summary").value.trim();
  const metaDescription = $("meta_description").value.trim();
  const coverImage = $("cover_image").value.trim();
  const coverImageAlt = $("cover_image_alt")?.value.trim() || "";
  const contentMd = $("content_md").value || "";
  const inlineImages = collectInlineImageFormData();
  const contentLengthWithoutSpaces = countTextWithoutSpaces(contentMd);
  const previewAdPositions = getPreviewAdInsertPositions(contentMd, contentLengthWithoutSpaces);
  const faqMd = $("faq_md")?.value || "";
  const faqItems = parseFaqMarkdown(faqMd);
  const tags = parseTags($("tags").value);
  const slug = $("slugPreview").value.trim();
  const snippetUrl = slug ? `https://personal-blog-mvp.pages.dev/post/${slug}` : 'https://personal-blog-mvp.pages.dev/post/slug-example';

  previewEl.innerHTML = `
    <article class="preview-article">
      <section class="preview-snippet" aria-label="SEO 스니펫 미리보기">
        <div class="small preview-snippet__label">SEO 스니펫 미리보기</div>
        <div class="preview-snippet__title">${escapeHtml(title)}</div>
        <div class="preview-snippet__url">${escapeHtml(snippetUrl)}</div>
        <div class="preview-snippet__desc">${escapeHtml(metaDescription || summary || '메타디스크립션을 입력하면 검색 결과 설명이 여기에 표시됩니다.')}</div>
      </section>

      <div class="preview-post-card">
      <header class="preview-article__head">
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px">
          ${category ? `<span class="badge">${escapeHtml(category)}</span>` : '<span class="badge">미분류</span>'}
          <span class="small">${new Date().toISOString().slice(0, 10)}</span>
        </div>
        <h1 class="preview-title">${escapeHtml(title)}</h1>
        ${summary ? `<p class="preview-summary">${escapeHtml(summary)}</p>` : ""}
        ${tags.length ? `<div class="row">${tags.map((tag) => `<span class="tag-chip">#${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
      </header>
      ${coverImage ? `<img class="preview-cover" src="${escapeHtml(coverImage)}" alt="${escapeHtml(coverImageAlt || `${title} 대표 이미지`)}" loading="lazy">` : ""}
      <section class="preview-body">${markdownToHtml(contentMd, { adPositions: previewAdPositions, showAds: true, inlineImages })}</section>
      ${faqItems.length ? `
        <section class="preview-faq" aria-label="자주 묻는 질문">
          <h2>자주 묻는 질문</h2>
          <div class="preview-faq__list">
            ${faqItems.map((item) => `
              <article class="preview-faq__item">
                <h3>Q. ${escapeHtml(item.question)}</h3>
                <div class="preview-faq__answer">${markdownToHtml(item.answerMd)}</div>
              </article>
            `).join("")}
          </div>
        </section>
      ` : ""}
    </div>
    </article>
  `;
}

function openPreview() {
  const drawer = $("previewDrawer");
  const backdrop = $("previewBackdrop");
  const openBtn = $("previewOpenBtn");
  if (!drawer || !backdrop || !openBtn) return;
  renderPreview();
  backdrop.hidden = false;
  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  openBtn.setAttribute("aria-expanded", "true");
  document.body.classList.add("has-preview-open");
}

function closePreview() {
  const drawer = $("previewDrawer");
  const backdrop = $("previewBackdrop");
  const openBtn = $("previewOpenBtn");
  if (!drawer || !backdrop || !openBtn) return;
  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
  openBtn.setAttribute("aria-expanded", "false");
  document.body.classList.remove("has-preview-open");
}

function setPreviewDevice(device) {
  const stage = $("previewStage");
  const frame = $("previewFrame");
  if (!stage || !frame) return;
  stage.dataset.device = device;
  frame.classList.remove("preview-frame--pc", "preview-frame--tablet", "preview-frame--mobile");
  frame.classList.add(`preview-frame--${device}`);
  document.querySelectorAll("[data-preview-width]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.previewWidth === device);
  });
}

async function load() {
  const slug = qs("slug");
  const statusEl = $("saveStatus");

  if (!slug) {
    statusEl.textContent = "slug 파라미터가 없습니다.";
    return;
  }

  statusEl.textContent = "불러오는 중…";

  const res = await fetch(`/api/posts/${encodeURIComponent(slug)}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    statusEl.textContent = json?.message || "불러오기 실패";
    return;
  }

  const item = json.item || {};
  $("slug").value = item.slug || slug;
  $("published_at").value = item.published_at || "";
  $("updated_at").value = item.updated_at || "";
  $("title").value = item.title || "";
  const loadedCategory = item.category || "";
  $("meta_description").value = item.meta_description || "";
  $("summary").value = item.summary || "";
  $("cover_image").value = item.cover_image || "";
  if ($("cover_image_alt")) $("cover_image_alt").value = item.cover_image_alt || "";
  if ($("focusKeyword")) $("focusKeyword").value = item.focus_keyword || "";
  let longtailKeywords = [];
  try { longtailKeywords = JSON.parse(item.longtail_keywords_json || "[]"); } catch {}
  if ($("longtailKeywords")) $("longtailKeywords").value = Array.isArray(longtailKeywords) ? longtailKeywords.join(", ") : "";
  $("status").value = item.status || "published";
  if ($("enable_sidebar_ad")) $("enable_sidebar_ad").checked = !(String(item.enable_sidebar_ad ?? 1) === "0");
  if ($("enable_inarticle_ads")) $("enable_inarticle_ads").checked = !(String(item.enable_inarticle_ads ?? 1) === "0");
  const rawContentMd = item.content_md || "";
  applyInlineImageFormData(parseInlineImageMetaFromMarkdown(rawContentMd));
  $("content_md").value = stripInlineImageTokenLines(rawContentMd);
  if ($("faq_md")) $("faq_md").value = item.faq_md || "";

  let tags = [];
  try { tags = JSON.parse(item.tags_json || "[]"); } catch {}
  $("tags").value = Array.isArray(tags) ? tags.join(", ") : "";
  if ($("viewBtn")) $("viewBtn").href = `/post/${encodeURIComponent($("slug").value)}`;

  $("category").value = loadedCategory;
  await loadCategories(loadedCategory);
  updateSlugPreview();
  syncTocControlsFromContent();
  updateAllCounts();
  renderSeoChecklist();
  renderPreview();
  setPreviewDevice("pc");
  statusEl.textContent = "불러오기 완료";
}

async function save() {
  const statusEl = $("saveStatus");
  statusEl.textContent = "저장 중…";

  const slug = $("slug").value.trim();
  const title = $("title").value.trim();

  const payload = {
    title,
    category: $("category").value.trim(),
    meta_description: $("meta_description").value.trim(),
    summary: $("summary").value.trim(),
    cover_image: $("cover_image").value.trim(),
    cover_image_alt: $("cover_image_alt").value.trim(),
    focus_keyword: $("focusKeyword")?.value.trim() || "",
    longtail_keywords: parseKeywords($("longtailKeywords")?.value || ""),
    status: $("status").value,
    enable_sidebar_ad: Boolean($("enable_sidebar_ad")?.checked),
    enable_inarticle_ads: Boolean($("enable_inarticle_ads")?.checked),
    tags: parseTags($("tags").value),
    content_md: buildContentWithInlineImageTokens($("content_md").value),
    faq_md: $("faq_md") ? $("faq_md").value : ""
  };

  if (!slug || !title || !payload.content_md.trim()) {
    statusEl.textContent = "슬러그, 제목, 본문은 필수입니다.";
    return;
  }

  const res = await fetch(`/api/posts/${encodeURIComponent(slug)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    statusEl.textContent = json?.message || "저장 실패";
    console.error(json);
    return;
  }

  statusEl.textContent = "저장 완료! 공개 페이지로 이동합니다…";
  location.href = `/post/${encodeURIComponent(slug)}?v=${Date.now()}`;
}

function handleRealtimeChange() {
  const tocStatus = $("tocStatus");
  if (tocStatus) tocStatus.textContent = "";
  syncInlineImageVisibility();
  syncTocControlsFromContent();
  updateSlugPreview();
  updateAllCounts();
  renderSeoChecklist();
  renderPreview();
}

["title", "meta_description", "summary", "content_md", "faq_md", "focusKeyword", "longtailKeywords", "cover_image", "cover_image_alt", "tags", "category", "inlineImage1Id", "inlineImage1Alt", "inlineImage1Caption", "inlineImage2Id", "inlineImage2Alt", "inlineImage2Caption"].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener("input", handleRealtimeChange);
  if (el && el.tagName === "SELECT") el.addEventListener("change", handleRealtimeChange);
});

$("enableInlineImage1")?.addEventListener("change", handleRealtimeChange);
$("enableInlineImage2")?.addEventListener("change", handleRealtimeChange);
$("saveBtn").addEventListener("click", save);
bindCategoryManagerEvents();
$("enableToc")?.addEventListener("change", applyTocControls);
$("includeTocH3")?.addEventListener("change", () => {
  if (!$("enableToc")?.checked) return;
  applyTocControls();
});
$("previewOpenBtn")?.addEventListener("click", openPreview);
$("previewCloseBtn")?.addEventListener("click", closePreview);
$("previewBackdrop")?.addEventListener("click", closePreview);
document.querySelectorAll("[data-preview-width]").forEach((button) => {
  button.addEventListener("click", () => setPreviewDevice(button.dataset.previewWidth || "pc"));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") { closePreview(); closeCategoryModal(); }
});

load();
