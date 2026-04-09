import { okJson, verifyAdminCredentials, createAdminSession, buildAdminSessionCookie } from "../../_utils.js";

export async function onRequestPost({ env, request }) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "");
  const password = String(body?.password || "");

  const admin = await verifyAdminCredentials(env.BLOG_DB, email, password);
  if (!admin) {
    return okJson({ message: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const session = await createAdminSession(env.BLOG_DB, admin.id);
  return okJson({ ok: true, admin: { email: admin.email } }, {
    headers: { "set-cookie": buildAdminSessionCookie(session.token) }
  });
}
