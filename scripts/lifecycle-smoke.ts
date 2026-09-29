/**
 * S1-1 lifecycle log smoke (isolated -smoke database only). The log is private, so clients prove
 * they cannot subscribe to it and the database owner reads it through `spacetime sql`.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import type { DbConnection } from "../packages/net/src/generated";

type Wait = (fn: () => boolean, message: string) => Promise<void>;
type Client = (
  token?: string,
) => Promise<{ connection: DbConnection; token: string }>;
const TABLES = [
  "lifecycle_event",
  "object_lifecycle",
  "lifecycle_outbox",
  "lifecycle_cursor",
];

/** Owner SQL: rows as objects keyed by the selected column names. */
export function ownerSql(host: string, database: string) {
  return (columns: string[], from: string) => {
    const out = execFileSync(
      ".tools/spacetime/spacetime",
      [
        "--root-dir=.tools/spacetime",
        "sql",
        "--server",
        host,
        "--yes",
        "--no-config",
        "--format",
        "json",
        database,
        `SELECT ${columns.join(", ")} FROM ${from}`,
      ],
      { encoding: "utf8" },
    );
    const payload = JSON.parse(out.slice(out.indexOf("[")));
    return (payload as { rows: unknown[][] }[])
      .flatMap((r) => r.rows)
      .map((row) =>
        Object.fromEntries(columns.map((c, i) => [c, row[i]])),
      ) as Record<string, unknown>[];
  };
}
type Sql = ReturnType<typeof ownerSql>;
const big = (v: unknown) => BigInt(String(v));
const EVENT_COLUMNS = [
  "event_id",
  "object_id",
  "object_kind",
  "kind",
  "sequence",
  "causation_id",
  "actor_id",
];
function eventsFor(sql: Sql, objectId: string) {
  return sql(EVENT_COLUMNS, `lifecycle_event WHERE object_id = '${objectId}'`)
    .map((e) => ({
      event_id: big(e.event_id),
      sequence: big(e.sequence),
      kind: String(e.kind),
      causation_id: String(e.causation_id),
      actor_id: String(e.actor_id),
    }))
    .sort((a, b) => (a.event_id < b.event_id ? -1 : 1));
}

/** Whole-log invariants: bound, dense window, gap-free sequences, creation at most once, no rejects. */
export function assertLogInvariants(sql: Sql) {
  const [outbox] = sql(
    ["next_event_id", "oldest_event_id", "pruned_events", "rejected_events"],
    "lifecycle_outbox",
  );
  assert(outbox, "outbox row exists after producers ran");
  const next = big(outbox.next_event_id),
    oldest = big(outbox.oldest_event_id);
  assert.equal(big(outbox.rejected_events), 0n, "no producer event rejected");
  const events = sql(EVENT_COLUMNS, "lifecycle_event");
  assert.equal(BigInt(events.length), next - oldest, "dense retained window");
  assert(BigInt(events.length) <= 8192n, "retention bound");
  const byObject = new Map<string, bigint[]>();
  const created = new Map<string, number>();
  for (const e of events.sort((a, b) =>
    big(a.event_id) < big(b.event_id) ? -1 : 1,
  )) {
    const id = String(e.object_id);
    byObject.set(id, [...(byObject.get(id) ?? []), big(e.sequence)]);
    if (e.kind === "object.created")
      created.set(id, (created.get(id) ?? 0) + 1);
  }
  const lifecycle = new Map(
    sql(["object_id", "sequence"], "object_lifecycle").map((r) => [
      String(r.object_id),
      big(r.sequence),
    ]),
  );
  for (const [id, sequences] of byObject) {
    sequences.forEach((s, i) =>
      assert.equal(s, sequences[0]! + BigInt(i), `gap-free sequence ${id}`),
    );
    if (oldest === 1n) assert.equal(sequences[0], 1n, `first event ${id}`);
    assert.equal(lifecycle.get(id), sequences.at(-1), `lifecycle row ${id}`);
  }
  for (const [id, count] of created)
    assert.equal(count, 1, `created once ${id}`);
  const kinds: Record<string, number> = {};
  for (const e of events)
    kinds[String(e.kind)] = (kinds[String(e.kind)] ?? 0) + 1;
  return {
    retained: events.length,
    objects: byObject.size,
    nextEventId: next.toString(),
    prunedEvents: String(outbox.pruned_events),
    kinds,
  };
}

async function assertPrivate(c: DbConnection, wait: Wait) {
  for (const table of TABLES) {
    let rejected = false;
    c.subscriptionBuilder()
      .onError(() => (rejected = true))
      .subscribe(`SELECT * FROM ${table}`);
    await wait(() => rejected, `private ${table} rejected`);
  }
}

