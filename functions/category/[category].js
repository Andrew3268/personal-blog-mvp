import { renderHomePageCached } from "../_home-renderer.js";

export async function onRequestGet({ params, env, request }) {
  const category = decodeURIComponent(String(params.category || "")).replace(/\s+/g, " ").trim();
  if (!category) return Response.redirect(new URL("/", request.url).toString(), 302);
  return renderHomePageCached({ env, request, category });
}
