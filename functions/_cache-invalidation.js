import { canonicalCategoryName, categoryPath } from "./_category-utils.js";

const SITE_ORIGIN = "https://wacky-wiki.com";
const ARCHIVE_CACHE_VERSION = "9";
const POST_CACHE_VERSION = "4";

function normalizeText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function archiveCacheUrl(path, tag = "") {
  const url = new URL(path, SITE_ORIGIN);
  url.searchParams.set("__cv", ARCHIVE_CACHE_VERSION);
  url.searchParams.set("page", "1");
  const safeTag = normalizeText(tag);
  if (safeTag) url.searchParams.set("tag", safeTag);
  return url.toString();
}

export function scheduleContentCacheInvalidation({ waitUntil, slugs = [], categories = [], tags = [] } = {}) {
  if (typeof waitUntil !== "function") return;

  const urls = new Set([archiveCacheUrl("/")]);
  const safeCategories = [...new Set(categories.map(canonicalCategoryName).filter(Boolean))];
  const safeTags = [...new Set(tags.map(normalizeText).filter(Boolean))];

  for (const slug of slugs.map((value) => String(value || "").trim()).filter(Boolean)) {
    const postUrl = new URL(`/post/${encodeURIComponent(slug)}`, SITE_ORIGIN);
    postUrl.searchParams.set("__cv", POST_CACHE_VERSION);
    urls.add(postUrl.toString());
  }

  for (const category of safeCategories) {
    urls.add(archiveCacheUrl(categoryPath(category)));
  }

  for (const tag of safeTags) {
    urls.add(archiveCacheUrl("/", tag));
    for (const category of safeCategories) {
      urls.add(archiveCacheUrl(categoryPath(category), tag));
    }
  }

  const task = Promise.allSettled(
    [...urls].map((url) => caches.default.delete(new Request(url, { method: "GET" })))
  );
  waitUntil(task);
}
