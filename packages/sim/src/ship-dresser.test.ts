import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PREFAB_SHIPS } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { shipKitPiecesFile } from "@sidereal/content/ship-kit";
import piecesJson from "@sidereal/content/ship-kit-pieces.v1.json";
import { dressFingerprint, dressShip, faceChains, rasterOutline } from "./ship-dresser";

const catalog = defaultPrefabComponentCatalog();
const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../../assets/runtime/ship-kit/r001/manifest.json", import.meta.url)), "utf8"),
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
      expect(ship.generated.some((g) => g.kind === "hull-body")).toBe(true);
      expect(ship.stats.floors).toBeGreaterThan(0);
      for (const g of ship.generated) for (const b of g.boxes) expect(b[3] > b[0] && b[4] > b[1] && b[5] > b[2]).toBe(true);
      // Deterministic.
      expect(dressFingerprint(dressShip(prefab, { catalog }))).toBe(dressFingerprint(ship));
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
