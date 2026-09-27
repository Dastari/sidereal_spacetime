import { describe, expect, test } from "vitest";
import {
  passengerAdmission,
  type PassengerAdmissionFacts,
} from "./passenger-admission";
function facts(): PassengerAdmissionFacts {
  return {
    principalId: "passenger",
    liveGame: true,
    nowMicros: 100n,
    actor: {
      id: "crew",
      ownerId: "passenger",
      shipId: "ship",
      connected: true,
    },
    grant: {
      id: "grant",
      ownerId: "captain",
      granteeId: "crew",
      granteeOwnerId: "passenger",
      shipId: "ship",
      deckId: "deck",
      instanceRevision: 3n,
      revision: 2n,
      expiresMicros: 101n,
    },
    visit: {
      characterId: "crew",
      ownerId: "passenger",
      shipId: "ship",
      deckId: "deck",
      grantId: "grant",
      grantRevision: 2n,
      visitId: "visit",
      admissionRevision: 7n,
      recoveryReason: "",
    },
    instance: {
      id: "ship",
      ownerId: "captain",
      revision: 3n,
      blueprintSha256: "qualified",
    },
    ship: { id: "ship", ownerId: "captain" },
    binding: {
      shipId: "ship",
      instanceId: "ship",
      ownerId: "captain",
      deckId: "deck",
      instanceRevision: 3n,
      blueprintSha256: "qualified",
      lifecycle: "active",
    },
    location: {
      characterId: "crew",
      instanceId: "ship",
      deckId: "deck",
      visitId: "visit",
    },
    admission: {
      characterId: "crew",
      ownerId: "passenger",
      shipId: "ship",
      systemId: "system",
      revision: 7n,
    },
    motion: { shipId: "ship", systemId: "system" },
    deck: { id: "deck", instanceId: "ship" },
  };
}
test("explicit membership grants walking and interior visibility only", () => {
  expect(passengerAdmission(facts())).toEqual({
    readInterior: true,
    walkDeck: true,
    useObjects: false,
    pilotWithoutStation: false,
    refit: false,
  });
});
describe("every current relation is required", () => {
  for (const key of [
    "actor",
    "grant",
    "visit",
    "instance",
    "ship",
    "binding",
    "location",
    "admission",
    "motion",
    "deck",
  ] as const)
    test(`missing ${key}`, () => {
      const f = facts();
      delete f[key];
      expect(passengerAdmission(f).readInterior).toBe(false);
    });
  test("any identity, revision, placement or membership mismatch denies access", () => {
    const original = facts();
    for (const key of [
      "actor",
      "grant",
      "visit",
      "instance",
      "ship",
      "binding",
      "location",
      "admission",
      "motion",
      "deck",
    ] as const) {
      for (const [field, value] of Object.entries(original[key]!)) {
        if (field === "expiresMicros") continue;
        const f = facts();
        (f[key] as Record<string, unknown>)[field] =
          typeof value === "bigint"
            ? value + 1n
            : typeof value === "boolean"
              ? !value
              : "mismatch";
        expect(passengerAdmission(f).walkDeck, `${key}.${field}`).toBe(false);
      }
    }
  });
});
test("expiry is exclusive and revoked grants cannot be revived by an old visit", () => {
  const f = facts();
  f.nowMicros = 101n;
  expect(passengerAdmission(f).walkDeck).toBe(false);
  f.nowMicros = undefined;
  f.grant = undefined;
  expect(passengerAdmission(f).readInterior).toBe(false);
});
test("live game and connected current grantee are mandatory", () => {
  for (const change of [
    { liveGame: false },
    { principalId: "captain" },
    { principalId: "" },
  ])
    expect(passengerAdmission({ ...facts(), ...change }).readInterior).toBe(
      false,
    );
});
