import { describe, expect, it } from "vitest";
import { wallEdgeSpan } from "./wall-edge-placement";
import type { Point } from "@sidereal/content/ship-layout";
const edge = (a: Point, b: Point, deckId = "deck-a") => ({
  a,
  b,
  deckId,
  tileIds: ["left", "right"],
});
describe("wall placement on structural edge lines", () => {
  it("accepts connected grid edges in either direction", () => {
    const edges = [edge([64, 0], [64, 64]), edge([64, 64], [64, 128])];
    expect(wallEdgeSpan(edges, "deck-a", [64, 0], [64, 128])).toBe(true);
    expect(wallEdgeSpan(edges, "deck-a", [64, 128], [64, 0])).toBe(true);
    expect(wallEdgeSpan(edges, "deck-a", [32, 0], [32, 128])).toBe(false);
  });
  it("rejects missing support, other decks, and exterior-only edges", () => {
    const edges = [edge([64, 0], [64, 64]), edge([64, 128], [64, 192])];
    expect(wallEdgeSpan(edges, "deck-a", [64, 0], [64, 192])).toBe(false);
    expect(wallEdgeSpan(edges, "deck-b", [64, 0], [64, 64])).toBe(false);
    expect(
      wallEdgeSpan(
        [{ ...edges[0], tileIds: ["one"] }],
        "deck-a",
        [64, 0],
        [64, 64],
      ),
    ).toBe(false);
  });
  it("retains actual diagonal interfaces but never cuts diagonally through squares", () => {
    expect(
      wallEdgeSpan([edge([0, 0], [64, 64])], "deck-a", [0, 0], [64, 64]),
    ).toBe(true);
    expect(
      wallEdgeSpan(
        [edge([0, 0], [64, 0]), edge([64, 0], [64, 64])],
        "deck-a",
        [0, 0],
        [64, 64],
      ),
    ).toBe(false);
  });
});
