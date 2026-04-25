# BookmarkHub Agent Handbook

## Purpose

BookmarkHub 是一个个人维护的网站书签收藏聚合平台。项目目标不是做商业化产品，而是长期积累高质量站点数据，并围绕：

- 多标签交集筛选
- 关键词搜索
- 中文优先体验
- AI 辅助录入增强

持续演进。

Agent 接手维护时，优先级必须是：

1. 保证搜索接口稳定
2. 保证数据结构可持续扩展
3. 保证录入数据质量
4. 降低 AI 调用成本与失败影响

不要为了“炫技”引入高复杂度组件、重型框架、或不必要的基础设施。

## Current Stack

- Runtime: `Bun`
- Frontend: `React` + `Tailwind CSS`
- Database: `PostgreSQL` via `Bun.SQL`
- API style: 单体 `Bun.serve()` 路由
- Search: PostgreSQL 全文 + `ILIKE` + 中文别名补偿
- AI:
  - Search: `query rewrite`
  - Submission: `field enrichment`
  - No embeddings / no vector search

## Hard Constraints

- 不要引入 Prisma / Drizzle / pg / Express / Vite
- 不要引入向量检索或 embeddings，除非项目维护者明确要求
- 不要把 AI 搜索做成“每敲一个字就打模型”
- 不要在用户请求主链路中做重型补全任务
- 不要把 `.env`、真实 API key、数据库密码提交进仓库
- 不要改动 API 的核心语义：
  - `GET /api/bookmarks/search`
  - `POST /api/bookmarks/submissions`

## Repo Map

- `src/index.ts`
  - Bun 服务入口
- `src/frontend.tsx`
  - React 挂载入口
- `src/App.tsx`
  - 搜索页主界面
- `src/server/routes/bookmarks.ts`
  - 搜索/提交 API 路由
- `src/server/services/searchService.ts`
  - 搜索编排，包含 AI query rewrite
- `src/server/services/submissionService.ts`
  - 提交编排，包含 AI enrich
- `src/server/services/ai.ts`
  - AI provider 封装
- `src/server/repositories/bookmarkRepository.ts`
  - 书签查询与写入 SQL
- `src/server/db/migrations.ts`
  - 数据库迁移
- `src/server/db/seedBookmarks.ts`
  - 基础书签导入脚本
- `src/server/db/syncTagTranslations.ts`
  - 标签多语言回填
- `src/server/db/syncSiteAliases.ts`
  - 搜索别名回填
- `src/server/tags/localization.ts`
  - 内建标签文案映射

## Data Model Rules

### Sites

`sites` 是核心表。维护时关注这些字段：

- `name`
- `url`
- `normalized_url`
- `logo_url`
- `cover_url`
- `description_zh`
- `description_en`
- `search_aliases_zh`
- `search_aliases_en`
- `tag_text`
- `status`

规则：

- `normalized_url` 必须唯一
- `description_zh` / `description_en` 控制在短描述范围
- `search_aliases_zh` / `search_aliases_en` 用于补足中文搜索体验
- `logo_url` / `cover_url` 优先外部 URL，缺失时允许前端 fallback

### Tags

标签以 `slug` 作为稳定标识，不以展示文案作为内部主键。

当前使用两层：

- `tags`
  - 稳定主表
- `tag_translations`
  - 多语言展示文案

规则：

- 所有筛选与接口参数必须继续使用 `slug`
- 前端切换语言时，只切展示文案，不切筛选语义
- 新增标签后，应同步补 `zh-CN` / `en` 翻译

## Search Rules

### Standard Search

标准搜索依赖：

- `search_vector`
- `ILIKE`
- `search_aliases_zh`
- `search_aliases_en`
- `tags`

维护时不要削弱中文检索能力。

### AI Search

AI 搜索当前不是向量检索，而是：

1. 用户 query
2. LLM rewrite
3. 输出：
   - `rewrittenQuery`
   - `suggestedTagSlugs`
4. 回落到 PostgreSQL 搜索

规则：

