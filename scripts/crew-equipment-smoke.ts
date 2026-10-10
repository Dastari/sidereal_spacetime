import assert from "node:assert/strict";
import type { DbConnection } from "../packages/net/src/generated";
import { tables } from "../packages/net/src/generated";
import {
  STUDY_EQUIPMENT_KITS,
  STUDY_WEARABLES,
} from "../packages/content/src/crew-study-equipment";
import {
  INVENTORY_DEFINITIONS,
  LIQUID_DENSITY_KG_PER_LITRE,
  inventoryDefinition,
} from "../packages/content/src/inventory";
import { evaSuitCheck } from "../packages/content/src/crew-wardrobe";
import { firstInventoryPlacement } from "../packages/sim/src/inventory";
import { prefabCargoSockets } from "../packages/sim/src/prefab-cargo-sockets";
import {
  STARTER_PREFAB,
  STARTER_CATALOG,
  walkStarterTo,
} from "./native-starter-smoke";

type Client = (
  token?: string,
) => Promise<{ connection: DbConnection; token: string }>;
type Wait = (fn: () => boolean, label: string) => Promise<void>;

/** Normal reducers on an isolated server: additive catalogue, explicit cargo delivery, owned equip and persistence. */
export async function crewEquipmentSmoke(
  client: Client,
  wait: Wait,
  operator: (reducer: string, ...args: string[]) => void,
) {
  const session = await client();
  const other = await client();
  let a = session.connection;
  const extra = (c: DbConnection) =>
    new Promise<void>((resolve) =>
      c
        .subscriptionBuilder()
        .onApplied(() => resolve())
        .subscribe([
          tables.publishedItemDefinitions,
          tables.ownItemDefinitionPins,
        ]),
    );
  try {
    await extra(a);
    await a.reducers.enterLab({ name: "Study Equipment" });
    await a.reducers.claimStarterKit({});
    await other.connection.reducers.enterLab({ name: "Study Equipment Other" });
    await other.connection.reducers.claimStarterKit({});
    await a.reducers.claimInputControl({});
    const actor = () => [...a.db.ownCharacters.iter()][0]!;
    const items = () => [...a.db.ownInventoryItems.iter()];
    const state = () => [...a.db.ownInventoryState.iter()][0]!;
    const cargo = () => [...a.db.ownReachableCargoContainers.iter()];
    const cargoItems = () => [...a.db.ownReachableCargoItems.iter()];
    const revision = (id: string) =>
      [...a.db.ownCarriedInventoryRevisions.iter()].find((r) => r.id === id)
        ?.revision ??
      cargo().find((r) => r.id === id)?.revision ??
      cargoItems().find((r) => r.id === id)?.revision;
    const mutation = () => ({
      expectedRevision: state().revision,
      operationId: crypto.randomUUID(),
    });
    const clothingId = "wardrobe-study-clothing-captain";
    const rpId = "wardrobe-study-glasses_blue";
    const ids = [clothingId, rpId, ...STUDY_EQUIPMENT_KITS["study-eva-medic"]];
    assert(
      !items().some((i) => i.definitionId.startsWith("wardrobe-study-")),
      "new art supplies no starter grants",
    );
    for (const wearable of STUDY_WEARABLES) {
      const id = `wardrobe-${wearable.id}`;
      const row = [...a.db.publishedItemDefinitions.iter()].find(
        (d) => d.definitionId === id && d.status === "published",
      );
      assert(row, `new catalogue publication ${id}`);
      assert.equal(JSON.parse(row.payloadJson).equipSlot, wearable.slot);
    }
    const socket = prefabCargoSockets(STARTER_PREFAB, 0, STARTER_CATALOG).find(
      (s) => s.key === "hold/cargo.standard.medium",
    )!;
    assert(socket);
    operator(
      "operator_stock_ship_cargo",
      JSON.stringify(`crew-equipment-${actor().id}`),
      "false",
      JSON.stringify(actor().id),
      JSON.stringify(actor().shipId),
      JSON.stringify(socket.key),
      JSON.stringify("Equipment review"),
      JSON.stringify(JSON.stringify(ids)),
    );
    await walkStarterTo(a, socket.approachesM[0]!);
    await wait(
      () => ids.every((id) => cargoItems().some((i) => i.definitionId === id)),
      "owned new equipment delivered",
    );
    await a.reducers.setCharacterAppearance({
      appearanceJson: JSON.stringify({
        bodyType: "female",
        hairStyle: "groom.twin_puffs",
        skin: "#a07050",
        hair: "#552233",
        eyes: "#2255cc",
      }),
      expectedRevision: [...a.db.ownAppearance.iter()][0]!.revision,
      operationId: crypto.randomUUID(),
    });
    const savedAppearance = [...a.db.ownAppearance.iter()][0]!.appearanceJson;
    const uuids: string[] = [];
    for (const definitionId of ids) {
      const source = cargoItems().find((i) => i.definitionId === definitionId)!;
      const data = {
        items: [
          ...items(),
          ...cargoItems().map((i) => ({ ...i, equipmentSlot: "" })),
        ],
        containers: [
          ...a.db.ownInventoryContainers.iter(),
          ...cargo().map((c) => ({
            ...c,
            carried: false,
            placementId: c.placedObjectId,
          })),
        ],
      };
      const destinations = [...a.db.ownInventoryContainers.iter()].filter(
        (c) =>
          c.kind === "grid" && (c.id === state().pocketsId || !!c.parentItemId),
      );
      const fit = destinations.flatMap((c) => {
        const location = firstInventoryPlacement(
          data,
          INVENTORY_DEFINITIONS,
          LIQUID_DENSITY_KG_PER_LITRE,
          state().pocketsId,
          32,
          source.id,
          c.id,
        );
        return location ? [location] : [];
      })[0];
      assert(fit, `owned carried placement before equip: ${definitionId}`);
      const command = {
        itemId: source.id,
        sourceContainerId: source.containerId,
        destinationContainerId: fit.containerId,
        x: fit.x,
        y: fit.y,
        rotated: fit.rotated,
        expectedItemRevision: revision(source.id)!,
        expectedSourceRevision: revision(source.containerId)!,
        expectedDestinationRevision: revision(fit.containerId)!,
        expectedCharacterRevision: state().revision,
        operationId: crypto.randomUUID(),
      };
      await assert.rejects(
        other.connection.reducers.transferScopedCargoItem(command),
      );
      await a.reducers.transferScopedCargoItem(command);
      await wait(
        () => items().some((i) => i.id === source.id),
        "item transferred with its UUID",
      );
      const equip = { ...mutation(), itemId: source.id };
      await a.reducers.equipInventoryItem(equip);
      const accepted = state().revision;
      await a.reducers.equipInventoryItem(equip);
      assert.equal(state().revision, accepted, "equip replay is idempotent");
      assert.equal(
        items().find((i) => i.id === source.id)!.equipmentSlot,
        inventoryDefinition(definitionId)!.equipSlot,
      );
      uuids.push(source.id);
    }
    const protection = () =>
      evaSuitCheck(
        items()
          .filter((i) => i.equipmentSlot)
          .map((i) => ({ slot: i.equipmentSlot, id: i.definitionId })),
      );
    assert(
      protection().ready,
      "actual equipped rated components provide coverage",
    );
    const uniform = items().find((i) => i.definitionId === clothingId)!;
    assert.equal(
      uniform.equipmentSlot,
      "uniform",
      "own clothing remains beneath suit pieces",
    );
    const glasses = items().find((i) => i.definitionId === rpId)!;
    await a.reducers.equipInventoryItem({ ...mutation(), itemId: glasses.id });
    assert.equal(
      glasses.id,
      items().find((i) => i.equipmentSlot === "helmet")!.id,
      "RP glasses replace the pressure helmet",
    );
    assert.deepEqual(protection().missing, ["helmet"]);
    const helmet = items().find(
      (i) => i.definitionId === "wardrobe-study-eva-medic-helmet",
    )!;
    await a.reducers.equipInventoryItem({ ...mutation(), itemId: helmet.id });
    assert(protection().ready);
    assert.equal(
      [...a.db.ownAppearance.iter()][0]!.appearanceJson,
      savedAppearance,
    );
    a.disconnect();
    a = (await client(session.token)).connection;
    await a.reducers.enterLab({ name: "Study Equipment" });
    await wait(
      () => uuids.every((id) => items().some((i) => i.id === id)),
      "equipment UUIDs after reconnect",
    );
    assert.equal(
      [...a.db.ownAppearance.iter()][0]!.appearanceJson,
      savedAppearance,
    );
    assert.equal(
      items().find((i) => i.id === uniform.id)!.equipmentSlot,
      "uniform",
    );
    return {
      passed: true,
      publishedNewWearables: STUDY_WEARABLES.length,
      explicitlyDelivered: ids.length,
      foreignTransferRejected: true,
      equipReplay: true,
      clothingPreserved: true,
      rpReplacesHelmet: true,
      reconnectPreserved: true,
    };
  } finally {
    a.disconnect();
    other.connection.disconnect();
  }
}
