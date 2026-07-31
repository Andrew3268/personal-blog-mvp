-- 기존 D1 데이터베이스에 최초 공개일 컬럼을 추가합니다.
-- 이미 컬럼이 존재하는 환경에서는 이 파일을 다시 실행하지 마세요.
ALTER TABLE posts ADD COLUMN first_published_at TEXT;

UPDATE posts
SET first_published_at = published_at
WHERE status = 'published'
  AND (first_published_at IS NULL OR TRIM(first_published_at) = '');

CREATE INDEX IF NOT EXISTS idx_posts_first_published_at
ON posts(first_published_at DESC);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  attempt_key TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);
