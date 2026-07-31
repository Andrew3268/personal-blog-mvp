export function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function jsonld(obj) {
  const safeJson = JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
  return `<script type="application/ld+json">${safeJson}</script>`;
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
const PASSWORD_HASH_ITERATIONS = 210000;

let postSeoMigrationPromise = null;

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

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(value = "") {
  const hex = String(value || "").trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2 !== 0) return new Uint8Array();
  return Uint8Array.from(hex.match(/.{2}/g).map((part) => Number.parseInt(part, 16)));
}

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value = "") {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return new Uint8Array();
  }
}

function timingSafeEqual(a, b) {
  const left = a instanceof Uint8Array ? a : new Uint8Array(a || []);
  const right = b instanceof Uint8Array ? b : new Uint8Array(b || []);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] || 0) ^ (right[index] || 0);
  }
  return diff === 0;
}

async function derivePasswordHash(email, password, saltBytes, iterations = PASSWORD_HASH_ITERATIONS) {
  const input = new TextEncoder().encode(`${normalizeEmail(email)}\u0000${String(password || "")}`);
  const key = await crypto.subtle.importKey("raw", input, "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: saltBytes,
    iterations,
  }, key, 256);
  return new Uint8Array(bits);
}

async function createPasswordHash(email, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await derivePasswordHash(email, password, salt, PASSWORD_HASH_ITERATIONS);
  return `pbkdf2_sha256$${PASSWORD_HASH_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(digest)}`;
}

async function verifyStoredPassword(email, password, storedHash) {
  const value = String(storedHash || "").trim();
  const parts = value.split("$");
  if (parts.length === 4 && parts[0] === "pbkdf2_sha256") {
    const iterations = Number.parseInt(parts[1], 10);
    const salt = base64UrlToBytes(parts[2]);
    const expected = base64UrlToBytes(parts[3]);
    if (!Number.isFinite(iterations) || iterations < 100000 || !salt.length || !expected.length) return false;
    const actual = await derivePasswordHash(email, password, salt, iterations);
    return timingSafeEqual(actual, expected);
  }

  // 이전 배포에서 사용한 SHA-256 해시를 한 번만 허용하고, 로그인 성공 시 PBKDF2로 자동 교체합니다.
  if (/^[0-9a-f]{64}$/i.test(value)) {
    const legacy = await sha256Hex(`${normalizeEmail(email)}::${String(password || "")}`);
    return timingSafeEqual(hexToBytes(legacy), hexToBytes(value));
  }
  return false;
}

export async function ensurePostSeoColumns(db) {
  if (postSeoMigrationPromise) return postSeoMigrationPromise;
  postSeoMigrationPromise = (async () => {
    const tableInfo = await db.prepare(`PRAGMA table_info(posts)`).all();
    const columnNames = new Set((tableInfo.results || []).map((row) => String(row.name || "")));

    if (!columnNames.has("first_published_at")) {
      try {
        await db.prepare(`ALTER TABLE posts ADD COLUMN first_published_at TEXT`).run();
      } catch (_) {
        // 동시에 실행된 다른 요청이 먼저 컬럼을 추가한 경우 그대로 진행합니다.
      }
    }

    if (!columnNames.has("metadata_updated_at")) {
      try {
        await db.prepare(`ALTER TABLE posts ADD COLUMN metadata_updated_at TEXT`).run();
      } catch (_) {
        // 동시에 실행된 다른 요청이 먼저 컬럼을 추가한 경우 그대로 진행합니다.
      }
    }

    await db.prepare(`
      UPDATE posts
      SET first_published_at = published_at
      WHERE status = 'published'
        AND (first_published_at IS NULL OR TRIM(first_published_at) = '')
    `).run();
    await db.prepare(`
      UPDATE posts
      SET metadata_updated_at = updated_at
      WHERE metadata_updated_at IS NULL OR TRIM(metadata_updated_at) = ''
    `).run();
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_posts_first_published_at
      ON posts(first_published_at DESC)
    `).run();
    await db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_posts_metadata_updated_at
      ON posts(metadata_updated_at DESC)
    `).run();
  })().catch((error) => {
    postSeoMigrationPromise = null;
    throw error;
  });
  return postSeoMigrationPromise;
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

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS admin_login_attempts (
      attempt_key TEXT PRIMARY KEY,
      failed_count INTEGER NOT NULL DEFAULT 0,
      window_started_at TEXT NOT NULL,
      locked_until TEXT,
      updated_at TEXT NOT NULL
    )
  `).run();
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
  const passwordHash = await createPasswordHash(safeEmail, safePassword);
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
  const verified = await verifyStoredPassword(safeEmail, safePassword, user.password_hash);
  if (!verified) return null;

  if (!String(user.password_hash || "").startsWith("pbkdf2_sha256$")) {
    const upgradedHash = await createPasswordHash(safeEmail, safePassword);
    await db.prepare(`UPDATE admin_users SET password_hash = ?, updated_at = ? WHERE id = ?`)
      .bind(upgradedHash, new Date().toISOString(), user.id)
      .run();
  }
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
  const cookies = parseCookies(request);
  const token = cookies[ADMIN_COOKIE];
  if (!token) return null;

  await ensureAdminTables(env.BLOG_DB);
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
