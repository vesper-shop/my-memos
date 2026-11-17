import { defineEnv, string, url } from "void/env";

export default defineEnv({
  SITE_URL: url().default("https://memos.you-find.me"),
  CF_ACCOUNT_ID: string().default("fb71c4eceaf623ae1b19b8b37d7a38cf"),
  CF_AIG_TOKEN: string(),
  TAVILY_API_KEY: string(),
  VESPER_TOKEN: string(),
});
