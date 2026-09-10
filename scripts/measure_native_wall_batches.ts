import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import "@babylonjs/loaders/glTF";
import { createNativeWallBatches } from "../packages/render/src/native-wall-batches";

const inputPath =
  "docs/releases/usable-wall-readiness-20260910/geometry-comparison.json";
const sha = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
const inputBytes = readFileSync(inputPath),
  input = JSON.parse(inputBytes.toString()) as {
    canonicalSha256: string;
    entries: {
      sourcePlacedId: string;
      currentCategory: "wall" | "roof";
      oldNativeMeshGroups: number;
      oldNativeSource: {
        path: string;
        sha256: string;
        nodePrefix: string | null;
      };
      candidateNativeSource: { path: string; sha256: string };
      proposedCatalogBinding: { id: string };
    }[];
  };
const engine = new NullEngine(),
  scene = new Scene(engine),
  parent = new TransformNode("review-ship", scene);
scene.useRightHandedSystem = true;
const libraries = new Map<string, AssetContainer>();
const oldLibraries = new Map<string, AssetContainer>();
const rows = [];
try {
  for (const e of input.entries) {
    let oldLibrary = oldLibraries.get(e.oldNativeSource.path);
    if (!oldLibrary) {
      const bytes = readFileSync(e.oldNativeSource.path);
      if (sha(bytes) !== e.oldNativeSource.sha256)
        throw Error("Old native hash changed");
      oldLibrary = await SceneLoader.LoadAssetContainerAsync(
        "",
        new Uint8Array(bytes),
        scene,
        undefined,
        ".glb",
      );
      oldLibraries.set(e.oldNativeSource.path, oldLibrary);
    }
    const oldMeshes = oldLibrary.meshes.filter(
      (m): m is Mesh =>
        m instanceof Mesh &&
        m.getTotalVertices() > 0 &&
        (!e.oldNativeSource.nodePrefix ||
          m.name.startsWith(e.oldNativeSource.nodePrefix)),
    );
    const pin = e.candidateNativeSource;
    let library = libraries.get(pin.path);
    if (!library) {
      const bytes = readFileSync(pin.path);
      if (sha(bytes) !== pin.sha256)
        throw Error("Native hash changed " + pin.path);
      library = await SceneLoader.LoadAssetContainerAsync(
        "",
        new Uint8Array(bytes),
        scene,
        undefined,
        ".glb",
      );
      libraries.set(pin.path, library);
    }
    const sources = library.meshes.filter(
      (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
    );
    const before = sources.map((m) => ({
      material: m.material,
      positions: sha(JSON.stringify(m.getVerticesData("position"))),
      normals: sha(JSON.stringify(m.getVerticesData("normal"))),
      uv: sha(JSON.stringify(m.getVerticesData("uv"))),
      tangents: sha(JSON.stringify(m.getVerticesData("tangent"))),
    }));
    const batches = createNativeWallBatches(
      scene,
      parent,
      {
        partId: e.sourcePlacedId,
        assetId: e.proposedCatalogBinding.id,
        category: e.currentCategory,
      },
      sources.map((source) => ({
        source,
        matrix: source.computeWorldMatrix(true).clone(),
      })),
    );
    const perMaterial = (meshes: Mesh[]) => {
      const counts = new Map<
        number,
        {
          name: string;
          triangles: number;
          vertices: number;
          layouts: Set<string>;
        }
      >();
      for (const m of meshes) {
        const key = m.material!.uniqueId,
          row = counts.get(key) ?? {
            name: m.material!.name,
            triangles: 0,
            vertices: 0,
            layouts: new Set<string>(),
          };
        row.triangles += m.getTotalIndices() / 3;
        row.vertices += m.getTotalVertices();
        row.layouts.add(m.getVerticesDataKinds().sort().join(","));
        counts.set(key, row);
      }
      return [...counts]
        .map(([materialIdentity, v]) => ({
          materialIdentity,
          ...v,
          layouts: [...v.layouts].sort(),
        }))
        .sort((a, b) => a.materialIdentity - b.materialIdentity);
    };
    const beforeMaterials = perMaterial(sources),
      afterMaterials = perMaterial(batches.meshes);
    if (JSON.stringify(beforeMaterials) !== JSON.stringify(afterMaterials))
      throw Error(
        "Native material/geometry accounting changed " + e.sourcePlacedId,
      );
    if (
      batches.meshes.some(
        (m) => m.metadata.partId !== e.sourcePlacedId || !m.isPickable,
      )
    )
      throw Error("Placement identity lost");
    batches.dispose();
    if (
      sources.some(
        (m, i) =>
          m.isDisposed() ||
          m.material !== before[i].material ||
          sha(JSON.stringify(m.getVerticesData("position"))) !==
            before[i].positions ||
          sha(JSON.stringify(m.getVerticesData("normal"))) !==
            before[i].normals ||
          sha(JSON.stringify(m.getVerticesData("uv"))) !== before[i].uv ||
          sha(JSON.stringify(m.getVerticesData("tangent"))) !==
            before[i].tangents,
      )
    )
      throw Error("Native source mutated");
    rows.push({
      sourcePlacedId: e.sourcePlacedId,
      source: pin,
      category: e.currentCategory,
      oldNativeGroups: e.oldNativeMeshGroups,
      oldLoadedMeshes: oldMeshes.length,
      oldSubMeshes: oldMeshes.reduce((n, m) => n + m.subMeshes.length, 0),
      oldTriangles: oldMeshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0),
      ...batches.metrics,
      materials: beforeMaterials,
      sourceBuffersUnchanged: true,
      independentDispose: true,
    });
  }
  const result = {
    schema: "sidereal.native-wall-batching.v1",
    status:
      "actual Babylon NullEngine loader and per-placement helper; GPU comparison pending; not installed",
    sourceComparison: { path: inputPath, sha256: sha(inputBytes) },
    canonicalSha256: input.canonicalSha256,
    uniqueNativeFiles: libraries.size,
    placements: rows.length,
    summary: {
      oldNativeGroups: rows.reduce((n, r) => n + r.oldNativeGroups, 0),
      oldLoadedMeshes: rows.reduce((n, r) => n + r.oldLoadedMeshes, 0),
      oldSubMeshes: rows.reduce((n, r) => n + r.oldSubMeshes, 0),
      oldTriangles: rows.reduce((n, r) => n + r.oldTriangles, 0),
      candidateGroups: rows.reduce((n, r) => n + r.inputGroups, 0),
      batchedGroups: rows.reduce((n, r) => n + r.outputGroups, 0),
      triangles: rows.reduce((n, r) => n + r.triangles, 0),
      orderedPrimitives: rows.reduce((n, r) => n + r.orderedPrimitives, 0),
      allMaterialIdentitiesAndPerMaterialTrianglesVerticesLayoutsPreserved: true,
      allSourceBuffersUnchanged: true,
      allIndependentDisposalPassed: true,
    },
    rows,
  };
  writeFileSync(
    "docs/releases/usable-wall-readiness-20260910/batching-comparison.json",
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result.summary));
} finally {
  for (const l of libraries.values()) l.dispose();
  for (const l of oldLibraries.values()) l.dispose();
  scene.dispose();
  engine.dispose();
}
