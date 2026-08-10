import {
  okJson,
  verifyAdminCredentials,
  createAdminSession,
  buildAdminSessionCookie,
  sha256Hex,
} from "../../_utils.js";

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

function getClientIp(request) {
  return String(
    request.headers.get("cf-connecting-ip")
      || request.headers.get("x-forwarded-for")?.split(",")[0]
      || "unknown"
  ).trim();
}

async function getAttemptState(db, attemptKey) {
  return db.prepare(`
    SELECT failed_count, window_started_at, locked_until
    FROM admin_login_attempts
    WHERE attempt_key = ?
  `).bind(attemptKey).first();
}

async function recordFailure(db, attemptKey, currentState) {
  const now = new Date();
  const currentWindowStart = new Date(currentState?.window_started_at || 0);
  const withinWindow = Number.isFinite(currentWindowStart.getTime())
    && now.getTime() - currentWindowStart.getTime() < WINDOW_MS;
  const failedCount = withinWindow ? Number(currentState?.failed_count || 0) + 1 : 1;
  const windowStartedAt = withinWindow ? currentWindowStart.toISOString() : now.toISOString();
  const lockedUntil = failedCount >= MAX_FAILURES
    ? new Date(now.getTime() + LOCK_MS).toISOString()
    : null;

  await db.prepare(`
    INSERT INTO admin_login_attempts (
      attempt_key, failed_count, window_started_at, locked_until, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(attempt_key) DO UPDATE SET
      failed_count = excluded.failed_count,
      window_started_at = excluded.window_started_at,
      locked_until = excluded.locked_until,
      updated_at = excluded.updated_at
  `).bind(attemptKey, failedCount, windowStartedAt, lockedUntil, now.toISOString()).run();

  return { failedCount, lockedUntil };
}

export async function onRequestPost({ env, request }) {
  let stage = "request";

  try {
    if (!env?.BLOG_DB) {
      throw new Error("BLOG_DB binding is unavailable");
    }

    stage = "parse_body";
    const body = await request.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");

    stage = "build_attempt_key";
    const attemptKey = await sha256Hex(`${getClientIp(request)}::${email}`);

    stage = "read_attempt_state";
    const attemptState = await getAttemptState(env.BLOG_DB, attemptKey);
    const lockedUntilMs = new Date(attemptState?.locked_until || 0).getTime();

    if (Number.isFinite(lockedUntilMs) && lockedUntilMs > Date.now()) {
      const retryAfter = Math.max(1, Math.ceil((lockedUntilMs - Date.now()) / 1000));
      return okJson({ message: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요." }, {
        status: 429,
        headers: { "retry-after": String(retryAfter) }
      });
    }

    stage = "verify_credentials";
    const admin = await verifyAdminCredentials(env.BLOG_DB, email, password);
    if (!admin) {
      stage = "record_failure";
      const result = await recordFailure(env.BLOG_DB, attemptKey, attemptState);
      const headers = result.lockedUntil ? { "retry-after": String(LOCK_MS / 1000) } : {};
      return okJson({ message: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401, headers });
    }

    stage = "clear_failures";
    await env.BLOG_DB.prepare(`DELETE FROM admin_login_attempts WHERE attempt_key = ?`).bind(attemptKey).run();

    stage = "create_session";
    const session = await createAdminSession(env.BLOG_DB, admin.id);

    stage = "response";
    return okJson({ ok: true, admin: { email: admin.email } }, {
      headers: { "set-cookie": buildAdminSessionCookie(session.token) }
    });
  } catch (error) {
    console.error("[admin/login] request failed", {
      stage,
      name: error?.name || "Error",
      message: error?.message || String(error),
      stack: error?.stack || "",
    });

    return okJson({
      message: "로그인 처리 중 서버 오류가 발생했습니다. 잠시 후 다시 시도하세요."
    }, { status: 500 });
  }
}
