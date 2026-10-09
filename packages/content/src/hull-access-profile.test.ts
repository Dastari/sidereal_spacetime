import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HULL_ACCESS_SOURCE,
  HULL_ACCESS_DOORS,
  HULL_ACCESS_PHYSICAL,
} from "./hull-access-profile";
import { WAYFARER_ACCESS_SOURCE } from "./wayfarer-access-profile";
import { deriveInterior, readShipPrefab } from "./ship-prefab";
import { wayfarerInterior } from "./wayfarer-authored-gameplay";
import { defaultPrefabComponentCatalog } from "./ship-prefab-catalog";

describe("animated hull access tiles", () => {
  it("admits a separate exact profile and preserves the previous saved contract", () => {
    expect(readShipPrefab(HULL_ACCESS_SOURCE)).toEqual(HULL_ACCESS_SOURCE);
    expect(readShipPrefab(WAYFARER_ACCESS_SOURCE)).toEqual(
      WAYFARER_ACCESS_SOURCE,
    );
    const forged = structuredClone(HULL_ACCESS_SOURCE);
    forged.mounts[0].at[0] += 1;
    expect(() => readShipPrefab(forged)).toThrow(/exact registered/);
  });
  it("preserves every original floor once and adds only a single hull-depth sill row", () => {
    const base = wayfarerInterior(0);
    const candidate = deriveInterior(
      HULL_ACCESS_SOURCE,
      0,
      defaultPrefabComponentCatalog(),
    );
    for (const floor of base.floors) {
      const found = candidate.floors.filter(
        (f) => f.cell[0] === floor.cell[0] && f.cell[1] === floor.cell[1],
      );
      expect(found).toHaveLength(1);
      expect(found[0].kind).toBe(floor.kind);
      expect(found[0].extentM).toEqual(floor.extentM);
    }
    expect(candidate.floors).toHaveLength(base.floors.length + 6);
    expect(candidate.partitions).toEqual(base.partitions);
    expect(HULL_ACCESS_PHYSICAL.newBlockers).toEqual([]);
    expect(HULL_ACCESS_PHYSICAL.floorSupport).toEqual([]);
    expect(
      HULL_ACCESS_PHYSICAL.omitted.deck.some((id) => id.startsWith("FLOOR_")),
    ).toBe(false);
  });
  it("pins every actual exported mesh and reserves the complete stroke", () => {
    for (const piece of HULL_ACCESS_PHYSICAL.pieces) {
      const bytes = readFileSync(
        new URL(
          `../../../assets/runtime/hull-access/r001/${piece.file}`,
          import.meta.url,
        ),
      );
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(
        piece.sha256,
      );
      expect(bytes.byteLength).toBe(piece.bytes);
    }
    for (const variant of HULL_ACCESS_DOORS.variants) {
      expect(variant.requiresPocketReservationM).toBeGreaterThanOrEqual(
        variant.strokeM,
      );
      expect(variant.depthM).toBeLessThan(1);
    }
  });
});
