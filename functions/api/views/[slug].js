const BOT_UA_RE = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|preview|monitoring|uptime/i;
const FLUSH_THRESHOLD = 20;
const MAX_ACCUMULATION_MS = 15 * 60 * 1000;

function safeDecodePathParam(value = "") {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return "";
  }
}

async function recordAggregatedView(db, slug) {
  const now = new Date();
  const nowIso = now.toISOString();
  const flushBeforeIso = new Date(now.getTime() - MAX_ACCUMULATION_MS).toISOString();

  const accumulator = await db.prepare(`
    INSERT INTO post_view_accumulator (
      post_slug,
      pending_count,
      window_started_at,
      updated_at
    )
    SELECT slug, 1, ?, ?
    FROM posts
    WHERE slug = ?
      AND status = 'published'
    ON CONFLICT(post_slug) DO UPDATE SET
      pending_count = post_view_accumulator.pending_count + 1,
      updated_at = excluded.updated_at
    RETURNING pending_count, window_started_at
  `).bind(nowIso, nowIso, slug).first();

  if (!accumulator) return;

  const pendingCount = Number(accumulator.pending_count || 0);
  const windowStartedAt = String(accumulator.window_started_at || nowIso);
  if (pendingCount < FLUSH_THRESHOLD && windowStartedAt > flushBeforeIso) return;

  await db.batch([
    db.prepare(`
      UPDATE posts
      SET view_count = view_count + (
        SELECT pending_count
        FROM post_view_accumulator
        WHERE post_slug = ?
          AND pending_count > 0
      )
      WHERE slug = ?
        AND EXISTS (
          SELECT 1
          FROM post_view_accumulator
          WHERE post_slug = ?
            AND pending_count > 0
        )
    `).bind(slug, slug, slug),
    db.prepare(`
      UPDATE post_view_accumulator
      SET pending_count = 0,
          window_started_at = ?,
          updated_at = ?
      WHERE post_slug = ?
        AND pending_count > 0
    `).bind(nowIso, nowIso, slug)
  ]);
}

export async function onRequestPost(context) {
  const { env, params, request } = context;
  const userAgent = String(request.headers.get("user-agent") || "");
  if (!userAgent || BOT_UA_RE.test(userAgent)) {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }

  const slug = safeDecodePathParam(params.slug).trim();
  if (!slug) {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }

  context.waitUntil(recordAggregatedView(env.BLOG_DB, slug).catch(() => undefined));

  return new Response(null, {
    status: 204,
    headers: { "cache-control": "private, no-store" }
  });
}
