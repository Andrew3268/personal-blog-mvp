import { renderHomePageCached, archiveNotFoundResponse } from "../_home-renderer.js";

function normalizeCategory(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export async function onRequestGet(context) {
  const { params, env, request } = context;
  let decoded = "";
  try {
    decoded = decodeURIComponent(String(params.category || ""));
  } catch {
    return archiveNotFoundResponse({
      title: "카테고리를 찾을 수 없습니다",
      description: "카테고리 주소 형식이 올바르지 않습니다."
    });
  }

  const category = normalizeCategory(decoded);
  if (!category) return Response.redirect(new URL("/", request.url).toString(), 301);

  return renderHomePageCached({
    env,
    request,
    category,
    waitUntil: (promise) => context.waitUntil(promise)
  });
}
