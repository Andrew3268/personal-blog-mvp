export function absolutizeImageUrl(src = "", origin = "") {
  const value = String(src || "").trim();
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

function canUseCloudflareImageTransform(absolute = "", origin = "") {
  const srcHost = getHostname(absolute);
  const originHost = getHostname(origin);
  if (!srcHost || !originHost) return false;
  if (srcHost === originHost) return true;

  // pub-xxxxx.r2.dev remote URLs can return 404 through /cdn-cgi/image/.
  // Use a custom R2 subdomain such as img.wacky-wiki.com to enable same-zone transforms safely.
  if (srcHost.endsWith(".r2.dev") || srcHost === "r2.dev") return false;

  return getBaseDomain(srcHost) === getBaseDomain(originHost);
}

export function buildCfImageUrl(src = "", options = {}, origin = "") {
  const absolute = absolutizeImageUrl(src, origin);
  if (!absolute) return "";
  if (/^(data|blob):/i.test(absolute) || absolute.includes("/cdn-cgi/image/")) return absolute;
  if (!canUseCloudflareImageTransform(absolute, origin)) return absolute;

  const defaults = {
    format: "auto",
    quality: 85,
  };
  const config = { ...defaults, ...options };
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
