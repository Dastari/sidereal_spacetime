import { expect, test } from "vitest";
import { createConstructionStandingSupport } from "./construction-standing-support";

const SHIP = "00000000-0000-4000-8000-000000000001";
const DECK = "00000000-0000-4000-8000-000000000002";
function fixture() {
  return {
    actor: { id: "actor", shipId: SHIP, localX: 0, localY: 8.99 },
    location: { characterId: "actor", instanceId: SHIP, deckId: DECK },
    deck: { id: DECK, instanceId: SHIP, elevation: 0 },
    instance: {
      id: SHIP,
      blueprintSha256: "a".repeat(64),
      documentJson: "{}",
      idMapJson: "{}",
    },
  };
}

test("native floor support reconstructs after reconnect without mutating saved state", () => {
  const scope = fixture(),
    before = JSON.stringify(scope);
  const height = createConstructionStandingSupport();
  expect(height(scope)).toBe(0.1875);
  for (let i = 0; i < 20; i++) expect(height(scope)).toBe(0.1875);
  expect(createConstructionStandingSupport()(JSON.parse(before))).toBe(0.1875);
  expect(JSON.stringify(scope)).toBe(before);
});

test("own support rejects cross-actor, cross-instance, cross-deck and non-finite samples", () => {
  const scope = fixture(),
    height = createConstructionStandingSupport();
  expect(() =>
    height({ ...scope, actor: { ...scope.actor, id: "other" } }),
  ).toThrow("matching");
  expect(() =>
    height({ ...scope, actor: { ...scope.actor, shipId: "other" } }),
  ).toThrow("matching");
  expect(() =>
    height({ ...scope, location: { ...scope.location, deckId: "other" } }),
  ).toThrow("matching");
  expect(() =>
    height({ ...scope, deck: { ...scope.deck, instanceId: "other" } }),
  ).toThrow("matching");
  expect(() =>
    height({ ...scope, deck: { ...scope.deck, elevation: NaN } }),
  ).toThrow("matching");
  expect(() =>
    height({ ...scope, actor: { ...scope.actor, localX: NaN } }),
  ).toThrow("matching");
});

test("generic deck support uses the accepted deck datum in meters", () => {
  const scope = fixture();
  scope.deck.elevation = 3.1875;
  expect(createConstructionStandingSupport()(scope)).toBe(3.375);
});
