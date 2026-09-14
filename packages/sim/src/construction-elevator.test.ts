import { expect, test } from "vitest";
import {
  cancelQueuedLiftCall,
  boardLift,
  createLiftState,
  disembarkLift,
  landingOpenAllowed,
  liftAttachmentPosition,
  queueLiftCall,
  stepLift,
  validateLiftDefinition,
  type LiftDefinition,
  type LiftFrame,
  type LiftState,
  type LiftAttachment,
} from "./construction-elevator";

/** Synthetic mechanics fixture only. These are NOT approved native dimensions,
 * motor power, load or brake ratings for any installed game asset. */
function fixture() {
  const d: LiftDefinition = {
    id: "lift",
    instanceId: "ship",
    revision: 1n,
    proofHash: "a".repeat(64),
    platformId: "platform",
    cabinDoorId: "car-door",
    powerPortId: "power-port",
    stops: [
      { id: "lower", deckId: "deck-a", doorId: "door-a", z: 0.1875 },
      { id: "upper", deckId: "deck-b", doorId: "door-b", z: 3.375 },
    ],
    envelope: { min: [0, 0, -0.1875], max: [2, 2, 2.5] },
    interior: { min: [0.1, 0.1, 0], max: [1.9, 1.9, 2.2] },
    capacityKg: 800,
    carMassKg: 500,
    maximumOccupants: 8,
    speedMps: 1,
    accelerationMps2: 0.8,
    brake: { decelerationMps2: 1.2, holdingKg: 1400 },
    workJPerKgMeter: 3,
    runningWatts: 10,
  };
  const closed = [d.cabinDoorId, ...d.stops.map((p) => p.doorId)].map((id) => ({
    id,
    fraction: 0,
    latched: true,
  }));
  const open = (stop: string) =>
    closed.map((p) =>
      p.id === d.cabinDoorId ||
      p.id === d.stops.find((s) => s.id === stop)!.doorId
        ? { ...p, fraction: 1, latched: false }
        : p,
    );
  const attachment: LiftAttachment = {
    id: "attachment-a",
    entityId: "character-a",
    kind: "character",
    sourceDeckId: "deck-a",
    sourceLocationRevision: 7n,
    loadRevision: 2n,
    massKg: 80,
    bounds: { min: [0.2, 0.2, 0], max: [0.8, 0.8, 1.8] },
    restrained: false,
  };
  let s = createLiftState(d, "lower");
  const call = () => {
    s = queueLiftCall(
      d,
      s,
      { id: "request-a", actorId: "character-a", stopId: "upper" },
      s.commandRevision,
      {
        gameAdmitted: true,
        reachableOrAttached: true,
        allowedStops: ["upper"],
      },
    );
  };
  const frame = (overrides: Partial<LiftFrame> = {}): LiftFrame => ({
    tick: s.tick + 1n,
    definitionRevision: d.revision,
    proofHash: d.proofHash,
    doors: closed,
    shaftObstacles: [],
    admittedStopIds: ["lower", "upper"],
    thresholdOccupied: false,
    allocation: {
      id: "allocation-" + (s.tick + 1n),
      elevatorId: d.id,
      portId: d.powerPortId,
      tick: s.tick + 1n,
      stateRevision: s.revision,
      joules: 10000,
    },
    ...overrides,
  });
  const advance = (overrides: Partial<LiftFrame> = {}) => {
    const r = stepLift(d, s, frame(overrides));
    s = r.state;
    return r;
  };
  const board = (a = attachment) => {
    s = boardLift(d, s, a, "lower", s.revision, open("lower"), {
      gameAdmitted: true,
      mayBoard: true,
      handlingReserved: true,
    });
  };
  return {
    d,
    closed,
    open,
    attachment,
    call,
    frame,
    advance,
    board,
    get state() {
      return s;
    },
    set state(v) {
      s = v;
    },
  };
}
test("requires explicit valid stop, geometry, load and brake contracts", () => {
  const f = fixture();
  validateLiftDefinition(f.d);
  for (const d of [
    { ...f.d, capacityKg: NaN },
    { ...f.d, stops: [f.d.stops[1], f.d.stops[0]] },
    { ...f.d, proofHash: "unqualified" },
    { ...f.d, brake: { decelerationMps2: 0, holdingKg: 100 } },
  ])
    expect(() => validateLiftDefinition(d)).toThrow();
});
test("multiple independent passengers and restrained cargo stay supported in platform frame", () => {
  const f = fixture();
  f.board();
  f.board({
    ...f.attachment,
    id: "cargo-attachment",
    entityId: "container-existing-id",
    kind: "cargo",
    massKg: 250,
    bounds: { min: [1, 0.2, 0], max: [1.8, 1.8, 1.5] },
    restrained: true,
  });
  f.call();
  let consumed = 0;
  for (let n = 0; n < 140; n++) {
    const r = f.advance();
    consumed += r.debit?.joules ?? 0;
    if (f.state.phase === "docked" && f.state.z === 3.375) break;
  }
  expect(f.state.phase).toBe("docked");
  expect(f.state.z).toBeCloseTo(3.375, 8);
  expect(f.state.velocity).toBe(0);
  expect(consumed).toBeGreaterThan(0);
  expect(f.state.attachments.map((p) => p.entityId)).toEqual([
    "character-a",
    "container-existing-id",
  ]);
  expect(f.state.attachments.every((p) => p.sourceDeckId === "deck-a")).toBe(
    true,
  );
  expect(liftAttachmentPosition(f.state, "attachment-a").min[2]).toBeCloseTo(
    3.375,
  );
  expect(landingOpenAllowed(f.d, f.state, "lower")).toBe(false);
  expect(landingOpenAllowed(f.d, f.state, "upper")).toBe(true);
});
test.each([
  "unlatched",
  "open-cabin",
  "open-remote",
  "missing-door",
  "threshold",
] as const)("motion blocked by actual %s interlock", (kind) => {
  const f = fixture();
  f.call();
  const doors = f.closed.map((p) => ({ ...p }));
  if (kind === "unlatched") doors[0].latched = false;
  if (kind === "open-cabin") doors[0].fraction = 0.001;
  if (kind === "open-remote") doors[2].fraction = 1;
  if (kind === "missing-door") doors.pop();
  const r = f.advance({ doors, thresholdOccupied: kind === "threshold" });
  expect(f.state.z).toBe(0.1875);
  expect(f.state.velocity).toBe(0);
  expect(r.debit).toBeNull();
});
test("absent or moving car never opens a shaft landing", () => {
  const f = fixture();
  expect(landingOpenAllowed(f.d, f.state, "upper")).toBe(false);
  f.call();
  f.advance();
  expect(landingOpenAllowed(f.d, f.state, "lower")).toBe(false);
});
test.each(["not-admitted", "no-reach", "no-stop", "stale-command"] as const)(
  "call rejects %s before mutation",
  (kind) => {
    const f = fixture(),
      before = f.state;
    expect(() =>
      queueLiftCall(
        f.d,
        f.state,
        { id: "q", actorId: "a", stopId: "upper" },
        kind === "stale-command" ? 0n : 1n,
        {
          gameAdmitted: kind !== "not-admitted",
          reachableOrAttached: kind !== "no-reach",
          allowedStops: kind === "no-stop" ? [] : ["upper"],
        },
      ),
    ).toThrow();
    expect(f.state).toBe(before);
  },
);
test("movement revisions do not invalidate an independent queued command revision", () => {
  const f = fixture();
  f.call();
  const command = f.state.commandRevision;
  f.advance();
  const next = queueLiftCall(
    f.d,
    f.state,
    { id: "return", actorId: "character-a", stopId: "lower" },
    command,
    { gameAdmitted: true, reachableOrAttached: true, allowedStops: ["lower"] },
  );
  expect(next.queue.map((p) => p.id)).toEqual(["request-a", "return"]);
});
test.each([
  "unrestrained",
  "overload",
  "overhead",
  "floor-gap",
  "overlap",
] as const)("rejects unsupported or unsafe %s boarding", (kind) => {
  const f = fixture();
  if (kind === "overlap") f.board();
  const a = {
    ...f.attachment,
    id: "second",
    entityId: "second",
    kind: "cargo" as const,
    restrained: kind !== "unrestrained",
    massKg: kind === "overload" ? 900 : 80,
    bounds: {
      min: [0.2, 0.2, kind === "floor-gap" ? 0.1 : 0] as const,
      max: [0.8, 0.8, kind === "overhead" ? 3 : 1.8] as const,
    },
  };
  expect(() => f.board(a)).toThrow();
});
test("power loss uses bounded passive deceleration and keeps all attachments; restart does not catch up", () => {
  const f = fixture();
  f.board();
  f.call();
  for (let n = 0; n < 15; n++) f.advance();
  const prior = f.state,
    first = f.advance({ allocation: null });
  expect(first.debit).toBeNull();
  expect(f.state.z).toBeGreaterThan(prior.z);
  expect(f.state.velocity).toBeLessThan(prior.velocity);
  expect(f.state.phase).toBe("braking");
  for (let n = 0; n < 30; n++) f.advance({ allocation: null });
  expect(f.state.phase).toBe("braked");
  expect(f.state.velocity).toBe(0);
  const z = f.state.z;
  const resumed = stepLift(
    f.d,
    f.state,
    f.frame({ tick: f.state.tick + 1000000n, allocation: null }),
  );
  expect(resumed.state.z).toBe(z);
  expect(resumed.state.attachments).toEqual(prior.attachments);
  expect(landingOpenAllowed(f.d, resumed.state, "lower")).toBe(false);
  expect(landingOpenAllowed(f.d, resumed.state, "upper")).toBe(false);
});
test("no approved passive brake never claims an unpowered supported hold", () => {
  const f = fixture();
  f.d.brake = null;
  f.call();
  const r = f.advance({ allocation: null });
  expect(r.state.phase).toBe("recovery-required");
  expect(r.debit).toBeNull();
  expect(landingOpenAllowed(f.d, f.state, "lower")).toBe(false);
});
test.each(["short", "wrong-port", "stale-tick", "wrong-revision"] as const)(
  "allocation %s cannot fund motion or be reused",
  (kind) => {
    const f = fixture();
    f.call();
    const a = f.frame().allocation!;
    if (kind === "short") a.joules = 0;
    if (kind === "wrong-port") a.portId = "unconnected";
    if (kind === "stale-tick") a.tick = 0n;
    if (kind === "wrong-revision") a.stateRevision = 0n;
    expect(f.advance({ allocation: a }).debit).toBeNull();
    expect(f.state.z).toBe(0.1875);
  },
);
test("destination permission loss brakes rather than opening an inaccessible landing", () => {
  const f = fixture();
  f.call();
  for (let n = 0; n < 12; n++) f.advance();
  for (let n = 0; n < 30; n++)
    expect(f.advance({ admittedStopIds: ["lower"] }).doorRequest).toBeNull();
  expect(f.state.phase).toBe("braked");
  expect(f.state.z).toBeLessThan(3.375);
});
test("continuous shaft sweep checks stopping envelope, not only candidate endpoint", () => {
  const f = fixture();
  f.call();
  const obstacle = {
    min: [0.2, 0.2, 2.75] as const,
    max: [1, 1, 2.8] as const,
  };
  for (let n = 0; n < 20; n++) f.advance({ shaftObstacles: [obstacle] });
  expect(f.state.z).toBeLessThan(0.25);
  expect(f.state.velocity).toBe(0);
  expect(f.state.phase).toBe("braked");
});
test("disembark commits a deck only at held alignment and actual open doors", () => {
  const f = fixture();
  f.board();
  f.call();
  for (let n = 0; (n < 160 && f.state.phase !== "docked") || n === 0; n++) {
    if (n >= 160) break;
    f.advance();
  }
  const authority = {
    gameAdmitted: true,
    mayExit: true,
    exitSupportReserved: true,
    destinationBounds: {
      min: [2.2, 0.2, 3.375] as const,
      max: [2.8, 0.8, 5.175] as const,
    },
  };
  expect(() =>
    disembarkLift(
      f.d,
      f.state,
      "attachment-a",
      "upper",
      f.state.revision,
      f.closed,
      authority,
    ),
  ).toThrow();
  const result = disembarkLift(
    f.d,
    f.state,
    "attachment-a",
    "upper",
    f.state.revision,
    f.open("upper"),
    authority,
  );
  expect(result.exit).toMatchObject({
    entityId: "character-a",
    deckId: "deck-b",
    expectedLocationRevision: 7n,
    expectedLoadRevision: 2n,
  });
  expect(result.state.attachments).toEqual([]);
});
test("old ticks return the exact state and no duplicate allocation debit", () => {
  const f = fixture();
  f.call();
  const frame = f.frame(),
    r = f.advance(frame);
  const duplicate = stepLift(f.d, r.state, frame);
  expect(duplicate.state).toBe(r.state);
  expect(duplicate.debit).toBeNull();
});

