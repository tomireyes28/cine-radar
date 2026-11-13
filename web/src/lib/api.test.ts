import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { apiGet, ApiRequestError } from "./api.ts";

describe("Bounded HTTP transport retained for server-side TMDB", () => {
  it("preserves successful empty JSON and distinguishes HTTP absence from failure", async () => {
    assert.deepEqual(
      await apiGet("/resource", {}, 0, {
        apiBaseUrl: "https://example.test",
        fetchImpl: async () => Response.json([]),
      }),
      [],
    );
    assert.equal(
      await apiGet("/resource", {}, 0, {
        apiBaseUrl: "https://example.test",
        fetchImpl: async () => new Response(null, { status: 404 }),
      }),
      null,
    );
    for (const status of [429, 500, 503])
      await assert.rejects(
        apiGet("/resource", {}, 0, {
          apiBaseUrl: "https://example.test",
          fetchImpl: async () => new Response(null, { status }),
        }),
        (e) => e instanceof ApiRequestError && e.status === status,
      );
  });
  it("requires an explicit server URL and does not fall back to the removed public Nest configuration", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://legacy.invalid";
    try {
      await assert.rejects(
        apiGet("/resource", {}, 0),
        (e) => e instanceof ApiRequestError && e.kind === "misconfigured",
      );
    } finally {
      delete process.env.NEXT_PUBLIC_API_URL;
    }
  });
});
