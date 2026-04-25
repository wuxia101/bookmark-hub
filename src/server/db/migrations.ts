import { db } from "@/server/db/client";

const migrations = [
  {
    id: "001_initial_schema",
    sql: `
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sites (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  cover_url TEXT,
  description_zh VARCHAR(100) NOT NULL DEFAULT '',
  description_en VARCHAR(100) NOT NULL DEFAULT '',
  tag_text TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK (source_type IN ('manual', 'ai_enriched')),
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'approved', 'rejected')),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', COALESCE(name, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(description_zh, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(description_en, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(tag_text, '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(normalized_url, '')), 'D')
  ) STORED
);

CREATE TABLE IF NOT EXISTS tags (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name_zh TEXT NOT NULL,
  name_en TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS site_tags (
  site_id BIGINT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  tag_id BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (site_id, tag_id)
);

CREATE TABLE IF NOT EXISTS api_clients (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submission_records (
  id BIGSERIAL PRIMARY KEY,
  site_id BIGINT REFERENCES sites(id) ON DELETE SET NULL,
  duplicate_of_site_id BIGINT REFERENCES sites(id) ON DELETE SET NULL,
  client_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('received', 'ai_enriched', 'duplicate', 'failed')),
  request_ip TEXT,
  payload JSONB NOT NULL,
  processed_payload JSONB,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sites_status_published_at ON sites(status, published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_sites_search_vector ON sites USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_sites_name ON sites(name);
CREATE INDEX IF NOT EXISTS idx_site_tags_tag_site ON site_tags(tag_id, site_id);
CREATE INDEX IF NOT EXISTS idx_site_tags_site_tag ON site_tags(site_id, tag_id);
CREATE INDEX IF NOT EXISTS idx_tags_active_sort ON tags(is_active, sort_order, slug);
CREATE INDEX IF NOT EXISTS idx_submission_records_status_created_at ON submission_records(status, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sites_updated_at ON sites;
CREATE TRIGGER trg_sites_updated_at BEFORE UPDATE ON sites
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_tags_updated_at ON tags;
CREATE TRIGGER trg_tags_updated_at BEFORE UPDATE ON tags
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_api_clients_updated_at ON api_clients;
CREATE TRIGGER trg_api_clients_updated_at BEFORE UPDATE ON api_clients
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_submission_records_updated_at ON submission_records;
CREATE TRIGGER trg_submission_records_updated_at BEFORE UPDATE ON submission_records
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `,
  },
  {
    id: "002_tag_translations",
    sql: `
CREATE TABLE IF NOT EXISTS tag_translations (
  tag_id BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  locale TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tag_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_tag_translations_locale_name ON tag_translations(locale, name);

INSERT INTO tag_translations (tag_id, locale, name)
SELECT id, 'zh-CN', name_zh
FROM tags
ON CONFLICT (tag_id, locale) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = NOW();

INSERT INTO tag_translations (tag_id, locale, name)
SELECT id, 'en', name_en
FROM tags
ON CONFLICT (tag_id, locale) DO UPDATE SET
  name = EXCLUDED.name,
  updated_at = NOW();

DROP TRIGGER IF EXISTS trg_tag_translations_updated_at ON tag_translations;
CREATE TRIGGER trg_tag_translations_updated_at BEFORE UPDATE ON tag_translations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `,
  },
  {
    id: "003_site_aliases",
    sql: `
ALTER TABLE sites ADD COLUMN IF NOT EXISTS search_aliases_zh TEXT NOT NULL DEFAULT '';
ALTER TABLE sites ADD COLUMN IF NOT EXISTS search_aliases_en TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS idx_sites_search_vector;
ALTER TABLE sites DROP COLUMN IF EXISTS search_vector;

ALTER TABLE sites ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('simple', COALESCE(description_zh, '')), 'B') ||
  setweight(to_tsvector('simple', COALESCE(description_en, '')), 'B') ||
  setweight(to_tsvector('simple', COALESCE(search_aliases_zh, '')), 'B') ||
  setweight(to_tsvector('simple', COALESCE(search_aliases_en, '')), 'B') ||
  setweight(to_tsvector('simple', COALESCE(tag_text, '')), 'C') ||
  setweight(to_tsvector('simple', COALESCE(normalized_url, '')), 'D')
) STORED;

CREATE INDEX IF NOT EXISTS idx_sites_search_vector ON sites USING GIN(search_vector);
    `,
  },
];

export async function runMigrations() {
  await db`CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;

  for (const migration of migrations) {
    const [existing] = await db`SELECT id FROM schema_migrations WHERE id = ${migration.id}`;
    if (existing) continue;

    await db.begin(async tx => {
      await tx.unsafe(migration.sql);
      await tx`INSERT INTO schema_migrations (id) VALUES (${migration.id})`;
    });
  }
}
