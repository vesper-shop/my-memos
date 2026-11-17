import { extractTags } from "#lib/utils/tags.ts";

export function normalizeTags(content: string): string[] {
  return extractTags(content);
}
