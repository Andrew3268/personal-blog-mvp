const LEGACY_CATEGORY_ALIASES = new Map([
  ["LIVING", "Life"],
  ["KITCHEN", "Life"],
  ["HEALTH", "Life"],
  ["CLEANING", "Life"],
]);

export function normalizeCategoryName(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function canonicalCategoryName(value = "") {
  const normalized = normalizeCategoryName(value);
  if (!normalized) return "";
  return LEGACY_CATEGORY_ALIASES.get(normalized.toUpperCase()) || normalized;
}

export function isLegacyCategoryName(value = "") {
  const normalized = normalizeCategoryName(value);
  return Boolean(normalized && LEGACY_CATEGORY_ALIASES.has(normalized.toUpperCase()));
}

export function categoryPath(value = "") {
  const canonical = canonicalCategoryName(value);
  return canonical ? `/category/${encodeURIComponent(canonical)}/` : "/";
}
