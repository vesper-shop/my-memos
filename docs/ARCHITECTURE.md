# Architecture

This repository is a `pnpm` workspace with one deployable app and two reusable packages.

## Repository Layout

| Path                                                      | Role                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------- |
| [apps/memos](../apps/memos)                               | Main SvelteKit application deployed to Cloudflare Workers     |
| [packages/ui](../packages/ui)                             | Shared Svelte UI components, theme tokens, and local demo app |
| `packages/ai-core`                                        | Platform-neutral pi Agent runtime and MCP client adapter      |
| [docs](../docs)                                           | Maintainer-facing documentation                               |
| [apps/memos/void.config.ts](../apps/memos/void.config.ts) | Cloudflare Worker settings, bindings, and Void framework mode |
| [apps/memos/env.ts](../apps/memos/env.ts)                 | Typed configuration and secret schema read through `void/env` |

## High-Level System

```text
Browser (in-memory Svelte Chat store)
  -> SvelteKit POST /api/chat with the complete current-page transcript
  -> typed NDJSON agent events
  -> @my-memos/ai-core / pi Agent
  -> in-process MCP client with automatic protocol negotiation -> /api/mcp handler
  -> typed domain operations in apps/memos/src/lib/server
  -> Vesper API (memos are Vesper entries without photos)
  -> Cloudflare bindings
     - R2: agent memory files
     - KV: owner sessions, profile, tag definitions and derived caches
```

## Workspace Structure

### App: `apps/memos`

The deployable application is the `@my-memos/app` workspace package defined in [apps/memos/package.json](../apps/memos/package.json).

Void is configured at [apps/memos/void.config.ts](../apps/memos/void.config.ts), beside the SvelteKit package it prepares and deploys. `inference.appType` stays `framework`, so SvelteKit keeps routing and rendering. The SvelteKit Cloudflare adapter reads the generated `.void-wrangler.jsonc`. The repository-root scripts delegate Void commands to this workspace package. The app has no database.

Key areas:

- [apps/memos/src/routes](../apps/memos/src/routes)
  Page routes and API endpoints.
- [apps/memos/src/lib/server](../apps/memos/src/lib/server)
  Server-only auth, filters, domain services, and the Vesper client.
  - `apps/memos/src/lib/server/vesper.ts`
    Vesper reads and writes with the `VESPER_TOKEN` secret, and owner sign-in.
  - `apps/memos/src/lib/server/memos`
    Memo domain: the repository reads Vesper entries into memos and filters them in memory; the
    service writes through the Vesper API; `legacy-ids.json` maps pre-Vesper memo ids to entry ids.
  - `apps/memos/src/lib/server/tags`
    Tag definitions in KV (seeded from `definitions.json`) and Jev classification; `createMemo`
    uses it to tag untagged memos.
  - `apps/memos/src/lib/server/x-import.ts`
    Validates X/Twitter status URLs and the FxTwitter response fields used by the import route.
  - `apps/memos/src/lib/server/mcp`
    MCP server, authentication, schemas, structured errors, typed domain operations, and MCP-only utilities. Shared contracts live in `types.ts`; implementation files import them instead of redeclaring local aliases.
- [apps/memos/src/lib/components](../apps/memos/src/lib/components)
  App-specific Svelte UI not exported as reusable package components.
  Contains two layout generations:
  - `views/` — default `Home`, `Chat`, and `Archive` views using the masthead-based layout and timeline feed.
  - `views-legacy/` — classic views kept for comparison via the in-page toggle; these use `AppShell` + `Sidebar` where applicable.

### Package: `packages/ui`

The shared package `@my-memos/ui` exports:

- reusable UI primitives from [packages/ui/src/components](../packages/ui/src/components)
  - Includes the `Timeline` component and `TimelineGroup` type used by the new layout feed.
- theme and utility helpers from [packages/ui/src/lib](../packages/ui/src/lib)
- CSS entrypoints exposed in [packages/ui/package.json](../packages/ui/package.json)

It also contains a local demo surface in [packages/ui/dev](../packages/ui/dev) for component iteration.

### Package: `packages/ai-core`

`@my-memos/ai-core` pins `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` to the same exact version. It owns pi Agent construction, OpenAI-compatible model descriptors, automatic MCP version negotiation, MCP-to-pi tool adaptation, cancellation, and runtime events. The current client negotiates `2026-07-28` and can fall back to the stateless `2025-11-25` handshake. It has no application tool names, SvelteKit, Better Auth, D1, R2, KV, or Cloudflare imports. Mutation sequencing is derived from standard MCP tool annotations. It deliberately has no budgets, snapshots, persistence, thread IDs, retry, or regeneration API.

