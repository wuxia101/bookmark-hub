import type { BookmarkCard, BookmarkTag, SearchBookmarksResponse, SearchMode } from "@/shared/bookmarks";
import { startTransition, useEffect, useState } from "react";
import "./index.css";

const PAGE_SIZE = 12;
const STANDARD_DEBOUNCE_MS = 250;
const AI_DEBOUNCE_MS = 900;

type Language = "zh" | "en";

function MagnifyingGlassIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.35-5.15a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z" />
    </svg>
  );
}

function SparklesIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 16.5 19.4 19l2.6.9-2.6.9-.9 2.6-.9-2.6-2.6-.9 2.6-.9.9-2.5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15.5 5.7 17l1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7.7-1.5Z" />
    </svg>
  );
}

function ChevronLeftIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m15 19-7-7 7-7" />
    </svg>
  );
}

function ChevronRightIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
    </svg>
  );
}

function buildSearchParams(input: { q: string; tags: string[]; page: number; searchMode: SearchMode }) {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.tags.length) params.set("tags", input.tags.join(","));
  if (input.page > 1) params.set("page", String(input.page));
  params.set("pageSize", String(PAGE_SIZE));
  params.set("searchMode", input.searchMode);
  return params;
}

function parseInitialUrl() {
  const params = new URLSearchParams(location.search);
  return {
    q: params.get("q")?.trim() ?? "",
    tags: params.get("tags")?.split(",").map(tag => tag.trim()).filter(Boolean) ?? [],
    page: Math.max(1, Number(params.get("page") ?? 1) || 1),
    searchMode: params.get("searchMode") === "ai" ? ("ai" as const) : ("standard" as const),
  };
}

function formatDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getDescription(item: BookmarkCard, language: Language) {
  if (language === "zh") return item.descriptionZh || item.descriptionEn || "";
  return item.descriptionEn || item.descriptionZh || "";
}

function getUiCopy(language: Language) {
  if (language === "zh") {
    return {
      title: "BookmarkHub",
      subtitle: "精选网站目录",
      searchPlaceholder: "搜索名称、URL 或标签",
      tagSearchPlaceholder: "快速搜索标签",
      allSites: "全部已审核站点",
      emptyQuery: "未输入关键词",
      noMatch: "暂无结果",
      previous: "上一页",
      next: "下一页",
      results: "结果",
      standard: "标准",
      ai: "AI",
      aiFallback: "AI 未开启，已回退为标准搜索",
      loading: "加载中",
      aiTyping: "正在整理 AI 查询…",
      aiSearching: "AI 正在增强搜索…",
      aiReady: "AI 搜索已启用",
      open: "访问",
      submitted: "已收录",
      selectedTags: "已选标签",
    };
  }

  return {
    title: "BookmarkHub",
    subtitle: "Curated Website Directory",
    searchPlaceholder: "Search name, URL, or tag",
    tagSearchPlaceholder: "Filter tags",
    allSites: "All approved sites",
    emptyQuery: "Empty query",
    noMatch: "No result",
    previous: "Prev",
    next: "Next",
    results: "results",
    standard: "Standard",
    ai: "AI",
    aiFallback: "AI disabled, fallback to standard search",
    loading: "Loading",
    aiTyping: "Preparing AI query…",
    aiSearching: "AI-enhanced search running…",
    aiReady: "AI search ready",
    open: "Open",
    submitted: "Indexed",
    selectedTags: "Selected tags",
  };
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeoutId);
  }, [delay, value]);

  return debounced;
}

function Pagination(props: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  previousLabel: string;
  nextLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-6">
      <button
        type="button"
        onClick={() => props.onPageChange(props.page - 1)}
        disabled={props.page <= 1}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm text-foreground transition hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeftIcon className="size-4" />
        {props.previousLabel}
      </button>
      <div className="text-sm text-muted-foreground">
        {props.page} / {props.totalPages}
      </div>
      <button
        type="button"
        onClick={() => props.onPageChange(props.page + 1)}
        disabled={props.page >= props.totalPages}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-border px-4 text-sm text-foreground transition hover:border-foreground/40 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {props.nextLabel}
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  );
}

function TagPill(props: { tag: BookmarkTag; active: boolean; onToggle: (slug: string) => void; language: Language }) {
  const label = props.language === "zh" ? props.tag.nameZh : props.tag.nameEn;
  return (
    <button
      type="button"
      onClick={() => props.onToggle(props.tag.slug)}
      className={[
        "rounded-full border px-3 py-1.5 text-xs transition",
        props.active ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      ].join(" ")}
    >
      {label}
      <span className="ml-2 opacity-60">{props.tag.siteCount}</span>
    </button>
  );
}

