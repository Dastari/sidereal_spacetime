import { expect, it } from "vitest";
import { gameViewKeys, GAME_VIEW_KEYS } from "./game-subscriptions";
import { tables } from "./generated";
it("keeps the complete production actor baseline and conditional review view", () => {
  expect(GAME_VIEW_KEYS.length).toBe(57);
  expect(new Set(GAME_VIEW_KEYS).size).toBe(57);
  for (const key of gameViewKeys()) expect(tables[key]).toBeDefined();
  expect(gameViewKeys()).not.toContain("ownConstructionGrants");
  const review = gameViewKeys(true);
  expect(review.length).toBe(58);
  expect(review.filter((k) => k !== "ownConstructionGrants")).toEqual(
    gameViewKeys(),
  );
  expect(review.indexOf("ownConstructionGrants")).toBe(
    review.indexOf("ownIdentityLinks") - 1,
  );
  expect(gameViewKeys()).not.toContain("ownWorldAdmission");
});
