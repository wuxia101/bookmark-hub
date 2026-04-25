import { db } from "@/server/db/client";
import { resolveTagLocalization } from "@/server/tags/localization";

type TagRow = {
  id: number | bigint;
  slug: string;
  name_zh: string;
  name_en: string;
};

async function main() {
  const tags = await db<TagRow[]>`
    SELECT id, slug, name_zh, name_en
    FROM tags
    ORDER BY id ASC
  `;

  for (const tag of tags) {
    const localized = resolveTagLocalization(tag.slug, tag.name_en || tag.name_zh || tag.slug);

    await db.begin(async tx => {
      await tx`
        UPDATE tags
        SET name_zh = ${localized.zhCN}, name_en = ${localized.en}
        WHERE id = ${tag.id}
      `;

      await tx`
        INSERT INTO tag_translations (tag_id, locale, name)
        VALUES (${tag.id}, 'zh-CN', ${localized.zhCN})
        ON CONFLICT (tag_id, locale) DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = NOW()
      `;

      await tx`
        INSERT INTO tag_translations (tag_id, locale, name)
        VALUES (${tag.id}, 'en', ${localized.en})
        ON CONFLICT (tag_id, locale) DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = NOW()
      `;
    });
  }

  console.log(`[BookmarkHub] synced ${tags.length} tags into tag_translations`);
}

main().catch(error => {
  console.error("[BookmarkHub] tag translation sync failed", error);
  process.exit(1);
});
