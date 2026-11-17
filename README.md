# my-memos

A personal memo app built with SvelteKit, deployed as a Cloudflare Worker.

- **Storage** — memos live in [Vesper](https://noted-this.date) and are read with a workspace API token (`VESPER_TOKEN`); R2 keeps the Agent's memory and KV the sessions and caches
- **Auth** — the token reads and writes; editing needs a Vesper sign-in, and the profile card shows the signed-in workspace handle
- **AI chat** — Cloudflare AI Gateway with memo-aware tools (list, search, create, update, delete)
- **Stack** — SvelteKit · pnpm workspace · adapter-cloudflare

See [`docs/`](docs/) for architecture, deployment, and design system details.

## MCP client

Connect a Streamable HTTP MCP client to the public endpoint. The client discovers Vesper as the
authorization server from `/.well-known/oauth-protected-resource`, registers itself, and signs the
owner in through OAuth:

```json
{
  "mcpServers": {
    "my-memos": {
      "type": "streamable-http",
      "url": "https://memos.you-find.me/api/mcp"
    }
  }
}
```

Access tokens must be Vesper tokens for the owner's workspace. The
endpoint supports MCP `2026-07-28` and stateless `2025-11-25` clients. It does not issue an
`Mcp-Session-Id`.

## License

AGPL-3.0

## References

- [Memos](https://github.com/usememos/memos) — Timeline-first product direction, Markdown-native capture, and deliberately simple note workflows
- [camelAI](https://github.com/qaml-ai/camelAI) — Cloudflare deployment and application/runtime boundaries
- [oh-my-pi](https://github.com/can1357/oh-my-pi) — pi package boundaries, streaming events, and tool harness design
