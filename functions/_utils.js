export function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function jsonld(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

export function okJson(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers || {}) }
  });
}

export function okHtml(html, init = {}) {
  return new Response(html, {
    ...init,
    headers: { "content-type": "text/html; charset=utf-8", ...(init.headers || {}) }
  });
}

export async function edgeCache({ request, cacheKeyUrl, ttlSeconds = 300, buildResponse }) {
  const cache = caches.default;
  const cacheKey = new Request(cacheKeyUrl, request);

  const cached = await cache.match(cacheKey);
  if (cached) {
    const res = new Response(cached.body, cached);
    res.headers.set("x-blog-cache", "HIT");
    res.headers.set("x-blog-cache-key", new URL(cacheKeyUrl).pathname + new URL(cacheKeyUrl).search);
    return res;
  }

  const res = await buildResponse();
  if (!res.headers.has("cache-control")) {
    res.headers.set("cache-control", `public, max-age=${ttlSeconds}`);
  }
  res.headers.set("x-blog-cache", "MISS");
  res.headers.set("x-blog-cache-key", new URL(cacheKeyUrl).pathname + new URL(cacheKeyUrl).search);
  await cache.put(cacheKey, res.clone());
  return res;
}

const ADMIN_COOKIE = "admin_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function parseCookies(request) {
  const raw = request.headers.get("cookie") || "";
  const out = {};
  raw.split(/;\s*/).filter(Boolean).forEach((entry) => {
    const idx = entry.indexOf("=");
    if (idx === -1) return;
    const key = entry.slice(0, idx).trim();
    const value = entry.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  });
  return out;
}

export async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function ensureAdminTables(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      admin_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
    )
  `).run();

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id, expires_at DESC)`).run();
}

export async function getAdminCount(db) {
  await ensureAdminTables(db);
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM admin_users`).first();
  return Number(row?.count || 0);
}

export async function createAdminAccount(db, email, password) {
  await ensureAdminTables(db);
  const safeEmail = normalizeEmail(email);
  const safePassword = String(password || "");
  if (!safeEmail || !safePassword || safePassword.length < 8) {
    throw new Error("email_or_password_invalid");
  }
  const existingCount = await getAdminCount(db);
  if (existingCount > 0) {
    throw new Error("admin_exists");
  }
  const now = new Date().toISOString();
  const passwordHash = await sha256Hex(`${safeEmail}::${safePassword}`);
  const result = await db.prepare(`
    INSERT INTO admin_users (email, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).bind(safeEmail, passwordHash, now, now).run();
  const adminId = Number(result.meta?.last_row_id || 0);
  return { id: adminId, email: safeEmail };
}

export async function verifyAdminCredentials(db, email, password) {
  await ensureAdminTables(db);
  const safeEmail = normalizeEmail(email);
  const safePassword = String(password || "");
  const user = await db.prepare(`SELECT id, email, password_hash FROM admin_users WHERE email = ?`).bind(safeEmail).first();
  if (!user) return null;
  const passwordHash = await sha256Hex(`${safeEmail}::${safePassword}`);
  if (passwordHash !== user.password_hash) return null;
  return { id: Number(user.id), email: user.email };
}

export async function createAdminSession(db, adminId) {
  await ensureAdminTables(db);
  const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
  const tokenHash = await sha256Hex(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE * 1000).toISOString();
  await db.prepare(`
    INSERT INTO admin_sessions (token_hash, admin_id, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `).bind(tokenHash, adminId, expiresAt, now.toISOString()).run();
  return { token, expiresAt };
}

export function buildAdminSessionCookie(token) {
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

export function buildAdminLogoutCookie() {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function getAdminSession(env, request) {
  await ensureAdminTables(env.BLOG_DB);
  const cookies = parseCookies(request);
  const token = cookies[ADMIN_COOKIE];
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const row = await env.BLOG_DB.prepare(`
    SELECT s.token_hash, s.expires_at, u.id, u.email
    FROM admin_sessions s
    JOIN admin_users u ON u.id = s.admin_id
    WHERE s.token_hash = ?
  `).bind(tokenHash).first();

  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await env.BLOG_DB.prepare(`DELETE FROM admin_sessions WHERE token_hash = ?`).bind(tokenHash).run();
    return null;
  }

  return { id: Number(row.id), email: row.email, expires_at: row.expires_at };
}

export async function requireAdmin(env, request) {
  return getAdminSession(env, request);
}
