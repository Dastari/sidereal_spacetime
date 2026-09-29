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
import {
  adminHeads,
  adminRevisions,
  adminUsage,
  discardDefinitionDraft,
  importContentSeed,
  operatorSetDefinitionGrant,
  publishDefinition,
  refreshDefinitionUsage,
  retireDefinition,
  saveDefinitionDraft,
} from "./content-definitions";
import { SHIP_OPERATOR } from "./ship-operator";
import { LAB_WEAPONS } from "@sidereal/content/weapons";
import { INVENTORY_DEFINITIONS } from "@sidereal/content/inventory";
import { validateDefinition } from "@sidereal/sim/content-definitions";

type Row = Record<string, any>;
/** Minimal in-memory SpacetimeDB table: primary key accessor plus btree filters. */
function fakeTable(pk: string, indexes: Record<string, string> = {}) {
  const rows = new Map<string, Row>();
  const keyOf = (v: unknown) =>
    typeof v === "object" && v && "toHexString" in (v as object)
      ? (v as Identity).toHexString()
      : String(v);
  const table: Row = {
    rows,
    iter: () => rows.values(),
    insert(row: Row) {
      if (rows.has(keyOf(row[pk]))) throw Error("duplicate " + row[pk]);
      rows.set(keyOf(row[pk]), { ...row });
    },
    [pk]: {
      find: (k: unknown) => rows.get(keyOf(k)) ?? null,
      update(row: Row) {
        if (!rows.has(keyOf(row[pk]))) throw Error("missing " + row[pk]);
        rows.set(keyOf(row[pk]), { ...row });
      },
      delete: (k: unknown) => rows.delete(keyOf(k)),
    },
  };
  for (const [accessor, column] of Object.entries(indexes))
    table[accessor] = {
      filter: (v: unknown) =>
        [...rows.values()].filter((r) => keyOf(r[column]) === keyOf(v)),
    };
  return table;
}
const alice = Identity.fromString("a".repeat(64));
const bob = Identity.fromString("b".repeat(64));
const operator = Identity.fromString(SHIP_OPERATOR);
let db: Row;
let now = 1_000_000n;
beforeEach(() => {
  now = 1_000_000n;
  db = {
    constructionGrant: fakeTable("id", { by_principal: "principal" }),
    contentDefinitionHead: fakeTable("definitionKey", { by_kind: "kind" }),
    contentDefinition: fakeTable("definitionRef", {
      by_kind: "kind",
      by_key: "definitionKey",
    }),
    contentDefinitionReceipt: fakeTable("id", { by_principal: "principal" }),
    contentDefinitionUsage: fakeTable("definitionKey", { by_kind: "kind" }),
    shipOperatorOperation: fakeTable("operationId"),
    inventoryItem: fakeTable("id"),
  };
});
const ctx = (sender: Identity) =>
  ({
    db,
    sender,
    timestamp: { microsSinceUnixEpoch: (now += 1000n) },
  }) as any;
let opSeq = 0;
const op = () => `op-${++opSeq}`;
const forever = 18446744073709551615n;
function grant(who: Identity, kind: string, capability: string) {
  operatorSetDefinitionGrant(ctx(operator), {
    operationId: op() + "-grant",
    principal: who.toHexString(),
    kind,
    capability,
    expiresMicros: forever,
    revoked: false,
  });
}
const head = (key: string) => db.contentDefinitionHead.definitionKey.find(key);
const pistol = () => ({ ...LAB_WEAPONS.pistol });

