import { db } from "@/server/db/client";
import type { SearchBookmarksRequest } from "@/shared/bookmarks";

type SiteRow = {
  id: number | bigint;
  name: string;
  url: string;
  normalized_url: string;
  logo_url: string | null;
  cover_url: string | null;
  description_zh: string;
  description_en: string;
  search_aliases_zh: string;
  search_aliases_en: string;
  published_at: string | Date | null;
};

type TagRow = {
  id: number | bigint;
  slug: string;
  name_zh: string;
  name_en: string;
  category: string;
  site_count?: number | bigint | null;
};

type CountRow = {
  total: number | bigint;
};

export type SearchQueryResult = {
  items: SiteRow[];
  totalItems: number;
  availableTags: TagRow[];
  tagsBySiteId: Map<number, TagRow[]>;
};

export type SiteRecord = {
  id: number;
  status: string;
  normalizedUrl: string;
};

export async function findApprovedTags(): Promise<TagRow[]> {
  return db<TagRow[]>`
    SELECT
      t.id,
      t.slug,
      COALESCE(tt_zh.name, t.name_zh) AS name_zh,
      COALESCE(tt_en.name, t.name_en) AS name_en,
      t.category,
      COUNT(s.id)::bigint AS site_count
    FROM tags t
    LEFT JOIN tag_translations tt_zh ON tt_zh.tag_id = t.id AND tt_zh.locale = 'zh-CN'
    LEFT JOIN tag_translations tt_en ON tt_en.tag_id = t.id AND tt_en.locale = 'en'
    LEFT JOIN site_tags st ON st.tag_id = t.id
    LEFT JOIN sites s ON s.id = st.site_id AND s.status = 'approved'
    WHERE t.is_active = TRUE
    GROUP BY t.id, tt_zh.name, tt_en.name
    ORDER BY t.sort_order ASC, COALESCE(tt_zh.name, t.name_zh) ASC, t.slug ASC
  `;
}

export async function resolveTagsBySlugs(slugs: string[]): Promise<TagRow[]> {
  if (!slugs.length) return [];
  return db<TagRow[]>`
    SELECT
      t.id,
      t.slug,
      COALESCE(tt_zh.name, t.name_zh) AS name_zh,
      COALESCE(tt_en.name, t.name_en) AS name_en,
      t.category
    FROM tags t
    LEFT JOIN tag_translations tt_zh ON tt_zh.tag_id = t.id AND tt_zh.locale = 'zh-CN'
    LEFT JOIN tag_translations tt_en ON tt_en.tag_id = t.id AND tt_en.locale = 'en'
    WHERE t.slug IN ${db(slugs)} AND t.is_active = TRUE
    ORDER BY t.sort_order ASC, COALESCE(tt_zh.name, t.name_zh) ASC
  `;
}

export async function findSiteByNormalizedUrl(normalizedUrl: string): Promise<SiteRecord | null> {
  const [row] = await db<{ id: number | bigint; status: string; normalized_url: string }[]>`
    SELECT id, status, normalized_url
    FROM sites
    WHERE normalized_url = ${normalizedUrl}
    LIMIT 1
  `;

  if (!row) return null;
  return {
    id: Number(row.id),
    status: row.status,
    normalizedUrl: row.normalized_url,
  };
}

function buildSearchWhere(input: SearchBookmarksRequest) {
  const hasQuery = Boolean(input.q);
  const likePattern = `%${input.q}%`;
  const tagCount = input.tags.length;

  const tagFilter = tagCount
    ? db`
        AND s.id IN (
          SELECT st.site_id
          FROM site_tags st
          INNER JOIN tags ft ON ft.id = st.tag_id
          WHERE ft.slug IN ${db(input.tags)}
          GROUP BY st.site_id
          HAVING COUNT(DISTINCT ft.slug) = ${tagCount}
        )
      `
    : db``;

  const queryFilter = hasQuery
    ? db`
        AND (
          s.search_vector @@ websearch_to_tsquery('simple', ${input.q})
          OR s.name ILIKE ${likePattern}
          OR s.search_aliases_zh ILIKE ${likePattern}
          OR s.search_aliases_en ILIKE ${likePattern}
          OR s.url ILIKE ${likePattern}
          OR s.normalized_url ILIKE ${likePattern}
        )
      `
    : db``;

  const rankFragment = hasQuery
    ? db`
        (
          CASE WHEN LOWER(s.name) = LOWER(${input.q}) THEN 5 ELSE 0 END
          + CASE WHEN s.normalized_url = ${input.q} THEN 3 ELSE 0 END
          + ts_rank(s.search_vector, websearch_to_tsquery('simple', ${input.q}))
        )
      `
    : db`0`;

  return { queryFilter, tagFilter, rankFragment };
}

