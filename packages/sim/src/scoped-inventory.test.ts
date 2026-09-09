import { describe, expect, it } from "vitest";
import {
  planScopedInventoryTransfer,
  type ScopedInventoryState,
  type ScopedTransferRequest,
  type InventoryActorAccess,
  type ScopedContainer,
  type ScopedTransferPlan,
  type ScopedInventoryErrorCode,
} from "./scoped-inventory";
import type { GridDefinition } from "./inventory";
const definitions: GridDefinition[] = [
  { id: "kit", width: 1, height: 1, massKg: 2 },
  { id: "bag", width: 2, height: 2, massKg: 1, equipSlot: "back" },
  { id: "gun", width: 2, height: 1, massKg: 3, equipSlot: "hand" },
];
function container(id: string): ScopedContainer {
  return {
    id,
    parentItemId: "",
    kind: "grid",
    width: 4,
    height: 4,
    maxMassKg: 20,
    capacityLitres: 0,
    amountLitres: 0,
    liquidType: "",
    revision: 1n,
    lifecycle: "active",
    scope: { kind: "character", characterId: "alice" },
  };
}
function fixture() {
  const state: ScopedInventoryState = {
    character: {
      characterId: "alice",
      pocketsId: "pockets",
      revision: 1n,
      carryLimitKg: 20,
    },
    receipts: [],
    items: [
      {
        id: "item",
        definitionId: "kit",
        containerId: "pockets",
        equipmentSlot: "",
        x: 0,
        y: 0,
        rotated: false,
        revision: 1n,
      },
    ],
    containers: [
      container("pockets"),
      {
        ...container("cargo"),
        scope: {
          kind: "instance",
          instanceId: "ship-a",
          deckId: "lower",
          placedObjectId: "crate-a",
          instanceRevision: 1n,
          accessPointM: [1, 0, 1],
        },
      },
    ],
  };
  const request: ScopedTransferRequest = {
    operationId: "move-a",
    itemId: "item",
    expectedItemRevision: 1n,
    sourceContainerId: "pockets",
    expectedSourceRevision: 1n,
    destinationContainerId: "cargo",
    expectedDestinationRevision: 1n,
    expectedCharacterRevision: 1n,
    x: 0,
    y: 0,
    rotated: false,
  };
  const access: InventoryActorAccess = {
    actorId: "alice",
    admitted: true,
    connected: true,
    supportedStanding: true,
    instanceId: "ship-a",
    deckId: "lower",
    instanceRevision: 1n,
    interactionPointM: [0, 0, 1],
    nowMicros: 10n,
    grants: [
      {
        actorId: "alice",
        instanceId: "ship-a",
        capability: "inventory.transfer",
        expiresMicros: 1000n,
        revoked: false,
      },
    ],
    geometry: {
      instanceRevision: 1n,
      frame: {
        shipId: "ship-a",
        deckId: "lower",
        fingerprint: "trusted-frame",
        elevationM: 0,
        floors: [
          [
            [-5, -5],
            [5, -5],
            [5, 5],
            [-5, 5],
          ],
        ],
        segments: [],
        obstacles: [],
      },
    },
  };
  return { state, request, access };
}
const encode = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? String(v) : v));
function plan(f: ReturnType<typeof fixture>) {
  return planScopedInventoryTransfer(
    f.state,
    f.request,
    f.access,
    definitions,
    { water: 1 },
  );
}
function passed(result: ReturnType<typeof plan>): ScopedTransferPlan {
  expect(result.ok).toBe(true);
  if (!result.ok) throw Error(result.error.code);
  return result;
}
function rejected(
  f: ReturnType<typeof fixture>,
  code: ScopedInventoryErrorCode,
) {
  const before = encode(f.state);
  expect(plan(f)).toMatchObject({ ok: false, error: { code } });
  expect(encode(f.state)).toBe(before);
}
/** Mimics ONE atomic database transaction; never used to accept client plans. */
function commit(
  state: ScopedInventoryState,
  p: ScopedTransferPlan,
): ScopedInventoryState {
  if (p.replay) return state;
  return {
    ...state,
    items: state.items.map(
      (i) => p.itemUpdates.find((u) => u.id === i.id) ?? i,
    ),
    containers: state.containers.map(
      (c) => p.containerUpdates.find((u) => u.id === c.id) ?? c,
    ),
    character: p.characterUpdate ?? state.character,
    receipts: [...state.receipts, p.receipt],
  };
}
describe("instance-scoped atomic inventory plan", () => {
  it("moves an existing UUID and bumps both containers and actor revision without mutating the input", () => {
    const f = fixture(),
      before = encode(f.state),
      p = passed(plan(f));
    expect(p.itemUpdates[0]).toMatchObject({
      id: "item",
      containerId: "cargo",
      revision: 2n,
    });
    expect(p.containerUpdates.map((c) => [c.id, c.revision])).toEqual([
      ["pockets", 2n],
      ["cargo", 2n],
    ]);
    expect(p.characterUpdate?.revision).toBe(2n);
    expect(encode(f.state)).toBe(before);
    expect(p.movedItemIds).toEqual(["item"]);
  });
  it("retries return the original receipt without writes, but changed payloads cannot reuse an operation", () => {
    const f = fixture(),
      p = passed(plan(f));
    f.state = commit(f.state, p);
    const replay = passed(plan(f));
    expect(replay.replay).toBe(true);
    expect(replay.itemUpdates).toEqual([]);
    expect(replay.containerUpdates).toEqual([]);
    f.request = { ...f.request, x: 1 };
    rejected(f, "replay-conflict");
  });
  it("rechecks access before replay after grant expiry or deck change", () => {
    const f = fixture();
    f.state = commit(f.state, passed(plan(f)));
    f.access = { ...f.access, nowMicros: 1000n };
    rejected(f, "grant-denied");
    f.access = { ...f.access, nowMicros: 10n, deckId: "upper" };
    rejected(f, "wrong-deck");
  });
  it.each([
    "expectedItemRevision",
    "expectedSourceRevision",
    "expectedDestinationRevision",
    "expectedCharacterRevision",
  ] as const)("rejects a stale %s atomically", (field) => {
    const f = fixture();
    f.request = { ...f.request, [field]: 2n };
    rejected(f, "revision-conflict");
  });
  it("two stale withdrawals cannot consume one item or the same free capacity twice", () => {
    const f = fixture();
    f.state.items = [{ ...f.state.items[0], containerId: "cargo" }];
    f.request = {
      ...f.request,
      sourceContainerId: "cargo",
      destinationContainerId: "pockets",
    };
    const stale = { ...f.request, operationId: "concurrent" };
    f.state = commit(f.state, passed(plan(f)));
    f.request = stale;
    rejected(f, "revision-conflict");
    expect(f.state.items).toHaveLength(1);
    expect(f.state.items[0].containerId).toBe("pockets");
  });
  it.each([false, true])(
    "rejects unavailable admission with connected=%s",
    (connected) => {
      const f = fixture();
      f.access = { ...f.access, connected, admitted: false };
      rejected(f, "not-admitted");
    },
  );
  it("rejects seated or unsupported traversal poses", () => {
    const f = fixture();
    f.access.supportedStanding = false;
    rejected(f, "unsupported-pose");
  });
  it("does not turn ownership or a foreign grant into instance/deck access", () => {
    const f = fixture();
    f.access.grants = [];
    rejected(f, "grant-denied");
    f.access.grants = [
      {
        actorId: "bob",
        instanceId: "ship-a",
        capability: "inventory.transfer",
        expiresMicros: 1000n,
        revoked: false,
      },
    ];
    rejected(f, "grant-denied");
    f.access.instanceId = "ship-b";
    rejected(f, "wrong-instance");
  });
  it("requires current instance geometry and full 3D reach to the access point", () => {
    const f = fixture();
    f.access.geometry!.instanceRevision = 2n;
    rejected(f, "geometry-stale");
    f.access.geometry!.instanceRevision = 1n;
    f.access.interactionPointM = [0, 0, -2];
    rejected(f, "out-of-reach");
  });
  it("closed structural walls and intervening furniture block access; opening/removal restores it", () => {
    const f = fixture();
    f.access.geometry!.frame.segments = [
      { id: "door", a: [0.5, -1], b: [0.5, 1], halfWidthM: 0.05 },
    ];
    rejected(f, "line-of-sight");
    f.access.geometry!.frame.segments = [];
    f.access.geometry!.frame.obstacles = [
      {
        id: "bed",
        definitionId: "bed",
        vertices: [
          [0.4, -1],
          [0.6, -1],
          [0.6, 1],
          [0.4, 1],
        ],
      },
    ];
    rejected(f, "line-of-sight");
    f.access.geometry!.frame.obstacles = [];
    passed(plan(f));
  });
  it("liquid and removed containers reject solid transfers", () => {
    const f = fixture();
    f.state.containers = [
      f.state.containers[0],
      { ...f.state.containers[1], kind: "liquid" },
    ];
    rejected(f, "liquid-container");
    f.state.containers = [
      f.state.containers[0],
      { ...f.state.containers[1], kind: "grid", lifecycle: "removed" },
    ];
    rejected(f, "removed-container");
  });
  it("full grids, mass limits and invalid rotations leave item/revisions/receipts untouched", () => {
    for (const scenario of ["full", "mass", "outside"]) {
      const f = fixture();
      if (scenario === "full")
        f.state.items = [
          ...f.state.items,
          { ...f.state.items[0], id: "blocker", containerId: "cargo" },
        ];
      if (scenario === "mass")
        f.state.containers = [
          f.state.containers[0],
          { ...f.state.containers[1], maxMassKg: 1 },
        ];
      if (scenario === "outside") f.request = { ...f.request, x: 4 };
      rejected(f, "inventory-invalid");
    }
  });
  it("reuses carried weight validation when taking a world item", () => {
    const f = fixture();
    f.state.items = [{ ...f.state.items[0], containerId: "cargo" }];
    f.state.character.carryLimitKg = 1;
    f.request = {
      ...f.request,
      sourceContainerId: "cargo",
      destinationContainerId: "pockets",
    };
    rejected(f, "inventory-invalid");
  });
  it("nested bag transfers preserve descendant UUIDs and revise nested access plus both ancestors", () => {
    const f = fixture();
    f.state.items = [
      { ...f.state.items[0], id: "bag", definitionId: "bag" },
      { ...f.state.items[0], containerId: "bag-grid" },
    ];
    f.state.containers = [
      ...f.state.containers,
      { ...container("bag-grid"), parentItemId: "bag", scope: undefined },
    ];
    f.request = { ...f.request, itemId: "bag" };
    const p = passed(plan(f));
    expect(p.movedItemIds).toEqual(["bag", "item"]);
    expect(p.movedContainerIds).toEqual(["bag-grid"]);
    expect(p.containerUpdates.map((c) => c.id)).toEqual([
      "pockets",
      "cargo",
      "bag-grid",
    ]);
    const next = commit(f.state, p);
    expect(next.items.find((i) => i.id === "item")!.containerId).toBe(
      "bag-grid",
    );
    f.request = { ...f.request, destinationContainerId: "bag-grid" };
    rejected(f, "inventory-invalid");
  });
  it("same-container reposition advances that revision once", () => {
    const f = fixture();
    f.request = { ...f.request, destinationContainerId: "pockets", x: 1 };
    const p = passed(plan(f));
    expect(p.containerUpdates.map((c) => c.id)).toEqual(["pockets"]);
  });
  it("stows an owned equipped weapon without creating a replacement UUID", () => {
    const f = fixture();
    f.state.items = [
      {
        ...f.state.items[0],
        definitionId: "gun",
        containerId: "",
        equipmentSlot: "hand",
        equippedByCharacterId: "alice",
      },
    ];
    const p = passed(plan(f));
    expect(p.itemUpdates[0]).toMatchObject({
      id: "item",
      containerId: "cargo",
      equipmentSlot: "",
    });
    f.state.items = [{ ...f.state.items[0], equippedByCharacterId: "bob" }];
    rejected(f, "wrong-owner");
  });
  it("rejects malformed definitions and excessive complete working sets instead of truncating", () => {
    const f = fixture();
    const result = planScopedInventoryTransfer(
      f.state,
      f.request,
      f.access,
      [{ ...definitions[0], massKg: NaN }],
      { water: 1 },
    );
    expect(result).toMatchObject({
      ok: false,
      error: { code: "invalid-state" },
    });
    f.state.items = Array.from({ length: 129 }, (_, i) => ({
      ...f.state.items[0],
      id: String(i),
    }));
    rejected(f, "budget");
  });
});

