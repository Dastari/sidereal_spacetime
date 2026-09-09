import { expect, test, vi } from "vitest";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { transformPoint } from "@sidereal/content/ship-layout";
import type {
  NativeTraversalAudit,
  NativeTraversalDelivery,
  TraversalPoint3,
  TraversalBounds3,
} from "@sidereal/content/construction-traversal";
import {
  createNativeTraversalCompiler,
  createPublishedNativeTraversalCompiler,
  traversalReservationFor,
  beginTraversal,
  stepTraversal,
  traversalPlacement,
  traversalReservationConflicts,
  type TraversalInstallation,
  type TraversalActorSnapshot,
  type BeginTraversalRequest,
  type TraversalStepAuthority,
  type TraversalState,
} from "@sidereal/sim/construction-traversal";
const bytes = (s: string) => new TextEncoder().encode(s);
const hash = (b: Uint8Array) => bytesToHex(sha256(b));
// Synthetic test-only publication registry. This does not register a real native
// asset, qualify staged art, or become a runtime construction catalog entry.
const source = bytes("synthetic-unit-source-not-a-runtime-native-delivery");
function audit(): NativeTraversalAudit {
  return {
    schema: "sidereal.native-traversal-audit.v1",
    adapterId: "synthetic-test-ladder",
    revision: "test-only",
    qualification: {
      nativeMeshMatch: true,
      physicalApertures: true,
      capsuleSweepClear: true,
      guardedLandings: true,
    },
    body: { radiusM: 0.3, heightM: 1.8 },
    decks: {
      lower: { originZ: 0, walkingZ: 0.1875 },
      upper: { originZ: 3.1875, walkingZ: 3.375 },
    },
    parts: [
      {
        id: "fixture-solids",
        sourceId: "synthetic",
        nodePrefix: "test-fixture",
        originM: [0, 0, 0],
        quarterTurns: 0,
      },
    ],
    apertures: [
      {
        id: "roof-aperture",
        role: "lower-roof",
        boundsM: { min: [2, 2, 3], max: [4, 4, 3.1875] },
      },
      {
        id: "floor-aperture",
        role: "upper-floor",
        boundsM: { min: [2, 2, 3.1875], max: [4, 4, 3.375] },
      },
    ],
    pathM: [
      [3, 1.25, 0.1875],
      [3, 2.5, 0.1875],
      [3, 2.5, 3.375],
      [3, 1.25, 3.375],
    ],
    corridorFreeBoundsM: [
      { min: [2.65, 0.9, 0.1875], max: [3.35, 2.85, 1.9875] },
      { min: [2.65, 2.15, 0.1875], max: [3.35, 2.85, 5.175] },
      { min: [2.65, 0.9, 3.375], max: [3.35, 2.85, 5.175] },
    ],
    landings: {
      lower: {
        anchorM: [3, 1.25, 0.1875],
        freeBoundsM: { min: [2.55, 0.8, 0.1875], max: [3.45, 1.7, 1.9875] },
      },
      upper: {
        anchorM: [3, 1.25, 3.375],
        freeBoundsM: { min: [2.55, 0.8, 3.375], max: [3.45, 1.7, 5.175] },
      },
    },
  };
}
function delivery(a = audit()) {
  const data = bytes(JSON.stringify(a));
  const pin: NativeTraversalDelivery = {
    adapterId: a.adapterId,
    revision: a.revision,
    status: "native-geometry-qualified",
    auditSha256: hash(data),
    sources: { synthetic: { sha256: hash(source) } },
  };
  return { delivery: pin, audit: data, sources: { synthetic: source } };
}
function fixture(
  frame: { originM: TraversalPoint3; quarterTurns: number } = {
    originM: [0, 0, 0],
    quarterTurns: 0,
  },
  instanceId = "instance-a",
  linkId = "link-a",
) {
  const a = audit();
  const t = (p: TraversalPoint3): TraversalPoint3 => {
    const q = transformPoint([p[0], p[1]], frame.quarterTurns);
    return [
      q[0] + frame.originM[0],
      q[1] + frame.originM[1],
      p[2] + frame.originM[2],
    ];
  };
  const box = (b: TraversalBounds3): TraversalBounds3 => {
    const c = [
      t(b.min),
      t(b.max),
      t([b.min[0], b.max[1], b.min[2]]),
      t([b.max[0], b.min[1], b.max[2]]),
    ];
    return {
      min: [0, 1, 2].map((k) =>
        Math.min(...c.map((p) => p[k])),
      ) as TraversalPoint3,
      max: [0, 1, 2].map((k) =>
        Math.max(...c.map((p) => p[k])),
      ) as TraversalPoint3,
    };
  };
  const installation: TraversalInstallation = {
    instanceId,
    linkId,
    instanceRevision: 1n,
    linkRevision: 1n,
    ...frame,
    lower: {
      deckId: instanceId + ":lower",
      originZ: frame.originM[2],
      walkingZ: frame.originM[2] + 0.1875,
    },
    upper: {
      deckId: instanceId + ":upper",
      originZ: frame.originM[2] + 3.1875,
      walkingZ: frame.originM[2] + 3.375,
    },
    parts: a.parts.map((p) => ({
      ...p,
      id: instanceId + ":part",
      sourcePartId: p.id,
      sha256: hash(source),
      originM: t(p.originM),
      quarterTurns: frame.quarterTurns,
    })),
    apertures: a.apertures.map((p) => ({
      ...p,
      id: instanceId + ":" + p.id,
      sourceApertureId: p.id,
      state: "physical-opening",
      boundsM: box(p.boundsM),
    })),
    policy: { id: "test-manual-one-metre-per-second", metresPerSecond: 1 },
  };
  const compile = createNativeTraversalCompiler(delivery(a)),
    link = compile(installation);
  const actor: TraversalActorSnapshot = {
    id: "actor-a",
    instanceId,
    deckId: installation.lower.deckId,
    visitId: "visit-a",
    positionM: t([3.1, 1.25, 0.1875]),
    locationRevision: 1n,
    admitted: true,
    connected: true,
    mayTraverse: true,
    standing: true,
  };
  const request: BeginTraversalRequest = {
    linkId,
    expectedVisitId: actor.visitId,
    expectedLocationRevision: 1n,
    expectedInstanceRevision: 1n,
    expectedLinkRevision: 1n,
    operationId: "begin-a",
  };
  let serial = 0;
  const begin = (
    snapshot = actor,
    req = request,
    reservations: Parameters<typeof beginTraversal>[3]["reservations"] = [],
  ) => {
    const result = beginTraversal(link, snapshot, req, {
      tick: 0n,
      reservations,
      allocateTraversalId: () => "traversal-" + ++serial,
    });
    if (result.replay) throw Error("unexpected replay");
    return result;
  };
  const started = begin();
  const authority: TraversalStepAuthority = {
    actorPresent: true,
    connected: true,
    mayTraverse: true,
    cancelRequested: false,
    instanceRevision: 1n,
    linkRevision: 1n,
    reservation: started.reservation,
    forwardClear: true,
    reverseClear: true,
    destinationClear: true,
    sourceClear: true,
  };
  return {
    a,
    compile,
    installation,
    link,
    actor,
    request,
    begin,
    started,
    authority,
  };
}
function advance(
  f: ReturnType<typeof fixture>,
  state: TraversalState,
  count: number,
  policy = f.authority,
) {
  for (let i = 0; i < count; i++)
    state = stepTraversal(f.link, state, state.lastTick + 1n, policy);
  return state;
}

