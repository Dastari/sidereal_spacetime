import { describe, expect, it } from "vitest";
import { bowGlass } from "@sidereal/content/bow-profiles";
import { G, placedTilePolygon } from "@sidereal/content/construction-grammar";
import { insidePolygon } from "@sidereal/content/construction-grammar";
import {
  deriveInterior,
  volumeGeometry,
  placeMount,
  placeMountTile,
} from "@sidereal/content/ship-prefab";
import { dressShip } from "./ship-dresser";
import { polygonBoundarySample } from "./ship-visual-sampler";
import {
  referencePlateDecals,
  SHIP_VISUAL_MACRO_PROFILES_R002,
} from "@sidereal/content/ship-visual-r002";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  compileShipVisual,
  visualProfilesSha256,
  visualVolumeSha256,
  visualCellKey,
  removeShipVisualCells,
  type VisualCell,
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
      let pressure: VisualCell | undefined;
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
      expect(open).toBeGreaterThan(0);
      // Every selected seat is exactly one outer partition course; the two
      // central pressure planes survive on BOTH sides, including after a cut.
      for (const well of wells) {
        const [x, y, z, X, Y, Z] = well.bounds;
        const vertical = X - x === 1;
        expect(vertical ? X - x : Y - y).toBe(1);
        for (let a = x; a < X; a++)
          for (let b = y; b < Y; b++)
            for (let c = z; c < Z; c++) {
              if (result.cells.has(visualCellKey(a, b, c))) continue;
              const sign = [-1, 1].find((sign) =>
                [1, 2].every(
                  (n) =>
                    result.cells.get(
                      visualCellKey(
                        a + (vertical ? sign * n : 0),
                        b + (vertical ? 0 : sign * n),
                        c,
                      ),
                    )?.role === "core",
                ),
              );
              expect(sign).toBeDefined();
              pressure ??= result.cells.get(
                visualCellKey(
                  a + (vertical ? sign! : 0),
                  b + (vertical ? 0 : sign!),
                  c,
                ),
              );
            }
      }
      expect(pressure).toBeDefined();
      const key = visualCellKey(pressure!.x, pressure!.y, pressure!.z);
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
        [...cut.cells.values()].filter((c) => c.family === pressure!.family)
          .length,
      ).toBe(
        [...result.cells.values()].filter((c) => c.family === pressure!.family)
          .length - 1,
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
    for (const [p, d, role, slot] of [
      [[68, -11, 25], 79, "frame", "trim"],
      [[70, -9, 23], 79, "core", "trim"],
    ] as const) {
      const c = r.cells.get(visualCellKey(p[0], p[1], p[2]))!;
      expect(c.role).toBe(role);
      expect(c.slot).toBe(slot);
      expect(c.facet?.a).toEqual([1, -1, 0]);
      expect(c.facet?.d).toBe(d);
      expect(c.facetFaces).toBe(6);
    }
    // The actual old hull rim pick is now the open outer finish seat; pressure
    // is not removed behind it. This is intentionally different occupancy.
    expect(r.cells.has(visualCellKey(168, 9, 9))).toBe(false);
    expect(r.cells.get(visualCellKey(167, 9, 9))?.role).toBe("core");
    expect(r.cells.get(visualCellKey(166, 9, 9))?.role).toBe("core");
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
  it("keeps actual floor, door approach and seat contact planes flat across both complete ships", () => {
    for (const ship of [
      doc,
      PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!,
    ]) {
      const before = JSON.stringify(ship);
      const baseline = compileShipVisual(ship, catalog, "deck", "federation");
      const current = compileShipVisual(
        ship,
        catalog,
        "deck",
        "federation",
        undefined,
        "r002",
      );
      const interior = deriveInterior(ship, 0, catalog);
      let walked = 0,
        socketContacts = 0,
        doorContacts = 0;
      for (const c of baseline.cells.values()) {
        if (c.role !== "floor" || c.z !== G.deck.floorTopTexels - 1) continue;
        const x = (c.x + 0.5) / 16,
          y = (c.y + 0.5) / 16;
        if (
          !interior.floors.some(
            (f) => Math.floor(x) === f.cell[0] && Math.floor(y) === f.cell[1],
          )
        )
          continue;
        // Compare the old real pressure/contact plane, not old cosmetic void
        // labels. Existing walls above the plane are outside walking contact.
        if (baseline.cells.has(visualCellKey(c.x, c.y, c.z + 1))) continue;
        const next = current.cells.get(visualCellKey(c.x, c.y, c.z));
        expect(next, `${ship.id}:${c.x},${c.y}`).toBeDefined();
        expect(next!.facet).toBeUndefined();
        expect(next!.normalChart).toBeUndefined();
        expect(current.cells.has(visualCellKey(c.x, c.y, c.z + 1))).toBe(false);
        walked++;
        if (
          interior.sockets.some(
            (o) =>
              x >= o.at[0] &&
              x < o.at[0] + o.size[0] &&
              y >= o.at[1] &&
              y < o.at[1] + o.size[1],
          )
        )
          socketContacts++;
        if (
          interior.doors.some(
            (d) =>
              Math.hypot(x - (d.a[0] + d.b[0]) / 2, y - (d.a[1] + d.b[1]) / 2) <
              0.8,
          )
        )
          doorContacts++;
      }
      expect(walked).toBeGreaterThan(5000);
      expect(socketContacts).toBeGreaterThan(100);
      expect(doorContacts).toBeGreaterThan(100);
      expect(
        current.layers.some((l) => l.id.includes("floor-cover-seat")),
      ).toBe(false);
      expect(
        current.layers.some((l) => l.id.endsWith("floor-circulation-seam")),
      ).toBe(false);
      expect(
        current.layers.some((l) => l.id.includes("floor-cover-binding")),
      ).toBe(true);
      expect(JSON.stringify(ship)).toBe(before);
    }
  }, 20000);
  it("fingerprints actual finite manufacturing values while keeping r001 identity stable", () => {
    const profile = SHIP_VISUAL_MACRO_PROFILES_R002.federation;
    const before = visualProfilesSha256("r002"),
      legacy = visualProfilesSha256("r001");
    const original = profile.wallTasks.bridge.width;
    try {
      profile.wallTasks.bridge.width = original + 1;
      expect(visualProfilesSha256("r002")).not.toBe(before);
      expect(visualProfilesSha256("r001")).toBe(legacy);
    } finally {
      profile.wallTasks.bridge.width = original;
    }
    expect(visualProfilesSha256("r002")).toBe(before);
  });
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
  it("exposes room-specific inward perimeter assemblies over retained pressure cores", () => {
    const functions = new Set<string>();
    for (const ship of [
      doc,
      PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!,
    ]) {
      const before = JSON.stringify(ship),
        r = compileShipVisual(
          ship,
          catalog,
          "deck",
          "federation",
          undefined,
          "r002",
        );
      let opened = 0;
      for (const l of r.layers.filter(
        (l) => l.id.includes(":inward-task:") && l.id.endsWith(":well"),
      )) {
        const volume = ship.volumes.find(
          (v) => l.support === `volume:${v.id}`,
        )!;
        const poly = volumeGeometry(volume).outline!.outer.map(
          ([x, y]): [number, number] => [x * 16, y * 16],
        );
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++)
            for (let z = l.bounds[2]; z < l.bounds[5]; z++) {
              if (r.cells.has(visualCellKey(x, y, z))) continue;
              opened++;
              functions.add(l.id.split(":").at(-2)!);
              const face = polygonBoundarySample([x + 0.5, y + 0.5], poly);
              expect(face.distance).toBeGreaterThanOrEqual(3);
              // The real cavity belongs to the inner facade: walk farther toward
              // the exterior and two continuous support cells precede open air.
              expect(
                [
                  [1, 0],
                  [-1, 0],
                  [0, 1],
                  [0, -1],
                ].some(([dx, dy]) =>
                  [1, 2, 3].some((start) =>
                    [start, start + 1].every(
                      (n) =>
                        r.cells.get(visualCellKey(x + dx * n, y + dy * n, z))
                          ?.role === "core",
                    ),
                  ),
                ),
                `${ship.id}:${x},${y},${z}`,
              ).toBe(true);
            }
      }
      expect(opened).toBeGreaterThan(0);
      expect(JSON.stringify(ship)).toBe(before);
    }
    // Optical guard rings and real furniture can exclude a control assembly;
    // never force one through glazing to satisfy a profile-name count. The
    // complete current ships must expose three actual room purposes instead.
    expect([...functions].sort()).toEqual([
      "engineering",
      "living",
      "quarters",
    ]);
  }, 15000);
  it("seats broad exposed armor behind real case returns and backs functional outer wells", () => {
    const kinds = new Set<string>();
    let seats = 0,
      returns = 0;
    for (const ship of [
      doc,
      PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!,
    ]) {
      const r = compileShipVisual(
        ship,
        catalog,
        "deck",
        "federation",
        undefined,
        "r002",
      );
      for (const l of r.layers.filter(
        (l) => l.id.includes(":exposed-bay:") && l.id.endsWith(":armor-seat"),
      )) {
        const volume = ship.volumes.find(
          (v) => l.support === `volume:${v.id}`,
        )!;
        const poly = volumeGeometry(volume).outline!.outer.map(
          ([x, y]): [number, number] => [x * 16, y * 16],
        );
        const x = l.bounds[0],
          y = l.bounds[1];
        const boundary = polygonBoundarySample([x + 0.5, y + 0.5], poly);
        // Axis-aligned assembly rays give exact first-hit face planes without
        // approximating the guarded diagonal clipped polygons.
        if (Math.abs(boundary.normalHint[0] * boundary.normalHint[1]) > 0.001)
          continue;
        let [dx, dy] = boundary.normalHint;
        if (!insidePolygon(poly, x + 0.5 + dx * 2, y + 0.5 + dy * 2)) {
          dx = -dx;
          dy = -dy;
        }
        for (let z = l.bounds[2]; z < l.bounds[5]; z++) {
          if (r.cells.has(visualCellKey(x, y, z))) continue;
          const behind = r.cells.get(visualCellKey(x + dx, y + dy, z));
          if (behind?.slot !== "primary") continue;
          seats++;
          expect(behind.role).toBe("core");
          // Armor first hit is one lattice course inward; both inner support
          // courses exist. Adjacent lower casing hits the original outer plane.
          for (const n of [1, 2])
            expect(
              r.cells.get(visualCellKey(x + dx * n, y + dy * n, z))?.role,
            ).toBe("core");
          const returnCell = r.cells.get(visualCellKey(x, y, l.bounds[2] - 1));
          if (returnCell?.slot === "trim") returns++;
        }
      }
      for (const l of r.layers.filter(
        (l) => l.id.includes(":exposed-bay:") && l.id.endsWith(":well"),
      )) {
        for (let z = l.bounds[2]; z < l.bounds[5]; z++) {
          const x = l.bounds[0],
            y = l.bounds[1];
          if (r.cells.has(visualCellKey(x, y, z))) continue;
          if (
            [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ].some(([dx, dy]) =>
              [1, 2].every(
                (n) =>
                  r.cells.get(visualCellKey(x + dx * n, y + dy * n, z))
                    ?.role === "core",
              ),
            )
          )
            kinds.add(l.id.split(":").at(-2)!);
        }
      }
    }
    expect(seats).toBeGreaterThan(100);
    expect(returns).toBeGreaterThan(20);
    expect(kinds.has("vent")).toBe(true);
    expect(kinds.has("access")).toBe(true);
  }, 15000);
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