it("two granted actors serialize deposits on the shared container without sharing carried inventory", () => {
  const a = fixture(),
    initial = structuredClone(a.state);
  a.state = commit(a.state, passed(plan(a)));
  const b = fixture();
  b.access.actorId = "bob";
  b.access.grants = [{ ...b.access.grants[0], actorId: "bob" }];
  b.state = {
    character: {
      ...initial.character,
      characterId: "bob",
      pocketsId: "bob-pockets",
    },
    receipts: [],
    containers: [
      {
        ...container("bob-pockets"),
        scope: { kind: "character", characterId: "bob" },
      },
      a.state.containers.find((c) => c.id === "cargo")!,
    ],
    items: [
      a.state.items[0],
      { ...initial.items[0], id: "bob-item", containerId: "bob-pockets" },
    ],
  };
  b.request = {
    ...b.request,
    operationId: "bob-deposit",
    itemId: "bob-item",
    sourceContainerId: "bob-pockets",
  };
  rejected(b, "revision-conflict");
  b.request.expectedDestinationRevision = 2n;
  rejected(b, "inventory-invalid");
  b.request.x = 1;
  const next = passed(plan(b));
  expect(next.containerUpdates.find((c) => c.id === "cargo")!.revision).toBe(
    3n,
  );
  expect(next.itemUpdates[0]).toMatchObject({
    id: "bob-item",
    containerId: "cargo",
  });
  expect(next.characterUpdate?.characterId).toBe("bob");
  expect(a.state.character.characterId).toBe("alice");
  expect(a.state.items[0].id).toBe("item");
});

it("world withdrawals by a second actor lose a stale race before any data is changed", () => {
  const a = fixture();
  a.state.items = [{ ...a.state.items[0], containerId: "cargo" }];
  a.request = {
    ...a.request,
    sourceContainerId: "cargo",
    destinationContainerId: "pockets",
  };
  a.state = commit(a.state, passed(plan(a)));
  const b = fixture();
  b.access.actorId = "bob";
  b.access.grants = [{ ...b.access.grants[0], actorId: "bob" }];
  b.state = {
    ...b.state,
    character: { ...b.state.character, characterId: "bob" },
    items: [],
    containers: [
      {
        ...container("pockets"),
        scope: { kind: "character", characterId: "bob" },
      },
      a.state.containers.find((c) => c.id === "cargo")!,
    ],
  };
  b.request = {
    ...b.request,
    sourceContainerId: "cargo",
    destinationContainerId: "pockets",
  };
  rejected(b, "revision-conflict");
  expect(a.state.items[0].containerId).toBe("pockets");
});
