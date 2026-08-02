CREATE TABLE IF NOT EXISTS posts (
  slug TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  meta_description TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  cover_image_alt TEXT DEFAULT '',
  focus_keyword TEXT DEFAULT '',
  longtail_keywords_json TEXT DEFAULT '[]',
  template_name TEXT DEFAULT 'basic',
  tags_json TEXT DEFAULT '[]',
  content_md TEXT DEFAULT '',
  faq_md TEXT DEFAULT '',
  view_count INTEGER NOT NULL DEFAULT 0,
  enable_sidebar_ad INTEGER DEFAULT 0,
  enable_inarticle_ads INTEGER DEFAULT 1,
  status TEXT DEFAULT 'published',
  published_at TEXT NOT NULL,
  first_published_at TEXT DEFAULT NULL,
  metadata_updated_at TEXT DEFAULT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_updated_at ON posts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);

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

CREATE INDEX IF NOT EXISTS idx_posts_first_published_at
ON posts(first_published_at DESC);

CREATE INDEX IF NOT EXISTS idx_posts_metadata_updated_at
ON posts(metadata_updated_at DESC);


CREATE TABLE IF NOT EXISTS post_tags (
  post_slug TEXT NOT NULL,
  tag TEXT NOT NULL,
  normalized_tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (post_slug, normalized_tag),
  FOREIGN KEY (post_slug) REFERENCES posts(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_tags_normalized_tag_slug
ON post_tags(normalized_tag, post_slug);

CREATE INDEX IF NOT EXISTS idx_post_tags_post_slug_tag
ON post_tags(post_slug, tag);

CREATE TABLE IF NOT EXISTS post_view_accumulator (
  post_slug TEXT PRIMARY KEY,
  pending_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (post_slug) REFERENCES posts(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_view_accumulator_updated
ON post_view_accumulator(updated_at ASC, pending_count DESC);


CREATE TABLE IF NOT EXISTS categories (
  name TEXT PRIMARY KEY,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order ASC, name ASC);

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

CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id, expires_at DESC);

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
