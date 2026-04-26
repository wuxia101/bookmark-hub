import { DEFAULT_MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE } from "@/shared/bookmarks";

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === "1" || value.toLowerCase() === "true";
}

function parseInteger(value: string | undefined, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.floor(numeric);
}

export const config = {
  debug: process.env.DEBUG ?? "",
  appName: process.env.BOOKMARKHUB_SITE_NAME ?? "BookmarkHub",
  pageSize: parseInteger(process.env.BOOKMARKHUB_PAGE_SIZE, DEFAULT_PAGE_SIZE),
  maxPageSize: parseInteger(process.env.BOOKMARKHUB_MAX_PAGE_SIZE, DEFAULT_MAX_PAGE_SIZE),
  aiSearchEnabled: parseBoolean(process.env.BOOKMARKHUB_AI_SEARCH_ENABLED, false),
  aiEnrichmentEnabled: parseBoolean(process.env.BOOKMARKHUB_AI_ENRICHMENT_ENABLED, false),
  aiAutoApproveEnabled: parseBoolean(process.env.BOOKMARKHUB_AI_AUTO_APPROVE_ENABLED, false),
  submissionApiKey: process.env.BOOKMARKHUB_SUBMISSION_API_KEY ?? "",
  reviewApiKey: process.env.BOOKMARKHUB_REVIEW_API_KEY ?? "",
  aiProvider: process.env.BOOKMARKHUB_AI_PROVIDER ?? "",
  aiModel: process.env.BOOKMARKHUB_AI_MODEL ?? "",
  aiBaseUrl: process.env.BOOKMARKHUB_AI_BASE_URL ?? "",
  aiApiKey: process.env.BOOKMARKHUB_AI_API_KEY ?? "",
};
