import { okJson, getAdminCount } from "../../_utils.js";

export async function onRequestGet({ env }) {
  const adminCount = await getAdminCount(env.BLOG_DB);
  return okJson({
    has_admin: adminCount > 0
  }, {
    headers: { "cache-control": "private, no-store" }
  });
}
