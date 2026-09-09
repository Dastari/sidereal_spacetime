import { describe, expect, it } from "vitest";
import {
  resolveCargoAccess,
  inspectScopedCargo,
  transferScopedCargo,
  qualifyCargoAccessPoint,
  type CargoRepository,
  type CargoActor,
  type CargoVisit,
  type CargoGrant,
  type AcceptedCrewVisit,
} from "./scoped-inventory";
import type {
  ScopedContainer,
  ScopedItem,
  ScopedCharacterInventory,
  ScopedTransferRequest,
  TransferReceipt,
} from "@sidereal/sim/scoped-inventory";
import type { DeckCollisionFrame } from "@sidereal/sim/construction-collision";

function fixture() {
  const containers = new Map<string, ScopedContainer>();
  const items = new Map<string, ScopedItem>();
  const characters = new Map<string, ScopedCharacterInventory>();
  const roots = new Map<string, string>();
  const itemRoots = new Map<string, string>();
  const receipts = new Map<string, TransferReceipt>();
  const actors = new Map<string, CargoActor>();
  const visits = new Map<string, CargoVisit>();
  const entries = new Map<string, AcceptedCrewVisit>();
  const grants: CargoGrant[] = [];
  const writes: string[] = [];
  const hotbar = new Map<string, string[]>([["alice", ["alice-item"]]]);
  const energy = new Map([["alice-item", { energy: 97, shotSequence: 5n }]]);
  const frame: DeckCollisionFrame = {
    shipId: "instance",
    deckId: "lower",
    fingerprint: "qualified",
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
  };
  function addContainer(id: string, actor?: string) {
    containers.set(id, {
      id,
      parentItemId: "",
      kind: "grid",
      width: 4,
      height: 4,
      maxMassKg: 40,
      capacityLitres: 0,
      amountLitres: 0,
      liquidType: "",
      revision: 1n,
      lifecycle: "active",
      scope: actor
        ? { kind: "character", characterId: actor }
        : {
            kind: "instance",
            instanceId: "instance",
            deckId: "lower",
            placedObjectId: "placed-crate",
            instanceRevision: 1n,
            accessPointM: [1, 0, 0],
          },
    });
    roots.set(id, id);
  }
  for (const id of ["alice", "bob"]) {
    const pocketsId = `${id}-pockets`,
      itemId = `${id}-item`;
    addContainer(pocketsId, id);
    characters.set(id, {
      characterId: id,
      pocketsId,
      revision: 1n,
      carryLimitKg: 40,
    });
    actors.set(id, {
      id,
      principal: id,
      admitted: true,
      connected: true,
      shipId: "old-ship",
      localX: 0,
      localY: 0,
      supportedHeightM: 0,
      supportedStanding: true,
    });
    items.set(itemId, {
      id: itemId,
      definitionId: "kit",
      containerId: pocketsId,
      equipmentSlot: "",
      x: 0,
      y: 0,
      rotated: false,
      revision: 1n,
    });
    itemRoots.set(itemId, pocketsId);
  }
  addContainer("cargo");
  const invitations = new Set<string>();
  /** Explicit synthetic allowed-entry authority, not inventory access. This
   * models a separate future crew-entry adapter; no production boarding claim. */
  function enter(actorId: string) {
    if (actorId !== "alice" && !invitations.has(actorId))
      throw Error("Entry denied");
    const actor = actors.get(actorId)!;
    actor.shipId = "instance";
    visits.set(actorId, {
      characterId: actorId,
      visitId: `visit-${actorId}`,
      instanceId: "instance",
      deckId: "lower",
    });
    if (actorId !== "alice")
      entries.set(`visit-${actorId}`, {
        visitId: `visit-${actorId}`,
        characterId: actorId,
        instanceId: "instance",
        expiresMicros: 1000n,
        revoked: false,
      });
  }
  grants.push({
    principal: "alice",
    resourceId: "workspace",
    capability: "instance.spawn",
    expiresMicros: 1000n,
    revoked: false,
  });
  enter("alice");
  const repo: CargoRepository = {
    principal: "alice",
    nowMicros: 10n,
    actor: () => actors.get(repo.principal),
    visit: (id) => visits.get(id),
    instance: (id) =>
      id === "instance"
        ? {
            id,
            ownerPrincipal: "alice",
            workspaceId: "workspace",
            revision: 1n,
          }
        : undefined,
    grants: (principal) => grants.filter((g) => g.principal === principal),
    acceptedCrewVisit: (id) => entries.get(id),
    geometry: () => ({ instanceRevision: 1n, frame }),
    characterInventory: (id) => characters.get(id),
    rootForContainer: (id) => roots.get(id),
    containersForRoot: (root) =>
      [...containers.values()].filter((c) => roots.get(c.id) === root),
    itemsForRoot: (root) =>
      [...items.values()].filter((i) => itemRoots.get(i.id) === root),
    receipt: (id, op) => receipts.get(JSON.stringify([id, op])),
    definitions: [{ id: "kit", width: 1, height: 1, massKg: 2 }],
    liquidDensity: { water: 1 },
    writeItem: (item) => {
      writes.push(`item:${item.id}`);
      items.set(item.id, item);
    },
    writeContainer: (c) => {
      writes.push(`container:${c.id}`);
      containers.set(c.id, c);
    },
    writeCharacter: (c) => {
      writes.push(`character:${c.characterId}`);
      characters.set(c.characterId, c);
    },
    writeRootMembership: (ids, cs, root) => {
      writes.push("membership");
      for (const id of ids) itemRoots.set(id, root);
      for (const id of cs) roots.set(id, root);
    },
    clearHotbar: (actorId, ids) => {
      writes.push("hotbar");
      hotbar.set(
        actorId,
        (hotbar.get(actorId) ?? []).filter((id) => !ids.includes(id)),
      );
    },
    clearAim: () => {
      writes.push("aim");
    },
    insertReceipt: (receipt) => {
      writes.push("receipt");
      receipts.set(
        JSON.stringify([receipt.actorId, receipt.operationId]),
        receipt,
      );
    },
  };
  function request(
    actorId = "alice",
    changes: Partial<ScopedTransferRequest> = {},
  ): ScopedTransferRequest {
    return {
      operationId: `move-${actorId}`,
      itemId: `${actorId}-item`,
      expectedItemRevision: 1n,
      sourceContainerId: `${actorId}-pockets`,
      expectedSourceRevision: 1n,
      destinationContainerId: "cargo",
      expectedDestinationRevision: 1n,
      expectedCharacterRevision: 1n,
      x: 0,
      y: 0,
      rotated: false,
      ...changes,
    };
  }
  return {
    repo,
    request,
    containers,
    items,
    characters,
    roots,
    itemRoots,
    receipts,
    actors,
    visits,
    entries,
    grants,
    invitations,
    enter,
    writes,
    hotbar,
    energy,
    frame,
  };
}

