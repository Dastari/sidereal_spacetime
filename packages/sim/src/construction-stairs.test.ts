import { expect, test } from "vitest";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type {
  NativeStairAudit,
  StairInstallation,
} from "@sidereal/content/construction-stairs";
import {
  createNativeStairCompiler,
  createPublishedNativeStairCompiler,
  beginStairWalk,
  stepStairWalk,
  type StairWalkState,
  type StairWalkAuthority,
} from "@sidereal/sim/construction-stairs";
const bytes = (v: string) => new TextEncoder().encode(v),
  hash = (v: Uint8Array) => bytesToHex(sha256(v));
const source = bytes(
  "synthetic-stair-unit-source; not a published native fixture",
);
function audit(): NativeStairAudit {
  return {
    schema: "sidereal.native-stair-audit.v1",
    adapterId: "synthetic-stair-test",
    revision: "unit-only",
    qualification: {
      nativeMeshMatch: true,
      physicalApertures: true,
      fullBodyStepSweeps: true,
      supportedStops: true,
      guardedLandings: true,
    },
    body: { radiusM: 0.3, heightM: 1.8 },
    decks: {
      lower: { originZ: 0, walkingZ: 0.1875 },
      upper: { originZ: 0.375, walkingZ: 0.5625 },
    },
    parts: [
      {
        id: "native-solids",
        sourceId: "test",
        nodePrefix: "test-solid",
        originM: [0, 0, 0],
        quarterTurns: 0,
      },
    ],
    apertures: [
      {
        id: "roof-hole",
        role: "lower-roof",
        boundsM: { min: [0, 0, 0.275], max: [2, 2, 0.375] },
      },
      {
        id: "floor-hole",
        role: "upper-floor",
        boundsM: { min: [0, 0, 0.375], max: [2, 2, 0.5625] },
      },
    ],
    supports: [
      {
        id: "lower",
        partId: "native-solids",
        boundsM: { min: [0, -2], max: [2, 0] },
        topZM: 0.1875,
        kind: "lower-landing",
        neighbours: ["tread"],
      },
      {
        id: "tread",
        partId: "native-solids",
        boundsM: { min: [0, 0], max: [2, 0.3125] },
        topZM: 0.375,
        kind: "tread",
        neighbours: ["lower", "upper"],
      },
      {
        id: "upper",
        partId: "native-solids",
        boundsM: { min: [0, 0.3125], max: [2, 2] },
        topZM: 0.5625,
        kind: "upper-landing",
        neighbours: ["tread"],
      },
    ],
    solids: [
      {
        id: "lower-slab",
        partId: "native-solids",
        boundsM: { min: [0, -2, 0], max: [2, 0, 0.1875] },
      },
      {
        id: "tread-solid",
        partId: "native-solids",
        boundsM: { min: [0, 0, 0], max: [2, 0.3125, 0.375] },
      },
      {
        id: "upper-slab",
        partId: "native-solids",
        boundsM: { min: [0, 0.3125, 0], max: [2, 2, 0.5625] },
      },
      {
        id: "left-guard",
        partId: "native-solids",
        boundsM: { min: [-0.1, -2, 0], max: [0, 2, 1.6] },
      },
      {
        id: "right-guard",
        partId: "native-solids",
        boundsM: { min: [2, -2, 0], max: [2.1, 2, 1.6] },
      },
    ],
    steps: [
      {
        id: "first",
        fromSupportId: "lower",
        toSupportId: "tread",
        fromBoundsM: { min: [0.6, -0.3025], max: [1.4, -0.2875] },
        advanceM: [0, 0.3125],
        clearanceZM: 0.375,
      },
      {
        id: "second",
        fromSupportId: "tread",
        toSupportId: "upper",
        fromBoundsM: { min: [0.6, 0.01], max: [1.4, 0.025] },
        advanceM: [0, 0.3125],
        clearanceZM: 0.5625,
      },
    ],
    limits: { maxRiseM: 0.2, maxDropM: 0.2, maxAdvanceM: 0.4, maxLiftM: 0.25 },
  };
}
function publication(a = audit()) {
  const data = bytes(JSON.stringify(a));
  return {
    audit: data,
    delivery: {
      adapterId: a.adapterId,
      revision: a.revision,
      status: "native-geometry-qualified" as const,
      auditSha256: hash(data),
      sources: { test: { sha256: hash(source) } },
    },
    sources: { test: source },
  };
}
function installed(a = audit()): StairInstallation {
  return {
    instanceId: "instance",
    stairId: "stairs",
    instanceRevision: 1n,
    stairRevision: 1n,
    originM: [0, 0, 0],
    quarterTurns: 0,
    lowerDeckId: "lower-deck",
    upperDeckId: "upper-deck",
    parts: a.parts.map((p) => ({
      ...p,
      id: "placed-" + p.id,
      sourcePartId: p.id,
      sha256: hash(source),
    })),
    apertures: a.apertures.map((p) => ({
      ...p,
      id: "placed-" + p.id,
      sourceApertureId: p.id,
      state: "physical-opening",
    })),
    supports: a.supports.map((s) => ({
      id: "placed-" + s.id,
      sourceSupportId: s.id,
    })),
    policy: { id: "unit-walk", walkMps: 1, verticalMps: 2 },
  };
}
function fixture() {
  const surface = createNativeStairCompiler(publication())(installed());
  const begin = beginStairWalk(
    surface,
    {
      walkId: "walk",
      actorId: "actor",
      instanceId: "instance",
      visitId: "visit",
      deckId: "lower-deck",
      positionM: [1, -0.8, 0.1875],
      inputSequence: 0n,
      admitted: true,
      connected: true,
      standing: true,
    },
    0n,
  );
  let state = begin.state,
    t = 0n;
  const advance = (dx = 0, dy = 1, patch: Partial<StairWalkAuthority> = {}) => {
    t++;
    const now = t * 50000n;
    const result = stepStairWalk(surface, state, { sequence: t, dx, dy }, t, {
      actorPresent: true,
      admitted: true,
      connected: true,
      mayWalk: true,
      instanceRevision: 1n,
      stairRevision: 1n,
      nowMicros: now,
      receivedMicros: now,
      reservation: begin.reservation,
      occupied: [],
      ...patch,
    });
    state = result.state;
    return result;
  };
  return {
    surface,
    begin,
    advance,
    get state() {
      return state;
    },
  };
}

