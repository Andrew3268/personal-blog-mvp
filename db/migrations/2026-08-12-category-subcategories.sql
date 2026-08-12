-- 메인/서브 카테고리 관리 기능 추가
-- 기존 posts/category 구조는 유지하고 서브 카테고리만 별도 관계 테이블로 저장합니다.

CREATE TABLE IF NOT EXISTS subcategories (
  category_name TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (category_name, name)
);

CREATE INDEX IF NOT EXISTS idx_subcategories_category_sort
ON subcategories(category_name, sort_order ASC, name ASC);

CREATE TABLE IF NOT EXISTS post_subcategories (
  post_slug TEXT PRIMARY KEY,
  category_name TEXT NOT NULL,
  subcategory_name TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_post_subcategories_category_name
ON post_subcategories(category_name, subcategory_name, post_slug);
