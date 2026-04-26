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
import type { ReviewDecisionRequest, ReviewDecisionResponse, ReviewQueueResponse } from "@/shared/bookmarks";

function buildTagText(tagNames: string[]) {
  return tagNames.join(" ");
}

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

  const requestedTagSlugs = payload.tagSlugs ?? [];
  const resolvedTags = await resolveTagsBySlugs(requestedTagSlugs);
  if (resolvedTags.length !== requestedTagSlugs.length) {
    throw new Error("One or more tagSlugs are invalid or inactive");
  }
  const createdTags = await ensureTagsByNames(payload.newTagNames ?? []);
  const mergedTags = [...resolvedTags, ...createdTags];
  const dedupedTags = [...new Map(mergedTags.map(tag => [tag.slug, tag])).values()];
  const existingTags = dedupedTags.length ? [] : await findTagsBySiteId(payload.siteId);
  const tags = dedupedTags.length ? dedupedTags : existingTags;
  if (payload.decision === "approved" && !tags.length) {
    throw new Error("Approved sites must keep at least one tag");
  }

  await createReviewDecision({
    siteId: payload.siteId,
    decision: payload.decision,
    reviewer,
    reviewNote: payload.reviewNote?.trim() ?? "",
    name: payload.name,
    url: normalized.url,
    normalizedUrl: normalized.normalizedUrl,
    logoUrl: payload.logoUrl ?? null,
    coverUrl: payload.coverUrl ?? null,
    descriptionZh: payload.descriptionZh?.trim() ?? "",
    descriptionEn: payload.descriptionEn?.trim() ?? "",
    searchAliasesZh: payload.searchAliasesZh?.trim() ?? "",
    searchAliasesEn: payload.searchAliasesEn?.trim() ?? "",
    tagText: buildTagText(tags.flatMap(tag => [tag.name_zh, tag.name_en, tag.slug])),
    tagIds: tags.map(tag => Number(tag.id)),
  });

  return {
    siteId: payload.siteId,
    status: payload.decision,
    message: payload.decision === "approved" ? "Review approved and published." : "Review rejected.",
  };
}
