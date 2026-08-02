-- 요청 처리 중 실행하던 테이블 생성 및 기본 데이터 입력을 배포 단계로 이동합니다.
-- 여러 번 실행해도 기존 관리자, 카테고리, 설정 데이터는 변경되지 않습니다.

CREATE TABLE IF NOT EXISTS categories (
  name TEXT PRIMARY KEY,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_sort_order
ON categories(sort_order ASC, name ASC);

INSERT OR IGNORE INTO categories (name, sort_order, created_at, updated_at) VALUES
  ('생활 꿀팁', 1, datetime('now'), datetime('now')),
  ('살림 노하우', 2, datetime('now'), datetime('now')),
  ('청소', 3, datetime('now'), datetime('now')),
  ('주방', 4, datetime('now'), datetime('now')),
  ('욕실', 5, datetime('now'), datetime('now')),
  ('세탁', 6, datetime('now'), datetime('now')),
  ('정리수납', 7, datetime('now'), datetime('now')),
  ('리뷰', 8, datetime('now'), datetime('now')),
  ('쇼핑', 9, datetime('now'), datetime('now')),
  ('반려동물', 10, datetime('now'), datetime('now')),
  ('건강', 11, datetime('now'), datetime('now')),
  ('디지털', 12, datetime('now'), datetime('now'));

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id
ON admin_sessions(admin_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS admin_login_attempts (
  attempt_key TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  locked_until TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO site_settings (key, value, updated_at)
VALUES ('index_sidebar_ad_enabled', '0', datetime('now'));
