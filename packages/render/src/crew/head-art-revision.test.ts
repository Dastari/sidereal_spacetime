import { readFileSync } from "node:fs";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it, vi } from "vitest";
import {
  CREW_HEAD_CATALOG,
  crewHeadAssetUrl,
} from "@sidereal/content/crew-heads";
import {
  HEAD_ART_CANDIDATE,
  HEAD_ART_MANIFEST_SHA256,
  headArtSources,
  validateHeadArtBytes,
  validateHeadArtManifest,
} from "./head-art-revision";

const ROOT = "assets/runtime/crew/heads/refinement-r005/";
const manifest = () => JSON.parse(readFileSync(ROOT + "manifest.json", "utf8"));

describe("explicit character art revision", () => {
  it("leaves every default/unsupported head layer on its released URL", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    const keys = [
      "heads",
      "facial-hair",
      "accessories",
      "hair/close_crop",
      "helmets",
    ];
    const selected = await headArtSources(keys, undefined);
    expect([...selected.sources]).toEqual(
      keys.map((k) => [k, crewHeadAssetUrl(k)]),
    );
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockRestore();
    const unknown = await headArtSources(keys, "unreviewed");
    expect([...unknown.sources]).toEqual([...selected.sources]);
    expect(unknown.error).toMatch(/unknown character art revision/);
  });
  it("binds every persisted style/mode and helmet/optic to complete exact candidate bytes", () => {
    const m = validateHeadArtManifest(manifest());
    expect(bytesToHex(sha256(readFileSync(ROOT + "manifest.json")))).toBe(
      HEAD_ART_MANIFEST_SHA256,
    );
    expect(Object.keys(m.files)).toHaveLength(
      CREW_HEAD_CATALOG.hairStyles.length + 1,
    );
    for (const pin of Object.values(m.files))
      expect(() =>
        validateHeadArtBytes(readFileSync(ROOT + pin.path), pin),
      ).not.toThrow();
  });
  it("rejects wrong frames, omitted modes, duplicate IDs, replaced legacy layers and byte corruption", () => {
    for (const mutate of [
      (m: ReturnType<typeof manifest>) => {
        m.headScale = 1;
      },
      (m: ReturnType<typeof manifest>) => {
        m.hairModes.pop();
      },
      (m: ReturnType<typeof manifest>) => {
        m.hairStyles[0] = m.hairStyles[1];
      },
      (m: ReturnType<typeof manifest>) => {
        m.files.heads = m.files.helmets;
      },
      (m: ReturnType<typeof manifest>) => {
        m.files["hair/close_crop"].nodes.pop();
      },
    ]) {
      const m = manifest();
      mutate(m);
      expect(() => validateHeadArtManifest(m)).toThrow();
    }
    const pin = manifest().files["hair/close_crop"];
    const bytes = readFileSync(ROOT + pin.path);
    bytes[bytes.length - 1] ^= 1;
    expect(() => validateHeadArtBytes(bytes, pin)).toThrow(/hash mismatch/);
  });
  it("rejects an incomplete selection atomically and retains the whole legacy kit", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const path = String(input);
        if (path.endsWith("manifest.json"))
          return new Response(readFileSync(ROOT + "manifest.json", "utf8"));
        return new Response("unavailable", { status: 404 });
      });
    const keys = ["heads", "hair/close_crop", "helmets"];
    const selected = await headArtSources(keys, HEAD_ART_CANDIDATE);
    expect([...selected.sources]).toEqual(
      keys.map((k) => [k, crewHeadAssetUrl(k)]),
    );
    expect(selected.error).toMatch(/HTTP 404/);
    fetcher.mockRestore();
  });
  it("rejects non-finite vertex geometry even with a matching byte pin", () => {
    const pin = manifest().files["hair/close_crop"];
    const bytes = readFileSync(ROOT + pin.path);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const end = 20 + view.getUint32(12, true);
    const doc = JSON.parse(bytes.subarray(20, end).toString());
    const a = doc.accessors[doc.meshes[0].primitives[0].attributes.POSITION];
    view.setFloat32(
      end +
        8 +
        (doc.bufferViews[a.bufferView].byteOffset ?? 0) +
        (a.byteOffset ?? 0),
      NaN,
      true,
    );
    expect(() =>
      validateHeadArtBytes(bytes, {
        ...pin,
        sha256: bytesToHex(sha256(bytes)),
      }),
    ).toThrow(/non-finite/);
  });
});
