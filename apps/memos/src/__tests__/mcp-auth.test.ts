import { describe, expect, it } from "vite-plus/test";
import { isOwnerRequest } from "#lib/server/oauth.ts";
const OWNER = {
  name: "owner",
  email: "@owner",
  image: null,
  href: "https://owner.noted-this.date/",
};

describe("isOwnerRequest", () => {
  it("trusts the signed-in session when no bearer token is sent", async () => {
    const request = new Request("https://example.test/api/memos");
    await expect(isOwnerRequest(request, OWNER)).resolves.toBe(true);
    await expect(isOwnerRequest(request, null)).resolves.toBe(false);
  });

  it("judges a request that sends Authorization only by its bearer token", async () => {
    const request = new Request("https://example.test/api/memos", {
      headers: { authorization: "Basic b3duZXI6c2VjcmV0" },
    });
    await expect(isOwnerRequest(request, OWNER)).resolves.toBe(false);
  });
});