Its public contracts are collected in `packages/ai-core/src/types.ts`; small pure conversion helpers live in `utils.ts`. Tests are isolated under each package or app's `src/__tests__` directory. Server code imports hashtag parsing directly from `apps/memos/src/lib/utils/tags.ts`, so it never loads the browser navigation utilities.

The app uses a small local chat protocol under `apps/memos/src/lib/chat`: shared message/event types, Zod validation at the HTTP boundary, and a page-local Svelte store. One assistant UI turn contains the ordered pi steps around tool execution, so the page renders one message/avatar while transcript conversion still restores `assistant -> toolResult -> assistant` ordering. It does not depend on the Vercel AI SDK. TypeBox remains an implementation dependency of pi itself, but `ai-core` consumes its schema types through `@earendil-works/pi-ai` instead of declaring TypeBox directly.

## Request Model

### Public Pages

- `/` loads memos and tag counts with optional filters.
- `/memo/[id]` is the canonical share entry for a memo. It applies visibility checks, server-renders
  the memo with canonical, Open Graph, and JSON-LD metadata for crawlers, then hands off to the
  matching card in the home feed.
- Unauthenticated users can browse public memos.
- Authenticated users can browse all non-archived memos.
- Authenticated users can toggle `view=public` to browse only public memos without private memo data in the page payload.
- The new home search control accepts `sort=updated` to show card results ordered by `updated_at`; the default timeline remains grouped by `created_at`.

The main page load lives in [apps/memos/src/routes/+page.server.ts](../apps/memos/src/routes/+page.server.ts).

### Crawler Discovery

`/robots.txt`, `/sitemap.xml`, `/rss.xml`, and `/llms.txt` are generated from public, non-archived
memos by [apps/memos/src/lib/server/discovery](../apps/memos/src/lib/server/discovery/index.ts).
`robots.txt` disallows `/api/` (except memo OG images and the OpenAPI document), `/archive`,
`/favorites`, and `/chat`. `/.well-known/api-catalog` publishes an RFC 9727 linkset for the REST
API, and the home page sends RFC 8288 `Link` headers for `api-catalog`, `service-desc`,
`service-doc`, and `describedby` (`/llms.txt`). `llms.txt` names `/rss.xml` in its introduction and
lists `/api/openapi.json` and `/api/mcp` in an `## API` section before the memo index; the same `/api/*` shape,
key rule, and MCP tool naming are shared with my-moment and my-knowledge.
Memo markdown renders to HTML during SSR through
[apps/memos/src/lib/utils/markdown.ts](../apps/memos/src/lib/utils/markdown.ts), so crawlers and the
first paint receive formatted content without running JavaScript. The browser reuses the same
renderer for paginated pages and chat. Its rules match my-workspace's `render_memo`: CommonMark
with GFM tables, footnotes, strikethrough and task lists; soft breaks become line breaks; setext
headings are disabled, so `---` under text is a thematic break; an
unindented line after a list item ends the list; raw HTML is shown as text; bare scheme URLs are
linked outside code and links; destinations other than relative, HTTP(S) and `mailto:` are
neutralized.

### Archive Page

- `/archive` is authenticated only.
- Loads archived memos and tag counts.

Route loader: [apps/memos/src/routes/archive/+page.server.ts](../apps/memos/src/routes/archive/+page.server.ts)

### Favorites Page

- `/favorites` is authenticated only.
- Lists non-archived memos whose `favorite` flag is set.
- Uses the same month-grouped new layout and classic card-based legacy layout as `/archive`,
  selected through the shared `my-memos:layout` preference.
- Owns the X/Twitter import form. Imported posts are created as favorite memos so they appear in
  the current list after invalidation; the home page does not expose this form.

Route loader: `apps/memos/src/routes/favorites/+page.server.ts`

### Chat Page

- `/chat` is authenticated only.
- Uses an NDJSON API route for model output streaming.
- Chat messages exist only in the current page's `Chat` instance. Refreshing or leaving the page discards them.
- Every request sends the full page transcript; the server performs one stateless pi Agent run.

Route loader: [apps/memos/src/routes/chat/+page.server.ts](../apps/memos/src/routes/chat/+page.server.ts)

