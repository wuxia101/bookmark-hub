export type TagCatalogEntry = {
  slug: string;
  zhCN: string;
  en: string;
  category: string;
  sortOrder: number;
};

export const TAG_CATALOG: TagCatalogEntry[] = [
  { slug: "ai-tools", zhCN: "AI工具", en: "AI Tools", category: "ai", sortOrder: 10 },
  { slug: "ai-chat", zhCN: "AI聊天", en: "AI Chat", category: "ai", sortOrder: 11 },
  { slug: "ai-search", zhCN: "AI搜索", en: "AI Search", category: "ai", sortOrder: 12 },
  { slug: "ai-coding", zhCN: "AI编程", en: "AI Coding", category: "ai", sortOrder: 13 },
  { slug: "ai-image", zhCN: "AI绘图", en: "AI Image", category: "ai", sortOrder: 14 },
  { slug: "ai-video", zhCN: "AI视频", en: "AI Video", category: "ai", sortOrder: 15 },
  { slug: "developer-docs", zhCN: "开发文档", en: "Developer Docs", category: "developer", sortOrder: 20 },
  { slug: "developer-tools", zhCN: "开发工具", en: "Developer Tools", category: "developer", sortOrder: 21 },
  { slug: "api-platforms", zhCN: "API平台", en: "API Platforms", category: "developer", sortOrder: 22 },
  { slug: "frontend", zhCN: "前端开发", en: "Frontend", category: "developer", sortOrder: 23 },
  { slug: "backend", zhCN: "后端开发", en: "Backend", category: "developer", sortOrder: 24 },
  { slug: "devops", zhCN: "DevOps", en: "DevOps", category: "developer", sortOrder: 25 },
  { slug: "database", zhCN: "数据库", en: "Database", category: "developer", sortOrder: 26 },
  { slug: "open-source", zhCN: "开源项目", en: "Open Source", category: "developer", sortOrder: 27 },
  { slug: "javascript", zhCN: "JavaScript", en: "JavaScript", category: "language", sortOrder: 30 },
  { slug: "typescript", zhCN: "TypeScript", en: "TypeScript", category: "language", sortOrder: 31 },
  { slug: "python", zhCN: "Python", en: "Python", category: "language", sortOrder: 32 },
  { slug: "go", zhCN: "Go", en: "Go", category: "language", sortOrder: 33 },
  { slug: "rust", zhCN: "Rust", en: "Rust", category: "language", sortOrder: 34 },
  { slug: "design-inspiration", zhCN: "设计灵感", en: "Design Inspiration", category: "design", sortOrder: 40 },
  { slug: "design-systems", zhCN: "设计系统", en: "Design Systems", category: "design", sortOrder: 41 },
  { slug: "ui-kit", zhCN: "UI组件", en: "UI Kit", category: "design", sortOrder: 42 },
  { slug: "icons", zhCN: "图标资源", en: "Icons", category: "design", sortOrder: 43 },
  { slug: "illustrations", zhCN: "插画资源", en: "Illustrations", category: "design", sortOrder: 44 },
  { slug: "fonts", zhCN: "字体资源", en: "Fonts", category: "design", sortOrder: 45 },
  { slug: "colors", zhCN: "配色工具", en: "Colors", category: "design", sortOrder: 46 },
  { slug: "animations", zhCN: "动画资源", en: "Animations", category: "design", sortOrder: 47 },
  { slug: "whiteboard", zhCN: "在线白板", en: "Whiteboard", category: "productivity", sortOrder: 50 },
  { slug: "productivity", zhCN: "效率工具", en: "Productivity", category: "productivity", sortOrder: 51 },
  { slug: "notes", zhCN: "笔记工具", en: "Notes", category: "productivity", sortOrder: 52 },
  { slug: "calendar", zhCN: "日历协作", en: "Calendar", category: "productivity", sortOrder: 53 },
  { slug: "project-management", zhCN: "项目管理", en: "Project Management", category: "productivity", sortOrder: 54 },
  { slug: "automation", zhCN: "自动化", en: "Automation", category: "productivity", sortOrder: 55 },
  { slug: "knowledge-base", zhCN: "知识库", en: "Knowledge Base", category: "productivity", sortOrder: 56 },
  { slug: "search-engine", zhCN: "搜索引擎", en: "Search Engine", category: "content", sortOrder: 60 },
  { slug: "news", zhCN: "新闻资讯", en: "News", category: "content", sortOrder: 61 },
  { slug: "newsletter", zhCN: "邮件通讯", en: "Newsletter", category: "content", sortOrder: 62 },
  { slug: "blog", zhCN: "博客", en: "Blog", category: "content", sortOrder: 63 },
  { slug: "community", zhCN: "社区论坛", en: "Community", category: "content", sortOrder: 64 },
  { slug: "directory", zhCN: "导航目录", en: "Directory", category: "content", sortOrder: 65 },
  { slug: "video", zhCN: "视频平台", en: "Video", category: "media", sortOrder: 70 },
  { slug: "audio", zhCN: "音频播客", en: "Audio", category: "media", sortOrder: 71 },
  { slug: "images", zhCN: "图片资源", en: "Images", category: "media", sortOrder: 72 },
  { slug: "marketing", zhCN: "营销工具", en: "Marketing", category: "business", sortOrder: 80 },
  { slug: "analytics", zhCN: "数据分析", en: "Analytics", category: "business", sortOrder: 81 },
  { slug: "seo", zhCN: "SEO", en: "SEO", category: "business", sortOrder: 82 },
  { slug: "ecommerce", zhCN: "电商", en: "Ecommerce", category: "business", sortOrder: 83 },
  { slug: "finance", zhCN: "金融理财", en: "Finance", category: "business", sortOrder: 84 },
  { slug: "learning", zhCN: "学习教育", en: "Learning", category: "learning", sortOrder: 90 },
  { slug: "course", zhCN: "课程", en: "Course", category: "learning", sortOrder: 91 },
  { slug: "reference", zhCN: "参考资料", en: "Reference", category: "learning", sortOrder: 92 },
  { slug: "career", zhCN: "职业招聘", en: "Career", category: "career", sortOrder: 100 },
  { slug: "remote-work", zhCN: "远程工作", en: "Remote Work", category: "career", sortOrder: 101 },
];

export const TAG_TRANSLATIONS = Object.fromEntries(
  TAG_CATALOG.map(tag => [tag.slug, { zhCN: tag.zhCN, en: tag.en }]),
);
