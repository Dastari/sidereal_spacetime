import { describe, expect, it } from "vitest";
import { FED_CREST, FED_WREN } from "./prefabs/federation";
import { PREFAB_SHIPS } from "./prefabs";
import { defaultPrefabComponentCatalog } from "./ship-prefab-catalog";
import {
  PREFAB_FIXTURE_DESIGNS,
  PREFAB_KNOWN_FIXTURE_DESIGNS,
  canonicalShipPrefabJson,
  deriveInterior,
  fixtureDesignTexels,
  fixtureSize,
  readShipPrefab,
  validatePrefabFixtures,
  validateShipPrefab,
} from "./ship-prefab";
import {
  deckObjectVisualUrl,
  interiorArtQuarterTurns,
  isCrewStationDesign,
} from "./ship-furniture";
import {
  REFERENCE_ROOM_FIXTURE_CATALOG_R025,
  referenceRoomFixtureR025,
} from "./ship-room-fixtures-r025";
import { referenceRoomLayoutR025 } from "./ship-reference-room-layout-r025";

const catalog = defaultPrefabComponentCatalog();
const workshop = "shipyard.equipment.workshop-bank-r025";
const medical = "shipyard.equipment.medical-equipment-bank-r025";

describe("finite reference R025 room furniture", () => {
  it("uses exactly two immutable nonstorage nonseated furniture definitions", () => {
    expect(PREFAB_FIXTURE_DESIGNS).toEqual([
      "shipyard.equipment.wall-locker",
      "cargo.standard.medium",
    ]);
    expect(PREFAB_KNOWN_FIXTURE_DESIGNS).toEqual([
      ...PREFAB_FIXTURE_DESIGNS,
      "pale-studless.table.standard",
      workshop,
      medical,
    ]);
    const entries = REFERENCE_ROOM_FIXTURE_CATALOG_R025.entries;
    expect(REFERENCE_ROOM_FIXTURE_CATALOG_R025.id).toBe(
      "sidereal.reference-room-fixtures@r025",
    );
    expect(entries.map((e) => e.designId)).toEqual([workshop, medical]);
    expect(entries.map((e) => e.texels)).toEqual([
      [52, 16, 32],
      [20, 20, 32],
    ]);
    for (const e of entries) {
      expect(e.kind).toBe("furniture");
      expect([e.control, e.storage, e.seat]).toEqual([false, false, false]);
      expect(Object.isFrozen(e) && Object.isFrozen(e.texels)).toBe(true);
    }
    expect(
      referenceRoomFixtureR025("shipyard.equipment.workshop-bank-r026"),
    ).toBeUndefined();
    expect(
      referenceRoomFixtureR025("shipyard.equipment.medical-bed"),
    ).toBeUndefined();
  });

  it("resolves fixed dimensions and separates visual orientation from station semantics", () => {
    expect(fixtureDesignTexels(workshop)).toEqual([52, 16, 32]);
    expect(fixtureDesignTexels(medical)).toEqual([20, 20, 32]);
    expect(fixtureDesignTexels("pale-studless.table.standard")).toEqual([
      24, 16, 12,
    ]);
    expect(fixtureSize({ design: workshop, facing: "starboard" })).toEqual([
      3.25, 1,
    ]);
    expect(fixtureSize({ design: workshop, facing: "fore" })).toEqual([
      1, 3.25,
    ]);
    expect(interiorArtQuarterTurns(workshop)).toBe(2);
    expect(interiorArtQuarterTurns(medical)).toBe(0);
    expect(isCrewStationDesign(workshop)).toBe(false);
    expect(isCrewStationDesign(medical)).toBe(false);
    expect(isCrewStationDesign("pale-studless.console.standard")).toBe(true);
    expect(deckObjectVisualUrl(workshop)).toBe(
      `/assets/ship-objects/reference-r025-display/${workshop}.glb`,
    );
    expect(deckObjectVisualUrl(medical)).toBe(
      `/assets/ship-objects/reference-r025-display/${medical}.glb`,
    );
    expect(deckObjectVisualUrl("shipyard.equipment.medical-bed")).toBe(
      "/assets/ship-objects/r001/shipyard.equipment.medical-bed.glb",
    );
  });

  it("changes only the exact Crest revision and three fixtures without registering a default", () => {
    const old = PREFAB_SHIPS.map(canonicalShipPrefabJson);
    const candidate = referenceRoomLayoutR025(FED_CREST);
    expect(candidate.revision).toBe(5);
    expect(candidate.fixtures).toEqual([
      {
        id: "reference-lounge-table",
        design: "pale-studless.table.standard",
        at: [12.85, 7],
        facing: "port",
      },
      {
        id: "reference-workshop-bank",
        design: workshop,
        at: [9.35, 0.3],
        facing: "starboard",
      },
      {
        id: "reference-medical-equipment",
        design: medical,
        at: [6.35, 0.3],
        facing: "port",
      },
    ]);
    const restored = structuredClone(candidate);
    restored.revision = 4;
    delete restored.fixtures;
    expect(canonicalShipPrefabJson(restored)).toBe(
      canonicalShipPrefabJson(FED_CREST),
    );
    candidate.mounts[0].at[0] += 1;
    expect(PREFAB_SHIPS.map(canonicalShipPrefabJson)).toEqual(old);
    expect(PREFAB_SHIPS.find((p) => p.id === candidate.id)).toBe(FED_CREST);
  });

  it("rejects wrong base revision, faction and any altered original geometry", () => {
    expect(() => referenceRoomLayoutR025(FED_WREN)).toThrow(
      /exact original Crest/,
    );
    for (const edit of [
      (p: typeof FED_CREST) => {
        p.revision = 5;
      },
      (p: typeof FED_CREST) => {
        p.faction = "Riftjack";
      },
      (p: typeof FED_CREST) => {
        p.mounts[0].at[0] += 1;
      },
    ]) {
      const changed = structuredClone(FED_CREST);
      edit(changed);
      expect(() => referenceRoomLayoutR025(changed)).toThrow(
        /exact original Crest/,
      );
    }
  });

  it("retains strict fixture parsing for unknown design, nonfinite coordinates and facing", () => {
    for (const edit of [
      (p: Record<string, unknown>) => {
        p.design = "shipyard.equipment.workshop-bank-r026";
      },
      (p: Record<string, unknown>) => {
        p.at = [Infinity, 7];
      },
      (p: Record<string, unknown>) => {
        p.facing = "diagonal";
      },
      (p: Record<string, unknown>) => {
        p.size = [1, 1];
      },
    ]) {
      const changed = referenceRoomLayoutR025(FED_CREST);
      const fixture: Record<string, unknown> = { ...changed.fixtures![0] };
      edit(fixture);
      expect(() =>
        readShipPrefab({
          ...changed,
          fixtures: [fixture, ...changed.fixtures!.slice(1)],
        }),
      ).toThrow();
    }
  });

  it("passes shared placement validation and retains the original bed and sofa sockets", () => {
    const original = deriveInterior(FED_CREST, 0, catalog);
    const candidate = referenceRoomLayoutR025(FED_CREST);
    expect(validatePrefabFixtures(candidate, catalog)).toEqual([]);
    expect(validateShipPrefab(candidate, catalog)).toEqual([]);
    const next = deriveInterior(candidate, 0, catalog);
    for (const design of [
      "shipyard.equipment.medical-bed",
      "shipyard.equipment.lounge-sofa",
    ])
      expect(next.sockets.filter((s) => s.designId === design)).toEqual(
        original.sockets.filter((s) => s.designId === design),
      );
    expect(
      next.sockets
        .filter((s) => s.fixture)
        .map((s) => s.fixture)
        .sort(),
    ).toEqual([
      "reference-lounge-table",
      "reference-medical-equipment",
      "reference-workshop-bank",
    ]);
    expect(
      next.sockets.some(
        (s) =>
          s.room === "shop" && s.designId === "pale-studless.console.standard",
      ),
    ).toBe(false);
  });
});
