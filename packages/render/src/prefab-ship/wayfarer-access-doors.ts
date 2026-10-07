import { createDoorFields } from "./door-fields";
import {
  HULL_ACCESS_DOORS,
  HULL_ACCESS_MODULES,
} from "@sidereal/content/hull-access-profile";
import type {
  ShipPrefabDocumentV1,
  PrefabComponentCatalog,
} from "@sidereal/content/ship-prefab";
import { createPrefabDoors } from "./doors";
import type { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
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

/** Hull apertures are tiles with traversable projected fields and ordinary room entrances. */
export async function createWayfarerHullAccessDoors(
  scene: Scene,
  root: TransformNode,
  doc: ShipPrefabDocumentV1,
  catalog: PrefabComponentCatalog,
  fetchBytes: (piece: ShipAccessDoorPiece) => Promise<Uint8Array>,
) {
  const placements: AuthoredAccessDoorPlacement[] = HULL_ACCESS_MODULES.map(
    (m) => ({
      id: `${m.id}-outer`,
      variant: m.id === "cargo" ? "cargo.4m" : "personnel",
      center: [-6.5, m.center],
      normal: [-1, 0],
      floorM: 0,
    }),
  );
  const authored = await loadAuthoredAccessDoors(scene, root, placements, {
    pack: HULL_ACCESS_DOORS,
    fetchBytes,
  });
  const fields = createDoorFields(scene, root, placements, HULL_ACCESS_DOORS);
  // These source room entrances use ordinary interior leaves, not exterior housings.
  const innerRoot = new TransformNode(`hull-room-doors:${doc.id}`, scene);
  innerRoot.parent = root;
  // The authored ship root already carries the walking datum; ordinary leaves
  // add that datum themselves. Keep it once for these room door meshes.
  innerRoot.position.y = -0.1875;
  const inner = createPrefabDoors(
    scene,
    innerRoot,
    doc,
    catalog,
    doc.theme,
    true,
    new Set(placements.map((p) => p.id)),
  );
  return {
    setView(view: "deck" | "flight") {
      inner.setView(view);
      authored.setEnabled(true);
    },
    update(input: DoorUpdate) {
      inner.update(input);
      authored.update(
        input.logic === undefined
          ? undefined
          : new Map([...input.logic].map(([id, open]) => [id, { open }])),
        input.dt,
      );
      fields.update(authored.states());
    },
    fields: () => fields.states(),
    doors: () => [
      ...inner.doors(),
      ...authored
        .states()
        .map((row) => ({ ...row, airlock: row.id === "personnel-outer" })),
    ],
    dispose() {
      inner.dispose();
      innerRoot.dispose();
      authored.dispose();
      fields.dispose();
    },
  };
}