test("only exact trusted delivered source/audit bytes can construct native traversal rules", () => {
  const input = delivery();
  expect(() =>
    createNativeTraversalCompiler({
      ...input,
      delivery: { ...input.delivery, status: "staged" },
    }),
  ).toThrow(/unqualified/);
  expect(() =>
    createNativeTraversalCompiler({
      ...input,
      audit: bytes(JSON.stringify({ ...audit(), revision: "forged" })),
    }),
  ).toThrow(/audit hash/);
  expect(() =>
    createNativeTraversalCompiler({
      ...input,
      sources: { synthetic: bytes("changed") },
    }),
  ).toThrow(/source hash/);
  for (const field of [
    "nativeMeshMatch",
    "physicalApertures",
    "capsuleSweepClear",
    "guardedLandings",
  ] as const) {
    const a = audit();
    a.qualification[field] = false;
    expect(() => createNativeTraversalCompiler(delivery(a))).toThrow(
      /qualification/,
    );
  }
  const a = audit();
  a.corridorFreeBoundsM = [
    { min: [2.65, 0.9, 0.1875], max: [3.35, 2.85, 5.175] },
  ];
  expect(() => createNativeTraversalCompiler(delivery(a))).toThrow(
    /per path segment/,
  );
});

test("slab-crossing body and protected landings must fit real apertures and segment-specific native free space", () => {
  const a = audit();
  a.pathM[1][1] = 1.5;
  a.pathM[2][1] = 1.5;
  a.corridorFreeBoundsM[1] = {
    min: [2.65, 1.1, 0.1875],
    max: [3.35, 1.9, 5.175],
  };
  expect(() => createNativeTraversalCompiler(delivery(a))).toThrow(
    /intact slab/,
  );
  const b = audit();
  b.corridorFreeBoundsM[1].max[0] = 3.25;
  expect(() => createNativeTraversalCompiler(delivery(b))).toThrow(
    /body leaves/,
  );
  const c = audit();
  c.landings.upper.freeBoundsM.max[2] = 5;
  expect(() => createNativeTraversalCompiler(delivery(c))).toThrow(/landing/);
});

