import { debugLog } from "@/server/lib/debug";
import type { BookmarkCard, BookmarkTag, SearchMode, SubmissionCreateRequest } from "@/shared/bookmarks";

export type SearchModeResolution = {
  requestedMode: SearchMode;
  appliedMode: SearchMode;
  cacheable: boolean;
};

export type AiSearchRewriteInput = {
  query: string;
  currentTagSlugs: string[];
  availableTags: BookmarkTag[];
};

export type AiSearchRewriteResult = {
  rewrittenQuery: string | null;
  suggestedTagSlugs: string[];
  provider: string | null;
  used: boolean;
  skipped?: "short-query" | "cache-hit" | "not-configured";
};

export type AiEnrichmentResult = {
  descriptionZh?: string;
  descriptionEn?: string;
  searchAliasesZh?: string;
  searchAliasesEn?: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  suggestedTagSlugs?: string[];
};

export type AiSimilarSiteResult = {
  name: string;
  url: string;
  descriptionZh?: string;
  descriptionEn?: string;
  searchAliasesZh?: string;
  searchAliasesEn?: string;
  suggestedTagSlugs: string[];
};

export interface AiSearchProvider {
  resolveMode(requestedMode: SearchMode): SearchModeResolution;
  rewriteSearchInput(input: AiSearchRewriteInput): Promise<AiSearchRewriteResult>;
}

export interface AiEnrichmentProvider {
  enrich(input: SubmissionCreateRequest, context?: { availableTags?: BookmarkTag[] }): Promise<AiEnrichmentResult | null>;
}

export interface AiSimilarSiteProvider {
  findSimilar(
    input: BookmarkCard,
    context?: { availableTags?: BookmarkTag[]; maxItems?: number },
  ): Promise<AiSimilarSiteResult[]>;
}

export class FallbackAiSearchProvider implements AiSearchProvider {
  constructor(
    private readonly enabled: boolean,
    private readonly providerName: string | null = null,
    private readonly isConfigured = false,
  ) {}

  resolveMode(requestedMode: SearchMode): SearchModeResolution {
    if (requestedMode === "ai" && (!this.enabled || !this.isConfigured)) {
      return {
        requestedMode,
        appliedMode: "standard",
        cacheable: true,
      };
    }

    return {
      requestedMode,
      appliedMode: requestedMode,
      cacheable: requestedMode !== "ai",
    };
  }

  async rewriteSearchInput(_input: AiSearchRewriteInput): Promise<AiSearchRewriteResult> {
    return {
      rewrittenQuery: null,
      suggestedTagSlugs: [],
      provider: this.providerName,
      used: false,
      skipped: "not-configured",
    };
  }
}

export class NoopAiEnrichmentProvider implements AiEnrichmentProvider {
  async enrich(_input: SubmissionCreateRequest): Promise<AiEnrichmentResult | null> {
    return null;
  }
}

export class NoopAiSimilarSiteProvider implements AiSimilarSiteProvider {
  async findSimilar(): Promise<AiSimilarSiteResult[]> {
    return [];
  }
}

function extractJsonObject(input: string): string | null {
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return input.slice(start, end + 1);
}

function truncateForLog(value: string | null | undefined, maxLength = 160) {
  if (!value) return "";
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function sanitizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/$/, "");
}

function summarizeTagSlugs(tags: string[], maxItems = 8) {
  if (tags.length <= maxItems) return tags;
  return [...tags.slice(0, maxItems), `...(+${tags.length - maxItems})`];
}

export class OpenAICompatibleAiSearchProvider implements AiSearchProvider {
  private readonly cache = new Map<string, AiSearchRewriteResult>();

