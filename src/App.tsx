import type {
  BookmarkCard,
  BookmarkTag,
  ReviewDecisionRequest,
  ReviewQueueItem,
  ReviewQueueResponse,
  SearchBookmarksResponse,
  SearchMode,
} from "@/shared/bookmarks";
import { startTransition, useEffect, useState } from "react";
import "./index.css";

const PAGE_SIZE = 12;
const STANDARD_DEBOUNCE_MS = 250;
const AI_DEBOUNCE_MS = 900;
const LANGUAGE_STORAGE_KEY = "bookmarkhub-language";
const REVIEW_KEY_STORAGE_KEY = "bookmarkhub-review-api-key";

type Language = "zh" | "en";
type ViewMode = "search" | "reviews";
type ReviewDraft = {
  siteId: number;
  name: string;
  url: string;
  logoUrl: string;
  coverUrl: string;
  descriptionZh: string;
  descriptionEn: string;
  searchAliasesZh: string;
  searchAliasesEn: string;
  tagSlugs: string[];
  reviewNote: string;
};

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

function ShieldIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={props.className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3 5 6v5c0 5 3.4 8.7 7 10 3.6-1.3 7-5 7-10V6l-7-3Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m9.5 12 1.7 1.7 3.3-3.7" />
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
    view: params.get("view") === "reviews" ? ("reviews" as const) : ("search" as const),
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

function formatDateTime(value: string | null, language: Language) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getDescription(item: BookmarkCard, language: Language) {
  if (language === "zh") return item.descriptionZh || item.descriptionEn || "";
  return item.descriptionEn || item.descriptionZh || "";
}

function createReviewDraft(item: ReviewQueueItem): ReviewDraft {
  return {
    siteId: item.id,
    name: item.name,
    url: item.url,
    logoUrl: item.logoUrl ?? "",
    coverUrl: item.coverUrl ?? "",
    descriptionZh: item.descriptionZh,
    descriptionEn: item.descriptionEn,
    searchAliasesZh: item.searchAliasesZh,
    searchAliasesEn: item.searchAliasesEn,
    tagSlugs: item.tags.map(tag => tag.slug),
    reviewNote: item.reviewNote,
  };
}

function getUiCopy(language: Language) {
  if (language === "zh") {
    return {
      title: "BookmarkHub",
      subtitle: "精选网站目录",
      reviewSubtitle: "人工审核工作台",
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
      searchView: "搜索页",
      reviewView: "审核台",
      reviewEntry: "进入审核",
      reviewBack: "返回搜索",
      reviewKeyTitle: "管理员审核 Key",
      reviewKeyPlaceholder: "输入 BOOKMARKHUB_REVIEW_API_KEY",
      reviewKeySave: "连接审核接口",
      reviewKeyClear: "清空 Key",
      reviewQueue: "待审核列表",
      pendingCount: "待审核",
      reviewEmpty: "当前没有待审核站点",
      reviewRefresh: "刷新",
      reviewSourceManual: "人工提交",
      reviewSourceAi: "AI 增强提交",
      reviewClient: "提交来源",
      reviewSubmittedAt: "提交时间",
      reviewLatestRecord: "最近记录",
      reviewTags: "标签",
      reviewName: "名称",
      reviewUrl: "网址",
      reviewLogoUrl: "Logo URL",
      reviewCoverUrl: "封面 URL",
      reviewDescriptionZh: "中文简介",
      reviewDescriptionEn: "英文简介",
      reviewAliasesZh: "中文别名",
      reviewAliasesEn: "英文别名",
      reviewNote: "审核备注",
      reviewApprove: "通过并发布",
      reviewReject: "拒绝",
      reviewSaving: "正在提交审核…",
      reviewAuthFailed: "审核 Key 无效或未配置",
      reviewUnavailable: "审核接口未配置",
      reviewUpdated: "审核完成，已刷新列表",
      reviewSelectPrompt: "从左侧选择一个待审核站点",
      reviewOpenSite: "打开原站",
      reviewNoTags: "未选择标签",
      reviewQueueHint: "可在通过前直接修正字段和标签",
    };
  }

  return {
    title: "BookmarkHub",
    subtitle: "Curated Website Directory",
    reviewSubtitle: "Manual Review Console",
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
    searchView: "Search",
    reviewView: "Reviews",
    reviewEntry: "Open Reviews",
    reviewBack: "Back To Search",
    reviewKeyTitle: "Review API Key",
    reviewKeyPlaceholder: "Enter BOOKMARKHUB_REVIEW_API_KEY",
    reviewKeySave: "Connect",
    reviewKeyClear: "Clear Key",
    reviewQueue: "Pending queue",
    pendingCount: "Pending",
    reviewEmpty: "No pending submissions right now",
    reviewRefresh: "Refresh",
    reviewSourceManual: "Manual submission",
    reviewSourceAi: "AI-enriched submission",
    reviewClient: "Client",
    reviewSubmittedAt: "Submitted",
    reviewLatestRecord: "Latest record",
    reviewTags: "Tags",
    reviewName: "Name",
    reviewUrl: "URL",
    reviewLogoUrl: "Logo URL",
    reviewCoverUrl: "Cover URL",
    reviewDescriptionZh: "Chinese summary",
    reviewDescriptionEn: "English summary",
    reviewAliasesZh: "Chinese aliases",
    reviewAliasesEn: "English aliases",
    reviewNote: "Review note",
    reviewApprove: "Approve & publish",
    reviewReject: "Reject",
    reviewSaving: "Submitting review…",
    reviewAuthFailed: "Review API key is invalid or missing",
    reviewUnavailable: "Review API is not configured",
    reviewUpdated: "Review saved and queue refreshed",
    reviewSelectPrompt: "Choose a pending site from the list",
    reviewOpenSite: "Open site",
    reviewNoTags: "No tags selected",
    reviewQueueHint: "Edit fields and tags before approving",
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

function ViewSwitch(props: { view: ViewMode; onChange: (view: ViewMode) => void; searchLabel: string; reviewLabel: string }) {
  return (
    <div className="inline-flex rounded-full border border-border bg-card/90 p-1 backdrop-blur">
      <button
        type="button"
        onClick={() => props.onChange("search")}
        className={[
          "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition",
          props.view === "search" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        <MagnifyingGlassIcon className="size-4" />
        {props.searchLabel}
      </button>
      <button
        type="button"
        onClick={() => props.onChange("reviews")}
        className={[
          "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm transition",
          props.view === "reviews" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
        ].join(" ")}
      >
        <ShieldIcon className="size-4" />
        {props.reviewLabel}
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

function ReviewTagToggle(props: { tag: BookmarkTag; active: boolean; language: Language; onToggle: (slug: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => props.onToggle(props.tag.slug)}
      className={[
        "rounded-full border px-3 py-1.5 text-xs transition",
        props.active ? "border-sky-700 bg-sky-700 text-white" : "border-border bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      ].join(" ")}
    >
      {props.language === "zh" ? props.tag.nameZh : props.tag.nameEn}
    </button>
  );
}

export function App() {
  const initial = parseInitialUrl();
  const [view, setView] = useState<ViewMode>(initial.view);
  const [query, setQuery] = useState(initial.q);
  const [selectedTags, setSelectedTags] = useState<string[]>(initial.tags);
  const [tagQuery, setTagQuery] = useState("");
  const [page, setPage] = useState(initial.page);
  const [searchMode, setSearchMode] = useState<SearchMode>(initial.searchMode);
  const [language, setLanguage] = useState<Language>("zh");
  const [response, setResponse] = useState<SearchBookmarksResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [reviewKeyInput, setReviewKeyInput] = useState("");
  const [reviewApiKey, setReviewApiKey] = useState("");
  const [reviewResponse, setReviewResponse] = useState<ReviewQueueResponse | null>(null);
  const [reviewError, setReviewError] = useState("");
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [reviewReloadNonce, setReviewReloadNonce] = useState(0);
  const [selectedReviewId, setSelectedReviewId] = useState<number | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft | null>(null);
  const [reviewActionState, setReviewActionState] = useState<"approved" | "rejected" | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState("");

  const copy = getUiCopy(language);
  const debouncedQuery = useDebouncedValue(query, searchMode === "ai" ? AI_DEBOUNCE_MS : STANDARD_DEBOUNCE_MS);
  const isTypingQuery = debouncedQuery !== query;

  useEffect(() => {
    const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (savedLanguage === "zh" || savedLanguage === "en") {
      setLanguage(savedLanguage);
    }

    const savedReviewKey = localStorage.getItem(REVIEW_KEY_STORAGE_KEY) ?? "";
    setReviewApiKey(savedReviewKey);
    setReviewKeyInput(savedReviewKey);
  }, []);

  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    if (!reviewApiKey) {
      localStorage.removeItem(REVIEW_KEY_STORAGE_KEY);
      return;
    }
    localStorage.setItem(REVIEW_KEY_STORAGE_KEY, reviewApiKey);
  }, [reviewApiKey]);

  useEffect(() => {
    const params = view === "reviews" ? new URLSearchParams({ view: "reviews" }) : buildSearchParams({ q: query.trim(), tags: selectedTags, page, searchMode });
    const nextUrl = params.toString() ? `?${params.toString()}` : location.pathname;
    history.replaceState(null, "", nextUrl);
  }, [page, query, searchMode, selectedTags, view]);

  useEffect(() => {
    if (view !== "search") return;

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
  }, [debouncedQuery, page, searchMode, selectedTags, view]);

  useEffect(() => {
    if (view !== "reviews" || !reviewApiKey) return;

    const controller = new AbortController();
    setIsReviewLoading(true);
    setReviewError("");

    fetch("/api/admin/reviews", {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${reviewApiKey}`,
      },
    })
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          const message = body?.error?.message ?? "Review request failed";
          const normalizedMessage = res.status === 401 ? copy.reviewAuthFailed : res.status === 503 ? copy.reviewUnavailable : message;
          throw new Error(normalizedMessage);
        }
        return (await res.json()) as ReviewQueueResponse;
      })
      .then(data => {
        setReviewResponse(data);
        setReviewSuccess("");
      })
      .catch(fetchError => {
        if (controller.signal.aborted) return;
        setReviewError(fetchError instanceof Error ? fetchError.message : String(fetchError));
        setReviewResponse(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsReviewLoading(false);
      });

    return () => controller.abort();
  }, [copy.reviewAuthFailed, copy.reviewUnavailable, reviewApiKey, reviewReloadNonce, view]);

  useEffect(() => {
    const items = reviewResponse?.items ?? [];
    if (!items.length) {
      setSelectedReviewId(null);
      setReviewDraft(null);
      return;
    }

    const matched = items.find(item => item.id === selectedReviewId) ?? items[0];
    if (matched.id !== selectedReviewId) {
      setSelectedReviewId(matched.id);
    }
    setReviewDraft(current => (current && current.siteId === matched.id ? current : createReviewDraft(matched)));
  }, [reviewResponse, selectedReviewId]);

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
  const reviewItems = reviewResponse?.items ?? [];
  const selectedReview = reviewItems.find(item => item.id === selectedReviewId) ?? null;
  const reviewAvailableTags = reviewResponse?.availableTags ?? [];

  function toggleTag(slug: string) {
    setSelectedTags(current => (current.includes(slug) ? current.filter(item => item !== slug) : [...current, slug]));
    setPage(1);
  }

  function toggleReviewTag(slug: string) {
    setReviewDraft(current => {
      if (!current) return current;
      return {
        ...current,
        tagSlugs: current.tagSlugs.includes(slug) ? current.tagSlugs.filter(item => item !== slug) : [...current.tagSlugs, slug],
      };
    });
  }

  function updateReviewDraft<K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]) {
    setReviewDraft(current => (current ? { ...current, [key]: value } : current));
  }

  async function submitReviewDecision(decision: "approved" | "rejected") {
    if (!reviewDraft || !reviewApiKey) return;

    setReviewActionState(decision);
    setReviewError("");
    setReviewSuccess("");

    const payload: ReviewDecisionRequest = {
      siteId: reviewDraft.siteId,
      decision,
      name: reviewDraft.name,
      url: reviewDraft.url,
      logoUrl: reviewDraft.logoUrl || null,
      coverUrl: reviewDraft.coverUrl || null,
      descriptionZh: reviewDraft.descriptionZh,
      descriptionEn: reviewDraft.descriptionEn,
      searchAliasesZh: reviewDraft.searchAliasesZh,
      searchAliasesEn: reviewDraft.searchAliasesEn,
      tagSlugs: reviewDraft.tagSlugs,
      reviewNote: reviewDraft.reviewNote,
    };

    try {
      const res = await fetch("/api/admin/reviews/decision", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${reviewApiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to submit review decision");
      }

      const nextItems = reviewItems.filter(item => item.id !== reviewDraft.siteId);
      setReviewResponse(current =>
        current
          ? {
              ...current,
              items: nextItems,
              meta: {
                ...current.meta,
                pendingCount: nextItems.length,
              },
            }
          : current,
      );
      setSelectedReviewId(nextItems[0]?.id ?? null);
      setReviewDraft(nextItems[0] ? createReviewDraft(nextItems[0]) : null);
      setReviewSuccess(copy.reviewUpdated);
    } catch (decisionError) {
      setReviewError(decisionError instanceof Error ? decisionError.message : String(decisionError));
    } finally {
      setReviewActionState(null);
    }
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
                  <div className="text-sm text-muted-foreground">{view === "reviews" ? copy.reviewSubtitle : copy.subtitle}</div>
                  <h1 className="mt-1 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">{copy.title}</h1>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <ViewSwitch view={view} onChange={setView} searchLabel={copy.searchView} reviewLabel={copy.reviewView} />
                  <LanguageSwitch language={language} onChange={setLanguage} />
                </div>
              </div>

              {view === "search" ? (
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
              ) : (
                <div className="grid gap-4 rounded-[28px] border border-white/60 bg-white/78 p-4 shadow-lg backdrop-blur lg:grid-cols-[1fr_auto]">
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">{copy.reviewQueueHint}</div>
                    <div className="text-sm text-foreground/84">
                      {copy.pendingCount}: {reviewResponse?.meta.pendingCount ?? 0}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setView("search")}
                      className="inline-flex h-11 items-center rounded-full border border-border px-4 text-sm text-foreground transition hover:border-foreground/40"
                    >
                      {copy.reviewBack}
                    </button>
                    <button
                      type="button"
                      onClick={() => setView("reviews")}
                      className="inline-flex h-11 items-center rounded-full bg-foreground px-4 text-sm text-background transition hover:opacity-90"
                    >
                      {copy.reviewEntry}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {view === "search" ? (
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
      ) : (
        <section className="mt-6 space-y-6">
          <div className="rounded-[28px] border border-border bg-card p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="text-sm text-muted-foreground">{copy.reviewKeyTitle}</div>
                <div className="text-sm text-foreground/84">{copy.reviewQueueHint}</div>
              </div>
              <div className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-3xl">
                <input
                  value={reviewKeyInput}
                  onChange={event => setReviewKeyInput(event.target.value)}
                  placeholder={copy.reviewKeyPlaceholder}
                  className="h-11 flex-1 rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-foreground/40"
                />
                <button
                  type="button"
                    onClick={() => {
                      setReviewApiKey(reviewKeyInput.trim());
                      setReviewReloadNonce(current => current + 1);
                      setReviewSuccess("");
                    }}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-4 text-sm text-background transition hover:opacity-90"
                >
                  {copy.reviewKeySave}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setReviewKeyInput("");
                    setReviewApiKey("");
                    setReviewReloadNonce(0);
                    setReviewResponse(null);
                    setReviewError("");
                    setReviewSuccess("");
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-border px-4 text-sm text-foreground transition hover:border-foreground/40"
                >
                  {copy.reviewKeyClear}
                </button>
                <button
                  type="button"
                  onClick={() => setReviewReloadNonce(current => current + 1)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-border px-4 text-sm text-foreground transition hover:border-foreground/40"
                >
                  {copy.reviewRefresh}
                </button>
              </div>
            </div>
          </div>

          {reviewError ? <div className="rounded-2xl border border-destructive/30 px-4 py-3 text-sm text-destructive">{reviewError}</div> : null}
          {reviewSuccess ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{reviewSuccess}</div> : null}

          <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
            <aside className="rounded-[28px] border border-border bg-card p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold text-foreground">{copy.reviewQueue}</div>
                  <div className="text-sm text-muted-foreground">
                    {copy.pendingCount}: {reviewResponse?.meta.pendingCount ?? 0}
                  </div>
                </div>
                {isReviewLoading ? <div className="text-sm text-muted-foreground">{copy.loading}</div> : null}
              </div>

              <div className="space-y-3">
                {!reviewApiKey ? (
                  <div className="rounded-2xl bg-background px-4 py-6 text-sm text-muted-foreground">{copy.reviewAuthFailed}</div>
                ) : reviewItems.length ? (
                  reviewItems.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedReviewId(item.id);
                        setReviewDraft(createReviewDraft(item));
                        setReviewSuccess("");
                      }}
                      className={[
                        "w-full rounded-[24px] border p-4 text-left transition",
                        selectedReviewId === item.id ? "border-sky-600 bg-sky-50" : "border-border bg-background hover:border-foreground/40",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">{item.name}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{formatDomain(item.url)}</div>
                        </div>
                        <span className="rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground">
                          {item.sourceType === "ai_enriched" ? copy.reviewSourceAi : copy.reviewSourceManual}
                        </span>
                      </div>
                      <div className="mt-3 text-xs text-muted-foreground">
                        {copy.reviewSubmittedAt}: {formatDateTime(item.submittedAt, language)}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-2xl bg-background px-4 py-6 text-sm text-muted-foreground">
                    {isReviewLoading ? copy.loading : copy.reviewEmpty}
                  </div>
                )}
              </div>
            </aside>

            <section className="rounded-[28px] border border-border bg-card p-5">
              {!selectedReview || !reviewDraft ? (
                <div className="rounded-[24px] bg-background px-6 py-16 text-center text-sm text-muted-foreground">{copy.reviewSelectPrompt}</div>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{selectedReview.name}</h2>
                        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                          {selectedReview.sourceType === "ai_enriched" ? copy.reviewSourceAi : copy.reviewSourceManual}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {copy.reviewClient}: {selectedReview.clientName ?? "—"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {copy.reviewSubmittedAt}: {formatDateTime(selectedReview.submittedAt, language)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {copy.reviewLatestRecord}: {formatDateTime(selectedReview.lastSubmissionAt, language)}
                      </div>
                    </div>
                    <a
                      href={selectedReview.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 items-center justify-center rounded-full border border-border px-4 text-sm text-foreground transition hover:border-foreground/40"
                    >
                      {copy.reviewOpenSite}
                    </a>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <div className="text-sm text-muted-foreground">{copy.reviewName}</div>
                      <input
                        value={reviewDraft.name}
                        onChange={event => updateReviewDraft("name", event.target.value)}
                        className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-foreground/40"
                      />
                    </label>
                    <label className="space-y-2">
                      <div className="text-sm text-muted-foreground">{copy.reviewUrl}</div>
                      <input
                        value={reviewDraft.url}
                        onChange={event => updateReviewDraft("url", event.target.value)}
                        className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-foreground/40"
                      />
                    </label>
                    <label className="space-y-2">
                      <div className="text-sm text-muted-foreground">{copy.reviewLogoUrl}</div>
                      <input
                        value={reviewDraft.logoUrl}
                        onChange={event => updateReviewDraft("logoUrl", event.target.value)}
                        className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-foreground/40"
                      />
                    </label>
                    <label className="space-y-2">
                      <div className="text-sm text-muted-foreground">{copy.reviewCoverUrl}</div>
                      <input
                        value={reviewDraft.coverUrl}
                        onChange={event => updateReviewDraft("coverUrl", event.target.value)}
                        className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm text-foreground outline-none transition focus:border-foreground/40"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <div className="text-sm text-muted-foreground">{copy.reviewDescriptionZh}</div>
                      <textarea
                        value={reviewDraft.descriptionZh}
                        onChange={event => updateReviewDraft("descriptionZh", event.target.value)}
                        rows={4}
                        className="w-full rounded-[24px] border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/40"
                      />
                    </label>
                    <label className="space-y-2">
                      <div className="text-sm text-muted-foreground">{copy.reviewDescriptionEn}</div>
                      <textarea
                        value={reviewDraft.descriptionEn}
                        onChange={event => updateReviewDraft("descriptionEn", event.target.value)}
                        rows={4}
                        className="w-full rounded-[24px] border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/40"
                      />
                    </label>
                    <label className="space-y-2">
                      <div className="text-sm text-muted-foreground">{copy.reviewAliasesZh}</div>
                      <textarea
                        value={reviewDraft.searchAliasesZh}
                        onChange={event => updateReviewDraft("searchAliasesZh", event.target.value)}
                        rows={3}
                        className="w-full rounded-[24px] border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/40"
                      />
                    </label>
                    <label className="space-y-2">
                      <div className="text-sm text-muted-foreground">{copy.reviewAliasesEn}</div>
                      <textarea
                        value={reviewDraft.searchAliasesEn}
                        onChange={event => updateReviewDraft("searchAliasesEn", event.target.value)}
                        rows={3}
                        className="w-full rounded-[24px] border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/40"
                      />
                    </label>
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">{copy.reviewTags}</div>
                    <div className="flex flex-wrap gap-2">
                      {reviewAvailableTags.map(tag => (
                        <ReviewTagToggle
                          key={tag.slug}
                          tag={tag}
                          active={reviewDraft.tagSlugs.includes(tag.slug)}
                          language={language}
                          onToggle={toggleReviewTag}
                        />
                      ))}
                      {!reviewAvailableTags.length ? <div className="text-sm text-muted-foreground">{copy.reviewNoTags}</div> : null}
                    </div>
                  </div>

                  <label className="space-y-2">
                    <div className="text-sm text-muted-foreground">{copy.reviewNote}</div>
                    <textarea
                      value={reviewDraft.reviewNote}
                      onChange={event => updateReviewDraft("reviewNote", event.target.value)}
                      rows={4}
                      className="w-full rounded-[24px] border border-border bg-background px-4 py-3 text-sm text-foreground outline-none transition focus:border-foreground/40"
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                    <button
                      type="button"
                      onClick={() => submitReviewDecision("approved")}
                      disabled={Boolean(reviewActionState)}
                      className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-600 px-5 text-sm text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {reviewActionState === "approved" ? copy.reviewSaving : copy.reviewApprove}
                    </button>
                    <button
                      type="button"
                      onClick={() => submitReviewDecision("rejected")}
                      disabled={Boolean(reviewActionState)}
                      className="inline-flex h-11 items-center justify-center rounded-full bg-rose-600 px-5 text-sm text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {reviewActionState === "rejected" ? copy.reviewSaving : copy.reviewReject}
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
