import { describe, expect, it } from "vitest";
import { validateShipVisualLayers, type ShipVisualLayer } from "./ship-visual";

describe("candidate original side-plane ownership", () => {
  const layer: ShipVisualLayer = {
    id: "side",
    role: "core",
    slot: "secondary",
    bounds: [0, 0, 0, 1, 1, 2],
  };
  it("accepts independent unit XY ownership and leaves absent descriptors valid", () => {
    expect(() => validateShipVisualLayers([layer])).not.toThrow();
    expect(() =>
      validateShipVisualLayers([
        {
          ...layer,
          normalSide: { id: "edge:2", normal: [0.6, 0.8, 0], faces: 10 },
        },
      ]),
    ).not.toThrow();
  });
  it("rejects malformed planes and non-XY face masks", () => {
    for (const normalSide of [
      { id: "", normal: [1, 0, 0], faces: 1 },
      { id: "edge", normal: [NaN, 0, 0], faces: 1 },
      { id: "edge", normal: [2, 0, 0], faces: 1 },
      { id: "edge", normal: [0, 0, 1], faces: 1 },
      { id: "edge", normal: [1, 0, 0], faces: 0 },
      { id: "edge", normal: [1, 0, 0], faces: 16 },
      { id: "edge", normal: [1, 0, 0], faces: 4294967297 },
      { id: "edge", normal: [1, 0, 0], faces: 1.5 },
    ])
      expect(() =>
        validateShipVisualLayers([
          { ...layer, normalSide: normalSide as ShipVisualLayer["normalSide"] },
        ]),
      ).toThrow("side ownership");
  });
});
