import type { Memo, MemoStats, MemoVisibility, TagCount } from "#lib/types.ts";
export type { Memo, MemoStats, MemoVisibility, TagCount };

export interface MemoListFilters {
  search: string | null;
  date: string | null;
  archivedOnly: boolean;
  favoritesOnly: boolean;
  tags: string[];
  publicOnly: boolean;
  sortByUpdated: boolean;
  cursor: string | null;
  limit: number;
}

export const NO_MEMO_FILTERS: MemoListFilters = {
  search: null,
  date: null,
  archivedOnly: false,
  favoritesOnly: false,
  tags: [],
  publicOnly: false,
  sortByUpdated: false,
  cursor: null,
  limit: 25,
};

export interface MemoPage {
  memos: Memo[];
  nextCursor: string | null;
}

export interface CreateMemoInput {
  content: string;
  visibility: MemoVisibility;
  tags: string[];
  favorite: boolean;
}

/** A PATCH; null leaves the field unchanged. */
export interface UpdateMemoInput {
  content: string | null;
  visibility: MemoVisibility | null;
  tags: string[] | null;
  pinned: boolean | null;
  favorite: boolean | null;
  archived: boolean | null;
}

export interface AgentMemoFilters {
  query: string | null;
  fromDate: string | null;
  toDate: string | null;
  tags: string[];
  limit: number;
}

export interface AgentMemoResult {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
}

export class MemoError extends Error {
  constructor(
    readonly code: "not_found",
    message: string,
  ) {
    super(message);
    this.name = "MemoError";
  }
}
