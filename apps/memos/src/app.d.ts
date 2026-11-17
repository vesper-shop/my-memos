import type { Owner } from "#lib/server/owner.ts";
import type { AppEnv } from "#lib/server/types.ts";

declare global {
  namespace App {
    interface Locals {
      user: Owner | null;
    }
  }

  namespace Cloudflare {
    interface Env extends AppEnv {}
  }
}

export {};