function LanguageSwitch(props: { language: Language; onChange: (language: Language) => void }) {
  return (
    <div className="inline-flex rounded-full border border-border bg-card p-1">
      {(["zh", "en"] as const).map(option => (
        <button
          key={option}
          type="button"
          onClick={() => props.onChange(option)}
          className={[
            "rounded-full px-3 py-1.5 text-xs transition",
            props.language === option ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function SearchModeSwitch(props: {
  searchMode: SearchMode;
  onChange: (mode: SearchMode) => void;
  standardLabel: string;
  aiLabel: string;
}) {
  return (
    <div className="inline-flex rounded-full border border-border bg-card p-1">
      <button
        type="button"
        onClick={() => props.onChange("standard")}
        className={[
          "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition",
          props.searchMode === "standard" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        <MagnifyingGlassIcon className="size-4" />
        {props.standardLabel}
      </button>
      <button
        type="button"
        onClick={() => props.onChange("ai")}
        className={[
          "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition",
          props.searchMode === "ai" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        <SparklesIcon className="size-4" />
        {props.aiLabel}
      </button>
    </div>
  );
}

function BookmarkCardView(props: { item: BookmarkCard; language: Language; openLabel: string; submittedLabel: string }) {
  const description = getDescription(props.item, props.language);
  const bannerStyle = {
    backgroundImage: `linear-gradient(to bottom, rgba(15,23,42,0.06), rgba(15,23,42,0.45)), url(${props.item.coverUrl})`,
  };

  return (
    <article className="overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="h-40 bg-cover bg-center" style={bannerStyle} />
      <div className="relative px-5 pb-5 pt-4">
        <div className="-mt-12 mb-4 flex items-end justify-between gap-4">
          <div className="flex items-end gap-3">
            <div className="flex size-16 items-center justify-center overflow-hidden rounded-2xl border border-white/70 bg-white shadow-lg">
              <img src={props.item.logoUrl ?? ""} alt={`${props.item.name} logo`} className="size-11 object-cover" />
            </div>
            <div className="rounded-full border border-border bg-background/92 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              {formatDomain(props.item.url)}
            </div>
          </div>
          <a
            href={props.item.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center rounded-full bg-foreground px-4 text-sm text-background transition hover:opacity-90"
          >
            {props.openLabel}
          </a>
        </div>

        <div className="space-y-3">
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-foreground">{props.item.name}</h3>
            <div className="mt-1 text-xs text-muted-foreground">{props.submittedLabel}</div>
          </div>
          <p className="line-clamp-3 text-sm leading-6 text-foreground/84">{description || props.item.url}</p>
          <div className="flex flex-wrap gap-2">
            {props.item.tags.map(tag => (
              <span key={`${props.item.id}-${tag.slug}`} className="rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground">
                {props.language === "zh" ? tag.nameZh : tag.nameEn}
              </span>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

export function App() {
  const initial = parseInitialUrl();
  const [query, setQuery] = useState(initial.q);
  const [selectedTags, setSelectedTags] = useState<string[]>(initial.tags);
  const [tagQuery, setTagQuery] = useState("");
  const [page, setPage] = useState(initial.page);
  const [searchMode, setSearchMode] = useState<SearchMode>(initial.searchMode);
  const [language, setLanguage] = useState<Language>("zh");
  const [response, setResponse] = useState<SearchBookmarksResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const copy = getUiCopy(language);
  const debouncedQuery = useDebouncedValue(query, searchMode === "ai" ? AI_DEBOUNCE_MS : STANDARD_DEBOUNCE_MS);
  const isTypingQuery = debouncedQuery !== query;

  useEffect(() => {
    const saved = localStorage.getItem("bookmarkhub-language");
    if (saved === "zh" || saved === "en") {
      setLanguage(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("bookmarkhub-language", language);
  }, [language]);

  useEffect(() => {
    const params = buildSearchParams({ q: query.trim(), tags: selectedTags, page, searchMode });
    const nextUrl = params.toString() ? `?${params.toString()}` : location.pathname;
    history.replaceState(null, "", nextUrl);
  }, [page, query, searchMode, selectedTags]);

  useEffect(() => {
    const controller = new AbortController();
    const params = buildSearchParams({ q: debouncedQuery.trim(), tags: selectedTags, page, searchMode });

    setIsLoading(true);
    setError("");

    fetch(`/api/bookmarks/search?${params.toString()}`, { signal: controller.signal })
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message ?? "Search request failed");
        }
        return (await res.json()) as SearchBookmarksResponse;
      })
      .then(data => {
        startTransition(() => {
          setResponse(data);
        });
      })
      .catch(fetchError => {
        if (controller.signal.aborted) return;
        setError(fetchError instanceof Error ? fetchError.message : String(fetchError));
        setResponse(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [debouncedQuery, page, searchMode, selectedTags]);

  const availableTags = response?.filters.availableTags ?? [];
  const quickSelectTags = response?.filters.quickSelectTags ?? [];
  const totalPages = response?.pagination.totalPages ?? 1;
  const totalItems = response?.pagination.totalItems ?? 0;
  const tagNeedle = tagQuery.trim().toLowerCase();
  const filteredTags = availableTags.filter(tag => {
    if (!tagNeedle) return true;
    return (
      tag.slug.toLowerCase().includes(tagNeedle) ||
      tag.nameZh.toLowerCase().includes(tagNeedle) ||
      tag.nameEn.toLowerCase().includes(tagNeedle)
    );
  });
  const visibleTags = filteredTags.slice(0, 24);
  const preferredTags = (tagNeedle ? visibleTags : quickSelectTags.length ? quickSelectTags : visibleTags).filter(
    tag => !selectedTags.includes(tag.slug),
  );

  function toggleTag(slug: string) {
    setSelectedTags(current => (current.includes(slug) ? current.filter(item => item !== slug) : [...current, slug]));
    setPage(1);
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[36px] border border-border bg-card">
        <div className="relative h-56 bg-[linear-gradient(135deg,#dbeafe_0%,#eef2ff_38%,#fae8ff_100%)] sm:h-64">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.55),transparent_28%)]" />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">{copy.subtitle}</div>
                  <h1 className="mt-1 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{copy.title}</h1>
                </div>
                <LanguageSwitch language={language} onChange={setLanguage} />
              </div>
              <div className="grid gap-4 rounded-[28px] border border-white/60 bg-white/78 p-4 shadow-lg backdrop-blur sm:grid-cols-[1fr_auto] sm:p-5">
                <div className="relative">
                  <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={event => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    placeholder={copy.searchPlaceholder}
                    className="h-13 w-full rounded-2xl border border-border bg-background pl-12 pr-4 text-sm text-foreground outline-none transition focus:border-foreground/40"
                  />
                </div>
                <SearchModeSwitch
                  searchMode={searchMode}
                  onChange={mode => {
                    setSearchMode(mode);
                    setPage(1);
                  }}
                  standardLabel={copy.standard}
                  aiLabel={copy.ai}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {isTypingQuery ? copy.aiTyping : isLoading ? copy.loading : `${totalItems} ${copy.results}`}
          </div>
          <div className="text-sm text-muted-foreground">{query.trim() || copy.emptyQuery}</div>
        </div>

        {searchMode === "ai" ? (
          <div className="mb-4 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
            {isTypingQuery
              ? copy.aiTyping
              : isLoading
                ? copy.aiSearching
                : response?.meta.ai?.rewrittenQuery
                  ? `${copy.aiReady}: ${response.meta.ai.rewrittenQuery}`
                  : copy.aiReady}
          </div>
        ) : null}

        <div className="mb-6 rounded-[28px] border border-border bg-card p-4">
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <div className="space-y-3">
              <input
                value={tagQuery}
                onChange={event => setTagQuery(event.target.value)}
                placeholder={copy.tagSearchPlaceholder}
                className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-foreground/40"
              />
              <div className="rounded-2xl bg-background px-4 py-3 text-sm text-muted-foreground">
                {selectedTags.length ? `${copy.selectedTags}: ${selectedTags.length}` : copy.allSites}
              </div>
            </div>
            <div className="space-y-3">
              {selectedTags.length ? (
                <div className="flex flex-wrap gap-2">
                  {selectedTags.map(slug => {
                    const tag = availableTags.find(item => item.slug === slug);
                    if (!tag) return null;
                    return <TagPill key={tag.slug} tag={tag} active={true} onToggle={toggleTag} language={language} />;
                  })}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {preferredTags.map(tag => (
                  <TagPill key={tag.slug} tag={tag} active={selectedTags.includes(tag.slug)} onToggle={toggleTag} language={language} />
                ))}
                {!availableTags.length && !isLoading ? <div className="text-sm text-muted-foreground">{copy.allSites}</div> : null}
              </div>
            </div>
          </div>
        </div>

        {response && response.meta.requestedMode !== response.meta.appliedMode ? (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{copy.aiFallback}</div>
        ) : null}

        {error ? <div className="mb-5 rounded-2xl border border-destructive/30 px-4 py-3 text-sm text-destructive">{error}</div> : null}

        {isLoading ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-[360px] animate-pulse rounded-[28px] border border-border bg-card" />
            ))}
          </div>
        ) : response?.items.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {response.items.map(item => (
              <BookmarkCardView key={item.id} item={item} language={language} openLabel={copy.open} submittedLabel={copy.submitted} />
            ))}
          </div>
        ) : (
          <div className="rounded-[28px] border border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">{copy.noMatch}</div>
        )}

        <div className="mt-8">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            previousLabel={copy.previous}
            nextLabel={copy.next}
          />
        </div>
      </section>
    </main>
  );
}

export default App;
