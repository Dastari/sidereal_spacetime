import { beforeEach, describe, expect, test, vi } from "vitest";
import { Identity } from "spacetimedb";
vi.mock("spacetimedb/server", () => {
  const chain: any = new Proxy({}, { get: () => () => chain });
  return {
    SenderError: class extends Error {},
    Range: class {},
    table: () => ({}),
    t: new Proxy({}, { get: () => () => chain }),
  };
});
import { commitPin, itemDefinitions } from "./item-definitions";
import { resyncItemDefinitions } from "./item-definition-resync";
import { SHIP_OPERATOR } from "./ship-operator";
import { inventoryDefinition } from "@sidereal/content/inventory";
import { LAB_WEAPONS } from "@sidereal/content/weapons";

type Row = Record<string, any>;
function fakeTable(pk: string, indexes: Record<string, string> = {}) {
  const rows = new Map<string, Row>();
  const k = (v: unknown) =>
    typeof v === "object" && v && "toHexString" in (v as object)
      ? (v as Identity).toHexString()
      : String(v);
  const t: Row = {
    rows,
    iter: () => rows.values(),
    insert(row: Row) {
      if (rows.has(k(row[pk]))) throw Error("duplicate " + row[pk]);
      rows.set(k(row[pk]), { ...row });
    },
    [pk]: {
      find: (v: unknown) => rows.get(k(v)) ?? null,
      update(row: Row) {
        rows.set(k(row[pk]), { ...row });
      },
      delete: (v: unknown) => rows.delete(k(v)),
    },
  };
  for (const [accessor, column] of Object.entries(indexes))
    t[accessor] = {
      filter: (v: unknown) =>
        [...rows.values()].filter((r) => k(r[column]) === k(v)),
    };
  return t;
}
const operator = Identity.fromString(SHIP_OPERATOR);
const player = Identity.fromString("a".repeat(64));
let db: Row;
beforeEach(() => {
  db = {
    contentDefinition: fakeTable("definitionRef", {
      by_kind: "kind",
      by_key: "definitionKey",
    }),
    contentDefinitionHead: fakeTable("definitionKey", { by_kind: "kind" }),
    inventoryItemPin: fakeTable("itemId"),
    inventoryItem: fakeTable("id", { by_character: "characterId" }),
    inventoryContainer: fakeTable("id", { by_character: "characterId" }),
    inventoryItemMembership: fakeTable("itemId", {
      by_root: "rootContainerId",
    }),
    inventoryContainerScope: fakeTable("containerId", {
      by_root: "rootContainerId",
    }),
    weaponEnergy: fakeTable("itemId"),
    shipOperatorOperation: fakeTable("operationId"),
    character: fakeTable("id", { by_owner: "owner" }),
  };
});
const ctx = (sender = operator) =>
  ({
    db,
    sender,
    timestamp: { microsSinceUnixEpoch: 5_000_000n },
  }) as any;
function publish(
  kind: "item" | "weapon",
  definitionId: string,
  revision: bigint,
  payload: object,
  status = "published",
) {
  db.contentDefinition.insert({
    definitionRef: `${kind}:${definitionId}@${revision}`,
    definitionKey: `${kind}:${definitionId}`,
    kind,
    definitionId,
    revision,
    status,
    payloadJson: JSON.stringify(payload),
    sha256: JSON.stringify(payload),
  });
  const key = `${kind}:${definitionId}`;
  const all = db.contentDefinition.by_key.filter(key);
  db.contentDefinitionHead.definitionKey.update({
    definitionKey: key,
    kind,
    definitionId,
    latestRevision: all.reduce(
      (m: bigint, r: Row) => (r.revision > m ? r.revision : m),
      0n,
    ),
    currentRevision: all
      .filter((r: Row) => r.status === "published")
      .reduce((m: bigint, r: Row) => (r.revision > m ? r.revision : m), 0n),
  });
}
const pistol = inventoryDefinition("pistol");
/** A character with 6x3 pockets holding one pistol that predates X-2 (no pin row). */
function character() {
  db.character.insert({ id: "c1", owner: player });
  db.inventoryContainer.insert({
    id: "pockets",
    characterId: "c1",
    parentItemId: "",
    kind: "grid",
    name: "Pockets",
    width: 6,
    height: 3,
    maxMassKg: 30,
    capacityLitres: 0,
    amountLitres: 0,
    liquidType: "",
    carried: true,
  });
  db.inventoryItem.insert({
    id: "old-pistol",
    characterId: "c1",
    definitionId: "pistol",
    containerId: "pockets",
    equipmentSlot: "",
    x: 0,
    y: 0,
    rotated: false,
  });
}

