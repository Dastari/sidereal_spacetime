import { afterEach, describe, expect, it, vi } from "vitest";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { SHIP_KIT_SLOTS } from "@sidereal/content/ship-kit";
import {
  SHIP_VISUAL_FRAME,
  SHIP_VISUAL_SCHEMA,
} from "@sidereal/content/ship-visual";
import {
  visualPrefabSha256,
  visualProfilesSha256,
} from "@sidereal/sim/ship-visual-compiler";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { DressedShip } from "@sidereal/sim/ship-dresser";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene as NativeScene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import {
  prepareCandidateMaterials,
  resolveVisualVariant,
  referenceFloraMaterial,
} from "./visual-variant";
const hash = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
const scene = { isDisposed: false } as Scene;
const dressed = {
  components: [],
  objects: [],
  kit: [],
} as unknown as DressedShip;
function candidate(
  normal = new Uint8Array([137, 80, 78, 71, ...Array(20).fill(0)]),
  pieces: Record<string, { slots: string[] }> = {},
) {
  const native = new TextEncoder().encode(
    JSON.stringify({
      schema: "sidereal.ship-kit-manifest.v1",
      revision: "r002",
      frame:
        "piece-local metres: prototype +X/+Y plan, +Z up; glTF Y-up (x, z, -y)",
      slots: SHIP_KIT_SLOTS,
      pieces,
    }),
  );
  const manifest = {
    schema: SHIP_VISUAL_SCHEMA,
    revision: "r001",
    status: "proposal",
    frame: SHIP_VISUAL_FRAME,
    lattice: 16,
    compilerSha256: "a".repeat(64),
    profilesSha256: visualProfilesSha256(),
    slots: SHIP_KIT_SLOTS,
    prefabs: { [PREFAB_SHIPS[0].id]: visualPrefabSha256(PREFAB_SHIPS[0]) },
    assets: [
      {
        kind: "kit-manifest",
        id: "native",
        url: "/assets/ship-kit/r002/manifest.json",
        sha256: hash(native),
        bytes: native.length,
      },
      {
        kind: "normal",
        id: "panel",
        url: "/assets/ship-visual/r001/normal.png",
        sha256: hash(normal),
        bytes: normal.length,
      },
    ],
    decorativeEnvelope: { outward: 0.1875, upward: 0.1875, inward: 0 },
  };
  const bytes = new TextEncoder().encode(JSON.stringify(manifest));
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (url: string) =>
        new Response(
          Uint8Array.from(
            url.includes("/ship-kit/")
              ? native
              : url.endsWith("manifest.json")
                ? bytes
                : normal,
          ),
        ),
    ),
  );
  return {
    url: "/assets/ship-visual/r001/manifest.json",
    sha256: hash(bytes),
    compilerSha256: manifest.compilerSha256,
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("whole visual candidate prerequisites", () => {
  it("rejects a hash-valid PNG header whose image cannot decode", async () => {
    const selection = candidate();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw Error("Invalid image decode");
      }),
    );
    await expect(
      resolveVisualVariant(scene, PREFAB_SHIPS[0], dressed, selection),
    ).rejects.toThrow("Invalid image decode");
  });
  it("rejects an omitted required fitting before any candidate mesh import", async () => {
    const selection = candidate();
    await expect(
      resolveVisualVariant(
        scene,
        PREFAB_SHIPS[0],
        {
          ...dressed,
          components: [{ component: "reactor.md" }],
        } as DressedShip,
        selection,
      ),
    ).rejects.toThrow("lacks required");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("closes a late decoded image without allocating scene resources after disposal", async () => {
    const selection = candidate();
    const closing = vi.fn();
    let decoded: (value: unknown) => void = () => {};
    const image = new Promise((resolve) => {
      decoded = resolve;
    });
    const decode = vi.fn(() => image);
    vi.stubGlobal("createImageBitmap", decode);
    const mutableScene = { isDisposed: false };
    const pending = resolveVisualVariant(
      mutableScene as Scene,
      PREFAB_SHIPS[0],
      dressed,
      selection,
    );
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce());
    mutableScene.isDisposed = true;
    decoded({ width: 256, height: 256, close: closing });
    await expect(pending).rejects.toThrow(
      "Scene disposed during candidate map decode",
    );
    expect(closing).toHaveBeenCalledOnce();
  });
  it.each(["canopy.fixture", "mount.fixed.sm"])(
    "rejects omitted retained native art for %s independently of the candidate list",
    async (piece) => {
      const selection = candidate(undefined, {
        [piece]: { slots: piece.startsWith("mount.") ? ["metal"] : ["glass"] },
      });
      await expect(
        resolveVisualVariant(
          scene,
          PREFAB_SHIPS[0],
          { ...dressed, kit: [{ piece }] } as DressedShip,
          selection,
        ),
      ).rejects.toThrow("lacks required");
    },
  );
  it("borrows reflection without leaking a transient clone or allocating twice", () => {
    const engine = new NullEngine();
    const nativeScene = new NativeScene(engine);
    const base = new PBRMaterial("base", nativeScene);
    base.reflectionTexture = new Texture(null, nativeScene);
    const count = nativeScene.textures.length;
    const flora = referenceFloraMaterial(nativeScene, base);
    expect(flora.reflectionTexture).toBe(base.reflectionTexture);
    expect(nativeScene.textures.length).toBe(count);
    expect(referenceFloraMaterial(nativeScene, base)).toBe(flora);
    expect(nativeScene.textures.length).toBe(count);
    nativeScene.dispose();
    engine.dispose();
  });
  it("waits for hidden material compilation and propagates failure", async () => {
    let finish: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    let ready = false;
    const mesh = {
      material: { forceCompilationAsync: () => pending },
      hasThinInstances: false,
    } as unknown as Mesh;
    const preparation = prepareCandidateMaterials(scene, [mesh]).then(() => {
      ready = true;
    });
    await Promise.resolve();
    expect(ready).toBe(false);
    finish();
    await preparation;
    expect(ready).toBe(true);
    const broken = {
      ...mesh,
      material: {
        forceCompilationAsync: () => Promise.reject(Error("shader failure")),
      },
    } as unknown as Mesh;
    await expect(prepareCandidateMaterials(scene, [broken])).rejects.toThrow(
      "shader failure",
    );
  });
});
