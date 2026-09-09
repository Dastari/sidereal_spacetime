import { expect, test, vi } from "vitest";
import { bindGameSessionProof } from "./game-session-proof";
const request = () => ({
  origin: "https://game.example.test",
  database: "world",
  connectionId: "a".repeat(32),
  token: "test-original-provider-credential",
  signal: new AbortController().signal,
});
test("original credential goes only in verified HTTP header, never URL/body or redirect", async () => {
  const fetcher = vi.fn(async () => new Response(null, { status: 200 }));
  await bindGameSessionProof({ ...request(), fetcher });
  const [url, options] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
  expect(url.href).toBe(
    "https://game.example.test/v1/database/world/call/bind_game_session",
  );
  expect(options.headers).toEqual({
    Authorization: "Bearer test-original-provider-credential",
    "Content-Type": "application/json",
  });
  expect(options.body).toBe(JSON.stringify(["a".repeat(32)]));
  expect(options.redirect).toBe("error");
  expect(options.cache).toBe("no-store");
});
test("provider errors and transport diagnostics cannot leak credentials", async () => {
  await expect(
    bindGameSessionProof({
      ...request(),
      fetcher: vi.fn(async () => {
        throw Error("secret credential");
      }),
    }),
  ).rejects.toThrow(/^Game session verification failed$/);
  await expect(
    bindGameSessionProof({
      ...request(),
      fetcher: vi.fn(async () => new Response("secret", { status: 403 })),
    }),
  ).rejects.toThrow(/^Game session verification rejected \(403\)$/);
});
test("invalid socket IDs never make a request and cancellation remains bounded", async () => {
  const fetcher = vi.fn();
  await expect(
    bindGameSessionProof({ ...request(), connectionId: "other/user", fetcher }),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
  const abort = new AbortController();
  abort.abort();
  await expect(
    bindGameSessionProof({
      ...request(),
      signal: abort.signal,
      fetcher: vi.fn(async () => {
        throw new DOMException("aborted", "AbortError");
      }),
    }),
  ).rejects.toThrow("cancelled");
});
