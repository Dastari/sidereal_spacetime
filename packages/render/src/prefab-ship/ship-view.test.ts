import { afterEach, expect, it, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Constants } from "@babylonjs/core/Engines/constants";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { createPrefabShipView } from "./ship-view";

const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
  vi.unstubAllGlobals();
});

it("prefab meshes cull back faces, not the outward faces", async () => {
  // Regression: prefab geometry is counter-clockwise seen from outside, while a new Mesh in a
  // right-handed scene treats clockwise as front. Every hull and component rendered inside-out.
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
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
  const view = await createPrefabShipView(scene, prefabById("fed.s.wren")!, {
    catalog: defaultPrefabComponentCatalog(),
    view: "flight",
    standinComponents: true,
  });
  const outwardWinding = (m: Mesh) => {
    const p = m.getVerticesData(VertexBuffer.PositionKind)!;
    const n = m.getVerticesData(VertexBuffer.NormalKind)!;
    const ix = m.getIndices()!;
    let ccw = 0;
    for (let t = 0; t < ix.length; t += 3) {
      const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]];
      const e1 = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
      const e2 = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
      const g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (g[0] * n[a * 3] + g[1] * n[a * 3 + 1] + g[2] * n[a * 3 + 2] > 0) ccw++;
    }
    return ccw / (ix.length / 3);
  };
  // Babylon's own box is clockwise-outward and renders correctly with its default orientation.
  const reference = CreateBox("reference", { size: 1 }, scene);
  expect(outwardWinding(reference)).toBe(0);
  expect(reference.sideOrientation).toBe(Constants.MATERIAL_ClockWiseSideOrientation);
  const meshes = view.root.getChildMeshes().filter((m): m is Mesh => m instanceof Mesh && m.getTotalIndices() > 0);
  expect(meshes.length).toBeGreaterThan(0);
  for (const m of meshes) {
    if (m.material?.backFaceCulling === false) continue;
    expect(outwardWinding(m), m.name).toBeGreaterThan(0.99);
    expect(m.sideOrientation, m.name).toBe(Constants.MATERIAL_CounterClockWiseSideOrientation);
  }
});
