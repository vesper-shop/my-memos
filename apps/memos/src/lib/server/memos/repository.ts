import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import type { AppEnv } from "#lib/server/types.ts";
import { vesperFetch } from "#lib/server/vesper.ts";
import { replaceTrailingHashtags } from "#lib/utils/tags.ts";
import type {
  AgentMemoFilters,
  Memo,
  MemoListFilters,
  MemoPage,
  MemoStats,
  TagCount,
} from "./types";

const CACHE_KEY = "vesper:memos";
const FRESH_MS = 60_000;
const CURSOR_VALUE_SEPARATOR = "|";
const ID_RE = /^[0-9a-f-]{36}$/;
const SORT_VALUE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DAY_MS = 86_400_000;

const documentPageSchema = z.object({
  documents: z.array(
    z.object({
      meta: z.object({
        id: z.string(),
        occurred: z.string(),
        visibility: z.enum(["private", "public"]),
        pinned: z.string().nullable(),
        favorite: z.string().nullable(),
        archived: z.string().nullable(),
        tags: z.array(z.string()),
        photos: z.array(z.string()),
      }),
      body: z.string(),
    }),
  ),
  next: z.string().nullable(),
});

async function fetchShelf(env: AppEnv, shelf: "all" | "archive") {
  const memos: Memo[] = [];
  let before: string | null = null;
  do {
    const query = new URLSearchParams({ in: shelf, ...(before ? { before } : {}) });
    const page = documentPageSchema.parse(
      await (await vesperFetch(env, `/api/entries/documents?${query}`)).json(),
    );
    for (const { meta, body } of page.documents) {
      if (meta.photos.length > 0) continue;
      const at = new Date(meta.occurred).toISOString();
      memos.push({
        id: meta.id,
        content: replaceTrailingHashtags(body, meta.tags),
        tags: meta.tags,
        createdAt: at,
        updatedAt: at,
        visibility: meta.visibility,
        pinned: meta.pinned !== null,
        favorite: meta.favorite !== null,
        archived: meta.archived !== null,
      });
    }
    before = page.next;
  } while (before);
  return memos;
}

async function refreshMemos(env: AppEnv) {
  const [active, archived] = await Promise.all([
    fetchShelf(env, "all"),
    fetchShelf(env, "archive"),
  ]);
  const memos = [...new Map([...active, ...archived].map((memo) => [memo.id, memo])).values()];
  await env.MEMOS_CACHE.put(CACHE_KEY, JSON.stringify(memos), { metadata: { at: Date.now() } });
  return memos;
}

export async function loadMemos(env: AppEnv): Promise<Memo[]> {
  const { value, metadata } = await env.MEMOS_CACHE.getWithMetadata<Memo[], { at: number }>(
    CACHE_KEY,
    "json",
  );
  if (value === null) return refreshMemos(env);
  if (metadata === null || Date.now() - metadata.at > FRESH_MS) waitUntil(refreshMemos(env));
  return value;
}

export const forgetMemos = (env: AppEnv) => env.MEMOS_CACHE.delete(CACHE_KEY);

function encodeCursor(pinned: boolean, sortValue: string, id: string): string {
  return btoa([pinned ? "1" : "0", sortValue, id].join(CURSOR_VALUE_SEPARATOR));
}

function decodeCursor(raw: string): { p: boolean; v: string; i: string } | null {
  if (!/^[A-Za-z0-9+/]{1,}={0,2}$/.test(raw) || raw.length % 4 !== 0) return null;
  const parts = atob(raw).split(CURSOR_VALUE_SEPARATOR);
  if (parts.length !== 3) return null;
  const [pinned, sortValue, id] = parts;
  if (pinned !== "0" && pinned !== "1") return null;
  if (!SORT_VALUE_RE.test(sortValue) || !ID_RE.test(id)) return null;
  return { p: pinned === "1", v: sortValue, i: id };
}

export function isValidMemoCursor(raw: string): boolean {
  return decodeCursor(raw) !== null;
}

const sameDay = (iso: string, day: string) => iso.slice(0, 10) === day;
const hasTag = (memo: Memo, tag: string) =>
  memo.tags.some((name) => name.toLowerCase() === tag.toLowerCase());