  constructor(
    private readonly enabled: boolean,
    private readonly providerName: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  resolveMode(requestedMode: SearchMode): SearchModeResolution {
    if (requestedMode === "ai" && (!this.enabled || !this.apiKey || !this.model)) {
      return {
        requestedMode,
        appliedMode: "standard",
        cacheable: true,
      };
    }

    return {
      requestedMode,
      appliedMode: requestedMode,
      cacheable: requestedMode !== "ai",
    };
  }

  async rewriteSearchInput(input: AiSearchRewriteInput): Promise<AiSearchRewriteResult> {
    const query = input.query.trim();
    if (!query || !this.apiKey || !this.model) {
      return {
        rewrittenQuery: null,
        suggestedTagSlugs: [],
        provider: this.providerName,
        used: false,
        skipped: "not-configured",
      };
    }

    if (Array.from(query).length < 2) {
      return {
        rewrittenQuery: null,
        suggestedTagSlugs: [],
        provider: this.providerName,
        used: false,
        skipped: "short-query",
      };
    }

    const cacheKey = JSON.stringify({
      query: query.toLowerCase(),
      tags: input.currentTagSlugs.slice().sort(),
    });
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return {
        ...cached,
        skipped: "cache-hit",
      };
    }

    const tagHints = input.availableTags
      .slice(0, 50)
      .map(tag => `${tag.slug} | zh=${tag.nameZh} | en=${tag.nameEn}`)
      .join("\n");
    const startedAt = Date.now();
    const endpoint = `${sanitizeBaseUrl(this.baseUrl)}/chat/completions`;
    debugLog("ai:search", "request", {
      provider: this.providerName,
      model: this.model,
      endpoint,
      query,
      currentTagSlugs: summarizeTagSlugs(input.currentTagSlugs),
      availableTagCount: input.availableTags.length,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You rewrite bookmark directory search queries. Return compact JSON only with keys rewrittenQuery and tagSlugs. rewrittenQuery must be a short bilingual keyword query for lexical search. tagSlugs must only contain values from the provided tag list.",
          },
          {
            role: "user",
            content: [
              `User query: ${query}`,
              `Already selected tag slugs: ${input.currentTagSlugs.join(", ") || "(none)"}`,
              "Available tags:",
              tagHints || "(none)",
              'Return JSON like: {"rewrittenQuery":"...", "tagSlugs":["..."]}',
            ].join("\n"),
          },
        ],
      }),
    });

    if (!response.ok) {
      debugLog("ai:search", "error", {
        provider: this.providerName,
        model: this.model,
        endpoint,
        durationMs: Date.now() - startedAt,
        status: response.status,
      });
      throw new Error(`AI search rewrite failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
        };
      }>;
    };

    const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
    const jsonText = extractJsonObject(content);
    if (!jsonText) {
      debugLog("ai:search", "response", {
        provider: this.providerName,
        model: this.model,
        durationMs: Date.now() - startedAt,
        used: false,
        reason: "no-json-object",
        contentPreview: truncateForLog(content),
      });
      return {
        rewrittenQuery: null,
        suggestedTagSlugs: [],
        provider: this.providerName,
        used: false,
      };
    }

    const parsed = JSON.parse(jsonText) as {
      rewrittenQuery?: unknown;
      tagSlugs?: unknown;
    };

    const allowedSlugs = new Set(input.availableTags.map(tag => tag.slug));
    const suggestedTagSlugs = Array.isArray(parsed.tagSlugs)
      ? [...new Set(parsed.tagSlugs.map(value => String(value)).filter(slug => allowedSlugs.has(slug)))]
      : [];

    const rewrittenQuery =
      typeof parsed.rewrittenQuery === "string" && parsed.rewrittenQuery.trim() ? parsed.rewrittenQuery.trim() : null;

    const result = {
      rewrittenQuery,
      suggestedTagSlugs,
      provider: this.providerName,
      used: Boolean(rewrittenQuery || suggestedTagSlugs.length),
    };
    debugLog("ai:search", "response", {
      provider: this.providerName,
      model: this.model,
      durationMs: Date.now() - startedAt,
      used: result.used,
      rewrittenQuery,
      suggestedTagSlugs: summarizeTagSlugs(suggestedTagSlugs),
      contentPreview: truncateForLog(content),
    });
    this.cache.set(cacheKey, result);
    if (this.cache.size > 200) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    return result;
  }
}

export class OpenAICompatibleAiEnrichmentProvider implements AiEnrichmentProvider {
  constructor(
    private readonly providerName: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async enrich(
    input: SubmissionCreateRequest,
    context?: { availableTags?: BookmarkTag[] },
  ): Promise<AiEnrichmentResult | null> {
    if (!this.apiKey || !this.model) return null;

    const tagHints = (context?.availableTags ?? [])
      .slice(0, 80)
      .map(tag => `${tag.slug} | zh=${tag.nameZh} | en=${tag.nameEn}`)
      .join("\n");
    const startedAt = Date.now();
    const endpoint = `${sanitizeBaseUrl(this.baseUrl)}/chat/completions`;
    debugLog("ai:enrichment", "request", {
      provider: this.providerName,
      model: this.model,
      endpoint,
      name: input.name,
      url: input.url,
      providedTagSlugs: summarizeTagSlugs(input.tagSlugs ?? []),
      availableTagCount: context?.availableTags?.length ?? 0,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You enrich bookmark records. Return compact JSON only with keys descriptionZh, descriptionEn, searchAliasesZh, searchAliasesEn, logoUrl, coverUrl, suggestedTagSlugs. Descriptions must each be <=100 chars. Aliases should be short search terms. Use only provided tag slugs.",
          },
          {
            role: "user",
            content: [
              `name: ${input.name}`,
              `url: ${input.url}`,
              `descriptionZh: ${input.descriptionZh ?? ""}`,
              `descriptionEn: ${input.descriptionEn ?? ""}`,
              `providedTagSlugs: ${(input.tagSlugs ?? []).join(", ") || "(none)"}`,
              "Available tags:",
              tagHints || "(none)",
            ].join("\n"),
          },
        ],
      }),
    });

    if (!response.ok) {
      debugLog("ai:enrichment", "error", {
        provider: this.providerName,
        model: this.model,
        endpoint,
        durationMs: Date.now() - startedAt,
        status: response.status,
      });
      throw new Error(`AI enrichment failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
        };
      }>;
    };

    const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
    const jsonText = extractJsonObject(content);
    if (!jsonText) {
      debugLog("ai:enrichment", "response", {
        provider: this.providerName,
        model: this.model,
        durationMs: Date.now() - startedAt,
        used: false,
        reason: "no-json-object",
        contentPreview: truncateForLog(content),
      });
      return null;
    }

    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const allowedSlugs = new Set((context?.availableTags ?? []).map(tag => tag.slug));

    const sanitizeText = (value: unknown, maxLength: number) => {
      if (typeof value !== "string") return undefined;
      const normalized = value.trim();
      if (!normalized) return undefined;
      return Array.from(normalized).slice(0, maxLength).join("");
    };

    const sanitizeUrl = (value: unknown) => {
      if (typeof value !== "string" || !value.trim()) return undefined;
      try {
        const url = new URL(value.trim());
        if (!["http:", "https:"].includes(url.protocol)) return undefined;
        return url.toString();
      } catch {
        return undefined;
      }
    };

    const result = {
      descriptionZh: sanitizeText(parsed.descriptionZh, 100),
      descriptionEn: sanitizeText(parsed.descriptionEn, 100),
      searchAliasesZh: sanitizeText(parsed.searchAliasesZh, 200),
      searchAliasesEn: sanitizeText(parsed.searchAliasesEn, 200),
      logoUrl: sanitizeUrl(parsed.logoUrl) ?? null,
      coverUrl: sanitizeUrl(parsed.coverUrl) ?? null,
      suggestedTagSlugs: Array.isArray(parsed.suggestedTagSlugs)
        ? [...new Set(parsed.suggestedTagSlugs.map(value => String(value)).filter(slug => allowedSlugs.has(slug)))]
        : [],
    };
    debugLog("ai:enrichment", "response", {
      provider: this.providerName,
      model: this.model,
      durationMs: Date.now() - startedAt,
      suggestedTagSlugs: summarizeTagSlugs(result.suggestedTagSlugs ?? []),
      descriptionZh: truncateForLog(result.descriptionZh),
      descriptionEn: truncateForLog(result.descriptionEn),
      logoUrl: result.logoUrl,
      coverUrl: result.coverUrl,
      contentPreview: truncateForLog(content),
    });
    return result;
  }
}

