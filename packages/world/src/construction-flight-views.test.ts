import { expect, test, vi } from "vitest";
import { Identity } from "spacetimedb";
vi.mock("spacetimedb/server", () => ({
  t: {
    row: (name: string, fields: unknown) => ({ name, fields }),
    string: () => ({ primaryKey: () => ({ primaryKey: true }) }),
    u64: () => ({}),
    bool: () => ({}),
  },
}));
import {
  ownAuthoredFlights,
  ownAuthoredFlightFittings,
  hasAcceptedAuthoredFlight,
  authoredFlightProjection,
  authoredFlightFittingProjection,
  type FlightViewContext,
} from "./construction-flight-views";
function fixture() {
  const owner = Identity.fromString("1".repeat(64)),
    foreign = Identity.fromString("2".repeat(64));
  const a = { id: "actor", owner, connected: true, shipId: "ship" };
  const binding = {
    shipId: "ship",
    instanceId: "ship",
    owner,
    deckId: "deck",
    stationId: "station",
    instanceRevision: 1n,
    revision: 2n,
    blueprintSha256: "source",
    definitionId: "definition",
    definitionSha256: "hash",
    lifecycle: "active",
  };
  const bindings = [binding];
  let review: any = {
    owner,
    visitId: "visit",
    instanceId: "ship",
    deckId: "deck",
    reviewAdmissionRevision: 8n,
  };
  let seat: any;
  const visit = {
      visitId: "visit",
      revision: 2n,
      instanceId: "ship",
      deckId: "deck",
    },
    admission = { owner, shipId: "ship", revision: 8n },
    instance = { id: "ship", owner, revision: 1n };
  const rows = Array.from({ length: 10 }, (_, i) => ({
    id: `device${i}`,
    shipId: "ship",
    placedObjectId: `part${i}`,
    sourceDeviceId: `source${i}`,
    kind: i ? "actuator" : "computer",
    installed: true,
    powered: true,
    availability: 1,
    revision: 1n,
    definitionId: "definition",
  }));
  const actors = [a];
  const ctx: FlightViewContext = {
    sender: owner,
    db: {
      character: { by_owner: { filter: () => actors } },
      constructionFlightBinding: {
        shipId: { find: (id) => bindings.find((b) => b.shipId === id) },
        by_owner: { filter: () => bindings },
      },
      constructionFlightFitting: { by_ship: { filter: () => rows } },
      constructionLocation: { characterId: { find: () => visit } },
      constructionFlightReview: { characterId: { find: () => review } },
      worldAdmission: { characterId: { find: () => admission } },
      constructionInstance: { id: { find: () => instance } },
      station: {
        id: {
          find: () => ({
            id: "station",
            shipId: "ship",
            operational: true,
            occupantId: seat ? "actor" : "foreign-private",
          }),
        },
      },
      constructionPilotSeat: { characterId: { find: () => seat } },
    },
  };
  return {
    ctx,
    a,
    actors,
    binding,
    bindings,
    rows,
    visit,
    admission,
    instance,
    foreign,
    setReview: (v: any) => (review = v),
    setSeat: (v: any) => (seat = v),
  };
}
test("keyed minimal status distinguishes active installation from explicit accepted flight", () => {
  const f = fixture();
  expect((authoredFlightProjection as any).fields.shipId.primaryKey).toBe(true);
  expect((authoredFlightFittingProjection as any).fields.id.primaryKey).toBe(
    true,
  );
  const row = ownAuthoredFlights(f.ctx)[0];
  expect(row).toMatchObject({
    active: true,
    flightAdmitted: true,
    stationRevision: 2n,
    visitId: "visit",
    visitRevision: 2n,
    admissionRevision: 8n,
    seatState: "none",
  });
  expect(Object.keys(row).sort()).toEqual(
    [
      "shipId",
      "stationId",
      "stationRevision",
      "deckId",
      "lifecycle",
      "revision",
      "active",
      "flightAdmitted",
      "visitId",
      "visitRevision",
      "admissionRevision",
      "seatState",
      "seatRevision",
    ].sort(),
  );
  f.setReview(undefined);
  expect(ownAuthoredFlights(f.ctx)[0]).toMatchObject({
    active: true,
    flightAdmitted: false,
  });
  expect(ownAuthoredFlightFittings(f.ctx)).toEqual([]);
});
test("accepted membership requires current own visit, deck, instance and admission; ambiguous/disconnected account denies", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => (f.visit.visitId = "stale"),
    (f: ReturnType<typeof fixture>) => (f.visit.deckId = "other"),
    (f: ReturnType<typeof fixture>) => f.admission.revision++,
    (f: ReturnType<typeof fixture>) => f.instance.revision++,
    (f: ReturnType<typeof fixture>) => (f.instance.owner = f.foreign),
    (f: ReturnType<typeof fixture>) => (f.admission.owner = f.foreign),
  ]) {
    const f = fixture();
    change(f);
    expect(hasAcceptedAuthoredFlight(f.ctx, f.a)).toBe(false);
    expect(ownAuthoredFlightFittings(f.ctx)).toEqual([]);
  }
  const f = fixture();
  f.a.connected = false;
  expect(ownAuthoredFlights(f.ctx)).toEqual([]);
  f.a.connected = true;
  f.actors.push({ ...f.a, id: "second" });
  expect(ownAuthoredFlights(f.ctx)).toEqual([]);
});
test("only own safe seat recovery scalar is exposed; pending survives loss of operational state", () => {
  const f = fixture();
  f.setSeat({
    owner: f.ctx.sender,
    stationId: "station",
    shipId: "ship",
    deckId: "deck",
    revision: 4n,
    recoveryRequested: true,
    recoveryReason: "private-debug-payload",
  });
  f.binding.lifecycle = "installed-dormant";
  expect(ownAuthoredFlights(f.ctx)[0]).toMatchObject({
    active: false,
    flightAdmitted: true,
    seatState: "recovery-pending",
    seatRevision: 4n,
  });
  expect(Object.values(ownAuthoredFlights(f.ctx)[0])).not.toContain(
    "private-debug-payload",
  );
  f.setSeat({
    owner: f.foreign,
    stationId: "station",
    shipId: "ship",
    revision: 5n,
  });
  expect(ownAuthoredFlights(f.ctx)[0].seatState).toBe("none");
});
test("exact ten current instance mappings preserve fresh IDs and source effect mounts without operational or private fields", () => {
  const f = fixture();
  const rows = ownAuthoredFlightFittings(f.ctx);
  expect(rows).toHaveLength(10);
  expect(rows[1]).toEqual({
    id: "device1",
    shipId: "ship",
    placedObjectId: "part1",
    sourceDeviceId: "source1",
    kind: "actuator",
  });
  f.rows[0].sourceDeviceId = f.rows[1].sourceDeviceId;
  expect(ownAuthoredFlightFittings(f.ctx)).toEqual([]);
  f.rows[0].sourceDeviceId = "source0";
  f.rows.push({ ...f.rows[0], id: "extra" });
  expect(ownAuthoredFlightFittings(f.ctx)).toEqual([]);
});
test("owner index results are checked and bounded; no foreign flight or unbounded mappings", () => {
  const f = fixture();
  f.bindings.push({ ...f.binding, shipId: "foreignship", owner: f.foreign });
  expect(ownAuthoredFlights(f.ctx)).toHaveLength(1);
  for (let i = 0; i < 64; i++)
    f.bindings.push({ ...f.binding, shipId: `ship${i}` });
  expect(ownAuthoredFlights(f.ctx)).toEqual([]);
});
