import { describe, it, expect } from "vitest";
import {
  G,
  SHAPE_TILE_IDS,
  HEIGHT_CLASS_IDS,
  placedTilePolygon,
  type ShapeTilePlacement,
  type QuarterTurn,
} from "@sidereal/content/construction-grammar";
import {
  bowHeights,
  tileWorld,
  bowWallPolygon,
  bowJoinErrors,
  bowSection,
  bowWalkable,
  sharedTileEdges,
} from "@sidereal/content/bow-profiles";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import {
  readShipPrefab,
  validateShipPrefab,
} from "@sidereal/content/ship-prefab";
import {
  derivePrefabStructure,
  prefabStructureMaterial,
} from "./prefab-structure";
import { prefabConstructionDocument } from "./prefab-construction";
import { compileConstruction } from "./construction-transactions";

const turns = [0, 1, 2, 3] as QuarterTurn[];
const sq = (x: number, step: QuarterTurn): ShapeTilePlacement => ({
  x,
  y: 0,
  shape: "square",
  rot: 0,
  reflected: false,
  bow: { step, axis: 0 },
});
describe("grid-true bow contract", () => {
  it("pins full -> brow -> windscreen -> cap and rejects reversed/wrong height-step joins", () => {
    const tiles = [sq(0, 0), sq(1, 1), sq(2, 2), sq(3, 3)];
    expect(bowJoinErrors(tiles, "deck")).toEqual([]);
    expect(bowHeights(tiles[1], "deck", [1, 0])).toEqual([0, 43]);
    expect(bowHeights(tiles[3], "deck", [4, 0])).toEqual([6.45, 22.36]);
    expect(bowJoinErrors([sq(0, 1), sq(1, 3)], "deck")).toEqual(["0:1"]);
    expect(bowWalkable(sq(0, 1), "deck")).toBe(true);
    expect(bowWalkable(sq(0, 2), "deck")).toBe(false);
  });
  it("enumerates shape × rotation × mirror × height step × profile direction and every matching/rejected edge pairing", () => {
    let allowed = 0,
      rejected = 0,
      variants = 0;
    for (const hc of HEIGHT_CLASS_IDS) {
      const edges = new Map<
        string,
        {
          tile: ShapeTilePlacement;
          a: readonly [number, number];
          b: readonly [number, number];
        }[]
      >();
      for (const shape of SHAPE_TILE_IDS)
        for (const rot of turns)
          for (const reflected of [false, true])
            for (const step of turns)
              for (const axis of turns) {
                const tile: ShapeTilePlacement = {
                  shape,
                  rot,
                  reflected,
                  x: 0,
                  y: 0,
                  bow: { step, axis },
                };
                variants++;
                const p = placedTilePolygon(tile);
                for (let i = 0; i < p.length; i++) {
                  const a = p[i],
                    b = p[(i + 1) % p.length];
                  // Opposite directed segments can mate by whole-cell translation only.
                  const key = [
                    b[0] - a[0],
                    b[1] - a[1],
                    a[0] - Math.floor(a[0] + 1e-8),
                    a[1] - Math.floor(a[1] + 1e-8),
                  ]
                    .map((n) => n.toFixed(7))
                    .join(",");
                  const list = edges.get(key) ?? [];
                  list.push({ tile, a, b });
                  edges.set(key, list);
                }
              }
      // All candidate edges are checked via endpoint profiles. Group identical sections
      // to avoid repeating identical geometry for symmetric variants.
      const representatives = [...edges.values()].flatMap((list) => {
        const unique = new Map<string, (typeof list)[number]>();
        for (const e of list) {
          const k = bowSection(e.tile, hc, e.a, e.b)
            .map((v) => v[2].toFixed(8))
            .join(",");
          if (!unique.has(k)) unique.set(k, e);
        }
        return [...unique.values()];
      });
      for (const e of representatives)
        for (const f of representatives) {
          const dx = e.b[0] - f.a[0],
            dy = e.b[1] - f.a[1];
          if (
            Math.abs(dx - Math.round(dx)) > 1e-7 ||
            Math.abs(dy - Math.round(dy)) > 1e-7
          )
            continue;
          if (Math.hypot(f.b[0] + dx - e.a[0], f.b[1] + dy - e.a[1]) > 1e-7)
            continue;
          const other = { ...f.tile, x: dx, y: dy };
          const p = bowSection(e.tile, hc, e.a, e.b),
            q = bowSection(other, hc, e.a, e.b);
          const match = p.every((v, i) =>
            v.every((n, j) => Math.abs(n - q[i][j]) < 1e-7),
          );
          // Neighbor polygons have opposite-facing edge sockets; compare their actual section vertices.
          if (match) {
            allowed++;
            expect(
              p
                .flat()
                .map((v, i) => Math.abs(v - q.flat()[i]))
                .every((d) => d < 1e-7),
            ).toBe(true);
          } else rejected++;
        }
    }
    expect(variants).toBe(7680);
    expect(allowed).toBeGreaterThan(1000);
    expect(rejected).toBeGreaterThan(1000);
    console.info(
      "BOW_INTERLOCK_COUNTS",
      JSON.stringify({ variants, allowed, rejected }),
    );
  }, 30000);
  it("checks partial shared edges when a multi-cell arc mates with metre tiles", () => {
    const arc: ShapeTilePlacement = {
      x: 0,
      y: 0,
      shape: "arc2",
      rot: 0,
      reflected: false,
      bow: { step: 1, axis: 1 },
    };
    const a = { ...sq(0, 0), y: -1 },
      b = { ...sq(1, 0), y: -1 };
    expect(sharedTileEdges(arc, a)).toHaveLength(1);
    expect(sharedTileEdges(arc, b)).toHaveLength(1);
    expect(bowJoinErrors([arc, a, b], "deck")).toEqual([]);
    expect(
      bowJoinErrors([arc, { ...a, bow: { step: 2, axis: 0 } }, b], "deck")
        .length,
    ).toBeGreaterThan(0);
  });
  it("admits legacy documents unchanged and rejects tampered bow profiles at publication", () => {
    const w = structuredClone(PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!);
    expect(readShipPrefab(w)).toEqual(w);
    const t = w.volumes[0].tiles.find((t) => t.bow?.step === 1)!;
    t.bow!.step = 3;
    expect(
      validateShipPrefab(w, defaultPrefabComponentCatalog()).some(
        (e) => e.code === "bow.profile-join",
      ),
    ).toBe(true);
    expect(() =>
      prefabConstructionDocument(w, defaultPrefabComponentCatalog()),
    ).toThrow();
  });
  it("compiles the footprint and pressure glass from the same tiles, independent of flight/deck view", () => {
    const w = PREFAB_SHIPS.find((p) => p.id === "fed.s.wren")!,
      structure = derivePrefabStructure(w);
    const snap = compileConstruction(
      JSON.stringify(
        prefabConstructionDocument(w, defaultPrefabComponentCatalog()),
      ),
    );
    expect(snap.prefabStructure).toEqual(structure);
    expect(structure.length).toBe(19);
    expect(structure.flatMap((s) => s.pressure).every((e) => e.seals)).toBe(
      true,
    );
    const glass = structure.find((s) => s.roofMaterial === "glass")!;
    const xy: [number, number] = [glass.tile.x + 0.5, glass.tile.y + 0.5],
      roof = bowHeights(glass.tile, glass.height, xy)[1];
    expect(prefabStructureMaterial(glass, [...xy, (roof - 0.6) / 16])).toBe(
      "glass",
    );
    expect(prefabStructureMaterial(glass, [...xy, 1])).toBe(null);
    expect(
      Math.max(...structure.flatMap((s) => s.footprint.map((p) => p[0]))),
    ).toBe(12);
  });
});

