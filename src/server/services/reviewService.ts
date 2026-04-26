import { config } from "@/server/config";
import { normalizeUrl } from "@/server/lib/url";
import {
  createReviewDecision,
  ensureTagsByNames,
  findApprovedTags,
  findSiteById,
  findSiteByNormalizedUrl,
  findTagsBySiteId,
  listPendingReviewSites,
  resolveTagsBySlugs,
} from "@/server/repositories/bookmarkRepository";
import { createAiEnrichmentProvider } from "@/server/services/ai";
import type { BookmarkTag, SubmissionCreateRequest } from "@/shared/bookmarks";
import type { ReviewDecisionRequest, ReviewDecisionResponse, ReviewQueueResponse } from "@/shared/bookmarks";

function buildTagText(tagNames: string[]) {
  return tagNames.join(" ");
}

function mergeAliasText(...values: Array<string | null | undefined>) {
  const tokens = values
    .flatMap(value => (value ?? "").split(/[,\n/|]+/))
    .map(token => token.trim())
    .filter(Boolean);

  return [...new Set(tokens)].join(", ");
}

function isAiReviewAvailable() {
  return Boolean(config.aiEnrichmentEnabled && config.aiApiKey && config.aiModel);
}

const aiEnrichmentProvider = createAiEnrichmentProvider({
  provider: config.aiProvider,
  baseUrl: config.aiBaseUrl,
  apiKey: config.aiApiKey,
  model: config.aiModel,
});

export async function getReviewQueue(): Promise<ReviewQueueResponse> {
  const [items, availableTags] = await Promise.all([listPendingReviewSites(), findApprovedTags()]);

  return {
    items,
    availableTags: availableTags.map(tag => ({
      id: Number(tag.id),
      slug: tag.slug,
      nameZh: tag.name_zh,
      nameEn: tag.name_en,
      category: tag.category,
      siteCount: Number(tag.site_count ?? 0),
    })),
    meta: {
      pendingCount: items.length,
      aiAssistAvailable: isAiReviewAvailable(),
    },
  };
}

export async function applyReviewDecision(
  payload: ReviewDecisionRequest,
  reviewer: string,
): Promise<ReviewDecisionResponse> {
  const site = await findSiteById(payload.siteId);
  if (!site) {
    throw new Error("Pending site not found");
  }
  if (site.status !== "pending_review") {
    throw new Error("Only pending_review sites can be reviewed");
  }

  const normalized = normalizeUrl(payload.url);
  const duplicate = await findSiteByNormalizedUrl(normalized.normalizedUrl);
  if (duplicate && duplicate.id !== payload.siteId) {
    throw new Error("Another site already uses this normalized URL");
  }

  const availableTags: BookmarkTag[] = (await findApprovedTags()).map(tag => ({
    id: Number(tag.id),
    slug: tag.slug,
    nameZh: tag.name_zh,
    nameEn: tag.name_en,
    category: tag.category,
    siteCount: Number(tag.site_count ?? 0),
  }));

  const requestedTagSlugs = payload.tagSlugs ?? [];
  const resolvedTags = await resolveTagsBySlugs(requestedTagSlugs);
  if (resolvedTags.length !== requestedTagSlugs.length) {
    throw new Error("One or more tagSlugs are invalid or inactive");
  }

  const shouldAttemptAi = payload.decision === "approved" && isAiReviewAvailable();
  let aiEnrichment = null;
  if (shouldAttemptAi) {
    const aiInput: SubmissionCreateRequest = {
      name: payload.name,
      url: normalized.url,
      logoUrl: payload.logoUrl ?? null,
      coverUrl: payload.coverUrl ?? null,
      descriptionZh: payload.descriptionZh ?? "",
      descriptionEn: payload.descriptionEn ?? "",
      searchAliasesZh: payload.searchAliasesZh ?? "",
      searchAliasesEn: payload.searchAliasesEn ?? "",
      tagSlugs: requestedTagSlugs,
      enableAiEnrichment: true,
    };

    try {
      aiEnrichment = await aiEnrichmentProvider.enrich(aiInput, { availableTags });
    } catch {
      aiEnrichment = null;
    }
  }

  const aiResolvedTags =
    aiEnrichment?.suggestedTagSlugs?.length ? await resolveTagsBySlugs(aiEnrichment.suggestedTagSlugs) : [];
  const createdTags = await ensureTagsByNames(payload.newTagNames ?? []);
  const mergedTags = [...resolvedTags, ...createdTags, ...aiResolvedTags];
  const dedupedTags = [...new Map(mergedTags.map(tag => [tag.slug, tag])).values()];
  const existingTags = dedupedTags.length ? [] : await findTagsBySiteId(payload.siteId);
  const tags = dedupedTags.length ? dedupedTags : existingTags;
  if (payload.decision === "approved" && !tags.length) {
    throw new Error(
      shouldAttemptAi
        ? "AI could not determine tags. Add at least one tag manually before publishing"
        : "Approved sites must keep at least one tag",
    );
  }

  const finalDescriptionZh = payload.descriptionZh?.trim() || aiEnrichment?.descriptionZh?.trim() || "";
  const finalDescriptionEn = payload.descriptionEn?.trim() || aiEnrichment?.descriptionEn?.trim() || "";
  const finalSearchAliasesZh = mergeAliasText(payload.searchAliasesZh, aiEnrichment?.searchAliasesZh);
  const finalSearchAliasesEn = mergeAliasText(payload.searchAliasesEn, aiEnrichment?.searchAliasesEn);
  const finalLogoUrl = payload.logoUrl ?? aiEnrichment?.logoUrl ?? null;
  const finalCoverUrl = payload.coverUrl ?? aiEnrichment?.coverUrl ?? null;

  await createReviewDecision({
    siteId: payload.siteId,
    decision: payload.decision,
    reviewer,
    reviewNote: payload.reviewNote?.trim() ?? "",
    name: payload.name,
    url: normalized.url,
    normalizedUrl: normalized.normalizedUrl,
    logoUrl: finalLogoUrl,
    coverUrl: finalCoverUrl,
    descriptionZh: finalDescriptionZh,
    descriptionEn: finalDescriptionEn,
    searchAliasesZh: finalSearchAliasesZh,
    searchAliasesEn: finalSearchAliasesEn,
    tagText: buildTagText(tags.flatMap(tag => [tag.name_zh, tag.name_en, tag.slug])),
    tagIds: tags.map(tag => Number(tag.id)),
  });

  return {
    siteId: payload.siteId,
    status: payload.decision,
    message: payload.decision === "approved" ? "Review approved and published." : "Review rejected.",
  };
}