- AI 搜索失败必须降级，不可阻断搜索
- AI 搜索要有防抖、缓存、短 query 不触发
- `filters.selectedTags` 必须反映实际生效标签，不是只返回用户原始标签

## Submission Rules

`POST /api/bookmarks/submissions` 是受保护接口。

必须保持：

- API key 鉴权独立于 AI provider key
- URL 非法返回 `400`
- AI enrich 失败时降级，不阻断提交
- 提交成功后进入 `pending_review` 或按既有逻辑入库

AI enrich 允许补：

- `descriptionZh`
- `descriptionEn`
- `searchAliasesZh`
- `searchAliasesEn`
- `logoUrl`
- `coverUrl`
- `suggestedTagSlugs`

但不能把 AI 变成硬依赖。

## Images

当前不接 S3。

策略：

- 数据库存外部图片 URL
- 缺失图片时允许使用 `https://picsum.photos/seed/...`
- 如果未来接对象存储，也应保持对外部 URL 的兼容，不要强制迁移

## Scripts

常用脚本：

```bash
bun dev
bun run build
bun test
bun run db:migrate
bun run db:seed:bookmarks
bun run db:sync:tag-translations
bun run db:sync:site-aliases
```

Docker 脚本：

```bash
sh scripts/docker-build.sh
sh scripts/docker-up.sh
sh scripts/docker-down.sh
sh scripts/docker-logs.sh
```

新增迁移后，必须保持：

- 可重复执行
- 不依赖人工 SQL 修改
- 不破坏已有数据

## Maintenance Playbook

### When adding fields

- 先加 migration
- 再改 repository SQL
- 再改 service
- 最后改前端与 README

### When changing search behavior

- 先确认是否影响：
  - 中文搜索
  - 标签交集筛选
  - AI 模式降级
- 必须保留分页稳定性

### When touching AI logic

- 优先考虑降级策略
- 优先考虑成本控制
- 优先考虑缓存
- 不要把慢操作塞进高频搜索路径

### When backfilling data

- 优先做单独脚本
- 不要把历史回填塞进普通请求
- 回填脚本要可重复运行

## Deployment Rules

当前默认部署方式是 Docker 单机部署，不要先上复杂编排。

部署基线：

- `Dockerfile`
- `docker-compose.yml`
- `scripts/docker-entrypoint.sh`
- `scripts/docker-up.sh`

规则：

- 服务必须支持 `HOST` / `PORT`
- 容器启动时允许自动迁移
- 不要把真实密钥写进镜像
- `.env` 只在部署机上保存
- 如果修改启动命令、容器变量、或数据库依赖，必须同步更新 README 和部署脚本

## Review Checklist

提交改动前，Agent 应至少检查：

- `bunx tsc --noEmit`
- `bun run build`
- 如涉及纯工具函数：`bun test`
- 如涉及数据库结构：迁移是否幂等
- 如涉及 AI：失败时是否降级
- 如涉及搜索：接口返回是否仍兼容前端

## API Doc Sync Rule

如果改动涉及以下任一内容，必须同步更新文档：

- `GET /api/bookmarks/search`
- `POST /api/bookmarks/submissions`
- 标签选择规则
- 提交字段约束
- 外部 Agent 调用流程

需要同步更新的文件：

- `docs/bookmarkhub.openapi.yaml`
- `docs/skills/bookmark-submission-agent.md`
- `README.md`

## CI Rule

当前仓库使用 GitHub Actions：

- `.github/workflows/ci.yml`
- `.github/workflows/docker-publish.yml`

如果改动涉及以下内容，必须检查并同步更新 CI：

- Bun 版本
- 构建命令
- 测试命令
- Dockerfile
- 依赖安装方式
- Docker Hub 镜像命名规则

## README Sync Rule

如果修改了以下任一内容，必须同步更新 `README.md`：

- 环境变量
- 数据库迁移脚本
- AI 配置
- API 行为
- 核心搜索机制

## Security

- `.env` 只能本地使用，不可提交
- README / 模板文件只能保留示例值
- 不要在日志中打印真实 API key
- 不要把提交来源鉴权 key 与 AI provider key 混用
