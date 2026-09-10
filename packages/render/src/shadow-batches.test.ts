import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { createShadowBatches } from "./shadow-batches";

test("shadow batches retain map membership, deck boundaries and placement lookup", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const root = new TransformNode("ship", scene), material = new StandardMaterial("opaque", scene);
  const sources = ["a", "b", "c"].map((partId, i) => {
    const mesh = CreateBox("opaque-proxy", {}, scene);
    mesh.parent = root; mesh.position.x = i * 2; mesh.material = material;
    mesh.metadata = { role: "proxy", shadowRole: "roof", shadowCabin: false,
      deckId: i === 2 ? "upper" : "main", partId };
    return mesh;
  });
  const sun = createShadowBatches(root), spot = createShadowBatches(root);
  const first = sun.rebuild(sources);
  expect(first).toHaveLength(2);
  expect(first[0].metadata.trianglePlacements).toEqual([
    { start: 0, count: 12, placementId: "a" },
    { start: 12, count: 12, placementId: "b" },
  ]);
  const local = spot.rebuild([sources[1]]);
  expect(local[0].metadata.trianglePlacements[0].placementId).toBe("b");
  expect(local[0].material).toBe(material);
  expect(local[0].metadata.role).toBe("proxy");
  sources[1].setEnabled(false);
  const second = sun.rebuild(sources);
  expect(second[0].metadata.trianglePlacements).toHaveLength(1);
  expect(first.every(m => m.isDisposed())).toBe(true);
  expect(sources.every(m => !m.isDisposed())).toBe(true);
  sources[0].metadata.deckId = undefined;
  expect(sun.rebuild([sources[0]])).toEqual([sources[0]]);
  sun.dispose(); spot.dispose();
  expect(second.every(m => m.isDisposed())).toBe(true);
  expect(scene.materials).toContain(material);
  scene.dispose(); engine.dispose();
});
