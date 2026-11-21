import { env } from "cloudflare:workers";
import { error, redirect } from "@sveltejs/kit";
import {
  isMemoSearchWithinLimit,
  isValidMemoDate,
  loadMemos,
  NO_MEMO_FILTERS,
  queryMemos,
} from "#lib/server/memos/index.ts";
import { parsePageFilters } from "#lib/server/filters.ts";
import type { PageServerLoad } from "./$types";

const PAGE_LIMIT = 25;

export const load: PageServerLoad = async ({ url, locals }) => {
  if (!locals.user) {
    redirect(302, "/");
  }

  const filters = parsePageFilters(url);
  if (!isMemoSearchWithinLimit(filters.search)) {
    error(400, "Search query is too long.");
  }
  if (filters.date && !isValidMemoDate(filters.date)) {
    error(400, "Invalid date filter.");
  }

  const { memos, nextCursor } = queryMemos(await loadMemos(env), {
    ...NO_MEMO_FILTERS,
    archivedOnly: true,
    date: filters.date || null,
    tags: filters.tags,
    limit: PAGE_LIMIT,
  });

  return { memos, nextCursor, filters };
};
