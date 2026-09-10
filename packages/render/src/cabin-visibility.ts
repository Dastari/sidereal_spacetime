import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Light } from "@babylonjs/core/Lights/light";

export function cabinIsVisible(
  deckRequested: boolean,
  cutawayBlend: number,
  observing: boolean,
) {
  return !observing && (deckRequested || cutawayBlend > 0.005);
}
export function isCabinMesh(name: string) {
  return /GEO-(deck|room(?:-|$)|partitions|equipment(?:-|$))/.test(name);
}
/** Native placements have stable UUID names; classify their authored role too. */
export function isCabinVisual(node: Pick<TransformNode, "name" | "metadata">) {
  const metadata = node.metadata;
  return ["floor", "equipment", "cargo"].includes(metadata?.category) ||
    isCabinMesh(node.name) ||
    isCabinMesh(String(metadata?.nativeSourceName ?? "")) ||
    isCabinMesh("GEO-" + String(metadata?.partId ?? ""));
}
/** Presentation-only visibility. Hull, roof, cutaway exterior walls and drives are separate. */
export function createCabinVisibility(
  meshes: AbstractMesh[],
  actor: TransformNode,
  placements: readonly { node: TransformNode; lighting: { lights: Light[]; setPowered?:(value:boolean)=>void; setCabinVisible?:(value:boolean)=>void } }[],
  controlledLights: ReadonlySet<string>,
) {
  const interior = meshes.filter(isCabinVisual);
  const enabled = new Map<TransformNode, boolean>(
    [...interior, actor].map((node) => [node, node.isEnabled()]),
  );
  const fixtureLights = placements.filter((p) =>
    isCabinVisual(p.node),
  );
  let visible = true;
  return {
    update(
      next: boolean,
      states: readonly { placementId: string; enabled: boolean }[],
    ) {
      if (next !== visible) {
        visible = next;
        for (const [node, original] of enabled)
          if (!node.isDisposed()) node.setEnabled(next && original);
      }
      for (const placement of fixtureLights) {
        const id = placement.node.metadata?.partId as string;
        const powered =
          !controlledLights.has(id) ||
          states.some((state) => state.placementId === id && state.enabled);
        const desired = next && powered;
        if(placement.lighting.setPowered&&placement.lighting.setCabinVisible){
          placement.lighting.setPowered(powered);
          placement.lighting.setCabinVisible(next);
        }else for (const light of placement.lighting.lights)
            if (!light.isDisposed() && light.isEnabled(false) !== desired)
              light.setEnabled(desired);
      }
    },
  };
}
