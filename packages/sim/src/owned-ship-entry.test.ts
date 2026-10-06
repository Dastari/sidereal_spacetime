import { expect, test } from "vitest";
import { gameShipAccess, type GameShipAccessFacts } from "./game-ship-access";
import { ownedShipEntryAccess } from "./owned-ship-entry";

function facts(): GameShipAccessFacts {
  return {
    principalId: "owner",
    liveGame: true,
    actor: { id: "character", ownerId: "owner", shipId: "source" },
    ship: { id: "target", ownerId: "owner" },
    binding: {
      shipId: "target",
      instanceId: "target",
      deckId: "deck",
      ownerId: "owner",
      characterId: "character",
      templateSha256: "pin",
      instanceRevision: 2n,
      lifecycle: "active",
    },
    instance: {
      id: "target",
      ownerId: "owner",
      revision: 2n,
      blueprintSha256: "pin",
      blueprintId: "trusted-prefab:fed.s.wren-fleet:r1",
    },
    deck: { id: "deck", instanceId: "target" },
    motion: { shipId: "target", systemId: "system" },
    admission: {
      characterId: "character",
      shipId: "source",
      systemId: "system",
    },
  };
}

test("owned target can admit an EVA approach without admitting its private interior", () => {
  const f = facts();
  expect(ownedShipEntryAccess(f)).toBe(true);
  expect(gameShipAccess(f).readInterior).toBe(false);
  f.actor!.shipId = "target";
  f.admission!.shipId = "target";
  f.location = {
    characterId: "character",
    instanceId: "target",
    deckId: "deck",
  };
  expect(gameShipAccess(f).readInterior).toBe(true);
});

test.each([
  (f: GameShipAccessFacts) => {
    f.liveGame = false;
  },
  (f: GameShipAccessFacts) => {
    f.ship!.ownerId = "foreign";
  },
  (f: GameShipAccessFacts) => {
    f.binding!.characterId = "foreign";
  },
  (f: GameShipAccessFacts) => {
    f.binding!.lifecycle = "suspended";
  },
  (f: GameShipAccessFacts) => {
    f.instance!.revision++;
  },
  (f: GameShipAccessFacts) => {
    f.instance!.blueprintSha256 = "changed";
  },
  (f: GameShipAccessFacts) => {
    f.instance!.blueprintId = "player-authored";
  },
  (f: GameShipAccessFacts) => {
    f.motion!.systemId = "remote";
  },
  (f: GameShipAccessFacts) => {
    f.admission!.shipId = "other";
  },
  (f: GameShipAccessFacts) => {
    f.deck!.instanceId = "other";
  },
])("owned EVA target gate rejects changed authority facts", (change) => {
  const f = facts();
  change(f);
  expect(ownedShipEntryAccess(f)).toBe(false);
});
