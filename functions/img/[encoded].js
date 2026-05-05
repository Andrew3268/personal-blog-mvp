const ONE_YEAR = 60 * 60 * 24 * 365;
const CACHE_CONTROL = `public, max-age=${ONE_YEAR}, immutable`;

function decodeBase64Url(value = "") {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isAllowedImageSource(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" && (host.endsWith(".r2.dev") || host === "r2.dev");
  } catch {
    return false;
  }
}

function buildCachedImageResponse(upstreamResponse) {
  const headers = new Headers();
  const contentType = upstreamResponse.headers.get("content-type") || "application/octet-stream";
  headers.set("content-type", contentType);
  headers.set("cache-control", CACHE_CONTROL);
  headers.set("x-content-type-options", "nosniff");
  headers.set("access-control-allow-origin", "*");

  const etag = upstreamResponse.headers.get("etag");
  const lastModified = upstreamResponse.headers.get("last-modified");
  if (etag) headers.set("etag", etag);
  if (lastModified) headers.set("last-modified", lastModified);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  });
}

export async function onRequestGet({ params, request }) {
  const encoded = String(params.encoded || "").trim();
  if (!encoded) return new Response("Missing image", { status: 400 });

  let sourceUrl = "";
  try {
    sourceUrl = decodeBase64Url(encoded);
  } catch {
    return new Response("Invalid image", { status: 400 });
  }

  if (!isAllowedImageSource(sourceUrl)) {
    return new Response("Image source not allowed", { status: 403 });
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const hit = new Response(cached.body, cached);
    hit.headers.set("x-image-proxy-cache", "HIT");
    return hit;
  }

  const upstream = await fetch(sourceUrl, {
    headers: {
      accept: request.headers.get("accept") || "image/avif,image/webp,image/*,*/*;q=0.8",
    },
    cf: {
      cacheEverything: true,
      cacheTtl: ONE_YEAR,
    },
  });

  if (!upstream.ok) {
    return new Response("Image fetch failed", {
      status: upstream.status,
      headers: {
        "cache-control": "public, max-age=60",
      },
    });
  }

  const response = buildCachedImageResponse(upstream);
  response.headers.set("x-image-proxy-cache", "MISS");
  await cache.put(cacheKey, response.clone());
  return response;
}
