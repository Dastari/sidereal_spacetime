import { expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import {
  equipmentPlacement,
  loadEquipmentPrototypes,
} from "./installed-equipment";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { PartAsset, PartPlacement } from "@sidereal/content/assembly";

test("installed models share geometry while retaining placement frames, identities and local lights", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    ship = new TransformNode("ship", scene),
    source = CreateBox("GEO-test", {}, scene);
  source.isVisible = false;
  const asset: PartAsset = {
    id: "part-test",
    label: "test",
    category: "equipment",
    nodes: ["GEO-test"],
    bounds: { min: [-0.5, -0.5, 0], max: [0.5, 0.5, 1] },
    lights: [
      {
        position: [0, 0, 1],
        direction: [0, 0, -1],
        color: [1, 1, 1],
        intensity: 1,
        range: 2,
        angle: 1,
      },
    ],
  };
  const p: PartPlacement = {
    id: "placed-one",
    assetId: asset.id,
    position: [4, 6, 0.2],
    rotation: Math.PI / 2,
    flipped: true,
    removedCells: [[0, 0, 0]],
  };
  const a = equipmentPlacement(scene, ship, asset, p, [source]),
    b = equipmentPlacement(scene, ship, asset, { ...p, id: "placed-two" }, [
      source,
    ]);
  expect(a.node.position.asArray()).toEqual([4, 0.2, -6]);
  expect(a.node.rotation.y).toBe(Math.PI / 2);
  expect(a.node.scaling.x).toBe(-1);
  expect(a.meshes[0]!.geometry).toBe(b.meshes[0]!.geometry);
  expect(a.meshes[0]).not.toBe(b.meshes[0]);
  expect(a.meshes[0]!.metadata.partId).toBe("placed-one");
  expect(b.node.metadata.partId).toBe("placed-two");
  expect(a.lighting.lights[0]!.canAffectMesh(a.meshes[0]!)).toBe(true);
  expect(a.lighting.lights[0]!.canAffectMesh(b.meshes[0]!)).toBe(false);
  expect(source.isVisible).toBe(false);
  expect(p.removedCells).toEqual([[0, 0, 0]]);
  scene.dispose();
  engine.dispose();
});

test("shared Blender kit imports once and resolves only each asset mesh group", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const square = CreateBox("GEO-floor-square", {}, scene),
    side = CreateBox("GEO-floor-square_primitive1", {}, scene),
    wedge = CreateBox("GEO-floor-wedge", {}, scene);
  const imported = { meshes: [square, side, wedge] } as unknown as Awaited<
    ReturnType<typeof SceneLoader.ImportMeshAsync>
  >;
  const spy = vi
    .spyOn(SceneLoader, "ImportMeshAsync")
    .mockResolvedValue(imported);
  const bytes = new Uint8Array(
    readFileSync("assets/runtime/assembly/floor/r002/kit.glb"),
  );
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const fetcher = vi.fn(async () => new Response(bytes.slice().buffer));
  vi.stubGlobal("fetch", fetcher);
  const make = (id: string, prefix: string): PartAsset => ({
    id,
    label: id,
    category: "floor",
    nodes: [],
    bounds: { min: [0, 0, 0], max: [2, 2, 0.1875] },
    visual: {
      url: "/review/floor-kit.glb",
      sha256,
      designId: "floor-kit",
      revision: 1,
      bounds: { min: [0, 0, 0], max: [2, 2, 0.1875] },
      damagePreview: "unsupported",
      nodePrefix: prefix,
    },
  });
  try {
    const models = await loadEquipmentPrototypes(scene, [
      make("square", "GEO-floor-square"),
      make("wedge", "GEO-floor-wedge"),
    ]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![2]).toEqual(bytes);
    expect(models.get("square")).toEqual([square, side]);
    expect(models.get("wedge")).toEqual([wedge]);
    expect(
      [square, side, wedge].every((m) => !m.isVisible && !m.isPickable),
    ).toBe(true);
    await expect(
      loadEquipmentPrototypes(scene, [make("missing", "GEO-missing")]),
    ).rejects.toThrow("Empty visual mesh group");
    const conflicting = make("wedge", "GEO-floor-wedge");
    conflicting.visual!.sha256 = "different-content";
    await expect(
      loadEquipmentPrototypes(scene, [
        make("square", "GEO-floor-square"),
        conflicting,
      ]),
    ).rejects.toThrow("Conflicting visual revisions");
    const tampered = bytes.slice();
    tampered[tampered.length - 1]! ^= 1;
    fetcher.mockResolvedValue(new Response(tampered.buffer));
    spy.mockClear();
    await expect(
      loadEquipmentPrototypes(scene, [make("square", "GEO-floor-square")]),
    ).rejects.toThrow("Native visual hash mismatch");
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
    vi.unstubAllGlobals();
    scene.dispose();
    engine.dispose();
  }
});
