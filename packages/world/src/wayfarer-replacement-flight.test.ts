import { expect, test, vi } from "vitest";
vi.mock("spacetimedb/server", () => ({ SenderError: class extends Error {} }));
vi.mock("./wayfarer-starter-authority", () => ({
  installReplacementWayfarer: vi.fn(),
}));
import {
  REPLACED_SHIP_TABLES,
  replacementRows,
  replacePlayerWayfarer,
} from "./wayfarer-replacement";
import { WAYFARER_REPLACEMENT_OPERATOR } from "./wayfarer-replacement-operator";

test("replacement removes its compiled state, pending damage and invitations without following a grantee into another ship", () => {
  const own = [
    { table: "constructionFlightCompiled", row: { shipId: "ship-a" } },
    { table: "constructionFlightDirty", row: { shipId: "ship-a" } },
    {
      table: "constructionFlightDamageEvent",
      row: { id: "damage", shipId: "ship-a" },
    },
    {
      table: "constructionPassengerGrant",
      row: { id: "grant", shipId: "ship-a", granteeId: "guest" },
    },
  ];
  for (const entry of own) expect(REPLACED_SHIP_TABLES).toContain(entry.table);
  const foreign = [
    {
      table: "inventoryContainer",
      row: { id: "guest-cargo", characterId: "guest", shipId: "ship-b" },
    },
    { table: "constructionFlightCompiled", row: { shipId: "ship-b" } },
  ];
  expect(replacementRows([...own, ...foreign], "owner", "ship-a")).toEqual(own);
  expect(REPLACED_SHIP_TABLES).not.toContain("constructionPassengerReceipt");
  expect(REPLACED_SHIP_TABLES).not.toContain("constructionPassengerVisit");
});

test("operator replacement rejects an outstanding passenger return before scanning or deleting runtime rows", () => {
  const identity = {
    toHexString: () => WAYFARER_REPLACEMENT_OPERATOR,
    isEqual: () => true,
  };
  const actor = { id: "owner", shipId: "ship-a", owner: identity };
  const db = {
    constructionReceipt: { id: { find: () => undefined } },
    character: { id: { find: () => actor }, iter: () => [actor] },
    ship: {
      id: { find: () => ({ id: "ship-a", owner: identity, revision: 1n }) },
    },
    constructionInstance: { id: { find: () => undefined } },
    constructionReviewOrigin: { characterId: { find: () => undefined } },
    constructionFlightReview: { characterId: { find: () => undefined } },
    constructionPassengerVisit: {
      iter: () => [
        { characterId: "guest", shipId: "ship-b", sourceShipId: "ship-a" },
      ],
    },
  };
  expect(() =>
    replacePlayerWayfarer({ db, sender: identity } as never, {
      characterId: "owner",
      expectedShipId: "ship-a",
      expectedShipRevision: 1n,
    }),
  ).toThrow("Finish passenger return before replacement");
});
