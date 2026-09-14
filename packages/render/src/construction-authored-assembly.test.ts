import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { WAYFARER_CONVERSION_PIN as PIN } from "@sidereal/content/wayfarer-conversion-candidate";
import {
  createWayfarerConversionCandidate,
  type WayfarerPinnedInputs,
} from "@sidereal/sim/wayfarer-conversion-candidate";
import { qualifiedWayfarerWalkingBindings } from "@sidereal/sim/wayfarer-walking-bindings";
import { planConstructionInstance } from "@sidereal/sim/construction-instance";
import { loadConstructionAuthoredAssembly } from "./construction-authored-assembly";
afterEach(() => vi.unstubAllGlobals());
const candidate = () =>
  createWayfarerConversionCandidate(
    Object.fromEntries(
      Object.keys(PIN.sources).map((p) => [p, readFileSync(p, "utf8")]),
    ) as WayfarerPinnedInputs,
  );
test("all 211 authored objects load from 24 verified libraries with independent IDs, retained materials, roof cutaway and safe disposal", async () => {
  const e = new NullEngine(),
    scene = new Scene(e);
  scene.useRightHandedSystem = true;
  const root = new TransformNode("instance", scene);
  const addedWhileBlocked: boolean[] = [];
  const addMesh = scene.addMesh.bind(scene);
  vi.spyOn(scene, "addMesh").mockImplementation((mesh, recursive) => {
    addedWhileBlocked.push(scene.blockMaterialDirtyMechanism);
    return addMesh(mesh, recursive);
  });
  const fetcher = vi.fn(async (url: string) => {
    expect(scene.blockMaterialDirtyMechanism).toBe(false);
    const raw = readFileSync(
      "assets/runtime/" + url.replace(/^\/assets\//, ""),
    );
    return {
      ok: true,
      text: async () => raw.toString("utf8"),
      arrayBuffer: async () =>
        raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
    };
  });
  vi.stubGlobal("fetch", fetcher);
  try {
    const c = candidate();
    let n = 0;
    const a = planConstructionInstance(
      c.snapshot,
      {
        blueprintRevisionId: "visual-review",
        expectedBlueprintSha256: c.snapshot.sha256,
        sourceDeckId: PIN.deckId,
        bodyRadiusM: 0.3,
        bodyHeightM: 1.8,
        perimeterHalfWidthM: 0.05,
        partitionHalfWidthM: 0.05,
        objectCollisionBindings: qualifiedWayfarerWalkingBindings(
          c.snapshot,
          0.3,
          1.8,
        ),
      },
      () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, "0")}`,
    );
    const result = await loadConstructionAuthoredAssembly(
      scene,
      root,
      a.document,
      a.spawn.deckId,
    );
    expect(result).not.toBeNull();
    expect(scene.blockMaterialDirtyMechanism).toBe(false);
    expect(addedWhileBlocked).toContain(true);
    expect(result!.placements).toHaveLength(211);
    expect(
      new Set(result!.placements.map((p) => p.node.metadata.partId)).size,
    ).toBe(211);
    // Shared native hull/engine kits preserve selectors with fewer fetches.
    expect(fetcher).toHaveBeenCalledTimes(25);
    expect(
      result!.placements.filter((p) => p.category === "engine"),
    ).toHaveLength(9);
    expect(result!.placements.some((p) => p.category === "floor")).toBe(false);
    for (const p of result!.placements) {
      expect(p.meshes.length).toBeGreaterThan(0);
      expect(
        p.meshes.every(
          (m) =>
            !!m.material && m.isPickable && m.metadata.category === p.category,
        ),
      ).toBe(true);
      for (const mesh of p.meshes)
        for (const subMesh of mesh.subMeshes ?? [])
          expect(scene.materials, mesh.name).toContain(subMesh.getMaterial());
      const original = a.document.layout.assembly!.parts.find(
        (o) => o.id === p.node.metadata.partId,
      )!;
      expect(p.node.position.asArray()).toEqual([
        original.position[0],
        original.position[2],
        -original.position[1],
      ]);
    }
    const roofs = result!.placements.filter((p) => p.category === "roof");
    expect(roofs).toHaveLength(73);
    result!.setView(new Vector3(-10, 12, 10), true);
    expect(roofs.every((p) => !p.node.isEnabled())).toBe(true);
    result!.setView(new Vector3(-10, 12, 10), false);
    expect(roofs.every((p) => p.node.isEnabled())).toBe(true);
    // All four orbit quadrants retain complete walls in deck view.
    const walls = result!.placements.filter((p) => p.category !== "roof");
    for (const x of [-10, 10])
      for (const z of [-10, 10]) {
        result!.setView(new Vector3(x, 12, z), true);
        expect(walls.every((p) => p.node.isEnabled())).toBe(true);
        expect(walls.every((p) => p.meshes.every((m) => m.isEnabled()))).toBe(
          true,
        );
      }
    const materials = result!.meshes.map((m) => m.material);
    expect(
      materials.some(
        (m) => (m as any).alpha < 1 || (m as any).transparencyMode !== 0,
      ),
    ).toBe(true);
    result!.dispose();
    expect(
      materials.every((material) => !scene.materials.includes(material!)),
    ).toBe(true);
    expect(root.isDisposed()).toBe(false);
    expect(root.getChildMeshes()).toHaveLength(0);
  } finally {
    scene.dispose();
    e.dispose();
  }
}, 30000);
test("wrong catalog bytes reject before any native import", async () => {
  const e = new NullEngine(),
    scene = new Scene(e);
  scene.useRightHandedSystem = true;
  const root = new TransformNode("instance", scene);
  const c = candidate();
  c.document.layout.source = {
    blueprintId: "review",
    blueprintRevision: c.snapshot.sha256,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, text: async () => '{"assets":[]}' })),
  );
  try {
    await expect(
      loadConstructionAuthoredAssembly(scene, root, c.document, PIN.deckId),
    ).rejects.toThrow("catalog pin");
    expect(root.getChildMeshes()).toHaveLength(0);
  } finally {
    scene.dispose();
    e.dispose();
  }
});