test("actual installed parts, physical apertures and deck datums bind the compiled link", () => {
  const f = fixture();
  for (const patch of [
    { parts: [] },
    { parts: [...f.installation.parts, f.installation.parts[0]] },
    {
      parts: f.installation.parts.map((p) => ({
        ...p,
        originM: [0.1, 0, 0] as TraversalPoint3,
      })),
    },
    {
      parts: f.installation.parts.map((p) => ({
        ...p,
        nodePrefix: "wrong-node",
      })),
    },
    { apertures: [] },
    {
      apertures: f.installation.apertures.map((a) => ({
        ...a,
        state: "covered" as const,
      })),
    },
    { upper: { ...f.installation.upper, originZ: 3 } },
    { upper: { ...f.installation.upper, deckId: f.installation.lower.deckId } },
  ])
    expect(() => f.compile({ ...f.installation, ...patch })).toThrow();
  expect(() =>
    beginTraversal({ ...f.link }, f.actor, f.request, {
      tick: 0n,
      reservations: [],
      allocateTraversalId: () => "forged",
    }),
  ).toThrow(/server-compiled/);
  expect(Object.isFrozen(f.link.pathM[0])).toBe(true);
});

test("approach begins at actual authority position and only physical arrival changes deck; downward path is mirrored", () => {
  const f = fixture();
  let state = f.started.state;
  expect(traversalPlacement(f.link, state).positionM).toEqual(
    f.actor.positionM,
  );
  state = advance(f, state, 1);
  expect(traversalPlacement(f.link, state).positionM[0]).toBeCloseTo(3.05, 12);
  expect(state.phase).toBe("approaching");
  for (let i = 0; i < 200 && state.phase !== "arrived"; i++) {
    const before = traversalPlacement(f.link, state);
    state = advance(f, state, 1);
    const after = traversalPlacement(f.link, state);
    expect(
      Math.hypot(...after.positionM.map((n, k) => n - before.positionM[k])),
    ).toBeLessThanOrEqual(0.050000001);
    if (state.phase !== "arrived")
      expect(after.deckId).toBe(f.link.lower.deckId);
  }
  expect(state.phase).toBe("arrived");
  expect(traversalPlacement(f.link, state)).toMatchObject({
    deckId: f.link.upper.deckId,
    standing: true,
    releaseReservation: true,
  });
  const startDown = f.begin(
    {
      ...f.actor,
      deckId: f.link.upper.deckId,
      positionM: [...f.link.upper.anchorM],
    },
    { ...f.request, operationId: "down" },
  );
  state = advance(f, startDown.state, 200, {
    ...f.authority,
    reservation: startDown.reservation,
  });
  expect(state.phase).toBe("arrived");
  expect(traversalPlacement(f.link, state).deckId).toBe(f.link.lower.deckId);
  expect(traversalPlacement(f.link, state).positionM[2]).toBe(0.1875);
});

