import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { WAYFARER_ACCESS_SOURCE as proposed } from "@sidereal/content/wayfarer-access-profile";
import { deriveInterior, readShipPrefab } from "@sidereal/content/ship-prefab";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  prefabConstructionDocument,
  prefabLayout,
  prefabWalkFrame,
  prefabWalkRoute,
} from "./prefab-construction";
import { canOccupyDeck } from "./construction-collision";
import { prefabBedSeats, qualifyPrefabBed } from "./prefab-seats";
import { prefabCargoSockets } from "./prefab-cargo-sockets";
import { prefabDeckObstacles, prefabShipObjects } from "./prefab-deck-objects";
import { compileLayout } from "./layout-compiler";
import { bindConstructionLayout } from "./construction-layout";
import {
  compileConstruction,
  readConstructionDraft,
} from "./construction-transactions";
import {
  prefabEvaModel,
  evaExitThrough,
  evaEntryThrough,
  evaSolidAt,
} from "./eva";
import { shipLogicModel } from "./ship-logic-model";

const FED_WAYFARER = readShipPrefab(
  JSON.parse(
    readFileSync(
      new URL("../../content/src/wayfarer-prefab.v1.json", import.meta.url),
      "utf8",
    ),
  ),
);
const catalog = defaultPrefabComponentCatalog();
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");