test("full capsule rear-strip steps compile, but headroom-only and altered native evidence reject", () => {
  const p = publication();
  expect(createNativeStairCompiler(p)(installed()).steps).toHaveLength(2);
  expect(() =>
    createNativeStairCompiler({ ...p, sources: { test: bytes("changed") } }),
  ).toThrow(/source hash/);
  expect(() =>
    createPublishedNativeStairCompiler({
      ...p,
      delivery: { ...p.delivery, status: "staged" },
    }),
  ).toThrow(/qualified/);
  const a = audit();
  a.qualification.supportedStops = false;
  expect(() => createNativeStairCompiler(publication(a))).toThrow(
    /supported-step/,
  );
  const i = installed();
  i.parts[0].originM[0] = 1;
  expect(() => createNativeStairCompiler(p)(i)).toThrow(/transform/);
  i.parts[0].originM[0] = 0;
  i.apertures[0].state = "covered";
  expect(() => createNativeStairCompiler(p)(i)).toThrow(/aperture/);
});
test("tread-centre standing, absent support, rise bounds and hidden sweep obstructions reject", () => {
  const center = audit();
  center.steps[1].fromBoundsM = { min: [0.6, 0.15], max: [1.4, 0.16] };
  expect(() => createNativeStairCompiler(publication(center))).toThrow(
    /full-body/,
  );
  const missing = audit();
  missing.solids = missing.solids.filter((s) => s.id !== "tread-solid");
  expect(() => createNativeStairCompiler(publication(missing))).toThrow(
    /backing/,
  );
  const high = audit();
  high.limits.maxRiseM = 0.1;
  expect(() => createNativeStairCompiler(publication(high))).toThrow(/bound/);
  const overhead = audit();
  overhead.solids.push({
    id: "beam",
    partId: "native-solids",
    boundsM: { min: [0.9, -0.2, 1.98], max: [1.1, -0.19, 2.05] },
  });
  expect(() => createNativeStairCompiler(publication(overhead))).toThrow(
    /full-body/,
  );
});
test("ordinary planar input climbs both risers and commits the destination only on fully supported exit", () => {
  const f = fixture();
  let exit: null | { deckId: string; positionM: number[] } = null;
  let raised = false;
  for (let n = 0; n < 100 && !exit; n++) {
    const result = f.advance();
    if (f.state.pending) {
      raised ||= f.state.positionM[2] > 0.1875;
      expect(f.state.sourceDeckId).toBe("lower-deck");
      expect(result.releaseReservation).toBe(false);
    }
    exit = result.exit;
  }
  expect(raised).toBe(true);
  expect(exit?.deckId).toBe("upper-deck");
  expect(exit?.positionM[2]).toBe(0.5625);
  expect(f.state.phase).toBe("exited");
});
test("standing stops on a narrow tread and allows lateral walking then reverse descent", () => {
  const f = fixture();
  for (let n = 0; n < 80; n++) {
    f.advance();
    if (f.state.supportId === "placed-tread" && !f.state.pending) break;
  }
  expect(f.state.supportId).toBe("placed-tread");
  const supported = [...f.state.positionM];
  f.advance(0, 0);
  expect(f.state.positionM).toEqual(supported);
  expect(f.state.pending).toBeNull();
  f.advance(1, 0);
  expect(f.state.positionM[0]).toBeGreaterThan(supported[0]);
  expect(f.state.positionM[2]).toBe(0.375);
  let exit = null;
  for (let n = 0; n < 80 && !exit; n++) exit = f.advance(0, -1).exit;
  expect(exit?.deckId).toBe("lower-deck");
  expect(exit?.positionM[2]).toBe(0.1875);
});
test("stop and disconnect during one riser return continuously to actual prior contact", () => {
  for (const disconnected of [false, true]) {
    const f = fixture();
    for (let n = 0; n < 30; n++) {
      f.advance();
      if (f.state.pending && f.state.pending.distanceM > 0.22) break;
    }
    const launch = [...f.state.pending!.launchM],
      initial = [...f.state.positionM];
    expect(initial).not.toEqual(launch);
    let prior = initial;
    for (let n = 0; n < 30 && f.state.pending; n++) {
      f.advance(0, disconnected ? 1 : 0, { connected: !disconnected });
      expect(
        Math.hypot(...f.state.positionM.map((v, i) => v - prior[i])),
      ).toBeLessThanOrEqual(0.1000001);
      prior = [...f.state.positionM];
    }
    expect(f.state.pending).toBeNull();
    expect(f.state.positionM).toEqual(launch);
    expect(f.state.positionM[2]).toBe(0.1875);
  }
});
test("a dynamic obstruction blocks unfinished-step return without teleport or releasing support reservation", () => {
  const f = fixture();
  for (let n = 0; n < 30; n++) {
    f.advance();
    if (f.state.pending && f.state.pending.distanceM > 0.3) break;
  }
  const before = [...f.state.positionM];
  const obstruction = {
    min: [0.95, before[1] - 0.4, 0.2] as [number, number, number],
    max: [1.05, before[1] - 0.15, 1.7] as [number, number, number],
  };
  const result = f.advance(0, 0, { occupied: [obstruction] });
  expect(result.state.phase).toBe("blocked");
  expect(result.state.positionM).toEqual(before);
  expect(result.state.pending).not.toBeNull();
  expect(result.releaseReservation).toBe(false);
  for (let n = 0; n < 30 && f.state.pending; n++) f.advance(0, 0);
  expect(f.state.pending).toBeNull();
  expect(f.state.positionM[2]).toBe(0.1875);
});
test("replayed ticks cannot move, stale packets cannot overwrite newer intent, and replay cannot refresh intent expiry", () => {
  const f = fixture(),
    first = f.advance(1, 0),
    now = 50000n;
  const a: StairWalkAuthority = {
    actorPresent: true,
    admitted: true,
    connected: true,
    mayWalk: true,
    instanceRevision: 1n,
    stairRevision: 1n,
    nowMicros: now,
    receivedMicros: now,
    reservation: f.begin.reservation,
    occupied: [],
  };
  expect(
    stepStairWalk(f.surface, first.state, { sequence: 1n, dx: 1, dy: 0 }, 1n, a)
      .state,
  ).toBe(first.state);
  const older = stepStairWalk(
    f.surface,
    first.state,
    { sequence: 0n, dx: -1, dy: 0 },
    2n,
    { ...a, nowMicros: 100000n, receivedMicros: 0n },
  );
  expect(older.state.positionM[0]).toBeGreaterThan(first.state.positionM[0]);
  expect(() =>
    stepStairWalk(f.surface, first.state, { sequence: 1n, dx: -1, dy: 0 }, 2n, {
      ...a,
      nowMicros: 100000n,
    }),
  ).toThrow(/sequence reused/);
  expect(() =>
    stepStairWalk(f.surface, first.state, { sequence: 1n, dx: 1, dy: 0 }, 2n, {
      ...a,
      nowMicros: 100000n,
      receivedMicros: 100000n,
    }),
  ).toThrow(/sequence reused/);
  const expired = stepStairWalk(
    f.surface,
    first.state,
    { sequence: 1n, dx: 1, dy: 0 },
    1000n,
    { ...a, nowMicros: 50000000n },
  );
  expect(expired.state.positionM).toEqual(first.state.positionM);
});
test("installed revisions/reservations and state placement are checked before movement", () => {
  const f = fixture();
  const changed = f.advance(0, 1, { instanceRevision: 2n });
  expect(changed.state.phase).toBe("blocked");
  expect(changed.state.positionM).toEqual(f.begin.state.positionM);
  expect(f.advance(0, 1, { reservation: null }).state.phase).toBe("blocked");
  expect(() =>
    beginStairWalk(
      { ...f.surface },
      {
        walkId: "walk",
        actorId: "a",
        instanceId: "instance",
        visitId: "v",
        deckId: "upper-deck",
        positionM: [1, 1, 0.5625],
        inputSequence: 0n,
        admitted: true,
        connected: true,
        standing: true,
      },
      0n,
    ),
  ).toThrow(/server-compiled/);
  expect(() =>
    beginStairWalk(
      f.surface,
      {
        walkId: "walk",
        actorId: "a",
        instanceId: "instance",
        visitId: "v",
        deckId: "upper-deck",
        positionM: [1, -1, 0.1875],
        inputSequence: 0n,
        admitted: true,
        connected: true,
        standing: true,
      },
      0n,
    ),
  ).toThrow(/landing/);
});

