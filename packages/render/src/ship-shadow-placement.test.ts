import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { createShadowPlacementCache } from "./ship-shadow-cache";

const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
});

function fixture() {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  const root = new TransformNode("moving-ship", scene);
  const placement = new TransformNode("stable-placement-id", scene);
  placement.parent = root;
  const wall = CreateBox("wall", {}, scene);
  wall.parent = placement;
  const floor = CreateBox("floor", {}, scene);
  floor.parent = placement;
  const meshes = [wall, floor];
  const cache = createShadowPlacementCache(root);
  expect(cache.update(meshes, 0)).toBe(true);
  expect(cache.update(meshes, 0)).toBe(false);
  return { scene, root, placement, wall, floor, meshes, cache };
}

test("local cache ignores shared ship motion, camera-origin rebasing and input ordering", () => {
  const { root, meshes, cache } = fixture();
  root.position.set(1e8, 0, -1e8);
  root.rotation.y = 1.3;
  root.computeWorldMatrix(true);
  expect(cache.update(meshes, 0)).toBe(false);
  root.position.set(0.25, 0, -0.125);
  root.computeWorldMatrix(true);
  expect(cache.update([...meshes].reverse(), 0)).toBe(false);
});

test("local ancestor translation, scale and both rotation representations invalidate once", () => {
  const { placement, meshes, cache } = fixture();
  const edits = [
    () => {
      placement.position.x += 0.125;
    },
    () => {
      placement.scaling.z = 0.75;
    },
    () => {
      placement.rotation.y = 0.5;
    },
    () => {
      placement.rotationQuaternion = Quaternion.Identity();
    },
    () => {
      placement.rotationQuaternion!.w = 0.95;
    },
    () => {
      placement.rotationQuaternion = null;
    },
    () => {
      placement.setEnabled(false);
    },
    () => {
      placement.setEnabled(true);
    },
  ];
  for (const edit of edits) {
    edit();
    expect(cache.update(meshes, 0)).toBe(true);
    expect(cache.update(meshes, 0)).toBe(false);
  }
});

test("visibility, geometry revisions, equal-bounds geometry replacement and bounds edits invalidate", () => {
  const { wall, meshes, cache } = fixture();
  const edits = [
    () => {
      wall.isVisible = false;
    },
    () => {
      wall.isVisible = true;
    },
    () => {
      wall.visibility = 0.5;
    },
    () => {
      wall.setEnabled(false);
    },
    () => {
      wall.setEnabled(true);
    },
    () => {
      wall.geometry!.copy("replacement-geometry").applyToMesh(wall);
    },
    () => {
      wall.getBoundingInfo().boundingBox.minimum.x -= 0.1;
    },
  ];
  for (const edit of edits) {
    edit();
    expect(cache.update(meshes, 0)).toBe(true);
    expect(cache.update(meshes, 0)).toBe(false);
  }
  expect(cache.update(meshes, 1)).toBe(true);
  expect(cache.update(meshes, 1)).toBe(false);
});

test("reparenting, removal, replacement and disposal clear stale node membership", () => {
  const { scene, root, placement, wall, floor, meshes, cache } = fixture();
  const nextPlacement = new TransformNode("replacement-placement", scene);
  nextPlacement.parent = root;
  wall.parent = nextPlacement;
  expect(cache.update(meshes, 0)).toBe(true);
  expect(cache.update(meshes, 0)).toBe(false);
  expect(cache.update([wall], 0)).toBe(true);
  placement.position.y = 1;
  expect(cache.update([wall], 0)).toBe(false);
  // Same size collection with a different identity must still invalidate.
  expect(cache.update([floor], 0)).toBe(true);
  floor.dispose();
  expect(cache.update([floor], 0)).toBe(true);
  expect(cache.update([], 0)).toBe(false);
  cache.clear();
  expect(cache.update([], 0)).toBe(true);
});

test("caster removal invalidates when its transform remains a retained caster's ancestor", () => {
  const { wall, floor, cache } = fixture();
  floor.parent = wall;
  expect(cache.update([wall, floor], 0)).toBe(true);
  expect(cache.update([wall, floor], 0)).toBe(false);
  expect(cache.update([floor], 0)).toBe(true);
  expect(cache.update([floor], 0)).toBe(false);
  expect(cache.update([wall, floor], 0)).toBe(true);
  expect(cache.update([wall, floor, floor], 0)).toBe(false);
});

test("disposed duplicate casters are removed without reading their geometry bounds", () => {
  const { wall, floor, cache } = fixture();
  wall.dispose();
  const bounds = vi.spyOn(wall, "getBoundingInfo").mockImplementation(() => {
    throw new Error("disposed geometry must not be read");
  });
  expect(cache.update([wall, floor, wall], 0)).toBe(true);
  expect(cache.update([wall, floor], 0)).toBe(false);
  expect(bounds).not.toHaveBeenCalled();
});
