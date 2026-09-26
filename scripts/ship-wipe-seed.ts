/** Live-shaped seed for the isolated ship-wipe rehearsal. Runs against the
 * UNMODIFIED live baseline module (copied into the baseline checkout by
 * scripts/ship_wipe_rehearsal.py), so every account gets the historical
 * starter Wayfarer exactly as live players did. Adds representative ship-held
 * cargo and a ground drop for the first account. Writes tokens/ids for the
 * post-upgrade rehearsal. Refuses anything but an isolated -smoke database. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { DbConnection, tables } from "../packages/net/src/generated";
import { walkNative } from "./native-starter-smoke";

const host = process.env.SIDEREAL_SMOKE_URL ?? "";
const database = process.env.SIDEREAL_SMOKE_DATABASE ?? "";
const evidenceDirectory = process.env.SIDEREAL_SMOKE_EVIDENCE_DIR ?? ".runtime";
const accounts = (process.env.SIDEREAL_SEED_ACCOUNTS ?? "Owner Main,Crew Two,Crew Three").split(",");
if (!host || !database.endsWith("-smoke"))
  throw Error("Ship wipe seed requires an isolated -smoke database");
if (new URL(host).port === "3100") throw Error("Refusing the live server port");

const wait = async (fn: () => boolean, message: string, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error("Timeout: " + message);
};
async function client() {
  let ready = false,
    token = "";
  const connection = DbConnection.builder()
    .withUri(host)
    .withDatabaseName(database)
    .onConnect((c, _i, t) => {
      token = t;
      c.subscriptionBuilder()
        .onApplied(() => (ready = true))
        .subscribe([
          tables.ownCharacters,
          tables.ownShips,
          tables.ownInventoryState,
          tables.ownInventoryItems,
          tables.ownGroundItems,
          tables.ownReachableCargoContainers,
          tables.ownReachableCargoItems,
          tables.ownCarriedInventoryRevisions,
        ]);
    })
    .build();
  await wait(() => ready, "subscription");
  return { connection, token: () => token };
}

const seeded: Record<string, unknown>[] = [];
for (const [index, name] of accounts.entries()) {
  const { connection: c, token } = await client();
  await c.reducers.enterLab({ name });
  await wait(() => c.db.ownShips.count() === 1n, `${name} starter ship`);
  await c.reducers.claimStarterKit({});
  await wait(() => c.db.ownInventoryItems.count() === 7n, `${name} starter kit`);
  const actor = [...c.db.ownCharacters.iter()][0]!;
  const record: Record<string, unknown> = {
    name,
    token: token(),
    characterId: actor.id,
    shipId: actor.shipId,
    kit: [...c.db.ownInventoryItems.iter()].map((i) => i.id).sort(),
  };
  if (index === 0) {
    const kit = () => [...c.db.ownInventoryItems.iter()];
    const find = (d: string) => kit().find((i) => i.definitionId === d)!;
    const state = () => [...c.db.ownInventoryState.iter()][0]!;
    await c.reducers.claimInputControl({});
    for (const [px, py] of [[0, -1.5], [0, 3], [-2.4, 3], [-3.5, 2.75]] as const)
      await walkNative(c, px, py);
    const cargo = () => [...c.db.ownReachableCargoContainers.iter()].filter((x) => x.placedObjectId);
    await wait(() => cargo().length === 4, "reachable cargo");
    const revision = (id: string) =>
      [...c.db.ownCarriedInventoryRevisions.iter()].find((r) => r.id === id)?.revision ??
      cargo().find((r) => r.id === id)?.revision;
    const pistol = find("compact-pistol");
    const root = cargo()[0]!;
    await c.reducers.transferScopedCargoItem({
      operationId: "ship-wipe-seed-cargo-1",
      itemId: pistol.id,
      sourceContainerId: pistol.containerId,
      destinationContainerId: root.id,
      x: 0,
      y: 0,
      rotated: false,
      expectedItemRevision: revision(pistol.id)!,
      expectedSourceRevision: revision(pistol.containerId)!,
      expectedDestinationRevision: revision(root.id)!,
      expectedCharacterRevision: state().revision,
    });
    await wait(() => !kit().some((i) => i.id === pistol.id), "pistol stored in ship cargo");
    const scanner = find("scanner");
    await c.reducers.dropInventoryItem({
      itemId: scanner.id,
      expectedRevision: state().revision,
      operationId: "ship-wipe-seed-drop-1",
    });
    await wait(() => [...c.db.ownGroundItems.iter()].some((i) => i.id === scanner.id), "ground scanner");
    record.cargoItemId = pistol.id;
    record.groundItemId = scanner.id;
    // Personal = the carried kit minus the stored pistol and the dropped scanner.
    record.personalKit = kit()
      .map((i) => i.id)
      .filter((id) => id !== scanner.id)
      .sort();
    assert.equal((record.personalKit as string[]).length, 5);
    await c.reducers.releaseInputControl({});
  } else record.personalKit = record.kit;
  seeded.push(record);
  c.disconnect();
}
const out = join(evidenceDirectory, "ship-wipe-seed.json");
writeFileSync(out, JSON.stringify({ database, accounts: seeded }, null, 1), { mode: 0o600 });
console.log(
  JSON.stringify(
    { seeded: seeded.map(({ token: _t, ...r }) => ({ ...r, kit: (r.kit as string[]).length })) },
    null,
    1,
  ),
);
process.exit(0);