test("another walk, actor, visit or fixture reservation cannot authorize stair motion", () => {
  for (const key of [
    "walkId",
    "actorId",
    "visitId",
    "instanceId",
    "stairId",
    "proofHash",
  ] as const) {
    const f = fixture();
    const result = f.advance(0, 1, {
      reservation: { ...f.begin.reservation, [key]: "other" },
    });
    expect(result.state.phase).toBe("blocked");
    expect(result.state.positionM).toEqual(f.begin.state.positionM);
    expect(result.state.inputSequence).toBe(0n);
    expect(result.releaseReservation).toBe(false);
  }
});

test("loss of admission, connection or walk permission cannot move a supported stance", () => {
  for (const key of ["admitted", "connected", "mayWalk"] as const) {
    const f = fixture();
    for (let n = 0; n < 80; n++) {
      f.advance();
      if (f.state.supportId === "placed-tread" && !f.state.pending) break;
    }
    expect(f.state.supportId).toBe("placed-tread");
    const before = [...f.state.positionM];
    for (let n = 0; n < 10; n++) {
      const result = f.advance(0, 1, { [key]: false });
      expect(result.state.positionM).toEqual(before);
      expect(result.state.pending).toBeNull();
      expect(result.releaseReservation).toBe(false);
    }
  }
});

