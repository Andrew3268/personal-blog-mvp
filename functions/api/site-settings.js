import { okJson, requireAdmin } from "../_utils.js";

const SETTINGS_DEFAULTS = {
  index_sidebar_ad_enabled: "0"
};

async function ensureSiteSettingsTable(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  const now = new Date().toISOString();
  for (const [key, value] of Object.entries(SETTINGS_DEFAULTS)) {
    await db.prepare(`
      INSERT OR IGNORE INTO site_settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `).bind(key, value, now).run();
  }
}

async function readSettings(db) {
  await ensureSiteSettingsTable(db);
  const rows = await db.prepare(`SELECT key, value FROM site_settings`).all();
  const raw = Object.fromEntries((rows.results || []).map((row) => [String(row.key), String(row.value)]));
  return {
    index_sidebar_ad_enabled: raw.index_sidebar_ad_enabled === "1"
  };
}

export async function onRequestGet({ env }) {
  const settings = await readSettings(env.BLOG_DB);
  return okJson({ ok: true, settings }, {
    headers: { "cache-control": "public, max-age=30, s-maxage=60" }
  });
}

export async function onRequestPut({ env, request }) {
  const admin = await requireAdmin(env, request);
  if (!admin) return okJson({ message: "관리자 로그인이 필요합니다." }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return okJson({ message: "JSON이 필요합니다." }, { status: 400 });
  }

  await ensureSiteSettingsTable(env.BLOG_DB);
  const now = new Date().toISOString();

  if (Object.prototype.hasOwnProperty.call(body, "index_sidebar_ad_enabled")) {
    const value = body.index_sidebar_ad_enabled ? "1" : "0";
    await env.BLOG_DB.prepare(`
      INSERT INTO site_settings (key, value, updated_at)
      VALUES ('index_sidebar_ad_enabled', ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `).bind(value, now).run();
  }

  const settings = await readSettings(env.BLOG_DB);
  return okJson({ ok: true, settings }, { headers: { "cache-control": "private, no-store" } });
}

export async function onRequestPost(context) {
  return onRequestPut(context);
}
