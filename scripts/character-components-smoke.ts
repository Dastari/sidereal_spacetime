import assert from "node:assert/strict";
import type { DbConnection } from "../packages/net/src/generated";
import { CHARACTER_COMPONENT_SETS } from "../packages/content/src/character-components";
type Client = (
  token?: string,
) => Promise<{ connection: DbConnection; token: string }>;
type Wait = (fn: () => boolean, message: string) => Promise<void>;
export async function characterComponentsSmoke(client: Client, wait: Wait) {
  const session = await client(),
    other = await client();
  let a = session.connection;
  try {
    await assert.rejects(
      a.reducers.claimCharacterArmory({
        expectedRevision: 0n,
        operationId: "no-character",
      }),
    );
    await a.reducers.enterLab({ name: "Component Fit Smoke" });
    await a.reducers.claimStarterKit({});
    await other.connection.reducers.enterLab({ name: "Other Component Smoke" });
    await other.connection.reducers.claimStarterKit({});
    const items = () => [...a.db.ownInventoryItems.iter()],
      state = () => [...a.db.ownInventoryState.iter()][0];
    const original = items().map((i) => i.id),
      pack = items().find((i) => i.definitionId === "field-pack")!.id;
    const command = () => ({
      expectedRevision: state().revision,
      operationId: crypto.randomUUID(),
    });
    if (a.db.ownGameShipAccess.count() === 1n) {
      // Native personal ships start with empty scoped cargo, not the historical
      // 90-piece lab armory. Keep that legacy journey below; never call it passed
      // for a fixture that has no authoritative component issuance path.
      const beforeItems = JSON.stringify(items());
      const beforeRevision = state().revision;
      await assert.rejects(a.reducers.claimCharacterArmory(command()));
      assert.equal(
        JSON.stringify(items()),
        beforeItems,
        "unsupported issuance mints no items",
      );
      assert.equal(
        state().revision,
        beforeRevision,
        "denied issuance is atomic",
      );
      for (const bodyType of ["male", "female"]) {
        const appearance = [...a.db.ownAppearance.iter()][0]!;
        await a.reducers.setCharacterAppearance({
          appearanceJson: JSON.stringify({
            bodyType,
            hairStyle: bodyType === "female" ? "braids" : "ponytail",
          }),
          expectedRevision: appearance.revision,
          operationId: crypto.randomUUID(),
        });
        assert.equal(
          JSON.parse([...a.db.ownAppearance.iter()][0]!.appearanceJson)
            .bodyType,
          bodyType,
        );
      }
      const expectedAppearance = [...a.db.ownAppearance.iter()][0]!
        .appearanceJson;
      a.disconnect();
      await new Promise((r) => setTimeout(r, 150));
      a = (await client(session.token)).connection;
      await a.reducers.enterLab({ name: "Component Fit Smoke" });
      await wait(
        () => a.db.ownAppearance.count() === 1n,
        "native body appearance reconnect",
      );
      assert.equal(
        [...a.db.ownAppearance.iter()][0]!.appearanceJson,
        expectedAppearance,
      );
      assert.deepEqual(
        items().map((i) => i.id),
        original,
        "native starter UUIDs retained",
      );
      return {
        passed: true,
        bodyTypes: 2,
        reconnectPreserved: true,
        nativeArmoryIssued: false,
        components: 0,
        limitation:
          "Native scoped armory issuance is not implemented; legacy 90-component equipment journey remains separate.",
      };
    }
    assert(
      !items().some((i) => i.definitionId.startsWith("crew-")),
      "stored uniforms are hidden while out of reach",
    );
    await a.reducers.useStation({});
    await a.reducers.claimInputControl({});
    let sequence = 0n;
    const approach = async (x: number, y: number) => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        const actor = [...a.db.ownCharacters.iter()][0],
          dx = x - actor.localX,
          dy = y - actor.localY,
          length = Math.hypot(dx, dy);
        await a.reducers.setIntent({
          sequence: ++sequence,
          throttle: 0,
          turn: 0,
          dx: length < 0.09 ? 0 : dx / Math.max(1, length),
          dy: length < 0.09 ? 0 : dy / Math.max(1, length),
          sprint: false,
        });
        if (length < 0.09) return;
        await new Promise((r) => setTimeout(r, 70));
      }
      throw Error("Armory approach timed out");
    };
    await approach(0, 3);
    await approach(-2.4, 3);
    await approach(-2.5, 2.75);
    await wait(
      () => [...a.db.ownInventoryContainers.iter()].some((c) => c.placementId),
      "supply crate discovered",
    );
    assert.equal(
      [...a.db.ownInventoryContainers.iter()].filter(
        (c) => !c.parentItemId && !c.carried && c.kind === "grid",
      ).length,
      4,
      "uses the original four containers",
    );
    for (const c of [...a.db.ownInventoryContainers.iter()].filter(
      (c) => c.placementId,
    )) {
      assert.equal(c.width, 14);
      assert(
        items().some(
          (i) => i.containerId === c.id && i.definitionId.startsWith("crew-"),
        ),
      );
    }
    const issue = command();
    await a.reducers.claimCharacterArmory(issue);
    await wait(
      () =>
        items().filter((i) => i.definitionId.startsWith("crew-")).length === 90,
      "all equipment issued",
    );
    const ids = items()
      .map((i) => i.id)
      .sort();
    await a.reducers.claimCharacterArmory(issue);
    assert.deepEqual(
      items()
        .map((i) => i.id)
        .sort(),
      ids,
      "replayed operation does not mint items",
    );
    await a.reducers.claimCharacterArmory(command());
    assert.deepEqual(
      items()
        .map((i) => i.id)
        .sort(),
      ids,
      "second explicit request does not regrant",
    );
    await assert.rejects(
      a.reducers.claimCharacterArmory({ ...issue, operationId: "stale-issue" }),
    );
    assert(
      original.every((id) => items().some((i) => i.id === id)),
      "starter item UUIDs preserved",
    );
    for (const bodyType of ["male", "female"]) {
      const appearance = [...a.db.ownAppearance.iter()][0];
      await a.reducers.setCharacterAppearance({
        appearanceJson: JSON.stringify({
          bodyType,
          hairStyle: bodyType === "female" ? "braids" : "ponytail",
        }),
        expectedRevision: appearance.revision,
        operationId: crypto.randomUUID(),
      });
      for (const set of Object.values(CHARACTER_COMPONENT_SETS))
        for (const [slot, id] of Object.entries(set)) {
          const item = items().find((i) => i.definitionId === "crew-" + id)!;
          await a.reducers.equipInventoryItem({
            ...command(),
            itemId: item.id,
          });
          assert.equal(
            items().find((i) => i.id === item.id)!.equipmentSlot,
            slot,
          );
        }
    }
    const foreign = items().find((i) => i.definitionId === "crew-medic-chest")!;
    assert(
      ![...other.connection.db.ownInventoryItems.iter()].some(
        (i) => i.id === foreign.id,
      ),
      "other account cannot see component inventory",
    );
    await assert.rejects(
      other.connection.reducers.equipInventoryItem({
        expectedRevision: [...other.connection.db.ownInventoryState.iter()][0]
          .revision,
        operationId: crypto.randomUUID(),
        itemId: foreign.id,
      }),
    );
    for (const id of [
      "medic-chest",
      "engineer-helmet",
      "recon-visor",
      "marine-shoulders",
      "security-gloves",
      "mechanic-belt",
      "pilot-legs",
      "salvage-boots",
      "scientist-back",
    ]) {
      const item = items().find((i) => i.definitionId === "crew-" + id)!;
      await a.reducers.equipInventoryItem({ ...command(), itemId: item.id });
    }
    // Unequip a glove into its original newly emptied location, then restore it.
    const gloves = items().find((i) => i.equipmentSlot === "gloves")!,
      replacement = items().find(
        (i) => i.definitionId === "crew-medic-gloves",
      )!;
    await a.reducers.equipInventoryItem({
      ...command(),
      itemId: replacement.id,
    });
    assert.equal(items().find((i) => i.id === gloves.id)!.equipmentSlot, "");
    assert(
      items().some((i) => i.id === pack),
      "original backpack and storage retained",
    );
    const expected = items()
      .filter((i) => i.equipmentSlot)
      .map((i) => ({
        id: i.id,
        definitionId: i.definitionId,
        slot: i.equipmentSlot,
      }))
      .sort((x, y) => x.id.localeCompare(y.id));
    const appearanceJson = [...a.db.ownAppearance.iter()][0].appearanceJson;
    a.disconnect();
    await new Promise((r) => setTimeout(r, 150));
    a = (await client(session.token)).connection;
    await a.reducers.enterLab({ name: "Component Fit Smoke" });
    await wait(
      () => a.db.ownInventoryState.count() === 1n,
      "reconnected armor inventory",
    );
    assert.deepEqual(
      items()
        .filter((i) => i.equipmentSlot)
        .map((i) => ({
          id: i.id,
          definitionId: i.definitionId,
          slot: i.equipmentSlot,
        }))
        .sort((x, y) => x.id.localeCompare(y.id)),
      expected,
    );
    assert.equal(
      [...a.db.ownAppearance.iter()][0].appearanceJson,
      appearanceJson,
    );
    return {
      passed: true,
      components: 90,
      bodyTypes: 2,
      setsPerBody: 10,
      mixedSlots: 9,
      privateOwnership: true,
      reachRevisionReplayChecked: true,
      oldUUIDsPreserved: true,
      reconnectPreserved: true,
    };
  } finally {
    a.disconnect();
    other.connection.disconnect();
  }
}