describe("wrapped shoulder glass material", () => {
  it("queries the same enclosed pane and crash rail on every shaped tile and orientation", () => {
    for (const shape of SHAPE_TILE_IDS)
      for (const rot of turns)
        for (const reflected of [false, true]) {
          const tile: ShapeTilePlacement = {
            x: 0,
            y: 0,
            shape,
            rot,
            reflected,
            bow: { step: 2, axis: 0 },
          };
          const polygon = placedTilePolygon(tile);
          const localWall = bowWallPolygon(shape, 0);
          const middle = localWall.reduce(
            (p, v) => [p[0] + v[0] / 4, p[1] + v[1] / 4] as [number, number],
            [0, 0] as [number, number],
          );
          const xy = tileWorld(tile, middle);
          const [lo, hi] = bowHeights(tile, "deck", xy);
          const [floor, roof] = G.bowProfiles.shellThicknessTexels.deck;
          const surface = {
            volume: "test",
            tile,
            height: "deck" as const,
            footprint: polygon,
            envelope: [],
            pressure: [
              {
                a: tileWorld(tile, localWall[0]),
                b: tileWorld(tile, localWall[1]),
                seals: true as const,
                material: "primary" as const,
              },
            ],
            roofSeals: true as const,
            roofMaterial: "primary" as const,
          };
          const at = (f: number): [number, number, number] => [
            ...xy,
            (lo + floor + (hi - roof - lo - floor) * f) / 16,
          ];
          expect(prefabStructureMaterial(surface, at(0.7))).toBe("glass");
          expect(prefabStructureMaterial(surface, at(0.4))).toBe("trim");
          expect(prefabStructureMaterial(surface, at(0.47))).toBe("primary");
        }
  });
});

describe("bow review hosts", () => {
  it("keeps the other stock prefabs unchanged while validating a second ship and rotated pod assemblies", async () => {
    const { BOW_REVIEW_CREST, BOW_REVIEW_POD, BOW_INTERLOCKS } =
      await import("../../../scripts/prefab-render-harness/bow-fixtures");
    for (const doc of [BOW_REVIEW_CREST, BOW_REVIEW_POD, BOW_INTERLOCKS])
      for (const v of doc.volumes)
        expect(bowJoinErrors(v.tiles, v.height)).toEqual([]);
    const cat = defaultPrefabComponentCatalog();
    expect(
      validateShipPrefab(BOW_REVIEW_CREST, cat).filter(
        (e) => e.severity === "error",
      ),
    ).toEqual([]);
    expect(
      compileConstruction(
        JSON.stringify(prefabConstructionDocument(BOW_REVIEW_CREST, cat)),
      ).readiness.geometry,
    ).toBe(true);
  });
});
