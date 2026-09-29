import assert from "node:assert/strict";
import { DbConnection, tables } from "../packages/net/src/generated";
import { LAB_WEAPONS } from "../packages/content/src/weapons";
import { INVENTORY_DEFINITIONS } from "../packages/content/src/inventory";
import { validateDefinition } from "../packages/sim/src/content-definitions";
import type { ownerSql } from "./lifecycle-smoke";

type Wait = (fn: () => boolean, message: string) => Promise<void>;
type Operator = (reducer: string, ...args: string[]) => void;
type Sql = ReturnType<typeof ownerSql>;
const FOREVER = "18446744073709551615";
const PRIVATE_TABLES = [
  "content_definition_head",
  "content_definition",
  "content_definition_receipt",
  "content_definition_usage",
];

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
          tables.ownConstructionGrants,
          tables.adminContentDefinitionHeads,
          tables.adminContentDefinitions,
          tables.adminContentDefinitionUsage,
        ]),
    )
    .build();
  await wait(() => ready, "definition subscription");
  return c;
}
const rejects = async (p: Promise<unknown>, pattern: RegExp, what: string) => {
  await assert.rejects(p, (e: unknown) => pattern.test(String(e)), what);
};

/**
 * Roadmap X-1 acceptance on an isolated smoke database: seed import (dry run, apply, idempotent
 * re-run), per-kind grants, draft/publish/retire with expected revisions and operation IDs,
 * validator reasons, admin-only views and private base tables.
 */
