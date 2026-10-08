import { describe, expect, it } from "vitest";
import { HULL_ACCESS_SOURCE as doc } from "@sidereal/content/hull-access-profile";
import { WAYFARER_ACCESS_SOURCE as previous } from "@sidereal/content/wayfarer-access-profile";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  prefabConstructionDocument,
  prefabWalkFrame,
  prefabWalkRoute,
} from "./prefab-construction";
import {
  compileConstruction,
  readConstructionDraft,
} from "./construction-transactions";
import { prefabEvaModel, evaExitThrough, evaEntryThrough } from "./eva";
import { shipLogicModel } from "./ship-logic-model";
import { prefabCargoSockets } from "./prefab-cargo-sockets";
import { prefabDeckObstacles } from "./prefab-deck-objects";
import { canOccupyDeck } from "./construction-collision";
const catalog = defaultPrefabComponentCatalog();
describe("native hull access authority", () => {
  it("compiles supported native floors without chamber partitions or invisible bulkheads", () => {
    const document = prefabConstructionDocument(doc, catalog);
    expect(() => readConstructionDraft(JSON.stringify(document))).not.toThrow();
    expect(
      compileConstruction(JSON.stringify(document)).readiness.nativeFloors,
    ).toBe(true);
    expect(
      prefabDeckObstacles(doc, catalog).some(
        (o) => o.definitionId === "wayfarer.access.bulkhead",
      ),
    ).toBe(false);
  });
  it("keeps storage positions and identities across profile2 to hull tiles", () => {
    expect(prefabCargoSockets(doc, 0, catalog)).toEqual(
      prefabCargoSockets(previous, 0, catalog),
    );
  });
  it("only grants EVA at an open actual-width hull aperture", () => {
    const model = prefabEvaModel(doc, catalog);
    const open = new Set(["personnel-outer", "cargo-outer"]);
    for (const entry of model.entries) {
      expect(entry.hatch[0]).toBe(-6.5);
      const y = entry.hatch[1];
      expect(evaExitThrough(model, [-6.3, y], [-1, 0], open)?.id).toBe(
        entry.id,
      );
      expect(
        evaExitThrough(model, [-6.3, y], [-1, 0], new Set()),
      ).toBeUndefined();
      expect(evaEntryThrough(model, [-6, y], open)?.id).toBe(entry.id);
    }
  });
  it("has ordinary doors and both-side controls with no pressure chamber cycle", () => {
    const model = shipLogicModel(doc, catalog)!;
    expect(model.chambers).toEqual([]);
    expect(model.doors.map((d) => d.doorId).sort()).toEqual([
      "cargo-outer",
      "personnel-outer",
    ]);
    expect(model.panels).toHaveLength(4);
    expect(model.panels.filter((p) => p.side === "interior")).toHaveLength(2);
    expect(
      doc.logic?.devices.some((d) => d.kind === "airlock-controller"),
    ).toBe(false);
  });
  it("provides supported routes to both sills and all interior controls", () => {
    const frame = prefabWalkFrame(doc, catalog);
    const points = [
      [-6, 3],
      [-6, -7],
      ...shipLogicModel(doc, catalog)!
        .panels.filter((p) => p.side === "interior")
        .map((p) => p.front),
    ];
    for (const position of points) {
      expect(
        canOccupyDeck(
          frame,
          {
            shipId: frame.shipId,
            deckId: frame.deckId,
            position: position as [number, number],
          },
          0.3,
        ),
        JSON.stringify(position),
      ).toBe(true);
      expect(
        prefabWalkRoute(doc, catalog, [0, 0], position as [number, number]).at(
          -1,
        ),
        JSON.stringify(position),
      ).toEqual(position);
    }
  }, 30000);
});
