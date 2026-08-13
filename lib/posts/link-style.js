const POST_LINK_STYLE_TOKEN_RE = /^\[\[POST_LINK_STYLE\s+value="(default|external)"\]\]$/i;
const EXTERNAL_LINK_STYLE_CLASS = "post-link-style--external";

export function normalizePostLinkStyle(value = "default") {
  return String(value || "").trim().toLowerCase() === "external" ? "external" : "default";
}

function parsePostLinkStyleToken(line = "") {
  const match = String(line || "").trim().match(POST_LINK_STYLE_TOKEN_RE);
  return match ? normalizePostLinkStyle(match[1]) : "";
}

function hasExternalAnchorClass(md = "") {
  return /<a\b[^>]*\bclass\s*=\s*(?:"[^"]*\bpost-link-style--external\b[^"]*"|'[^']*\bpost-link-style--external\b[^']*')[^>]*>/i.test(String(md || ""));
}

function rewriteAnchorTagClass(tag = "", style = "default") {
  const normalizedStyle = normalizePostLinkStyle(style);
  return String(tag || "").replace(/^<a\b([\s\S]*?)>$/i, (fullTag, rawAttributes = "") => {
    let attributes = String(rawAttributes || "");
    const classMatch = attributes.match(/\sclass\s*=\s*("([^"]*)"|'([^']*)')/i);
    let classes = classMatch
      ? String(classMatch[2] ?? classMatch[3] ?? "").split(/\s+/).map((item) => item.trim()).filter(Boolean)
      : [];

    classes = classes.filter((item) => item !== EXTERNAL_LINK_STYLE_CLASS);
    if (normalizedStyle === "external") classes.push(EXTERNAL_LINK_STYLE_CLASS);
    classes = Array.from(new Set(classes));

    if (classMatch) {
      if (classes.length) {
        const quote = classMatch[1].startsWith("'") ? "'" : '"';
        attributes = attributes.replace(classMatch[0], ` class=${quote}${classes.join(" ")}${quote}`);
      } else {
        attributes = attributes.replace(classMatch[0], "");
      }
    } else if (classes.length) {
      attributes = ` class="${classes.join(" ")}"${attributes}`;
    }

    return `<a${attributes}>`;
  });
}

export function updatePostAnchorStyleClasses(md = "", style = "default") {
  return String(md || "").replace(/<a\b[^>]*>/gi, (tag) => rewriteAnchorTagClass(tag, style));
}

export function parsePostLinkStyle(md = "") {
  let style = hasExternalAnchorClass(md) ? "external" : "default";
  String(md || "").split("\n").forEach((line) => {
    const parsed = parsePostLinkStyleToken(line);
    if (parsed) style = parsed;
  });
  return style;
}

export function stripPostLinkStyleTokens(md = "") {
  return String(md || "")
    .split("\n")
    .filter((line) => !parsePostLinkStyleToken(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function setPostLinkStyleToken(md = "", style = "default") {
  const normalizedStyle = normalizePostLinkStyle(style);
  const cleanMd = updatePostAnchorStyleClasses(stripPostLinkStyleTokens(md), normalizedStyle);
  if (normalizedStyle !== "external") return cleanMd;
  return ['[[POST_LINK_STYLE value="external"]]', cleanMd].filter(Boolean).join("\n\n").trim();
}

export function applyPostLinkStyleToHtml(html = "", style = "default") {
  const normalizedStyle = normalizePostLinkStyle(style);
  return String(html || "").replace(/<a\b([^>]*)>/gi, (tag, rawAttributes = "") => {
    const classMatch = String(rawAttributes).match(/\bclass\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!classMatch) return tag;

    let currentClasses = String(classMatch[2] ?? classMatch[3] ?? "")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (!currentClasses.includes("post-content-link")) return tag;
    currentClasses = currentClasses.filter((item) => item !== EXTERNAL_LINK_STYLE_CLASS);
    if (normalizedStyle === "external") currentClasses.push(EXTERNAL_LINK_STYLE_CLASS);
    currentClasses = Array.from(new Set(currentClasses));

    const quote = classMatch[1].startsWith("'") ? "'" : '"';
    const replacement = `class=${quote}${currentClasses.join(" ")}${quote}`;
    const nextAttributes = String(rawAttributes).replace(classMatch[0], replacement);
    return `<a${nextAttributes}>`;
  });
}
