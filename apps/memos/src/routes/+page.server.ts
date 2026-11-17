import { env } from "cloudflare:workers";
import {
  countMemoStats,
  isMemoSearchWithinLimit,
  isValidMemoDate,
  listMemoActivity,
  listMemos,
  listTagCounts,
  NO_MEMO_FILTERS,
} from "#lib/server/memos/index.ts";
import { parsePageFilters } from "#lib/server/filters.ts";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

const PAGE_LIMIT = 25;
const ACTIVITY_WEEKS = 14;

function activitySince(): string {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(today);
  start.setUTCDate(today.getUTCDate() - today.getUTCDay() - (ACTIVITY_WEEKS - 1) * 7);
  return start.toISOString();
}

export const load: PageServerLoad = async ({ url, locals, setHeaders }) => {
  setHeaders({
    Link: [
      '</.well-known/api-catalog>; rel="api-catalog"',
      '</api/openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json"',
      '<https://github.com/Pleasurecruise/my-memos/blob/main/docs/ARCHITECTURE.md#external-memo-integrations>; rel="service-doc"; type="text/html"',
      '</llms.txt>; rel="describedby"; type="text/plain"',
    ].join(", "),
  });
  const filters = parsePageFilters(url);
  if (!isMemoSearchWithinLimit(filters.search)) {
    error(400, "Search query is too long.");
  }
  if (filters.date && !isValidMemoDate(filters.date)) {
    error(400, "Invalid date filter.");
  }
  const publicOnly = !locals.user || filters.viewAsPublic;
  const sortByUpdated = filters.sortByUpdated;

  const today = new Date().toISOString().slice(0, 10);

  const [{ memos, nextCursor }, tagCounts, memoStats, activityMemos] = await Promise.all([
    listMemos(env, {
      ...NO_MEMO_FILTERS,
      search: filters.search || null,
      date: filters.date || null,
      tags: filters.tags,
      publicOnly,
      sortByUpdated,
      limit: PAGE_LIMIT,
    }),
    listTagCounts(env, publicOnly),
    countMemoStats(env, today, publicOnly),
    listMemoActivity(env, publicOnly, activitySince()),
  ]);

  return {
    memos,
    nextCursor,
    activityMemos,
    memoStats,
    tags: tagCounts,
    filters,
  };
};
