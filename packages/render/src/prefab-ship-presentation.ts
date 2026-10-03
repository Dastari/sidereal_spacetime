import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import { prefabComponentCatalogFor } from "@sidereal/sim/prefab-catalog";
import { createGlowOccluders } from "./glow-occluders";
import { createShipGlowOccluders } from "./ship-glow-occluders";
import { moldedLightRig } from "./molded-plastic";
import {
  applyShipGlowProfile,
  SHIP_GLOW_PROFILE,
  authoredGlowTargetOptions,
} from "./ship-glow-profile";
import {
  createShipExhaust,
  prefabExhaustJets,
  type ShipExhaust,
} from "./prefab-ship/exhaust";

/** Game-side handle over the SHIPS-PREFABS dressed ship view. */
export interface PrefabShipViewHandle {
  setInterior(interior: boolean): void;
  /** Animate door leaves (airlock outer door from the EVA cycle, interior doors on approach). */
  updateDoors(input: import("./prefab-ship/doors").DoorUpdate): void;
  /** Wall button lights and press flashes by button device id (ship logic). */
  updatePanels(
    lights:
      ReadonlyMap<string, { light: string; pressedMicros: number }> | undefined,
    nowMs: number,
  ): void;
  /** Door leaf states (review diagnostics). */
  doors(): { id: string; open: number; airlock: boolean }[];
  /** Per-actuator exhaust from `own_authored_flight_actuators` rows (achieved throttles). */
  updateExhaust(
    actuators: Parameters<typeof prefabExhaustJets>[2],
    nowMs: number,
  ): void;
  /** Lit jets (review diagnostics). */
  exhaust(): ReturnType<ShipExhaust["lit"]>;
  dispose(): void;
  /** Mesh-origin and draw metrics of the dressed view (evidence/diagnostics). */
  metrics(): ReturnType<
    import("./prefab-ship/ship-view").PrefabShipView["metrics"]
  >;
}

/** Molded-plastic presentation (molded-plastic.ts): slot materials carry the shared family finish,
 * studio reflection environment and grading; the game adds only the direct-light share. The space
 * key light is strong (2.1): hull plastic takes 60 % of it so light shells stay light grey rather
 * than clipping, and cut-away interiors (lit mostly by room lights) take 90 %. */
const GAME_SHIP_DIRECT = 0.6;
const GAME_INTERIOR_DIRECT = 0.9;

/** A trusted prefab construction document carries its canonical grammar source
 * under `prefab` (admitted by readConstructionDraft). Returns undefined for any
 * other construction, so native Wayfarer/Studio instances are untouched. The
 * view is presentation only: collision, walking and flight stay authoritative. */
