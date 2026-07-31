export function unwrapCfImageUrl(src = "") {
  const value = String(src || "").trim();
  if (!value || !value.includes("/cdn-cgi/image/")) return value;

  const marker = "/cdn-cgi/image/";
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return value;

  const afterMarker = value.slice(markerIndex + marker.length);
  const optionEnd = afterMarker.indexOf("/");
  if (optionEnd < 0) return value;

  const embedded = afterMarker.slice(optionEnd + 1);
  if (!embedded) return value;
  return embedded;
}

export function absolutizeImageUrl(src = "", origin = "") {
  const unwrapped = unwrapCfImageUrl(src);
  const value = String(unwrapped || "").trim();
  if (!value) return "";
  if (/^(data|blob):/i.test(value)) return value;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (!origin) return value;
  try {
    return new URL(value, origin).toString();
  } catch {
    return value;
  }
}

function getHostname(url = "") {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}

function getBaseDomain(hostname = "") {
  const parts = String(hostname || "").toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

function isLocalOrigin(origin = "") {
  const host = getHostname(origin);
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
}


function isImageProxyUrl(url = "", origin = "") {
  const value = String(url || "").trim();
  if (!value) return false;
  try {
    const parsed = new URL(value, origin || undefined);
    return parsed.pathname.startsWith("/img/");
  } catch {
    return value.startsWith("/img/") || value.includes("/img/");
  }
}

function isR2DevUrl(url = "") {
  const raw = String(url || "").toLowerCase();
  const normalized = unwrapCfImageUrl(raw).toLowerCase();
  const host = getHostname(normalized);
  return raw.includes(".r2.dev") || normalized.includes(".r2.dev") || host.endsWith(".r2.dev") || host === "r2.dev";
}

function encodeBase64Url(value = "") {
  const bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function addProxyTransformParams(urlValue, options = {}) {
  if (!urlValue) return urlValue;
  if (!options || !Object.keys(options).length) return urlValue;
  try {
    const url = new URL(urlValue, "https://image-proxy.invalid");
    const width = Math.max(0, Math.min(2400, Number.parseInt(options.width, 10) || 0));
    const quality = Math.max(40, Math.min(95, Number.parseInt(options.quality, 10) || 82));
    const allowedFits = new Set(["scale-down", "contain", "cover", "crop", "pad"]);
    const fit = allowedFits.has(String(options.fit || "")) ? String(options.fit) : "scale-down";
    if (width) url.searchParams.set("width", String(width));
    if (quality) url.searchParams.set("quality", String(quality));
    url.searchParams.set("fit", fit);
    url.searchParams.set("format", String(options.format || "auto"));
    if (url.origin === "https://image-proxy.invalid") return `${url.pathname}${url.search}`;
    return url.toString();
  } catch {
    return urlValue;
  }
}

export function buildImageProxyUrl(src = "", origin = "", options = {}) {
  const absolute = absolutizeImageUrl(src, origin);
  if (!absolute || /^(data|blob):/i.test(absolute)) return absolute;
  if (!isR2DevUrl(absolute)) return absolute;

  const encoded = encodeBase64Url(absolute);
  const path = `/img/${encoded}`;
  if (!origin) return addProxyTransformParams(path, options);
  try {
    return addProxyTransformParams(new URL(path, origin).toString(), options);
  } catch {
    return addProxyTransformParams(path, options);
  }
}

function canUseCloudflareImageTransform(absolute = "", origin = "") {
  const normalized = unwrapCfImageUrl(absolute);

  // 중요: /img/*는 Pages Function 프록시 경로입니다.
  // Cloudflare Image Resizing이 이 내부 프록시 URL을 다시 원본으로 가져오면
  // /cdn-cgi/image/.../https://도메인/img/... 형태에서 404가 발생할 수 있습니다.
  // 따라서 R2 이미지는 /img 프록시 + 장기 캐시만 적용하고, /cdn-cgi/image 변환은 우회합니다.
  if (isImageProxyUrl(normalized, origin)) return false;

  const srcHost = getHostname(normalized);
  const originHost = getHostname(origin);
  if (!srcHost || !originHost) return false;
  if (isLocalOrigin(origin)) return false;

  if (srcHost === originHost) return true;
  return getBaseDomain(srcHost) === getBaseDomain(originHost);
}

export function buildCfImageUrl(src = "", options = {}, origin = "") {
  const raw = String(src || "").trim();
  const absolute = absolutizeImageUrl(raw, origin);
  if (!absolute) return "";
  if (/^(data|blob):/i.test(absolute)) return absolute;

  if (isR2DevUrl(absolute)) {
    return buildImageProxyUrl(absolute, origin, options);
  }

  const deliveryUrl = absolute;
  if (!deliveryUrl) return "";
  if (!canUseCloudflareImageTransform(deliveryUrl, origin)) return deliveryUrl;

  const config = { format: "auto", quality: 82, ...options };
  const params = [];
  Object.entries(config).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    params.push(`${key}=${value}`);
  });
  return `/cdn-cgi/image/${params.join(",")}/${deliveryUrl}`;
}