export async function lifecycleSmoke(client: Client, wait: Wait, sql: Sql) {
  const { connection: c, token } = await client();
  try {
    await c.reducers.enterLab({ name: "Lifecycle Smoke" });
    await wait(() => c.db.ownCharacters.count() === 1n, "lifecycle character");
    const characterId = [...c.db.ownCharacters.iter()][0]!.id;
    assert.deepEqual(
      eventsFor(sql, characterId).map((e) => [e.kind, e.sequence]),
      [["object.created", 1n]],
      "a new character is created once",
    );
    // Re-entry hydrates the persisted character: restored, never created again.
    await c.reducers.enterLab({ name: "Lifecycle Smoke" });
    assert.deepEqual(
      eventsFor(sql, characterId).map((e) => [e.kind, e.sequence]),
      [
        ["object.created", 1n],
        ["object.restored", 2n],
      ],
    );
    await c.reducers.claimStarterKit({});
    await wait(() => c.db.ownInventoryState.count() === 1n, "starter kit");
    const state = () => [...c.db.ownInventoryState.iter()][0]!;
    const snapshot = () =>
      new Map(
        [...c.db.ownInventoryItems.iter()].map((i) => [
          i.id,
          JSON.stringify(i),
        ]),
      );
    const itemEvents = () =>
      new Map(
        [...c.db.ownInventoryItems.iter()].map((i) => [
          i.id,
          eventsFor(sql, i.id),
        ]),
      );
    const target =
      [...c.db.ownInventoryItems.iter()].find(
        (i) => !i.equipmentSlot && i.definitionId === "pistol",
      ) ?? [...c.db.ownInventoryItems.iter()].find((i) => !i.equipmentSlot)!;
    const beforeEvents = itemEvents(),
      beforeRows = snapshot();
    // A rejected reducer (stale revision) commits nothing and logs nothing.
    await assert.rejects(
      c.reducers.equipInventoryItem({
        expectedRevision: state().revision + 7n,
        operationId: "lifecycle-stale",
        itemId: target.id,
      }),
    );
    for (const [id, events] of itemEvents())
      assert.equal(
        events.length,
        beforeEvents.get(id)!.length,
        "no event " + id,
      );
    const revision = state().revision;
    await c.reducers.equipInventoryItem({
      expectedRevision: revision,
      operationId: "lifecycle-equip",
      itemId: target.id,
    });
    await wait(() => state().revision === revision + 1n, "equip committed");
    const afterRows = snapshot(),
      afterEvents = itemEvents();
    const changed = [...afterRows].filter(
      ([id, row]) => beforeRows.get(id) !== row,
    );
    assert(
      changed.some(([id]) => id === target.id),
      "target moved",
    );
    for (const [id, events] of afterEvents) {
      const added = events.slice(beforeEvents.get(id)?.length ?? 0);
      const moved = changed.some(([changedId]) => changedId === id);
      assert.equal(
        added.length,
        moved ? 1 : 0,
        "one event per moved item " + id,
      );
      if (moved)
        assert.equal(
          added[0]!.causation_id,
          `${characterId}:lifecycle-equip`,
          "causation is the operation",
        );
    }
    const equipped = afterEvents.get(target.id)!.at(-1)!;
    assert.equal(equipped.kind, "inventory.equipped");
    await assertPrivate(c, wait);
    return {
      token,
      characterId,
      characterSequence: eventsFor(sql, characterId)
        .at(-1)!
        .sequence.toString(),
      movedItems: changed.length,
    };
  } finally {
    c.disconnect();
  }
}

/** After a database restart: re-entry logs exactly one `object.restored`, never a creation. */
export async function verifyLifecycleRestart(
  client: Client,
  wait: Wait,
  sql: Sql,
  evidence: { token: string; characterId: string; characterSequence: string },
) {
  const { connection: c } = await client(evidence.token);
  try {
    const before = eventsFor(sql, evidence.characterId);
    assert.equal(
      before.at(-1)!.sequence.toString(),
      evidence.characterSequence,
      "no character event while the database was down",
    );
    await c.reducers.enterLab({ name: "Lifecycle Smoke" });
    await wait(() => c.db.ownCharacters.count() === 1n, "lifecycle character");
    const after = eventsFor(sql, evidence.characterId);
    const added = after.slice(before.length);
    assert.deepEqual(
      added.map((e) => [e.kind, e.sequence.toString()]),
      [["object.restored", String(BigInt(evidence.characterSequence) + 1n)]],
    );
    assert.equal(
      after.filter((e) => e.kind === "object.created").length,
      1,
      "restart never re-creates",
    );
    await assertPrivate(c, wait);
    return { restoredSequence: added[0]!.sequence.toString() };
  } finally {
    c.disconnect();
  }
}