describe("Wayfarer legacy and active access geometry qualification", () => {
  it("keeps original profile1 construction, geometry, pressure input and fitting identities exact", () => {
    const d = FED_WAYFARER;
    const actual = {
      interior: deriveInterior(d, 0, catalog),
      layout: prefabLayout(d, catalog),
      construction: prefabConstructionDocument(d, catalog),
      obstacles: prefabDeckObstacles(d, catalog),
      objects: prefabShipObjects(d, catalog),
    };
    expect(
      Object.fromEntries(Object.entries(actual).map(([k, v]) => [k, hash(v)])),
    ).toEqual(PROFILE1_GOLDENS);
  });
  it("admits the derived access blueprint but rejects a profile swapped onto the old layout", () => {
    const draft = prefabConstructionDocument(FED_WAYFARER, catalog);
    draft.prefab.document = structuredClone(proposed);
    expect(() => readConstructionDraft(JSON.stringify(draft))).toThrow(
      /differs|mismatch|derived|binding/,
    );
    const access = prefabConstructionDocument(proposed, catalog);
    expect(() => readConstructionDraft(JSON.stringify(access))).not.toThrow();
  });
  it("derives supported native floor interfaces, exact inner partitions and conservative clear lanes", () => {
    const layout = prefabLayout(proposed, catalog);
    expect(
      compileLayout(layout).diagnostics.filter((d) => d.severity === "error"),
    ).toEqual([]);
    // A layout alone cannot authorize source-backed support clips. Only the
    // complete canonical profile reconstructs the six native boundary subsets.
    expect(bindConstructionLayout(layout).unmatched.sort()).toEqual(
      [-9, -8, -7, -6, 2, 3].map((x) => `floor-${x}--5.5`).sort(),
    );
    const bound = prefabConstructionDocument(proposed, catalog);
    expect(bound.floors).toHaveLength(bound.layout.tiles.length);
    expect(bound.floors.filter((f) => f.nativeSupportClip)).toHaveLength(6);
    expect(
      compileConstruction(JSON.stringify(bound)).readiness.nativeFloors,
    ).toBe(true);
    expect(layout.partitions).toHaveLength(6);
    const widths = Object.fromEntries(
      layout.openings.map((o) => [
        o.id,
        Math.hypot(o.b[0] - o.a[0], o.b[1] - o.a[1]) / 32,
      ]),
    );
    expect(widths).toEqual({
      "opening-personnel-inner": 1.1875,
      "opening-cargo-inner": 3.75,
    });
    const base = deriveInterior(FED_WAYFARER, 0, catalog).floors;
    const floors = deriveInterior(proposed, 0, catalog).floors;
    const outside = (x: number) => !((x >= -9 && x < -5) || (x >= 2 && x < 4));
    expect(floors.filter((f) => outside(f.cell[0]))).toEqual(
      base.filter((f) => outside(f.cell[0])),
    );
  });
  it("uses actual personnel and cargo width with body clearance for EVA entry and exit", () => {
    const model = prefabEvaModel(proposed, catalog);
    const cargo = model.entries.find((e) => e.id === "cargo-outer")!;
    const personnel = model.entries.find((e) => e.id === "personnel-outer")!;
    const open = new Set([cargo.id, personnel.id]);
    expect(cargo.clearHalfM).toBe(1.875);
    expect(personnel.clearHalfM).toBe(0.6);
    expect(evaExitThrough(model, [-6.8, -5.5], [-1, 0], open)?.id).toBe(
      cargo.id,
    );
    expect(evaExitThrough(model, [-6.8, -5.4], [-1, 0], open)).toBeUndefined();
    expect(evaEntryThrough(model, [-6.5, -5.5], open)?.id).toBe(cargo.id);
    expect(evaEntryThrough(model, [-6.5, -5.4], open)).toBeUndefined();
    expect(evaSolidAt(model, [-6.8, -5.5], new Set())).toBe(true);
    expect(evaExitThrough(model, [-6.8, 3.29], [-1, 0], open)?.id).toBe(
      personnel.id,
    );
    expect(evaExitThrough(model, [-6.8, 3.31], [-1, 0], open)).toBeUndefined();
  });
  it("derives both complete real controllers and reachable wall controls from the proposed source", () => {
    const model = shipLogicModel(proposed, catalog)!;
    expect(model.doors).toHaveLength(4);
    expect(model.panels).toHaveLength(8);
    expect(
      model.chambers.map((c) => ({ room: c.room, bounds: c.bounds })),
    ).toEqual([
      { room: "cargo_chamber", bounds: [-7, -9, -3, -5] },
      { room: "personnel_chamber", bounds: [-7, 2, -3, 4] },
    ]);
  });
  it("retains supported routes to all six interior controls and both original beds", () => {
    const frame = prefabWalkFrame(proposed, catalog);
    const panels = shipLogicModel(proposed, catalog)!.panels.filter(
      (p) => p.side === "interior",
    );
    expect(panels).toHaveLength(6);
    for (const panel of panels) {
      expect(
        canOccupyDeck(
          frame,
          { shipId: frame.shipId, deckId: frame.deckId, position: panel.front },
          0.3,
        ),
      ).toBe(true);
      expect(
        prefabWalkRoute(proposed, catalog, [0, 0], panel.front).at(-1),
      ).toEqual(panel.front);
    }
    const beds = prefabBedSeats(proposed, catalog);
    expect(beds).toHaveLength(2);
    for (const bed of beds) {
      expect(qualifyPrefabBed(frame, bed)).toBe(true);
      expect(
        prefabWalkRoute(
          proposed,
          catalog,
          [0, 0],
          [bed.approachX, bed.approachY],
        ).at(-1),
      ).toEqual([bed.approachX, bed.approachY]);
    }
    // These are static supported routes with inner passages open. Accepted
    // closed-door blocking and controller traversal are qualified on the wire.
  }, 30000);
  it("moves storage socket centres and approaches with fittings while retaining stable keys", () => {
    const original = prefabCargoSockets(FED_WAYFARER, 0, catalog);
    const candidate = prefabCargoSockets(proposed, 0, catalog);
    expect(candidate.map((s) => s.key)).toEqual(original.map((s) => s.key));
    for (const [key, dx, dy] of [
      ["Cargo_crate_small_white", 0.5, 1.2],
      ["Cargo_crate_yellow", 1.6, 0],
      ["Hydroponics_hydro_locker", 2.1, -0.8],
      ["Cargo_crate_white_blue", 3.45, 0],
    ] as const) {
      const before = original.find((s) => s.key === key)!,
        after = candidate.find((s) => s.key === key)!;
      expect(after.centreM[0]).toBeCloseTo(before.centreM[0] - dy, 5);
      expect(after.centreM[1]).toBeCloseTo(before.centreM[1] + dx, 5);
      expect(after.approachesM).toHaveLength(before.approachesM.length);
      for (let i = 0; i < after.approachesM.length; i++) {
        expect(after.approachesM[i][0]).toBeCloseTo(
          before.approachesM[i][0] - dy,
          5,
        );
        expect(after.approachesM[i][1]).toBeCloseTo(
          before.approachesM[i][1] + dx,
          5,
        );
      }
    }
  });
});

const PROFILE1_GOLDENS = {
  interior: "6e953d48476b3ec4de1cf10236e96aab88aef0b0b7efe61cba40bab87fe187a9",
  layout: "b941dc5f674953d9183ceda53d924bb0d5ef0f414a47f1094e197ed739b60ab1",
  construction:
    "ca0d78247309166edc259e15bc0c05c0f43f335120219da51aac43f6292c4c40",
  obstacles: "6c7e4a596442163f2e19d571cd418dae36fdc0f859f2816357c2f896b6da2324",
  objects: "3e588fed57f65a7601edf9d00ffd566a60c61b02e87d647843b8bf0c973907b0",
};
