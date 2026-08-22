import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const functionsDir = path.join(root, "functions");
const configPath = path.join(functionsDir, "_cache-config.js");

if (!fs.existsSync(configPath)) {
  console.error("[cache-config] Missing functions/_cache-config.js");
  process.exit(1);
}

const config = fs.readFileSync(configPath, "utf8");
for (const name of ["ARCHIVE_CACHE_VERSION", "POST_CACHE_VERSION"]) {
  if (!new RegExp(`export\\s+const\\s+${name}\\s*=`).test(config)) {
    console.error(`[cache-config] Missing exported ${name}`);
    process.exit(1);
  }
}

const offenders = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && entry.name.endsWith(".js") && full !== configPath) {
      const text = fs.readFileSync(full, "utf8");
      if (/\b(?:const|let|var)\s+(?:ARCHIVE_CACHE_VERSION|POST_CACHE_VERSION)\s*=/.test(text)) {
        offenders.push(path.relative(root, full));
      }
    }
  }
}
walk(functionsDir);

if (offenders.length) {
  console.error("[cache-config] Cache versions must only be declared in functions/_cache-config.js:");
  offenders.forEach((file) => console.error(` - ${file}`));
  process.exit(1);
}

const requiredImports = [
  ["functions/_home-renderer.js", "ARCHIVE_CACHE_VERSION"],
  ["functions/_cache-invalidation.js", "ARCHIVE_CACHE_VERSION"],
  ["functions/_cache-invalidation.js", "POST_CACHE_VERSION"],
  ["functions/post/[slug].js", "POST_CACHE_VERSION"],
];
for (const [file, name] of requiredImports) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  if (!text.includes(name) || !text.includes("_cache-config.js")) {
    console.error(`[cache-config] ${file} must import ${name} from _cache-config.js`);
    process.exit(1);
  }
}

console.log("[cache-config] Shared archive/post cache versions verified.");
