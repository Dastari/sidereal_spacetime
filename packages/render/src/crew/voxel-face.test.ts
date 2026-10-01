import { afterEach, expect, test, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { verifyCrewSource } from "./crew-asset-cache";
import { loadVerifiedRgbaImage } from "./voxel-face";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function source() {
  vi.stubGlobal("crypto", webcrypto);
  const bytes = new Uint8Array([1, 2, 3, 4]);
  return await verifyCrewSource(bytes, {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    variant: "head-face-png",
    byteLength: bytes.length,
  });
}
function decoder() {
  const close = vi.fn(),
    drawImage = vi.fn(),
    pixels = new Uint8ClampedArray([11, 22, 33, 44]);
  const bitmap = { width: 1, height: 1, close };
  const decode = vi.fn(
    async (_blob: Blob, _options: ImageBitmapOptions) => bitmap,
  );
  vi.stubGlobal("createImageBitmap", decode);
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      getContext() {
        return { drawImage, getImageData: () => ({ data: pixels }) };
      }
    },
  );
  return { close, drawImage, pixels, bitmap, decode };
}

test("verified face-map decode uses the exact owned bytes without a second URL fetch", async () => {
  const verified = await source(),
    f = decoder();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const image = await loadVerifiedRgbaImage(verified);
  const blob = f.decode.mock.calls[0]?.[0] as unknown as Blob;
  expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([1, 2, 3, 4]);
  expect(image).toEqual({
    width: 1,
    height: 1,
    data: new Uint8ClampedArray([11, 22, 33, 44]),
  });
  f.pixels.fill(0);
  expect([...image.data]).toEqual([11, 22, 33, 44]);
  expect(fetch).not.toHaveBeenCalled();
  expect(f.close).toHaveBeenCalledTimes(1);
});

test("missing decoder context releases the decoded bitmap and never supplies empty pixels", async () => {
  const verified = await source(),
    f = decoder();
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      getContext() {
        return null;
      }
    },
  );
  await expect(loadVerifiedRgbaImage(verified)).rejects.toThrow(
    "decoder unavailable",
  );
  expect(f.close).toHaveBeenCalledTimes(1);
});

test("forged source cannot reach the browser decoder", async () => {
  const f = decoder();
  await expect(
    loadVerifiedRgbaImage({
      sha256: "a".repeat(64),
      variant: "forged",
      byteLength: 4,
    }),
  ).rejects.toThrow("attestation unavailable");
  expect(f.decode).not.toHaveBeenCalled();
});
