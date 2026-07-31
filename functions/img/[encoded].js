const ONE_YEAR = 60 * 60 * 24 * 365;
const CACHE_CONTROL = `public, max-age=${ONE_YEAR}, immutable`;
const ALLOWED_FITS = new Set(["scale-down", "contain", "cover", "crop", "pad"]);

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

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function negotiateFormat(request, requestedFormat) {
  const format = String(requestedFormat || "").toLowerCase();
  if (format && format !== "auto" && ["avif", "webp"].includes(format)) return format;
  const accept = String(request.headers.get("accept") || "").toLowerCase();
  if (accept.includes("image/avif")) return "avif";
  if (accept.includes("image/webp")) return "webp";
  return "";
}

function getTransformOptions(request) {
  const url = new URL(request.url);
  const width = clampInt(url.searchParams.get("width"), 0, 0, 2400);
  const quality = clampInt(url.searchParams.get("quality"), 82, 40, 95);
  const fitParam = String(url.searchParams.get("fit") || "scale-down");
  const fit = ALLOWED_FITS.has(fitParam) ? fitParam : "scale-down";
  const format = negotiateFormat(request, url.searchParams.get("format"));
  const image = {};
  if (width) image.width = width;
  if (quality) image.quality = quality;
  if (fit) image.fit = fit;
  if (format) image.format = format;
  return { image, format, hasTransform: Boolean(width || format || quality !== 82 || fit !== "scale-down") };
}

function buildCachedImageResponse(upstreamResponse, { varyAccept = false } = {}) {
  const headers = new Headers();
  const contentType = upstreamResponse.headers.get("content-type") || "application/octet-stream";
  headers.set("content-type", contentType);
  headers.set("cache-control", CACHE_CONTROL);
  headers.set("x-content-type-options", "nosniff");
  headers.set("access-control-allow-origin", "*");
  if (varyAccept) headers.set("vary", "Accept");

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

async function fetchOriginal(sourceUrl, request) {
  return fetch(sourceUrl, {
    headers: {
      accept: request.headers.get("accept") || "image/avif,image/webp,image/*,*/*;q=0.8",
    },
    cf: {
      cacheEverything: true,
      cacheTtl: ONE_YEAR,
    },
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

  const transform = getTransformOptions(request);
  const cache = caches.default;
  const cacheKeyUrl = new URL(request.url);
  if (String(cacheKeyUrl.searchParams.get("format") || "").toLowerCase() === "auto") {
    cacheKeyUrl.searchParams.set("__negotiated_format", transform.format || "original");
  }
  const cacheKey = new Request(cacheKeyUrl.toString(), request);
  const cached = await cache.match(cacheKey);
  if (cached) {
    const hit = new Response(cached.body, cached);
    hit.headers.set("x-image-proxy-cache", "HIT");
    return hit;
  }

  let upstream;
  if (transform.hasTransform) {
    upstream = await fetch(sourceUrl, {
      headers: {
        accept: request.headers.get("accept") || "image/avif,image/webp,image/*,*/*;q=0.8",
      },
      cf: {
        image: transform.image,
        cacheEverything: true,
        cacheTtl: ONE_YEAR,
      },
    }).catch(() => null);
  }

  if (!upstream || !upstream.ok) {
    upstream = await fetchOriginal(sourceUrl, request);
  }

  if (!upstream.ok) {
    return new Response("Image fetch failed", {
      status: upstream.status,
      headers: {
        "cache-control": "public, max-age=60",
      },
    });
  }

  const response = buildCachedImageResponse(upstream, {
    varyAccept: String(new URL(request.url).searchParams.get("format") || "").toLowerCase() === "auto"
  });
  response.headers.set("x-image-proxy-cache", "MISS");
  await cache.put(cacheKey, response.clone());
  return response;
}
