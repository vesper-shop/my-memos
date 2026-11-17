import { z } from "zod";
import { profileOf } from "#lib/server/owner.ts";
import type { AppEnv } from "#lib/server/types.ts";

export const VESPER_ORIGIN = "https://noted-this.date";
export const SESSION_COOKIE = "memos_session";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;

const RESOURCE = `${VESPER_ORIGIN}/mcp`;
const SCOPE = "entries:read";
const CLIENT_KEY = "vesper:client";
const PROFILE_KEY = "vesper:profile";
const OWNER_KEY = "vesper:owner-workspace";
const HEADERS = { "user-agent": "my-memos" };

const metadataSchema = z.object({
  authorization_endpoint: z.string(),
  token_endpoint: z.string(),
  registration_endpoint: z.string(),
});
const clientSchema = z.object({ client_id: z.string(), redirect_uri: z.string() });
const tokenSchema = z.object({ access_token: z.string() });
const pendingSchema = z.object({ verifier: z.string(), next: z.string() });
const workspaceSchema = z.object({
  workspace: z.object({ id: z.string(), handle: z.string() }),
  profile: z.object({ name: z.string(), image: z.string().nullable() }),
});
const profileSchema = z.object({
  name: z.string(),
  email: z.string(),
  image: z.string().nullable(),
  href: z.string(),
});

export class VesperError extends Error {}

async function read<S extends z.ZodType>(schema: S, response: Response): Promise<z.output<S>> {
  if (!response.ok)
    throw new VesperError(`${response.status} ${(await response.text()).slice(0, 200)}`);
  return schema.parse(await response.json());
}

const form = (fields: Record<string, string>) => ({
  method: "POST",
  headers: { ...HEADERS, "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields),
});

const base64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));

async function metadata() {
  return read(
    metadataSchema,
    await fetch(`${VESPER_ORIGIN}/.well-known/oauth-authorization-server/api/auth`, {
      headers: HEADERS,
    }),
  );
}

async function client(env: AppEnv, redirectUri: string) {
  const parsed = clientSchema.safeParse(await env.MEMOS_CACHE.get(CLIENT_KEY, "json"));
  if (parsed.success && parsed.data.redirect_uri === redirectUri) return parsed.data;
  const { registration_endpoint } = await metadata();
  const registered = await read(
    z.object({ client_id: z.string() }),
    await fetch(registration_endpoint, {
      method: "POST",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "My Memos",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: SCOPE,
      }),
    }),
  );
  const result = { client_id: registered.client_id, redirect_uri: redirectUri };
  await env.MEMOS_CACHE.put(CLIENT_KEY, JSON.stringify(result));
  return result;
}

export async function authorize(env: AppEnv, redirectUri: string, next: string) {
  const [{ authorization_endpoint }, registered] = await Promise.all([
    metadata(),
    client(env, redirectUri),
  ]);
  const state = random();
  const verifier = random();
  const challenge = base64url(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
  );
  await env.MEMOS_CACHE.put(`vesper:pending:${state}`, JSON.stringify({ verifier, next }), {
    expirationTtl: 600,
  });
  const url = new URL(authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: registered.client_id,
    redirect_uri: redirectUri,
    scope: SCOPE,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: RESOURCE,
  }).toString();
  return url.toString();
}

export async function callback(env: AppEnv, redirectUri: string, code: string, state: string) {
  const pending = pendingSchema.parse(await env.MEMOS_CACHE.get(`vesper:pending:${state}`, "json"));
  await env.MEMOS_CACHE.delete(`vesper:pending:${state}`);
  const [{ token_endpoint }, registered] = await Promise.all([
    metadata(),
    client(env, redirectUri),
  ]);
  const tokens = await read(
    tokenSchema,
    await fetch(
      token_endpoint,
      form({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: registered.client_id,
        code_verifier: pending.verifier,
        resource: RESOURCE,
      }),
    ),
  );
  const me = await workspace(tokens.access_token);
  if (!me || me.workspace.id !== (await ownerId(env)))
    throw new VesperError("This Vesper workspace is not the one this site belongs to.");
  await env.MEMOS_CACHE.put(
    PROFILE_KEY,
    JSON.stringify(profileOf(me.workspace.handle, me.profile.name, me.profile.image)),
  );
  const session = random();
  await env.MEMOS_CACHE.put(`session:${session}`, "owner", { expirationTtl: SESSION_SECONDS });
  return { session, next: pending.next };
}

export async function isSession(env: AppEnv, session: string | undefined) {
  return Boolean(session) && (await env.MEMOS_CACHE.get(`session:${session}`)) === "owner";
}

export const endSession = (env: AppEnv, session: string) =>
  env.MEMOS_CACHE.delete(`session:${session}`);

async function workspace(token: string) {
  const response = await fetch(`${VESPER_ORIGIN}/api/workspace`, {
    headers: { ...HEADERS, authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  return workspaceSchema.parse(await response.json());
}

async function ownerId(env: AppEnv) {
  const cached = await env.MEMOS_CACHE.get(OWNER_KEY);
  if (cached) return cached;
  const response = await fetch(`${VESPER_ORIGIN}/api/workspace`, {
    headers: { ...HEADERS, authorization: `Bearer ${env.VESPER_TOKEN}` },
  });
  if (!response.ok) return null;
  const id = (await read(workspaceSchema, response)).workspace.id;
  await env.MEMOS_CACHE.put(OWNER_KEY, id, { expirationTtl: 3600 });
  return id;
}

export async function loadProfile(env: AppEnv) {
  const parsed = profileSchema.safeParse(await env.MEMOS_CACHE.get(PROFILE_KEY, "json"));
  return parsed.success ? parsed.data : null;
}

export async function isOwner(env: AppEnv, token: string) {
  const digest = base64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  const key = `bearer:${digest}`;
  const cached = await env.MEMOS_CACHE.get(key);
  if (cached !== null) return cached === "owner";
  const me = await workspace(token);
  const owner = me !== null && me.workspace.id === (await ownerId(env));
  await env.MEMOS_CACHE.put(key, owner ? "owner" : "other", { expirationTtl: 300 });
  return owner;
}

export async function vesperFetch(env: AppEnv, path: string, init: RequestInit = {}) {
  const response = await fetch(`${VESPER_ORIGIN}${path}`, {
    ...init,
    headers: {
      ...HEADERS,
      ...(init.body ? { "content-type": "application/json" } : {}),
      authorization: `Bearer ${env.VESPER_TOKEN}`,
    },
  });
  if (!response.ok)
    throw new VesperError(`${path}: ${response.status} ${(await response.text()).slice(0, 200)}`);
  return response;
}