describe("operator seed import", () => {
  test("is operator-only, idempotent and reproduces the catalogues", () => {
    expect(() =>
      importContentSeed(ctx(alice), {
        operationId: "seed-alice-1",
        kind: "item",
        dryRun: false,
      }),
    ).toThrow(/Deployment operator/);
    importContentSeed(ctx(operator), {
      operationId: "seed-dry-1",
      kind: "weapon",
      dryRun: true,
    });
    expect(db.contentDefinition.rows.size).toBe(0);
    importContentSeed(ctx(operator), {
      operationId: "seed-apply-1",
      kind: "weapon",
      dryRun: false,
    });
    importContentSeed(ctx(operator), {
      operationId: "seed-apply-1",
      kind: "weapon",
      dryRun: false,
    });
    importContentSeed(ctx(operator), {
      operationId: "seed-apply-2",
      kind: "weapon",
      dryRun: false,
    });
    const weapons = Object.keys(LAB_WEAPONS);
    expect(db.contentDefinition.rows.size).toBe(weapons.length);
    const summaries = [...db.shipOperatorOperation.rows.values()].map((r) =>
      JSON.parse(r.summaryJson),
    );
    expect(summaries.map((s) => [s.dryRun, s.created, s.unchanged])).toEqual([
      [true, weapons.length, 0],
      [false, weapons.length, 0],
      [false, 0, weapons.length],
    ]);
    for (const id of weapons) {
      const row = db.contentDefinition.definitionRef.find(`weapon:${id}@1`);
      expect(JSON.parse(row.payloadJson)).toEqual(LAB_WEAPONS[id]);
      expect(row.source).toBe("seed:content-seed-v1");
      expect(head(`weapon:${id}`)).toMatchObject({
        latestRevision: 1n,
        currentRevision: 1n,
      });
    }
    importContentSeed(ctx(operator), {
      operationId: "seed-items",
      kind: "item",
      dryRun: false,
    });
    expect(db.contentDefinition.by_kind.filter("item")).toHaveLength(
      INVENTORY_DEFINITIONS.length,
    );
    expect(() =>
      importContentSeed(ctx(operator), {
        operationId: "seed-market",
        kind: "market",
        dryRun: false,
      }),
    ).toThrow(/No seed/);
  });
});