## Authentication

Vesper is called with `VESPER_TOKEN`, a workspace API token stored as a Worker secret, so every page
lists memos without a session. Writes need the owner: `/auth/sign-in` registers the site as a Vesper
OAuth client and starts an authorization-code flow with PKCE for `entries:read`. `/auth/callback`
exchanges the code, calls Vesper's `/api/workspace`, accepts the sign-in only when the workspace UUID
matches the token's workspace and sets an `HttpOnly` session
cookie whose id lives in KV for 30 days. The callback also stores the workspace handle, which the
header card shows and links to `https://<handle>.noted-this.date/`. `/auth/sign-out` deletes the
session. `locals.user` is the dynamic profile or `null`.

## Memo Storage Model

Memos live in Vesper as entries without photos; this site keeps no copy. The repository reads the
`all` and `archive` shelves from `/api/entries/documents`, turns each entry into a memo (its tags
appended as the closing hashtag line) and caches the list in KV for 60 seconds. Lists, statistics,
tag counts and Agent searches filter that list in memory. Creating, editing and deleting call
Vesper's entries API and drop the cached list. Old `/memo/{id}` links with pre-Vesper ids redirect
to the entry id.

R2 keeps only `agent/PROMPT.md` and `agent/MEMORY.md`. KV keeps the Vesper client and
profile, owner sessions, tag definitions, the memo list cache and generated Open Graph images.

## Server Domain Logic

Memo server logic lives under `apps/memos/src/lib/server/memos`.

- `repository.ts` loads memos from Vesper and owns list, statistics, tag, and Agent-facing queries.
- `service.ts` owns create, update and delete through the Vesper API.
- `cache.ts` owns generated OG cache invalidation in KV.

SvelteKit routes validate transport input and map typed domain errors to HTTP responses. MCP
operations call memo domain functions.

X post import accepts only HTTPS status URLs on `x.com` or `twitter.com`, extracts the numeric post
ID, and requests the fixed `api.fxtwitter.com` host without user credentials. The text, photo URLs
as separate Markdown image blocks, attribution and source URL pass through `createMemo`, which marks
the new memo a favorite.

Agent tools are defined once as MCP tools in `apps/memos/src/lib/server/mcp`. The in-product Agent discovers them over an in-process modern MCP transport; it never imports implementations directly.

## API Surface

Memo responses use the shared `Memo` contract and include `id`, `r2Key`, `content`, tags,
timestamps, visibility, pin, favorite, and archive state. `r2Key` is the canonical object path used
for the memo body in R2.

### `/api/memos`

File: [apps/memos/src/routes/api/memos/+server.ts](../apps/memos/src/routes/api/memos/+server.ts)

- `GET`
  Paginated memo list. Accepts `cursor` (base64-encoded compound cursor), `limit` (default 25, max 100), `search` (at most 48 UTF-8 bytes), `date` (a valid `YYYY-MM-DD` value), `tags` (comma-separated), `publicOnly`, `archivedOnly`, `favoritesOnly`, `sortByUpdated` query params. `favoritesOnly` requires authentication. Returns `{ memos: Memo[], nextCursor: string | null }`. Used by the client for infinite-scroll loading.
- `POST`
  Creates a memo for authenticated users.

### `/api/memos/[id]`

File: [apps/memos/src/routes/api/memos/[id]/+server.ts](../apps/memos/src/routes/api/memos/[id]/+server.ts)

- `PATCH`
  Updates content, tags, visibility, pin state, favorite state, or archive state.
- `DELETE`
  Deletes a memo and its stored content.

### `/api/memos/import/x`

- `POST`
  Imports an X/Twitter status URL for an authenticated user through FxTwitter, then creates a
  memo with the requested visibility.

### `/api/chat`

File: [apps/memos/src/routes/api/chat/+server.ts](../apps/memos/src/routes/api/chat/+server.ts)

Behavior:

- requires authentication
- loads prompt and memory from R2 to build the system context; static instructions come first and the date last so the model's prefix cache survives memory edits and date changes
- model: `deepseek-v4.1-flash` through Cloudflare AI Gateway's `custom-opencode` custom-provider endpoint; the Gateway injects the configured BYOK provider key
- pi `Agent` is the sole server-side loop owner and runs until natural completion, cancellation, upstream failure, or platform termination
- streams newline-delimited, typed JSON events for assistant text and tool parts
- forwards one complete tool input when execution starts; cumulative argument deltas stay server-side to avoid quadratic serialization and repeated visual renders
- request cancellation propagates to pi, the model request, and MCP tool calls
- long-term memory changes only through the agent's `update_memory` tool, which applies one exact edit to `agent/MEMORY.md` with an R2 ETag condition

