import { describe, expect, it } from "vitest";
import { bowGlass } from "@sidereal/content/bow-profiles";
import { placedTilePolygon } from "@sidereal/content/construction-grammar";
import { insidePolygon } from "@sidereal/content/construction-grammar";
import {
  deriveInterior,
  volumeGeometry,
  placeMount,
  placeMountTile,
} from "@sidereal/content/ship-prefab";
import { dressShip } from "./ship-dresser";
import { polygonBoundarySample } from "./ship-visual-sampler";
import { referencePlateDecals } from "@sidereal/content/ship-visual-r002";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  compileShipVisual,
  visualProfilesSha256,
  visualVolumeSha256,
  visualCellKey,
  removeShipVisualCells,
} from "./ship-visual-compiler";

describe("versioned reference recipes", () => {
  const doc = PREFAB_SHIPS.find((s) => s.id === "fed.s.wren")!;
  const catalog = defaultPrefabComponentCatalog();
  it("shares smaller anchored wing markings while retaining all legacy and non-plate decals", () => {
    const original = dressShip(doc, { catalog }).decals;
    expect(referencePlateDecals(doc, original)).toBe(original);
    expect(referencePlateDecals(doc, original, "r001")).toBe(original);
    const selected = referencePlateDecals(doc, original, "r002");
    let changed = 0;
    selected.forEach((d, i) => {
      const before = original[i];
      if (d === before) return;
      changed++;
      expect(d.normal[2]).toBe(1);
      expect(["number", "emblem"]).toContain(d.kind);
      for (let axis = 0; axis < 3; axis++) {
        const c = (q: typeof d) =>
          q.corners.reduce((n, p) => n + p[axis] / 4, 0);
        expect(c(d)).toBeCloseTo(c(before), 10);
        const span = (q: typeof d) =>
          Math.max(...q.corners.map((p) => p[axis])) -
          Math.min(...q.corners.map((p) => p[axis]));
        expect(span(d)).toBeCloseTo(span(before) * (axis === 2 ? 1 : 0.6), 10);
      }
    });
    expect(changed).toBe(2);
    expect(
      original
        .filter((d) => d.kind === "name")
        .every((d) => selected.includes(d)),
    ).toBe(true);
  });
  it("tucks pale slope cells behind quiet pressure edges and backs clipped local casings", () => {
    for (const view of ["deck", "flight"] as const) {
      const result = compileShipVisual(
        doc,
        catalog,
        view,
        "federation",
        undefined,
        "r002",
      );
      for (const l of result.layers.filter((l) =>
        l.id.endsWith("sloped-roof-plate"),
      )) {
        const v = doc.volumes.find((v) => l.support === `volume:${v.id}`)!;
        const poly = volumeGeometry(v).outline!.outer.map(
          ([x, y]): [number, number] => [x * 16, y * 16],
        );
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++)
            expect(
              polygonBoundarySample([x + 0.5, y + 0.5], poly).distance,
            ).toBeGreaterThanOrEqual(2);
      }
      if (view !== "deck") continue;
      const wells = result.layers.filter((l) =>
        l.id.endsWith("functional-well"),
      );
      let open = 0;
      for (const l of wells) {
        const [x, y, z, X, Y, Z] = l.bounds;
        for (let a = x; a < X; a++)
          for (let b = y; b < Y; b++)
            for (let c = z; c < Z; c++) {
              if (result.cells.has(visualCellKey(a, b, c))) continue;
              open++;
              expect(
                [
                  [1, 0],
                  [-1, 0],
                  [0, 1],
                  [0, -1],
                ].some(([dx, dy]) =>
                  [1, 2].some(
                    (n) =>
                      result.cells.get(visualCellKey(a + dx * n, b + dy * n, c))
                        ?.role === "core",
                  ),
                ),
              ).toBe(true);
            }
      }
      expect(open).toBeGreaterThan(100);
      const pressure = [...result.cells.values()].find(
        (c) => c.role === "core" && c.family.startsWith("edge:partition:run:"),
      )!;
      expect(pressure).toBeDefined();
      const key = visualCellKey(pressure.x, pressure.y, pressure.z);
      const cut = compileShipVisual(
        doc,
        catalog,
        view,
        "federation",
        new Set([key]),
        "r002",
      );
      expect(cut.cells.has(key)).toBe(false);
      expect(
        [...cut.cells.values()].filter((c) => c.family === pressure.family)
          .length,
      ).toBe(
        [...result.cells.values()].filter((c) => c.family === pressure.family)
          .length - 1,
      );
      expect(result.layers.some((l) => l.id.endsWith("control-casing"))).toBe(
        true,
      );
    }
  });
  it("reconstructs actual diagonal owners and shallow five-cell trays with original guarded facets", () => {
    for (const ship of [doc, PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!])
      for (const view of ["deck", "flight"] as const) {
        const r = compileShipVisual(
          ship,
          catalog,
          view,
          "federation",
          undefined,
          "r002",
        );
        const owned = [...r.cells.values()].filter((c) => c.facetFaces);
        const interior = deriveInterior(ship, 0, catalog);
        const geoms = ship.volumes.map(volumeGeometry);
        const frameRects = ship.mounts
          .filter((m) => m.attach === "edge")
          .map(
            (m) => placeMount(m, catalog.get(m.component), geoms, ship).rect,
          );
        const opticalPolys = ship.volumes.flatMap((v) =>
          v.tiles.filter(bowGlass).map(placedTilePolygon),
        );
        const opticalEdges = [
          ...interior.exteriorSlopes.filter((e) => e.glass),
          ...[...interior.exteriorWalls, ...interior.partitions].filter(
            (e) =>
              e.type === "window" ||
              e.type === "wall.glazed" ||
              e.variant === "glazed",
          ),
        ];
        const apertureGuards = r.layers.filter(
          (l) =>
            l.role === "void" &&
            (l.id.endsWith(":opening") || l.id.endsWith(":glass-aperture")),
        );
        // The independent sweep formula includes the full-open outer leaf edge,
        // not just closed opening centres. Frame/opening/optical rings stay raw.
        for (const c of r.cells.values()) {
          if (!c.facet) continue;
          const p = [(c.x + 0.5) / 16, (c.y + 0.5) / 16];
          for (const d of interior.doors) {
            const dx = d.b[0] - d.a[0],
              dy = d.b[1] - d.a[1],
              span = Math.hypot(dx, dy);
            const X = p[0] - (d.a[0] + d.b[0]) / 2,
              Y = p[1] - (d.a[1] + d.b[1]) / 2;
            const w = Math.max(0.6, (span - 0.75) / 2);
            const sweep = w / 2 + 0.005 + 0.95 * w + w / 2;
            expect(
              Math.abs((X * dx + Y * dy) / span) >
                Math.max(span / 2, sweep) + 2 / 16 ||
                Math.abs((-X * dy + Y * dx) / span) > 5 / 16 + 2 / 16,
            ).toBe(true);
          }
          for (const b of frameRects)
            expect(
              p[0] < b[0] - 2 / 16 ||
                p[0] > b[2] + 2 / 16 ||
                p[1] < b[1] - 2 / 16 ||
                p[1] > b[3] + 2 / 16,
            ).toBe(true);
          for (const poly of opticalPolys)
            expect(
              !insidePolygon(poly, p[0], p[1]) &&
                polygonBoundarySample([p[0], p[1]], poly).distance > 2 / 16,
            ).toBe(true);
          for (const e of opticalEdges) {
            const dx = e.b[0] - e.a[0],
              dy = e.b[1] - e.a[1],
              span = Math.hypot(dx, dy);
            const u = ((p[0] - e.a[0]) * dx + (p[1] - e.a[1]) * dy) / span;
            const v =
              Math.abs(-(p[0] - e.a[0]) * dy + (p[1] - e.a[1]) * dx) / span;
            expect(u < -2 / 16 || u > span + 2 / 16 || v > 0.25 + 2 / 16).toBe(
              true,
            );
          }
          for (const a of apertureGuards) {
            expect(
              c.x + 0.5 < a.bounds[0] - 2 ||
                c.x + 0.5 > a.bounds[3] + 2 ||
                c.y + 0.5 < a.bounds[1] - 2 ||
                c.y + 0.5 > a.bounds[4] + 2,
            ).toBe(true);
          }
        }
        expect(owned.length).toBeGreaterThan(50);
        expect(r.layers.some((l) => l.id.endsWith(":molded-shoulder"))).toBe(
          false,
        );
        for (const c of owned) {
          expect(c.role).not.toBe("floor");
          expect(c.surfaceRole).not.toBe("floor");
          expect(["glass", "emit_a", "emit_b"]).not.toContain(c.slot);
          expect(c.facet!.a.filter((v) => v !== 0)).toHaveLength(2);
          expect(
            c.facet!.a.reduce(
              (n, v, i) => n + v * ([c.x, c.y, c.z][i] + 0.5),
              0,
            ),
          ).toBe(c.facet!.d);
          const volume = ship.volumes.find(
            (v) => c.family === `volume:${v.id}`,
          )!;
          const g = volumeGeometry(volume),
            poly = g.outline!.outer.map(([x, y]): [number, number] => [
              x * 16,
              y * 16,
            ]);
          const boundary = polygonBoundarySample([c.x + 0.5, c.y + 0.5], poly);
          expect(
            Math.min(boundary.edgeT, 1 - boundary.edgeT) * boundary.edgeLength,
          ).toBeGreaterThanOrEqual(3);
          for (const h of g.outline!.holes ?? [])
            expect(
              polygonBoundarySample(
                [c.x + 0.5, c.y + 0.5],
                h.map(([x, y]): [number, number] => [x * 16, y * 16]),
              ).distance,
            ).toBeGreaterThan(2);
        }
        const tray = r.layers.filter((l) =>
          l.id.endsWith(":shallow-pressure-tray"),
        );
        expect(tray.length).toBeGreaterThan(0);
        expect(
          owned.some((c) =>
            ship.volumes.some(
              (v) => v.height === "wing" && c.family === `volume:${v.id}`,
            ),
          ),
        ).toBe(true);
        for (const l of tray) {
          expect(l.role).toBe("core");
          expect(l.bounds[5] - l.bounds[2]).toBe(2);
          for (let x = l.bounds[0]; x < l.bounds[3]; x++)
            for (let y = l.bounds[1]; y < l.bounds[4]; y++)
              for (let z = l.bounds[2]; z < l.bounds[5]; z++)
                expect(r.cells.get(visualCellKey(x, y, z))?.role).toBe("core");
        }
        const armour = r.layers.filter((l) =>
          l.id.endsWith(":shallow-offset-armor"),
        );
        expect(armour.every((l) => l.bounds[5] - l.bounds[2] === 1)).toBe(true);
        // Original face qualification remains immutable, while current removals are real.
        const c = owned[0],
          key = visualCellKey(c.x, c.y, c.z);
        const cut = removeShipVisualCells(r.cells, new Set([key]));
        expect(cut.has(key)).toBe(false);
        const next = owned.find((p) => cut.has(visualCellKey(p.x, p.y, p.z)))!;
        expect(cut.get(visualCellKey(next.x, next.y, next.z))?.facetFaces).toBe(
          next.facetFaces,
        );
      }
  }, 20000);
  it("reconstructs the actual picked old rim owners rather than preserving a nominal channel veto", () => {
    const r = compileShipVisual(
      doc,
      catalog,
      "deck",
      "federation",
      undefined,
      "r002",
    );
    for (const [p, d, role] of [
      [[68, -11, 25], 79, "frame"],
      [[70, -9, 23], 79, "core"],
      [[168, 9, 9], 159, "core"],
    ] as const) {
      const c = r.cells.get(visualCellKey(p[0], p[1], p[2]))!;
      expect(c.role).toBe(role);
      expect(c.slot).toBe("secondary");
      expect(c.facet?.a).toEqual([1, -1, 0]);
      expect(c.facet?.d).toBe(d);
      expect(c.facetFaces).toBe(6);
    }
    // Exact whole wing thickness is18 cells; the5-cell finish package is atop it.
    const support = r.cells.get(visualCellKey(70, -9, 10))!;
    expect(support.role).toBe("core");
    expect(support.family).toBe("volume:wing-s");
    const oldRim = r.layers.filter((l) => l.id === "volume:hull:cassette-rim");
    expect(
      oldRim.every(
        (l) =>
          !(
            168 >= l.bounds[0] &&
            168 < l.bounds[3] &&
            9 >= l.bounds[1] &&
            9 < l.bounds[4] &&
            9 >= l.bounds[2] &&
            9 < l.bounds[5]
          ),
      ),
    ).toBe(true);
  });
  it("selects backed floor covers outside real furniture and approaches without a universal grid", () => {
    const ship = PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!;
    const before = JSON.stringify(ship),
      r = compileShipVisual(
        ship,
        catalog,
        "deck",
        "federation",
        undefined,
        "r002",
      );
    const interior = deriveInterior(ship, 0, catalog);
    const coverCells = [];
    for (const l of r.layers.filter((l) => l.id.includes(":floor-cover:")))
      for (let y = l.bounds[1]; y < l.bounds[4]; y++)
        for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
          const c = r.cells.get(visualCellKey(x, y, l.bounds[2]));
          if (c) coverCells.push(c);
        }
    expect(coverCells.length).toBeGreaterThan(200);
    expect(r.layers.some((l) => l.id.endsWith(":floor-course"))).toBe(false);
    let seats = 0;
    for (const l of r.layers.filter((l) => l.id.includes(":floor-cover-seat:")))
      for (let y = l.bounds[1]; y < l.bounds[4]; y++)
        for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
          if (r.cells.has(visualCellKey(x, y, l.bounds[2]))) continue;
          seats++;
          for (const z of [l.bounds[2] - 1, l.bounds[2] - 2])
            expect(r.cells.has(visualCellKey(x, y, z))).toBe(true);
          for (const o of interior.sockets)
            expect(
              (x + 0.5) / 16 < o.at[0] - 1 / 16 ||
                (x + 0.5) / 16 > o.at[0] + o.size[0] + 1 / 16 ||
                (y + 0.5) / 16 < o.at[1] - 1 / 16 ||
                (y + 0.5) / 16 > o.at[1] + o.size[1] + 1 / 16,
            ).toBe(true);
        }
    expect(seats).toBeGreaterThan(50);
    expect(
      coverCells.every(
        (c) => !c.facet && (c.role === "floor" || c.role === "service"),
      ),
    ).toBe(true);
    expect(JSON.stringify(ship)).toBe(before);
  }, 15000);
  it("retains the delivered r001 profile and exact Wren deck volume", () => {
    expect(visualProfilesSha256()).toBe(
      "8c9a58bc361116c1ab663dcad5dd2b05c06fdf1cd7d9711339cdbc714b6649d6",
    );
    expect(
      visualVolumeSha256(
        compileShipVisual(doc, catalog, "deck", "federation").cells,
      ),
    ).toBe("690ef71372e085b118277198c54b341305b20a60e3ceed3f79050d411bf58dab");
    expect(visualProfilesSha256("r002")).not.toBe(visualProfilesSha256("r001"));
    expect(() => visualProfilesSha256("r003")).toThrow("Unknown");
  });
  it("adds three functional wall bay recipes over pressure backing without changing authored placements", () => {
    const before = JSON.stringify(doc);
    const result = compileShipVisual(
      doc,
      catalog,
      "deck",
      "federation",
      undefined,
      "r002",
    );
    for (const suffix of [
      "pressure-backing",
      "inset-armor",
      "vent-recess",
      "control-display",
      "access-handle",
    ])
      expect(result.layers.some((l) => l.id.endsWith(suffix))).toBe(true);
    // Rich inward surfaces must belong to the occupied hull, even where an attached wing
    // hides its outward cassette. A mere partition-only layer does not satisfy this.
    for (const suffix of [
      "inner-service-well",
      "inner-service-backing",
      "inner-task-header",
      "inner-vent-fin",
      "inner-access-latch",
    ]) {
      const rows = result.layers.filter(
        (l) => l.support === "volume:hull" && l.id.endsWith(suffix),
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((l) => l.surfaceRole === "wall")).toBe(true);
    }
    let openCells = 0,
      backedCells = 0;
    for (const well of result.layers.filter(
      (l) => l.support === "volume:hull" && l.id.endsWith("inner-service-well"),
    )) {
      const [x, y, z, X, Y, Z] = well.bounds;
      for (let a = x; a < X; a++)
        for (let b = y; b < Y; b++)
          for (let c = z; c < Z; c++) {
            if (result.cells.has(visualCellKey(a, b, c))) continue;
            openCells++;
            if (
              [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
              ].some(([dx, dy]) => {
                const backing = result.cells.get(
                  visualCellKey(a + dx, b + dy, c),
                );
                return backing !== undefined;
              })
            )
              backedCells++;
          }
    }
    expect(openCells).toBeGreaterThan(100);
    expect(backedCells).toBe(openCells);
    const guards = result.layers.filter((l) =>
      l.id.endsWith(":continuous-sill"),
    );
    expect(guards.length).toBeGreaterThan(0);
    for (const layer of guards) {
      const volume = doc.volumes.find(
        (v) => layer.support === `volume:${v.id}`,
      )!;
      const outline = volumeGeometry(volume).outline!;
      const outer = outline.outer.map(([x, y]): [number, number] => [
        x * 16,
        y * 16,
      ]);
      for (let y = layer.bounds[1]; y < layer.bounds[4]; y++)
        for (let x = layer.bounds[0]; x < layer.bounds[3]; x++) {
          const p: [number, number] = [x + 0.5, y + 0.5];
          if (insidePolygon(outer, p[0], p[1]))
            expect(polygonBoundarySample(p, outer).distance).toBeLessThan(4);
          else {
            // The whole cell, including its corners, stays in the declared outer envelope.
            for (const q of [
              [x, y],
              [x + 1, y],
              [x + 1, y + 1],
              [x, y + 1],
            ] as [number, number][])
              if (!insidePolygon(outer, q[0], q[1]))
                expect(
                  polygonBoundarySample(q, outer).distance,
                ).toBeLessThanOrEqual(3);
          }
          for (const hole of outline.holes)
            expect(
              insidePolygon(
                hole.map(([x, y]) => [x * 16, y * 16]),
                p[0],
                p[1],
              ),
            ).toBe(false);
        }
    }
    // Attachment occlusion is resolved in assembled space, not a modulo recipe.
    expect(
      result.layers.some(
        (l) => l.support === "volume:wing-s" && l.id.endsWith(":vent-recess"),
      ),
    ).toBe(true);
    for (const l of result.layers.filter(
      (l) => l.support === "volume:hull" && l.id.endsWith(":vent-recess"),
    )) {
      const [x, y, , , ,] = l.bounds;
      // Both Wren wings cover the parent's lower side wall over the aft five metres.
      if (x < 80) expect(y).toBeGreaterThan(3);
    }
    const roof = compileShipVisual(
      doc,
      catalog,
      "flight",
      "federation",
      undefined,
      "r002",
    );
    expect(
      roof.layers
        .filter((l) => l.id.endsWith(":roof"))
        .every((l) => l.slot === "secondary"),
    ).toBe(true);
    const wells = roof.layers.filter((l) =>
      l.id.endsWith(":roof-protected-channel"),
    );
    expect(wells.length).toBeGreaterThan(0);
    // The well must actually remain open above an intact pressure tray after
    // ordered compaction, including where a shoulder overlaps an assembly joint.
    let recessed = 0;
    for (const well of wells) {
      const [x, y, z, X, Y] = well.bounds;
      for (let a = x; a < X; a++)
        for (let b = y; b < Y; b++) {
          if (roof.cells.has(visualCellKey(a, b, z + 2))) continue;
          recessed++;
          expect(roof.cells.has(visualCellKey(a, b, z - 1))).toBe(true);
        }
    }
    expect(recessed).toBeGreaterThan(100);
    expect(
      roof.layers.some(
        (l) =>
          l.support === "volume:wing-s" &&
          l.id.endsWith(":roof-housed-shoulder"),
      ),
    ).toBe(true);
    expect(
      roof.layers.some((l) => l.id.endsWith(":continuous-upper-guard")),
    ).toBe(false);
    expect(result.cells.size).toBeGreaterThan(10000);
    expect(JSON.stringify(doc)).toBe(before);
    expect(() =>
      compileShipVisual(doc, catalog, "deck", "federation", undefined, "r003"),
    ).toThrow("Unknown");
  });
  it("joins unequal task-sized roof cases to the backing and leaves functional recesses visible", () => {
    for (const id of ["fed.s.wren", "fed.m.crest"]) {
      const ship = PREFAB_SHIPS.find((s) => s.id === id)!,
        r = compileShipVisual(
          ship,
          catalog,
          "flight",
          "federation",
          undefined,
          "r002",
        );
      const geoms = ship.volumes.map(volumeGeometry);
      const occupied = [
        ...ship.mounts
          .filter((m) => m.attach === "top")
          .map(
            (m) => placeMount(m, catalog.get(m.component), geoms, ship).rect,
          ),
        ...(ship.mountTiles ?? []).map((m) => placeMountTile(m, geoms).rect),
      ];
      const blocked = (x: number, y: number) =>
        occupied.some(
          (b) =>
            (x + 0.5) / 16 >= b[0] &&
            (x + 0.5) / 16 <= b[2] &&
            (y + 0.5) / 16 >= b[1] &&
            (y + 0.5) / 16 <= b[3],
        );
      const cases = r.layers.filter(
        (l) => l.id.includes(":roof-task-case:") && l.support === "volume:hull",
      );
      expect(new Set(cases.map((l) => l.id)).size).toBeGreaterThanOrEqual(2);
      let visible = 0;
      const upperLevels = new Set<number>();
      for (const l of cases)
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
            const z = l.bounds[5] - 1,
              cell = r.cells.get(visualCellKey(x, y, z));
            if (
              !cell ||
              cell.role !== "plate" ||
              r.cells.has(visualCellKey(x, y, z + 1)) ||
              blocked(x, y)
            )
              continue;
            visible++;
            upperLevels.add(z);
            expect(r.cells.has(visualCellKey(x, y, l.bounds[2] - 1))).toBe(
              true,
            );
          }
      expect(visible).toBeGreaterThan(1000);
      expect(upperLevels.size).toBeGreaterThanOrEqual(2);
      let open = 0;
      for (const l of r.layers.filter(
        (l) =>
          l.support === "volume:hull" &&
          l.id.endsWith(":roof-functional-pocket"),
      ))
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
            if (
              r.cells.has(visualCellKey(x, y, l.bounds[2] + 1)) ||
              blocked(x, y)
            )
              continue;
            open++;
            const backing = [l.bounds[2] - 1, l.bounds[2] - 2].find((z) =>
              r.cells.has(visualCellKey(x, y, z)),
            );
            expect(backing).toBeDefined();
            const cell = r.cells.get(visualCellKey(x, y, backing!))!;
            const topCore = cell.role === "core" ? backing! : backing! - 1;
            for (const z of [topCore, topCore - 1])
              expect(r.cells.get(visualCellKey(x, y, z))?.role).toBe("core");
          }
      expect(open).toBeGreaterThan(100);
    }
  }, 15000);
  it("leaves two exposed backed roof service routes beside actual fittings and preserves marking fields", () => {
    for (const id of ["fed.s.wren", "fed.m.crest"]) {
      const ship = PREFAB_SHIPS.find((d) => d.id === id)!;
      const geoms = ship.volumes.map(volumeGeometry);
      const roof = compileShipVisual(
        ship,
        catalog,
        "flight",
        "federation",
        undefined,
        "r002",
      );
      const obstacles = [
        ...ship.mounts
          .filter((m) => m.attach === "top")
          .map(
            (m) => placeMount(m, catalog.get(m.component), geoms, ship).rect,
          ),
        ...(ship.mountTiles ?? []).map((t) => placeMountTile(t, geoms).rect),
      ];
      const markings = referencePlateDecals(
        ship,
        dressShip(ship, { catalog }).decals,
        "r002",
      )
        .filter((d) => d.normal[2] > 0.99)
        .map((d) => [
          Math.min(...d.corners.map((p) => p[0])),
          Math.min(...d.corners.map((p) => p[1])),
          Math.max(...d.corners.map((p) => p[0])),
          Math.max(...d.corners.map((p) => p[1])),
        ]);
      const hull = geoms.find((g) => g.volume.id === "hull")!;
      const outline = hull.outline!.outer.map(([x, y]): [number, number] => [
        x * 16,
        y * 16,
      ]);
      const mid = (hull.bounds[1] + hull.bounds[3]) * 8;
      const separation = (hull.bounds[3] - hull.bounds[1]) * 16 * 0.17;
      const counts = [0, 0];
      for (const c of roof.cells.values()) {
        if (
          c.family !== "volume:hull" ||
          c.surfaceRole !== "roof" ||
          c.slot === "primary" ||
          c.z < hull.z[1] - 5 ||
          roof.cells.has(visualCellKey(c.x, c.y, c.z + 1)) ||
          Math.abs(c.y - mid) < separation ||
          polygonBoundarySample([c.x + 0.5, c.y + 0.5], outline).distance < 6
        )
          continue;
        const x = (c.x + 0.5) / 16,
          y = (c.y + 0.5) / 16;
        if (
          [...obstacles, ...markings].some(
            (r) =>
              x >= r[0] - 0.125 &&
              x < r[2] + 0.125 &&
              y >= r[1] - 0.125 &&
              y < r[3] + 0.125,
          )
        )
          continue;
        counts[c.y < mid ? 0 : 1]++;
        expect(
          [1, 2, 3, 4].some((n) =>
            roof.cells.has(visualCellKey(c.x, c.y, c.z - n)),
          ),
        ).toBe(true);
      }
      // These are surviving top-facing cells beyond the occupied centreline, not
      // source-layer names or a count of a well hidden beneath an installed turret.
      expect(counts[0]).toBeGreaterThan(200);
      expect(counts[1]).toBeGreaterThan(200);
      for (const layer of roof.layers.filter((l) =>
        l.id.endsWith(":roof-protected-channel"),
      )) {
        const [x, y, , X, Y] = layer.bounds;
        for (let a = x; a < X; a++)
          for (let b = y; b < Y; b++)
            expect(
              markings.some(
                (r) =>
                  (a + 0.5) / 16 >= r[0] &&
                  (a + 0.5) / 16 < r[2] &&
                  (b + 0.5) / 16 >= r[1] &&
                  (b + 0.5) / 16 < r[3],
              ),
            ).toBe(false);
      }
      const deck = compileShipVisual(
        ship,
        catalog,
        "deck",
        "federation",
        undefined,
        "r002",
      );
      expect(
        deck.layers.some(
          (l) => l.id.endsWith(":shaped-end") && !l.id.startsWith("partition:"),
        ),
      ).toBe(false);
      expect(
        deck.layers
          .filter((l) => l.id.startsWith("post:"))
          .every((l) => l.bounds[5] <= 25),
      ).toBe(true);
    }
    // Four complete Wren/Crest deck/flight compiles exercise assembled visibility;
    // CI contention may exceed Vitest's default 5s. Keep this workload locally bounded.
  }, 20000);
});
