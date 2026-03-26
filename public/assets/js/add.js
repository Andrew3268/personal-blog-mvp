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
}

function updateSlugPreview() {
  const title = $("title").value.trim();
  $("slugPreview").value = title ? slugify(title) : "";
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

function evaluateSeo() {
  const title = $("title").value.trim();
  const slug = $("slugPreview").value.trim();
  const metaDescription = $("meta_description").value.trim();
  const summary = $("summary").value.trim();
  const contentMd = $("content_md").value || "";
  const focusKeyword = $("focusKeyword")?.value.trim() || "";

  const plainContent = stripMarkdown(contentMd);
  const titleLen = countText(title);
  const metaLen = countText(metaDescription);
  const summaryLen = countText(summary);
  const contentLen = countText(plainContent);
  const h1List = getHeadings(contentMd, 1);
  const h2List = getHeadings(contentMd, 2);
  const links = getLinks(contentMd);
  const images = getImages(contentMd);
  const internalLinks = links.filter((href) => href.startsWith("/")).length;
  const externalLinks = links.filter((href) => /^https?:\/\//.test(href)).length;
  const imagesWithoutAlt = images.filter((img) => !img.alt).length;
  const firstParagraph = getFirstParagraph(contentMd);
  const keywordInTitle = focusKeyword ? title.includes(focusKeyword) : false;
  const keywordInMeta = focusKeyword ? metaDescription.includes(focusKeyword) : false;
  const keywordInSummary = focusKeyword ? summary.includes(focusKeyword) : false;
  const keywordInSlug = focusKeyword ? slug.includes(slugify(focusKeyword)) : false;
  const keywordInFirstParagraph = focusKeyword ? firstParagraph.includes(focusKeyword) : false;
  const keywordInH2 = focusKeyword ? h2List.some((h) => h.includes(focusKeyword)) : false;
  const keywordCount = focusKeyword ? countKeywordOccurrences(plainContent, focusKeyword) : 0;

  const checks = [
    {
      key: "titleLength",
      label: "제목 길이",
      status: titleLen >= 20 && titleLen <= 60 ? "good" : titleLen >= 14 ? "warn" : "bad",
      detail: `현재 ${titleLen}자 · 권장 20~60자`
    },
    {
      key: "metaLength",
      label: "메타 디스크립션 길이",
      status: metaLen >= 70 && metaLen <= 160 ? "good" : metaLen >= 40 ? "warn" : "bad",
      detail: `현재 ${metaLen}자 · 권장 70~160자`
    },
    {
      key: "summaryLength",
      label: "요약문 길이",
      status: summaryLen >= 40 && summaryLen <= 140 ? "good" : summaryLen >= 20 ? "warn" : "bad",
      detail: `현재 ${summaryLen}자 · 권장 40~140자`
    },
    {
      key: "contentLength",
      label: "본문 길이",
      status: contentLen >= 1200 ? "good" : contentLen >= 500 ? "warn" : "bad",
      detail: `현재 ${contentLen}자 · 권장 1,200자 이상`
    },
    {
      key: "h1Count",
      label: "H1 개수",
      status: h1List.length === 1 ? "good" : h1List.length === 0 ? "warn" : "bad",
      detail: `현재 ${h1List.length}개 · 권장 1개`
    },
    {
      key: "h2Count",
      label: "H2 소제목 구조",
      status: h2List.length >= 2 ? "good" : h2List.length === 1 ? "warn" : "bad",
      detail: `현재 ${h2List.length}개 · 권장 2개 이상`
    },
    {
      key: "internalLinks",
      label: "내부 링크",
      status: internalLinks >= 1 ? "good" : "warn",
      detail: `현재 ${internalLinks}개 · 관련 글 링크 1개 이상 권장`
    },
    {
      key: "externalLinks",
      label: "외부 링크",
      status: externalLinks >= 1 ? "good" : "warn",
      detail: `현재 ${externalLinks}개 · 근거 링크가 있으면 신뢰도에 도움`
    },
    {
      key: "imageAlt",
      label: "이미지 ALT 텍스트",
      status: images.length === 0 ? "warn" : imagesWithoutAlt === 0 ? "good" : "bad",
      detail: images.length === 0
        ? "본문 이미지가 없습니다. 필요하면 ALT 포함 이미지를 추가하세요."
        : `이미지 ${images.length}개 · ALT 누락 ${imagesWithoutAlt}개`
    }
  ];

  if (!focusKeyword) {
    checks.push({
      key: "focusKeywordMissing",
      label: "메인 키워드 설정",
      status: "bad",
      detail: "메인 키워드를 입력해야 핵심 SEO 점검이 활성화됩니다."
    });
  } else {
    checks.push(
      {
        key: "keywordTitle",
        label: "메인 키워드 - 제목 포함",
        status: keywordInTitle ? "good" : "bad",
        detail: keywordInTitle ? "제목에 메인 키워드가 포함되어 있습니다." : "제목에 메인 키워드를 포함하세요."
      },
      {
        key: "keywordMeta",
        label: "메인 키워드 - 메타 디스크립션 포함",
        status: keywordInMeta ? "good" : "warn",
        detail: keywordInMeta ? "메타 디스크립션에 메인 키워드가 포함되어 있습니다." : "메타 디스크립션에 메인 키워드를 넣어보세요."
      },
      {
        key: "keywordSummary",
        label: "메인 키워드 - 요약문 포함",
        status: keywordInSummary ? "good" : "warn",
        detail: keywordInSummary ? "요약문에 메인 키워드가 포함되어 있습니다." : "요약문에도 메인 키워드를 자연스럽게 넣어보세요."
      },
      {
        key: "keywordSlug",
        label: "메인 키워드 - 슬러그 포함",
        status: keywordInSlug ? "good" : "warn",
        detail: keywordInSlug ? "슬러그에도 키워드가 반영되어 있습니다." : "슬러그에 키워드가 드러나면 더 좋습니다."
      },
      {
        key: "keywordIntro",
        label: "메인 키워드 - 첫 문단 포함",
        status: keywordInFirstParagraph ? "good" : "bad",
        detail: keywordInFirstParagraph ? "첫 문단에 메인 키워드가 포함되어 있습니다." : "첫 문단 초반에 메인 키워드를 포함하세요."
      },
      {
        key: "keywordH2",
        label: "메인 키워드 - 소제목 포함",
        status: keywordInH2 ? "good" : "warn",
        detail: keywordInH2 ? "H2 소제목에 키워드가 반영되어 있습니다." : "H2 소제목 중 하나에 키워드를 포함하면 좋습니다."
      },
      {
        key: "keywordDensity",
        label: "메인 키워드 언급 횟수",
        status: keywordCount >= 3 && keywordCount <= 12 ? "good" : keywordCount >= 1 ? "warn" : "bad",
        detail: `본문 내 ${keywordCount}회 언급 · 권장 3~12회`
      }
    );
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

function renderSeoChecklist() {
  const wrap = $("seoChecklist");
  const scoreEl = $("seoScore");
  const gradeEl = $("seoGrade");
  if (!wrap || !scoreEl || !gradeEl) return;

  const checks = evaluateSeo();
  const { score, grade } = getScoreSummary(checks);

  scoreEl.textContent = String(score);
  gradeEl.textContent = grade;
  scoreEl.dataset.grade = grade;

  wrap.innerHTML = checks.map((item) => {
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

async function save() {
  const statusEl = $("saveStatus");
  statusEl.textContent = "저장 중…";

  const title = $("title").value.trim();
  const slug = slugify(title);

  const payload = {
    slug,
    title,
    category: $("category").value.trim(),
    meta_description: $("meta_description").value.trim(),
    summary: $("summary").value.trim(),
    cover_image: $("cover_image").value.trim(),
    status: $("status").value,
    tags: parseTags($("tags").value),
    content_md: $("content_md").value
  };

  if (!title || !payload.content_md.trim()) {
    statusEl.textContent = "제목과 본문은 필수입니다.";
    return;
  }

  const res = await fetch("/api/posts", {
    method: "POST",
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
  location.href = `/post/${encodeURIComponent(slug)}`;
}

function handleRealtimeChange() {
  updateSlugPreview();
  updateAllCounts();
  renderSeoChecklist();
}

["title", "meta_description", "summary", "content_md", "focusKeyword"].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener("input", handleRealtimeChange);
});

$("saveBtn").addEventListener("click", save);

updateSlugPreview();
updateAllCounts();
renderSeoChecklist();