### External Memo Integrations

External REST and MCP clients share one OAuth resource server but have independent transport adapters. REST
routes call memo domain services directly and return structured JSON. MCP maps the same domain
capabilities to `list_tags`, `list_memos`, `search_memos`, `get_memo`, `create_memo`,
`update_memo`, and `delete_memo`, the same `verb_noun` naming used by my-moment and my-knowledge.
Tools return structured objects: `{ tags }`, `{ memos }`, search `{ type: "memo-search-results", query, memos }`, single memos as `{ memo }`, and deletion `{ id, deleted: true }`; arguments reuse the REST field names (`fromDate`, `toDate`, `tags`, `limit`). Web search, URL reading, documentation lookup, memory updates, and visual rendering
belong to the authenticated in-product Agent and cannot be invoked by external clients.

External clients authenticate with Vesper access tokens. The site checks a token by calling Vesper's
`/api/workspace` with it and comparing the workspace UUID, and caches the answer for five minutes.
`/.well-known/oauth-protected-resource` names Vesper as the authorization server, and `/api/mcp`
answers unauthenticated requests with an RFC 9728 `WWW-Authenticate` challenge.

The web app and external clients share one REST surface. Each route accepts the owner session or
`Authorization: Bearer <access token>`. A request that sends `Authorization` is checked only against the token
and an invalid token returns `401`, even on the list route; anonymous list reads return public memos
only:

- `GET /api/memos` returns `{ memos, nextCursor }` and supports cursor, limit, search, date,
  tags, public, archive, favorite, and updated-time filters.
- `POST /api/memos` creates a memo. `createMemo` asks Jev for tags when a memo has none, before it
  is saved (see [DEPLOYMENT.md](./DEPLOYMENT.md#build-and-deployment-flow)).
- `GET`, `PATCH`, and `DELETE /api/memos/[id]` read, update, and delete one memo; reads return
  `{ memo }`.
- `GET /api/tags` returns tag counts.
- `GET /api/tags/definitions` lists tag definitions; `PUT` and `DELETE
  /api/tags/definitions/[name]` upsert and delete one.

The OpenAPI 3.1 description is a static asset at
[apps/memos/static/api/openapi.json](../apps/memos/static/api/openapi.json); update it with
any REST route change.

`POST /api/mcp` exposes the same allowlist through a stateless MCP handler. It serves the modern
`2026-07-28` protocol and the stateless `2025-11-25` initialize fallback, does not issue protocol
sessions, and rejects session headers. Mutating tools execute sequentially; reads may execute in
parallel.

## Memory Update Lifecycle

`agent/PROMPT.md` and `agent/MEMORY.md` are loaded from R2 with a short TTL and ETag validation. A successful chat schedules a no-tool model call in the background. Only durable, explicit user facts are eligible. Unchanged output is not written. Changed memory uses conditional R2 writes; one ETag conflict triggers a fresh read and one recomputation. A second conflict or model failure is logged without changing the completed chat response. Raw transcripts are never persisted.

## Type Boundaries

The runtime contract for Cloudflare bindings is `AppEnv` in [apps/memos/src/lib/server/types.ts](../apps/memos/src/lib/server/types.ts), merged into `Cloudflare.Env` by [apps/memos/src/app.d.ts](../apps/memos/src/app.d.ts) for `import { env } from "cloudflare:workers"`. The `AI` binding is typed by `void/env` and inferred from `void/ai` imports. Configuration and secrets are typed from [apps/memos/env.ts](../apps/memos/env.ts) through the generated `.void/env.d.ts` and read with `import { env } from "void/env"`. Keep them in sync with:

- `apps/memos/void.config.ts` for bindings
- `apps/memos/env.ts` for configuration and secrets
- any platform-dependent server code

If these drift, the app may still compile but fail at runtime.

## Known Inconsistencies To Watch

- `apps/memos/void.config.ts` is production-shaped rather than environment-sliced.
- Every page load may read the whole memo list from Vesper when the 60-second KV cache is cold.

These do not block the current runtime, but they matter when changing deployment or storage behavior.
