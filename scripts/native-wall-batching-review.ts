import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import "@babylonjs/loaders/glTF";
import { createNativeWallBatches } from "../packages/render/src/native-wall-batches";

/** Explicit offline fixture. No game imports, auth, runtime catalog or publication. */
export async function createWallBatchingReview(canvas: HTMLCanvasElement) {
  const base = "/@fs/root/sidereal_spacetime/";
  const response = await fetch(
    base +
      "docs/releases/usable-wall-readiness-20260910/geometry-comparison.json",
  );
  const input = (await response.json()) as {
    entries: {
      sourcePlacedId: string;
      currentCategory: "wall" | "roof";
      candidateNativeSource: { path: string; sha256: string };
      proposedCatalogBinding: { id: string };
      unchangedPlacement: {
        position: number[];
        rotation: number;
        flipped: boolean;
      };
    }[];
  };
  const engine = new Engine(canvas, false),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.clearColor = new Color4(0.025, 0.035, 0.05, 1);
  const camera = new ArcRotateCamera(
    "comparison",
    -Math.PI / 2 - 0.55,
    0.8,
    35,
    new Vector3(0, 1, 0),
    scene,
  );
  camera.minZ = 0.1;
  camera.maxZ = 100;
  const hemi = new HemisphericLight("native-fill", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.85;
  const sun = new DirectionalLight(
    "native-key",
    new Vector3(-0.4, -1, 0.3),
    scene,
  );
  sun.intensity = 1.1;
  const before = new TransformNode("original-native", scene),
    after = new TransformNode("batched-native", scene);
  after.setEnabled(false);
  const libraries = new Map<string, AssetContainer>(),
    batches: ReturnType<typeof createNativeWallBatches>[] = [];
  try {
    for (const e of input.entries) {
      let library = libraries.get(e.candidateNativeSource.path);
      if (!library) {
        const bytes = new Uint8Array(
          await (
            await fetch(base + e.candidateNativeSource.path)
          ).arrayBuffer(),
        );
        const hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        if (hash !== e.candidateNativeSource.sha256)
          throw Error("Wall native pin mismatch");
        library = await SceneLoader.LoadAssetContainerAsync(
          "",
          bytes,
          scene,
          undefined,
          ".glb",
        );
        libraries.set(e.candidateNativeSource.path, library);
      }
      const sources = library.meshes.filter(
        (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
      );
      const root = new TransformNode("original-" + e.sourcePlacedId, scene);
      root.parent = before;
      const placement = e.unchangedPlacement;
      const transform = (node: TransformNode) => {
        node.position.set(
          placement.position[0],
          placement.position[2],
          -placement.position[1],
        );
        node.rotation.y = placement.rotation;
        node.scaling.x = placement.flipped ? -1 : 1;
      };
      transform(root);
      const primitives = sources.map((source) => ({
        source,
        matrix: source.computeWorldMatrix(true).clone(),
      }));
      for (const p of primitives) {
        const mesh = p.source.clone("original-" + p.source.name, root, true)!;
        const q = new Quaternion();
        p.matrix.decompose(mesh.scaling, q, mesh.position);
        mesh.rotationQuaternion = q;
        mesh.isVisible = true;
      }
      const batch = createNativeWallBatches(
        scene,
        after,
        {
          partId: e.sourcePlacedId,
          assetId: e.proposedCatalogBinding.id,
          category: e.currentCategory,
        },
        primitives,
      );
      transform(batch.root);
      batches.push(batch);
    }
    return {
      engine,
      scene,
      camera,
      before,
      after,
      batches,
      mode(batched: boolean) {
        before.setEnabled(!batched);
        after.setEnabled(batched);
      },
      frame() {
        scene.render();
      },
      dispose() {
        for (const b of batches) b.dispose();
        before.dispose();
        after.dispose();
        for (const l of libraries.values()) l.dispose();
        scene.dispose();
        engine.dispose();
      },
    };
  } catch (error) {
    scene.dispose();
    engine.dispose();
    throw error;
  }
}
