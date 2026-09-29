import { expect, test } from "vitest";
import {
  TRUSTED_PREFAB_BLUEPRINT_PREFIX,
  gameShipAccess,
  type GameShipAccessFacts,
} from "./game-ship-access";
const PREFAB_SHA = "a".repeat(64);
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
    templateSha256: PREFAB_SHA,
    instanceRevision: 1n,
    lifecycle: "active",
  },
  instance: {
    id: "ship",
    ownerId: "owner",
    revision: 1n,
    blueprintSha256: PREFAB_SHA,
    blueprintId: TRUSTED_PREFAB_BLUEPRINT_PREFIX + "fed.s.wren:r1",
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
test("a trusted prefab keeps access at a later instance revision only when binding and instance agree", () => {
  const prefab = (revision: bigint, bound: bigint) => {
    const f = facts();
    f.instance!.blueprintSha256 = "prefab-r4";
    f.instance!.blueprintId = TRUSTED_PREFAB_BLUEPRINT_PREFIX + "fed.s.wren:r4";
    f.instance!.revision = revision;
    f.binding!.templateSha256 = "prefab-r4";
    f.binding!.instanceRevision = bound;
    return gameShipAccess(f).walkDeck;
  };
  // Operator in-place upgrades install the next revision (r3 at revision 1 -> r4 at revision 2).
  expect(prefab(1n, 1n)).toBe(true);
  expect(prefab(2n, 2n)).toBe(true);
  expect(prefab(2n, 1n)).toBe(false);
  expect(prefab(0n, 0n)).toBe(false);
  // Without the trusted prefab blueprint id no instance is admitted (player publications and
  // the retired Wayfarer template alike).
  for (const blueprintId of [undefined, "player-blueprint", "fed.s.wren:r1"]) {
    const f = facts();
    f.instance!.blueprintId = blueprintId;
    expect(gameShipAccess(f).walkDeck).toBe(false);
  }
});
