import { readFile } from "node:fs/promises";

const measurementId = "G-5Q2QJT68Y4";
const required = [
  "functions/_home-renderer.js",
  "functions/post/[slug].js",
  "public/index.html",
  "public/404.html",
  "public/about/index.html",
  "public/privacy-policy/index.html",
  "public/author/life-archiver/index.html",
  "public/author/tech-archiver/index.html",
  "public/author/pet-archiver/index.html"
];
const excluded = [
  "public/admin/index.html",
  "public/admin/dashboard.html",
  "public/admin/categories.html",
  "public/admin/posts.html",
  "public/add.html",
  "public/edit.html"
];

for (const file of required) {
  const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  if (!text.includes(measurementId) && !text.includes("googleAnalyticsTag")) {
    throw new Error(`Google Analytics tag missing: ${file}`);
  }
}

for (const file of excluded) {
  const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  if (text.includes(measurementId)) {
    throw new Error(`Google Analytics must not be included in admin/editor page: ${file}`);
  }
}

console.log("Google Analytics public-page coverage verified.");
