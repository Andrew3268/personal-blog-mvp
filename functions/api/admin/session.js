import { okJson, getAdminCount, getAdminSession } from "../../_utils.js";

export async function onRequestGet({ env, request }) {
  const [adminCount, admin] = await Promise.all([
    getAdminCount(env.BLOG_DB),
    getAdminSession(env, request)
  ]);

  return okJson({
    has_admin: adminCount > 0,
    authenticated: !!admin,
    admin: admin ? { email: admin.email } : null
  });
}
