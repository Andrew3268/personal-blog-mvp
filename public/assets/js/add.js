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
  return String(raw || "").split(",").map(s => s.trim()).filter(Boolean);
}

function updateSlugPreview() {
  const title = $("title").value.trim();
  $("slugPreview").value = title ? slugify(title) : "";
}

async function save() {
  const statusEl = $("saveStatus");
  statusEl.textContent = "저장 중…";

  const title = $("title").value.trim();
  const slug = slugify(title);

  const payload = {
    slug,
    title,
    category: $("category").value.trim(),
    summary: $("summary").value.trim(),
    cover_image: $("cover_image").value.trim(),
    template_name: $("template_name").value,
    status: $("status").value,
    tags: parseTags($("tags").value),
    content_md: $("content_md").value
  };

  if (!title || !payload.content_md.trim()) {
    statusEl.textContent = "제목과 본문은 필수입니다.";
    return;
  }

  const res = await fetch('/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    statusEl.textContent = json?.message || '저장 실패';
    console.error(json);
    return;
  }

  statusEl.textContent = '저장 완료! 공개 페이지로 이동합니다…';
  location.href = `/post/${encodeURIComponent(slug)}`;
}

$("title").addEventListener('input', updateSlugPreview);
$("saveBtn").addEventListener('click', save);
updateSlugPreview();
