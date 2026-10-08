import { describe, expect, it } from "vitest";
import {
  byteCounters,
  deltaCounters,
  distribution,
  validatePopulation,
} from "./capacity-metrics";
describe("capacity evidence", () => {
  it("reports empty samples explicitly and uses nearest-rank percentiles", () => {
    expect(distribution([])).toEqual({
      samples: 0,
      min: null,
      p50: null,
      p95: null,
      p99: null,
      max: null,
    });
    const samples = Array.from({ length: 100 }, (_, i) => 100 - i);
    expect(distribution(samples)).toEqual({
      samples: 100,
      min: 1,
      p50: 50,
      p95: 95,
      p99: 99,
      max: 100,
    });
    expect(samples[0]).toBe(100);
    expect(() => distribution([NaN])).toThrow();
  });
  it("separates compressed, decoded and outgoing payload bytes across phases", () => {
    const first = byteCounters(),
      next = {
        ...first,
        incomingPayloadBytes: 30,
        decodedBytes: 120,
        outgoingPayloadBytes: 7,
        incomingFrames: 2,
      };
    expect(deltaCounters(next, first)).toEqual(next);
    expect(deltaCounters(next, next)).toEqual(first);
  });
  it("preserves admission and per-host grant limits with distinct actors", () => {
    for (const size of [50, 100]) {
      const p = validatePopulation(size);
      expect(p.hosts + p.passengers).toBe(size);
      expect(p.passengers / p.hosts).toBe(4);
      expect(p.canonicalShips).toBeLessThan(60);
      expect(p.passengers).toBeLessThan(128);
    }
    expect(() => validatePopulation(101)).toThrow();
  });
});
