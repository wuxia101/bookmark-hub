import type { BookmarkTag, SearchMode, SubmissionCreateRequest } from "@/shared/bookmarks";

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

export interface AiSearchProvider {
  resolveMode(requestedMode: SearchMode): SearchModeResolution;
  rewriteSearchInput(input: AiSearchRewriteInput): Promise<AiSearchRewriteResult>;
}

export interface AiEnrichmentProvider {
  enrich(input: SubmissionCreateRequest, context?: { availableTags?: BookmarkTag[] }): Promise<AiEnrichmentResult | null>;
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

function extractJsonObject(input: string): string | null {
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return input.slice(start, end + 1);
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

    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
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

    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
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
    if (!jsonText) return null;

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

    return {
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
