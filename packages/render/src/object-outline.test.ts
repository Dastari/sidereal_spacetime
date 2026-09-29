import { afterEach, describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createObjectOutline } from "./object-outline";
import { objectProxyMesh, outlineExclusions } from "./prefab-ship-interaction";

const cleanup: (() => void)[] = [];
afterEach(() => {
  while (cleanup.length) cleanup.pop()!();
});
function fixture() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  new ArcRotateCamera("c", 0, 1, 10, Vector3.Zero(), scene);
  cleanup.push(() => (scene.dispose(), engine.dispose()));
  return scene;
}
/** One batched mesh holding two unit quads: one at x 0..1, one at x 3..4 (both y = 0.5). */
function batch(scene: Scene, parent: TransformNode) {
  const mesh = new Mesh("batch", scene);
  const data = new VertexData();
  data.positions = [
    0, 0.5, 0, 1, 0.5, 0, 1, 0.5, 1, 0, 0.5, 1, 3, 0.5, 0, 4, 0.5, 0, 4, 0.5, 1,
    3, 0.5, 1,
  ];
  data.indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7];
  data.applyToMesh(mesh);
  mesh.parent = parent;
  return mesh;
}

describe("object silhouette proxy", () => {
  it("cuts only the picked object's triangles out of a batched ship mesh", () => {
    const scene = fixture();
    const ship = new TransformNode("ship", scene);
    ship.position.set(10, 0, 0);
    const view = new TransformNode("prefab-ship:test", scene);
    view.parent = ship;
    batch(scene, view);
    const proxy = objectProxyMesh(
      scene,
      ship,
      view,
      { min: new Vector3(-0.1, 0, -0.1), max: new Vector3(1.1, 1, 1.1) },
      "proxy",
    );
    expect(proxy.getTotalIndices()).toBe(6);
    expect(proxy.layerMask).toBe(0);
    const xs = proxy.getVerticesData("position")!.filter((_, i) => i % 3 === 0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1);
  });

  it("keeps only the object's source role inside a batch that merges roles", () => {
    const scene = fixture();
    const ship = new TransformNode("ship", scene);
    const view = new TransformNode("prefab-ship:test", scene);
    view.parent = ship;
    const mesh = batch(scene, view);
    mesh.metadata = {
      role: "hull",
      roleRanges: [
        { role: "equipment", first: 0, count: 6 },
        { role: "hull", first: 6, count: 6 },
      ],
    };
    const box = { min: new Vector3(-1, 0, -1), max: new Vector3(5, 1, 2) };
    const all = objectProxyMesh(scene, ship, view, box, "all");
    const parts = objectProxyMesh(
      scene,
      ship,
      view,
      box,
      "parts",
      new Set(["equipment"]),
    );
    expect(all.getTotalIndices()).toBe(12);
    expect(parts.getTotalIndices()).toBe(6);
  });

  it("never outlines a neighbour whose geometry lies inside a larger object's box", () => {
    const scene = fixture();
    const ship = new TransformNode("ship", scene);
    const view = new TransformNode("prefab-ship:test", scene);
    view.parent = ship;
    batch(scene, view);
    // A large object (e.g. a module) whose box also encloses a small locker at x 3..4.
    const big = {
      min: new Vector3(-0.1, 0, -0.1),
      max: new Vector3(4.1, 1, 1.1),
    };
    const locker = {
      min: new Vector3(2.9, 0, -0.1),
      max: new Vector3(4.1, 1, 1.1),
    };
    const objects = [
      { id: "module", box: big },
      { id: "locker", box: locker },
    ];
    expect(outlineExclusions(objects, "module")).toEqual([locker]);
    expect(outlineExclusions(objects, "locker")).toEqual([]);
    const proxy = objectProxyMesh(
      scene,
      ship,
      view,
      big,
      "proxy",
      undefined,
      outlineExclusions(objects, "module"),
    );
    expect(proxy.getTotalIndices()).toBe(6);
    const xs = proxy.getVerticesData("position")!.filter((_, i) => i % 3 === 0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1);
  });

  it("falls back to the object's box when the view has no geometry there", () => {
    const scene = fixture();
    const ship = new TransformNode("ship", scene);
    const proxy = objectProxyMesh(
      scene,
      ship,
      undefined,
      { min: new Vector3(0, 0, 0), max: new Vector3(1, 2, 1) },
      "proxy",
    );
    expect(proxy.getTotalIndices()).toBeGreaterThan(0);
    expect(proxy.position.y).toBeCloseTo(1, 6);
  });
});

describe("object outline", () => {
  it("renders its mask only while something is hovered or selected", () => {
    const scene = fixture();
    const outline = createObjectOutline(scene);
    const a = new Mesh("a", scene);
    const b = new Mesh("b", scene);
    expect(scene.customRenderTargets.length).toBe(0);
    outline.set("hover", a);
    expect(outline.active).toBe(true);
    expect(scene.customRenderTargets.length).toBe(1);
    outline.set("selected", b);
    outline.set("hover", undefined);
    expect(scene.customRenderTargets.length).toBe(1);
    outline.set("selected", undefined);
    expect(outline.active).toBe(false);
    expect(scene.customRenderTargets.length).toBe(0);
    outline.dispose();
  });
});
