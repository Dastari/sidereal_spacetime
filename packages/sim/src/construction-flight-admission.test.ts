import { expect, test } from "vitest";
import {
  planFlightReviewAdmission,
  planFlightReviewRestore,
} from "./construction-flight-admission";
function fixture() {
  return {
    principalId: "owner",
    actor: {
      id: "actor",
      ownerId: "owner",
      shipId: "target",
      connected: true,
      standing: true,
    },
    visit: {
      characterId: "actor",
      visitId: "visit",
      instanceId: "target",
      deckId: "deck",
      revision: 3n,
      returnShipId: "original",
    },
    admission: {
      characterId: "actor",
      ownerId: "owner",
      shipId: "original",
      systemId: "system",
      revision: 7n,
    },
    source: {
      id: "original",
      ownerId: "owner",
      systemId: "system",
      stationOccupied: false,
    },
    target: {
      id: "target",
      ownerId: "owner",
      systemId: "system",
      stationOccupied: false,
    },
    targetDeckId: "deck",
    targetActive: true,
    hasCurrentGrant: true,
  };
}
const request = {
  expectedVisitId: "visit",
  expectedVisitRevision: 3n,
  expectedAdmissionRevision: 7n,
  operationId: "begin",
};
test("explicit switch preserves original membership and restores it with monotonically newer revision", () => {
  const f = fixture(),
    before = structuredClone(f),
    begin = planFlightReviewAdmission(f, request);
  expect(f).toEqual(before);
  expect(begin.admission.shipId).toBe("target");
  expect(begin.admission.revision).toBe(8n);
  expect(begin.state.originalAdmissionRevision).toBe(7n);
  const restore = planFlightReviewRestore(
    {
      ...f,
      admission: begin.admission,
      state: begin.state,
      targetStationOccupied: false,
    },
    { ...request, expectedAdmissionRevision: 8n, operationId: "return" },
  );
  expect(restore).toEqual({ ...f.admission, revision: 9n });
});
test("wrong visit/deck/owner/lease location, occupied seats and cross-system requests reject", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => (f.actor.ownerId = "other"),
    (f: ReturnType<typeof fixture>) => (f.actor.shipId = "original"),
    (f: ReturnType<typeof fixture>) => (f.visit.deckId = "other-deck"),
    (f: ReturnType<typeof fixture>) => (f.visit.visitId = "old-visit"),
    (f: ReturnType<typeof fixture>) => (f.admission.revision = 8n),
    (f: ReturnType<typeof fixture>) => (f.source.ownerId = "other"),
    (f: ReturnType<typeof fixture>) => (f.target.ownerId = "other"),
    (f: ReturnType<typeof fixture>) => (f.target.systemId = "other-system"),
    (f: ReturnType<typeof fixture>) => (f.source.stationOccupied = true),
    (f: ReturnType<typeof fixture>) => (f.target.stationOccupied = true),
    (f: ReturnType<typeof fixture>) => (f.actor.standing = false),
    (f: ReturnType<typeof fixture>) => (f.hasCurrentGrant = false),
    (f: ReturnType<typeof fixture>) => (f.targetActive = false),
  ]) {
    const f = fixture();
    mutate(f);
    expect(() => planFlightReviewAdmission(f, request)).toThrow();
  }
});
test("return works after grant loss but requires exact saved admission and recovered seat", () => {
  const f = fixture(),
    begin = planFlightReviewAdmission(f, request);
  const input = {
      ...f,
      hasCurrentGrant: false,
      admission: begin.admission,
      state: begin.state,
      targetStationOccupied: false,
    },
    r = { ...request, expectedAdmissionRevision: 8n, operationId: "return" };
  expect(planFlightReviewRestore(input, r).shipId).toBe("original");
  for (const mutate of [
    (x: typeof input) => x.admission.revision++,
    (x: typeof input) => (x.visit.visitId = "new-visit"),
    (x: typeof input) => (x.visit.returnShipId = "another"),
    (x: typeof input) => (x.source.ownerId = "other"),
    (x: typeof input) => (x.source.systemId = "another-system"),
    (x: typeof input) => (x.targetStationOccupied = true),
    (x: typeof input) => (x.actor.standing = false),
  ]) {
    const bad = structuredClone(input);
    mutate(bad);
    expect(() => planFlightReviewRestore(bad, r)).toThrow();
  }
});