test("fixed ticks survive serialized restart and gaps without catch-up; interruption returns without teleport or resumed outbound motion", () => {
  const f = fixture();
  let state = advance(f, f.started.state, 40);
  const before = traversalPlacement(f.link, state).positionM;
  const encoded = JSON.stringify(state, (_, v) =>
    typeof v === "bigint" ? { bigint: String(v) } : v,
  );
  const restored: TraversalState = JSON.parse(encoded, (_, v) =>
    v?.bigint ? BigInt(v.bigint) : v,
  );
  expect(stepTraversal(f.link, restored, restored.lastTick, f.authority)).toBe(
    restored,
  );
  const next = stepTraversal(f.link, restored, 99999n, f.authority);
  expect(next.distanceM - restored.distanceM).toBeCloseTo(0.05, 12);
  state = stepTraversal(f.link, restored, restored.lastTick + 1n, {
    ...f.authority,
    connected: false,
  });
  expect(state.mode).toBe("returning");
  expect(restored.distanceM - state.distanceM).toBeCloseTo(0.05, 12);
  expect(
    Math.hypot(
      ...traversalPlacement(f.link, state).positionM.map(
        (n, i) => n - before[i],
      ),
    ),
  ).toBeLessThanOrEqual(0.050000001);
  state = advance(f, state, 100);
  expect(state.phase).toBe("cancelled");
  expect(traversalPlacement(f.link, state)).toMatchObject({
    positionM: f.actor.positionM,
    deckId: f.link.lower.deckId,
    releaseReservation: true,
  });
  expect(stepTraversal(f.link, state, state.lastTick + 1n, f.authority)).toBe(
    state,
  );
});

test("exclusive link/landing reservations reject overlaps and remain isolated between instances", () => {
  const f = fixture();
  expect(() =>
    f.begin({ ...f.actor, id: "actor-b" }, f.request, [f.started.reservation]),
  ).toThrow(/reservation occupied/);
  const differentLink = {
    ...f.started.reservation,
    linkId: "overlapping-link",
    actorId: "actor-b",
    traversalId: "other-traversal",
  };
  expect(
    traversalReservationConflicts(differentLink, [f.started.reservation]),
  ).toBe(true);
  expect(
    traversalReservationConflicts(
      { ...differentLink, instanceId: "instance-b" },
      [f.started.reservation],
    ),
  ).toBe(false);
  const state = advance(f, f.started.state, 20);
  const lost = stepTraversal(f.link, state, state.lastTick + 1n, {
    ...f.authority,
    reservation: null,
  });
  expect(lost.phase).toBe("blocked");
  expect(lost.distanceM).toBe(state.distanceM);
  expect(traversalPlacement(f.link, lost).releaseReservation).toBe(false);
  const geometry = stepTraversal(f.link, state, state.lastTick + 1n, {
    ...f.authority,
    instanceRevision: 2n,
  });
  expect(geometry.phase).toBe("blocked");
  expect(geometry.distanceM).toBe(state.distanceM);
});

