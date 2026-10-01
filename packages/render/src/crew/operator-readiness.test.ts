import { afterEach, expect, test, vi } from "vitest";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  createOperatorReadiness,
  createOperatorEnsembleOwner,
  operatorProjection,
  operatorRequestedLook,
  type OperatorInteriorRow,
  type OperatorActivatedCapability,
} from "./operator-readiness";
import type {
  PreparedOperatorEnsemble,
  OperatorEnsembleRequest,
} from "./operator-ensemble";

const engines: NullEngine[] = [];
afterEach(() => {
  for (const engine of engines.splice(0)) engine.dispose();
});
const state = {
  associationKey: "current-station",
  pose: "occupied" as const,
  dead: false,
  connected: true,
  acceptedX: 0,
  acceptedY: 3.5,
};
function fixture() {
  const engine = new NullEngine();
  engines.push(engine);
  const scene = new Scene(engine);
  return { scene, parent: new TransformNode("parent", scene) };
}
function request(key: string) {
  return {
    requestedKey: key,
    associationKey: state.associationKey,
  } as OperatorEnsembleRequest;
}
function complete(key: string): PreparedOperatorEnsemble {
  return {
    state: "verified-complete",
    requestedKey: key,
    associationKey: state.associationKey,
    activate: vi.fn(),
    dispose: vi.fn(),
    prepareActivation: vi.fn(async () => undefined),
  } as unknown as PreparedOperatorEnsemble;
}
async function settle() {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

function projected() {
  const capability: OperatorActivatedCapability = {
    profileId: "measured-profile",
    certificateSha256: "a".repeat(64),
    proofSha256: "b".repeat(64),
    manifestSha256: "c".repeat(64),
    compilerSha256: "d".repeat(64),
    geometrySha256: "e".repeat(64),
    navigationSha256: "f".repeat(64),
    mountSourceId: "helm",
  };
  const row: OperatorInteriorRow = {
    characterId: "actor",
    shipId: "instance",
    deckId: "deck",
    visitId: "visit",
    locationRevision: "9007199254740993",
    localX: 0,
    localY: 3.5,
    standingElevationM: 0.1875,
    connected: true,
    dead: false,
    operatorPoseState: "occupied",
  };
  const packet = {
    ...capability,
    version: 1,
    status: "supported",
    characterId: row.characterId,
    instanceId: row.shipId,
    deckId: row.deckId,
    visitId: row.visitId,
    locationRevision: row.locationRevision,
    instanceRevision: "1",
    bindingRevision: "2",
    mappingRevision: "3",
    seatRevision: "4",
    pose: "occupied",
    dead: false,
    connected: true,
    acceptedX: row.localX,
    acceptedY: row.localY,
    standingElevationM: row.standingElevationM,
    stationId: "station",
    seatPlacedObjectId: "seat",
    consolePlacedObjectId: "computer",
    appearance: { bodyType: "female" },
    visuals: [],
  };
  row.operatorSnapshot = JSON.stringify(packet);
  return { capability, row, packet };
}

test("default capability absence is inert; a nonnull packet matches the whole current coherent row", () => {
  const f = projected();
  expect(operatorProjection(f.row, null)).toBeNull();
  expect(operatorProjection(f.row, f.capability)?.status).toBe("supported");
  for (const field of [
    "visitId",
    "locationRevision",
    "deckId",
    "acceptedX",
    "dead",
    "pose",
  ]) {
    const packet = { ...f.packet, [field]: "stale" };
    expect(
      operatorProjection(
        { ...f.row, operatorSnapshot: JSON.stringify(packet) },
        f.capability,
      )?.status,
    ).toBe("withdrawn");
  }
  expect(
    operatorProjection(
      { ...f.row, locationRevision: "18446744073709551616" },
      f.capability,
    ),
  ).toBeNull();
});

test("requested look uses actual pinned public visual IDs, including revised definitions, rather than current seed mappings", () => {
  const f = projected();
  const visuals = [
    {
      slot: "hand",
      definitionId: "seed-pistol",
      definitionRevision: "7",
      crewItemId: "rail-rifle",
      wardrobeId: null,
      characterComponentId: null,
    },
    {
      slot: "chest",
      definitionId: "seed-medic",
      definitionRevision: "3",
      crewItemId: null,
      wardrobeId: "wardrobe-marine-chest",
      characterComponentId: "ignored-old",
    },
  ];
  const look = operatorRequestedLook({ ...f.packet, visuals });
  expect(look.heldItem).toBe("rail-rifle");
  expect(look.appearance).toMatchObject({
    bodyType: "female",
    weapon: "none",
    weaponFixture: false,
    equippedComponents: { chest: "wardrobe-marine-chest" },
  });
  for (const invalid of [
    [...visuals, visuals[0]],
    [{ ...visuals[0], crewItemId: null }],
    [{ ...visuals[1], wardrobeId: null, characterComponentId: null }],
  ])
    expect(() =>
      operatorRequestedLook({ ...f.packet, visuals: invalid }),
    ).toThrow();
});

test("same integer revision does not make old pinned appearance equal to the current requested key", () => {
  const f = projected();
  const first = operatorProjection(f.row, f.capability)!;
  const replacement = operatorProjection(
    {
      ...f.row,
      operatorSnapshot: JSON.stringify({
        ...f.packet,
        appearance: { bodyType: "male" },
      }),
    },
    f.capability,
  )!;
  expect(replacement.state.associationKey).toBe(first.state.associationKey);
  expect(replacement.requestedKey).not.toBe(first.requestedKey);
  const unavailable = operatorProjection(
    {
      ...f.row,
      operatorSnapshot: JSON.stringify({
        ...f.packet,
        status: "visual-unavailable",
        unavailableSlots: [{ slot: "hand", reason: "visual-unmeasured" }],
      }),
    },
    f.capability,
  )!;
  expect(unavailable.status).toBe("visual-unavailable");
  expect(unavailable.requestedKey).not.toBeNull();
});

test("late-first descriptor verification owns readiness and stale resolution cannot promote a marker", async () => {
  const f = projected(),
    { scene, parent } = fixture();
  const changed = vi.fn(),
    prepare = vi.fn();
  const owner = createOperatorEnsembleOwner(
    scene,
    parent,
    "actor",
    createOperatorReadiness(changed),
    { prepare },
  );
  let finish!: (request: OperatorEnsembleRequest) => void;
  const resolve = vi.fn(
    () => new Promise<OperatorEnsembleRequest>((value) => (finish = value)),
  );
  owner.syncProjection(f.row, f.capability, resolve);
  await settle();
  expect(changed.mock.lastCall?.[0]).toEqual({ blocked: true, error: null });
  expect(prepare).not.toHaveBeenCalled();
  owner.syncProjection(
    { ...f.row, operatorSnapshot: undefined, operatorPoseState: "recovering" },
    f.capability,
    resolve,
  );
  finish({
    ...request("stale"),
    associationKey: operatorProjection(f.row, f.capability)!.state
      .associationKey,
  });
  await settle();
  expect(prepare).not.toHaveBeenCalled();
  expect(owner.committed).toBeNull();
  expect(changed.mock.lastCall?.[0]).toEqual({ blocked: false, error: null });
  owner.withdraw();
});

test("supported descriptor failure is an owned error while unqualified default never resolves assets", async () => {
  const f = projected(),
    { scene, parent } = fixture();
  const changed = vi.fn();
  const owner = createOperatorEnsembleOwner(
    scene,
    parent,
    "actor",
    createOperatorReadiness(changed),
  );
  const resolve = vi.fn().mockRejectedValue(new Error("private-source-id"));
  owner.syncProjection(f.row, f.capability, resolve);
  await settle();
  expect(changed.mock.lastCall?.[0]).toEqual({
    blocked: true,
    error: "Crew equipment unavailable",
  });
  const other = createOperatorEnsembleOwner(
    scene,
    parent,
    "unqualified",
    createOperatorReadiness(),
  );
  const ignored = vi.fn();
  other.syncProjection(f.row, null, ignored);
  expect(ignored).not.toHaveBeenCalled();
  owner.withdraw();
});

test("older walking revision cannot rewind a current occupied visit using decimal lexical order", async () => {
  const f = projected(),
    { scene, parent } = fixture();
  const changed = vi.fn();
  let finish!: (request: OperatorEnsembleRequest) => void;
  const resolve = vi.fn(
    () => new Promise<OperatorEnsembleRequest>((value) => (finish = value)),
  );
  const owner = createOperatorEnsembleOwner(
    scene,
    parent,
    "actor",
    createOperatorReadiness(changed),
  );
  const current = {
    ...f.row,
    locationRevision: "10",
    operatorSnapshot: JSON.stringify({ ...f.packet, locationRevision: "10" }),
  };
  owner.syncProjection(current, f.capability, resolve);
  await settle();
  owner.syncProjection(
    {
      ...f.row,
      locationRevision: "9",
      operatorSnapshot: undefined,
      operatorPoseState: "none",
      localY: 0,
    },
    f.capability,
    resolve,
  );
  expect(changed.mock.lastCall?.[0]).toEqual({ blocked: true, error: null });
  const projection = operatorProjection(current, f.capability)!;
  finish({
    ...request("wrong-key"),
    associationKey: projection.state.associationKey,
  });
  await settle();
  // The current descriptor failure remains owned: the old walking row did not cancel generation10.
  expect(owner.qualifies).toBe(false);
  expect(changed.mock.lastCall?.[0]).toEqual({
    blocked: true,
    error: "Crew equipment unavailable",
  });
  owner.withdraw();
});

test("NULL new visit cannot retain the old fitted frame or restore carry from a stale visit", async () => {
  const f = projected();
  const restore = vi.fn();
  const { scene, parent } = fixture();
  // The pure projection is the only source of association; it never borrows a prior packet epoch.
  const before = operatorProjection(f.row, f.capability)!;
  const after = operatorProjection(
    { ...f.row, visitId: "new-visit", operatorSnapshot: undefined },
    f.capability,
  )!;
  const handle = {
    ...complete("first"),
    associationKey: before.state.associationKey,
  };
  const owner = createOperatorEnsembleOwner(
    scene,
    parent,
    "actor",
    createOperatorReadiness(),
    {
      restoreAtAcceptedRecovery: restore,
      prepare: vi.fn().mockResolvedValue(handle),
    },
  );
  expect(after.state.associationKey).not.toBe(before.state.associationKey);
  owner.sync(before.state, {
    ...request("first"),
    associationKey: before.state.associationKey,
  });
  await settle();
  scene.onBeforeAnimationsObservable.notifyObservers(scene);
  expect(owner.committed).toBe(handle);
  owner.sync(after.state, null);
  expect(owner.committed).toBeNull();
  expect(handle.dispose).toHaveBeenCalledTimes(1);
  expect(owner.qualifies).toBe(false);
  expect(restore).not.toHaveBeenCalled();
  owner.withdraw();
});

test("same-visit recovering NULL retains completion until the current accepted none-row coordinates", async () => {
  const f = projected(),
    { scene, parent } = fixture();
  const initial = operatorProjection(f.row, f.capability)!;
  const handle = {
    ...complete("first"),
    associationKey: initial.state.associationKey,
  };
  const restore = vi.fn();
  const owner = createOperatorEnsembleOwner(
    scene,
    parent,
    "actor",
    createOperatorReadiness(),
    {
      prepare: vi.fn().mockResolvedValue(handle),
      restoreAtAcceptedRecovery: restore,
    },
  );
  owner.sync(initial.state, {
    ...request("first"),
    associationKey: initial.state.associationKey,
  });
  await settle();
  scene.onBeforeAnimationsObservable.notifyObservers(scene);
  const resolve = vi.fn();
  owner.syncProjection(
    {
      ...f.row,
      operatorSnapshot: undefined,
      operatorPoseState: "recovering",
      dead: true,
    },
    f.capability,
    resolve,
  );
  expect(owner.committed).toBe(handle);
  expect(owner.qualifies).toBe(false);
  expect(restore).not.toHaveBeenCalled();
  owner.syncProjection(
    {
      ...f.row,
      locationRevision: "9007199254740994",
      operatorSnapshot: undefined,
      operatorPoseState: "none",
      localX: 0.75,
      localY: 2.625,
    },
    f.capability,
    resolve,
  );
  expect(restore).toHaveBeenCalledWith(handle, [0.75, 2.625]);
  expect(handle.dispose).toHaveBeenCalledTimes(1);
  expect(resolve).not.toHaveBeenCalled();
  owner.withdraw();
});

test("one actor success or stale cancellation cannot clear another actor's current error", () => {
  const changed = vi.fn();
  const aggregate = createOperatorReadiness(changed);
  const a = aggregate.claim("a"),
    b = aggregate.claim("b");
  a.update(2, { pending: false, hasComplete: true, error: true });
  b.update(1, { pending: true, hasComplete: false, error: false });
  b.update(1, { pending: false, hasComplete: true, error: false });
  a.cancel(1);
  expect(changed.mock.lastCall?.[0]).toEqual({
    blocked: true,
    error: "Crew equipment unavailable",
  });
  a.cancel(3);
  expect(changed.mock.lastCall?.[0]).toEqual({ blocked: false, error: null });
  a.update(2, { pending: false, hasComplete: false, error: true });
  expect(changed.mock.lastCall?.[0]).toEqual({ blocked: false, error: null });
});
test("replacement ownership accepts a new low generation and old actor callback cannot resurrect a blocker", () => {
  const changed = vi.fn();
  const aggregate = createOperatorReadiness(changed);
  const old = aggregate.claim("actor");
  old.update(99, { pending: false, hasComplete: true, error: true });
  const current = aggregate.claim("actor");
  current.update(1, { pending: true, hasComplete: false, error: false });
  old.dispose();
  old.update(100, { pending: false, hasComplete: false, error: true });
  expect(changed.mock.lastCall?.[0]).toEqual({ blocked: true, error: null });
  current.dispose();
  expect(changed.mock.lastCall?.[0]).toEqual({ blocked: false, error: null });
});
test("unavailable-only request owns an error without a mesh or pending load", () => {
  const { scene, parent } = fixture();
  const changed = vi.fn();
  const prepare = vi.fn();
  const owner = createOperatorEnsembleOwner(
    scene,
    parent,
    "actor",
    createOperatorReadiness(changed),
    { prepare },
  );
  owner.sync(state, null, "unsupported-head:actual-public-key");
  expect(prepare).not.toHaveBeenCalled();
  expect(owner.qualifies).toBe(false);
  expect(changed.mock.lastCall?.[0]).toEqual({
    blocked: true,
    error: "Crew equipment unavailable",
  });
  owner.sync({ ...state, pose: "recovering", dead: true }, null);
  expect(changed.mock.lastCall?.[0]).toEqual({ blocked: false, error: null });
});
test("marker commitment waits for the actual queued complete swap; occupied/recovering does not demote", async () => {
  const { scene, parent } = fixture();
  const first = complete("first"),
    second = complete("second");
  const committed = vi.fn(),
    restore = vi.fn(),
    changed = vi.fn();
  let resolveSecond!: (value: PreparedOperatorEnsemble) => void;
  const prepare = vi
    .fn()
    .mockResolvedValueOnce(first)
    .mockImplementationOnce(
      () =>
        new Promise<PreparedOperatorEnsemble>(
          (resolve) => (resolveSecond = resolve),
        ),
    );
  const owner = createOperatorEnsembleOwner(
    scene,
    parent,
    "actor",
    createOperatorReadiness(changed),
    { prepare, onCommitted: committed, restoreAtAcceptedRecovery: restore },
  );
  owner.sync(state, request("first"));
  await settle();
  expect(committed).not.toHaveBeenCalled();
  expect(owner.committed).toBeNull();
  scene.onBeforeAnimationsObservable.notifyObservers(scene);
  expect(committed).toHaveBeenCalledWith(first);
  expect(owner.mayDemote()).toBe(false);
  owner.sync(state, request("second"));
  expect(first.dispose).not.toHaveBeenCalled();
  expect(changed.mock.lastCall?.[0]).toEqual({ blocked: false, error: null });
  await settle(); // Let descriptor preparation start before testing a late completed mesh.
  owner.sync({ ...state, pose: "recovering" }, null);
  resolveSecond(second);
  await settle();
  expect(second.dispose).toHaveBeenCalledTimes(1);
  expect(first.dispose).not.toHaveBeenCalled();
  expect(restore).not.toHaveBeenCalled();
  expect(owner.mayDemote()).toBe(false);
  owner.sync({ ...state, pose: "none", acceptedY: 2.625 }, null);
  expect(restore).toHaveBeenCalledWith(first, [0, 2.625]);
  expect(first.dispose).toHaveBeenCalledTimes(1);
  expect(owner.mayDemote()).toBe(true);
});
test("withdraw cancels a queued complete handle and stale failure cannot own another actor's blocker", async () => {
  const { scene, parent } = fixture();
  const handle = complete("first");
  const changed = vi.fn();
  const aggregate = createOperatorReadiness(changed);
  const other = aggregate.claim("other");
  other.update(1, { pending: false, hasComplete: true, error: true });
  const owner = createOperatorEnsembleOwner(scene, parent, "actor", aggregate, {
    prepare: vi.fn().mockResolvedValue(handle),
  });
  owner.sync(state, request("first"));
  await settle();
  owner.withdraw();
  scene.onBeforeAnimationsObservable.notifyObservers(scene);
  expect(handle.activate).not.toHaveBeenCalled();
  expect(handle.dispose).toHaveBeenCalledTimes(1);
  expect(changed.mock.lastCall?.[0]).toEqual({
    blocked: true,
    error: "Crew equipment unavailable",
  });
});
