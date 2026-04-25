import { db } from "@/server/db/client";

type SiteAliasRow = {
  id: number | bigint;
  name: string;
  description_zh: string;
  description_en: string;
  tags_zh: string | null;
  tags_en: string | null;
};

function uniqJoin(parts: Array<string | null | undefined>) {
  const tokens = parts
    .flatMap(value => (value ?? "").split(/[,\n/|]+/))
    .map(token => token.trim())
    .filter(Boolean);

  return [...new Set(tokens)].join(", ");
}

async function main() {
  const rows = await db<SiteAliasRow[]>`
    SELECT
      s.id,
      s.name,
      s.description_zh,
      s.description_en,
      string_agg(DISTINCT COALESCE(tt_zh.name, t.name_zh), ', ') AS tags_zh,
      string_agg(DISTINCT COALESCE(tt_en.name, t.name_en), ', ') AS tags_en
    FROM sites s
    LEFT JOIN site_tags st ON st.site_id = s.id
    LEFT JOIN tags t ON t.id = st.tag_id
    LEFT JOIN tag_translations tt_zh ON tt_zh.tag_id = t.id AND tt_zh.locale = 'zh-CN'
    LEFT JOIN tag_translations tt_en ON tt_en.tag_id = t.id AND tt_en.locale = 'en'
    GROUP BY s.id
  `;

  for (const row of rows) {
    const aliasesZh = uniqJoin([row.tags_zh, row.description_zh]);
    const aliasesEn = uniqJoin([row.name, row.tags_en, row.description_en]);

    await db`
      UPDATE sites
      SET
        search_aliases_zh = CASE WHEN COALESCE(search_aliases_zh, '') = '' THEN ${aliasesZh} ELSE search_aliases_zh END,
        search_aliases_en = CASE WHEN COALESCE(search_aliases_en, '') = '' THEN ${aliasesEn} ELSE search_aliases_en END
      WHERE id = ${row.id}
    `;
  }

  console.log(`[BookmarkHub] synced aliases for ${rows.length} sites`);
}

main().catch(error => {
  console.error("[BookmarkHub] site alias sync failed", error);
  process.exit(1);
});