describe("draft, publish, retire", () => {
  beforeEach(() => {
    importContentSeed(ctx(operator), {
      operationId: "seed-weapons-1",
      kind: "weapon",
      dryRun: false,
    });
    grant(alice, "weapon", "definition.write");
    grant(alice, "weapon", "definition.publish");
  });
  const save = (
    payload: unknown,
    expectedRevision: bigint,
    operationId = op(),
    who = alice,
  ) =>
    saveDefinitionDraft(ctx(who), {
      kind: "weapon",
      definitionId: "pistol",
      payloadJson: JSON.stringify(payload),
      expectedRevision,
      operationId,
    });

  test("a draft never changes the published revision", () => {
    save({ ...pistol(), damage: 18 }, 1n);
    const h = head("weapon:pistol");
    expect(h.revision).toBe(2n);
    expect(h.currentRevision).toBe(1n);
    expect(JSON.parse(h.draftJson).damage).toBe(18);
    expect(db.contentDefinition.by_key.filter("weapon:pistol")).toHaveLength(1);
    expect(
      JSON.parse(
        db.contentDefinition.definitionRef.find("weapon:pistol@1").payloadJson,
      ).damage,
    ).toBe(15);
  });

  test("publish creates an immutable revision; stale and replayed operations", () => {
    save({ ...pistol(), damage: 18 }, 1n);
    const draft = head("weapon:pistol");
    const publish = (
      expectedRevision: bigint,
      operationId: string,
      sha = draft.draftSha256,
    ) =>
      publishDefinition(ctx(alice), {
        kind: "weapon",
        definitionId: "pistol",
        expectedRevision,
        expectedDraftSha256: sha,
        operationId,
      });
    expect(() => publish(1n, "stale-publish")).toThrow(/revision conflict/);
    expect(() => publish(2n, "wrong-sha", "0".repeat(64))).toThrow(
      /draft changed/,
    );
    publish(2n, "publish-1");
    publish(2n, "publish-1"); // exact replay: no-op
    expect(() => publish(3n, "publish-1")).toThrow(/different request/);
    const r2 = db.contentDefinition.definitionRef.find("weapon:pistol@2");
    expect(r2).toMatchObject({
      status: "published",
      source: "studio",
      validator: "weapon/v1",
    });
    expect(JSON.parse(r2.payloadJson).damage).toBe(18);
    expect(head("weapon:pistol")).toMatchObject({
      revision: 3n,
      latestRevision: 2n,
      currentRevision: 2n,
      draftJson: "",
    });
    // Revision 1 is untouched (existing instances keep their pin).
    expect(
      JSON.parse(
        db.contentDefinition.definitionRef.find("weapon:pistol@1").payloadJson,
      ).damage,
    ).toBe(15);
    // Publishing an unchanged payload is refused.
    save({ ...pistol(), damage: 18 }, 3n);
    const same = head("weapon:pistol");
    expect(() => publish(4n, "publish-same", same.draftSha256)).toThrow(
      /No change/,
    );
  });

  test("invalid payloads are refused with the validator's reason", () => {
    expect(() => save({ ...pistol(), shotCost: 900 }, 1n)).toThrow(
      /shotCost: A shot cannot cost more than the capacity/,
    );
    const local = validateDefinition("weapon", "pistol", {
      ...pistol(),
      shotCost: 900,
    });
    expect(local.ok).toBe(false);
  });

  test("retire moves the current revision back and keeps the row", () => {
    save({ ...pistol(), damage: 18 }, 1n);
    publishDefinition(ctx(alice), {
      kind: "weapon",
      definitionId: "pistol",
      expectedRevision: 2n,
      expectedDraftSha256: head("weapon:pistol").draftSha256,
      operationId: "pub",
    });
    retireDefinition(ctx(alice), {
      kind: "weapon",
      definitionId: "pistol",
      revision: 2n,
      expectedRevision: 3n,
      operationId: "retire-2",
    });
    expect(
      db.contentDefinition.definitionRef.find("weapon:pistol@2").status,
    ).toBe("retired");
    expect(head("weapon:pistol")).toMatchObject({
      currentRevision: 1n,
      revision: 4n,
    });
    retireDefinition(ctx(alice), {
      kind: "weapon",
      definitionId: "pistol",
      revision: 1n,
      expectedRevision: 4n,
      operationId: "retire-1",
    });
    expect(head("weapon:pistol").currentRevision).toBe(0n);
    expect(() =>
      retireDefinition(ctx(alice), {
        kind: "weapon",
        definitionId: "pistol",
        revision: 1n,
        expectedRevision: 5n,
        operationId: "retire-again",
      }),
    ).toThrow(/already retired/);
  });

  test("discard clears a draft; a never-published definition disappears", () => {
    saveDefinitionDraft(ctx(alice), {
      kind: "weapon",
      definitionId: "new-gun",
      payloadJson: JSON.stringify(pistol()),
      expectedRevision: 0n,
      operationId: "save-new",
    });
    discardDefinitionDraft(ctx(alice), {
      kind: "weapon",
      definitionId: "new-gun",
      expectedRevision: 1n,
      operationId: "discard-new",
    });
    expect(head("weapon:new-gun")).toBeNull();
  });

  test("a grantee for one kind cannot write or publish another", () => {
    grant(bob, "item", "definition.publish");
    expect(() => save({ ...pistol(), damage: 1 }, 1n, op(), bob)).toThrow(
      /definition.write grant required for definitions:weapon/,
    );
    expect(() =>
      publishDefinition(ctx(bob), {
        kind: "weapon",
        definitionId: "pistol",
        expectedRevision: 1n,
        expectedDraftSha256: "",
        operationId: op(),
      }),
    ).toThrow(/definition.publish grant required/);
    // Write alone does not publish (separate duties).
    grant(bob, "weapon", "definition.write");
    save({ ...pistol(), damage: 2 }, 1n, op(), bob);
    expect(() =>
      publishDefinition(ctx(bob), {
        kind: "weapon",
        definitionId: "pistol",
        expectedRevision: 2n,
        expectedDraftSha256: head("weapon:pistol").draftSha256,
        operationId: op(),
      }),
    ).toThrow(/definition.publish grant required/);
  });

  test("planned kinds keep drafts but never publish", () => {
    grant(alice, "market", "definition.write");
    grant(alice, "market", "definition.publish");
    saveDefinitionDraft(ctx(alice), {
      kind: "market",
      definitionId: "outpost",
      payloadJson: JSON.stringify({ name: "Outpost market" }),
      expectedRevision: 0n,
      operationId: "market-save",
    });
    expect(() =>
      publishDefinition(ctx(alice), {
        kind: "market",
        definitionId: "outpost",
        expectedRevision: 1n,
        expectedDraftSha256: head("market:outpost").draftSha256,
        operationId: "market-publish",
      }),
    ).toThrow(/S9-2/);
  });

  test("expired grants are refused by reducers", () => {
    operatorSetDefinitionGrant(ctx(operator), {
      operationId: "short-grant",
      principal: bob.toHexString(),
      kind: "weapon",
      capability: "definition.write",
      expiresMicros: now + 5000n,
      revoked: false,
    });
    now += 10_000n;
    expect(() => save({ ...pistol(), damage: 3 }, 1n, op(), bob)).toThrow(
      /grant required/,
    );
  });
});