const contains = (memo: Memo, text: string) =>
  memo.content.toLowerCase().includes(text.toLowerCase());
const key = (pinned: boolean, sortValue: string, id: string) =>
  `${pinned ? "1" : "0"}${CURSOR_VALUE_SEPARATOR}${sortValue}${CURSOR_VALUE_SEPARATOR}${id}`;

export function queryMemos(memos: Memo[], filters: MemoListFilters): MemoPage {
  const { limit } = filters;
  const sortValue = (memo: Memo) => (filters.sortByUpdated ? memo.updatedAt : memo.createdAt);
  const cursor = filters.cursor ? decodeCursor(filters.cursor) : null;
  if (filters.cursor && !cursor) throw new Error("Invalid memo cursor.");
  const after = cursor ? key(cursor.p, cursor.v, cursor.i) : null;
  const ordered = memos
    .filter((memo) => memo.archived === Boolean(filters.archivedOnly))
    .filter((memo) => !filters.publicOnly || memo.visibility === "public")
    .filter((memo) => !filters.favoritesOnly || memo.favorite)
    .filter((memo) => !filters.date || sameDay(memo.updatedAt, filters.date))
    .filter((memo) => !filters.search || contains(memo, filters.search))
    .filter((memo) => filters.tags.length === 0 || filters.tags.some((tag) => hasTag(memo, tag)))
    .map((memo) => ({ memo, key: key(memo.pinned, sortValue(memo), memo.id) }))
    .filter((item) => !after || item.key < after)
    .sort((a, b) => (a.key < b.key ? 1 : -1));
  const page = ordered.slice(0, limit).map((item) => item.memo);
  const last = page.at(-1);
  return {
    memos: page,
    nextCursor:
      ordered.length > limit && last ? encodeCursor(last.pinned, sortValue(last), last.id) : null,
  };
}

export async function listMemos(env: AppEnv, filters: MemoListFilters): Promise<MemoPage> {
  return queryMemos(await loadMemos(env), filters);
}

const live = (memos: Memo[], publicOnly: boolean) =>
  memos.filter((memo) => !memo.archived && (!publicOnly || memo.visibility === "public"));

export async function listPublicMemos(env: AppEnv, limit: number): Promise<Memo[]> {
  return live(await loadMemos(env), true)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, limit);
}

export function listMemoActivity(memos: Memo[], publicOnly: boolean, since: string): Memo[] {
  return live(memos, publicOnly)
    .filter((memo) => memo.createdAt >= since)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function countTags(memos: Memo[], publicOnly = false): TagCount[] {
  const names = live(memos, publicOnly).flatMap((memo) =>
    memo.tags.map((tag) => tag.toLowerCase()),
  );
  return [...Map.groupBy(names, (name) => name)]
    .map(([name, uses]) => ({ name, count: uses.length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function countMemoStats(memos: Memo[], today: string, publicOnly: boolean): MemoStats {
  const shown = live(memos, publicOnly);
  return {
    total: shown.length,
    today: shown.filter((memo) => sameDay(memo.createdAt, today)).length,
  };
}

export function filterAgentMemos(memos: Memo[], filters: AgentMemoFilters): Memo[] {
  const from = filters.fromDate ? `${filters.fromDate}T00:00:00.000Z` : null;
  const to = filters.toDate
    ? new Date(Date.parse(`${filters.toDate}T00:00:00.000Z`) + DAY_MS).toISOString()
    : null;
  return memos
    .filter((memo) => !memo.archived)
    .filter((memo) => !filters.query || contains(memo, filters.query))
    .filter((memo) => !from || memo.createdAt >= from)
    .filter((memo) => !to || memo.createdAt < to)
    .filter((memo) => filters.tags.every((tag) => hasTag(memo, tag)))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, filters.limit);
}

export async function findMemo(env: AppEnv, id: string): Promise<Memo | null> {
  const memo = (await loadMemos(env)).find((candidate) => candidate.id === id);
  return memo === undefined ? null : memo;
}
