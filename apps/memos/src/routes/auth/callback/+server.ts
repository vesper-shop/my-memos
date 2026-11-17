import { env } from "cloudflare:workers";
import { error, redirect } from "@sveltejs/kit";
import { callback, SESSION_COOKIE, SESSION_SECONDS } from "#lib/server/vesper.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) error(400, url.searchParams.get("error") || "Missing code.");
  const { session, next } = await callback(
    env,
    new URL("/auth/callback", url).toString(),
    code,
    state,
  );
  cookies.set(SESSION_COOKIE, session, {
    path: "/",
    httpOnly: true,
    secure: url.protocol === "https:",
    sameSite: "lax",
    maxAge: SESSION_SECONDS,
  });
  redirect(302, next);
};
