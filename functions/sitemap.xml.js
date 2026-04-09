export async function onRequestGet({ env, request }) {
  const origin = new URL(request.url).origin;
  const rows = await env.BLOG_DB.prepare(`
    SELECT slug, updated_at
    FROM posts
    WHERE status = 'published'
    ORDER BY updated_at DESC
    LIMIT 1000
  `).all();

  const items = rows.results || [];
  const urls = [
    `${origin}/`,
    `${origin}/about/`
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${urls.map(url => `<url><loc>${url}</loc></url>`).join('')}
  ${items.map(item => `<url><loc>${origin}/post/${encodeURIComponent(item.slug)}</loc><lastmod>${String(item.updated_at || '').slice(0,10)}</lastmod></url>`).join('')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600'
    }
  });
}
