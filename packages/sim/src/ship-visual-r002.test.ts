import { describe, expect, it } from "vitest";
import { insidePolygon } from "@sidereal/content/construction-grammar";
import {
  volumeGeometry,
  placeMount,
  placeMountTile,
} from "@sidereal/content/ship-prefab";
import { dressShip } from "./ship-dresser";
import { polygonBoundarySample } from "./ship-visual-sampler";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  compileShipVisual,
  visualProfilesSha256,
  visualVolumeSha256,
  visualCellKey,
} from "./ship-visual-compiler";

describe("versioned reference recipes", () => {
  const doc = PREFAB_SHIPS.find((s) => s.id === "fed.s.wren")!;
  const catalog = defaultPrefabComponentCatalog();
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
      const markings = dressShip(ship, { catalog })
        .decals.filter((d) => d.normal[2] > 0.99)
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
  });
});
