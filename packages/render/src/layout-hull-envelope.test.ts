import { describe, expect, it } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  createLayoutHullEnvelope,
  layoutHullEnvelopeLines,
} from "./layout-hull-envelope";

describe("3D hull envelope guide", () => {
  it("dashes the hull rectangle on the deck plane in renderer metres", () => {
    const lines = layoutHullEnvelopeLines(
      { origin: [-160, 0], width: 320, length: 704 },
      128,
      [1, 0.5, -2],
    );
    expect(lines.length).toBeGreaterThan(8);
    const points = lines.flat();
    // Every point sits on the deck plane just above the floor datum.
    for (const [, y] of points) expect(y).toBeCloseTo(128 / 32 - 0.5 + 0.02, 6);
    // Corners of the rectangle appear as dash endpoints.
    const xs = points.map((p) => p[0]),
      zs = points.map((p) => p[2]);
    expect(Math.min(...xs)).toBeCloseTo(-160 / 32 - 1, 6);
    expect(Math.max(...xs)).toBeCloseTo(160 / 32 - 1, 6);
    expect(Math.max(...zs)).toBeCloseTo(0 + 2, 6);
    expect(Math.min(...zs)).toBeCloseTo(-704 / 32 + 2, 6);
  });
  it("rejects missing or degenerate envelopes", () => {
    expect(layoutHullEnvelopeLines(undefined, 0)).toEqual([]);
    expect(
      layoutHullEnvelopeLines({ origin: [0, 0], width: 0, length: 64 }, 0),
    ).toEqual([]);
    expect(
      layoutHullEnvelopeLines({ origin: [0, NaN], width: 64, length: 64 }, 0),
    ).toEqual([]);
  });
  it("builds one line mesh, hides it when not visible and rebuilds on change", () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    const guide = createLayoutHullEnvelope(scene);
    guide.update({ origin: [0, 0], width: 64, length: 64 }, 0, true);
    const first = guide.mesh!;
    expect(first.isEnabled()).toBe(true);
    guide.update({ origin: [0, 0], width: 64, length: 64 }, 0, false);
    expect(first.isEnabled()).toBe(false);
    guide.update({ origin: [0, 0], width: 128, length: 64 }, 0, true);
    expect(guide.mesh).not.toBe(first);
    expect(first.isDisposed()).toBe(true);
    guide.dispose();
    engine.dispose();
  });
});
