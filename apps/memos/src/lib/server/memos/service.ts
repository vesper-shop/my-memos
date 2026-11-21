import { z } from "zod";
import type { AppEnv } from "#lib/server/types.ts";
import { vesperFetch } from "#lib/server/vesper.ts";
import type { Memo, TagCount } from "#lib/types.ts";
import { invalidateMemoOgCache } from "./cache";
import { countTags, filterAgentMemos, findMemo, forgetMemos, loadMemos } from "./repository";
import type { AgentMemoFilters, AgentMemoResult, CreateMemoInput, UpdateMemoInput } from "./types";
import { MemoError } from "./types";
import { normalizeTags } from "./utils";

const createdSchema = z.object({ id: z.string() });

export const getMemo = (env: AppEnv, id: string): Promise<Memo | null> => findMemo(env, id);

export const listTagCounts = async (env: AppEnv): Promise<TagCount[]> =>
  countTags(await loadMemos(env));

export async function listAgentMemos(
  env: AppEnv,
  filters: AgentMemoFilters,
): Promise<AgentMemoResult[]> {
  return filterAgentMemos(await loadMemos(env), filters).map((memo) => ({
    id: memo.id,
    createdAt: memo.createdAt,
    tags: memo.tags,
    content: memo.content,
  }));
}

const bodyOf = (content: string) => {
  const lines = content.trimEnd().split("\n");
  while (lines.length > 0 && /^(#[^\s#]+\s*)+$/.test(lines[lines.length - 1].trim())) lines.pop();
  return lines.join("\n").trimEnd();
};

export async function createMemo(env: AppEnv, input: CreateMemoInput): Promise<Memo> {
  const tags = input.tags.length ? input.tags : normalizeTags(input.content);
  const response = await vesperFetch(env, "/api/entries", {
    method: "POST",
    body: JSON.stringify({
      body: bodyOf(input.content),
      tags,
      visibility: input.visibility,
      favorite: input.favorite,
    }),
  });
  const { id } = createdSchema.parse(await response.json());
  await forgetMemos(env);
  const memo = await findMemo(env, id);
  if (!memo) throw new MemoError("not_found", `Memo not found after creating it: ${id}`);
  return memo;
}

export async function updateMemo(env: AppEnv, id: string, input: UpdateMemoInput): Promise<Memo> {
  const existing = await findMemo(env, id);
  if (!existing) throw new MemoError("not_found", `Memo not found: ${id}`);
  if (input.content !== null || input.tags !== null)
    await invalidateMemoOgCache(env.MEMOS_CACHE, id);
  const writtenTags =
    input.content !== null && (input.tags === null || input.tags.length === 0)
      ? normalizeTags(input.content)
      : input.tags;
  await vesperFetch(env, `/api/entries/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      body: input.content === null ? null : bodyOf(input.content),
      tags: writtenTags,
      visibility: input.visibility,
      pinned: input.pinned,
      favorite: input.favorite,
      archived: input.archived,
    }),
  });
  await forgetMemos(env);
  const updated = await findMemo(env, id);
  if (!updated) throw new MemoError("not_found", `Memo not found: ${id}`);
  return updated;
}

export async function deleteMemo(env: AppEnv, id: string): Promise<void> {
  if (!(await findMemo(env, id))) throw new MemoError("not_found", `Memo not found: ${id}`);
  await invalidateMemoOgCache(env.MEMOS_CACHE, id);
  await vesperFetch(env, `/api/entries/${id}`, { method: "DELETE" });
  await forgetMemos(env);
}
