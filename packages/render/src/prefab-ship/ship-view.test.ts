import { afterEach, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { createPrefabShipView } from "./ship-view";

const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.unstubAllGlobals();
});

it("batched meshes follow a moving ship root", async () => {
  // No GLBs: generated hull/floor geometry alone is enough to produce batched meshes.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
  // Headless 2D canvas: every context method is a no-op that returns a chainable stub.
  const stub: object = new Proxy(() => stub, {
    get: (_t, key) => (key === "then" ? undefined : key === Symbol.toPrimitive ? () => 0 : stub),
    apply: () => stub,
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(public width: number, public height: number) {}
      getContext() {
        return stub;
      }
    },
  );
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const shipRoot = new TransformNode("ship-root", scene);
  const view = await createPrefabShipView(scene, prefabById("fed.s.wren")!, {
    catalog: defaultPrefabComponentCatalog(),
    view: "flight",
    parent: shipRoot,
    standinComponents: true,
  });
  const batched = view.root.getChildMeshes().filter((m) => m.name.includes(":batch:"));
  expect(batched.length).toBeGreaterThan(0);
  const before = batched.map((m) => m.computeWorldMatrix(true).getTranslation());

  shipRoot.position.set(120, 0, -45);
  shipRoot.rotation.y = Math.PI / 2;

  const pivot = shipRoot.computeWorldMatrix(true);
  batched.forEach((m, i) => {
    const expected = Vector3.TransformCoordinates(before[i], pivot);
    const actual = m.computeWorldMatrix(true).getTranslation();
    expect(Vector3.Distance(actual, expected)).toBeLessThan(1e-6);
  });

  view.setView("deck");
  expect(view.root.getChildMeshes().some((m) => m.name.includes(":batch:deck") && m.isEnabled())).toBe(true);
  expect(view.root.getChildMeshes().some((m) => m.name.includes(":batch:flight") && m.isEnabled())).toBe(false);
});
