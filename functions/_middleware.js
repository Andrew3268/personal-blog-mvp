import { getAdminSession, okJson } from "./_utils.js";
import { canonicalCategoryName, categoryPath, isLegacyCategoryName, normalizeCategoryName } from "./_category-utils.js";

const SITE_ORIGIN = "https://wacky-wiki.com";
const PROTECTED_ADMIN_PATHS = new Set([
  "/admin/dashboard",
  "/admin/dashboard.html",
  "/admin/posts",
  "/admin/posts.html",
  "/admin/categories",
  "/admin/categories.html",
  "/add",
  "/add.html",
  "/edit",
  "/edit.html",
]);
const CANONICAL_STATIC_PATHS = new Map([
  ["/index.html", "/"],
  ["/about/index.html", "/about/"],
  ["/privacy-policy/index.html", "/privacy-policy/"],
  ["/admin/index.html", "/admin/"],
]);

// Legacy category consolidation (2026-08):
// Previously indexed category URLs are kept only as permanent redirect aliases.
function getLegacyCategoryRedirect(pathname = "") {
  const match = String(pathname || "").match(/^\/category\/([^/]+)\/?$/);
  if (!match) return null;

  let decoded = "";
  try {
    decoded = decodeURIComponent(match[1]);
  } catch {
    return null;
  }

  return isLegacyCategoryName(decoded) ? canonicalCategoryName(decoded) : null;
}

function isSameOriginMutation(request, url) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === url.origin;
    } catch {
      return false;
    }
  }
  const fetchSite = String(request.headers.get("sec-fetch-site") || "").toLowerCase();
  return !fetchSite || fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === "none";
}

function injectAdminSessionState(response, admin) {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!admin || !contentType.includes("text/html")) return response;

  const stateJson = JSON.stringify({
    authenticated: true,
    admin: { email: admin.email }
  }).replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append(`<script>window.__ADMIN_SESSION__=${stateJson};</script>`, { html: true });
      }
    })
    .transform(response);
}

function applyResponseHeaders(response, pathname) {
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("x-frame-options", "SAMEORIGIN");
  headers.set("content-security-policy", "frame-ancestors 'self'");

  if (pathname.startsWith("/api/")) {
    headers.set("x-robots-tag", "noindex, nofollow");
  }
  if (response.status === 404) {
    headers.set("x-robots-tag", "noindex, follow");
  }
  if (pathname === "/admin/" || pathname === "/admin/index.html" || PROTECTED_ADMIN_PATHS.has(pathname)) {
    headers.set("x-robots-tag", "noindex, nofollow");
  }
  if (pathname.startsWith("/api/admin/")) {
    headers.set("cache-control", "private, no-store");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const host = url.hostname.toLowerCase();

  // Keep every public request on the canonical HTTPS origin. This also makes
  // /ads.txt consistently reachable when crawlers try HTTP, www or pages.dev.
  if (url.protocol !== "https:" || host === "www.wacky-wiki.com" || host.endsWith(".pages.dev")) {
    const redirectUrl = new URL(url.pathname + url.search, SITE_ORIGIN);
    return Response.redirect(redirectUrl.toString(), 301);
  }

  const canonicalStaticPath = CANONICAL_STATIC_PATHS.get(url.pathname);
  if (canonicalStaticPath) {
    const redirectUrl = new URL(canonicalStaticPath + url.search, url.origin);
    return Response.redirect(redirectUrl.toString(), 301);
  }

  const legacyCategoryTarget = getLegacyCategoryRedirect(url.pathname);
  if (legacyCategoryTarget) {
    const redirectUrl = new URL(categoryPath(legacyCategoryTarget), url.origin);
    // Preserve meaningful pagination/tag parameters from indexed legacy URLs.
    const page = url.searchParams.get("page");
    const tag = url.searchParams.get("tag");
    if (page) redirectUrl.searchParams.set("page", page);
    if (tag) redirectUrl.searchParams.set("tag", tag);
    return Response.redirect(redirectUrl.toString(), 301);
  }

  if (url.pathname.startsWith("/category/") && !url.pathname.endsWith("/")) {
    const redirectUrl = new URL(`${url.pathname}/${url.search}`, url.origin);
    return Response.redirect(redirectUrl.toString(), 301);
  }

  if (url.pathname.startsWith("/post/") && url.pathname.length > "/post/".length && url.pathname.endsWith("/")) {
    const redirectUrl = new URL(`${url.pathname.replace(/\/+$/, "")}${url.search}`, url.origin);
    return Response.redirect(redirectUrl.toString(), 301);
  }

  if (url.pathname === "/" && url.searchParams.has("category")) {
    const category = normalizeCategoryName(url.searchParams.get("category"));
    if (category) {
      const redirectUrl = new URL(categoryPath(category), url.origin);
      const page = url.searchParams.get("page");
      const tag = url.searchParams.get("tag");
      if (page && page !== "1") redirectUrl.searchParams.set("page", page);
      if (tag) redirectUrl.searchParams.set("tag", tag);
      return Response.redirect(redirectUrl.toString(), 301);
    }
  }

  if (url.pathname === "/" || url.pathname.startsWith("/category/")) {
    const rawPage = url.searchParams.get("page");
    if (rawPage !== null) {
      const parsedPage = Number.parseInt(rawPage, 10);
      const normalizedPage = Number.isFinite(parsedPage) && parsedPage > 1 ? String(parsedPage) : "";
      if (rawPage !== normalizedPage) {
        const redirectUrl = new URL(url.toString());
        if (normalizedPage) redirectUrl.searchParams.set("page", normalizedPage);
        else redirectUrl.searchParams.delete("page");
        return Response.redirect(redirectUrl.toString(), 301);
      }
    }
    if (url.searchParams.get("status") === "published") {
      const redirectUrl = new URL(url.toString());
      redirectUrl.searchParams.delete("status");
      return Response.redirect(redirectUrl.toString(), 301);
    }
    if (url.searchParams.has("tag") && !String(url.searchParams.get("tag") || "").trim()) {
      const redirectUrl = new URL(url.toString());
      redirectUrl.searchParams.delete("tag");
      return Response.redirect(redirectUrl.toString(), 301);
    }
  }

  if (url.pathname.startsWith("/api/") && !isSameOriginMutation(context.request, url)) {
    return applyResponseHeaders(okJson({ message: "허용되지 않은 요청 출처입니다." }, { status: 403 }), url.pathname);
  }

  let authenticatedAdmin = null;
  if (PROTECTED_ADMIN_PATHS.has(url.pathname)) {
    authenticatedAdmin = await getAdminSession(context.env, context.request).catch(() => null);
    if (!authenticatedAdmin) {
      const loginUrl = new URL("/admin/", url.origin);
      loginUrl.searchParams.set("next", url.pathname + url.search);
      return Response.redirect(loginUrl.toString(), 302);
    }
  }

  let response = await context.next();
  response = injectAdminSessionState(response, authenticatedAdmin);
  return applyResponseHeaders(response, url.pathname);
}
