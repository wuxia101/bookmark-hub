const TAG_TRANSLATIONS: Record<string, { zhCN: string; en: string }> = {
  "design-inspiration": {
    zhCN: "设计灵感",
    en: "Design Inspiration",
  },
  "design-news": {
    zhCN: "设计资讯",
    en: "Design News",
  },
};

function titleizeSlug(slug: string) {
  return slug
    .split("-")
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function resolveTagLocalization(slug: string, fallbackTitle?: string) {
  const localized = TAG_TRANSLATIONS[slug];
  if (localized) return localized;

  const english = fallbackTitle?.trim() || titleizeSlug(slug) || "Tag";
  return {
    zhCN: english,
    en: english,
  };
}
