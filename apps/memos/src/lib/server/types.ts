export interface AppEnv {
  MEMOS_BUCKET: R2Bucket;
  MEMOS_CACHE: KVNamespace;
  VESPER_TOKEN: string;
}
