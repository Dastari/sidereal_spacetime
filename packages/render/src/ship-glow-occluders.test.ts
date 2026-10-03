import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { Constants } from "@babylonjs/core/Engines/constants";
import { createGlowOccluders, setGlowOccludingActors } from "./glow-occluders";
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

test("authored ranges batch exact transformed triangles while receiver cohorts and malformed identity remain independent", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("ship", scene),
    layer = new GlowLayer("glow", scene),
    material = new PBRMaterial("source-finish", scene);
  material.backFaceCulling = false;
  material.cullBackFaces = false;
  material.depthFunction = Constants.LEQUAL;
  const meshes = ["a", "b", "flight", "invalid"].map((id, i) => {
    const mesh = CreateBox(id, {}, scene);
    mesh.parent = root;
    mesh.material = material;
    mesh.position.x = i * 3;
    mesh.metadata = {
      role: "hull",
      authoredStudy: {
        materialKey: "source-palette-primary",
        receiverRegion: i === 2 ? "exterior/flight" : "own/rest",
        placementRanges: [0, 1].map((n) => ({
          object: `${id}-${n}`,
          piece: "hull.panel",
          role: "hull-bay",
          material: "primary",
          indexStart: n * 18,
          indexCount: 18,
        })),
      },
    };
    return mesh;
  });
  meshes[1].scaling.x = -1;
  meshes[3].metadata.authoredStudy.placementRanges[1].indexStart = 17;
  const originalPositions = meshes.map((m) =>
    Array.from(m.getVerticesData("position")!),
  );
  const originalIndices = meshes.map((m) => Array.from(m.getIndices()!));
  const batch = createShipGlowOccluders(scene, root, layer);
  try {
    batch.set(meshes);
    expect(batch.proxies).toHaveLength(2);
    expect(batch.retained).toEqual([meshes[3]]);
    const deck = batch.proxies.find((m) => m.getTotalIndices() === 72)!;
    expect(
      [0, 5, 6, 11, 12, 17, 18, 23].map((i) =>
        glowPlacementAtTriangle(deck, i),
      ),
    ).toEqual(["a-0", "a-0", "a-1", "a-1", "b-0", "b-0", "b-1", "b-1"]);
    const expectedPositions: number[] = [],
      expectedIndices: number[] = [];
    for (const mesh of meshes.slice(0, 2)) {
      const part = new VertexData();
      part.positions = Array.from(mesh.getVerticesData("position")!);
      part.indices = Array.from(mesh.getIndices()!);
      root.computeWorldMatrix(true);
      part.transform(
        mesh
          .computeWorldMatrix(true)
          .multiply(Matrix.Invert(root.getWorldMatrix())),
      );
      const offset = expectedPositions.length / 3;
      expectedPositions.push(...part.positions);
      expectedIndices.push(...part.indices.map((i) => i + offset));
    }
    expect(Array.from(deck.getVerticesData("position")!)).toEqual(
      expectedPositions,
    );
    expect(Array.from(deck.getIndices()!)).toEqual(expectedIndices);
    expect(deck.material!.backFaceCulling).toBe(material.backFaceCulling);
    expect(deck.material!.cullBackFaces).toBe(material.cullBackFaces);
    expect(deck.material!.depthFunction).toBe(material.depthFunction);
    expect(
      meshes.map((m) => Array.from(m.getVerticesData("position")!)),
    ).toEqual(originalPositions);
    expect(meshes.map((m) => Array.from(m.getIndices()!))).toEqual(
      originalIndices,
    );
    expect(meshes.every((m) => m.material === material)).toBe(true);
    meshes[2].setEnabled(false);
    batch.update();
    expect(batch.proxies).toHaveLength(1);
    meshes[0].setEnabled(false);
    meshes[1].setEnabled(false);
    meshes[2].setEnabled(true);
    batch.update();
    expect(batch.proxies).toHaveLength(1);
    expect(batch.proxies[0].getTotalIndices()).toBe(36);
    expect(glowPlacementAtTriangle(batch.proxies[0], 0)).toBe("flight-0");
  } finally {
    batch.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("custom mask retains late registered actors and emitters, suppresses only batched originals and restores prior ownership", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("ship", scene),
    layer = new GlowLayer("glow", scene),
    material = new PBRMaterial("source", scene),
    wall = CreateBox("wall", {}, scene);
  wall.parent = root;
  wall.material = material;
  wall.metadata = { role: "wall", partId: "wall" };
  const priorList = [wall];
  layer.mainTexture.renderList = priorList;
  const priorCustom = () => null;
  layer.mainTexture.getCustomRenderList = priorCustom;
  const black = createGlowOccluders(layer),
    batch = createShipGlowOccluders(scene, root, layer);
  black.set([wall]);
  batch.set([wall]);
  const actor = CreateBox("late-crew", {}, scene),
    jet = CreateBox("late-exhaust", {}, scene),
    unrelated = CreateBox("unrelated", {}, scene);
  const actorMaterial = new PBRMaterial("crew-emission", scene);
  actorMaterial.emissiveColor = Color3.White();
  actor.material = actorMaterial;
  jet.material = actorMaterial;
  unrelated.material = material;
  setGlowOccludingActors(scene, [actor]);
  layer.addIncludedOnlyMesh(jet);
  const active = scene.getActiveMeshes();
  active.push(wall);
  active.push(actor);
  active.push(jet);
  active.push(unrelated);
  try {
    const list = layer.mainTexture.getCustomRenderList!(0, null, 0)!;
    expect(list).toContain(actor);
    expect(list).toContain(jet);
    expect(list).toContain(batch.proxies[0]);
    expect(list).not.toContain(wall);
    expect(list).not.toContain(unrelated);
    const color = new Color4();
    layer.customEmissiveColorSelector!(
      actor,
      actor.subMeshes[0],
      actorMaterial,
      color,
    );
    expect(color.asArray()).toEqual([0, 0, 0, 1]);
    layer.customEmissiveColorSelector!(
      jet,
      jet.subMeshes[0],
      actorMaterial,
      color,
    );
    expect(color.asArray()).toEqual([1, 1, 1, 1]);
    const proxy = batch.proxies[0];
    batch.dispose();
    expect(proxy.isDisposed()).toBe(true);
    expect(layer.mainTexture.renderList).toBe(priorList);
    expect(layer.mainTexture.getCustomRenderList).toBe(priorCustom);
    expect(layer.hasMesh(actor)).toBe(true);
    expect(layer.hasMesh(jet)).toBe(true);
  } finally {
    batch.dispose();
    black.dispose();
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
