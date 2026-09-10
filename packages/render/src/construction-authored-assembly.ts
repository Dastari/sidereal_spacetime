import { withMaterialSetup } from "./material-setup";
import { batchStaticMaterials } from "./static-material-batches";
import { cacheStaticTransforms } from "./static-transform-cache";
import { mergeStructuralPlacements } from "./structural-batches";
import { canInstancePlacement } from "./placement-instance";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { categoryMeshRole } from './mesh-roles';
import {
  refitAttachmentPlacements,
  type RefitAttachmentVisual,
} from "./construction-refit-attachments";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import "@babylonjs/loaders/glTF";
import type { ConstructionDocument } from "../../content/src/construction";
import type { PartCatalog } from "../../content/src/assembly";
import { WAYFARER_CONVERSION_PIN as PIN } from "../../content/src/wayfarer-conversion-candidate";
import proof from "../../content/src/wayfarer-walking-proof.json";
import { constructionHash } from "../../sim/src/construction-transactions";
import { createEquipmentLighting } from "./equipment-lighting";

/** Exact authored visual assembly for the qualified static Wayfarer review.
 * Reusable GLBs/materials are shared inside this adapter; placed UUID roots are
 * independent. No floor duplicates, physical entity state, or door behavior. */
export async function loadConstructionAuthoredAssembly(
  scene: Scene,
  parent: TransformNode,
  document: ConstructionDocument,
  deckId: string,
  attachments: readonly RefitAttachmentVisual[] = [],
) {
  if (document.layout.source?.blueprintRevision !== proof.documentSha256)
    return null;
  if (!scene.useRightHandedSystem)
    throw Error("Authored assembly requires right-handed renderer");
  const raw = await fetch("/assets/assembly/catalog.json");
  if (!raw.ok) throw Error("Authored catalog unavailable");
  const text = await raw.text();
  if (
    constructionHash(text) !==
    PIN.sources["assets/runtime/assembly/catalog.json"]
  )
    throw Error("Authored catalog pin mismatch");
  const catalog = JSON.parse(text) as PartCatalog;
  const libraries = new Map<
    string,
    { container: AssetContainer; sources: Mesh[]; sha256: string }
  >();
  const placements: {
    node: TransformNode;
    meshes: AbstractMesh[];
    lighting: ReturnType<typeof createEquipmentLighting>;
    category: string;
  }[] = [];
  const roots: TransformNode[] = [];
  const cargoPrototypes = new Map<string, Mesh[]>();
  let staticTransforms: ReturnType<typeof cacheStaticTransforms> | undefined;
  const dispose = () => {
    staticTransforms?.dispose();
    for (const p of placements) p.lighting.dispose();
    for (const node of roots) node.dispose(false, false);
    roots.length = 0;
    placements.length = 0;
    for (const library of libraries.values()) library.container.dispose();
    libraries.clear();
  };
  try {
    const base = document.layout.assembly?.parts ?? [];
    const extra = refitAttachmentPlacements(
      attachments,
      document.layout.id,
      deckId,
      catalog.assets,
      base.map((p) => p.id),
    );
    const requests: {
      p: (typeof base)[number];
      a: PartCatalog["assets"][number];
      library: NonNullable<ReturnType<typeof libraries.get>>;
    }[] = [];
    for (const p of [...base, ...extra]) {
      const a = catalog.assets.find((a) => a.id === p.assetId);
      if (!a || a.category === "floor" || p.removedCells.length)
        throw Error("Unsupported authored placement or damage");
      const url = a.visual?.url ?? "/assets/assembly/parts.glb",
        sha =
          a.visual?.sha256 ??
          proof.artifacts["assets/runtime/assembly/parts.glb"];
      let library = libraries.get(url);
      if (library && library.sha256 !== sha)
        throw Error("Conflicting authored library revisions");
      if (!library) {
        const response = await fetch(url);
        if (!response.ok) throw Error("Missing authored GLB");
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (constructionHash(bytes) !== sha)
          throw Error("Authored GLB pin mismatch");
        const container = await SceneLoader.LoadAssetContainerAsync(
          "",
          bytes,
          scene,
          undefined,
          ".glb",
        );
        const sources = container.meshes.filter(
          (m): m is Mesh => m instanceof Mesh && m.getTotalVertices() > 0,
        );
        library = { container, sources, sha256: sha };
        libraries.set(url, library);
      }
      requests.push({p,a,library});
    }
    return withMaterialSetup(scene, () => {
    for (const {p,a,library} of requests) {
      const prefix = a.visual?.nodePrefix;
      let selected = library.sources.filter((m) =>
        a.visual
          ? prefix
            ? m.name === prefix ||
              m.name.startsWith(prefix + "_") ||
              m.name.startsWith(prefix + ".")
            : true
          : a.nodes.some(
              (n) =>
                m.name === n ||
                m.name.startsWith(n + "_") ||
                m.name.startsWith(n + "."),
            ),
      );
      if (!selected.length)
        throw Error("Missing exact authored mesh selector " + a.id);
      if (a.category === "cargo") {
        let cached = cargoPrototypes.get(a.id);
        if (!cached) {
          cached = batchStaticMaterials(selected, "cargo", false);
          for (const prototype of cached) if (!selected.includes(prototype)) {
            scene.removeMesh(prototype);
            library.container.meshes.push(prototype);
          }
          cargoPrototypes.set(a.id, cached);
        }
        selected = cached;
      }
      const node = new TransformNode("placement-" + p.id, scene);
      roots.push(node);
      node.parent = parent;
      node.position.set(p.position[0], p.position[2], -p.position[1]);
      node.rotation.y = p.rotation;
      node.scaling.x = p.flipped ? -1 : 1;
      node.metadata = {
        partId: p.id,
        assetId: a.id,
        category: a.category,
        role: categoryMeshRole(a.category),
        instanceId: document.layout.id,
        deckId,
        constructionRoof: a.category === "roof",
        authoritativeEntity: false,
      };
      const meshes = selected.map((source) => {
        const matrix = source.computeWorldMatrix(true).clone();
        const name = "GEO-" + p.id + "--authored--" + source.name;
        const instanceable = canInstancePlacement(a, source);
        if (instanceable) { source.receiveShadows = true; source.metadata = { ...source.metadata, role: categoryMeshRole(a.category), materialRole: "opaque" }; }
        const mesh = instanceable ? source.createInstance(name) : source.clone(name, node, true)!;
        mesh.parent = node;
        const q = new Quaternion();
        matrix.decompose(mesh.scaling, q, mesh.position);
        mesh.rotationQuaternion = q;
        mesh.isVisible = true;
        mesh.isPickable = true;
        mesh.receiveShadows = true;
        mesh.metadata = { ...node.metadata, nativeSourceName: source.name, ...(instanceable ? {materialRole:"opaque"} : {}), ...(source.metadata?.prototypeBatch && !instanceable ? { trianglePlacements: [{start:0,count:mesh.getTotalIndices()/3,placementId:p.id}] } : {}) };
        return mesh;
      });
      // Materials preserve native emission; no unbudgeted functional fixture lights
      // are created by a static visual placement without installed entity authority.
      const lighting = createEquipmentLighting(scene, node, []);
      lighting.setMeshes(meshes);
      placements.push({ node, meshes, lighting, category: a.category });
    }
    const structuralRoot = new TransformNode("authored-structural-batches", scene);
    structuralRoot.parent = parent;
    roots.push(structuralRoot);
    const candidates = placements.flatMap(p => p.meshes).filter((m): m is Mesh => m instanceof Mesh && ["hull", "roof", "wall"].includes(m.metadata?.role));
    for (const mesh of candidates) {
      mesh.metadata.visibilityGroup = mesh.metadata.role === "roof" ? "authored-roof" : "authored-exterior";
      mesh.metadata.lightGroup = "construction-star-fill";
    }
    const structural = mergeStructuralPlacements(structuralRoot, candidates);
    for (const p of placements) {
      const retained = p.meshes.filter(m => !m.isDisposed());
      const batches = structural.batches.filter(m => m.metadata.trianglePlacements.some((r: { placementId: string }) => r.placementId === p.node.metadata.partId));
      p.meshes = [...retained, ...batches];
      p.lighting.setMeshes(p.meshes);
    }
    const meshes = [...new Set(placements.flatMap((p) => p.meshes))];
    staticTransforms = cacheStaticTransforms(parent, meshes);
    return {
      placements,
      meshes,
      dispose,
      setView(_camera: Vector3, interior: boolean) {
        // Orbit never removes walls. Only the roof opens for the deck view.
        for (const p of placements)
          p.node.setEnabled(!(interior && p.category === "roof"));
        for (const mesh of structural.batches)
          mesh.setEnabled(!(interior && mesh.metadata.role === "roof"));
      },
    };
    });
  } catch (error) {
    dispose();
    throw error;
  }
}