test("access/visit/revision and replay checks cannot allocate twice or accept client coordinates", () => {
  const f = fixture(),
    allocate = vi.fn(() => "must-not-allocate");
  const replay = beginTraversal(
    f.link,
    { ...f.actor, standing: false, locationRevision: 9n },
    f.request,
    {
      tick: 3n,
      reservations: [f.started.reservation],
      previous: f.started.receipt,
      allocateTraversalId: allocate,
    },
  );
  expect(replay).toEqual({ replay: true, receipt: f.started.receipt });
  expect(allocate).not.toHaveBeenCalled();
  for (const patch of [
    { admitted: false },
    { connected: false },
    { mayTraverse: false },
    { visitId: "wrong" },
    { deckId: "wrong" },
    { standing: false },
    { locationRevision: 2n },
    { positionM: [3.3, 1.25, 0.1875] as TraversalPoint3 },
    { positionM: [3, 1.25, 3.375] as TraversalPoint3 },
  ])
    expect(() => f.begin({ ...f.actor, ...patch })).toThrow();
  expect(() =>
    beginTraversal(f.link, { ...f.actor, mayTraverse: false }, f.request, {
      tick: 1n,
      reservations: [],
      previous: f.started.receipt,
      allocateTraversalId: allocate,
    }),
  ).toThrow(/permission/);
  expect(() =>
    beginTraversal(
      f.link,
      f.actor,
      { ...f.request, operationId: "different" },
      {
        tick: 1n,
        reservations: [],
        previous: f.started.receipt,
        allocateTraversalId: allocate,
      },
    ),
  ).toThrow(/replay/);
});

test("unsafe destination never commits its deck; source obstruction retains the reserved in-transit actor", () => {
  const f = fixture();
  let state = advance(f, f.started.state, 115);
  state = stepTraversal(f.link, state, state.lastTick + 1n, {
    ...f.authority,
    destinationClear: false,
  });
  expect(state.phase).toBe("blocked");
  expect(traversalPlacement(f.link, state).deckId).toBe(f.link.lower.deckId);
  state = advance(f, state, 200, { ...f.authority, sourceClear: false });
  expect(state.phase).toBe("blocked");
  expect(state.distanceM).toBeGreaterThan(0);
  expect(traversalPlacement(f.link, state).releaseReservation).toBe(false);
  state = advance(f, state, 10);
  expect(state.phase).toBe("cancelled");
});

test("all quarter turns and translated decks preserve exact physical path and reject nonfinite progress", () => {
  for (const quarterTurns of [0, 1, 2, 3]) {
    const f = fixture({ originM: [-20, 30, 8], quarterTurns });
    let state = advance(f, f.started.state, 200);
    expect(state.phase).toBe("arrived");
    expect(traversalPlacement(f.link, state).positionM[2]).toBe(11.375);
    expect(() =>
      stepTraversal(
        f.link,
        { ...state, distanceM: NaN },
        state.lastTick + 1n,
        f.authority,
      ),
    ).toThrow(/progress/);
    expect(() =>
      stepTraversal(f.link, f.started.state, -1n, f.authority),
    ).toThrow(/tick/);
  }
});

