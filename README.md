# BookmarkHub

BookmarkHub 是一个基于 `Bun + React + PostgreSQL` 的个人网站书签收藏聚合平台，面向多读少写、高筛选密度和 10 万+ 条目扩展。

## Run

```bash
bun install
cp config.tmpl .env
bun run db:migrate
bun dev
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

## API

- `GET /api/bookmarks/search`
- `POST /api/bookmarks/submissions`

`POST /api/bookmarks/submissions` 需要 `Authorization: Bearer <apikey>`。
这里的 `apikey` 只用于“受保护收录接口”鉴权，不等于 AI 模型服务的 `BOOKMARKHUB_AI_API_KEY`。
