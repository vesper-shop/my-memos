import { z } from "zod";
import type { AppEnv } from "#lib/server/types.ts";
import seed from "./definitions.json";

const KEY = "tags:definitions";
export const TAG_KINDS = ["type", "topic", "channel"] as const;

export const tagNameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[\p{Letter}\p{Number}_\-/]+$/u, "Tag names may contain letters, numbers, _, - and /.");

export const tagDefinitionInputSchema = z.object({
  kind: z.enum(TAG_KINDS),
  description: z.string().trim().min(1).max(200),
});

const definitionSchema = tagDefinitionInputSchema.extend({ name: z.string() });
export type TagDefinition = z.infer<typeof definitionSchema>;

const sorted = (definitions: TagDefinition[]) =>
  definitions.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));

export async function listTagDefinitions(env: AppEnv): Promise<TagDefinition[]> {
  const stored = await env.MEMOS_CACHE.get(KEY, "json");
  return z.array(definitionSchema).parse(stored === null ? seed : stored);
}

const save = (env: AppEnv, definitions: TagDefinition[]) =>
  env.MEMOS_CACHE.put(KEY, JSON.stringify(sorted(definitions)));

export async function upsertTagDefinition(
  env: AppEnv,
  definition: TagDefinition,
): Promise<TagDefinition> {
  const definitions = (await listTagDefinitions(env)).filter(
    (item) => item.name !== definition.name,
  );
  await save(env, [...definitions, definition]);
  return definition;
}

export async function deleteTagDefinition(env: AppEnv, name: string): Promise<boolean> {
  const definitions = await listTagDefinitions(env);
  const kept = definitions.filter((item) => item.name !== name);
  if (kept.length === definitions.length) return false;
  await save(env, kept);
  return true;
}
