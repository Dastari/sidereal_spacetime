import { describe, expect, it, vi } from "vitest";
import { bowGlass, bowHeights } from "@sidereal/content/bow-profiles";
import { G, placedTilePolygon } from "@sidereal/content/construction-grammar";
import { insidePolygon } from "@sidereal/content/construction-grammar";
import {
  deriveInterior,
  volumeGeometry,
  placeMount,
  placeMountTile,
} from "@sidereal/content/ship-prefab";
import { dressShip } from "./ship-dresser";
import * as dresser from "./ship-dresser";
import { polygonBoundarySample } from "./ship-visual-sampler";
import {
  referencePlateDecals,
  SHIP_VISUAL_MACRO_PROFILES_R002,
  REFERENCE_OPTICAL_INTERFACES_R002,
} from "@sidereal/content/ship-visual-r002";
import { referenceOpticalGuardBoxesR002 } from "./ship-visual-layers-r002";
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
  it("retains the complete old optical RAW exclusion for a missing glass roof or uncertain actual placement", () => {
    const roof = "bow.square.deck.s2.a0.roof";
    const ship = PREFAB_SHIPS.find((s) =>
      dressShip(s, { catalog }).kit.some((k) => k.piece === roof),
    )!;
    expect(REFERENCE_OPTICAL_INTERFACES_R002[roof].kind).toBe("optical");
    const profile = SHIP_VISUAL_MACRO_PROFILES_R002.federation;
    const original = profile.opticalInterfaces;
    const oldRaw = (r: ReturnType<typeof compileShipVisual>) => {
      const polygons = ship.volumes.flatMap((v) =>
        v.tiles.filter(bowGlass).map(placedTilePolygon),
      );
      let checked = 0;
      for (const c of r.cells.values())
        if (
          polygons.some(
            (poly) =>
              insidePolygon(poly, (c.x + 0.5) / 16, (c.y + 0.5) / 16) ||
              polygonBoundarySample([(c.x + 0.5) / 16, (c.y + 0.5) / 16], poly)
                .distance <=
                2 / 16,
          )
        ) {
          checked++;
          expect(c.facet, `${c.x},${c.y},${c.z}`).toBeUndefined();
        }
      expect(checked).toBeGreaterThan(100);
    };
    try {
      const missing = { ...original };
      delete missing[roof];
      profile.opticalInterfaces = missing;
      expect(
        referenceOpticalGuardBoxesR002(ship, "flight", catalog, missing)
          .unknownVariant,
      ).toBe(true);
      oldRaw(
        compileShipVisual(
          ship,
          catalog,
          "flight",
          "federation",
          undefined,
          "r002",
        ),
      );
    } finally {
      profile.opticalInterfaces = original;
    }
    const originalDress = dresser.dressShip;
    const spy = vi.spyOn(dresser, "dressShip");
    try {
      for (const change of [
        { x: NaN },
        { z: Infinity },
        { rotDeg: NaN },
        { mirror: "uncertain" },
      ]) {
        spy.mockImplementation((s, o) => {
          const dressed = originalDress(s, o);
          dressed.kit = dressed.kit.map((k) =>
            k.piece === roof ? ({ ...k, ...change } as typeof k) : k,
          );
          return dressed;
        });
        expect(
          referenceOpticalGuardBoxesR002(ship, "flight", catalog)
            .unknownVariant,
        ).toBe(true);
      }
      oldRaw(
        compileShipVisual(
          ship,
          catalog,
          "flight",
          "federation",
          undefined,
          "r002",
        ),
      );
    } finally {
      spy.mockRestore();
    }
  }, 15000);
  it("guards separate original optical solids and retained glass in the actual transformed kit frame", () => {
    for (const id of ["fed.s.wren", "fed.m.crest"]) {
      const ship = PREFAB_SHIPS.find((s) => s.id === id)!;
      for (const view of ["deck", "flight"] as const) {
        const guards = referenceOpticalGuardBoxesR002(ship, view, catalog);
        expect(guards.unknownVariant).toBe(false);
        let retained = 0,
          source = 0;
        for (const placement of dressShip(ship, { catalog }).kit) {
          if (placement.view !== "both" && placement.view !== view) continue;
          const certificate =
            REFERENCE_OPTICAL_INTERFACES_R002[placement.piece];
          if (!certificate) continue;
          if (placement.piece.endsWith(".cut")) {
            expect(certificate.retainedGlassBounds).toHaveLength(0);
          }
          const angle = (placement.rotDeg * Math.PI) / 180;
          for (const [kind, boxes] of [
            ["source", certificate.sourceFrameBounds],
            ["retained", certificate.retainedGlassBounds],
          ] as const)
            for (const b of boxes) {
              kind === "source" ? source++ : retained++;
              const corners: number[][] = [];
              for (const x of [b[0], b[3]])
                for (const y of [b[1], b[4]])
                  for (const z of [b[2], b[5]]) {
                    const X = placement.mirror ? -x : x;
                    corners.push([
                      placement.x + X * Math.cos(angle) - y * Math.sin(angle),
                      placement.y + X * Math.sin(angle) + y * Math.cos(angle),
                      placement.z + z,
                    ]);
                  }
              // Independently enumerate every transformed source/GLB corner;
              // the integer exclusion must contain it plus a full Cheb2 margin.
              const expected = [
                ...[0, 1, 2].map(
                  (a) =>
                    Math.floor(Math.min(...corners.map((p) => p[a])) * 16) - 2,
                ),
                ...[0, 1, 2].map(
                  (a) =>
                    Math.ceil(Math.max(...corners.map((p) => p[a])) * 16) + 2,
                ),
              ];
              expect(
                guards.bounds.some(
                  (g) =>
                    g.piece === placement.piece &&
                    g.kind === kind &&
                    g.bounds.join(",") === expected.join(","),
                ),
              ).toBe(true);
            }
        }
        expect(source).toBeGreaterThan(0);
        if (view === "flight") expect(retained).toBeGreaterThan(0);
      }
    }
    const missing = { ...REFERENCE_OPTICAL_INTERFACES_R002 };
    const placed = dressShip(doc, { catalog }).kit.find(
      (k) =>
        k.view !== "flight" &&
        (k.piece.startsWith("canopy.") || /^bow\..*\.edge\d+$/.test(k.piece)) &&
        missing[k.piece],
    );
    expect(placed).toBeDefined();
    delete missing[placed!.piece];
    expect(
      referenceOpticalGuardBoxesR002(doc, "deck", catalog, missing)
        .unknownVariant,
    ).toBe(true);
    expect(
      referenceOpticalGuardBoxesR002(doc, "flight", catalog, {}).unknownVariant,
    ).toBe(true);
  });
  it("keeps every deck attachment island continuously backed with a sealed hard cut top", () => {
    let checked = 0,
      exposedTops = 0;
    for (const id of ["fed.s.wren", "fed.m.crest"]) {
      const ship = PREFAB_SHIPS.find((s) => s.id === id)!;
      const r = compileShipVisual(
        ship,
        catalog,
        "deck",
        "federation",
        undefined,
        "r002",
      );
      const lastLayerAt = (x: number, y: number, z: number) => {
        for (let i = r.layers.length - 1; i >= 0; i--) {
          const layer = r.layers[i];
          const b = layer.bounds;
          if (
            x >= b[0] &&
            x < b[3] &&
            y >= b[1] &&
            y < b[4] &&
            z >= b[2] &&
            z < b[5]
          )
            return layer;
        }
        return undefined;
      };
      const islands = r.layers.filter((l) =>
        l.id.endsWith(":attachment-island-core"),
      );
      const supportBoxes = r.layers.filter(
        (l) =>
          l.role === "core" &&
          (l.id.endsWith(":core") || l.id.endsWith(":attachment-island-core")),
      );
      const interior = deriveInterior(ship, 0, catalog);
      const connected = new Map<string, Set<string>>();
      const lowerSupport = (island: (typeof islands)[number]) => {
        let found = connected.get(island.support!);
        if (found) return found;
        const core = r.layers.find(
          (a) => a.support === island.support && a.id.endsWith(":core"),
        )!;
        const b = [
          core.bounds[0] - 2,
          core.bounds[1] - 2,
          G.deck.floorTopTexels - 1,
          core.bounds[3] + 2,
          core.bounds[4] + 2,
          G.deck.floorTopTexels + 23,
        ];
        const queue: number[][] = [];
        found = new Set();
        for (let y = b[1]; y < b[4]; y++)
          for (let x = b[0]; x < b[3]; x++) {
            const key = visualCellKey(x, y, b[2]);
            if (
              ["floor", "core", "frame", "doorframe"].includes(
                r.cells.get(key)?.role ?? "",
              )
            ) {
              found.add(key);
              queue.push([x, y, b[2]]);
            }
          }
        for (let i = 0; i < queue.length; i++) {
          const p = queue[i];
          for (const d of [
            [1, 0, 0],
            [-1, 0, 0],
            [0, 1, 0],
            [0, -1, 0],
            [0, 0, 1],
            [0, 0, -1],
          ]) {
            const n = p.map((v, a) => v + d[a]);
            if (n.some((v, a) => v < b[a] || v >= b[a + 3])) continue;
            const key = visualCellKey(n[0], n[1], n[2]);
            if (
              !found.has(key) &&
              ["core", "frame", "doorframe"].includes(
                r.cells.get(key)?.role ?? "",
              )
            ) {
              found.add(key);
              queue.push(n);
            }
          }
        }
        connected.set(island.support!, found);
        return found;
      };
      for (const l of islands)
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
            checked++;
            for (let z = l.bounds[2]; z < l.bounds[5]; z++) {
              const c = r.cells.get(visualCellKey(x, y, z));
              const owner = lastLayerAt(x, y, z);
              if (!c) {
                // The final existing optical/door opening owns its real void;
                // preserved header support must go around it, never fill it.
                expect(owner?.role).toBe("void");
                expect(owner?.id).toMatch(/:(?:opening|glass-aperture)$/);
                continue;
              }
              // The exception is a real crossing of occupied support bands,
              // not a family/name exemption: the other frame must adjoin its
              // retained core at this exact Z and retain continuous solid below.
              const postIntersection = interior.posts.some(
                (p, i) =>
                  c!.family === `post:${i}` &&
                  x >= p[0] * 16 - 2 &&
                  x < p[0] * 16 + 2 &&
                  y >= p[1] * 16 - 2 &&
                  y < p[1] * 16 + 2 &&
                  z >= G.deck.floorTopTexels &&
                  z < G.deck.floorTopTexels + 22,
              );
              const structuralIntersection =
                c!.role === "frame" &&
                c!.family !== l.support &&
                owner?.role === "frame" &&
                (postIntersection ||
                  supportBoxes.some(
                    (a) =>
                      a.support === c!.family &&
                      x >= a.bounds[0] - 1 &&
                      x < a.bounds[3] + 1 &&
                      y >= a.bounds[1] - 1 &&
                      y < a.bounds[4] + 1 &&
                      z >= a.bounds[2] &&
                      z < a.bounds[5],
                  )) &&
                Array.from(
                  { length: z - l.bounds[2] + 1 },
                  (_, i) => l.bounds[2] + i,
                ).every((q) => r.cells.has(visualCellKey(x, y, q)));
              expect(
                z < l.bounds[2] + 2
                  ? ["core", "frame"].includes(c!.role)
                  : c!.role === "core" || structuralIntersection,
                `${id}:${x},${y},${z}:${c!.role}:${c!.family}:${owner?.id}`,
              ).toBe(true);
            }
            const top = r.cells.get(visualCellKey(x, y, l.bounds[5] - 1))!;
            if (!top) continue; // Explicit original aperture extends through this cut.
            expect(
              lowerSupport(l).has(visualCellKey(x, y, l.bounds[5] - 1)),
              `${id}:connected-cap:${x},${y}`,
            ).toBe(true);
            const above = r.cells.get(visualCellKey(x, y, l.bounds[5]));
            if (above) {
              // A preserved outer wall/header can physically cover this island;
              // do not trim that other assembly to manufacture an exposed cap.
              expect(above.family).not.toBe(l.support);
              expect(
                ["core", "frame", "doorframe", "plate", "roof"].includes(
                  above.role,
                ),
              ).toBe(true);
              continue;
            }
            exposedTops++;
            expect(top.facet).toBeUndefined();
            expect(top.normalHint).toBeUndefined();
            expect(top.normalSide).toBeUndefined();
          }
      // Both retained side courses meet the central support at every island;
      // full doorway/glazed jamb source retains its old height independently.
      for (const l of r.layers.filter((l) =>
        l.id.endsWith(":attachment-island-return"),
      ))
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++)
            for (let z = l.bounds[2]; z < l.bounds[5]; z++)
              if (!r.cells.has(visualCellKey(x, y, z)))
                expect(
                  lastLayerAt(x, y, z)?.id,
                  `${id}:return:${x},${y},${z}`,
                ).toMatch(/:(?:opening|glass-aperture)$/);
      for (const door of deriveInterior(ship, 0, catalog).doors.filter(
        (d) => !d.exterior,
      )) {
        const dx = door.b[0] - door.a[0],
          dy = door.b[1] - door.a[1],
          span = Math.hypot(dx, dy);
        for (const along of [0.1875, span - 0.1875]) {
          const x = Math.floor((door.a[0] + (dx * along) / span) * 16),
            y = Math.floor((door.a[1] + (dy * along) / span) * 16);
          for (
            let z = G.deck.floorTopTexels + 19;
            z < G.deck.floorTopTexels + 22;
            z++
          ) {
            const c = r.cells.get(visualCellKey(x, y, z));
            expect(c, `${id}:${door.id}:${x},${y},${z}`).toBeDefined();
            expect(["core", "frame", "doorframe"].includes(c!.role)).toBe(true);
            expect(c!.facet).toBeUndefined();
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(exposedTops).toBeGreaterThan(20);
  }, 15000);
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
  }, 15000);
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
        const opticalBoxes = referenceOpticalGuardBoxesR002(
          ship,
          view,
          catalog,
        );
        const opticalEdges = [
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
          expect(
            opticalBoxes.bounds.find(
              (g) =>
                c.x >= g.bounds[0] &&
                c.x < g.bounds[3] &&
                c.y >= g.bounds[1] &&
                c.y < g.bounds[4] &&
                c.z >= g.bounds[2] &&
                c.z < g.bounds[5],
            ),
            `${ship.id}:${view}:${c.x},${c.y},${c.z}`,
          ).toBeUndefined();
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
                c.y + 0.5 > a.bounds[4] + 2 ||
                c.z + 0.5 < a.bounds[2] - 2 ||
                c.z + 0.5 > a.bounds[5] + 2,
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
          if (c.facet!.a[2] === 0) {
            const edge = poly[boundary.edgeIndex];
            // Common patch IDs are insufficient: every retained height/slot
            // must use the FIRST occupied boundary row, not a parallel seat.
            expect(c.facet!.d, `${ship.id}:${c.x},${c.y},${c.z}`).toBe(
              Math.round(c.facet!.a[0] * edge[0] + c.facet!.a[1] * edge[1]) - 1,
            );
          }
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
        const trayColumns = new Map<string, Set<number>>();
        for (const l of tray) {
          expect(l.role).toBe("core");
          for (let x = l.bounds[0]; x < l.bounds[3]; x++)
            for (let y = l.bounds[1]; y < l.bounds[4]; y++) {
              const key = `${x},${y}`,
                z = trayColumns.get(key) ?? new Set<number>();
              for (let q = l.bounds[2]; q < l.bounds[5]; q++) z.add(q);
              trayColumns.set(key, z);
            }
          for (let x = l.bounds[0]; x < l.bounds[3]; x++)
            for (let y = l.bounds[1]; y < l.bounds[4]; y++)
              for (let z = l.bounds[2]; z < l.bounds[5]; z++)
                expect(r.cells.get(visualCellKey(x, y, z))?.role).toBe("core");
        }
        for (const z of trayColumns.values()) {
          const rows = [...z].sort((a, b) => a - b);
          expect(rows).toHaveLength(2);
          expect(rows[1] - rows[0]).toBe(1);
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
      // Corrected seated planes have true raw transition rings; an old outer
      // pick at that join retains its occupied pressure role but not a conflicting
      // intact clipping descriptor. Elsewhere its original plane is unchanged.
      if (c.facet) {
        expect(c.facet.a).toEqual([1, -1, 0]);
        expect(c.facet.d).toBe(d);
        expect(c.facetFaces).toBe(6);
      } else {
        expect(
          r.layers.some(
            (l) =>
              l.facet &&
              l.facet.d < d &&
              l.bounds[0] <= p[0] + 3 &&
              l.bounds[3] > p[0] - 3 &&
              l.bounds[1] <= p[1] + 3 &&
              l.bounds[4] > p[1] - 3 &&
              l.bounds[2] <= p[2] + 3 &&
              l.bounds[5] > p[2] - 3,
          ),
        ).toBe(true);
      }
    }
    // The common FIRST outer casing retains this old diagonal pressure pick;
    // seating it deeper would compound the permitted .044194m clip recession.
    expect(r.cells.get(visualCellKey(168, 9, 9))?.role).toBe("core");
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
      const contacts = new Map<string, { x: number; y: number; z: number }>();
      // Ordered floor source establishes the intended contact top. Earlier r001
      // cosmetic void grilles are not authoritative pits; R14 deliberately filled
      // those, but every varying bow support top still must match this source.
      for (const l of baseline.layers.filter((l) => l.role === "floor"))
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
            const key = `${x},${y}`,
              z = l.bounds[5] - 1;
            if (z > (contacts.get(key)?.z ?? -Infinity))
              contacts.set(key, { x, y, z });
          }
      for (const c of contacts.values()) {
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
        expect(
          current.cells.has(visualCellKey(c.x, c.y, c.z + 1)),
          `${ship.id}:${c.x},${c.y},${c.z}`,
        ).toBe(false);
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
  it("protects Crest actual 3D optical interfaces without blanket raw geometry below them", () => {
    const crest = PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!;
    const r = compileShipVisual(
      crest,
      catalog,
      "deck",
      "federation",
      undefined,
      "r002",
    );
    const guards = referenceOpticalGuardBoxesR002(crest, "deck", catalog);
    const protectedAt = (z: number) =>
      guards.bounds.some(
        (g) =>
          336 >= g.bounds[0] &&
          336 < g.bounds[3] &&
          17 >= g.bounds[1] &&
          17 < g.bounds[4] &&
          z >= g.bounds[2] &&
          z < g.bounds[5],
      );
    // Exact old native ray column: opaque below-glass pressure is retained, and
    // the original optical/frame union alone determines its raw/clipped rows.
    let qualified = 0,
      raw = 0;
    for (const z of [9, 17, 25, 30]) {
      const c = r.cells.get(visualCellKey(336, 17, z))!;
      expect(c.role).toBe("core");
      if (protectedAt(z)) {
        raw++;
        expect(c.facet).toBeUndefined();
      } else {
        qualified++;
        expect(c.facet?.d).toBe(319);
      }
    }
    expect(qualified).toBeGreaterThan(0);
    expect(raw).toBeGreaterThan(0);
    // Authored regular canopy nose17 gives lower frame20..22, cut upper30..32.
    for (const z of [20, 21, 30]) {
      const c = r.cells.get(visualCellKey(336, 17, z))!;
      expect(c.role).toBe("core");
      expect(c.slot).toBe("secondary");
      if (protectedAt(z)) expect(c.facet).toBeUndefined();
    }
  }, 15000);
  it("renders the selected bridge cover on its real sloped bow contact plane", () => {
    const r = compileShipVisual(
      doc,
      catalog,
      "deck",
      "federation",
      undefined,
      "r002",
    );
    const bridge = doc.rooms.find((r) => r.type === "bridge")!;
    let covered = 0;
    const heights = new Set<number>();
    for (const l of r.layers.filter(
      (l) => l.id.includes(`floor-cover`) && l.id.endsWith(`:${bridge.id}`),
    )) {
      for (let y = l.bounds[1]; y < l.bounds[4]; y++)
        for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
          const p: [number, number] = [(x + 0.5) / 16, (y + 0.5) / 16];
          const v = doc.volumes.find((v) => l.support === `volume:${v.id}`)!;
          const tile = v.tiles.find((t) =>
            insidePolygon(placedTilePolygon(t), ...p),
          )!;
          if (!tile.bow) continue;
          const [lo] = bowHeights(tile, v.height, p);
          const top =
            Math.floor(lo) + G.bowProfiles.shellThicknessTexels[v.height][0];
          expect(l.bounds[5]).toBe(top);
          const c = r.cells.get(visualCellKey(x, y, top - 1))!;
          expect(c).toBeDefined();
          expect(c.facet).toBeUndefined();
          expect(r.cells.has(visualCellKey(x, y, top))).toBe(false);
          heights.add(top);
          covered++;
        }
    }
    expect(covered).toBeGreaterThan(100);
    expect(heights.size).toBeGreaterThan(1);
  }, 15000);
  it("seats fitting-adjacent roof fields as surviving open wells over continuous core backing", () => {
    for (const ship of [
      doc,
      PREFAB_SHIPS.find((s) => s.id === "fed.m.crest")!,
    ]) {
      const r = compileShipVisual(
        ship,
        catalog,
        "flight",
        "federation",
        undefined,
        "r002",
      );
      const wells = r.layers.filter((l) =>
        l.id.includes(":roof-shoulder-well:"),
      );
      let open = 0;
      for (const l of wells)
        for (let y = l.bounds[1]; y < l.bounds[4]; y++)
          for (let x = l.bounds[0]; x < l.bounds[3]; x++) {
            for (let z = l.bounds[2]; z < l.bounds[5]; z++)
              if (!r.cells.has(visualCellKey(x, y, z))) open++;
            expect(
              [1, 2, 3, 4].some((d) =>
                [d, d + 1].every(
                  (q) =>
                    r.cells.get(visualCellKey(x, y, l.bounds[2] - q))?.role ===
                    "core",
                ),
              ),
            ).toBe(true);
          }
      expect(open).toBeGreaterThan(20);
      expect(
        [...r.cells.values()].some(
          (c) =>
            c.role === "service" &&
            c.slot === "metal" &&
            !r.cells.has(visualCellKey(c.x, c.y, c.z + 1)) &&
            wells.some(
              (l) =>
                c.x >= l.bounds[0] &&
                c.x < l.bounds[3] &&
                c.y >= l.bounds[1] &&
                c.y < l.bounds[4],
            ),
        ),
      ).toBe(true);
    }
  }, 15000);
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
    const cut = profile.partitionCut;
    const certificate = Object.values(profile.opticalInterfaces).find(
      (c) => c.sourceFrameBounds.length,
    )!;
    const bound = certificate.sourceFrameBounds[0][2];
    try {
      profile.partitionCut = cut - 1;
      expect(visualProfilesSha256("r002")).not.toBe(before);
      profile.partitionCut = cut;
      certificate.sourceFrameBounds[0][2] = bound + 1 / 16;
      expect(visualProfilesSha256("r002")).not.toBe(before);
      expect(visualProfilesSha256("r001")).toBe(legacy);
    } finally {
      profile.partitionCut = cut;
      certificate.sourceFrameBounds[0][2] = bound;
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
    // complete current ships must expose actual eligible task purposes instead.
    expect(functions.has("bridge")).toBe(true);
    expect(functions.has("engineering")).toBe(true);
    expect(functions.has("quarters")).toBe(true);
    // These distinct room purposes must own actual surviving open wells, rather
    // than merely appearing in the finite profile table or emitted layer names.
    expect(
      ["medical", "workshop", "galley", "lounge", "cargo"].filter((k) =>
        functions.has(k),
      ).length,
    ).toBeGreaterThanOrEqual(3);
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
