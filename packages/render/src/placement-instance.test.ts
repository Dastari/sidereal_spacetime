import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { equipmentPlacement } from "./installed-equipment";
import { canInstancePlacement } from "./placement-instance";
import { createObjectPresentation } from "./object-presentation";
import type { PartAsset } from "../../content/src/assembly";
import manifest from "./instanceable-assets.json";

test("pinned opaque kits instance with independent identity, transforms and selection masks", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("ship", scene);
  const camera = new FreeCamera("camera", new Vector3(0, 0, -10), scene);
  camera.setTarget(Vector3.Zero());
  const source = CreateBox("authored", {}, scene);
  source.isVisible = false;
  source.material = new PBRMaterial("authored", scene);
  const entry = manifest.entries.find((e) => e.role === "cargo")!;
  const asset = {
    id: entry.assetId,
    category: "cargo",
    visual: { sha256: entry.visualSha256 },
  } as PartAsset;
  const a = equipmentPlacement(
    scene,
    root,
    asset,
    {
      id: "a",
      assetId: asset.id,
      position: [0, 0, 0],
      rotation: 0,
      flipped: false,
      removedCells: [],
    },
    [source],
  );
  const b = equipmentPlacement(
    scene,
    root,
    asset,
    {
      id: "b",
      assetId: asset.id,
      position: [3, 0, 0],
      rotation: 0.4,
      flipped: true,
      removedCells: [],
    },
    [source],
  );
  expect(a.meshes[0]).toBeInstanceOf(InstancedMesh);
  expect(b.meshes[0].material).toBe(source.material);
  expect(a.meshes[0].metadata.partId).toBe("a");
  expect(b.meshes[0].metadata.partId).toBe("b");
  expect(b.meshes[0].metadata.role).toBe("cargo");
  expect(b.meshes[0].computeWorldMatrix(true).determinant()).toBeLessThan(0);
  b.node.setEnabled(false);
  expect(a.meshes[0].isEnabled()).toBe(true);
  const visual = createObjectPresentation(
    new EventTarget() as HTMLCanvasElement,
    scene,
    [...a.meshes, ...b.meshes],
    [a, b],
    () => false,
  );
  visual.select("a");
  scene.render();
  const mask = scene.customRenderTargets.find(
    (t) => t.name === "object-selection-mask",
  )!;
  expect(mask).toBeTruthy();
  const selected = mask.renderList!.find((m) => m.metadata?.partId === "a")!;
  expect(selected.metadata.role).toBe("proxy");
  expect(selected.computeWorldMatrix(true).asArray()).toEqual(
    a.meshes[0].getWorldMatrix().asArray(),
  );
  expect(
    mask.renderList!.find((m) => m.metadata?.partId === "b")!.isEnabled(),
  ).toBe(false);
  visual.dispose();
  expect(
    scene.meshes.filter((m) => m.name === "selection-instance-mask"),
  ).toHaveLength(0);
  // New art, emission, alpha and fixture-local lighting must opt in separately.
  expect(
    canInstancePlacement(
      { ...asset, visual: { ...asset.visual!, sha256: "changed" } },
      source,
    ),
  ).toBe(false);
  (source.material as PBRMaterial).emissiveColor.r = 1;
  expect(canInstancePlacement(asset, source)).toBe(false);
  (source.material as PBRMaterial).emissiveColor.r = 0;
  source.material.alpha = 0.5;
  expect(canInstancePlacement(asset, source)).toBe(false);
  const multi = new MultiMaterial("mixed", scene);
  multi.subMaterials = [source.material];
  source.material = multi;
  expect(canInstancePlacement(asset, source)).toBe(false);
  scene.dispose();
  engine.dispose();
});
