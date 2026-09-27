import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { createGlowOccluders } from "./glow-occluders";

/** Game-side handle over the SHIPS-PREFABS dressed ship view. */
export interface PrefabShipViewHandle {
  setInterior(interior: boolean): void;
  dispose(): void;
  /** Mesh-origin and draw metrics of the dressed view (evidence/diagnostics). */
  metrics(): ReturnType<import("./prefab-ship/ship-view").PrefabShipView["metrics"]>;
}

/** The game's space scene has no image-based environment, so metallic PBR slots
 * tuned against Blender world lighting render near-black. The game presentation
 * therefore caps metalness and adds a ship-scoped sky/ground fill light. Theme
 * colours, geometry and the shared material pool semantics are unchanged. */
const GAME_MAX_METALLIC = 0.2;
/** Scene IBL is 0.28 (open space); materials multiply it. Hull panels take ~0.6 of full IBL and
 * interior floors/walls ~0.85, so rooms read lit rather than as dark voids. */
const GAME_SHIP_ENVIRONMENT = 2.2;
const GAME_INTERIOR_ENVIRONMENT = 3.0;
/** Bloom strength of ship emissives (emit slots keep saturated colour; the glow carries the halo). */
const GAME_SHIP_GLOW = 0.7;

/** A trusted prefab construction document carries its canonical grammar source
 * under `prefab` (admitted by readConstructionDraft). Returns undefined for any
 * other construction, so native Wayfarer/Studio instances are untouched. The
 * view is presentation only: collision, walking and flight stay authoritative. */
export async function loadPrefabShipPresentation(
  scene: Scene,
  shipRoot: TransformNode,
  documentJson: string,
): Promise<PrefabShipViewHandle | undefined> {
  let binding: { document?: unknown; catalog?: unknown } | undefined;
  try {
    binding = (JSON.parse(documentJson) as { prefab?: typeof binding }).prefab;
  } catch {
    return undefined;
  }
  if (!binding || typeof binding.catalog !== "string") return undefined;
  const doc = readShipPrefab(binding.document);
  const catalog = prefabComponentCatalogFor(binding.catalog);
  const { createPrefabShipView } = await import("./prefab-ship/ship-view");
  let interior = true;
  // Published component (ship-components/r002) and deck furniture (ship-furniture/r001) GLBs;
  // anything unpublished falls back to stand-ins inside the view. One ceiling light per room.
  const view = await createPrefabShipView(scene, doc, {
    catalog,
    view: "deck",
    parent: shipRoot,
  });
  // The native construction loader also builds boundary guide meshes for the same layout; the
  // dressed view replaces them visually (walking and collision stay authoritative), so hide them.
  for (const mesh of shipRoot.getChildMeshes())
    if (mesh.name.startsWith("construction-boundary-guide") && !mesh.isDescendantOf(view.root)) mesh.setEnabled(false);
  // Bloom: a ship-owned glow layer over the ship's emissive meshes only (light strips, canopy
  // edges, exhaust). The game's instrument glow layer stays untouched; one grading path.
  const glow = new GlowLayer("prefab-ship-glow", scene, { mainTextureFixedSize: 512, blurKernelSize: 40 });
  glow.intensity = GAME_SHIP_GLOW;
  // Opaque ship geometry occludes the glow (drawn black into its mask), so emitters behind
  // housings, walls and hull plates do not bloom through them.
  const occluders = createGlowOccluders(glow);
  const fill = new HemisphericLight("prefab-ship-fill", new Vector3(0.2, 1, -0.3), scene);
  fill.intensity = 0.85;
  fill.diffuse = new Color3(0.92, 0.94, 1);
  fill.groundColor = new Color3(0.32, 0.34, 0.42);
  fill.specular = new Color3(0.15, 0.15, 0.15);
  const glowing = new Set<AbstractMesh>();
  const adapt = () => {
    const meshes = view.root.getChildMeshes();
    fill.includedOnlyMeshes = meshes;
    for (const mesh of meshes) {
      const m = mesh.material;
      if (m instanceof PBRMaterial) {
        if ((m.metallic ?? 0) > GAME_MAX_METALLIC) m.metallic = GAME_MAX_METALLIC;
        // The space scene's image environment is dim (tuned for the open sky); ship panels
        // take a fuller share of it so light greys read as light grey, not flat lavender.
        // Interior-palette clones (materials.ts roleSlotMaterial) are named prefab-<theme>-<role>-<slot>.
        m.environmentIntensity = /-(floor|wall)-/.test(m.name) ? GAME_INTERIOR_ENVIRONMENT : GAME_SHIP_ENVIRONMENT;
      }
    }
    const emissive = new Set<AbstractMesh>(view.emissiveMeshes());
    for (const mesh of emissive) if (!glowing.has(mesh)) glowing.add(mesh), glow.addIncludedOnlyMesh(mesh as Mesh);
    occluders.set(meshes.filter((m) => !emissive.has(m) && m.isEnabled()));
  };
  adapt();
  // Draw-cost evidence: one line per presentation after its first rendered frame.
  const logMetrics = () =>
    scene.onAfterRenderObservable.addOnce(() => {
      const m = view.metrics();
      console.info(
        `prefab-ship ${doc.id} ${interior ? "deck" : "flight"}: shipDrawsPerPass=${m.meshes} triangles=${m.triangles} instances=${m.instances}`,
      );
    });
  logMetrics();
  const handle: PrefabShipViewHandle = {
    setInterior(next) {
      if (next === interior) return;
      interior = next;
      view.setView(next ? "deck" : "flight");
      adapt();
      logMetrics();
    },
    metrics: () => view.metrics(),
    dispose() {
      occluders.dispose();
      glow.dispose();
      fill.dispose();
      view.dispose();
    },
  };
  // Diagnostics hook (review harnesses read mesh-origin metrics from the ship frame).
  shipRoot.metadata = { ...shipRoot.metadata, prefabView: handle };
  return handle;
}
