import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

const appCss = join(ROOT, "public/assets/css/app.css");
if (!existsSync(appCss)) fail("public/assets/css/app.css가 없습니다.");

const cssDir = join(ROOT, "public/assets/css");
const cssFiles = await readdir(cssDir);
for (const name of cssFiles) {
  if (/^app-.+\.css$/i.test(name)) {
    fail(`수동 버전 CSS가 남아 있습니다: public/assets/css/${name}`);
  }
}

const headersPath = join(ROOT, "public/_headers");
const headers = await readFile(headersPath, "utf8");
if (/\/assets\/(?:css|js)\/\*[\s\S]{0,160}?Cache-Control:\s*[^\n]*immutable/i.test(headers)) {
  fail("변경 가능한 CSS/JS 경로에 immutable 캐시가 설정되어 있습니다.");
}
if (/\/assets\/(?:css|js)\/\*[\s\S]{0,160}?max-age\s*=\s*(?:31536000|31556952)/i.test(headers)) {
  fail("변경 가능한 CSS/JS 경로에 1년 브라우저 캐시가 설정되어 있습니다.");
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

for (const base of [join(ROOT, "public"), join(ROOT, "functions")]) {
  for (const file of await walk(base)) {
    if (!/\.(?:html|js|css|json|txt)$/i.test(file)) continue;
    const text = await readFile(file, "utf8");
    if (/\/assets\/css\/app-[^\s"')>]+\.css/i.test(text)) {
      fail(`수동 버전 app CSS 참조가 남아 있습니다: ${relative(ROOT, file)}`);
    }
    if (/\/assets\/(?:css|js)\/[^\s"')>]+\.(?:css|js)\?v=/i.test(text)) {
      fail(`수동 ?v= 자산 버전이 남아 있습니다: ${relative(ROOT, file)}`);
    }
  }
}

if (failures.length) {
  console.error("[asset-cache] 검증 실패");
  for (const item of failures) console.error(`- ${item}`);
  process.exit(1);
}

console.log("[asset-cache] OK: Pages 기본 캐시 + 단일 app.css 정책이 유지되고 있습니다.");
