import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { ShipAccessDoorPiece } from "@sidereal/content/ship-access-doors";
import {
  WAYFARER_ACCESS_DOORS,
  WAYFARER_ACCESS_MODULES,
} from "@sidereal/content/wayfarer-access-profile";
import {
  loadAuthoredAccessDoors,
  type AuthoredAccessDoorPlacement,
} from "./authored-access-doors";
import type { DoorUpdate } from "./doors";

/** Code-owned profile placement, at the already-raised native ship root. */
export const wayfarerAccessDoorPlacements = (): AuthoredAccessDoorPlacement[] =>
  WAYFARER_ACCESS_MODULES.flatMap((module) =>
    (["outer", "inner"] as const).map((side) => ({
      id: module.id + "-" + side,
      variant:
        module.id === "cargo"
          ? "cargo.4m"
          : side === "inner"
            ? "personnel.reverse"
            : "personnel",
      center: [side === "outer" ? -7 : -3, module.center],
      normal: [side === "outer" ? -1 : 1, 0],
      floorM: 0,
    })),
  );

/** Reuse the pinned part/state adapter; no proximity, legacy cycle or client control grants. */
export async function createWayfarerAccessDoors(
  scene: Scene,
  root: TransformNode,
  fetchBytes: (piece: ShipAccessDoorPiece) => Promise<Uint8Array>,
) {
  const authored = await loadAuthoredAccessDoors(
    scene,
    root,
    wayfarerAccessDoorPlacements(),
    { pack: WAYFARER_ACCESS_DOORS, fetchBytes },
  );
  return {
    setView(view: "deck" | "flight") {
      for (const mesh of authored.meshes()) {
        const id = mesh.metadata?.authoredAccessDoor?.id as string | undefined;
        mesh.setEnabled(view === "deck" || id?.endsWith("-outer") === true);
      }
    },
    update(input: DoorUpdate) {
      const states =
        input.logic === undefined
          ? undefined
          : new Map(
              [...input.logic].map(([id, open]) => [
                id,
                { open, locked: false },
              ]),
            );
      authored.update(states, input.dt);
    },
    doors: () =>
      authored
        .states()
        .map((row) => ({ ...row, airlock: row.id === "personnel-outer" })),
    dispose: () => authored.dispose(),
  };
}
