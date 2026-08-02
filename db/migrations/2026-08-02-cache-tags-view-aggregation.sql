-- 3차 성능 보완
-- 1) JSON 태그 검색을 관계형 태그 테이블로 분리
-- 2) 조회수를 일정 단위로 posts에 합산하는 누적 테이블 추가

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

WITH raw_tags AS (
  SELECT
    p.slug AS post_slug,
    trim(
      replace(
        replace(
          replace(CAST(j.value AS TEXT), char(9), ' '),
          char(10), ' '
        ),
        char(13), ' '
      )
    ) AS raw_tag
  FROM posts p
  JOIN json_each(
    CASE
      WHEN json_valid(p.tags_json) THEN p.tags_json
      ELSE '[]'
    END
  ) AS j
  WHERE j.type = 'text'
),
cleaned_tags AS (
  SELECT
    post_slug,
    ltrim(
      replace(
        replace(
          replace(
            replace(raw_tag, '  ', ' '),
            '  ', ' '
          ),
          '  ', ' '
        ),
        '  ', ' '
      ),
      '#'
    ) AS tag
  FROM raw_tags
)
INSERT OR IGNORE INTO post_tags (post_slug, tag, normalized_tag, created_at)
SELECT
  post_slug,
  tag,
  lower(tag),
  datetime('now')
FROM cleaned_tags
WHERE tag <> '';

CREATE TABLE IF NOT EXISTS post_view_accumulator (
  post_slug TEXT PRIMARY KEY,
  pending_count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (post_slug) REFERENCES posts(slug) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_post_view_accumulator_updated
ON post_view_accumulator(updated_at ASC, pending_count DESC);
