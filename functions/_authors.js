import { canonicalCategoryName } from "./_category-utils.js";

export const SITE_ORIGIN = "https://wacky-wiki.com";

export const AUTHOR_PROFILES = Object.freeze({
  "wacky-wiki": Object.freeze({
    key: "wacky-wiki",
    name: "Wacky Wiki",
    href: "/about/",
    category: "",
    type: "Organization",
    description: "생활·기술·반려생활의 선택을 더 명확하게 정리하는 Wacky Wiki 편집부입니다."
  }),
  "life-archiver": Object.freeze({
    key: "life-archiver",
    name: "Life.Archiver",
    href: "/author/life-archiver/",
    category: "Life",
    type: "Organization",
    description: "집안일, 생활 관리, 생활가전과 제도 정보를 실제 생활에서 활용하기 쉬운 기준으로 정리하는 Wacky Wiki의 Life 분야 편집 주체입니다."
  }),
  "tech-archiver": Object.freeze({
    key: "tech-archiver",
    name: "Tech.Archiver",
    href: "/author/tech-archiver/",
    category: "Tech",
    type: "Organization",
    description: "생활가전과 디지털 기기의 스펙, 기능 차이와 실제 사용 맥락을 비교해 구매 판단 기준을 정리하는 Wacky Wiki의 Tech 분야 편집 주체입니다."
  }),
  "pet-archiver": Object.freeze({
    key: "pet-archiver",
    name: "Pet.Archiver",
    href: "/author/pet-archiver/",
    category: "Pet",
    type: "Organization",
    description: "반려동물 사료, 용품, 표시 정보와 관리 기준을 공식 자료 중심으로 확인해 이해하기 쉽게 정리하는 Wacky Wiki의 Pet 분야 편집 주체입니다."
  })
});

export const AUTHOR_KEYS = Object.freeze(Object.keys(AUTHOR_PROFILES));

export function defaultAuthorKeyForCategory(category = "") {
  const canonical = canonicalCategoryName(category).toLowerCase();
  if (canonical === "life") return "life-archiver";
  if (canonical === "tech") return "tech-archiver";
  if (canonical === "pet") return "pet-archiver";
  return "wacky-wiki";
}

export function normalizeAuthorKey(value = "") {
  const key = String(value || "").trim().toLowerCase();
  return AUTHOR_PROFILES[key] ? key : "";
}

export function getAuthorProfile(authorKey = "", category = "") {
  const key = normalizeAuthorKey(authorKey) || defaultAuthorKeyForCategory(category);
  return AUTHOR_PROFILES[key] || AUTHOR_PROFILES["wacky-wiki"];
}

export function getAuthorEntityId(profile, origin = SITE_ORIGIN) {
  if (!profile || profile.key === "wacky-wiki") return `${origin}/#organization`;
  return `${origin}${profile.href}#author`;
}
