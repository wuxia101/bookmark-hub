# BookmarkHub

BookmarkHub 是一个基于 `Bun + React + PostgreSQL` 的个人网站书签收藏聚合平台，定位是个人长期维护的数据型项目，不追求商业化，重点在：

- 高质量站点收录
- 多标签交集筛选
- 中文优先搜索体验
- AI 辅助录入增强
- 多读少写、便于后续扩容

项目维护规范见 [AGENT.md](/Users/const/Space/alayoutech/bookmarkhub/AGENT.md)。
外部 Agent 调用规范见 [docs/skills/bookmark-submission-agent.md](/Users/const/Space/alayoutech/bookmarkhub/docs/skills/bookmark-submission-agent.md)。
接口定义见 [docs/bookmarkhub.openapi.yaml](/Users/const/Space/alayoutech/bookmarkhub/docs/bookmarkhub.openapi.yaml)。

## Run

```bash
bun install
cp config.tmpl .env
bun run db:migrate
bun dev
```

常用脚本：

```bash
bun run build
bun test
bun run db:seed:tags
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

## Config

本项目不额外解析自定义配置文件，直接使用 Bun 的环境变量加载机制。
Bun 启动时会自动读取 `.env`、`.env.local`、`.env.production.local` 等文件，所以推荐做法是：

```bash
cp config.tmpl .env
```

然后按需修改 `.env`。至少需要：

```bash
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/bookmarkhub
BOOKMARKHUB_SUBMISSION_API_KEY=replace-me
BOOKMARKHUB_REVIEW_API_KEY=replace-me-review
```

可选变量：

```bash
BOOKMARKHUB_AI_SEARCH_ENABLED=false
BOOKMARKHUB_AI_ENRICHMENT_ENABLED=false
BOOKMARKHUB_PAGE_SIZE=24
BOOKMARKHUB_MAX_PAGE_SIZE=60
BOOKMARKHUB_SITE_NAME=BookmarkHub
BOOKMARKHUB_AI_PROVIDER=openai
BOOKMARKHUB_AI_MODEL=gpt-5.4-mini
BOOKMARKHUB_AI_BASE_URL=
BOOKMARKHUB_AI_API_KEY=
```

说明：

- `BOOKMARKHUB_SUBMISSION_API_KEY` 只用于受保护收录接口
- `BOOKMARKHUB_REVIEW_API_KEY` 只用于审核接口与审核页面
- `BOOKMARKHUB_AI_API_KEY` 只用于 AI provider
- `BOOKMARKHUB_AI_SEARCH_ENABLED=true` 时，AI 搜索走 `query rewrite`，不是向量检索
- 当前不做 embeddings / vector search
- `HOST` / `PORT` 用于服务监听地址
- `RUN_MIGRATIONS=true` 时，容器启动会自动执行迁移

## Deployment

当前推荐部署方案是 Docker 单机部署：

- `app`: Bun 服务
- `postgres`: PostgreSQL 16
- 容器启动时自动执行 `db:migrate`

首次启动：

```bash
cp config.tmpl .env
sh scripts/docker-up.sh
```

常用命令：

```bash
sh scripts/docker-logs.sh
sh scripts/docker-down.sh
```

说明：

- `docker-compose.yml` 默认会启动一个本地 `postgres` 容器
- 如果你已有外部 PostgreSQL，可在 `.env` 中覆盖 `POSTGRES_URL`
- 默认对外暴露 `3000` 端口
- 生产环境建议前面再接一层 Nginx / Caddy 做 HTTPS 和反向代理

## Architecture

### Backend

- `src/index.ts`: Bun 服务入口
- `src/server/routes/bookmarks.ts`: API 路由
- `src/server/services/searchService.ts`: 搜索编排
- `src/server/services/submissionService.ts`: 收录提交编排
- `src/server/services/ai.ts`: AI provider 适配
- `src/server/repositories/bookmarkRepository.ts`: SQL 查询与写入
- `src/server/db/migrations.ts`: 数据库迁移

### Frontend

- `src/frontend.tsx`: React 启动入口
- `src/App.tsx`: 搜索页 + 审核台 UI

### Data

核心表：

- `sites`
- `tags`
- `tag_translations`
- `site_tags`
- `submission_records`
- `api_clients`

## Search Strategy

当前搜索不是单一方案，而是混合：

- PostgreSQL `search_vector`
- `ILIKE`
- 中文/英文搜索别名字段
- 标签交集筛选

AI 搜索模式会先让 LLM 重写 query，再落回 PostgreSQL 检索：

- 输出 `rewrittenQuery`
- 输出 `suggestedTagSlugs`
- 再执行普通搜索

这一步的目标是提升中文自然语言检索体验，不引入向量检索复杂度。

## Submission Strategy

`POST /api/bookmarks/submissions` 仅对持有合法 API key 的内部/授权来源开放。

录入时可选 AI 增强，当前可补字段：

- `descriptionZh`
- `descriptionEn`
- `searchAliasesZh`
- `searchAliasesEn`
- `logoUrl`
- `coverUrl`
- `suggestedTagSlugs`

AI 增强失败时会自动降级，不阻断提交。

## Image Strategy

当前不接 S3 / 对象存储。

图片策略：

- 数据库存外部图片 URL
- 缺失时用 `https://picsum.photos/seed/...` 做稳定 fallback

## API

- `GET /api/bookmarks/search`
- `POST /api/bookmarks/submissions`
- `GET /api/admin/reviews`
- `POST /api/admin/reviews/decision`

`POST /api/bookmarks/submissions` 需要 `Authorization: Bearer <apikey>`。
这里的 `apikey` 只用于“受保护收录接口”鉴权，不等于 AI 模型服务的 `BOOKMARKHUB_AI_API_KEY`。

`/api/admin/reviews*` 需要 `Authorization: Bearer <BOOKMARKHUB_REVIEW_API_KEY>`。
搜索页右上角可以切换到审核台，支持查看待审核列表、修正字段和标签、通过发布、拒绝并写入审核备注。

如果要给外部 Agent 或自动化工具接入，建议直接使用：

- OpenAPI 文档：`docs/bookmarkhub.openapi.yaml`
- Agent 提交规范：`docs/skills/bookmark-submission-agent.md`

## GitHub Actions

当前仓库内置两条 workflow：

- `ci.yml`
  - 在 `push / pull_request` 时执行测试、类型检查、构建、Docker build 校验
- `docker-publish.yml`
  - 在推送 Git tag（如 `v0.2.0`）时自动构建并推送 Docker 镜像到 Docker Hub

Docker Hub secrets：

- `DOCKER_USERNAME`
- `DOCKER_PASSWORD`
- 可选：`DOCKER_IMAGE`

镜像命名规则：

- 默认：`docker.io/<DOCKER_USERNAME>/bookmarkhub`
- 如果设置了 `DOCKER_IMAGE`，则使用该值

发布示例：

```bash
git tag v0.2.0
git push origin v0.2.0
```

## Security

- `.env` 不可提交
- 不要把真实数据库密码、API key 写入仓库文档
- 示例配置统一放在 `config.tmpl`
