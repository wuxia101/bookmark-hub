export const SEARCH_MODES = ["standard", "ai"] as const;
export const SITE_STATUSES = ["pending_review", "approved", "rejected"] as const;
export const DEFAULT_PAGE_SIZE = 24;
export const DEFAULT_MAX_PAGE_SIZE = 60;

export type SearchMode = (typeof SEARCH_MODES)[number];
export type SiteStatus = (typeof SITE_STATUSES)[number];

export type BookmarkTag = {
  id: number;
  slug: string;
  nameZh: string;
  nameEn: string;
  category: string;
  siteCount: number;
};

export type BookmarkCard = {
  id: number;
  name: string;
  url: string;
  normalizedUrl: string;
  logoUrl: string | null;
  coverUrl: string | null;
  descriptionZh: string;
  descriptionEn: string;
  publishedAt: string | null;
  tags: BookmarkTag[];
};

export type SearchBookmarksRequest = {
  q: string;
  tags: string[];
  page: number;
  pageSize: number;
  searchMode: SearchMode;
};

export type SearchBookmarksResponse = {
  items: BookmarkCard[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  filters: {
    selectedTags: string[];
    availableTags: BookmarkTag[];
    quickSelectTags: BookmarkTag[];
    tagSearch: {
      total: number;
      topCategories: string[];
    };
  };
  meta: {
    requestedMode: SearchMode;
    appliedMode: SearchMode;
    cacheable: boolean;
    query: string;
    ai?: {
      used: boolean;
      provider: string | null;
      rewrittenQuery: string | null;
      addedTagSlugs: string[];
    };
  };
};

export type SubmissionCreateRequest = {
  name: string;
  url: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  descriptionZh?: string | null;
  descriptionEn?: string | null;
  searchAliasesZh?: string | null;
  searchAliasesEn?: string | null;
  tagSlugs?: string[];
  enableAiEnrichment?: boolean;
};

export type SubmissionCreateResponse = {
  submissionId: number;
  status: "received" | "ai_enriched" | "duplicate";
  duplicate: boolean;
  siteId: number | null;
  aiEnrichmentAttempted: boolean;
  message: string;
};

export type ReviewQueueItem = {
  id: number;
  name: string;
  url: string;
  normalizedUrl: string;
  logoUrl: string | null;
  coverUrl: string | null;
  descriptionZh: string;
  descriptionEn: string;
  searchAliasesZh: string;
  searchAliasesEn: string;
  sourceType: "manual" | "ai_enriched";
  status: SiteStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  reviewedBy: string | null;
  clientName: string | null;
  lastSubmissionAt: string | null;
  tags: BookmarkTag[];
};

export type ReviewQueueResponse = {
  items: ReviewQueueItem[];
  availableTags: BookmarkTag[];
  meta: {
    pendingCount: number;
  };
};

export type ReviewDecisionRequest = {
  siteId: number;
  decision: "approved" | "rejected";
  name: string;
  url: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  descriptionZh?: string | null;
  descriptionEn?: string | null;
  searchAliasesZh?: string | null;
  searchAliasesEn?: string | null;
  tagSlugs?: string[];
  newTagNames?: string[];
  reviewNote?: string | null;
};

export type ReviewDecisionResponse = {
  siteId: number;
  status: Extract<SiteStatus, "approved" | "rejected">;
  message: string;
};

export function normalizeSearchMode(value: string | null | undefined): SearchMode {
  return value === "ai" ? "ai" : "standard";
}

export function parseTagsParam(value: string | null | undefined): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map(tag => tag.trim()).filter(Boolean))];
}

export function clampPage(value: string | number | null | undefined): number {
  const numeric = typeof value === "number" ? value : Number(value ?? 1);
  if (!Number.isFinite(numeric) || numeric < 1) return 1;
  return Math.floor(numeric);
}

export function clampPageSize(
  value: string | number | null | undefined,
  defaults = { pageSize: DEFAULT_PAGE_SIZE, maxPageSize: DEFAULT_MAX_PAGE_SIZE },
): number {
  const numeric = typeof value === "number" ? value : Number(value ?? defaults.pageSize);
  if (!Number.isFinite(numeric) || numeric < 1) return defaults.pageSize;
  return Math.min(Math.floor(numeric), defaults.maxPageSize);
}
