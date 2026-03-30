const $ = (id) => document.getElementById(id);

function qs(name) {
  return new URLSearchParams(location.search).get(name);
}

function parseTags(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function countText(value) {
  return String(value || "").length;
}

function updateCount(inputId, outputId) {
  const inputEl = $(inputId);
  const outputEl = $(outputId);
  if (!inputEl || !outputEl) return;
  outputEl.textContent = `${countText(inputEl.value)}자`;
}

function updateAllCounts() {
  updateCount("title", "titleCount");
  updateCount("meta_description", "metaDescriptionCount");
  updateCount("summary", "summaryCount");
  updateCount("content_md", "contentCount");
  if ($("faq_md")) updateCount("faq_md", "faqCount");
}

async function load() {
  const slug = qs("slug");
  const statusEl = $("statusMsg");

  if (!slug) {
    statusEl.textContent = "slug 파라미터가 없습니다.";
    return;
  }

  statusEl.textContent = "불러오는 중…";

  const res = await fetch(`/api/posts/${encodeURIComponent(slug)}`);
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    statusEl.textContent = json?.message || "불러오기 실패";
    console.error(json);
    return;
  }

  const item = json.item || {};

  $("slug").value = item.slug || "";
  $("published_at").value = item.published_at || "";
  $("updated_at").value = item.updated_at || "";
  $("title").value = item.title || "";
  $("category").value = item.category || "";
  $("meta_description").value = item.meta_description || "";
  $("summary").value = item.summary || "";
  $("cover_image").value = item.cover_image || "";
  if ($("cover_image_alt")) $("cover_image_alt").value = item.cover_image_alt || "";
  $("status").value = item.status || "published";
  $("content_md").value = item.content_md || "";
  if ($("faq_md")) $("faq_md").value = item.faq_md || "";

  let tags = [];
  try {
    tags = JSON.parse(item.tags_json || "[]");
  } catch {
    tags = [];
  }

  $("tags").value = Array.isArray(tags) ? tags.join(", ") : "";
  $("viewBtn").href = `/post/${encodeURIComponent(slug)}`;
  statusEl.textContent = "불러오기 완료";

  updateAllCounts();
}

async function save() {
  const slug = $("slug").value;
  const statusEl = $("statusMsg");

  if (!slug) {
    statusEl.textContent = "slug가 없습니다.";
    return;
  }

  statusEl.textContent = "저장 중…";

  const payload = {
    title: $("title").value.trim(),
    category: $("category").value.trim(),
    meta_description: $("meta_description").value.trim(),
    summary: $("summary").value.trim(),
    cover_image: $("cover_image").value.trim(),
    cover_image_alt: $("cover_image_alt") ? $("cover_image_alt").value.trim() : "",
    status: $("status").value,
    tags: parseTags($("tags").value),
    content_md: $("content_md").value,
    faq_md: $("faq_md") ? $("faq_md").value : ""
  };

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

$("title").addEventListener("input", () => {
  updateCount("title", "titleCount");
});

$("meta_description").addEventListener("input", () => {
  updateCount("meta_description", "metaDescriptionCount");
});

$("summary").addEventListener("input", () => {
  updateCount("summary", "summaryCount");
});

$("content_md").addEventListener("input", () => {
  updateCount("content_md", "contentCount");
});

if ($("faq_md")) {
  $("faq_md").addEventListener("input", () => {
    updateCount("faq_md", "faqCount");
  });
}

$("saveBtn").addEventListener("click", save);

load();