export class OpenAICompatibleAiSimilarSiteProvider implements AiSimilarSiteProvider {
  constructor(
    private readonly providerName: string,
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async findSimilar(
    input: BookmarkCard,
    context?: { availableTags?: BookmarkTag[]; maxItems?: number },
  ): Promise<AiSimilarSiteResult[]> {
    if (!this.apiKey || !this.model) return [];

    const maxItems = Math.min(Math.max(context?.maxItems ?? 6, 1), 10);
    const tagHints = (context?.availableTags ?? [])
      .slice(0, 120)
      .map(tag => `${tag.slug} | zh=${tag.nameZh} | en=${tag.nameEn}`)
      .join("\n");
    const currentTags = input.tags.map(tag => tag.slug).join(", ") || "(none)";
    const startedAt = Date.now();
    const endpoint = `${sanitizeBaseUrl(this.baseUrl)}/chat/completions`;
    debugLog("ai:similar", "request", {
      provider: this.providerName,
      model: this.model,
      endpoint,
      sourceSiteId: input.id,
      sourceName: input.name,
      sourceUrl: input.url,
      currentTagSlugs: summarizeTagSlugs(input.tags.map(tag => tag.slug)),
      availableTagCount: context?.availableTags?.length ?? 0,
      maxItems,
    });

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You recommend websites similar to a given source website. Return compact JSON only with key items. Each item must have name, url, descriptionZh, descriptionEn, searchAliasesZh, searchAliasesEn, suggestedTagSlugs. Use only provided tag slugs. URLs must be homepage URLs with http/https. Do not include the source website.",
          },
          {
            role: "user",
            content: [
              `Find up to ${maxItems} websites similar to:`,
              `name: ${input.name}`,
              `url: ${input.url}`,
              `descriptionZh: ${input.descriptionZh ?? ""}`,
              `descriptionEn: ${input.descriptionEn ?? ""}`,
              `currentTagSlugs: ${currentTags}`,
              "Available tags:",
              tagHints || "(none)",
            ].join("\n"),
          },
        ],
      }),
    });

    if (!response.ok) {
      debugLog("ai:similar", "error", {
        provider: this.providerName,
        model: this.model,
        endpoint,
        durationMs: Date.now() - startedAt,
        status: response.status,
      });
      throw new Error(`AI similar-site generation failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string | null;
        };
      }>;
    };

    const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
    const jsonText = extractJsonObject(content);
    if (!jsonText) {
      debugLog("ai:similar", "response", {
        provider: this.providerName,
        model: this.model,
        durationMs: Date.now() - startedAt,
        itemCount: 0,
        reason: "no-json-object",
        contentPreview: truncateForLog(content),
      });
      return [];
    }

    const parsed = JSON.parse(jsonText) as { items?: unknown };
    const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
    const allowedSlugs = new Set((context?.availableTags ?? []).map(tag => tag.slug));

    const sanitizeText = (value: unknown, maxLength: number) => {
      if (typeof value !== "string") return undefined;
      const normalized = value.trim();
      if (!normalized) return undefined;
      return Array.from(normalized).slice(0, maxLength).join("");
    };

    const sanitizeUrl = (value: unknown) => {
      if (typeof value !== "string" || !value.trim()) return null;
      try {
        const url = new URL(value.trim());
        if (!["http:", "https:"].includes(url.protocol)) return null;
        return url.toString();
      } catch {
        return null;
      }
    };

    const results: AiSimilarSiteResult[] = [];
    const seenUrls = new Set<string>();
    for (const item of rawItems) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      const name = sanitizeText(record.name, 80);
      const url = sanitizeUrl(record.url);
      if (!name || !url || url === input.url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      results.push({
        name,
        url,
        descriptionZh: sanitizeText(record.descriptionZh, 100),
        descriptionEn: sanitizeText(record.descriptionEn, 100),
        searchAliasesZh: sanitizeText(record.searchAliasesZh, 200),
        searchAliasesEn: sanitizeText(record.searchAliasesEn, 200),
        suggestedTagSlugs: Array.isArray(record.suggestedTagSlugs)
          ? [...new Set(record.suggestedTagSlugs.map(value => String(value)).filter(slug => allowedSlugs.has(slug)))]
          : [],
      });
    }

    const finalResults = results.slice(0, maxItems);
    debugLog("ai:similar", "response", {
      provider: this.providerName,
      model: this.model,
      durationMs: Date.now() - startedAt,
      itemCount: finalResults.length,
      items: finalResults.map(item => ({
        name: item.name,
        url: item.url,
        suggestedTagSlugs: summarizeTagSlugs(item.suggestedTagSlugs),
      })),
      contentPreview: truncateForLog(content),
    });
    return finalResults;
  }
}

export function createAiSearchProvider(config: {
  enabled: boolean;
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}): AiSearchProvider {
  const providerName = config.provider || null;
  const isConfigured = Boolean(config.apiKey && config.model);

  if (!isConfigured) {
    return new FallbackAiSearchProvider(config.enabled, providerName, false);
  }

  const normalizedProvider = config.provider.toLowerCase();
  if (normalizedProvider === "openai" || normalizedProvider === "openai-compatible" || normalizedProvider === "") {
    return new OpenAICompatibleAiSearchProvider(
      config.enabled,
      config.provider || "openai-compatible",
      config.baseUrl || "https://api.openai.com/v1",
      config.apiKey,
      config.model,
    );
  }

  return new FallbackAiSearchProvider(config.enabled, providerName, true);
}

export function createAiEnrichmentProvider(config: {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}): AiEnrichmentProvider {
  if (!config.apiKey || !config.model) {
    return new NoopAiEnrichmentProvider();
  }

  const normalizedProvider = config.provider.toLowerCase();
  if (normalizedProvider === "openai" || normalizedProvider === "openai-compatible" || normalizedProvider === "") {
    return new OpenAICompatibleAiEnrichmentProvider(
      config.provider || "openai-compatible",
      config.baseUrl || "https://api.openai.com/v1",
      config.apiKey,
      config.model,
    );
  }

  return new NoopAiEnrichmentProvider();
}

export function createAiSimilarSiteProvider(config: {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}): AiSimilarSiteProvider {
  if (!config.apiKey || !config.model) {
    return new NoopAiSimilarSiteProvider();
  }

  const normalizedProvider = config.provider.toLowerCase();
  if (normalizedProvider === "openai" || normalizedProvider === "openai-compatible" || normalizedProvider === "") {
    return new OpenAICompatibleAiSimilarSiteProvider(
      config.provider || "openai-compatible",
      config.baseUrl || "https://api.openai.com/v1",
      config.apiKey,
      config.model,
    );
  }

  return new NoopAiSimilarSiteProvider();
}