export async function contentDefinitionsSmoke(
  host: string,
  database: string,
  wait: Wait,
  operator: Operator,
  sql: Sql,
) {
  const stamp = Date.now().toString(36);
  const seed = (kind: string, dryRun: boolean, suffix: string) =>
    operator(
      "operator_import_content_seed",
      JSON.stringify(`x1-seed-${kind}-${suffix}-${stamp}`),
      JSON.stringify(kind),
      String(dryRun),
    );
  const summary = (kind: string, suffix: string) =>
    JSON.parse(
      String(
        sql(
          ["summary_json"],
          `ship_operator_operation WHERE operation_id = 'x1-seed-${kind}-${suffix}-${stamp}'`,
        )[0]!.summary_json,
      ),
    );
  seed("weapon", true, "dry");
  const weapons = Object.keys(LAB_WEAPONS).length;
  assert.equal(summary("weapon", "dry").created, weapons, "dry run counts");
  assert.equal(
    sql(["definition_ref"], "content_definition").length,
    0,
    "dry run writes no definitions",
  );
  seed("weapon", false, "apply");
  seed("item", false, "apply");
  seed("weapon", false, "again");
  const again = summary("weapon", "again");
  assert.equal(again.created, 0, "seed import is idempotent by content");
  assert.equal(again.unchanged, weapons);
  assert.equal(
    sql(["definition_ref"], "content_definition").length,
    weapons + INVENTORY_DEFINITIONS.length,
  );

  const designer = await connect(host, database, wait);
  const outsider = await connect(host, database, wait);
  try {
    const grant = (who: DbConnection, kind: string, capability: string) =>
      operator(
        "operator_set_definition_grant",
        JSON.stringify(
          `x1-grant-${kind}-${capability}-${stamp}-${who.identity!.toHexString().slice(0, 8)}`,
        ),
        JSON.stringify(who.identity!.toHexString()),
        JSON.stringify(kind),
        JSON.stringify(capability),
        FOREVER,
        "false",
      );
    grant(designer, "weapon", "definition.write");
    grant(designer, "weapon", "definition.publish");
    grant(outsider, "item", "definition.read");
    await wait(
      () =>
        designer.db.adminContentDefinitions.count() === BigInt(weapons) &&
        outsider.db.adminContentDefinitions.count() ===
          BigInt(INVENTORY_DEFINITIONS.length),
      "admin views scoped to granted kinds",
    );
    assert(
      [...designer.db.adminContentDefinitions.iter()].every(
        (r) => r.kind === "weapon",
      ),
    );
    assert(
      [...outsider.db.adminContentDefinitionHeads.iter()].every(
        (r) => r.kind === "item",
      ),
    );
    for (const name of PRIVATE_TABLES) {
      let rejected = false;
      outsider
        .subscriptionBuilder()
        .onError(() => (rejected = true))
        .subscribe("SELECT * FROM " + name);
      await wait(() => rejected, "private base table denied: " + name);
    }

    const head = () =>
      designer.db.adminContentDefinitionHeads.definitionKey.find(
        "weapon:pistol",
      )!;
    const r1 =
      designer.db.adminContentDefinitions.definitionRef.find(
        "weapon:pistol@1",
      )!;
    assert.deepEqual(
      JSON.parse(r1.payloadJson),
      LAB_WEAPONS.pistol,
      "revision 1 = code",
    );
    const draft = { ...LAB_WEAPONS.pistol, damage: 18 };
    await rejects(
      designer.reducers.saveDefinitionDraft({
        kind: "weapon",
        definitionId: "pistol",
        payloadJson: JSON.stringify({ ...draft, shotCost: 900 }),
        expectedRevision: head().revision,
        operationId: `x1-bad-${stamp}`,
      }),
      /shotCost: A shot cannot cost more than the capacity/,
      "invalid payload rejected with the shared validator's reason",
    );
    assert.equal(
      validateDefinition("weapon", "pistol", { ...draft, shotCost: 900 }).ok,
      false,
    );
    await designer.reducers.saveDefinitionDraft({
      kind: "weapon",
      definitionId: "pistol",
      payloadJson: JSON.stringify(draft),
      expectedRevision: 1n,
      operationId: `x1-save-${stamp}`,
    });
    await wait(() => head().revision === 2n, "draft saved");
    assert.equal(head().currentRevision, 1n, "a draft never changes the pin");
    assert.equal(JSON.parse(head().draftJson).damage, 18);
    await rejects(
      outsider.reducers.saveDefinitionDraft({
        kind: "weapon",
        definitionId: "pistol",
        payloadJson: JSON.stringify(draft),
        expectedRevision: 2n,
        operationId: `x1-outsider-${stamp}`,
      }),
      /definition.write grant required/,
      "an item reader cannot write weapons",
    );
    await rejects(
      designer.reducers.saveDefinitionDraft({
        kind: "item",
        definitionId: "pistol",
        payloadJson: "{}",
        expectedRevision: 1n,
        operationId: `x1-cross-${stamp}`,
      }),
      /grant required for definitions:item/,
      "a weapon grantee cannot write items",
    );
    // The reviewed draft hash; a replay must repeat the exact same request.
    const reviewed = head().draftSha256;
    const publish = (expectedRevision: bigint, operationId: string) =>
      designer.reducers.publishDefinition({
        kind: "weapon",
        definitionId: "pistol",
        expectedRevision,
        expectedDraftSha256: reviewed,
        operationId,
      });
    await rejects(
      publish(1n, `x1-stale-${stamp}`),
      /revision conflict/,
      "stale publish",
    );
    await publish(2n, `x1-publish-${stamp}`);
    await wait(() => head().latestRevision === 2n, "revision 2 published");
    await publish(2n, `x1-publish-${stamp}`); // exact replay is a no-op
    const r2 =
      designer.db.adminContentDefinitions.definitionRef.find(
        "weapon:pistol@2",
      )!;
    assert.equal(JSON.parse(r2.payloadJson).damage, 18);
    assert.equal(r2.status, "published");
    assert.equal(
      JSON.parse(
        designer.db.adminContentDefinitions.definitionRef.find(
          "weapon:pistol@1",
        )!.payloadJson,
      ).damage,
      15,
      "published revisions are immutable",
    );
    assert.equal(
      [...designer.db.adminContentDefinitions.iter()].filter(
        (r) => r.definitionKey === "weapon:pistol",
      ).length,
      2,
      "replay created nothing",
    );
    await designer.reducers.retireDefinition({
      kind: "weapon",
      definitionId: "pistol",
      revision: 2n,
      expectedRevision: head().revision,
      operationId: `x1-retire-${stamp}`,
    });
    await wait(
      () => head().currentRevision === 1n,
      "retire returns to revision 1",
    );
    await designer.reducers.refreshDefinitionUsage({ kind: "weapon" });
    await wait(
      () => designer.db.adminContentDefinitionUsage.count() === BigInt(weapons),
      "where-used snapshot",
    );
    const usage =
      designer.db.adminContentDefinitionUsage.definitionKey.find(
        "weapon:pistol",
      )!;
    assert.deepEqual(JSON.parse(usage.referencedByJson), ["item:pistol"]);
    assert.equal(outsider.db.adminContentDefinitionUsage.count(), 0n);

    // Retire guard: the pistol is in operator kits, so its last published revision stays.
    await rejects(
      designer.reducers.retireDefinition({
        kind: "weapon",
        definitionId: "pistol",
        revision: 1n,
        expectedRevision: head().revision,
        operationId: `x3-retire-last-${stamp}`,
      }),
      /Cannot retire the last published revision of weapon:pistol: it is used by operator kit/,
      "retire guard",
    );
    assert.equal(head().currentRevision, 1n);

    // X-3 kinds: seeds import; drafts validate with the shared validator; publishing waits.
    seed("component", false, "apply");
    seed("interaction", false, "apply");
    assert.equal(summary("component", "apply").created, 132);
    assert.equal(summary("interaction", "apply").created, 2);
    grant(designer, "component", "definition.write");
    grant(designer, "component", "definition.publish");
    const componentHead = () =>
      designer.db.adminContentDefinitionHeads.definitionKey.find(
        "component:ion-drive.sm",
      );
    await wait(() => !!componentHead(), "component registry visible");
    const drive = JSON.parse(
      designer.db.adminContentDefinitions.definitionRef.find(
        "component:ion-drive.sm@1",
      )!.payloadJson,
    );
    await rejects(
      designer.reducers.saveDefinitionDraft({
        kind: "component",
        definitionId: "ion-drive.sm",
        payloadJson: JSON.stringify({ ...drive, propulsion: null }),
        expectedRevision: componentHead()!.revision,
        operationId: `x3-bad-component-${stamp}`,
      }),
      /propulsion without stats/,
      "component validator reason",
    );
    await designer.reducers.saveDefinitionDraft({
      kind: "component",
      definitionId: "ion-drive.sm",
      payloadJson: JSON.stringify({ ...drive, massKg: drive.massKg + 10 }),
      expectedRevision: componentHead()!.revision,
      operationId: `x3-save-component-${stamp}`,
    });
    await wait(() => !!componentHead()!.draftJson, "component draft");
    await rejects(
      designer.reducers.publishDefinition({
        kind: "component",
        definitionId: "ion-drive.sm",
        expectedRevision: componentHead()!.revision,
        expectedDraftSha256: componentHead()!.draftSha256,
        operationId: `x3-publish-component-${stamp}`,
      }),
      /publishing opens in X-3b/,
      "components keep drafts until the runtime reads them",
    );
    return {
      seeded: { items: INVENTORY_DEFINITIONS.length, weapons },
      pistolRevisions: 2,
      currentAfterRetire: 1,
      pistolInstances: Number(usage.instanceCount),
    };
  } finally {
    designer.disconnect();
    outsider.disconnect();
  }
}
