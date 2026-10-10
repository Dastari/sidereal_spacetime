import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "./prefabs/index";
import { defaultPrefabComponentCatalog } from "./ship-prefab-catalog";
import { deriveInterior } from "./ship-prefab";
import {
  DECK_OBJECT_DESIGNS,
  interiorArtQuarterTurns,
  isCrewStationDesign,
} from "./ship-furniture";

const catalog = defaultPrefabComponentCatalog();

describe("interior facing convention", () => {
  it("turns console art (operator on the +Y access side, looking -Y) to face its operator's view", () => {
    for (const id of [
      "console.navigation.sm",
      "console.command.sm",
      "console.sensor.sm",
      "console.fire-control.sm",
      "console.engineering.sm",
      "shipyard.equipment.command-console",
      "shipyard.equipment.bridge-bank",
      "pale-studless.console.standard",
    ])
      expect(interiorArtQuarterTurns(id), id).toBe(2);
    // Seats look along their access side; fixtures open into the room: no turn.
    for (const id of DECK_OBJECT_DESIGNS.filter(
      (d) => !/console|bridge-bank/.test(d),
    ))
      expect(interiorArtQuarterTurns(id), id).toBe(0);
    for (const id of ["reactor.md", "crew-bunk.sm", "fuel-tank.sm"])
      expect(interiorArtQuarterTurns(id), id).toBe(0);
    expect(isCrewStationDesign("shipyard.equipment.pilot-seat")).toBe(true);
  });

  for (const prefab of PREFAB_SHIPS)
    it(`${prefab.id}: the pilot looks at the bow`, () => {
      const pilot = prefab.mounts.filter(
        (m) =>
          m.attach === "interior" &&
          catalog.get(m.component)?.station === "pilot",
      );
      for (const m of pilot) expect(m.normal ?? "fore", m.id).toBe("fore");
      const interior = deriveInterior(prefab, 0, catalog);
      expect(interior.station, "pilot station").not.toBeNull();
      for (const s of interior.sockets) {
        if (s.fixture) {
          // Explicit workstations look in their authored operator direction; their
          // role/position need not match the automatic bridge furniture recipe.
          const authored = prefab.fixtures!.find((f) => f.id === s.fixture)!;
          expect(authored, s.fixture).toBeDefined();
          expect(s.facing, s.fixture).toBe(authored.facing);
          continue;
        }
        if (
          s.designId.endsWith("pilot-seat") ||
          s.designId.endsWith("command-console")
        )
          expect(s.facing, s.designId).toBe("fore");
        // The bridge bank stands at the aft end of the bridge, worked from the room side.
        if (s.designId.endsWith("bridge-bank")) expect(s.facing).toBe("aft");
      }
    });
});