test("restored accounted power resumes a braked loaded cabin without replacing attachments", () => {
  const f = fixture();
  f.board();
  f.call();
  for (let n = 0; n < 12; n++) f.advance();
  for (let n = 0; n < 30; n++) f.advance({ allocation: null });
  expect(f.state.phase).toBe("braked");
  const occupants = f.state.attachments;
  for (let n = 0; n < 180; n++) {
    f.advance();
    if (f.state.phase === "docked") break;
  }
  expect(f.state.z).toBeCloseTo(3.375);
  expect(f.state.velocity).toBe(0);
  expect(f.state.attachments).toEqual(occupants);
});

test("boarding rejects duplicate or missing accepted door states", () => {
  const f = fixture();
  const a = { gameAdmitted: true, mayBoard: true, handlingReserved: true };
  const doors = f.open("lower");
  expect(() =>
    boardLift(
      f.d,
      f.state,
      f.attachment,
      "lower",
      f.state.revision,
      [doors[0], doors[0], doors[1]],
      a,
    ),
  ).toThrow();
});

test("queued cancellation uses caller and command revision without deleting an active destination", () => {
  const f = fixture();
  f.call();
  f.advance();
  const auth = { actorId: "character-a", gameAdmitted: true, mayCancel: true };
  expect(() =>
    cancelQueuedLiftCall(
      f.d,
      f.state,
      "request-a",
      f.state.commandRevision,
      auth,
    ),
  ).toThrow();
  f.state = queueLiftCall(
    f.d,
    f.state,
    { id: "return", actorId: "character-a", stopId: "lower" },
    f.state.commandRevision,
    { gameAdmitted: true, reachableOrAttached: true, allowedStops: ["lower"] },
  );
  expect(() =>
    cancelQueuedLiftCall(f.d, f.state, "return", f.state.commandRevision, {
      ...auth,
      actorId: "other",
    }),
  ).toThrow();
  const next = cancelQueuedLiftCall(
    f.d,
    f.state,
    "return",
    f.state.commandRevision,
    auth,
  );
  expect(next.queue.map((p) => p.id)).toEqual(["request-a"]);
  expect(next.targetId).toBe("upper");
});

test("an unused stationary lift does not manufacture clock/state writes", () => {
  const f = fixture();
  const prior = f.state;
  expect(f.advance().state).toBe(prior);
});
