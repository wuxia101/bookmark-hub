import { TAG_TRANSLATIONS } from "@/server/tags/catalog";

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
