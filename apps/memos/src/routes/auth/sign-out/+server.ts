import { env } from "cloudflare:workers";
import { endSession, SESSION_COOKIE } from "#lib/server/vesper.ts";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ cookies }) => {
  const session = cookies.get(SESSION_COOKIE);
  if (session) await endSession(env, session);
  cookies.delete(SESSION_COOKIE, { path: "/" });
  return Response.json({ signedOut: true });
};