export async function searchApprovedSites(input: SearchBookmarksRequest): Promise<SearchQueryResult> {
  const offset = (input.page - 1) * input.pageSize;
  const { queryFilter, tagFilter, rankFragment } = buildSearchWhere(input);

  const [countRow] = await db<CountRow[]>`
    SELECT COUNT(*)::bigint AS total
    FROM sites s
    WHERE s.status = 'approved'
    ${queryFilter}
    ${tagFilter}
  `;

  const items = await db<SiteRow[]>`
    SELECT
      s.id,
      s.name,
      s.url,
      s.normalized_url,
      s.logo_url,
      s.cover_url,
      s.description_zh,
      s.description_en,
      s.search_aliases_zh,
      s.search_aliases_en,
      s.published_at,
      ${rankFragment} AS rank_score
    FROM sites s
    WHERE s.status = 'approved'
    ${queryFilter}
    ${tagFilter}
    ORDER BY rank_score DESC, s.published_at DESC NULLS LAST, s.id DESC
    LIMIT ${input.pageSize}
    OFFSET ${offset}
  `;

  const siteIds = items.map(item => Number(item.id));
  const tagRows = siteIds.length
    ? await db<(TagRow & { site_id: number | bigint })[]>`
        SELECT
          st.site_id,
          t.id,
          t.slug,
          COALESCE(tt_zh.name, t.name_zh) AS name_zh,
          COALESCE(tt_en.name, t.name_en) AS name_en,
          t.category
        FROM site_tags st
        INNER JOIN tags t ON t.id = st.tag_id
        LEFT JOIN tag_translations tt_zh ON tt_zh.tag_id = t.id AND tt_zh.locale = 'zh-CN'
        LEFT JOIN tag_translations tt_en ON tt_en.tag_id = t.id AND tt_en.locale = 'en'
        WHERE st.site_id IN ${db(siteIds)}
        ORDER BY t.sort_order ASC, COALESCE(tt_zh.name, t.name_zh) ASC, t.slug ASC
      `
    : [];

  const tagsBySiteId = new Map<number, TagRow[]>();
  for (const row of tagRows) {
    const siteId = Number(row.site_id);
    const bucket = tagsBySiteId.get(siteId) ?? [];
    bucket.push(row);
    tagsBySiteId.set(siteId, bucket);
  }

  return {
    items,
    totalItems: Number(countRow?.total ?? 0),
    availableTags: await findApprovedTags(),
    tagsBySiteId,
  };
}

export async function createOrUpdatePendingSite(input: {
  existingSiteId?: number | null;
  name: string;
  url: string;
  normalizedUrl: string;
  logoUrl: string | null;
  coverUrl: string | null;
  descriptionZh: string;
  descriptionEn: string;
  searchAliasesZh: string;
  searchAliasesEn: string;
  tagText: string;
  sourceType: "manual" | "ai_enriched";
  tagIds: number[];
}): Promise<number> {
  return db.begin(async tx => {
    const [site] = input.existingSiteId
      ? await tx<{ id: number | bigint }[]>`
          UPDATE sites
          SET
            name = ${input.name},
            url = ${input.url},
            normalized_url = ${input.normalizedUrl},
            logo_url = ${input.logoUrl},
            cover_url = ${input.coverUrl},
            description_zh = ${input.descriptionZh},
            description_en = ${input.descriptionEn},
            search_aliases_zh = ${input.searchAliasesZh},
            search_aliases_en = ${input.searchAliasesEn},
            tag_text = ${input.tagText},
            source_type = ${input.sourceType},
            status = 'pending_review',
            submitted_at = NOW()
          WHERE id = ${input.existingSiteId}
          RETURNING id
        `
      : await tx<{ id: number | bigint }[]>`
          INSERT INTO sites (
            name,
            url,
            normalized_url,
            logo_url,
            cover_url,
            description_zh,
            description_en,
            search_aliases_zh,
            search_aliases_en,
            tag_text,
            source_type,
            status,
            submitted_at
          ) VALUES (
            ${input.name},
            ${input.url},
            ${input.normalizedUrl},
            ${input.logoUrl},
            ${input.coverUrl},
            ${input.descriptionZh},
            ${input.descriptionEn},
            ${input.searchAliasesZh},
            ${input.searchAliasesEn},
            ${input.tagText},
            ${input.sourceType},
            'pending_review',
            NOW()
          )
          RETURNING id
        `;

    if (!site) {
      throw new Error("Failed to persist site");
    }

    const siteId = Number(site.id);
    await tx`DELETE FROM site_tags WHERE site_id = ${siteId}`;
    if (input.tagIds.length) {
      const records = input.tagIds.map(tagId => ({ site_id: siteId, tag_id: tagId }));
      await tx`INSERT INTO site_tags ${tx(records)}`;
    }

    return siteId;
  });
}

export async function createSubmissionRecord(input: {
  siteId: number | null;
  duplicateOfSiteId: number | null;
  clientName: string;
  status: "received" | "ai_enriched" | "duplicate" | "failed";
  requestIp: string | null;
  payload: unknown;
  processedPayload: unknown;
  failureReason?: string | null;
}): Promise<number> {
  const [row] = await db<{ id: number | bigint }[]>`
    INSERT INTO submission_records (
      site_id,
      duplicate_of_site_id,
      client_name,
      status,
      request_ip,
      payload,
      processed_payload,
      failure_reason
    ) VALUES (
      ${input.siteId},
      ${input.duplicateOfSiteId},
      ${input.clientName},
      ${input.status},
      ${input.requestIp},
      CAST(${JSON.stringify(input.payload)} AS JSONB),
      CAST(${JSON.stringify(input.processedPayload)} AS JSONB),
      ${input.failureReason ?? null}
    )
    RETURNING id
  `;

  if (!row) {
    throw new Error("Failed to create submission record");
  }

  return Number(row.id);
}
