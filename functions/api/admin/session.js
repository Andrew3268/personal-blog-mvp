import { okJson, getAdminSession } from "../../_utils.js";

export async function onRequestGet({ env, request }) {
  const admin = await getAdminSession(env, request);

  return okJson({
    authenticated: Boolean(admin),
    admin: admin ? { email: admin.email } : null
  }, {
    headers: { "cache-control": "private, no-store" }
  });
}
