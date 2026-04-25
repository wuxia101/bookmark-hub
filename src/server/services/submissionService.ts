import { config } from "@/server/config";
import { sha256Hex } from "@/server/lib/crypto";
import { normalizeUrl } from "@/server/lib/url";
import { findActiveApiClientByHash } from "@/server/repositories/apiClientRepository";
import {
  findApprovedTags,
  createOrUpdatePendingSite,
  createSubmissionRecord,
  findSiteByNormalizedUrl,
  resolveTagsBySlugs,
} from "@/server/repositories/bookmarkRepository";
import { createAiEnrichmentProvider } from "@/server/services/ai";
import type { SubmissionCreateRequest, SubmissionCreateResponse } from "@/shared/bookmarks";

const aiEnrichmentProvider = createAiEnrichmentProvider({
  provider: config.aiProvider,
  baseUrl: config.aiBaseUrl,
  apiKey: config.aiApiKey,
  model: config.aiModel,
});

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

export async function authenticateApiKey(apiKey: string | null): Promise<{ name: string } | null> {
  if (!apiKey) return null;

  const hash = await sha256Hex(apiKey);
  const client = await findActiveApiClientByHash(hash);
  if (client) {
    return { name: client.name };
  }

  if (config.submissionApiKey && apiKey === config.submissionApiKey) {
    return { name: "env-submission-client" };
  }

  return null;
}

export async function submitBookmark(
  payload: SubmissionCreateRequest,
  clientName: string,
  requestIp: string | null,
): Promise<SubmissionCreateResponse> {
  const normalized = normalizeUrl(payload.url);
  const existing = await findSiteByNormalizedUrl(normalized.normalizedUrl);

  if (existing?.status === "approved") {
    const submissionId = await createSubmissionRecord({
      siteId: null,
      duplicateOfSiteId: existing.id,
      clientName,
      status: "duplicate",
      requestIp,
      payload,
      processedPayload: payload,
    });

    return {
      submissionId,
      status: "duplicate",
      duplicate: true,
      siteId: existing.id,
      aiEnrichmentAttempted: false,
      message: "This site already exists in the approved catalog.",
    };
  }

  const resolvedTags = await resolveTagsBySlugs(payload.tagSlugs ?? []);
  if (resolvedTags.length !== (payload.tagSlugs?.length ?? 0)) {
    throw new Error("One or more tagSlugs are invalid or inactive");
  }

  const shouldAttemptAi = config.aiEnrichmentEnabled && payload.enableAiEnrichment !== false;
  const availableTags = shouldAttemptAi
    ? (await findApprovedTags()).map(tag => ({
        id: Number(tag.id),
        slug: tag.slug,
        nameZh: tag.name_zh,
        nameEn: tag.name_en,
        category: tag.category,
        siteCount: Number(tag.site_count ?? 0),
      }))
    : [];
  let aiEnrichment = null;
  if (shouldAttemptAi) {
    try {
      aiEnrichment = await aiEnrichmentProvider.enrich(payload, { availableTags });
    } catch {
      aiEnrichment = null;
    }
  }

  const mergedTagSlugs = [...new Set([...(payload.tagSlugs ?? []), ...(aiEnrichment?.suggestedTagSlugs ?? [])])];
  const mergedTags = mergedTagSlugs.length ? await resolveTagsBySlugs(mergedTagSlugs) : resolvedTags;
  const mergedDescriptionZh = aiEnrichment?.descriptionZh?.trim() || payload.descriptionZh?.trim() || "";
  const mergedDescriptionEn = aiEnrichment?.descriptionEn?.trim() || payload.descriptionEn?.trim() || "";
  const mergedSearchAliasesZh = mergeAliasText(payload.searchAliasesZh, aiEnrichment?.searchAliasesZh);
  const mergedSearchAliasesEn = mergeAliasText(payload.searchAliasesEn, aiEnrichment?.searchAliasesEn);
  const mergedLogoUrl = aiEnrichment?.logoUrl ?? payload.logoUrl ?? null;
  const mergedCoverUrl = aiEnrichment?.coverUrl ?? payload.coverUrl ?? null;

  const siteId = await createOrUpdatePendingSite({
    existingSiteId: existing?.id ?? null,
    name: payload.name,
    url: normalized.url,
    normalizedUrl: normalized.normalizedUrl,
    logoUrl: mergedLogoUrl,
    coverUrl: mergedCoverUrl,
    descriptionZh: mergedDescriptionZh,
    descriptionEn: mergedDescriptionEn,
    searchAliasesZh: mergedSearchAliasesZh,
    searchAliasesEn: mergedSearchAliasesEn,
    tagText: buildTagText(mergedTags.flatMap(tag => [tag.name_zh, tag.name_en, tag.slug])),
    sourceType: aiEnrichment ? "ai_enriched" : "manual",
    tagIds: mergedTags.map(tag => Number(tag.id)),
  });

  const status = aiEnrichment ? "ai_enriched" : "received";
  const submissionId = await createSubmissionRecord({
    siteId,
    duplicateOfSiteId: null,
    clientName,
    status,
    requestIp,
    payload,
    processedPayload: {
      ...payload,
      normalizedUrl: normalized.normalizedUrl,
      mergedTagSlugs: mergedTags.map(tag => tag.slug),
      descriptionZh: mergedDescriptionZh,
      descriptionEn: mergedDescriptionEn,
      searchAliasesZh: mergedSearchAliasesZh,
      searchAliasesEn: mergedSearchAliasesEn,
      logoUrl: mergedLogoUrl,
      coverUrl: mergedCoverUrl,
    },
  });

  return {
    submissionId,
    status,
    duplicate: false,
    siteId,
    aiEnrichmentAttempted: shouldAttemptAi && Boolean(aiEnrichment),
    message: "Submission accepted and queued for manual review.",
  };
}
