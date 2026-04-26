import { config } from "@/server/config";
import { normalizeUrl } from "@/server/lib/url";
import {
  createOrUpdateApprovedSite,
  createOrUpdatePendingSite,
  createSubmissionRecord,
  findApprovedBookmarkCardById,
  findApprovedTags,
  findSiteByNormalizedUrl,
  resolveTagsBySlugs,
} from "@/server/repositories/bookmarkRepository";
import { createAiSimilarSiteProvider } from "@/server/services/ai";
import type { SimilarSiteImportResponse } from "@/shared/bookmarks";

function buildTagText(tagNames: string[]) {
  return tagNames.join(" ");
}

const aiSimilarSiteProvider = createAiSimilarSiteProvider({
  provider: config.aiProvider,
  baseUrl: config.aiBaseUrl,
  apiKey: config.aiApiKey,
  model: config.aiModel,
});

export function isFindSimilarAvailable() {
  return Boolean(config.reviewApiKey && config.aiEnrichmentEnabled && config.aiApiKey && config.aiModel);
}

export async function importSimilarSites(siteId: number, reviewer: string): Promise<SimilarSiteImportResponse> {
  if (!isFindSimilarAvailable()) {
    throw new Error("Find similar is not configured");
  }

  const source = await findApprovedBookmarkCardById(siteId);
  if (!source) {
    throw new Error("Source approved site not found");
  }

  const availableTags = (await findApprovedTags()).map(tag => ({
    id: Number(tag.id),
    slug: tag.slug,
    nameZh: tag.name_zh,
    nameEn: tag.name_en,
    category: tag.category,
    siteCount: Number(tag.site_count ?? 0),
  }));
  const candidates = await aiSimilarSiteProvider.findSimilar(source, { availableTags, maxItems: 6 });

  const items: SimilarSiteImportResponse["items"] = [];
  let importedCount = 0;
  let approvedCount = 0;
  let pendingCount = 0;
  let duplicateCount = 0;

  for (const candidate of candidates) {
    try {
      const normalized = normalizeUrl(candidate.url);
      const existing = await findSiteByNormalizedUrl(normalized.normalizedUrl);
      if (existing?.status === "approved") {
        duplicateCount += 1;
        items.push({
          name: candidate.name,
          url: normalized.url,
          siteId: existing.id,
          status: "duplicate",
          message: "This similar site already exists in the approved catalog.",
        });
        continue;
      }

      const tags = candidate.suggestedTagSlugs.length ? await resolveTagsBySlugs(candidate.suggestedTagSlugs) : [];
      const sourceType = "ai_enriched" as const;
      const siteInput = {
        existingSiteId: existing?.id ?? null,
        name: candidate.name,
        url: normalized.url,
        normalizedUrl: normalized.normalizedUrl,
        logoUrl: null,
        coverUrl: null,
        descriptionZh: candidate.descriptionZh?.trim() ?? "",
        descriptionEn: candidate.descriptionEn?.trim() ?? "",
        searchAliasesZh: candidate.searchAliasesZh?.trim() ?? "",
        searchAliasesEn: candidate.searchAliasesEn?.trim() ?? "",
        tagText: buildTagText(tags.flatMap(tag => [tag.name_zh, tag.name_en, tag.slug])),
        sourceType,
        tagIds: tags.map(tag => Number(tag.id)),
      };

      const autoApprove = config.aiAutoApproveEnabled && tags.length > 0;
      const persistedSiteId = autoApprove
        ? await createOrUpdateApprovedSite({
            ...siteInput,
            reviewer,
            reviewNote: `Imported from find similar: ${source.name}`,
          })
        : await createOrUpdatePendingSite(siteInput);

      await createSubmissionRecord({
        siteId: persistedSiteId,
        duplicateOfSiteId: null,
        clientName: "admin-find-similar",
        status: "ai_enriched",
        requestIp: null,
        payload: {
          sourceSiteId: source.id,
          sourceSiteUrl: source.url,
          candidate,
        },
        processedPayload: {
          normalizedUrl: normalized.normalizedUrl,
          mergedTagSlugs: tags.map(tag => tag.slug),
          autoApprove,
        },
      });

      importedCount += 1;
      if (autoApprove) approvedCount += 1;
      else pendingCount += 1;
      items.push({
        name: candidate.name,
        url: normalized.url,
        siteId: persistedSiteId,
        status: autoApprove ? "approved" : "pending_review",
        message: autoApprove
          ? "Imported and automatically approved by AI workflow."
          : "Imported into pending review queue.",
      });
    } catch (error) {
      items.push({
        name: candidate.name,
        url: candidate.url,
        siteId: null,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    importedCount,
    approvedCount,
    pendingCount,
    duplicateCount,
    items,
  };
}