test("actual delivered a003 ladder and existing slab sources qualify the exact 28-part fixture, without publishing it", async () => {
  const { readFileSync } = await import("node:fs");
  const base =
    "assets/art-library/designs/shipyard.structure.traversal-ladder/revisions/r000/a003/";
  const trustedDelivery = JSON.parse(
    readFileSync(base + "delivery.json", "utf8"),
  ) as NativeTraversalDelivery & {
    runtimePublication: boolean;
    sources: Record<string, { path: string; sha256: string }>;
  };
  expect(trustedDelivery.auditSha256).toBe(
    "a41e28d065833c1be30ae1e1e5a4a49832b0771157e6a80b1343f82ccec9e714",
  );
  expect(trustedDelivery.sources["ladder-kit"].sha256).toBe(
    "f4fb453f44fe84f577107d72fad15459e6e59ec9ad2ed122bceadead5b855625",
  );
  expect(trustedDelivery.runtimePublication).toBe(false);
  const auditBytes = new Uint8Array(
    readFileSync(base + "traversal-audit.json"),
  );
  const native = JSON.parse(
    new TextDecoder().decode(auditBytes),
  ) as NativeTraversalAudit;
  const sources = Object.fromEntries(
    Object.entries(trustedDelivery.sources).map(([name, pin]) => [
      name,
      new Uint8Array(readFileSync(pin.path)),
    ]),
  );
  const compile = createNativeTraversalCompiler({
    delivery: trustedDelivery,
    audit: auditBytes,
    sources,
  });
  const instance: TraversalInstallation = {
    instanceId: "delivered-test-instance",
    linkId: "delivered-test-link",
    instanceRevision: 1n,
    linkRevision: 1n,
    originM: [0, 0, 0],
    quarterTurns: 0,
    lower: { deckId: "actual-lower", ...native.decks.lower },
    upper: { deckId: "actual-upper", ...native.decks.upper },
    parts: native.parts.map((p) => ({
      ...p,
      id: "installed:" + p.id,
      sourcePartId: p.id,
      sha256: trustedDelivery.sources[p.sourceId].sha256,
    })),
    apertures: native.apertures.map((p) => ({
      ...p,
      id: "installed:" + p.id,
      sourceApertureId: p.id,
      state: "physical-opening",
    })),
    policy: { id: "test-review-only", metresPerSecond: 1 },
  };
  expect(instance.parts).toHaveLength(28);
  const link = compile(instance);
  expect(link.lower.walkingZ).toBe(0.1875);
  expect(link.upper.walkingZ).toBe(3.375);
  expect(link.pathM).toEqual(native.pathM);
  expect(
    compile({
      ...instance,
      parts: [...instance.parts].reverse(),
      apertures: [...instance.apertures].reverse(),
    }).proofHash,
  ).toBe(link.proofHash);
  expect(() =>
    compile({ ...instance, parts: instance.parts.slice(1) }),
  ).toThrow(/exhaustive/);
  const roof = instance.apertures.find((a) => a.role === "lower-roof")!;
  expect(() =>
    compile({
      ...instance,
      apertures: instance.apertures.map((a) =>
        a === roof ? { ...a, state: "covered" } : a,
      ),
    }),
  ).toThrow(/physical aperture/);
});

test("compact publication constructor matches full-source validation and rejects changed or staged audit pins", () => {
  const input = delivery(),
    f = fixture();
  const compact = createPublishedNativeTraversalCompiler({
    delivery: input.delivery,
    audit: input.audit,
  })(f.installation);
  expect(compact.proofHash).toBe(f.link.proofHash);
  expect(
    traversalReservationFor(compact, f.actor.id, f.started.state.id),
  ).toEqual(f.started.reservation);
  expect(() =>
    createPublishedNativeTraversalCompiler({
      delivery: { ...input.delivery, status: "staged" },
      audit: input.audit,
    }),
  ).toThrow(/unqualified/);
  const changed = input.audit.slice();
  changed[changed.length - 2] ^= 1;
  expect(() =>
    createPublishedNativeTraversalCompiler({
      delivery: input.delivery,
      audit: changed,
    }),
  ).toThrow(/audit hash/);
});

test("cancel and access loss reverse once; exhausted reservation capacity never allocates another traversal", () => {
  const f = fixture(),
    state = advance(f, f.started.state, 12);
  for (const patch of [
    { cancelRequested: true },
    { mayTraverse: false },
    { actorPresent: false },
  ]) {
    const reversed = stepTraversal(f.link, state, state.lastTick + 1n, {
      ...f.authority,
      ...patch,
    });
    expect(reversed.mode).toBe("returning");
    expect(advance(f, reversed, 100).phase).toBe("cancelled");
  }
  const full = Array.from({ length: 64 }, (_, i) => ({
    ...f.started.reservation,
    instanceId: "other-instance-" + i,
    actorId: "other-actor-" + i,
    traversalId: "other-traversal-" + i,
  }));
  const allocate = vi.fn(() => "over-budget");
  expect(() =>
    beginTraversal(f.link, f.actor, f.request, {
      tick: 0n,
      reservations: full,
      allocateTraversalId: allocate,
    }),
  ).toThrow(/admission budget/);
  expect(allocate).not.toHaveBeenCalled();
});
