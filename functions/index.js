import { renderHomePageCached, categoryPath } from "./_home-renderer.js";

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const category = String(url.searchParams.get("category") || "").replace(/\s+/g, " ").trim();

  if (category) {
    const target = new URL(categoryPath(category), url.origin);
    const page = url.searchParams.get("page");
    const tag = url.searchParams.get("tag");
    if (page && page !== "1") target.searchParams.set("page", page);
    if (tag) target.searchParams.set("tag", tag);
    return Response.redirect(target.toString(), 301);
  }

  return renderHomePageCached({
    env,
    request,
    waitUntil: (promise) => context.waitUntil(promise)
  });
}
