import { describe, expect, it } from "vite-plus/test";
import { countTags, filterAgentMemos, queryMemos } from "#lib/server/memos/repository.ts";
import { NO_MEMO_FILTERS } from "#lib/server/memos/types.ts";
import type { Memo } from "#lib/types.ts";

const memo = (id: number, day: string, extra: Partial<Memo> = {}): Memo => ({
  id: `00000000-0000-4000-8000-00000000000${id}`,
  content: `memo ${id}`,
  tags: [],
  createdAt: `${day}T12:00:00.000Z`,
  updatedAt: `${day}T12:00:00.000Z`,
  visibility: "public",
  pinned: false,
  favorite: false,
  archived: false,
  ...extra,
});

const memos = [
  memo(1, "2026-01-01", { tags: ["Life"] }),
  memo(2, "2026-02-01", { pinned: true }),
  memo(3, "2026-03-01", { visibility: "private", tags: ["life", "code"], content: "Bridge" }),
  memo(4, "2026-04-01", { archived: true, favorite: true }),
];

const NO_AGENT_FILTERS = { query: null, fromDate: null, toDate: null, tags: [], limit: 10 };
const ids = (list: Memo[]) => list.map((item) => item.id.slice(-1));

describe("memos read from Vesper", () => {
  it("puts pinned memos first and pages with a cursor", () => {
    const first = queryMemos(memos, { ...NO_MEMO_FILTERS, limit: 2 });
    expect(ids(first.memos)).toEqual(["2", "3"]);
    const second = queryMemos(memos, { ...NO_MEMO_FILTERS, limit: 2, cursor: first.nextCursor });
    expect(ids(second.memos)).toEqual(["1"]);
    expect(second.nextCursor).toBeNull();
  });

  it("filters by shelf, visibility, tag, search and day", () => {
    expect(ids(queryMemos(memos, { ...NO_MEMO_FILTERS, archivedOnly: true }).memos)).toEqual(["4"]);
    expect(ids(queryMemos(memos, { ...NO_MEMO_FILTERS, publicOnly: true }).memos)).toEqual([
      "2",
      "1",
    ]);
    expect(ids(queryMemos(memos, { ...NO_MEMO_FILTERS, tags: ["LIFE"] }).memos)).toEqual([
      "3",
      "1",
    ]);
    expect(ids(queryMemos(memos, { ...NO_MEMO_FILTERS, search: "bridge" }).memos)).toEqual(["3"]);
    expect(ids(queryMemos(memos, { ...NO_MEMO_FILTERS, date: "2026-02-01" }).memos)).toEqual(["2"]);
  });

  it("counts tags case-insensitively without archived memos", () => {
    expect(countTags(memos)).toEqual([
      { name: "life", count: 2 },
      { name: "code", count: 1 },
    ]);
    expect(countTags(memos, true)).toEqual([{ name: "life", count: 1 }]);
  });

  it("needs every tag for agent searches", () => {
    expect(ids(filterAgentMemos(memos, { ...NO_AGENT_FILTERS, tags: ["life", "code"] }))).toEqual([
      "3",
    ]);
    expect(ids(filterAgentMemos(memos, { ...NO_AGENT_FILTERS, fromDate: "2026-02-01" }))).toEqual([
      "3",
      "2",
    ]);
  });
});
