import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import {
  createShipGlowOccluders,
  glowPlacementAtTriangle,
} from "./ship-glow-occluders";

test("glow batches retain triangle placement lookup, independent hidden decks, fading and moving roots", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("ship", scene),
    layer = new GlowLayer("glow", scene);
  const mat = new PBRMaterial("authored", scene);
  const a = CreateBox("arbitrary-one", {}, scene),
    b = CreateBox("arbitrary-two", {}, scene),
    roof = CreateBox("arbitrary-three", {}, scene);
  for (const [i, mesh] of [a, b, roof].entries()) {
    mesh.parent = root;
    mesh.material = mat;
    mesh.metadata = {
      partId: String(i),
      role: i === 2 ? "roof" : "wall",
      deckId: "lower",
    };
    mesh.position.x = i * 3;
  }
  const originalPositions = Array.from(a.getVerticesData("position")!);
  const batch = createShipGlowOccluders(scene, root, layer);
  try {
    batch.set([a, b, roof]);
    expect(batch.proxies).toHaveLength(2);
    const wall = batch.proxies.find(
      (p) => p.metadata.structuralRole === "wall",
    )!;
    expect(wall.metadata.trianglePlacements).toEqual([
      { start: 0, count: 12, placementId: "0", sourceMeshId: a.uniqueId },
      { start: 12, count: 12, placementId: "1", sourceMeshId: b.uniqueId },
    ]);
    expect(glowPlacementAtTriangle(wall, 11)).toBe("0");
    expect(glowPlacementAtTriangle(wall, 12)).toBe("1");
    expect(glowPlacementAtTriangle(wall, 24)).toBeUndefined();
    expect(wall.layerMask).toBe(0);
    expect(wall.isPickable).toBe(false);
    expect(wall.metadata.role).toBe("proxy");
    expect(a.material).toBe(mat);
    expect(a.getVerticesData("position")).toEqual(originalPositions);
    root.position.x = 20;
    batch.update();
    expect(batch.proxies).toContain(wall);
    b.setEnabled(false);
    batch.update();
    expect(
      batch.proxies
        .find((p) => p.metadata.structuralRole === "wall")!
        .getTotalIndices(),
    ).toBe(36);
    roof.setEnabled(false);
    batch.update();
    expect(batch.proxies).toHaveLength(1);
    a.visibility = 0.5;
    batch.update();
    expect(batch.proxies).toHaveLength(0);
    expect(batch.retained).toContain(a);
    a.visibility = 1;
    batch.update();
    expect(batch.proxies).toHaveLength(1);
    const animated = CreateBox("crew", {}, scene);
    animated.parent = root;
    animated.material = mat;
    animated.metadata = { role: "crew" };
    batch.set([a, b, roof, animated]);
    const staticProxy = batch.proxies[0];
    animated.position.x = 10;
    batch.update();
    expect(batch.proxies[0]).toBe(staticProxy);
    animated.setEnabled(false);
    batch.update();
    expect(batch.proxies[0]).toBe(staticProxy);
    const prior = batch.proxies[0];
    a.position.z = 4;
    batch.update();
    expect(batch.proxies[0]).not.toBe(prior);
    const positions = Array.from(a.getVerticesData("position")!);
    positions[0] += 1;
    a.setVerticesData("position", positions, true);
    batch.update();
    expect(batch.proxies[0].getVerticesData("position")![0]).toBe(positions[0]);
    a.dispose();
    batch.update();
    expect(batch.proxies).toHaveLength(0);
  } finally {
    batch.dispose();
    expect(layer.mainTexture.renderList).toBeNull();
    scene.dispose();
    engine.dispose();
  }
});

test("actual emission, alpha glass and missing placement identity stay on their original surface", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("ship", scene),
    layer = new GlowLayer("glow", scene),
    mat = new PBRMaterial("authored", scene);
  const meshes = [0, 1, 2].map((i) => {
    const m = CreateBox("item" + i, {}, scene);
    m.parent = root;
    m.material = mat;
    m.metadata = { role: "equipment", partId: String(i), deckId: "upper" };
    return m;
  });
  mat.emissiveColor = Color3.White();
  const batch = createShipGlowOccluders(scene, root, layer);
  try {
    batch.set(meshes);
    expect(batch.proxies).toHaveLength(0);
    expect(batch.retained).toHaveLength(3);
    mat.emissiveColor = Color3.Black();
    batch.update();
    expect(batch.proxies).toHaveLength(1);
    mat.alpha = 0.3;
    batch.update();
    expect(batch.proxies).toHaveLength(0);
    expect(batch.retained).toHaveLength(3);
    mat.alpha = 1;
    delete meshes[0].metadata.partId;
    meshes[1].metadata.deckId = "lower";
    batch.update();
    expect(batch.proxies).toHaveLength(2);
    expect(batch.retained).toContain(meshes[0]);
  } finally {
    batch.dispose();
    scene.dispose();
    engine.dispose();
  }
});
