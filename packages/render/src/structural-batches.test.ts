import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Ray } from "@babylonjs/core/Culling/ray";
import {
  mergeStructuralPlacements,
  placementAtFace,
} from "./structural-batches";
import { createSelectionSilhouette } from "./selection-silhouette";

function metadata(partId: string, deckId = "main") {
  return {
    partId,
    deckId,
    instanceId: "ship",
    role: "floor",
    category: "floor",
    visibilityGroup: "deck",
    lightGroup: "star-fill",
  };
}

test("structural batches preserve material splits, reflected surfaces and every triangle identity", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("ship", scene);
  const red = new PBRMaterial("red", scene),
    blue = new PBRMaterial("blue", scene),
    multi = new MultiMaterial("authored", scene);
  red.roughness = 0.23;
  blue.metallic = 0.7;
  multi.subMaterials = [red, blue];
  const boxes = [0, 1].map((i) => {
    const m = CreateBox("authored", {}, scene);
    m.parent = root;
    m.position.x = i * 4;
    m.rotation.y = 0.3 * i;
    m.scaling.set(i ? -2 : 1, 1.5, 0.75);
    m.material = multi;
    m.metadata = metadata("part-" + i);
    m.receiveShadows = true;
    m.subMeshes = [];
    new SubMesh(0, 0, m.getTotalVertices(), 0, 18, m);
    new SubMesh(1, 0, m.getTotalVertices(), 18, 18, m);
    const tangents = Array.from({ length: m.getTotalVertices() }, () => [
      1, 0, 0, 1,
    ]).flat();
    m.setVerticesData("tangent", tangents);
    return m;
  });
  const positions = boxes.map((m) => {
    const world = m.computeWorldMatrix(true);
    return Array.from({ length: m.getTotalVertices() }, (_, i) =>
      Vector3.TransformCoordinates(
        Vector3.FromArray(m.getVerticesData("position")!, i * 3),
        world,
      ).asArray(),
    );
  });
  const result = mergeStructuralPlacements(root, boxes);
  expect(result.batches).toHaveLength(2);
  expect(boxes.every((m) => m.isDisposed())).toBe(true);
  expect(result.batches.map((m) => m.material)).toEqual([red, blue]);
  expect(red.roughness).toBe(0.23);
  expect(blue.metallic).toBe(0.7);
  for (const mesh of result.batches) {
    expect(mesh.getTotalIndices()).toBe(36);
    expect(mesh.getVerticesData("uv")).toHaveLength(96);
    expect(mesh.metadata.role).toBe("floor");
    expect(mesh.metadata.materialRole).toBe("opaque");
    expect(placementAtFace(mesh, 0)).toBe("part-0");
    expect(placementAtFace(mesh, 5)).toBe("part-0");
    expect(placementAtFace(mesh, 6)).toBe("part-1");
    expect(placementAtFace(mesh, 11)).toBe("part-1");
    expect(placementAtFace(mesh, 12)).toBeUndefined();
    const actual = mesh.getVerticesData("position")!;
    positions
      .flat()
      .forEach((p, i) =>
        p.forEach((v, axis) => expect(actual[i * 3 + axis]).toBeCloseTo(v, 5)),
      );
    expect(mesh.getVerticesData("tangent")![24 * 4 + 3]).toBe(-1);
  }
  scene.dispose();
  engine.dispose();
});

test("deck/light policies remain separate and a selected batch renders only its placement triangles", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("ship", scene);
  const camera = new FreeCamera("camera", new Vector3(0, 0, -10), scene);
  camera.setTarget(Vector3.Zero());
  const material = new PBRMaterial("shared", scene);
  const meshes = [0, 1, 2].map((i) => {
    const m = CreateBox("part", {}, scene);
    m.position.x = i * 3;
    m.parent = root;
    m.material = material;
    m.metadata = metadata("part-" + i, i === 2 ? "upper" : "main");
    return m;
  });
  const result = mergeStructuralPlacements(root, meshes);
  expect(result.batches).toHaveLength(2);
  const main = result.batches.find((m) => m.metadata.deckId === "main")!;
  scene.render();
  const pick = scene.pickWithRay(
    new Ray(new Vector3(0, 0, -5), new Vector3(0, 0, 1)),
  )!;
  expect(placementAtFace(pick.pickedMesh!, pick.faceId)).toBe("part-0");
  const selection = createSelectionSilhouette(scene, result.meshes, "part-1");
  scene.render();
  const mask = scene.customRenderTargets.find(
    (t) => t.name === "object-selection-mask",
  )!;
  const proxy = mask.renderList!.find(
    (m) =>
      m.metadata?.role === "proxy" &&
      m.metadata.partId === "part-1" &&
      m.isEnabled(),
  )!;
  expect(proxy.getTotalIndices()).toBe(36);
  expect(main.getTotalIndices()).toBe(72);
  selection.select("part-0");
  expect(main.getTotalIndices()).toBe(72);
  main.setEnabled(false);
  scene.render();
  expect(proxy.isEnabled()).toBe(false);
  expect(
    result.batches.find((m) => m.metadata.deckId === "upper")!.isEnabled(),
  ).toBe(true);
  selection.dispose();
  expect(scene.meshes.filter((m) => m.metadata?.role === "proxy")).toHaveLength(
    0,
  );
  scene.dispose();
  engine.dispose();
});
