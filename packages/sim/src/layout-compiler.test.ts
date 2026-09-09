import { describe, it, expect } from "vitest";
import {
  emptyLayout,
  stampTile,
  layoutFixture,
  transformPoint,
  migrateAssembly,
  type Point,
  type LayoutDocument,
} from "../../content/src/ship-layout";
import { compileLayout, segmentSupported } from "./layout-compiler";
import { area2, canonicalPolygon, segmentKey } from "./layout-geometry";
import { readLayout } from "./layout-validation";
const rectangle = (id: string, x: number, y: number, w = 32, h = 32) => ({
  ...stampTile(id, "d", "rectangle", [0, 0]),
  vertices: [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ] as Point[],
});
const doc = (tiles: LayoutDocument["tiles"]) => ({
  ...emptyLayout("test", "d"),
  tiles,
});
const errors = (d: LayoutDocument) =>
  compileLayout(d)
    .diagnostics.filter((d) => d.severity === "error")
    .map((d) => d.code);
describe("deterministic lattice floor compiler", () => {
  it("splits partial shared edges and cancels T junctions without duplicate walls", () => {
    const d = doc([
        rectangle("a", 0, 0, 64, 64),
        rectangle("b", 64, 0),
        rectangle("c", 64, 32),
      ]),
      r = compileLayout(d);
    expect(errors(d)).toEqual([]);
    expect(r.area).toBe(6);
    expect(r.loops).toHaveLength(1);
    expect(r.components).toBe(1);
    expect(r.walls.filter((w) => w.a[0] === 64 && w.b[0] === 64)).toHaveLength(
      0,
    );
    expect(new Set(r.walls.map((w) => segmentKey(w.a, w.b))).size).toBe(
      r.walls.length,
    );
    expect(r.edges.find((e) => e.tileIds.join(",") === "a,b")).toBeTruthy();
  });
  it("has byte-stable output across tile/property order and input winding/start vertex", () => {
    const a = doc([rectangle("a", 0, 0), rectangle("b", 32, 0)]),
      b = structuredClone(a);
    b.tiles.reverse();
    b.tiles.forEach(
      (t) => (t.vertices = [...t.vertices.slice(1), t.vertices[0]].reverse()),
    );
    expect(JSON.stringify(compileLayout(a))).toBe(
      JSON.stringify(compileLayout(b)),
    );
  });
  it("is equivariant under rotations/reflections without changing ownership or area", () => {
    const a = doc([rectangle("a", 0, 0, 64, 64), rectangle("b", 64, 0)]),
      base = compileLayout(a);
    for (let turns = 0; turns < 4; turns++)
      for (const flip of [false, true]) {
        const b = structuredClone(a);
        b.tiles.forEach(
          (t) =>
            (t.vertices = t.vertices.map((p) =>
              transformPoint(p, turns, flip),
            )),
        );
        const r = compileLayout(b);
        expect(r.valid).toBe(true);
        expect(r.area).toBe(base.area);
        expect(r.walls.map((w) => segmentKey(w.a, w.b)).sort()).toEqual(
          base.walls
            .map((w) =>
              segmentKey(
                transformPoint(w.a, turns, flip),
                transformPoint(w.b, turns, flip),
              ),
            )
            .sort(),
        );
      }
  });
  it("classifies an explicitly declared hole, and rejects undeclared voids", () => {
    const tiles = [];
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++)
        if (x !== 1 || y !== 1)
          tiles.push(rectangle(`${x}${y}`, x * 32, y * 32));
    const d = doc(tiles);
    expect(errors(d)).toContain("unclassified-hole");
    d.decks[0].holes = [{ id: "shaft", seed: [48, 48] }];
    const r = compileLayout(d);
    expect(r.valid).toBe(true);
    expect(r.loops.map((l) => l.kind).sort()).toEqual(["exterior", "hole"]);
    expect(r.walls).toHaveLength(16);
    expect(r.roof).toHaveLength(8);
  });
  it("supports a concave union and catalog triangle/trapezoid bow", () => {
    expect(
      compileLayout(
        doc([
          rectangle("a", 0, 0),
          rectangle("b", 32, 0),
          rectangle("c", 0, 32),
        ]),
      ).valid,
    ).toBe(true);
    const d = layoutFixture();
    expect(errors(d)).toEqual([]);
    expect(compileLayout(d).loops).toHaveLength(1);
  });
  it("rejects point contacts, disconnected islands, overlaps and malformed polygons", () => {
    expect(
      errors(doc([rectangle("a", 0, 0), rectangle("b", 32, 32)])),
    ).toContain("point-contact");
    expect(
      errors(doc([rectangle("a", 0, 0), rectangle("b", 64, 0)])),
    ).toContain("islands");
    expect(
      errors(doc([rectangle("a", 0, 0), rectangle("b", 16, 0)])),
    ).toContain("overlap");
    const d = doc([rectangle("a", 0, 0)]);
    d.tiles[0].vertices = [
      [0, 0],
      [32, 32],
      [0, 32],
      [32, 0],
    ];
    expect(errors(d)).toContain("polygon");
    d.tiles[0].vertices = [
      [0, 0],
      [32, 0],
      [32, 0],
      [0, 32],
    ];
    expect(errors(d)).toContain("polygon");
    d.tiles[0].vertices = [
      [0, 0],
      [32, 0],
      [16, 16],
      [0, 0],
    ];
    expect(errors(d)).toContain("polygon");
  });
  it("admits exact bounded inputs before geometry and reports unknown revisions", () => {
    const d = doc(
      Array.from({ length: 2049 }, (_, i) => rectangle(`t${i}`, 0, 0)),
    );
    expect(errors(d)).toEqual(["admission"]);
    const bad = doc([rectangle("a", 0, 0)]);
    bad.tiles[0].vertices[0][0] = Infinity;
    expect(errors(bad)).toEqual(["admission"]);
    bad.tiles[0].vertices[0][0] = 0.1;
    expect(errors(bad)).toEqual(["admission"]);
    bad.tiles[0].vertices[0][0] = 0;
    bad.compiler = "future";
    expect(() => readLayout(bad)).toThrow("Unsupported");
    bad.compiler = "floorplan-1";
    bad.dependencies[0].revision = "future";
    expect(() => readLayout(bad)).toThrow("Unknown");
  });
  it("enforces normalized edge and coordinate span budgets", () => {
    const d = doc(
      Array.from({ length: 2048 }, (_, i) =>
        rectangle(`a${i}`, (i % 64) * 64, Math.floor(i / 64) * 64, 32, 32),
      ),
    );
    d.tiles[0].shape = "trapezoid";
    expect(compileLayout(d).edges.length).toBeLessThanOrEqual(8192);
    const wide = doc([rectangle("a", -8192, 0), rectangle("b", 8192 - 32, 0)]);
    expect(errors(wide)).toContain("span");
  });
});
describe("rooms, openings and typed design interfaces", () => {
  const divided = () => {
    const d = doc([
      rectangle("a", 0, 0, 64, 64),
      rectangle("b", 64, 0, 64, 64),
    ]);
    d.partitions = [
      { id: "p", deckId: "d", a: [64, 0], b: [64, 64], seal: "design-sealed" },
    ];
    d.rooms = [
      {
        id: "r1",
        deckId: "d",
        name: "Cabin",
        type: "Cabin",
        seed: [32, 32],
        boundaryIds: ["p"],
        access: "crew",
        floorTheme: "x",
        wallTheme: "x",
      },
      {
        id: "r2",
        deckId: "d",
        name: "Hall",
        type: "Corridor",
        seed: [96, 32],
        boundaryIds: ["p"],
        access: "crew",
        floorTheme: "x",
        wallTheme: "x",
      },
    ];
    return d;
  };
  it("separates semantic regions and derives a portal without inventing gas state", () => {
    const d = divided();
    d.openings = [
      {
        id: "door",
        deckId: "d",
        partitionId: "p",
        a: [64, 16],
        b: [64, 48],
        clearance: 32,
        sill: 0,
        kind: "door",
      },
    ];
    const r = compileLayout(d);
    expect(errors(d)).toEqual([]);
    expect(r.rooms.map((r) => r.area)).toEqual([4, 4]);
    expect(r.portals[0].roomIds).toEqual(["r1", "r2"]);
    expect(r.walls.filter((w) => w.source === "partition")).toHaveLength(2);
    expect(r).not.toHaveProperty("pressure");
    d.partitions = [];
    d.openings = [];
    d.rooms.forEach((r) => (r.boundaryIds = []));
    expect(compileLayout(d).diagnostics.map((d) => d.code)).toContain(
      "room-open-connection",
    );
  });
  it("rejects duplicate walls, unsupported anchors, overlapping openings and blocked sweeps", () => {
    const d = divided();
    d.partitions.push({ ...d.partitions[0], id: "p2" });
    expect(errors(d)).toContain("duplicate-partition");
    d.partitions.pop();
    d.partitions[0].a = [60, 0];
    expect(errors(d)).toContain("partition-anchor");
    d.partitions[0].a = [64, 0];
    d.openings = [
      {
        id: "door",
        deckId: "d",
        partitionId: "p",
        a: [64, 16],
        b: [64, 48],
        clearance: 128,
        sill: 0,
        kind: "door",
      },
    ];
    expect(errors(d)).toContain("opening-clearance");
    d.openings[0].clearance = 32;
    d.openings.push({ ...d.openings[0], id: "door2" });
    expect(errors(d)).toContain("opening-overlap");
  });
  it("crossings create no implicit junction and typed endpoint mismatch rejects", () => {
    const d = layoutFixture(),
      r = compileLayout(d);
    expect(r.routeComponents.filter((c) => c.channel === "data")).toHaveLength(
      2,
    );
    d.routes[0].to = "end-data";
    expect(errors(d)).toContain("route-endpoint");
  });
  it("checks entire route support rather than only endpoints", () => {
    const tiles = [rectangle("a", 0, 0), rectangle("b", 64, 0)].map((t) => ({
      ...t,
      vertices: canonicalPolygon(t.vertices),
    }));
    expect(segmentSupported([16, 16], [80, 16], tiles)).toBe(false);
    expect(segmentSupported([1, 1], [31, 31], tiles)).toBe(true);
  });
  it("preserves empty physical container identity and rejects copied contents", () => {
    const d = divided();
    d.fittings = [
      {
        id: "crate-uuid",
        deckId: "d",
        definitionId: "crate",
        revision: "draft",
        position: [16, 16],
        quarterTurns: 0,
        reflected: false,
        footprint: [16, 16],
        clearance: 0,
        kind: "container",
        container: { columns: 4, rows: 3, contents: [] },
      },
    ];
    expect(readLayout(d).fittings[0].id).toBe("crate-uuid");
    (d.fittings[0].container!.contents as unknown[]).push({ id: "live-item" });
    expect(() => readLayout(d)).toThrow("empty");
  });
});
describe("assembly preservation", () => {
  it("retains unknown assets, transforms, damage, IDs and original undo/redo bytes", () => {
    const present = {
      schema: "sidereal.assembly-draft.v1",
      id: "old",
      name: "Old",
      parts: [
        {
          id: "retained",
          assetId: "unknown",
          position: [1, 2, 3],
          removedCells: [[1, 2, 3]],
          rotation: 1.1,
          flipped: true,
        },
      ],
    };
    const raw = JSON.stringify(
      { past: [present], present, future: [present] },
      null,
      2,
    );
    const result = migrateAssembly(raw, "new", "deck");
    expect(result.legacy?.sourceRaw).toBe(raw);
    expect(result.legacy?.placements).toEqual(present.parts);
    expect(result.tiles).toEqual([]);
    expect(result.legacy?.unresolved).toEqual(["retained"]);
  });
});
