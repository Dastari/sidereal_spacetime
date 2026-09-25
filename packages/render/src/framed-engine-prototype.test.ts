import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import "@babylonjs/loaders/glTF";
import type { PartCatalog } from "@sidereal/content/assembly";
import { framedEnginePrototype } from "./framed-engine-prototype";
import { framedWayfarerVisual } from "./framed-wayfarer-visuals";

test("a rigid native engine retains every triangle and material slot in one placed prototype", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const catalog = JSON.parse(
    readFileSync("assets/runtime/assembly/catalog-shipyard-r005.json", "utf8"),
  ) as PartCatalog;
  const asset = framedWayfarerVisual(
    catalog.assets.find((a) => a.id === "part-e8b51ac6443c73becfcb")!,
  );
  const bytes = new Uint8Array(
    readFileSync("assets/runtime/" + asset.visual!.url.slice(8)),
  );
  try {
    const loaded = await SceneLoader.LoadAssetContainerAsync(
      "",
      bytes,
      scene,
      undefined,
      ".glb",
    );
    const prefix = asset.visual!.nodePrefix;
    const sources = loaded.meshes.filter(
      (mesh): mesh is Mesh =>
        mesh instanceof Mesh &&
        mesh.getTotalVertices() > 0 &&
        (!prefix ||
          mesh.name === prefix ||
          mesh.name.startsWith(prefix + "_") ||
          mesh.name.startsWith(prefix + ".")),
    );
    const indices = sources.reduce((n, m) => n + m.getTotalIndices(), 0);
    const materials = new Set(sources.map((m) => m.material));
    const merged = framedEnginePrototype(asset, sources)!;
    expect(merged.getTotalIndices()).toBe(indices);
    expect(merged.getTotalVertices()).toBe(
      sources.reduce((n, m) => n + m.getTotalVertices(), 0),
    );
    expect(merged.material).toBeInstanceOf(MultiMaterial);
    expect(new Set((merged.material as MultiMaterial).subMaterials)).toEqual(
      materials,
    );
    expect(merged.isVerticesDataPresent("uv")).toBe(true);
    expect(merged.isVerticesDataPresent("normal")).toBe(true);
    expect(merged.subMeshes.reduce((n, sub) => n + sub.indexCount, 0)).toBe(
      indices,
    );
    merged.dispose(false, false);
    loaded.dispose();
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
