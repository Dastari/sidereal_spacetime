import assert from "node:assert/strict";
import { DbConnection, tables } from "../packages/net/src/generated";
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
          tables.ownShips,
          tables.componentCatalogSnapshots,
          tables.adminContentDefinitionHeads,
          tables.adminContentDefinitions,
        ]),
    )
    .build();
  await wait(() => ready, "component subscription");
  return c;
}

/**
 * Roadmap X-3b on an isolated smoke database: a published component revision reaches ships issued
 * afterwards through a registry-composed catalogue pin; existing ships keep their pin; the
 * snapshot is public content; the operator upgrade targets the current catalogue.
 */
export async function componentDefinitionsSmoke(
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
  const pinOf = (shipId: string) => {
    const row = sql(
      ["document_json", "blueprint_sha_256", "revision"],
      `construction_instance WHERE id = '${shipId}'`,
    )[0]!;
    return {
      catalog: (
        JSON.parse(String(row.document_json)) as { prefab: { catalog: string } }
      ).prefab.catalog,
      blueprint: String(row.blueprint_sha_256),
      revision: String(row.revision),
    };
  };
  try {
    for (const capability of ["definition.write", "definition.publish"])
      operator(
        "operator_set_definition_grant",
        JSON.stringify(`x3b-grant-${capability}-${stamp}`),
        JSON.stringify(designer.identity!.toHexString()),
        JSON.stringify("component"),
        JSON.stringify(capability),
        FOREVER,
        "false",
      );
    await before.reducers.enterLab({ name: "Components Before" });
    await wait(() => before.db.ownShips.count() === 1n, "ship before");
    const oldShip = [...before.db.ownShips.iter()][0]!.id;
    const oldPin = pinOf(oldShip);
    assert.equal(oldPin.catalog, "ship-components-v1@4");

    // Publish thrust-block.sm revision 2 (heavier).
    const key = "component:thrust-block.sm";
    const head = () =>
      designer.db.adminContentDefinitionHeads.definitionKey.find(key)!;
    await wait(() => !!head(), "component head");
    const block = JSON.parse(
      designer.db.adminContentDefinitions.definitionRef.find(
        `${key}@${head().currentRevision}`,
      )!.payloadJson,
    );
    const start = head().revision;
    await designer.reducers.saveDefinitionDraft({
      kind: "component",
      definitionId: "thrust-block.sm",
      payloadJson: JSON.stringify({ ...block, massKg: block.massKg + 50 }),
      expectedRevision: start,
      operationId: `x3b-save-${stamp}`,
    });
    await wait(() => head().revision === start + 1n, "draft");
    await designer.reducers.publishDefinition({
      kind: "component",
      definitionId: "thrust-block.sm",
      expectedRevision: start + 1n,
      expectedDraftSha256: head().draftSha256,
      operationId: `x3b-publish-${stamp}`,
    });
    await wait(() => head().revision === start + 2n, "published");

    // A ship issued now pins the composed catalogue; the old one keeps its pin.
    after = await connect(host, database, wait);
    await after.reducers.enterLab({ name: "Components After" });
    await wait(() => after!.db.ownShips.count() === 1n, "ship after");
    const newShip = [...after.db.ownShips.iter()][0]!.id;
    const newPin = pinOf(newShip);
    assert.match(newPin.catalog, /^ship-components-v1@4\+[0-9a-f]{16}$/);
    assert.equal(pinOf(oldShip).catalog, "ship-components-v1@4");
    assert.notEqual(newPin.blueprint, oldPin.blueprint);
    await wait(
      () => !!after!.db.componentCatalogSnapshots.pin.find(newPin.catalog),
      "snapshot visible to the owner",
    );
    const snapshot = JSON.parse(
      after.db.componentCatalogSnapshots.pin.find(newPin.catalog)!.snapshotJson,
    );
    assert.equal(snapshot.components[0].massKg, block.massKg + 50);

    // Operator upgrade targets the current catalogue (dry run: the composed target is accepted).
    const op = `x3b-upgrade-dry-${stamp}`;
    let refusals: string[] = [];
    try {
      operator(
        "operator_upgrade_prefab_ship",
        JSON.stringify(op),
        "true",
        JSON.stringify(oldShip),
        JSON.stringify(oldPin.blueprint),
        oldPin.revision,
        JSON.stringify("fed.s.wren"),
        JSON.stringify(newPin.blueprint),
      );
      refusals = JSON.parse(
        String(
          sql(
            ["summary_json"],
            `ship_operator_operation WHERE operation_id = '${op}'`,
          )[0]!.summary_json,
        ),
      ).refusals;
    } catch (error) {
      refusals = [String(error)];
    }
    assert(
      !refusals.some((r) =>
        /target blueprint differs|not a known upgradable pin|already has/.test(
          r,
        ),
      ),
      "upgrade accepts the composed target: " + refusals.join("; "),
    );
    return {
      oldPin: oldPin.catalog,
      newPin: newPin.catalog,
      upgradeDryRunRefusals: refusals,
    };
  } finally {
    designer.disconnect();
    before.disconnect();
    after?.disconnect();
  }
}
