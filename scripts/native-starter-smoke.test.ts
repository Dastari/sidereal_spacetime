import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { DbConnection } from "../packages/net/src/generated";

const probe = vi.hoisted(() => ({
  afterFirstRead: () => {},
  firstReady: false,
}));
vi.mock("./traversal-smoke", () => ({
  traversalWait: async (ready: () => boolean) => {
    probe.firstReady = ready();
    if (probe.firstReady) return;
    probe.afterFirstRead();
    if (!ready()) throw Error("READINESS_NOT_OBSERVED");
  },
}));
import { acquireNativePilot } from "./native-starter-smoke";

function fixture() {
  const flight = {
    shipId: "private-fixture-ship",
    stationId: "private-fixture-station",
    stationRevision: 4n,
    active: true,
    flightAdmitted: true,
    seatState: "none",
  };
  const power = { tick: 100n, corePowered: true };
  const physics = { status: "ready" };
  const enter = vi.fn(async () => {
    flight.seatState = "seated";
  });
  const connection = {
    db: {
      ownCharacters: { iter: () => [{ shipId: flight.shipId }] },
      ownAuthoredFlights: { iter: () => [flight] },
      ownShipPower: { shipId: { find: () => power } },
      ownAuthoredFlightPhysics: { shipId: { find: () => physics } },
    },
    reducers: { enterAuthoredPilot: enter },
  } as unknown as DbConnection;
  return { flight, power, physics, enter, connection };
}

beforeEach(() => {
  probe.afterFirstRead = () => {};
  probe.firstReady = false;
});
afterEach(() => vi.restoreAllMocks());

test("new server-filtered powered tick dispatches once despite tick-floor wallclock age", async () => {
  const f = fixture();
  // Reproduce a 75ms local age at the next tick floor, with only 26ms actual
  // solve age. The former client <=50ms check prevented any entry dispatch.
  vi.spyOn(Date, "now").mockReturnValue(101 * 50 + 75);
  probe.afterFirstRead = () => {
    expect(probe.firstReady).toBe(false);
    f.power.tick++;
  };
  await acquireNativePilot(f.connection);
  expect(f.enter).toHaveBeenCalledTimes(1);
  expect(f.enter).toHaveBeenCalledWith({
    stationId: f.flight.stationId,
    expectedStationRevision: 4n,
    operationId: expect.any(String),
  });
});

test("cached powered state cannot dispatch and timeout diagnostics omit private IDs", async () => {
  const f = fixture();
  const diagnostic = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(acquireNativePilot(f.connection)).rejects.toThrow(
    "READINESS_NOT_OBSERVED",
  );
  expect(f.enter).not.toHaveBeenCalled();
  const printed = JSON.stringify(diagnostic.mock.calls);
  expect(printed).not.toContain(f.flight.shipId);
  expect(printed).not.toContain(f.flight.stationId);
  expect(printed).toContain("newPoweredTickObserved");
});

test.each(["inactive", "unadmitted", "unpowered", "uncompiled"])(
  "%s current ship cannot dispatch on a newer tick",
  async (state) => {
    const f = fixture();
    vi.spyOn(console, "error").mockImplementation(() => {});
    if (state === "inactive") f.flight.active = false;
    if (state === "unadmitted") f.flight.flightAdmitted = false;
    if (state === "unpowered") f.power.corePowered = false;
    if (state === "uncompiled") f.physics.status = "pending";
    probe.afterFirstRead = () => f.power.tick++;
    await expect(acquireNativePilot(f.connection)).rejects.toThrow(
      "READINESS_NOT_OBSERVED",
    );
    expect(f.enter).not.toHaveBeenCalled();
  },
);

test("exact server station rejection propagates without retry or movement mutation", async () => {
  const f = fixture();
  probe.afterFirstRead = () => f.power.tick++;
  const denial = Error("STATION_AUTHORITY_DENIED");
  f.enter.mockRejectedValue(denial);
  await expect(acquireNativePilot(f.connection)).rejects.toBe(denial);
  expect(f.enter).toHaveBeenCalledTimes(1);
  expect(f.flight.seatState).toBe("none");
});
