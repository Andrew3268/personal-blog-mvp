import { okJson } from "../../_utils.js";

const BOT_UA_RE = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|preview|monitoring|uptime/i;

function safeDecodePathParam(value = "") {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return "";
  }
}

export async function onRequestPost({ env, params, request }) {
  const userAgent = String(request.headers.get("user-agent") || "");
  if (!userAgent || BOT_UA_RE.test(userAgent)) {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }

  const slug = safeDecodePathParam(params.slug).trim();
  if (!slug) return okJson({ message: "slug가 필요합니다." }, { status: 400 });

  const result = await env.BLOG_DB.prepare(`
    UPDATE posts
    SET view_count = view_count + 1
    WHERE slug = ? AND status = 'published'
  `).bind(slug).run();

  if (!Number(result.meta?.changes || 0)) {
    return okJson({ message: "not_found" }, { status: 404 });
  }

  return new Response(null, {
    status: 204,
    headers: { "cache-control": "private, no-store" }
  });
}
