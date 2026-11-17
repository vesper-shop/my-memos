import { env } from "cloudflare:workers";
import { createMemosMcpHandler } from "#lib/server/mcp/index.ts";
import { isOwnerRequest } from "#lib/server/oauth.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ request }) => {
  if (request.headers.has("mcp-session-id")) {
    return Response.json({ error: "MCP sessions are not supported." }, { status: 400 });
  }
  if (!request.headers.has("authorization") || !(await isOwnerRequest(request, null))) {
    return Response.json(
      { error: "Unauthorized." },
      {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${new URL("/.well-known/oauth-protected-resource", request.url)}"`,
        },
      },
    );
  }
  return createMemosMcpHandler(env, "external").fetch(request);
};
