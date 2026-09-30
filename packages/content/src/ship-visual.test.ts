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
  it("accepts only bounded two-axis manufactured planes and rejects contact/optical ownership", () => {
    const good = {
      id: "case",
      a: [1, -1, 0] as [number, number, number],
      d: 1,
    };
    expect(() =>
      validateShipVisualLayers([{ ...layer, facet: good }]),
    ).not.toThrow();
    for (const facet of [
      { ...good, id: " " },
      { ...good, a: [1, 1, 1] },
      { ...good, a: [1, 0, 0] },
      { ...good, a: [1, NaN, 0] },
      { ...good, a: [2, 1, 0] },
      { ...good, d: 0.5 },
      { ...good, d: Infinity },
      { ...good, d: 1000001 },
    ])
      expect(() =>
        validateShipVisualLayers([
          { ...layer, facet: facet as ShipVisualLayer["facet"] },
        ]),
      ).toThrow(/facet/);
    for (const extra of [
      { role: "floor" },
      { role: "doorframe" },
      { role: "service" },
      { role: "void" },
      { surfaceRole: "floor" },
      { slot: "glass" },
      { slot: "emit_a" },
      { slot: "emit_b" },
    ])
      expect(() =>
        validateShipVisualLayers([
          { ...layer, ...extra, facet: good } as ShipVisualLayer,
        ]),
      ).toThrow(/facet/);
  });
});
