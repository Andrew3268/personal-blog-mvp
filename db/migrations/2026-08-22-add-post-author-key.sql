-- Decouple the public article author from the category name.
ALTER TABLE posts ADD COLUMN author_key TEXT NOT NULL DEFAULT 'wacky-wiki';

-- Backfill current canonical categories. Legacy categories intentionally fall
-- back to the Wacky Wiki organization until an editor assigns an author.
UPDATE posts
SET author_key = CASE LOWER(TRIM(category))
  WHEN 'life' THEN 'life-archiver'
  WHEN 'tech' THEN 'tech-archiver'
  WHEN 'pet' THEN 'pet-archiver'
  ELSE 'wacky-wiki'
END;
