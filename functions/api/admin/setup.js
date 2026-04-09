import { okJson, createAdminAccount, createAdminSession, buildAdminSessionCookie } from "../../_utils.js";

export async function onRequestPost({ env, request }) {
  const body = await request.json().catch(() => null);
  const email = String(body?.email || "");
  const password = String(body?.password || "");

  try {
    const admin = await createAdminAccount(env.BLOG_DB, email, password);
    const session = await createAdminSession(env.BLOG_DB, admin.id);
    return okJson({ ok: true, admin: { email: admin.email } }, {
      headers: { "set-cookie": buildAdminSessionCookie(session.token) }
    });
  } catch (error) {
    const message = error?.message === "admin_exists"
      ? "이미 관리자 계정이 있습니다."
      : "이메일과 비밀번호를 다시 확인하세요. 비밀번호는 8자 이상이어야 합니다.";
    const status = error?.message === "admin_exists" ? 409 : 400;
    return okJson({ message }, { status });
  }
}
