import { afterEach, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { createPrefabShipView } from "./ship-view";
import { getAuthoredAssetLightSources } from "../authored-asset-lighting";
const runtime = fileURLToPath(
  new URL("../../../../assets/runtime/", import.meta.url),
);
const engines: NullEngine[] = [];
afterEach(() => {
  for (const e of engines.splice(0)) e.dispose();
  vi.unstubAllGlobals();
});
function serveAssets(changed = false) {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      const name = String(url);
      requests.push(name);
      if (!name.startsWith("/assets/")) return { ok: false };
      const path = join(runtime, name.slice(8));
      if (!existsSync(path)) return { ok: false };
      const b = readFileSync(path);
      if (changed && name.endsWith("template-authored-r001/manifest.json"))
        b[0] ^= 1;
      return {
        ok: true,
        json: async () => JSON.parse(b.toString()),
        arrayBuffer: async () =>
          b.buffer.slice(b.byteOffset, b.byteOffset + b.length),
      };
    }),
  );
  const stub: object = new Proxy(() => stub, {
    get: (_, key) =>
      key === "then" ? undefined : key === Symbol.toPrimitive ? () => 0 : stub,
    apply: () => stub,
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return stub;
      }
    },
  );
  return requests;
}
function makeScene() {
  const e = new NullEngine();
  engines.push(e);
  const s = new Scene(e);
  s.useRightHandedSystem = true;
  return s;
}
it.each(["fed.s.wren", "au.m.crescent", "ind.m.mule"])(
  "admits real authored sources for %s and keeps view/lifecycle ownership coherent",
  async (id) => {
    const requested = serveAssets(),
      scene = makeScene(),
      parent = new TransformNode("placed-ship", scene);
    const v = await createPrefabShipView(scene, prefabById(id)!, {
      catalog: defaultPrefabComponentCatalog(),
      view: "deck",
      parent,
    });
    expect(v.metrics().visualRevision).toBe("template-authored-r001");
    expect(v.metrics().generatedTriangles).toBe(0);
    expect(requested.some((u) => u.includes("/ship-objects/"))).toBe(false);
    const native = v.root
      .getChildMeshes()
      .filter((m) => m.metadata?.authoredStudy);
    expect(native.length).toBeGreaterThan(0);
    expect(native.every((m) => m.metadata.roleRanges.length > 0)).toBe(true);
    expect(getAuthoredAssetLightSources(scene).length).toBeGreaterThan(0);
    expect(
      scene.lights.some((light) =>
        light.includedOnlyMeshes.some((m) =>
          m.metadata?.authoredStudy?.placementRanges.every(
            (r: { role: string }) => r.role === "floor",
          ),
        ),
      ),
    ).toBe(true);
    const active = native.filter((m) => m.isEnabled()),
      before = active.map((m) => m.computeWorldMatrix(true).getTranslation());
    parent.position.set(80, 0, -31);
    parent.rotation.y = Math.PI / 2;
    const matrix = parent.computeWorldMatrix(true);
    active.forEach((m, i) =>
      expect(
        Vector3.Distance(
          m.computeWorldMatrix(true).getTranslation(),
          Vector3.TransformCoordinates(before[i], matrix),
        ),
      ).toBeLessThan(1e-5),
    );
    v.setView("flight");
    expect(v.metrics().generatedTriangles).toBe(0);
    expect(
      native
        .filter((m) => m.isEnabled())
        .every((m) =>
          m.metadata.authoredStudy.placementRanges.every(
            (r: { role: string }) => r.role !== "wall" && r.role !== "post",
          ),
        ),
    ).toBe(true);
    v.setView("deck");
    expect(native.some((m) => m.isEnabled())).toBe(true);
    v.dispose();
    expect(scene.meshes.filter((m) => m.metadata?.authoredStudy)).toHaveLength(
      0,
    );
    expect(getAuthoredAssetLightSources(scene)).toHaveLength(0);
  },
  30000,
);
it("fails closed on changed manifest bytes before any native mesh request", async () => {
  const requested = serveAssets(true),
    scene = makeScene();
  await expect(
    createPrefabShipView(scene, prefabById("fed.s.wren")!, {
      catalog: defaultPrefabComponentCatalog(),
      view: "flight",
    }),
  ).rejects.toThrow("Changed authored template source");
  expect(requested.some((u) => u.endsWith(".glb"))).toBe(false);
  expect(scene.meshes.filter((m) => m.metadata?.authoredStudy)).toHaveLength(0);
  expect(scene.transformNodes).toHaveLength(0);
});

it("remote exterior admission loads no cabin cohort or attached light owners", async () => {
  const requested = serveAssets(),
    scene = makeScene();
  const view = await createPrefabShipView(scene, prefabById("fed.s.wren")!, {
    catalog: defaultPrefabComponentCatalog(),
    view: "flight",
    exteriorOnly: true,
  });
  expect(view.metrics().visualRevision).toBe("template-authored-r001");
  expect(getAuthoredAssetLightSources(scene)).toHaveLength(0);
  expect(requested.some((url) => url.includes("prop.props_"))).toBe(false);
  for (const mesh of view.root
    .getChildMeshes()
    .filter((m) => m.metadata?.authoredStudy)) {
    expect(
      mesh.metadata.authoredStudy.placementRanges.every(
        (r: { object: string; role: string }) =>
          !r.object.startsWith("furnishing:") &&
          r.role !== "floor" &&
          r.role !== "wall",
      ),
    ).toBe(true);
  }
  view.dispose();
  expect(scene.transformNodes).toHaveLength(0);
});
