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

function isR2DevUrl(url = "") {
  const host = getHostname(url);
  return host.endsWith(".r2.dev") || host === "r2.dev";
}

function canUseCloudflareImageTransform(absolute = "", origin = "") {
  const normalized = unwrapCfImageUrl(absolute);
  const srcHost = getHostname(normalized);
  const originHost = getHostname(origin);
  if (!srcHost || !originHost) return false;

  // pub-xxxxx.r2.dev remote URLs can return 404 through /cdn-cgi/image/.
  // Use a custom R2 subdomain such as img.wacky-wiki.com to enable same-zone transforms safely.
  if (isR2DevUrl(normalized)) return false;

  if (srcHost === originHost) return true;
  return getBaseDomain(srcHost) === getBaseDomain(originHost);
}

export function buildCfImageUrl(src = "", options = {}, origin = "") {
  const absolute = absolutizeImageUrl(src, origin);
  if (!absolute) return "";
  if (/^(data|blob):/i.test(absolute)) return absolute;
  if (!canUseCloudflareImageTransform(absolute, origin)) return absolute;

  const config = { format: "auto", quality: 85, ...options };
  const params = [];
  Object.entries(config).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") return;
    params.push(`${key}=${value}`);
  });
  return `/cdn-cgi/image/${params.join(",")}/${absolute}`;
}

export function buildResponsiveImageSet(src = "", config = {}, origin = "") {
  const widths = Array.isArray(config.widths) && config.widths.length ? config.widths : [480, 768, 960, 1280];
  const sizes = String(config.sizes || "100vw");
  const baseOptions = {
    fit: config.fit || "scale-down",
    format: config.format || "auto",
    quality: config.quality || 85,
  };

  const absolute = absolutizeImageUrl(src, origin);
  const normalized = [...new Set(widths.map((value) => Math.max(1, parseInt(value, 10) || 0)).filter(Boolean))].sort((a, b) => a - b);
  const transformed = canUseCloudflareImageTransform(absolute, origin);
  const srcset = transformed
    ? normalized.map((width) => `${buildCfImageUrl(src, { ...baseOptions, width }, origin)} ${width}w`).join(", ")
    : "";

  const fallbackWidth = config.fallbackWidth || normalized[Math.min(1, normalized.length - 1)] || 768;
  const srcUrl = buildCfImageUrl(src, { ...baseOptions, width: fallbackWidth }, origin);
  return {
    src: srcUrl,
    srcset,
    sizes,
    original: absolute,
  };
}

export function buildImageAttrs(src = "", config = {}, origin = "") {
  const image = buildResponsiveImageSet(src, config, origin);
  const fallbackSrc = image.original || absolutizeImageUrl(src, origin);
  const attrs = [
    `src="${escapeAttr(image.src)}"`,
    image.srcset ? `srcset="${escapeAttr(image.srcset)}"` : "",
    image.sizes ? `sizes="${escapeAttr(image.sizes)}"` : "",
    fallbackSrc ? `data-original-src="${escapeAttr(fallbackSrc)}"` : "",
    fallbackSrc ? `onerror="this.onerror=null;this.removeAttribute('srcset');this.src=this.dataset.originalSrc;"` : "",
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
