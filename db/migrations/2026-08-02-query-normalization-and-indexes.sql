-- 2차 성능 개선: 런타임 쿼리가 컬럼 함수 없이 인덱스를 사용할 수 있도록
-- 기존 게시글 데이터를 정규화하고 실제 조회 패턴에 맞는 복합 인덱스를 구성합니다.
-- 코드 배포 전에 운영 D1에서 먼저 실행하세요.

CREATE TABLE IF NOT EXISTS categories (
  name TEXT PRIMARY KEY,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_sort_order
ON categories(sort_order ASC, name ASC);

-- 카테고리의 앞뒤 공백, 줄바꿈, 탭, 반복 공백을 제거합니다.
UPDATE posts
SET category = TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(category, ''), char(9), ' '), char(10), ' '), char(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '))
WHERE category IS NULL
   OR category <> TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(category, ''), char(9), ' '), char(10), ' '), char(13), ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '), '  ', ' '));

-- 기존 글에만 존재하는 카테고리가 있다면 카테고리 관리 테이블에도 보존합니다.
WITH missing_categories AS (
  SELECT DISTINCT p.category AS name
  FROM posts p
  WHERE p.category <> ''
    AND NOT EXISTS (
      SELECT 1
      FROM categories c
      WHERE c.name = p.category
    )
),
base_sort AS (
  SELECT COALESCE(MAX(sort_order), 0) AS max_sort
  FROM categories
),
ranked_categories AS (
  SELECT
    name,
    ROW_NUMBER() OVER (ORDER BY name COLLATE NOCASE ASC) AS row_num
  FROM missing_categories
)
INSERT OR IGNORE INTO categories (name, sort_order, created_at, updated_at)
SELECT
  ranked_categories.name,
  base_sort.max_sort + ranked_categories.row_num,
  datetime('now'),
  datetime('now')
FROM ranked_categories
CROSS JOIN base_sort;

-- published_at은 항상 유효한 UTC ISO 문자열을 갖도록 보정합니다.
UPDATE posts
SET published_at = COALESCE(
  strftime('%Y-%m-%dT%H:%M:%fZ', NULLIF(TRIM(published_at), '')),
  strftime('%Y-%m-%dT%H:%M:%fZ', NULLIF(TRIM(first_published_at), '')),
  strftime('%Y-%m-%dT%H:%M:%fZ', NULLIF(TRIM(updated_at), '')),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

-- 공개 글은 first_published_at이 반드시 존재하도록 하고,
-- 아직 공개하지 않은 초안은 실제 최초 공개일이 없으면 NULL을 유지합니다.
UPDATE posts
SET first_published_at = CASE
  WHEN status = 'published' THEN COALESCE(
    strftime('%Y-%m-%dT%H:%M:%fZ', NULLIF(TRIM(first_published_at), '')),
    published_at
  )
  WHEN first_published_at IS NULL OR TRIM(first_published_at) = '' THEN NULL
  ELSE strftime('%Y-%m-%dT%H:%M:%fZ', first_published_at)
END;

-- 조회수는 NULL이나 음수가 아닌 0 이상의 정수로 통일합니다.
UPDATE posts
SET view_count = CASE
  WHEN CAST(COALESCE(view_count, 0) AS INTEGER) < 0 THEN 0
  ELSE CAST(COALESCE(view_count, 0) AS INTEGER)
END
WHERE view_count IS NULL
   OR typeof(view_count) <> 'integer'
   OR view_count < 0;

-- 이전 정렬 기준용 복합 인덱스를 새 쿼리 순서에 맞게 교체합니다.
DROP INDEX IF EXISTS idx_posts_status_updated;
DROP INDEX IF EXISTS idx_posts_status_category_published;
DROP INDEX IF EXISTS idx_posts_status_view_count;

CREATE INDEX IF NOT EXISTS idx_posts_status_updated_first_published
ON posts(status, updated_at DESC, first_published_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_status_first_published_updated
ON posts(status, first_published_at DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_status_category_updated_first_published
ON posts(status, category, updated_at DESC, first_published_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_status_category_first_published_updated
ON posts(status, category, first_published_at DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_status_view_updated_first_published
ON posts(status, view_count DESC, updated_at DESC, first_published_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_status_category_view_updated_first_published
ON posts(status, category, view_count DESC, updated_at DESC, first_published_at DESC);
