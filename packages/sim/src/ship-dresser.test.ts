import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { shipKitPiecesFile } from "@sidereal/content/ship-kit";
import piecesJson from "@sidereal/content/ship-kit-pieces.v1.json";
import { SHAPE_TILE_IDS, placedTilePolygon, shapeTileLocalPolygon } from "@sidereal/content/construction-grammar";
import { dressFingerprint, dressShip, faceChains, rasterOutline, tileFrame } from "./ship-dresser";

const catalog = defaultPrefabComponentCatalog();
const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../assets/runtime/ship-kit/r002/manifest.json", import.meta.url)), "utf8"),
) as { pieces: Record<string, unknown> };

describe("ship dresser", () => {
  it("the pinned kit piece list matches the generator", () => {
    expect(piecesJson).toEqual(JSON.parse(JSON.stringify(shipKitPiecesFile())));
  });

  for (const prefab of PREFAB_SHIPS)
    it(`${prefab.id} dresses into exported kit pieces in both views`, () => {
      const ship = dressShip(prefab, { catalog });
      const missing = [...new Set(ship.kit.map((k) => k.piece))].filter((id) => !manifest.pieces[id]);
      expect(missing).toEqual([]);
      const flight = ship.kit.filter((k) => k.view !== "deck").length;
      const deck = ship.kit.filter((k) => k.view !== "flight").length;
      expect(flight).toBeGreaterThan(20);
      expect(deck).toBeGreaterThan(20);
      // Kit r002: every visible hull surface is a Blender kit module; nothing is TS-generated.
      expect(ship.generated).toEqual([]);
      expect(ship.kit.some((k) => k.piece.startsWith("hull."))).toBe(true);
      expect(ship.stats.floors).toBeGreaterThan(0);
      for (const g of ship.generated) for (const b of g.boxes) expect(b[3] > b[0] && b[4] > b[1] && b[5] > b[2]).toBe(true);
      // Deterministic.
      expect(dressFingerprint(dressShip(prefab, { catalog }))).toBe(dressFingerprint(ship));
    });

  it("tile modules land exactly on the placed tile polygon (every shape, turn and mirror)", () => {
    for (const shape of SHAPE_TILE_IDS)
      for (const rot of [0, 1, 2, 3] as const)
        for (const reflected of [false, true]) {
          const t = { x: 3, y: -2, shape, rot, reflected };
          const f = tileFrame(t);
          const a = (f.rotDeg * Math.PI) / 180;
          const mapped = shapeTileLocalPolygon(shape).map(([x, y]) => {
            const mx = f.mirror ? -x : x;
            return [Math.round((mx * Math.cos(a) - y * Math.sin(a) + f.x) * 1e6) / 1e6, Math.round((mx * Math.sin(a) + y * Math.cos(a) + f.y) * 1e6) / 1e6].join(",");
          });
          const placed = placedTilePolygon(t).map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6].join(","));
          expect(new Set(mapped)).toEqual(new Set(placed));
        }
  });

  it("rasterises a square exactly and keeps slope chains together", () => {
    const outline = { outer: [[0, 0], [2, 0], [2, 2], [0, 2]] as [number, number][], holes: [] };
    const boxes = rasterOutline(outline, [0, 4], () => "primary");
    const area = boxes.reduce((s, b) => s + (b[3] - b[0]) * (b[4] - b[1]), 0);
    expect(area).toBe(32 * 32);
    const { axis, chains } = faceChains([[0, 0], [4, 0], [6, 1], [8, 2], [8, 4], [0, 4]]);
    expect(chains).toHaveLength(1);
    expect(chains[0]).toHaveLength(2);
    expect(axis).toHaveLength(4);
  });
});
