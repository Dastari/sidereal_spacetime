import { describe, expect, it } from "vitest";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { prefabById } from "@sidereal/content/prefabs";
import { defaultPrefabComponentCatalog } from "@sidereal/content/ship-prefab-catalog";
import { dressShip } from "@sidereal/sim/ship-dresser";
import {
  compileShipVisual,
  visualVolumeSha256,
} from "@sidereal/sim/ship-visual-compiler";
import { visualCellKey } from "@sidereal/sim/ship-visual-compiler";
import { prefabFrameMatrix } from "./frames";
import {
  buildDeckCutCache,
  deckRunOccludes,
  selectDeckCutSector,
} from "./deck-cutaway";

describe("closed display cutaway admission", () => {
  it("selects actual intervening runs, never the wall beyond a subject", () => {
    expect(deckRunOccludes([-20, -20], [2, 3], { a: [0, 0], b: [0, 8] })).toBe(
      true,
    );
    expect(deckRunOccludes([-20, -20], [2, 3], { a: [8, 0], b: [8, 8] })).toBe(
      false,
    );
    expect(deckRunOccludes([-20, -20], [0, 3], { a: [0, 0], b: [0, 8] })).toBe(
      false,
    );
    expect(deckRunOccludes([-20, 3], [2, 3], { a: [0, 4], b: [8, 4] })).toBe(
      false,
    );
  });

  it("uses the moving and rebased prefab frame, restores full geometry inside/low/invalid views, and has finite hysteresis", () => {
    const cache = { bounds: [0, 0, 20, 10] as const, states: [] };
    const camera = [-20, -15, 22] as const;
    expect(selectDeckCutSector(cache, camera)).toBe(0);
    const frame = Matrix.FromArray(prefabFrameMatrix([10, 5]));
    const parent = Matrix.RotationY(0.7).multiply(
      Matrix.Translation(123, -4, 456),
    );
    const world = frame.multiply(parent);
    const rendered = Vector3.TransformCoordinates(
      Vector3.FromArray(camera),
      world,
    );
    const local = Vector3.TransformCoordinates(
      rendered,
      world.clone().invert(),
    );
    expect(selectDeckCutSector(cache, [local.x, local.y, local.z])).toBe(0);
    for (const p of [
      [10, 5, 22],
      [-20, -15, 1],
      [-20, -15, NaN],
      [-20, -15, 2000],
    ] as const)
      expect(selectDeckCutSector(cache, p)).toBeNull();
    expect(selectDeckCutSector(cache, [10, -30, 22])).toBeNull();
    expect(selectDeckCutSector(cache, [10, -30, 22], 0)).toBe(0);
    expect(selectDeckCutSector(cache, [20, -30, 22], 0)).toBe(1);
  });

  it("preserves actual Crest floor, glass, original maps and existing voids while opening both sides of low equipment", () => {
    const doc = prefabById("fed.m.crest")!;
    const catalog = defaultPrefabComponentCatalog();
    const dressed = dressShip(doc, { catalog });
    const original = compileShipVisual(
      doc,
      catalog,
      "deck",
      "federation",
      undefined,
      "r002",
    ).cells;
    const before = visualVolumeSha256(original);
    const cache = buildDeckCutCache(
      doc,
      catalog,
      dressed,
      original,
      "r002",
      "federation",
    )!;
    expect(cache.states).toHaveLength(4);
    for (const state of cache.states) {
      expect(state.removedCells).toBeGreaterThan(0);
      for (const [key, c] of original) {
        if (c.role === "floor" || c.slot === "glass" || c.z < 11)
          expect(state.cells.get(key)).toEqual(c);
      }
      for (const key of state.cells.keys())
        expect(original.has(key)).toBe(true);
      expect(state.cells.size).toBe(original.size - state.removedCells);
    }
    expect(visualVolumeSha256(original)).toBe(before);
    // Native source sockets: med bed at south wall and locker at north wall. Their adjacent
    // opaque wall columns are opened only toward the corresponding camera; the far skin remains.
    const south = cache.states[0],
      north = cache.states[2];
    expect(original.has(visualCellKey(80, 1, 20))).toBe(true);
    expect(south.cells.has(visualCellKey(80, 1, 20))).toBe(false);
    expect(north.cells.has(visualCellKey(80, 1, 20))).toBe(true);
    expect(
      buildDeckCutCache(doc, catalog, dressed, original, "r001", "federation"),
    ).toBeNull();
    expect(
      buildDeckCutCache(doc, catalog, dressed, original, "r002", "riftjack"),
    ).toBeNull();
  }, 20000);
});