describe("pinned definitions", () => {
  test("instances without a pin resolve to the seed; new instances pin the current revision", () => {
    publish("item", "pistol", 1n, pistol);
    publish("item", "pistol", 2n, { ...pistol, name: "Service pistol" });
    publish("weapon", "pistol", 1n, LAB_WEAPONS.pistol);
    publish("weapon", "pistol", 2n, { ...LAB_WEAPONS.pistol, damage: 40 });
    const defs = itemDefinitions(ctx());
    const old = { id: "old", definitionId: "pistol" };
    expect(defs.pin(old)).toEqual({ itemRevision: 1n, weaponRevision: 1n });
    expect(defs.item(old).name).toBe(pistol.name);
    expect(defs.weapon(old)?.damage).toBe(LAB_WEAPONS.pistol.damage);
    expect(defs.stage("new", "pistol").name).toBe("Service pistol");
    expect(defs.weapon({ id: "new", definitionId: "pistol" })?.damage).toBe(40);
    commitPin(ctx(), defs, "new");
    expect(db.inventoryItemPin.itemId.find("new")).toMatchObject({
      definitionId: "pistol",
      itemRevision: 2n,
      weaponRevision: 2n,
      source: "created",
    });
    // A fresh resolver reads the committed pin.
    expect(
      itemDefinitions(ctx()).item({ id: "new", definitionId: "pistol" }).name,
    ).toBe("Service pistol");
  });

  test("without registry rows everything is the code catalogue (seedless database)", () => {
    const defs = itemDefinitions(ctx());
    expect(defs.stage("x", "medkit")).toEqual(inventoryDefinition("medkit"));
    expect(defs.pin({ id: "x", definitionId: "medkit" })).toMatchObject({
      itemRevision: 1n,
      weaponRevision: 0n,
    });
    expect(() => defs.stage("y", "no-such-item")).toThrow(/Unknown item/);
  });

  test("a definition whose every revision is retired cannot be instantiated", () => {
    publish("item", "pistol", 1n, pistol, "retired");
    expect(() => itemDefinitions(ctx()).stage("n", "pistol")).toThrow(
      /all retired/,
    );
    // Existing instances keep resolving their retired pin.
    expect(
      itemDefinitions(ctx()).item({ id: "o", definitionId: "pistol" }).name,
    ).toBe(pistol.name);
  });
});

describe("operator resync", () => {
  beforeEach(() => {
    character();
    publish("item", "pistol", 1n, pistol);
    publish("item", "pistol", 2n, { ...pistol, massKg: 2 });
    publish("item", "pistol", 3n, { ...pistol, width: 7 });
    publish("weapon", "pistol", 1n, LAB_WEAPONS.pistol);
    publish("weapon", "pistol", 2n, { ...LAB_WEAPONS.pistol, capacity: 50 });
  });
  const resync = (
    operationId: string,
    itemRevision: bigint,
    weaponRevision: bigint,
    dryRun: boolean,
    sender = operator,
  ) =>
    resyncItemDefinitions(ctx(sender), {
      operationId,
      definitionId: "pistol",
      itemRevision,
      weaponRevision,
      itemIdsJson: '"*"',
      dryRun,
    });
  const summary = (op: string) =>
    JSON.parse(db.shipOperatorOperation.operationId.find(op).summaryJson);

  test("dry run, apply, replay; energy clamps to a smaller capacity", () => {
    db.weaponEnergy.insert({ itemId: "old-pistol", energy: 90, revision: 4n });
    expect(() => resync("resync-player-1", 2n, 2n, false, player)).toThrow(
      /Deployment operator/,
    );
    resync("resync-dry-0001", 2n, 2n, true);
    expect(summary("resync-dry-0001")).toMatchObject({
      changed: 1,
      blockedCount: 0,
      items: [{ itemId: "old-pistol", from: { item: "1", weapon: "1" } }],
    });
    expect(db.inventoryItemPin.itemId.find("old-pistol")).toBeNull();
    resync("resync-apply-01", 2n, 2n, false);
    resync("resync-apply-01", 2n, 2n, false); // exact replay
    expect(() => resync("resync-apply-01", 1n, 1n, false)).toThrow(/different/);
    expect(db.inventoryItemPin.itemId.find("old-pistol")).toMatchObject({
      itemRevision: 2n,
      weaponRevision: 2n,
      source: "resync:resync-apply-01",
    });
    expect(db.weaponEnergy.itemId.find("old-pistol")).toMatchObject({
      energy: 50,
      revision: 5n,
    });
    // Nothing left to change.
    resync("resync-again-01", 2n, 2n, true);
    expect(summary("resync-again-01")).toMatchObject({
      changed: 0,
      unchanged: 1,
    });
  });

  test("a revision that no longer fits is reported and refused atomically", () => {
    resync("resync-dry-0003", 3n, 1n, true);
    expect(summary("resync-dry-0003").blocked[0]).toMatchObject({
      itemId: "old-pistol",
      reason: expect.stringMatching(/outside the container/),
    });
    expect(() => resync("resync-apply-03", 3n, 1n, false)).toThrow(
      /would become invalid/,
    );
    expect(db.inventoryItemPin.itemId.find("old-pistol")).toBeNull();
  });

  test("targets must be published and weapons keep weapon rules", () => {
    publish("item", "pistol", 4n, pistol, "retired");
    expect(() => resync("resync-retired", 4n, 1n, true)).toThrow(/retired/);
    expect(() => resync("resync-missing", 9n, 1n, true)).toThrow(
      /does not exist/,
    );
    expect(() => resync("resync-noweapon", 2n, 0n, true)).toThrow(
      /is a weapon/,
    );
  });
});