export async function loadPrefabShipPresentation(
  scene: Scene,
  shipRoot: TransformNode,
  documentJson: string,
  visualVariant?: import("./prefab-ship/visual-variant").VisualVariantSelection,
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
  const [
    { createPrefabShipView },
    { createPrefabDoors },
    { createLogicPanels },
  ] = await Promise.all([
    import("./prefab-ship/ship-view"),
    import("./prefab-ship/doors"),
    import("./prefab-ship/logic-panels"),
  ]);
  let interior = true;
  // Published component (ship-components/r002) and interior object (ship-objects/r001) GLBs;
  // anything unpublished falls back to stand-ins inside the view. One ceiling light per room.
  const view = await createPrefabShipView(scene, doc, {
    catalog,
    visualVariant,
    view: "deck",
    parent: shipRoot,
    // Closed, animated door leaves (doors.ts) replace the airlock GLB's baked leaves.
    externalDoorLeaves: true,
    // Engines glow only while the server fires them (exhaust.ts), not as a baked idle plume.
    staticPlumes: false,
  });
  const exhaust = createShipExhaust(
    scene,
    doc.id === "fed.m.wayfarer" ? shipRoot : view.root,
    doc.theme,
  );
  const doors = createPrefabDoors(
    scene,
    view.root,
    doc,
    catalog,
    doc.theme,
    view.metrics().visualRevision !== undefined,
  );
  // Ship logic wall buttons (wiki Systems/Ship Logic): lights follow `visible_ship_logic`.
  const panels = createLogicPanels(scene, view.root, doc, catalog);
  // The native construction loader also builds boundary guide meshes for the same layout; the
  // dressed view replaces them visually (walking and collision stay authoritative), so hide them.
  for (const mesh of shipRoot.getChildMeshes())
    if (
      mesh.name.startsWith("construction-boundary-guide") &&
      !mesh.isDescendantOf(view.root)
    )
      mesh.setEnabled(false);
  // Bloom: a ship-owned glow layer over the ship's emissive meshes only (light strips, canopy
  // edges, exhaust). The game's instrument glow layer stays untouched; one grading path.
  const halo = authoredGlowTargetOptions(
    scene,
    view
      .emissiveMeshes()
      .some((mesh) => mesh.material?.metadata?.authoredAssetEmission),
  );
  const glow = new GlowLayer("prefab-ship-glow", scene, {
    mainTextureFixedSize: SHIP_GLOW_PROFILE.mainTextureFixedSize,
    blurKernelSize: SHIP_GLOW_PROFILE.blurKernelSize,
    ...(halo.assetHalo
      ? {
          mainTextureType: halo.mainTextureType,
          alphaBlendingMode: halo.alphaBlendingMode,
          blurKernelSize: halo.blurKernelSize,
        }
      : {}),
  });
  applyShipGlowProfile(glow, { assetHalo: halo.assetHalo });
  // Opaque ship geometry occludes the glow (drawn black into its mask), so emitters behind
  // housings, walls and hull plates do not bloom through them.
  const occluders = createGlowOccluders(glow);
  const glowBatches = createShipGlowOccluders(scene, view.root, glow);
  // Shared molded light rig (cool fill + camera-relative rim), also lighting the crew.
  const rig = moldedLightRig(scene);
  const glowing = new Set<AbstractMesh>();
  const adapt = () => {
    const meshes = view.root
      .getChildMeshes()
      .filter((mesh) => !glowBatches.proxies.includes(mesh as Mesh));
    rig.include(meshes);
    for (const mesh of meshes) {
      const m = mesh.material;
      // Interior-palette clones (materials.ts roleSlotMaterial) are named prefab-<theme>-<role>-<slot>.
      if (m instanceof PBRMaterial)
        m.directIntensity = /-(floor|wall)-/.test(m.name)
          ? GAME_INTERIOR_DIRECT
          : GAME_SHIP_DIRECT;
    }
    const emissive = new Set<AbstractMesh>(view.emissiveMeshes());
    for (const mesh of emissive) glowing.add(mesh);
    const opaque = meshes.filter((m) => !glowing.has(m));
    occluders.set(opaque);
    glowBatches.set(opaque);
    // A previously hidden cohort can have been owned by the black-mask set.
    // Re-admit its emitters after those owners release their old memberships.
    for (const mesh of emissive) glow.addIncludedOnlyMesh(mesh as Mesh);
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
      doors.setView(next ? "deck" : "flight");
      panels.setView(next ? "deck" : "flight");
      adapt();
      logMetrics();
    },
    metrics: () => view.metrics(),
    updateDoors: (input) => doors.update(input),
    updatePanels: (lights, nowMs) => panels.update(lights, nowMs),
    updateExhaust(actuators, nowMs) {
      exhaust.update(prefabExhaustJets(doc, catalog, actuators), nowMs);
      // Review diagnostics: lit jet count on the canvas (changes only when the count changes).
      const canvas = scene.getEngine().getRenderingCanvas();
      const lit = String(exhaust.lit().length);
      if (canvas && canvas.dataset.exhaustLit !== lit)
        canvas.dataset.exhaustLit = lit;
      // Jets are created on first fire; add new ones to the ship glow.
      for (const mesh of exhaust.meshes())
        if (!glowing.has(mesh))
          (glowing.add(mesh), glow.addIncludedOnlyMesh(mesh));
    },
    exhaust: () => exhaust.lit(),
    doors: () => doors.doors(),
    dispose() {
      exhaust.dispose();
      panels.dispose();
      doors.dispose();
      glowBatches.dispose();
      occluders.dispose();
      glow.dispose();
      view.dispose();
    },
  };
  // Diagnostics hook (review harnesses read mesh-origin metrics from the ship frame).
  shipRoot.metadata = { ...shipRoot.metadata, prefabView: handle };
  return handle;
}