test("quarter-turned translated stairs retain support heights and move under rotated ordinary intent", () => {
  const i = installed();
  i.originM = [8, -3, 2];
  i.quarterTurns = 1;
  i.parts = i.parts.map((p) => ({
    ...p,
    originM: [8 - p.originM[1], -3 + p.originM[0], 2 + p.originM[2]],
    quarterTurns: 1,
  }));
  i.apertures = i.apertures.map((p) => ({
    ...p,
    boundsM: {
      min: [8 - p.boundsM.max[1], -3 + p.boundsM.min[0], 2 + p.boundsM.min[2]],
      max: [8 - p.boundsM.min[1], -3 + p.boundsM.max[0], 2 + p.boundsM.max[2]],
    },
  }));
  const surface = createNativeStairCompiler(publication())(i),
    begin = beginStairWalk(
      surface,
      {
        walkId: "walk",
        actorId: "actor",
        instanceId: i.instanceId,
        visitId: "visit",
        deckId: i.lowerDeckId,
        positionM: [8.8, -2, 2.1875],
        inputSequence: 0n,
        admitted: true,
        connected: true,
        standing: true,
      },
      0n,
    );
  let state = begin.state,
    exit = null;
  for (let n = 1; n < 100 && !exit; n++) {
    const tick = BigInt(n),
      now = tick * 50000n;
    const r = stepStairWalk(
      surface,
      state,
      { sequence: tick, dx: -1, dy: 0 },
      tick,
      {
        actorPresent: true,
        admitted: true,
        connected: true,
        mayWalk: true,
        instanceRevision: 1n,
        stairRevision: 1n,
        nowMicros: now,
        receivedMicros: now,
        reservation: begin.reservation,
        occupied: [],
      },
    );
    state = r.state;
    exit = r.exit;
  }
  expect(exit?.deckId).toBe(i.upperDeckId);
  expect(exit?.positionM[0]).toBeLessThan(8);
  expect(exit?.positionM[1]).toBeCloseTo(-2, 12);
  expect(exit?.positionM[2]).toBe(2.5625);
});

