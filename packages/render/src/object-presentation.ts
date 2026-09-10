import { placementAtFace } from "./structural-batches";
import { setMeshRole } from "./mesh-roles";
import { LAB_FLIGHT_ACTUATORS } from "../../content/src/flight";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Material } from "@babylonjs/core/Materials/material";
import type { loadInstalledEquipment } from "./installed-equipment";
import { createSelectionSilhouette } from "./selection-silhouette";
import "@babylonjs/core/Culling/ray";

type Installed = Awaited<ReturnType<typeof loadInstalledEquipment>>["placements"];
type EmissiveMaterial = Material & { emissiveColor: Color3 };

/** Selection is presentation only; object actions arrive through validated world rows. */
export function createObjectPresentation(
  canvas: HTMLCanvasElement,
  scene: Scene,
  meshes: AbstractMesh[],
  installed: Installed,
  blocked: () => boolean,
  onSelect?: (placementId?: string) => void,
) {
  for (const mesh of meshes) if (!mesh.metadata?.partId) {
    const drive=LAB_FLIGHT_ACTUATORS.find(device=>mesh.name===`GEO-${device.id}` || mesh.name.startsWith(`GEO-${device.id}_`));
    if(drive)mesh.metadata={...mesh.metadata,partId:drive.id};
  }
  let selected: string | undefined;
  let silhouette: ReturnType<typeof createSelectionSilhouette> | undefined;
  const offMaterials = new Map<Material, Material>();
  const sources = new Map<AbstractMesh, Material>();
  const lightStates = new Map<string, boolean>();
  function select(id?: string) {
    if (id === selected) return;
    selected = id;
    if (silhouette) silhouette.select(id);
    else if (id && meshes.some(mesh => mesh.getTotalVertices() > 0 && (mesh.metadata?.partId === id || mesh.metadata?.trianglePlacements?.some((r: { placementId: string }) => r.placementId === id))))
      silhouette = createSelectionSilhouette(scene, meshes, id);
  }
  const click = (event: PointerEvent) => {
    // Babylon's camera input prevents browser defaults on valid game clicks.
    // CanvasUI consumes its own clicks with stopImmediatePropagation.
    if (event.button !== 0 || blocked()) return;
    const rect = canvas.getBoundingClientRect();
    // Pick all visible geometry first: an opaque wall must block objects behind it.
    const hit = scene.pick(event.clientX - rect.left, event.clientY - rect.top);
    const picked=hit?.pickedMesh;
    const candidate = picked ? placementAtFace(picked, hit!.faceId) as string | undefined : undefined;
    // Individual structure cells belong to construction mode, not normal play.
    const structural = ['floor','roof','wall','superstructure','decoration'].includes(picked?.metadata?.category)
      || /^(floor|roof|superstructure|bulkhead)-/.test(candidate ?? '');
    const id = structural ? undefined : candidate;
    select(id);
    onSelect?.(id);
  };
  canvas.addEventListener("pointerdown", click);
  function lights(states: readonly { placementId: string; enabled: boolean }[]) {
    const currentIds = new Set(states.map(state => state.placementId));
    const missing = [...lightStates.keys()].filter(id => !currentIds.has(id))
      .map(placementId => ({placementId,enabled:false}));
    for (const state of [...states, ...missing]) {
      if (lightStates.get(state.placementId) === state.enabled) continue;
      const placement = installed.find(p => p.node.metadata?.partId === state.placementId);
      if (!placement) continue;
      lightStates.set(state.placementId, state.enabled);
      if(placement.lighting.setPowered)placement.lighting.setPowered(state.enabled);
      else for(const light of placement.lighting.lights)light.setEnabled(state.enabled);
      // Shared immutable on/off variants preserve authored optical properties.
      // Per-placement state is a reference swap, never a mutation of a variant.
      for (const mesh of placement.meshes) {
        if (!mesh.metadata?.role) setMeshRole(mesh, "equipment");
        const source = sources.get(mesh) ?? mesh.material;
        if (!source || !("emissiveColor" in source)) continue;
        sources.set(mesh, source);
        const color = (source as EmissiveMaterial).emissiveColor;
        if (state.enabled || (color.r === 0 && color.g === 0 && color.b === 0)) {
          mesh.material = source;
          continue;
        }
        let off = offMaterials.get(source);
        if (!off) {
          off = source.clone(`${source.name}-switch-off`) ?? undefined;
          if (!off) continue;
          (off as EmissiveMaterial).emissiveColor.set(0, 0, 0);
          offMaterials.set(source, off);
        }
        mesh.material = off;
      }
    }
  }
  return {
    select, lights,
    dispose() {
      canvas.removeEventListener("pointerdown", click);
      select(undefined);
      silhouette?.dispose();
      for (const [mesh, source] of sources) if (!mesh.isDisposed()) mesh.material = source;
      for (const material of offMaterials.values()) material.dispose(false, false);
      offMaterials.clear();
      sources.clear();
    },
  };
}
