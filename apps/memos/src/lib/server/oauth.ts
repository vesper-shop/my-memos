import { env } from "cloudflare:workers";
import { isOwner, VESPER_ORIGIN } from "#lib/server/vesper.ts";

const RESOURCE = "https://memos.you-find.me";

export const PROTECTED_RESOURCE_METADATA = {
  resource: RESOURCE,
  authorization_servers: [`${VESPER_ORIGIN}/api/auth`],
  scopes_supported: ["entries:read", "entries:write"],
  bearer_methods_supported: ["header"],
  resource_name: "my memos",
};

export async function isOwnerRequest(request: Request, user: App.Locals["user"]): Promise<boolean> {
  const header = request.headers.get("authorization");
  if (!header) return user !== null;
  const token = header.match(/^Bearer (.+)$/);
  return token !== null && isOwner(env, token[1]);
}