test("actual native a003 dogleg traverses all17 risers, both flights and lateral intermediate landing", async () => {
  const { readFileSync } = await import("node:fs");
  const root =
    "assets/art-library/designs/shipyard.structure.stair-dogleg/revisions/r000/a003/";
  const delivery = JSON.parse(readFileSync(root + "delivery.json", "utf8")),
    data = readFileSync(root + "stair-audit.json"),
    a = JSON.parse(data.toString()) as NativeStairAudit;
  expect(hash(data)).toBe(
    "8df56649474fa8379af3a2c678716fc1f80406e9f9457e85498598f6a0be9831",
  );
  expect(delivery.runtimePublication).toBe(false);
  expect(delivery.ownerFinalSignoff).toBeNull();
  const sources = Object.fromEntries(
    Object.entries(delivery.sources).map(([id, p]) => [
      id,
      readFileSync((p as { path: string }).path),
    ]),
  );
  const i: StairInstallation = {
    instanceId: "native-instance",
    stairId: "native-stairs",
    instanceRevision: 1n,
    stairRevision: 1n,
    originM: [0, 0, 0],
    quarterTurns: 0,
    lowerDeckId: "lower-deck",
    upperDeckId: "upper-deck",
    parts: a.parts.map((p) => ({
      ...p,
      id: "placed-" + p.id,
      sourcePartId: p.id,
      sha256: delivery.sources[p.sourceId].sha256,
    })),
    apertures: a.apertures.map((p) => ({
      ...p,
      id: "placed-" + p.id,
      sourceApertureId: p.id,
      state: "physical-opening",
    })),
    supports: a.supports.map((p) => ({
      id: "placed-" + p.id,
      sourceSupportId: p.id,
    })),
    policy: { id: "native-unit-walk", walkMps: 1, verticalMps: 2 },
  };
  const surface = createNativeStairCompiler({ delivery, audit: data, sources })(
    i,
  );
  expect(surface.steps).toHaveLength(17);
  expect(surface.supports).toHaveLength(18);
  expect(surface.solids).toHaveLength(259);
  expect(
    createPublishedNativeStairCompiler({ delivery, audit: data })(i).proofHash,
  ).toBe(surface.proofHash);
  const begin = beginStairWalk(
    surface,
    {
      walkId: "walk",
      actorId: "actor",
      instanceId: i.instanceId,
      visitId: "native-visit",
      deckId: i.lowerDeckId,
      positionM: [3, 2.75, 0.1875],
      inputSequence: 0n,
      admitted: true,
      connected: true,
      standing: true,
    },
    0n,
  );
  let state = begin.state,
    tick = 0n,
    exit: null | { deckId: string; positionM: [number, number, number] } = null;
  let held = begin.reservation;
  const seen = new Set<string>();
  const move = (dx: number, dy: number) => {
    tick++;
    const now = tick * 50000n;
    const r = stepStairWalk(surface, state, { sequence: tick, dx, dy }, tick, {
      actorPresent: true,
      admitted: true,
      connected: true,
      mayWalk: true,
      instanceRevision: 1n,
      stairRevision: 1n,
      nowMicros: now,
      receivedMicros: now,
      reservation: held,
      occupied: [],
    });
    state = r.state;
    exit = r.exit;
    seen.add(state.supportId);
  };
  for (let n = 0; n < 400 && state.supportId !== "placed-midlanding"; n++)
    move(0, 1);
  expect(state.supportId).toBe("placed-midlanding");
  expect(state.positionM[2]).toBe(1.875);
  for (let n = 0; n < 40 && state.positionM[1] < 7; n++) move(0, 1);
  for (let n = 0; n < 50 && state.positionM[0] < 5 - EPSILON; n++) move(1, 0);
  expect(state.positionM[0]).toBeCloseTo(5, 9);
  for (let n = 0; n < 400 && !exit; n++) move(0, -1);
  expect(exit).not.toBeNull();
  expect((exit as unknown as { deckId: string }).deckId).toBe("upper-deck");
  expect(state.positionM[2]).toBe(3.375);
  expect([...seen].filter((id) => id.includes("tread"))).toHaveLength(15);
  const down = beginStairWalk(
    surface,
    {
      walkId: "walk-down",
      actorId: "actor",
      instanceId: i.instanceId,
      visitId: "native-visit",
      deckId: i.upperDeckId,
      positionM: [...state.positionM],
      inputSequence: tick,
      admitted: true,
      connected: true,
      standing: true,
    },
    tick,
  );
  state = down.state;
  held = down.reservation;
  exit = null;
  seen.clear();
  for (let n = 0; n < 400 && state.supportId !== "placed-midlanding"; n++)
    move(0, 1);
  expect(state.supportId).toBe("placed-midlanding");
  for (let n = 0; n < 40 && state.positionM[1] < 7; n++) move(0, 1);
  for (let n = 0; n < 50 && state.positionM[0] > 3 + EPSILON; n++) move(-1, 0);
  for (let n = 0; n < 400 && !exit; n++) move(0, -1);
  expect(exit).not.toBeNull();
  expect((exit as unknown as { deckId: string }).deckId).toBe("lower-deck");
  expect(state.positionM[2]).toBe(0.1875);
  expect([...seen].filter((id) => id.includes("tread"))).toHaveLength(15);
});
const EPSILON = 1e-8;

