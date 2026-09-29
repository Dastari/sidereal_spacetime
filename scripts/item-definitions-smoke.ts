import assert from "node:assert/strict";
import { DbConnection, tables } from "../packages/net/src/generated";
import { inventoryDefinition } from "../packages/content/src/inventory";
import { LAB_WEAPONS } from "../packages/content/src/weapons";
import type { ownerSql } from "./lifecycle-smoke";

type Wait = (fn: () => boolean, message: string) => Promise<void>;
type Operator = (reducer: string, ...args: string[]) => void;
type Sql = ReturnType<typeof ownerSql>;
const FOREVER = "18446744073709551615";

async function connect(host: string, database: string, wait: Wait) {
  let ready = false;
  const c = DbConnection.builder()
    .withUri(host)
    .withDatabaseName(database)
    .onConnect((conn) =>
      conn
        .subscriptionBuilder()
        .onApplied(() => (ready = true))
        .subscribe([
          tables.ownCharacters,
          tables.ownInventoryItems,
          tables.ownInventoryState,
          tables.ownItemDefinitionPins,
          tables.publishedItemDefinitions,
          tables.adminContentDefinitionHeads,
          tables.adminContentDefinitionUsage,
        ]),
    )
    .build();
  await wait(() => ready, "item definition subscription");
  return c;
}
const itemOf = (c: DbConnection, definitionId: string) =>
  [...c.db.ownInventoryItems.iter()].find(
    (i) => i.definitionId === definitionId,
  );
const pinOf = (c: DbConnection, definitionId: string) => {
  const item = itemOf(c, definitionId);
  return item ? c.db.ownItemDefinitionPins.itemId.find(item.id) : undefined;
};
const carried = (c: DbConnection) =>
  [...c.db.ownInventoryState.iter()][0]?.carriedMassKg ?? NaN;

/**
 * Roadmap X-2 on an isolated smoke database: a Studio publication takes effect for newly created
 * instances only (pins, server-side carried mass), existing instances keep their pin until an
 * operator resync, and players see published revisions but never drafts.
 */
