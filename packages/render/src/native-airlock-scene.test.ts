import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  loadNativeAirlockScene,
  type NativeAirlockRenderInput,
} from "./native-airlock-scene";
const audit = JSON.parse(
  readFileSync(
    "assets/art-library/designs/shipyard.structure.external-airlock/revisions/r000/audit-a007.json",
    "utf8",
  ),
);
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const nativeSourcePath = (path: string) =>
  resolve(repositoryRoot, path.replace(/^\/root\/sidereal_spacetime\//, ""));
function setup() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const parent = new TransformNode("instance", scene);
  const input: NativeAirlockRenderInput = {
    instanceId: "room-a",
    deckId: "deck-a",
    doors: [
      { openingId: "door-a", originM: [2, 0, 0], quarterTurns: 1 },
      { openingId: "door-b", originM: [6, 2, 0], quarterTurns: 3 },
    ],
    elevationM: 3,
    installation: audit.placements.map(
      (p: object & { source: string }, i: number) => ({
        ...p,
        id: "part-" + i,
        sha256: audit.sourcePins[p.source].sha256,
      }),
    ),
    sources: Object.fromEntries(
      Object.entries(audit.sourcePins).map(([name, pin]) => [
        name,
        {
          url: "/" + name + ".glb",
          sha256: (pin as { sha256: string }).sha256,
        },
      ]),
    ),
  };
  const fetcher = vi.fn(async (url: string) => {
    const source = url.slice(1, -4);
    const bytes = readFileSync(nativeSourcePath(audit.sourcePins[source].path));
    return {
      ok: true,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  return {
    engine,
    scene,
    parent,
    input,
    fetcher,
    dispose() {
      scene.dispose();
      engine.dispose();
    },
  };
}
afterEach(() => vi.unstubAllGlobals());
test("exact native room loads one GLB per source, preserves primitive geometry/materials and installs every unique placement", async () => {
  const s = setup();
  try {
    const result = await loadNativeAirlockScene(s.scene, s.parent, s.input);
    expect(s.fetcher).toHaveBeenCalledTimes(7);
    expect(s.fetcher.mock.calls.flat()).not.toContain("/strip.glb");
    expect(result.placements).toHaveLength(s.input.installation.length);
    expect(
      new Set(result.placements.map((p) => p.node.metadata.partId)).size,
    ).toBe(s.input.installation.length);
    expect(result.walkingElevation).toBe(3.1875);
    for (const placement of result.placements) {
      expect(placement.meshes.length).toBeGreaterThan(0);
      for (const mesh of placement.meshes) {
        expect(mesh.material).toBeTruthy();
        expect(mesh.isPickable).toBe(false);
        const prototype = s.scene.meshes.find(
          (m) =>
            m !== mesh &&
            m.geometry === mesh.geometry &&
            m.name.startsWith(mesh.metadata.nativeNodePrefix),
        );
        expect(prototype).toBeTruthy();
        expect(mesh.material).toBe(prototype!.material);
      }
    }
    const floors = result.placements.filter(
      (p) => p.node.metadata.nativeSource === "floor",
    );
    expect(floors).toHaveLength(16);
    expect(floors[0].meshes[0].geometry).toBe(floors[1].meshes[0].geometry);
    const roofs = result.placements.filter(
      (p) => p.node.metadata.constructionRoof,
    );
    expect(roofs).toHaveLength(12);
    result.setView(new Vector3(8, 10, -6), true);
    expect(roofs.every((p) => !p.node.isEnabled())).toBe(true);
    expect(floors.every((p) => p.node.isEnabled())).toBe(true);
    const walls = result.placements.filter(
      (p) => p.node.metadata.nativeSource === "wall",
    );
    expect(walls.some((p) => !p.node.isEnabled())).toBe(true);
    expect(walls.some((p) => p.node.isEnabled())).toBe(true);
    result.setView(new Vector3(8, 10, -6), false);
    expect(result.placements.every((p) => p.node.isEnabled())).toBe(true);
    result.dispose();
    result.dispose();
    expect(s.scene.meshes).toHaveLength(0);
    expect(s.scene.morphTargetManagers).toHaveLength(0);
    expect(s.scene.transformNodes).toEqual([s.parent]);
  } finally {
    s.dispose();
  }
});
test("accepted hinge and seal states share the native bind and unknown state cannot display a deployed gasket", async () => {
  const s = setup();
  try {
    const result = await loadNativeAirlockScene(s.scene, s.parent, s.input);
    const leaf = result.placements.find(
      (p) => p.node.metadata.nativeNodePrefix === "GEO-door-leaf--surface",
    )!;
    const ring = result.placements.find(
      (p) =>
        p.node.metadata.nativeNodePrefix === "GEO-door-perimeter-seal--surface",
    )!.meshes[0];
    const hinge = ring.parent as TransformNode;
    expect(leaf.meshes.every((m) => m.parent === hinge)).toBe(true);
    expect(ring.isVisible).toBe(false);
    // World bind includes deck elevation exactly once; moving primitive matrix
    // composed with its hinge recovers the complete source bind matrix.
    const source = s.scene.meshes.find(
      (m) =>
        m.name === "GEO-door-leaf--surface" ||
        m.name.startsWith("GEO-door-leaf--surface_"),
    )!;
    const inverseFrame = Matrix.Invert(leaf.node.computeWorldMatrix(true));
    const actualBind = leaf.meshes[0]
      .computeWorldMatrix(true)
      .multiply(inverseFrame);
    const sourceBind = source.computeWorldMatrix(true);
    actualBind
      .asArray()
      .forEach((v, i) => expect(v).toBeCloseTo(sourceBind.asArray()[i], 6));
    result.setDoors([{ openingId: "door-a", fraction: 0, sealRetraction: 0 }]);
    expect(ring.isVisible).toBe(true);
    expect(ring.morphTargetManager!.getTarget(0).influence).toBe(0);
    result.setDoors([
      { openingId: "door-a", fraction: 0, sealRetraction: 0.5 },
    ]);
    expect(ring.morphTargetManager!.getTarget(0).influence).toBe(0.5);
    expect(hinge.rotation.y).toBeCloseTo(0);
    result.setDoors([
      { openingId: "door-a", fraction: 0.5, sealRetraction: 1 },
    ]);
    expect(hinge.rotation.y).toBe(-Math.PI / 4);
    expect(ring.isVisible).toBe(true);
    result.setDoors([
      { openingId: "door-a", fraction: 0.5, sealRetraction: 0 },
    ]);
    expect(ring.isVisible).toBe(false);
    result.setDoors([{ openingId: "door-a", fraction: 0 }]);
    expect(ring.isVisible).toBe(false);
    const outerRing = result.placements.find(
      (p) =>
        p.node.metadata.openingId === "door-b" &&
        p.node.metadata.nativeNodePrefix === "GEO-door-perimeter-seal--surface",
    )!.meshes[0];
    result.setDoors([
      { openingId: "door-a", fraction: 0, sealRetraction: 0 },
      { openingId: "door-b", fraction: 0.75, sealRetraction: 1 },
    ]);
    expect((outerRing.parent as TransformNode).rotation.y).toBe(
      (-3 * Math.PI) / 8,
    );
    expect(hinge.rotation.y).toBeCloseTo(0);
    expect(outerRing.morphTargetManager).not.toBe(ring.morphTargetManager);
    expect(ring.morphTargetManager!.getTarget(0).influence).toBe(0);
    expect(outerRing.morphTargetManager!.getTarget(0).influence).toBe(1);
    result.setDoors([]);
    expect(ring.isVisible).toBe(false);
    expect(outerRing.isVisible).toBe(false);
    result.dispose();
  } finally {
    s.dispose();
  }
});
test("changed source bytes, malformed door frame and missing exact native selector fail closed", async () => {
  const s = setup();
  try {
    const changed = structuredClone(s.input);
    changed.installation.find((p) => p.source === "gasket")!.originM[0] += 1;
    await expect(
      loadNativeAirlockScene(s.scene, s.parent, changed),
    ).rejects.toThrow(/shared door/);
    vi.stubGlobal("fetch", async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    }));
    await expect(
      loadNativeAirlockScene(s.scene, s.parent, s.input),
    ).rejects.toThrow(/hash mismatch/);
    expect(s.scene.meshes).toHaveLength(0);
    vi.stubGlobal("fetch", s.fetcher);
    const missing = structuredClone(s.input);
    missing.installation[0].nodePrefix += "-absent";
    await expect(
      loadNativeAirlockScene(s.scene, s.parent, missing),
    ).rejects.toThrow(/selector/);
    expect(s.scene.meshes).toHaveLength(0);
    expect(s.scene.transformNodes).toEqual([s.parent]);
  } finally {
    s.dispose();
  }
});
