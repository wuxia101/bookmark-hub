import { db } from "@/server/db/client";
import { normalizeUrl } from "@/server/lib/url";
import { resolveTagLocalization } from "@/server/tags/localization";

type SourceBookmark = {
  title?: string;
  img?: string;
  href?: string;
  content?: string;
};

type SourceCategory = {
  title?: string;
  href?: string;
  list?: SourceBookmark[];
};

const SOURCE_PATH = "bookmarks.json";
const MAX_IMPORT_ITEMS = 120;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function truncateText(input: string, maxLength = 100): string {
  return Array.from(input.trim()).slice(0, maxLength).join("");
}

function sanitizeText(input: string | undefined): string {
  return input?.replace(/\s+/g, " ").trim() ?? "";
}

function sanitizeImageUrl(input: string | undefined): string | null {
  if (!input) return null;
  try {
    const url = new URL(input);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function ensureTag(slug: string, title: string) {
  const localized = resolveTagLocalization(slug, title);
  const [existing] = await db<{ id: number | bigint }[]>`
    SELECT id FROM tags WHERE slug = ${slug} LIMIT 1
  `;

  if (existing) {
    await db.begin(async tx => {
      await tx`
        UPDATE tags
        SET name_zh = ${localized.zhCN}, name_en = ${localized.en}
        WHERE id = ${existing.id}
      `;
      await tx`
        INSERT INTO tag_translations (tag_id, locale, name)
        VALUES (${existing.id}, 'zh-CN', ${localized.zhCN})
        ON CONFLICT (tag_id, locale) DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = NOW()
      `;
      await tx`
        INSERT INTO tag_translations (tag_id, locale, name)
        VALUES (${existing.id}, 'en', ${localized.en})
        ON CONFLICT (tag_id, locale) DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = NOW()
      `;
    });

    return Number(existing.id);
  }

  const [created] = await db<{ id: number | bigint }[]>`
    INSERT INTO tags (slug, name_zh, name_en, category, sort_order)
    VALUES (${slug}, ${localized.zhCN}, ${localized.en}, 'source-import', 0)
    RETURNING id
  `;

  if (!created) {
    throw new Error(`Failed to create tag: ${slug}`);
  }

  await db`
    INSERT INTO tag_translations (tag_id, locale, name)
    VALUES
      (${created.id}, 'zh-CN', ${localized.zhCN}),
      (${created.id}, 'en', ${localized.en})
    ON CONFLICT (tag_id, locale) DO UPDATE SET
      name = EXCLUDED.name,
      updated_at = NOW()
  `;

  return Number(created.id);
}

async function upsertApprovedSite(input: {
  name: string;
  href: string;
  logoUrl: string | null;
  descriptionEn: string;
  tagId: number;
  tagText: string;
}) {
  const normalized = normalizeUrl(input.href);

  const [site] = await db<{ id: number | bigint }[]>`
    INSERT INTO sites (
      name,
      url,
      normalized_url,
      logo_url,
      cover_url,
      description_zh,
      description_en,
      tag_text,
      source_type,
      status,
      submitted_at,
      reviewed_at,
      published_at
    ) VALUES (
      ${input.name},
      ${normalized.url},
      ${normalized.normalizedUrl},
      ${input.logoUrl},
      ${null},
      ${''},
      ${input.descriptionEn},
      ${input.tagText},
      'manual',
      'approved',
      NOW(),
      NOW(),
      NOW()
    )
    ON CONFLICT (normalized_url) DO UPDATE SET
      name = EXCLUDED.name,
      url = EXCLUDED.url,
      logo_url = EXCLUDED.logo_url,
      cover_url = EXCLUDED.cover_url,
      description_en = CASE
        WHEN COALESCE(sites.description_en, '') = '' THEN EXCLUDED.description_en
        ELSE sites.description_en
      END,
      tag_text = EXCLUDED.tag_text,
      status = 'approved',
      reviewed_at = COALESCE(sites.reviewed_at, NOW()),
      published_at = COALESCE(sites.published_at, NOW())
    RETURNING id
  `;

  if (!site) {
    throw new Error(`Failed to upsert site: ${input.href}`);
  }

  const siteId = Number(site.id);

  await db`
    INSERT INTO site_tags (site_id, tag_id)
    VALUES (${siteId}, ${input.tagId})
    ON CONFLICT (site_id, tag_id) DO NOTHING
  `;
}

async function main() {
  const exists = await Bun.file(SOURCE_PATH).exists();
  if (!exists) {
    throw new Error(`Source file not found: ${SOURCE_PATH}`);
  }

  const categories = (await Bun.file(SOURCE_PATH).json()) as SourceCategory[];
  let imported = 0;

  for (const category of categories) {
    if (imported >= MAX_IMPORT_ITEMS) break;

    const categoryTitle = sanitizeText(category.title) || "Imported";
    const tagSlug = slugify(categoryTitle) || "imported";
    const tagId = await ensureTag(tagSlug, categoryTitle);

    for (const item of category.list ?? []) {
      if (imported >= MAX_IMPORT_ITEMS) break;

      const name = sanitizeText(item.title);
      const href = sanitizeText(item.href);
      if (!name || !href) continue;

      const descriptionEn = truncateText(sanitizeText(item.content));
      const logoUrl = sanitizeImageUrl(item.img);

      await upsertApprovedSite({
        name,
        href,
        logoUrl,
        descriptionEn,
        tagId,
        tagText: `${categoryTitle} ${tagSlug}`,
      });

      imported += 1;
    }
  }

  console.log(`[BookmarkHub] imported ${imported} bookmarks from ${SOURCE_PATH}`);
}

main().catch(error => {
  console.error("[BookmarkHub] bookmark seed failed", error);
  process.exit(1);
});
