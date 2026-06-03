const SITE_ORIGIN = "https://wacky-wiki.com";

function normalizeCategoryPath(name = "") {
  const safeName = String(name || "").replace(/\s+/g, " ").trim();
  return safeName ? `/category/${encodeURIComponent(safeName)}/` : "/";
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const host = url.hostname.toLowerCase();

  if (host === "www.wacky-wiki.com" || host.endsWith(".pages.dev")) {
    const redirectUrl = new URL(url.pathname + url.search, SITE_ORIGIN);
    return Response.redirect(redirectUrl.toString(), 301);
  }

  if (url.pathname === "/" && url.searchParams.has("category")) {
    const category = String(url.searchParams.get("category") || "").replace(/\s+/g, " ").trim();
    if (category) {
      const redirectUrl = new URL(normalizeCategoryPath(category), url.origin);
      const page = url.searchParams.get("page");
      const tag = url.searchParams.get("tag");
      if (page && page !== "1") redirectUrl.searchParams.set("page", page);
      if (tag) redirectUrl.searchParams.set("tag", tag);
      return Response.redirect(redirectUrl.toString(), 301);
    }
  }

  return context.next();
}
