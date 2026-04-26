import { db } from "@/server/db/client";
import { CHINA_SITE_TAXONOMY_EN } from "@/server/tags/chinaSiteTaxonomyEn";

function toAsciiSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function resolveFinalSlug(baseSlug: string, categoryEn: string, existingId?: number) {
  const categorySlug = toAsciiSlug(categoryEn) || "taxonomy";
  const candidates = [baseSlug, `${categorySlug}-${baseSlug}`, `china-${categorySlug}-${baseSlug}`];

  for (const candidate of candidates) {
    const [row] = await db<{ id: number | bigint }[]>`
      SELECT id
      FROM tags
      WHERE slug = ${candidate}
      LIMIT 1
    `;
    if (!row || Number(row.id) === existingId) {
      return candidate;
    }
  }

  let index = 2;
  while (true) {
    const candidate = `${categorySlug}-${baseSlug}-${index}`;
    const [row] = await db<{ id: number | bigint }[]>`
      SELECT id
      FROM tags
      WHERE slug = ${candidate}
      LIMIT 1
    `;
    if (!row || Number(row.id) === existingId) {
      return candidate;
    }
    index += 1;
  }
}

async function upsertTag(input: {
  slug: string;
  nameZh: string;
  nameEn: string;
  category: string;
  categoryEn: string;
  sortOrder: number;
}) {
  const [existing] = await db<{ id: number | bigint }[]>`
    SELECT id
    FROM tags
    WHERE category = ${input.category} AND name_zh = ${input.nameZh}
    LIMIT 1
  `;
  const finalSlug = await resolveFinalSlug(input.slug, input.categoryEn, existing ? Number(existing.id) : undefined);

  const [row] = existing
    ? await db<{ id: number | bigint }[]>`
        UPDATE tags
        SET
          slug = ${finalSlug},
          name_zh = ${input.nameZh},
          name_en = ${input.nameEn},
          category = ${input.category},
          sort_order = ${input.sortOrder},
          is_active = TRUE,
          updated_at = NOW()
        WHERE id = ${existing.id}
        RETURNING id
      `
    : await db<{ id: number | bigint }[]>`
        INSERT INTO tags (slug, name_zh, name_en, category, sort_order, is_active)
        VALUES (${finalSlug}, ${input.nameZh}, ${input.nameEn}, ${input.category}, ${input.sortOrder}, TRUE)
        ON CONFLICT (slug) DO UPDATE SET
          name_zh = EXCLUDED.name_zh,
          name_en = EXCLUDED.name_en,
          category = EXCLUDED.category,
          sort_order = EXCLUDED.sort_order,
          is_active = TRUE,
          updated_at = NOW()
        RETURNING id
      `;

  if (!row) {
    throw new Error(`Failed to upsert taxonomy tag: ${input.slug}`);
  }

  const tagId = Number(row.id);
  await db`
    INSERT INTO tag_translations (tag_id, locale, name)
    VALUES
      (${tagId}, 'zh-CN', ${input.nameZh}),
      (${tagId}, 'en', ${input.nameEn})
    ON CONFLICT (tag_id, locale) DO UPDATE SET
      name = EXCLUDED.name,
      updated_at = NOW()
  `;
}

async function main() {
  let total = 0;

  for (const [sectionIndex, section] of CHINA_SITE_TAXONOMY_EN.entries()) {
    for (const [itemIndex, item] of section.items.entries()) {
      await upsertTag({
        slug: item.slug,
        nameZh: item.nameZh,
        nameEn: item.nameEn,
        category: section.categoryZh,
        categoryEn: section.categoryEn,
        sortOrder: 1000 + sectionIndex * 100 + itemIndex,
      });
      total += 1;
    }
  }

  console.log(`[BookmarkHub] seeded ${total} China site taxonomy tags`);
}

main().catch(error => {
  console.error("[BookmarkHub] China taxonomy tag seed failed", error);
  process.exit(1);
});