describe("unregistered scoped cargo authority adapter", () => {
  it("preserves existing UUID/resources and clears hotbar on an atomic world transfer", () => {
    const f = fixture();
    expect(transferScopedCargo(f.repo, f.request())).toMatchObject({
      ok: true,
      replay: false,
    });
    expect(f.items.get("alice-item")).toMatchObject({
      id: "alice-item",
      containerId: "cargo",
      revision: 2n,
    });
    expect(f.containers.get("cargo")?.revision).toBe(2n);
    expect(f.characters.get("alice")?.revision).toBe(2n);
    expect(f.itemRoots.get("alice-item")).toBe("cargo");
    expect(f.hotbar.get("alice")).toEqual([]);
    expect(f.energy.get("alice-item")).toEqual({
      energy: 97,
      shotSequence: 5n,
    });
    expect(f.writes.at(-1)).toBe("receipt");
  });
  it("replays with zero writes but denies replay after permission loss", () => {
    const f = fixture();
    transferScopedCargo(f.repo, f.request());
    f.writes.length = 0;
    expect(transferScopedCargo(f.repo, f.request())).toMatchObject({
      ok: true,
      replay: true,
    });
    expect(f.writes).toEqual([]);
    f.grants[0].revoked = true;
    expect(transferScopedCargo(f.repo, f.request())).toMatchObject({
      ok: false,
      error: { code: "grant-denied" },
    });
    expect(f.writes).toEqual([]);
  });
  it("inventory grants neither admit nor relocate a second actor", () => {
    const f = fixture();
    f.repo.principal = "bob";
    f.grants.push({
      principal: "bob",
      resourceId: "instance",
      capability: "inventory.transfer",
      expiresMicros: 1000n,
      revoked: false,
    });
    expect(() => f.enter("bob")).toThrow("Entry denied");
    expect(transferScopedCargo(f.repo, f.request("bob"))).toMatchObject({
      ok: false,
      error: { code: "wrong-instance" },
    });
    expect(f.actors.get("bob")?.shipId).toBe("old-ship");
    expect(f.visits.has("bob")).toBe(false);
    expect(f.writes).toEqual([]);
  });
  it("serializes two explicitly admitted actors depositing into the same physical container", () => {
    const f = fixture();
    f.invitations.add("bob");
    f.enter("bob");
    f.grants.push({
      principal: "bob",
      resourceId: "instance",
      capability: "inventory.transfer",
      expiresMicros: 1000n,
      revoked: false,
    });
    expect(transferScopedCargo(f.repo, f.request())).toMatchObject({
      ok: true,
    });
    f.repo.principal = "bob";
    f.writes.length = 0;
    expect(transferScopedCargo(f.repo, f.request("bob"))).toMatchObject({
      ok: false,
      error: { code: "revision-conflict" },
    });
    expect(f.writes).toEqual([]);
    expect(
      transferScopedCargo(
        f.repo,
        f.request("bob", { expectedDestinationRevision: 2n, x: 1 }),
      ),
    ).toMatchObject({ ok: true });
    expect(f.containers.get("cargo")?.revision).toBe(3n);
    expect(f.items.get("alice-item")?.containerId).toBe("cargo");
    expect(f.items.get("bob-item")?.containerId).toBe("cargo");
    f.entries.get("visit-bob")!.revoked = true;
    expect(resolveCargoAccess(f.repo)).toMatchObject({
      ok: false,
      error: { code: "grant-denied" },
    });
  });
  it("rejects replayed crew proof belonging to another visit/actor", () => {
    const f = fixture();
    f.invitations.add("bob");
    f.enter("bob");
    f.repo.principal = "bob";
    f.grants.push({
      principal: "bob",
      resourceId: "instance",
      capability: "inventory.transfer",
      expiresMicros: 1000n,
      revoked: false,
    });
    f.entries.get("visit-bob")!.characterId = "alice";
    expect(resolveCargoAccess(f.repo)).toMatchObject({
      ok: false,
      error: { code: "grant-denied" },
    });
  });
  it("requires exact accepted deck, support, current geometry and standing state", () => {
    const f = fixture();
    f.visits.get("alice")!.deckId = "upper";
    expect(resolveCargoAccess(f.repo)).toMatchObject({
      ok: false,
      error: { code: "geometry-stale" },
    });
    f.visits.get("alice")!.deckId = "lower";
    f.actors.get("alice")!.supportedHeightM = 3;
    expect(resolveCargoAccess(f.repo)).toMatchObject({
      ok: false,
      error: { code: "unsupported-pose" },
    });
    f.actors.get("alice")!.supportedHeightM = 0;
    f.actors.get("alice")!.supportedStanding = false;
    expect(resolveCargoAccess(f.repo)).toMatchObject({
      ok: false,
      error: { code: "unsupported-pose" },
    });
  });
  it("qualifies approach points outside solid object footprints and rejects stale instance bindings", () => {
    const f = fixture(),
      cargo = f.containers.get("cargo")!;
    if (cargo.scope?.kind !== "instance") throw Error("fixture");
    const geometry = { instanceRevision: 1n, frame: f.frame };
    expect(qualifyCargoAccessPoint(cargo.scope, geometry)).toBe(true);
    f.frame.obstacles = [
      {
        id: "cargo-mesh",
        definitionId: "crate",
        vertices: [
          [0.8, -0.2],
          [1.2, -0.2],
          [1.2, 0.2],
          [0.8, 0.2],
        ],
      },
    ];
    expect(qualifyCargoAccessPoint(cargo.scope, geometry)).toBe(false);
    expect(transferScopedCargo(f.repo, f.request())).toMatchObject({
      ok: false,
      error: { code: "geometry-stale" },
    });
    expect(f.writes).toEqual([]);
    f.frame.obstacles = [];
    cargo.scope.instanceRevision = 2n;
    expect(qualifyCargoAccessPoint(cargo.scope, geometry)).toBe(false);
  });
  it("rechecks range and occlusion without accepting coordinates in transfer args", () => {
    const f = fixture();
    f.actors.get("alice")!.localX = -2;
    expect(transferScopedCargo(f.repo, f.request())).toMatchObject({
      ok: false,
      error: { code: "out-of-reach" },
    });
    f.actors.get("alice")!.localX = 0;
    f.frame.segments = [
      { id: "wall", a: [0.5, -2], b: [0.5, 2], halfWidthM: 0.05 },
    ];
    expect(transferScopedCargo(f.repo, f.request())).toMatchObject({
      ok: false,
      error: { code: "line-of-sight" },
    });
    expect(f.writes).toEqual([]);
  });
  it("rejects unbounded indexed reads rather than truncating", () => {
    const f = fixture();
    let reads = 0;
    f.repo.itemsForRoot = function* () {
      for (let i = 0; i < 10000; i++) {
        reads++;
        yield { ...f.items.get("alice-item")!, id: `item-${i}` };
      }
    };
    expect(transferScopedCargo(f.repo, f.request())).toMatchObject({
      ok: false,
      error: { code: "budget" },
    });
    expect(reads).toBe(129);
    expect(f.writes).toEqual([]);
  });
  it("lets storage failures escape so enclosing reducer transaction rolls back everything", () => {
    const f = fixture();
    const original = structuredClone({
      items: f.items,
      containers: f.containers,
      characters: f.characters,
      roots: f.roots,
      itemRoots: f.itemRoots,
      receipts: f.receipts,
      hotbar: f.hotbar,
    });
    f.repo.insertReceipt = () => {
      throw Error("storage failed");
    };
    // Test transaction emulator; production rollback belongs to SpacetimeDB,
    // never a catch-and-continue inside the authority adapter.
    function atomicTestTransaction() {
      try {
        return transferScopedCargo(f.repo, f.request());
      } catch (e) {
        for (const key of [
          "items",
          "containers",
          "characters",
          "roots",
          "itemRoots",
          "receipts",
          "hotbar",
        ] as const) {
          (f[key] as Map<unknown, unknown>).clear();
          for (const [id, row] of original[key])
            (f[key] as Map<unknown, unknown>).set(id, row);
        }
        throw e;
      }
    }
    expect(atomicTestTransaction).toThrow("storage failed");
    expect(f.items).toEqual(original.items);
    expect(f.containers).toEqual(original.containers);
    expect(f.characters).toEqual(original.characters);
    expect(f.hotbar).toEqual(original.hotbar);
    expect(f.receipts.size).toBe(0);
  });
  it("projects only keyed reachable contents and removes them on grant/range/LOS loss", () => {
    const f = fixture();
    transferScopedCargo(f.repo, f.request());
    f.writes.length = 0;
    const visible = inspectScopedCargo(f.repo, "cargo");
    expect(visible.items).toEqual([
      {
        id: "alice-item",
        definitionId: "kit",
        containerId: "cargo",
        x: 0,
        y: 0,
        rotated: false,
        revision: 2n,
      },
    ]);
    expect(Object.keys(visible.containers[0]).sort()).toEqual(
      [
        "id",
        "parentItemId",
        "kind",
        "width",
        "height",
        "maxMassKg",
        "revision",
      ].sort(),
    );
    expect(inspectScopedCargo(f.repo, "bob-pockets").items).toEqual([]);
    f.actors.get("alice")!.localX = -3;
    expect(inspectScopedCargo(f.repo, "cargo")).toEqual({
      containers: [],
      items: [],
    });
    f.actors.get("alice")!.localX = 0;
    f.frame.segments = [
      { id: "door", a: [0.5, -2], b: [0.5, 2], halfWidthM: 0.05 },
    ];
    expect(inspectScopedCargo(f.repo, "cargo").items).toEqual([]);
    f.frame.segments = [];
    f.grants[0].revoked = true;
    expect(inspectScopedCargo(f.repo, "cargo").items).toEqual([]);
    expect(f.writes).toEqual([]);
  });
  it("fails closed on mixed or incomplete root membership during migration", () => {
    const f = fixture();
    transferScopedCargo(f.repo, f.request());
    const original = f.repo.itemsForRoot;
    f.repo.itemsForRoot = (root) => [
      ...original(root),
      f.items.get("bob-item")!,
    ];
    expect(inspectScopedCargo(f.repo, "cargo")).toEqual({
      containers: [],
      items: [],
    });
    f.repo.itemsForRoot = original;
    f.items.get("alice-item")!.equipmentSlot = "hand";
    expect(inspectScopedCargo(f.repo, "cargo")).toEqual({
      containers: [],
      items: [],
    });
  });
});
