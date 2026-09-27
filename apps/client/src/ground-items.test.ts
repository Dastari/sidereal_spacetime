import { describe, expect, it } from "vitest";
import { groundItemsForScene } from "./ground-items";

const drops = [
  { id: "legacy", instanceId: "", deckId: "", elevationM: 0.16 },
  { id: "upper", instanceId: "ship-a", deckId: "upper", elevationM: 3.1875 },
  { id: "lower", instanceId: "ship-a", deckId: "lower", elevationM: 0.1875 },
  { id: "other", instanceId: "ship-b", deckId: "upper", elevationM: 6.1875 },
] as const;
const upper = {
  active: true,
  visit: { instanceId: "ship-a", deckId: "upper" },
  instance: { id: "ship-a" },
};

describe("ground drops across accepted scene changes", () => {
  it("keeps the accepted support height and excludes other decks/instances", () => {
    expect(groundItemsForScene(drops, upper)).toEqual([drops[1]]);
    expect(groundItemsForScene(drops, upper)[0]).toBe(drops[1]);
    expect(
      groundItemsForScene(drops, {
        ...upper,
        visit: { instanceId: "ship-a", deckId: "lower" },
      }),
    ).toEqual([drops[2]]);
  });

  it("hides stale rows while a new ship document is unavailable or mismatched", () => {
    expect(
      groundItemsForScene(drops, { ...upper, instance: undefined }),
    ).toEqual([]);
    expect(
      groundItemsForScene(drops, { ...upper, instance: { id: "ship-b" } }),
    ).toEqual([]);
    expect(groundItemsForScene(drops, { active: true })).toEqual([]);
  });

  it("hides drops during stair traversal and revoked safe-egress presentation", () => {
    expect(
      groundItemsForScene(drops, {
        ...upper,
        acceptedStair: { phase: "walking" },
      }),
    ).toEqual([]);
    expect(
      groundItemsForScene(drops, {
        ...upper,
        instance: undefined,
        acceptedStair: { phase: "returning" },
      }),
    ).toEqual([]);
  });

  it("does not carry native rows back into the legacy lab", () => {
    expect(groundItemsForScene(drops, { active: false })).toEqual([drops[0]]);
  });
});
