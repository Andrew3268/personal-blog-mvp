import { okJson, buildAdminLogoutCookie, getAdminSession, sha256Hex } from "../../_utils.js";

export async function onRequestPost({ env, request }) {
  const session = await getAdminSession(env, request);
  if (session) {
    const cookie = (request.headers.get("cookie") || "").match(/admin_session=([^;]+)/)?.[1];
    if (cookie) {
      const tokenHash = await sha256Hex(decodeURIComponent(cookie));
      await env.BLOG_DB.prepare(`DELETE FROM admin_sessions WHERE token_hash = ?`).bind(tokenHash).run();
    }
  }
  return okJson({ ok: true }, { headers: { "set-cookie": buildAdminLogoutCookie() } });
}
