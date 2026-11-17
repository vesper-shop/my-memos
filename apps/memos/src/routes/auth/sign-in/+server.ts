import { env } from "cloudflare:workers";
import { authorize } from "#lib/server/vesper.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url }) => {
  const next = url.searchParams.get("next");
  const target = await authorize(
    env,
    new URL("/auth/callback", url).toString(),
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/",
  );
  return new Response(null, { status: 302, headers: { location: target } });
};
