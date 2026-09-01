import fs from "node:fs";

const ID = "G-5K45FBBVD0";
const staticPublic = [
  "public/index.html",
  "public/404.html",
  "public/about/index.html",
  "public/privacy-policy/index.html",
  "public/author/life-archiver/index.html",
  "public/author/tech-archiver/index.html",
  "public/author/pet-archiver/index.html"
];
const adminFiles = [
  "public/admin/index.html",
  "public/admin/dashboard.html",
  "public/admin/categories.html",
  "public/admin/posts.html",
  "public/add.html",
  "public/edit.html"
];

function fail(message) {
  console.error(`GA verification failed: ${message}`);
  process.exit(1);
}

for (const file of staticPublic) {
  const html = fs.readFileSync(file, "utf8");
  const idCount = html.split(ID).length - 1;
  if (idCount !== 2) fail(`${file} must contain ${ID} exactly twice (loader + config), found ${idCount}`);
  const headIndex = html.indexOf("<head>");
  const tagIndex = html.indexOf("<!-- Google tag (gtag.js) -->");
  const firstMeta = html.indexOf("<meta", headIndex);
  if (!(headIndex >= 0 && tagIndex > headIndex && (firstMeta < 0 || tagIndex < firstMeta))) {
    fail(`${file} Google tag must be immediately after <head> and before metadata`);
  }
}

for (const file of adminFiles) {
  const html = fs.readFileSync(file, "utf8");
  if (html.includes(ID) || html.includes("googletagmanager.com/gtag/js")) {
    fail(`${file} must not include Google Analytics`);
  }
}

for (const file of ["functions/post/[slug].js", "functions/_home-renderer.js"]) {
  const source = fs.readFileSync(file, "utf8");
  if (!source.includes("googleAnalyticsTag")) fail(`${file} does not call googleAnalyticsTag()`);
}

const utils = fs.readFileSync("functions/_utils.js", "utf8");
if (!utils.includes(`GOOGLE_ANALYTICS_MEASUREMENT_ID = "${ID}"`)) fail("shared GA measurement ID missing");

console.log(`Google Analytics verification passed for ${ID}.`);
