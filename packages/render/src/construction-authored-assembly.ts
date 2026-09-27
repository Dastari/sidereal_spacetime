import { createHullPaintBinding } from "./hull-paint";
import {
  WAYFARER_EXTERIOR_SHA256,
  verifyQualifiedWayfarerExterior,
  type WayfarerExteriorDocument,
} from "@sidereal/sim/wayfarer-exterior-qualification";
import {
  WAYFARER_REBUILD_SHA256,
  verifyWayfarerRebuildSource,
} from "@sidereal/sim/wayfarer-rebuild-contract";
import { poolAuthoredMaterials } from "./authored-material-pool";
import { framedWayfarerVisual } from "./framed-wayfarer-visuals";
import { framedEnginePrototype } from "./framed-engine-prototype";
import { nativeMeshInGroup } from "./native-mesh-group";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { withMaterialSetup } from "./material-setup";
import { batchStaticMaterials } from "./static-material-batches";
import { cacheStaticTransforms } from "./static-transform-cache";
import { mergeStructuralPlacements } from "./structural-batches";
import { canInstancePlacement } from "./placement-instance";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { categoryMeshRole } from "./mesh-roles";
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
import type { ConstructionDocument } from "@sidereal/content/construction";
import type { PartCatalog } from "@sidereal/content/assembly";
import { WAYFARER_CONVERSION_PIN as PIN } from "@sidereal/content/wayfarer-conversion-candidate";
import proof from "@sidereal/content/wayfarer-walking-proof.json";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { createEquipmentLighting } from "./equipment-lighting";
import { registerReferencedSceneMaterial } from "./scene-material-registration";

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
  const exterior =
    document.layout.source?.blueprintRevision === WAYFARER_EXTERIOR_SHA256;
  const rebuild =
    document.layout.source?.blueprintRevision === WAYFARER_REBUILD_SHA256;
  if (exterior)
    verifyQualifiedWayfarerExterior(document as WayfarerExteriorDocument);
  else if (rebuild) verifyWayfarerRebuildSource(document);
  else if (document.layout.source?.blueprintRevision !== proof.documentSha256)
    return null;
  if (!scene.useRightHandedSystem)
    throw Error("Authored assembly requires right-handed renderer");
  const raw = await fetch(
    exterior
      ? "/assets/assembly/catalog-shipyard-r005.json"
      : "/assets/assembly/catalog.json",
  );
  if (!raw.ok) throw Error("Authored catalog unavailable");
  const text = await raw.text();
  if (
    constructionHash(text) !==
    (exterior
      ? "9fa3db94ed61a84f3e9d52b0d404d1433931747bbd268fceefe6a4e2a6ead237"
      : PIN.sources["assets/runtime/assembly/catalog.json"])
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
  let materialPool: ReturnType<typeof poolAuthoredMaterials> | undefined;
  const dispose = () => {
    staticTransforms?.dispose();
    for (const p of placements) p.lighting.dispose();
    for (const node of roots) node.dispose(false, false);
    roots.length = 0;
    placements.length = 0;
    for (const library of libraries.values()) library.container.dispose();
    libraries.clear();
    materialPool?.dispose();
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
      const original = catalog.assets.find((a) => a.id === p.assetId);
      if (!original || original.category === "floor" || p.removedCells.length)
        throw Error("Unsupported authored placement or damage");
      const a = framedWayfarerVisual(original);
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
      requests.push({ p, a, library });
    }
    return withMaterialSetup(scene, () => {
      const enginePrototypes = new Map<string, Mesh>();
      const prepared = requests.map(({ p, a, library }) => {
        const prefix = a.visual?.nodePrefix;
        let selected = library.sources.filter((m) =>
          a.visual
            ? prefix
              ? nativeMeshInGroup(m.name, prefix)
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
        let enginePrototype = enginePrototypes.get(a.id);
        if (!enginePrototype) {
          enginePrototype = framedEnginePrototype(a, selected);
          if (enginePrototype) {
            enginePrototypes.set(a.id, enginePrototype);
            scene.removeMesh(enginePrototype);
            library.container.meshes.push(enginePrototype);
            if (enginePrototype.material instanceof MultiMaterial)
              library.container.multiMaterials.push(enginePrototype.material);
          }
        }
        if (enginePrototype) selected = [enginePrototype];
        for (const source of selected)
          source.metadata = {
            ...source.metadata,
            role: categoryMeshRole(a.category),
          };
        return { p, a, library, selected };
      });
      // These static visuals have no functional fixture or per-placement switches.
      // Pool before instances/batches capture their source material references.
      const immutableSources = new Set(
        prepared
          .filter((r) =>
            ["equipment", "cargo"].includes(categoryMeshRole(r.a.category)),
          )
          .flatMap((r) => r.selected),
      );
      materialPool = poolAuthoredMaterials(
        scene,
        [...libraries.values()].map((l) => l.container),
        immutableSources,
      );
      for (const { p, a, library, selected: originalSelection } of prepared) {
        let selected = originalSelection;
        if (a.category === "cargo") {
          let cached = cargoPrototypes.get(a.id);
          if (!cached) {
            cached = batchStaticMaterials(selected, "cargo", false);
            for (const prototype of cached)
              if (!selected.includes(prototype)) {
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
        const paintBinding = createHullPaintBinding(node, a, p.paint);
        const meshes = selected.map((source) => {
          const matrix = source.computeWorldMatrix(true).clone();
          const name = "GEO-" + p.id + "--authored--" + source.name;
          const instanceable = canInstancePlacement(a, source);
          if (instanceable) {
            source.receiveShadows = true;
            source.metadata = {
              ...source.metadata,
              role: categoryMeshRole(a.category),
              materialRole: "opaque",
            };
          }
          const mesh = paintBinding
            ? paintBinding.clone(source, name)
            : instanceable
              ? source.createInstance(name)
              : source.clone(name, node, true)!;
          mesh.parent = node;
          registerReferencedSceneMaterial(scene, mesh.material);
          const q = new Quaternion();
          matrix.decompose(mesh.scaling, q, mesh.position);
          mesh.rotationQuaternion = q;
          mesh.isVisible = true;
          mesh.isPickable = true;
          mesh.receiveShadows = true;
          mesh.metadata = {
            ...node.metadata,
            nativeSourceName: source.name,
            ...(instanceable ? { materialRole: "opaque" } : {}),
            ...(source.metadata?.prototypeBatch && !instanceable
              ? {
                  trianglePlacements: [
                    {
                      start: 0,
                      count: mesh.getTotalIndices() / 3,
                      placementId: p.id,
                    },
                  ],
                }
              : {}),
          };
          return mesh;
        });
        // Materials preserve native emission; no unbudgeted functional fixture lights
        // are created by a static visual placement without installed entity authority.
        const lighting = createEquipmentLighting(scene, node, []);
        lighting.setMeshes(meshes);
        placements.push({ node, meshes, lighting, category: a.category });
      }
      const structuralRoot = new TransformNode(
        "authored-structural-batches",
        scene,
      );
      structuralRoot.parent = parent;
      roots.push(structuralRoot);
      const candidates = placements
        .flatMap((p) => p.meshes)
        .filter(
          (m): m is Mesh =>
            m instanceof Mesh &&
            ["hull", "roof", "wall"].includes(m.metadata?.role),
        );
      for (const mesh of candidates) {
        mesh.metadata.visibilityGroup =
          mesh.metadata.role === "roof" ? "authored-roof" : "authored-exterior";
        mesh.metadata.lightGroup = "construction-star-fill";
      }
      const structural = mergeStructuralPlacements(structuralRoot, candidates);
      for (const p of placements) {
        const retained = p.meshes.filter((m) => !m.isDisposed());
        const batches = structural.batches.filter((m) =>
          m.metadata.trianglePlacements.some(
            (r: { placementId: string }) =>
              r.placementId === p.node.metadata.partId,
          ),
        );
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
