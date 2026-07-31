-- 카테고리명 등 표시용 메타데이터가 바뀌었을 때 HTML 캐시만 갱신하고,
-- 본문 수정일(dateModified/sitemap lastmod)은 바꾸지 않기 위한 컬럼입니다.
ALTER TABLE posts ADD COLUMN metadata_updated_at TEXT;

UPDATE posts
SET metadata_updated_at = updated_at
WHERE metadata_updated_at IS NULL OR TRIM(metadata_updated_at) = '';

CREATE INDEX IF NOT EXISTS idx_posts_metadata_updated_at
ON posts(metadata_updated_at DESC);
