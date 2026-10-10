import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { WAYFARER_ACCESS_PHYSICAL } from "@sidereal/content/wayfarer-access-profile";
const native = (id: string) => ({
  ...WAYFARER_ACCESS_PHYSICAL.pieces.find((p) => p.id === id)!,
  frame: "piece-local" as const,
});
const bytes = (file: string) =>
  Uint8Array.from(
    readFileSync(
      new URL(
        `../../../../assets/runtime/wayfarer-access/r002/${file}`,
        import.meta.url,
      ),
    ),
  );
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

test("normal game resolves native deck and flight pieces through exact public pins", async () => {
  const fetcher = vi.fn(async (url: string) => ({
    ok: true,
    arrayBuffer: async () => bytes(url.split("/").at(-1)!).buffer,
  }));
  vi.stubGlobal("fetch", fetcher);
  const { publishedShipAccessBytes } = await import("./wayfarer-access-assets");
  for (const id of ["native.deck", "native.flight"])
    expect(
      Buffer.from(await publishedShipAccessBytes(native(id))).equals(
        Buffer.from(bytes(native(id).file)),
      ),
    ).toBe(true);
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
    "/assets/wayfarer-access/r002/native.deck.glb",
    "/assets/wayfarer-access/r002/native.flight.glb",
  ]);
});

test("unpublished file aliases cannot reuse a valid cached pin", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  const { publishedShipAccessBytes } = await import("./wayfarer-access-assets");
  await expect(
    publishedShipAccessBytes({
      ...native("native.deck"),
      file: "../changed.glb",
    }),
  ).rejects.toThrow("Unpublished");
  expect(fetcher).not.toHaveBeenCalled();
});

test("changed bytes reject without poisoning a retry; simultaneous valid callers fetch once", async () => {
  const piece = native("native.flight");
  const exact = bytes(piece.file);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    })
    .mockResolvedValue({ ok: true, arrayBuffer: async () => exact.buffer });
  vi.stubGlobal("fetch", fetcher);
  const { publishedShipAccessBytes } = await import("./wayfarer-access-assets");
  await expect(publishedShipAccessBytes(piece)).rejects.toThrow(
    "Changed pinned",
  );
  const [one, two] = await Promise.all([
    publishedShipAccessBytes(piece),
    publishedShipAccessBytes(piece),
  ]);
  expect(Buffer.from(one).equals(Buffer.from(exact))).toBe(true);
  expect(two).toBe(one);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