describe("admin views and where-used", () => {
  test("views show only granted kinds, drafts included; others see nothing", () => {
    importContentSeed(ctx(operator), {
      operationId: "seed-weapons-1",
      kind: "weapon",
      dryRun: false,
    });
    importContentSeed(ctx(operator), {
      operationId: "seed-items-01",
      kind: "item",
      dryRun: false,
    });
    grant(alice, "weapon", "definition.read");
    const view = (who: Identity) => ({ db, sender: who }) as any;
    expect(adminHeads(view(alice)).every((h: Row) => h.kind === "weapon")).toBe(
      true,
    );
    expect(adminRevisions(view(alice))).toHaveLength(
      Object.keys(LAB_WEAPONS).length,
    );
    expect(adminHeads(view(bob))).toEqual([]);
    expect(adminRevisions(view(bob))).toEqual([]);
    expect(adminUsage(view(bob))).toEqual([]);
  });

  test("usage counts item instances by definition, pinned to revision 1", () => {
    importContentSeed(ctx(operator), {
      operationId: "seed-weapons-1",
      kind: "weapon",
      dryRun: false,
    });
    importContentSeed(ctx(operator), {
      operationId: "seed-items-01",
      kind: "item",
      dryRun: false,
    });
    for (const [id, def] of [
      ["i1", "pistol"],
      ["i2", "pistol"],
      ["i3", "medkit"],
    ])
      db.inventoryItem.insert({ id, definitionId: def });
    grant(alice, "weapon", "definition.read");
    grant(alice, "item", "definition.read");
    refreshDefinitionUsage(ctx(alice), { kind: "weapon" });
    refreshDefinitionUsage(ctx(alice), { kind: "item" });
    const usage = (key: string) =>
      db.contentDefinitionUsage.definitionKey.find(key);
    // A weapon is used by the item with the same ID, so it counts that item's instances.
    expect(usage("weapon:pistol")).toMatchObject({
      instanceCount: 2n,
      referencedByJson: '["item:pistol"]',
    });
    expect(usage("item:pistol")).toMatchObject({
      instanceCount: 2n,
      pinsJson: '{"1":2}',
      referencedByJson: '["weapon:pistol"]',
    });
    expect(usage("item:medkit")).toMatchObject({
      instanceCount: 1n,
      referencedByJson: "[]",
    });
    expect(() => refreshDefinitionUsage(ctx(bob), { kind: "item" })).toThrow(
      /grant required/,
    );
  });
});