test("persisted in-step state reloads against the same pinned surface and restart never catches up", () => {
  const f = fixture();
  for (let n = 0; n < 30; n++) {
    f.advance();
    if (f.state.pending && f.state.pending.distanceM > 0.2) break;
  }
  const text = JSON.stringify(f.state, (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  const state = JSON.parse(text) as StairWalkState;
  state.inputSequence = BigInt(state.inputSequence);
  state.lastTick = BigInt(state.lastTick);
  state.revision = BigInt(state.revision);
  state.input!.receivedMicros = BigInt(state.input!.receivedMicros);
  const restored =
    createPublishedNativeStairCompiler(publication())(installed());
  expect(restored.proofHash).toBe(f.surface.proofHash);
  const now = 9000000000n;
  const result = stepStairWalk(
    restored,
    state,
    { sequence: state.inputSequence, dx: state.input!.dx, dy: state.input!.dy },
    100000n,
    {
      actorPresent: true,
      admitted: true,
      connected: false,
      mayWalk: true,
      instanceRevision: 1n,
      stairRevision: 1n,
      nowMicros: now,
      receivedMicros: state.input!.receivedMicros,
      reservation: f.begin.reservation,
      occupied: [],
    },
  );
  expect(result.state.pending?.returning).toBe(true);
  expect(result.state.actorId).toBe(state.actorId);
  expect(result.state.visitId).toBe(state.visitId);
  expect(
    Math.hypot(...result.state.positionM.map((v, i) => v - state.positionM[i])),
  ).toBeLessThanOrEqual(0.1000001);
  const corrupted = {
    ...state,
    positionM: [
      state.positionM[0],
      state.positionM[1],
      state.positionM[2] + 0.01,
    ] as [number, number, number],
  };
  expect(() =>
    stepStairWalk(
      restored,
      corrupted,
      { sequence: state.inputSequence, dx: 0, dy: 0 },
      100000n,
      {
        actorPresent: true,
        admitted: true,
        connected: false,
        mayWalk: true,
        instanceRevision: 1n,
        stairRevision: 1n,
        nowMicros: now,
        receivedMicros: state.input!.receivedMicros,
        reservation: f.begin.reservation,
        occupied: [],
      },
    ),
  ).toThrow(/placement differs/);
});
