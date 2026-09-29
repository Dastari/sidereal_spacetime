import { describe, it, expect } from "vitest";
import {
  PHYSICAL_CATALOG,
  SHIP_FLIGHT_SPEED,
} from "./physical-definitions";

describe("physical source catalog", () => {
  it("keeps physical definitions immutable and profile speed explicit without live fixture imports", () => {
    expect(Object.isFrozen(PHYSICAL_CATALOG.definitions)).toBe(true);
    expect(Object.isFrozen(PHYSICAL_CATALOG.definitions[0].centroid)).toBe(
      true,
    );
    expect(SHIP_FLIGHT_SPEED).toEqual({ forward: 30, reverse: 12 });
  });
});
