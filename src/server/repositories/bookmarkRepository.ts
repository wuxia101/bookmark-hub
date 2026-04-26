import { db } from "@/server/db/client";
import { resolveTagLocalization } from "@/server/tags/localization";
import type { BookmarkCard, ReviewQueueItem, SearchBookmarksRequest } from "@/shared/bookmarks";

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
  source_type?: "manual" | "ai_enriched";
  status?: string;
  submitted_at?: string | Date | null;
  reviewed_at?: string | Date | null;
  review_note?: string;
  reviewed_by?: string | null;
  client_name?: string | null;
  last_submission_at?: string | Date | null;
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

export type FullSiteRecord = BookmarkCard & {
  status: string;
  searchAliasesZh: string;
  searchAliasesEn: string;
  sourceType: "manual" | "ai_enriched";
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

export async function findTagsBySiteId(siteId: number): Promise<TagRow[]> {
  return db<TagRow[]>`
    SELECT
      t.id,
      t.slug,
      COALESCE(tt_zh.name, t.name_zh) AS name_zh,
      COALESCE(tt_en.name, t.name_en) AS name_en,
      t.category
    FROM site_tags st
    INNER JOIN tags t ON t.id = st.tag_id
    LEFT JOIN tag_translations tt_zh ON tt_zh.tag_id = t.id AND tt_zh.locale = 'zh-CN'
    LEFT JOIN tag_translations tt_en ON tt_en.tag_id = t.id AND tt_en.locale = 'en'
    WHERE st.site_id = ${siteId}
    ORDER BY t.sort_order ASC, COALESCE(tt_zh.name, t.name_zh) ASC, t.slug ASC
  `;
}

function slugifyTagName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export async function ensureTagsByNames(tagNames: string[]): Promise<TagRow[]> {
  if (!tagNames.length) return [];

  const results: TagRow[] = [];

  for (const rawName of tagNames) {
    const name = rawName.trim();
    const slug = slugifyTagName(name);
    if (!slug) {
      throw new Error(`Cannot derive a valid slug from tag name: ${name}`);
    }

    const localized = resolveTagLocalization(slug, name);
    const [existing] = await db<{ id: number | bigint }[]>`
      SELECT id
      FROM tags
      WHERE slug = ${slug}
      LIMIT 1
    `;

    const tagId = existing
      ? Number(existing.id)
      : Number(
          (
            await db<{ id: number | bigint }[]>`
              INSERT INTO tags (slug, name_zh, name_en, category, sort_order)
              VALUES (${slug}, ${localized.zhCN}, ${localized.en}, 'review-added', 0)
              RETURNING id
            `
          )[0]?.id ?? 0,
        );

    if (!tagId) {
      throw new Error(`Failed to create tag: ${slug}`);
    }

    await db.begin(async tx => {
      await tx`
        UPDATE tags
        SET name_zh = ${localized.zhCN}, name_en = ${localized.en}
        WHERE id = ${tagId}
      `;
      await tx`
        INSERT INTO tag_translations (tag_id, locale, name)
        VALUES (${tagId}, 'zh-CN', ${localized.zhCN}), (${tagId}, 'en', ${localized.en})
        ON CONFLICT (tag_id, locale) DO UPDATE SET
          name = EXCLUDED.name,
          updated_at = NOW()
      `;
    });

    results.push({
      id: tagId,
      slug,
      name_zh: localized.zhCN,
      name_en: localized.en,
      category: "review-added",
    });
  }

  return results;
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

export async function findSiteById(id: number): Promise<SiteRecord | null> {
  const [row] = await db<{ id: number | bigint; status: string; normalized_url: string }[]>`
    SELECT id, status, normalized_url
    FROM sites
    WHERE id = ${id}
    LIMIT 1
  `;

  if (!row) return null;
  return {
    id: Number(row.id),
    status: row.status,
    normalizedUrl: row.normalized_url,
  };
}

export async function findApprovedBookmarkCardById(id: number): Promise<FullSiteRecord | null> {
  const [site] = await db<SiteRow[]>`
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
      s.source_type,
      s.status,
      s.published_at
    FROM sites s
    WHERE s.id = ${id} AND s.status = 'approved'
    LIMIT 1
  `;

  if (!site) return null;
  const tags = await findTagsBySiteId(Number(site.id));
  return {
    id: Number(site.id),
    name: site.name,
    url: site.url,
    normalizedUrl: site.normalized_url,
    logoUrl: site.logo_url,
    coverUrl: site.cover_url,
    descriptionZh: site.description_zh,
    descriptionEn: site.description_en,
    publishedAt: site.published_at ? new Date(site.published_at).toISOString() : null,
    tags: tags.map(tag => ({
      id: Number(tag.id),
      slug: tag.slug,
      nameZh: tag.name_zh,
      nameEn: tag.name_en,
      category: tag.category,
      siteCount: Number(tag.site_count ?? 0),
    })),
    status: site.status ?? "approved",
    searchAliasesZh: site.search_aliases_zh,
    searchAliasesEn: site.search_aliases_en,
    sourceType: site.source_type ?? "manual",
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

export async function listPendingReviewSites(): Promise<ReviewQueueItem[]> {
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
      s.source_type,
      s.status,
      s.submitted_at,
      s.reviewed_at,
      s.review_note,
      s.reviewed_by,
      sr.client_name,
      sr.created_at AS last_submission_at,
      s.published_at
    FROM sites s
    LEFT JOIN LATERAL (
      SELECT client_name, created_at
      FROM submission_records sr
      WHERE sr.site_id = s.id
      ORDER BY sr.created_at DESC, sr.id DESC
      LIMIT 1
    ) sr ON TRUE
    WHERE s.status = 'pending_review'
    ORDER BY s.submitted_at DESC NULLS LAST, s.id DESC
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
          t.category,
          COUNT(approved_sites.id)::bigint AS site_count
        FROM site_tags st
        INNER JOIN tags t ON t.id = st.tag_id
        LEFT JOIN tag_translations tt_zh ON tt_zh.tag_id = t.id AND tt_zh.locale = 'zh-CN'
        LEFT JOIN tag_translations tt_en ON tt_en.tag_id = t.id AND tt_en.locale = 'en'
        LEFT JOIN site_tags approved_st ON approved_st.tag_id = t.id
        LEFT JOIN sites approved_sites ON approved_sites.id = approved_st.site_id AND approved_sites.status = 'approved'
        WHERE st.site_id IN ${db(siteIds)}
        GROUP BY st.site_id, t.id, tt_zh.name, tt_en.name
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

  return items.map(item => ({
    id: Number(item.id),
    name: item.name,
    url: item.url,
    normalizedUrl: item.normalized_url,
    logoUrl: item.logo_url,
    coverUrl: item.cover_url,
    descriptionZh: item.description_zh,
    descriptionEn: item.description_en,
    searchAliasesZh: item.search_aliases_zh,
    searchAliasesEn: item.search_aliases_en,
    sourceType: item.source_type ?? "manual",
    status: (item.status ?? "pending_review") as ReviewQueueItem["status"],
    submittedAt: item.submitted_at ? new Date(item.submitted_at).toISOString() : null,
    reviewedAt: item.reviewed_at ? new Date(item.reviewed_at).toISOString() : null,
    reviewNote: item.review_note ?? "",
    reviewedBy: item.reviewed_by ?? null,
    clientName: item.client_name ?? null,
    lastSubmissionAt: item.last_submission_at ? new Date(item.last_submission_at).toISOString() : null,
    tags: (tagsBySiteId.get(Number(item.id)) ?? []).map(tag => ({
      id: Number(tag.id),
      slug: tag.slug,
      nameZh: tag.name_zh,
      nameEn: tag.name_en,
      category: tag.category,
      siteCount: Number(tag.site_count ?? 0),
    })),
  }));
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

export async function createReviewDecision(input: {
  siteId: number;
  decision: "approved" | "rejected";
  reviewer: string;
  reviewNote: string;
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
  tagIds: number[];
}): Promise<void> {
  await db.begin(async tx => {
    await tx`
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
        status = ${input.decision},
        reviewed_at = NOW(),
        reviewed_by = ${input.reviewer},
        review_note = ${input.reviewNote},
        published_at = CASE
          WHEN ${input.decision} = 'approved' THEN COALESCE(published_at, NOW())
          ELSE NULL
        END
      WHERE id = ${input.siteId}
    `;

    await tx`DELETE FROM site_tags WHERE site_id = ${input.siteId}`;
    if (input.tagIds.length) {
      const records = input.tagIds.map(tagId => ({ site_id: input.siteId, tag_id: tagId }));
      await tx`INSERT INTO site_tags ${tx(records)}`;
    }
  });
}

export async function createOrUpdateApprovedSite(input: {
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
  reviewer: string;
  reviewNote: string;
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
            status = 'approved',
            reviewed_at = NOW(),
            reviewed_by = ${input.reviewer},
            review_note = ${input.reviewNote},
            published_at = COALESCE(published_at, NOW())
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
            submitted_at,
            reviewed_at,
            reviewed_by,
            review_note,
            published_at
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
            'approved',
            NOW(),
            NOW(),
            ${input.reviewer},
            ${input.reviewNote},
            NOW()
          )
          RETURNING id
        `;

    if (!site) {
      throw new Error("Failed to persist approved site");
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
