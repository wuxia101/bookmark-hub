import { db } from "@/server/db/client";
import { TAG_CATALOG } from "@/server/tags/catalog";

async function upsertTag(input: { slug: string; zhCN: string; en: string; category: string; sortOrder: number }) {
  const [row] = await db<{ id: number | bigint }[]>`
    INSERT INTO tags (slug, name_zh, name_en, category, sort_order, is_active)
    VALUES (${input.slug}, ${input.zhCN}, ${input.en}, ${input.category}, ${input.sortOrder}, TRUE)
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
    throw new Error(`Failed to upsert tag: ${input.slug}`);
  }

  const tagId = Number(row.id);
  await db`
    INSERT INTO tag_translations (tag_id, locale, name)
    VALUES
      (${tagId}, 'zh-CN', ${input.zhCN}),
      (${tagId}, 'en', ${input.en})
    ON CONFLICT (tag_id, locale) DO UPDATE SET
      name = EXCLUDED.name,
      updated_at = NOW()
  `;
}

async function main() {
  for (const tag of TAG_CATALOG) {
    await upsertTag(tag);
  }

  console.log(`[BookmarkHub] seeded ${TAG_CATALOG.length} catalog tags`);
}

main().catch(error => {
  console.error("[BookmarkHub] tag seed failed", error);
  process.exit(1);
});
