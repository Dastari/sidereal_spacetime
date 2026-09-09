import { expect, test } from "vitest";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import { gameShipAccess, type GameShipAccessFacts } from "./game-ship-access";
const facts = (): GameShipAccessFacts => ({
  ship: { id: "ship", ownerId: "owner" },
  motion: { shipId: "ship", systemId: "shared" },
  principalId: "owner",
  liveGame: true,
  actor: { id: "actor", ownerId: "owner", shipId: "ship" },
  binding: {
    shipId: "ship",
    instanceId: "ship",
    deckId: "deck",
    ownerId: "owner",
    characterId: "actor",
    templateSha256: WAYFARER_STARTER.sha256,
    instanceRevision: 1n,
    lifecycle: "active",
  },
  instance: {
    id: "ship",
    ownerId: "owner",
    revision: 1n,
    blueprintSha256: WAYFARER_STARTER.sha256,
  },
  deck: { id: "deck", instanceId: "ship" },
  location: { characterId: "actor", instanceId: "ship", deckId: "deck" },
  admission: { characterId: "actor", shipId: "ship", systemId: "shared" },
});
test("owned accepted gameplay deck works without granting authoring or ownership-only piloting", () => {
  expect(gameShipAccess(facts())).toEqual({
    readInterior: true,
    walkDeck: true,
    useObjects: true,
    pilotWithoutStation: false,
    authorBlueprints: false,
    refit: false,
  });
});
test.each([
  "actor",
  "binding",
  "instance",
  "deck",
  "location",
  "admission",
  "ship",
  "motion",
] as const)("missing %s fails closed", (key) => {
  const f = facts();
  delete f[key];
  expect(gameShipAccess(f).readInterior).toBe(false);
});
test("foreign identity, stale deck/revision, disconnected admission and suspended ownership deny", () => {
  const changes: ((f: GameShipAccessFacts) => void)[] = [
    (f) => {
      f.liveGame = false;
    },
    (f) => {
      f.principalId = "foreign";
    },
    (f) => {
      f.actor!.shipId = "other";
    },
    (f) => {
      f.binding!.characterId = "other";
    },
    (f) => {
      f.instance!.ownerId = "foreign";
    },
    (f) => {
      f.instance!.revision = 2n;
    },
    (f) => {
      f.binding!.templateSha256 = "forged";
    },
    (f) => {
      f.location!.deckId = "other";
    },
    (f) => {
      f.admission!.shipId = "other";
    },
    (f) => {
      f.admission!.systemId = "";
    },
    (f) => {
      f.binding!.lifecycle = "suspended";
    },
    (f) => {
      f.deck!.instanceId = "other";
    },
  ];
  changes.push(
    (f) => {
      f.motion!.systemId = "other";
    },
    (f) => {
      f.ship!.ownerId = "foreign";
    },
  );
  for (const change of changes) {
    const f = facts();
    change(f);
    expect(gameShipAccess(f).useObjects).toBe(false);
  }
});
