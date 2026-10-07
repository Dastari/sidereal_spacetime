/** Versioned hull-tile derivative. Historical chamber profile2 remains immutable. */
import contract from "./hull-access-contract.v3.json";
import physical from "../../../assets/runtime/hull-access/r001/wayfarer.json";
import pack from "../../../assets/runtime/hull-access/r001/manifest.json";
import {
  snapshotShipAccessDoorPack,
  type ShipAccessDoorPack,
} from "./ship-access-doors";
import type { DerivedInterior, ShipPrefabDocumentV1 } from "./ship-prefab";

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export const HULL_ACCESS_DOORS = snapshotShipAccessDoorPack(
  freeze(pack) as ShipAccessDoorPack,
);
export const HULL_ACCESS_PHYSICAL = freeze(physical);
export const HULL_ACCESS_SOURCE = freeze(
  contract,
) as unknown as ShipPrefabDocumentV1;
export const HULL_ACCESS_MODULES = [
  {
    id: "personnel",
    x0: 2,
    x1: 4,
    center: 3,
    clearWidthM: 1.2,
    innerCenter: 3.5,
    innerSpan: 1,
  },
  {
    id: "cargo",
    x0: -9,
    x1: -5,
    center: -7,
    clearWidthM: 3.75,
    innerCenter: -8,
    innerSpan: 2,
  },
] as const;
export function isWayfarerHullAccessProfile(
  doc: Pick<ShipPrefabDocumentV1, "id" | "authoredGameplay">,
): boolean {
  return (
    doc.id === "fed.m.wayfarer" &&
    doc.authoredGameplay?.id === "wayfarer-authored-r001" &&
    doc.authoredGameplay.revision === 3
  );
}
/** Native floor tiles remain the standing surface; the only new row occupies the hull sill. */
export function hullAccessInterior(base: DerivedInterior): DerivedInterior {
  if (base.deck !== 0) return base;
  const floors = [...base.floors];
  for (const m of HULL_ACCESS_MODULES)
    for (let x = m.x0; x < m.x1; x++)
      floors.push({
        cell: [x, 5.5],
        room: m.id === "cargo" ? "cargo" : "utility",
        kind: "panel",
        partial: false,
      });
  const doors = [...base.doors];
  for (const m of HULL_ACCESS_MODULES) {
    doors.push({
      id: `${m.id}-outer`,
      a: [m.x0, 6.5],
      b: [m.x1, 6.5],
      type: m.id === "cargo" ? "door.blast" : "door.airlock",
      rooms: [m.id === "cargo" ? "cargo" : "utility", null],
      exterior: true,
      clearWidthM: m.clearWidthM,
    });
    doors.push({
      id: `${m.id}-inner`,
      a: [m.innerCenter - m.innerSpan / 2, 1.5],
      b: [m.innerCenter + m.innerSpan / 2, 1.5],
      type: "door.standard",
      rooms: [m.id === "cargo" ? "cargo" : "utility", "hall"],
      exterior: false,
      clearWidthM: m.innerSpan - 0.125,
    });
  }
  return { ...base, floors, doors };
}

/** Traversable air seal is part of each native exterior hatch. Server door state selects it. */
export const HULL_ACCESS_FIELD_POLICY = {
  pressureBarrier: true,
  blocksBodies: false,
  damageShield: false,
} as const;
