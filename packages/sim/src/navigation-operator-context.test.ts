import { describe, expect, test, vi } from "vitest";
import {
  acceptedNavigationOperator,
  registeredNavigationContext,
  type AcceptedOperatorTuple,
  type AdmittedNavigationContext,
  type NavigationOperatorRegistration,
} from "./navigation-operator-context";

// Synthetic test arguments only: these hashes never enter production registration DATA.
const registration: NavigationOperatorRegistration = {
  profileId: "test-operator",
  certificateSha256: "a".repeat(64),
  proofSha256: "b".repeat(64),
  manifestSha256: "c".repeat(64),
  compilerSha256: "d".repeat(64),
  geometrySha256: "e".repeat(64),
  navigationSha256: "f".repeat(64),
  prefabId: "fed.s.wren",
  blueprintSha256: "1".repeat(64),
  catalogId: "ship-components-v1",
  catalogRevision: 4,
  catalogSha256: "2".repeat(64),
  mountSourceId: "helm",
  stationX: 0,
  stationY: 3.5,
};
const context: AdmittedNavigationContext = {
  ...registration,
  storedMappingAgrees: true,
  internalQuarterTurns: 0,
  artQuarterTurns: 2,
  deckElevationM: 0,
  floorElevationM: 0.1875,
};
const tuple: AcceptedOperatorTuple = {
  characterId: "visible-body",
  instanceId: "ship",
  deckId: "deck",
  visitId: "visit",
  stationId: "station",
  seatPlacedObjectId: "placed-seat",
  consolePlacedObjectId: "placed-console",
  instanceRevision: "3",
  locationRevision: "2",
  bindingRevision: "7",
  mappingRevision: "1",
  seatRevision: "1",
  seatInstanceRevision: "3",
  bindingInstanceRevision: "3",
  lifecycle: "active",
  connected: true,
  dead: false,
  recoveryRequested: false,
  operational: true,
  occupantId: "visible-body",
  acceptedX: 0,
  acceptedY: 3.5,
  standingElevationM: 0.1875,
};

test("EMPTY registration never calls admission, including a failing reader", () => {
  const read = vi.fn(() => {
    throw Error("must not compile");
  });
  expect(registeredNavigationContext([], read)).toBeNull();
  expect(read).not.toHaveBeenCalled();
});

test("one finite exact source is admitted once; ambiguous registration fails closed", () => {
  const read = vi.fn(() => context);
  expect(registeredNavigationContext([registration], read)).toEqual({
    context,
    registration,
  });
  expect(read).toHaveBeenCalledOnce();
  expect(
    registeredNavigationContext([registration, registration], read),
  ).toBeNull();
  expect(
    registeredNavigationContext([registration], () => {
      throw Error("bad source");
    }),
  ).toBeNull();
});

describe("current source, exact mount orientation and floor datum", () => {
  test.each([
    { blueprintSha256: "9".repeat(64) },
    { catalogRevision: 5 },
    { catalogSha256: "8".repeat(64) },
    { mountSourceId: "other-helm" },
    { storedMappingAgrees: false },
    { internalQuarterTurns: 1 },
    { internalQuarterTurns: 2 },
    { internalQuarterTurns: 3 },
    { artQuarterTurns: 0 },
    { deckElevationM: 1 },
    { floorElevationM: 0 },
    { stationX: NaN },
    { stationY: 3.6 },
  ])("withdraws qualification for %j", (change) => {
    expect(
      registeredNavigationContext([registration], () => ({
        ...context,
        ...change,
      })),
    ).toBeNull();
  });
});

describe("accepted current occupant and coherent epoch", () => {
  test("returns the exact accepted tuple without producing a transform", () => {
    const matched = registeredNavigationContext([registration], () => context)!;
    expect(acceptedNavigationOperator(matched, tuple)).toEqual({
      ...matched,
      tuple,
    });
  });
  test.each([
    { connected: false },
    { dead: true },
    { recoveryRequested: true },
    { operational: false },
    { occupantId: "different-body" },
    { lifecycle: "installed-dormant" },
    { seatInstanceRevision: "2" },
    { bindingInstanceRevision: "2" },
    { seatRevision: "0" },
    { visitId: "" },
    { acceptedX: Infinity },
    { acceptedY: 3.51 },
    { standingElevationM: 0 },
  ])("refuses stale/unavailable accepted rows %j", (change) => {
    const matched = registeredNavigationContext([registration], () => context)!;
    expect(
      acceptedNavigationOperator(matched, { ...tuple, ...change }),
    ).toBeNull();
  });
});
