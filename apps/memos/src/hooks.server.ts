import { env } from "cloudflare:workers";
import type { Handle } from "@sveltejs/kit/hooks";

import { isSession, loadProfile, SESSION_COOKIE } from "#lib/server/vesper.ts";

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname === "/favicon.ico") {
    return Response.redirect(new URL("/favicon.png", event.url), 301);
  }
  const active = await isSession(env, event.cookies.get(SESSION_COOKIE));
  event.locals.user = active ? await loadProfile(env) : null;
  return resolve(event);
};
