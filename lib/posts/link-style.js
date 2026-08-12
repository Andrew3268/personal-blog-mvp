const POST_LINK_STYLE_TOKEN_RE = /^\[\[POST_LINK_STYLE\s+value="(default|external)"\]\]$/i;

export function normalizePostLinkStyle(value = "default") {
  return String(value || "").trim().toLowerCase() === "external" ? "external" : "default";
}

function parsePostLinkStyleToken(line = "") {
  const match = String(line || "").trim().match(POST_LINK_STYLE_TOKEN_RE);
  return match ? normalizePostLinkStyle(match[1]) : "";
}

export function parsePostLinkStyle(md = "") {
  let style = "default";
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
  const cleanMd = stripPostLinkStyleTokens(md);
  if (normalizedStyle !== "external") return cleanMd;
  return ['[[POST_LINK_STYLE value="external"]]', cleanMd].filter(Boolean).join("\n\n").trim();
}

export function applyPostLinkStyleToHtml(html = "", style = "default") {
  if (normalizePostLinkStyle(style) !== "external") return String(html || "");

  return String(html || "").replace(/<a\b([^>]*)>/gi, (tag, rawAttributes = "") => {
    const classMatch = String(rawAttributes).match(/\bclass\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!classMatch) return tag;

    const currentClasses = String(classMatch[2] ?? classMatch[3] ?? "")
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (!currentClasses.includes("post-content-link")) return tag;
    if (!currentClasses.includes("post-link-style--external")) {
      currentClasses.push("post-link-style--external");
    }

    const quote = classMatch[1].startsWith("'") ? "'" : '"';
    const replacement = `class=${quote}${currentClasses.join(" ")}${quote}`;
    const nextAttributes = String(rawAttributes).replace(classMatch[0], replacement);
    return `<a${nextAttributes}>`;
  });
}
