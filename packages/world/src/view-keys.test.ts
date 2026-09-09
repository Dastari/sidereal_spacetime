import { expect, test, vi } from "vitest";
// Replace only the server host boundary; builders are the real SDK builders.
vi.mock("spacetimedb/server", async () => {
  const { t } = await import("spacetimedb");
  return { t, SenderError: class extends Error {}, Range: class {} };
});
import { appearanceProjection } from "./appearance";
import { identityLinkProjection } from "./auth";
import { combatProjection } from "./combat";
import { grantProjection, draftProjection, blueprintProjection } from "./construction";
import { instanceProjection, deckProjection, locationProjection } from "./construction-instances";
import { doorProjection } from "./construction-doors";
import { nativePressureProjection } from "./construction-native-pressure";
import { traversalProjection, traversalLinkProjection } from "./construction-traversal";
import { stateProjection, itemProjection, containerProjection, hotbarProjection } from "./inventory";
import { groundItemProjection } from "./inventory-operations";
import { interactionProjection } from "./interactions";

// Use the real pinned SDK row metadata: a plain t.object erases these keys.
// Keys here are unique within an admitted sender's projected row set.
const projections = [
  [appearanceProjection, "characterId"], [identityLinkProjection, "id"],
  [combatProjection, "characterId"], [grantProjection, "id"],
  [draftProjection, "id"], [blueprintProjection, "id"],
  [instanceProjection, "id"], [deckProjection, "id"],
  [locationProjection, "characterId"], [doorProjection, "id"],
  [nativePressureProjection, "doorId"], [traversalProjection, "characterId"],
  [traversalLinkProjection, "id"], [stateProjection, "pocketsId"],
  [itemProjection, "id"], [containerProjection, "id"],
  [hotbarProjection, "slot"], [groundItemProjection, "id"],
  [interactionProjection, "id"],
] as const;

test("every handcrafted client view retains exactly one stable SDK row key", () => {
  for (const [projection, expected] of projections) {
    const keys = Object.entries(projection.row)
      .filter(([, column]) => column.columnMetadata.isPrimaryKey === true)
      .map(([name]) => name);
    expect(keys).toEqual([expected]);
  }
});
