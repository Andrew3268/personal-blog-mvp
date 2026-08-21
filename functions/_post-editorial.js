const EDITORIAL_FIELDS = Object.freeze([
  "title",
  "author_key",
  "summary",
  "cover_image",
  "cover_image_alt",
  "content_md",
  "faq_md"
]);

function normalizeComparable(value) {
  return String(value ?? "").trim();
}

export function hasEditorialChanges(current, next) {
  if (!current) return true;
  return EDITORIAL_FIELDS.some((field) => (
    normalizeComparable(current[field]) !== normalizeComparable(next[field])
  ));
}