export async function itemDefinitionsSmoke(
  host: string,
  database: string,
  wait: Wait,
  operator: Operator,
  sql: Sql,
) {
  const stamp = Date.now().toString(36);
  const designer = await connect(host, database, wait);
  const before = await connect(host, database, wait);
  let after: DbConnection | undefined;
  try {
    for (const kind of ["item", "weapon"])
      for (const capability of ["definition.write", "definition.publish"])
        operator(
          "operator_set_definition_grant",
          JSON.stringify(`x2-grant-${kind}-${capability}-${stamp}`),
          JSON.stringify(designer.identity!.toHexString()),
          JSON.stringify(kind),
          JSON.stringify(capability),
          FOREVER,
          "false",
        );
    // A character created before the publication.
    await before.reducers.enterLab({ name: "Pins Before" });
    await wait(
      () => !!pinOf(before, "power-cell") && !!pinOf(before, "compact-pistol"),
      "kit instances are pinned at creation",
    );
    assert.equal(pinOf(before, "power-cell")!.itemRevision, 1n);
    assert.equal(pinOf(before, "compact-pistol")!.weaponRevision, 1n);

    // The designer publishes item:power-cell@2 (heavier) and weapon:compact-pistol@2.
    await wait(
      () =>
        !!designer.db.adminContentDefinitionHeads.definitionKey.find(
          "item:power-cell",
        ),
      "registry visible to the designer",
    );
    const publish = async (
      kind: "item" | "weapon",
      definitionId: string,
      payload: object,
    ) => {
      const key = `${kind}:${definitionId}`;
      const head = () =>
        designer.db.adminContentDefinitionHeads.definitionKey.find(key)!;
      const start = head().revision;
      await designer.reducers.saveDefinitionDraft({
        kind,
        definitionId,
        payloadJson: JSON.stringify(payload),
        expectedRevision: start,
        operationId: `x2-save-${definitionId}-${stamp}`,
      });
      await wait(() => head().revision === start + 1n, "draft " + key);
      await designer.reducers.publishDefinition({
        kind,
        definitionId,
        expectedRevision: start + 1n,
        expectedDraftSha256: head().draftSha256,
        operationId: `x2-publish-${definitionId}-${stamp}`,
      });
      await wait(() => head().revision === start + 2n, "publish " + key);
      return head().currentRevision;
    };
    const cell = inventoryDefinition("power-cell");
    const cellRevision = await publish("item", "power-cell", {
      ...cell,
      name: "Power cell Mk II",
      massKg: cell.massKg + 0.2,
    });
    const pistolRevision = await publish("weapon", "compact-pistol", {
      ...LAB_WEAPONS["compact-pistol"],
      damage: 33,
    });
    await wait(
      () =>
        !!before.db.publishedItemDefinitions.definitionRef.find(
          `item:power-cell@${cellRevision}`,
        ),
      "players see the published revision",
    );
    assert(
      [...before.db.publishedItemDefinitions.iter()].every(
        (r) => r.kind === "item" || r.kind === "weapon",
      ),
    );

    // A character created after the publication pins the new revisions.
    after = await connect(host, database, wait);
    await after.reducers.enterLab({ name: "Pins After" });
    await wait(
      () => !!pinOf(after!, "power-cell") && !!pinOf(after!, "compact-pistol"),
      "new kit pinned",
    );
    assert.equal(pinOf(after, "power-cell")!.itemRevision, cellRevision);
    assert.equal(
      pinOf(after, "compact-pistol")!.weaponRevision,
      pistolRevision,
    );
    assert.equal(pinOf(after, "compact-pistol")!.itemRevision, 1n);
    // Existing instances keep their pin.
    assert.equal(pinOf(before, "power-cell")!.itemRevision, 1n);
    // Runtime reads the pin: the server-computed carried mass differs by the published 0.2 kg.
    await wait(
      () =>
        Number.isFinite(carried(before)) && Number.isFinite(carried(after!)),
      "carried mass",
    );
    const massBefore = carried(before),
      massAfter = carried(after);
    assert(
      Math.abs(massAfter - massBefore - 0.2) < 1e-6,
      `new kit carries the published mass: ${massAfter} vs ${massBefore}`,
    );

    // Operator resync of the old instance: dry run, apply, idempotent replay.
    const oldCell = itemOf(before, "power-cell")!.id;
    const resync = (op: string, dryRun: boolean) =>
      operator(
        "operator_resync_item_definitions",
        JSON.stringify(op),
        JSON.stringify("power-cell"),
        cellRevision.toString(),
        "0",
        JSON.stringify(JSON.stringify([oldCell])),
        String(dryRun),
      );
    resync(`x2-resync-dry-${stamp}`, true);
    const dry = JSON.parse(
      String(
        sql(
          ["summary_json"],
          `ship_operator_operation WHERE operation_id = 'x2-resync-dry-${stamp}'`,
        )[0]!.summary_json,
      ),
    );
    assert.equal(dry.changed, 1);
    assert.equal(dry.blockedCount, 0);
    assert.equal(pinOf(before, "power-cell")!.itemRevision, 1n, "dry run");
    resync(`x2-resync-apply-${stamp}`, false);
    resync(`x2-resync-apply-${stamp}`, false);
    await wait(
      () => pinOf(before, "power-cell")!.itemRevision === cellRevision,
      "resynced pin",
    );
    await wait(
      () => Math.abs(carried(before) - massAfter) < 1e-6,
      "resynced carried mass",
    );

    // Where used, by pinned revision.
    await designer.reducers.refreshDefinitionUsage({ kind: "item" });
    await wait(
      () =>
        !!designer.db.adminContentDefinitionUsage.definitionKey.find(
          "item:power-cell",
        ),
      "usage",
    );
    const usage = JSON.parse(
      designer.db.adminContentDefinitionUsage.definitionKey.find(
        "item:power-cell",
      )!.pinsJson,
    ) as Record<string, number>;
    assert((usage[cellRevision.toString()] ?? 0) >= 2, JSON.stringify(usage));
    return {
      cellRevision: Number(cellRevision),
      pistolRevision: Number(pistolRevision),
      carriedBefore: massBefore,
      carriedAfter: massAfter,
      usage,
    };
  } finally {
    designer.disconnect();
    before.disconnect();
    after?.disconnect();
  }
}
