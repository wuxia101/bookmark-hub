import { config } from "@/server/config";
import { findApprovedTags, searchApprovedSites } from "@/server/repositories/bookmarkRepository";
import { createAiSearchProvider } from "@/server/services/ai";
import type { BookmarkCard, SearchBookmarksRequest, SearchBookmarksResponse } from "@/shared/bookmarks";

const aiSearchProvider = createAiSearchProvider({
  enabled: config.aiSearchEnabled,
  provider: config.aiProvider,
  baseUrl: config.aiBaseUrl,
  apiKey: config.aiApiKey,
  model: config.aiModel,
});

function toSeedFragment(input: string) {
  const normalized = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "bookmarkhub";
}

function buildFallbackImageUrl(seed: string, kind: "cover" | "logo", width: number, height: number) {
  const safeSeed = toSeedFragment(seed);
  return `https://picsum.photos/seed/${safeSeed}-${kind}/${width}/${height}`;
}

export async function searchBookmarks(input: SearchBookmarksRequest): Promise<SearchBookmarksResponse> {
  const mode = aiSearchProvider.resolveMode(input.searchMode);
  const availableTags = (await findApprovedTags()).map(tag => ({
    id: Number(tag.id),
    slug: tag.slug,
    nameZh: tag.name_zh,
    nameEn: tag.name_en,
    category: tag.category,
    siteCount: Number(tag.site_count ?? 0),
  }));

  let effectiveQuery = input.q;
  let effectiveTags = input.tags;
  let aiMeta: SearchBookmarksResponse["meta"]["ai"] | undefined = undefined;

  if (mode.appliedMode === "ai" && input.q.trim()) {
    try {
      const rewrite = await aiSearchProvider.rewriteSearchInput({
        query: input.q,
        currentTagSlugs: input.tags,
        availableTags,
      });

      effectiveQuery = rewrite.rewrittenQuery || input.q;
      effectiveTags = [...new Set([...input.tags, ...rewrite.suggestedTagSlugs])];
      aiMeta = {
        used: rewrite.used,
        provider: rewrite.provider,
        rewrittenQuery: rewrite.rewrittenQuery,
        addedTagSlugs: rewrite.suggestedTagSlugs.filter(slug => !input.tags.includes(slug)),
      };
    } catch {
      aiMeta = {
        used: false,
        provider: config.aiProvider || null,
        rewrittenQuery: null,
        addedTagSlugs: [],
      };
    }
  }

  const result = await searchApprovedSites({
    ...input,
    q: effectiveQuery,
    tags: effectiveTags,
    searchMode: mode.appliedMode,
  });

  const items: BookmarkCard[] = result.items.map(site => {
    const seed = `${site.name}-${site.id}`;

    return {
      id: Number(site.id),
      name: site.name,
      url: site.url,
      normalizedUrl: site.normalized_url,
      logoUrl: site.logo_url || buildFallbackImageUrl(seed, "logo", 128, 128),
      coverUrl: site.cover_url || buildFallbackImageUrl(seed, "cover", 960, 540),
      descriptionZh: site.description_zh,
      descriptionEn: site.description_en,
      publishedAt: site.published_at ? new Date(site.published_at).toISOString() : null,
      tags: (result.tagsBySiteId.get(Number(site.id)) ?? []).map(tag => ({
        id: Number(tag.id),
        slug: tag.slug,
        nameZh: tag.name_zh,
        nameEn: tag.name_en,
        category: tag.category,
        siteCount: Number(tag.site_count ?? 0),
      })),
    };
  });

  const responseAvailableTags = result.availableTags.map(tag => ({
    id: Number(tag.id),
    slug: tag.slug,
    nameZh: tag.name_zh,
    nameEn: tag.name_en,
    category: tag.category,
    siteCount: Number(tag.site_count ?? 0),
  }));

  const quickSelectTags = responseAvailableTags
    .slice()
    .sort((left, right) => {
      if (right.siteCount !== left.siteCount) return right.siteCount - left.siteCount;
      return left.slug.localeCompare(right.slug);
    })
    .slice(0, 12);

  const topCategories = [...new Set(responseAvailableTags.map(tag => tag.category).filter(Boolean))].slice(0, 8);

  return {
    items,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems: result.totalItems,
      totalPages: Math.max(1, Math.ceil(result.totalItems / input.pageSize)),
    },
    filters: {
      selectedTags: effectiveTags,
      availableTags: responseAvailableTags,
      quickSelectTags,
      tagSearch: {
        total: responseAvailableTags.length,
        topCategories,
      },
    },
    meta: {
      requestedMode: mode.requestedMode,
      appliedMode: mode.appliedMode,
      cacheable: mode.cacheable,
      query: input.q,
      ai: aiMeta,
    },
  };
}