export function buildResponsiveImageSet(src = "", config = {}, origin = "") {
  const widths = Array.isArray(config.widths) && config.widths.length ? config.widths : [320, 640, 960, 1200];
  const sizes = String(config.sizes || "100vw");
  const baseOptions = {
    fit: config.fit || "scale-down",
    format: config.format || "auto",
    quality: config.quality || 82,
  };

  const absolute = absolutizeImageUrl(src, origin);
  const isR2 = isR2DevUrl(absolute);
  const deliveryUrl = isR2 ? buildImageProxyUrl(absolute, origin) : absolute;
  const normalized = [...new Set(widths.map((value) => Math.max(1, parseInt(value, 10) || 0)).filter(Boolean))].sort((a, b) => a - b);
  const transformed = isR2 || canUseCloudflareImageTransform(deliveryUrl, origin);
  const srcset = transformed
    ? normalized.map((width) => `${buildCfImageUrl(src, { ...baseOptions, width }, origin)} ${width}w`).join(", ")
    : "";

  const fallbackWidth = config.fallbackWidth || normalized[Math.min(1, normalized.length - 1)] || 640;
  const srcUrl = buildCfImageUrl(src, { ...baseOptions, width: fallbackWidth }, origin);
  return {
    src: srcUrl,
    srcset,
    sizes,
    original: deliveryUrl || absolute,
    directOriginal: absolute,
  };
}

export function buildImageAttrs(src = "", config = {}, origin = "") {
  const image = buildResponsiveImageSet(src, config, origin);
  const fallbackSrc = image.original || absolutizeImageUrl(src, origin);
  const directFallbackSrc = image.directOriginal && image.directOriginal !== fallbackSrc ? image.directOriginal : "";
  const needsFallback = (image.src && image.src !== fallbackSrc) || directFallbackSrc;
  const attrs = [
    `src="${escapeAttr(image.src)}"`,
    image.srcset ? `srcset="${escapeAttr(image.srcset)}"` : "",
    image.sizes ? `sizes="${escapeAttr(image.sizes)}"` : "",
    fallbackSrc ? `data-original-src="${escapeAttr(fallbackSrc)}"` : "",
    directFallbackSrc ? `data-direct-src="${escapeAttr(directFallbackSrc)}"` : "",
    needsFallback ? `onerror="this.removeAttribute('srcset');if(this.dataset.fallbackStep!=='proxy'&&this.dataset.originalSrc&&this.src!==this.dataset.originalSrc){this.dataset.fallbackStep='proxy';this.src=this.dataset.originalSrc;return;}if(this.dataset.directSrc&&this.src!==this.dataset.directSrc){this.dataset.fallbackStep='direct';this.src=this.dataset.directSrc;return;}this.onerror=null;"` : "",
  ].filter(Boolean).join(" ");
  return { ...image, attrs };
}

function escapeAttr(value = "") {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
