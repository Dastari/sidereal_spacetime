import { characterComponentsSmoke } from "./character-components-smoke";
import { constructionDenialSmoke } from "./construction-smoke";
import { identityLinkSmoke } from "./identity-link-smoke";
import { persistenceSmoke, verifyPersistence } from "./persistence-smoke";
import { combatSmoke } from "./combat-smoke";
import { interactionSmoke } from "./interaction-smoke";
import { inventorySmoke } from "./inventory-smoke";
import { PILOT_LAYOUT } from "../packages/content/src/pilot-layout";
import { SHARED_SYSTEM_SEED } from "../packages/content/src/shared-system";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DbConnection, tables } from "../packages/net/src/generated";
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(
      "Use npm run smoke or npm run smoke:restart to load dev.toml",
    );
  return value;
}
const host = requiredEnv("SIDEREAL_SMOKE_URL");
const database = requiredEnv("SIDEREAL_SMOKE_DATABASE");
const evidenceDirectory = process.env.SIDEREAL_SMOKE_EVIDENCE_DIR ?? ".runtime";
const evidencePath = (name: string) => join(evidenceDirectory, name);
if (!database.endsWith("-smoke"))
  throw new Error("Smoke requires an isolated -smoke database");
const wait = async (fn: () => boolean, message: string) => {
  const end = Date.now() + 7000;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("Timeout: " + message);
};
async function client(token?: string) {
  let saved = "";
  let ready = false;
  const connection = DbConnection.builder()
    .withUri(host)
    .withDatabaseName(database)
    .withToken(token)
    .onConnect((c, _i, t) => {
      saved = t;
      c.subscriptionBuilder()
        .onApplied(() => (ready = true))
        .subscribe([
          tables.ownIdentityLinks,
          tables.ownAppearance,
          tables.ownCharacters,
          tables.ownShips,
          tables.ownStations,
          tables.ownEditReceipts,
          tables.ownSpaceBodies,
          tables.ownWorldAdmission,
          tables.visibleBodyMotion,
          tables.visibleBodyDescriptions,
          tables.visibleShipMotion,
          tables.visibleShipDescriptions,
          tables.ownActuatorOutputs,
          tables.ownInteractions,
          tables.ownCombat,
          tables.ownGroundItems,
          tables.ownInventoryState,
          tables.ownInventoryItems,
          tables.ownInventoryContainers,
          tables.ownInventoryHotbar,
        ]);
    })
    .build();
  await wait(() => ready, "subscription");
  return { connection, token: saved };
}
/** Join public descriptors and accepted motion; fixture seed supplies labels only. */
const sharedBodies = (c: DbConnection) =>
  [...c.db.visibleBodyDescriptions.iter()].flatMap((d) => {
    const m = c.db.visibleBodyMotion.bodyId.find(d.bodyId);
    return m
      ? [
          {
            ...d,
            ...m,
            id: d.bodyId,
            tick: m.serverTick,
            key:
              SHARED_SYSTEM_SEED.bodies.find((b) => b.id === d.bodyId)?.key ??
              d.bodyId,
          },
        ]
      : [];
  });
const summary: Record<string, unknown> = {
  date: new Date().toISOString(),
  database,
};
const restore = process.argv.includes("--verify-restart");
if (restore) {
  const evidence = JSON.parse(
    readFileSync(evidencePath("smoke-identity.json"), "utf8"),
  );
  if (evidence.database && evidence.database !== database)
    throw Error("Restart evidence belongs to a different smoke database");
  const { connection: a } = await client(evidence.token);
  try {
    await wait(
      () =>
        [...a.db.ownShips.iter()].some(
          (s) => s.id === evidence.shipId && s.name === "Persistent Wayfarer",
        ),
      "restart persisted identity/name",
    );
    assert.equal([...a.db.ownEditReceipts.iter()].length, 1);
    await a.reducers.enterLab({ name: "Smoke Alpha" });
    const rock = sharedBodies(a).find((b) => b.id === evidence.bodyId);
    assert(rock, "authored body identity survived restart");
    if (process.env.SIDEREAL_SMOKE_PERSISTENT_ROWS_ONLY !== "1") {
      const { connection: b } = await client(evidence.collisionToken);
      try {
        await b.reducers.enterLab({ name: "Smoke Beta" });
        await wait(
          () =>
            sharedBodies(b).some(
              (r) => r.id === evidence.movingRockId && r.tick > 0n && r.vy > 0,
            ),
          "moving asteroid persisted",
        );
      } finally {
        b.disconnect();
      }
    }
    if (evidence.inventoryToken) {
      const { connection: inventory } = await client(evidence.inventoryToken);
      try {
        await inventory.reducers.enterLab({ name: "Inventory Smoke" });
        await wait(
          () => inventory.db.ownInventoryState.count() === 1n,
          "inventory survived restart",
        );
        const item = [...inventory.db.ownInventoryItems.iter()].find(
          (i) => i.id === evidence.inventoryEvidence.itemId,
        );
        assert.equal(item?.equipmentSlot, "hand");
        assert(
          [...inventory.db.ownInventoryItems.iter()].some(
            (i) => i.id === evidence.inventoryEvidence.pistolId,
          ),
          "displaced pistol UUID survives restart in carried storage",
        );
        assert.equal(
          [...inventory.db.ownInventoryState.iter()][0].revision.toString(),
          evidence.inventoryEvidence.revision,
        );
        assert(
          [...inventory.db.ownInventoryItems.iter()].some(
            (i) => i.id === evidence.inventoryEvidence.packId,
          ),
        );
      } finally {
        inventory.disconnect();
      }
    }
    if (evidence.combatToken) {
      const { connection: combat } = await client(evidence.combatToken);
      try {
        await combat.reducers.enterLab({ name: "Combat Smoke" });
        await wait(
          () => combat.db.ownCombat.count() === 1n,
          "combat survived restart",
        );
        const row = [...combat.db.ownCombat.iter()][0];
        assert.equal(row.weaponItemId, evidence.combatEvidence.itemId);
        assert.equal(row.revision.toString(), evidence.combatEvidence.revision);
        assert.equal(
          row.shotSequence.toString(),
          evidence.combatEvidence.shotSequence,
        );
        assert.equal(row.aimActive, false);
        assert(
          row.energy >= evidence.combatEvidence.energy &&
            row.energy <= row.capacity,
        );
      } finally {
        combat.disconnect();
      }
    }
    if (evidence.persistenceEvidence)
      await verifyPersistence(client, evidence.persistenceEvidence, wait);
    console.log(
      process.env.SIDEREAL_SMOKE_PERSISTENT_ROWS_ONLY === "1"
        ? "Restart persistence proof passed: ship/receipt, inventory/equipment, combat balances, and both full appearance/item/container/hotbar snapshots survived. Transient moving-body discovery was not asserted."
        : "Restart proof passed: ship UUID, name, receipt, world bodies and asteroid momentum survived.",
    );
  } finally {
    a.disconnect();
  }
} else {
  const first = await client(),
    second = await client();
  const a = first.connection,
    b = second.connection;
  try {
    await a.reducers.enterLab({ name: "Smoke Alpha" });
    await b.reducers.enterLab({ name: "Smoke Beta" });
    await a.reducers.claimInputControl({});
    await b.reducers.claimInputControl({});
    await wait(
      () => a.db.ownShips.count() === 1n && b.db.ownShips.count() === 1n,
      "two private ships",
    );
    const ship = [...a.db.ownShips.iter()][0];
    const other = [...b.db.ownShips.iter()][0];
    assert.notEqual(ship.id, other.id);
    assert.deepEqual(
      [ship.x, ship.y, other.x, other.y],
      [0, 0, 50, 0],
      "Collision proof requires the first two canonical berths. Use managed smoke --smoke-name LABEL --fresh-smoke; never reuse/reset an occupied review system.",
    );
    assert.equal(a.db.ownShips.count(), 1n);
    assert.equal(b.db.ownShips.count(), 1n);
    summary.isolated_views = true;
    await assert.rejects(
      b.reducers.renameShip({
        shipId: ship.id,
        name: "Intrusion",
        expectedRevision: ship.revision,
        operationId: "forbidden-edit",
      }),
    );
    summary.unauthorized_edit_rejected = true;
    let privateRejected = false;
    const attack = b
      .subscriptionBuilder()
      .onError(() => (privateRejected = true))
      .subscribe("SELECT * FROM ship");
    await wait(() => privateRejected, "private table rejection");
    summary.private_table_rejected = true;
    await wait(
      () =>
        sharedBodies(a).length === SHARED_SYSTEM_SEED.bodies.length &&
        sharedBodies(b).length === SHARED_SYSTEM_SEED.bodies.length,
      "canonical shared bodies",
    );
    const bodyIds = new Set(sharedBodies(a).map((r) => r.id));
    assert.deepEqual(
      new Set(sharedBodies(b).map((r) => r.id)),
      bodyIds,
      "both accounts discover the same canonical bodies",
    );
    assert.equal(
      a.db.ownSpaceBodies.count(),
      0n,
      "fresh shared entry exposes no private fixture bodies",
    );
    assert.equal(b.db.ownSpaceBodies.count(), 0n);
    assert.equal(a.db.ownWorldAdmission.count(), 1n);
    assert.equal(b.db.ownWorldAdmission.count(), 1n);
    let bodiesRejected = false;
    b.subscriptionBuilder()
      .onError(() => (bodiesRejected = true))
      .subscribe("SELECT * FROM space_body");
    await wait(() => bodiesRejected, "private body table rejected");
    await a.reducers.enterLab({ name: "Smoke Alpha" });
    assert.equal(
      sharedBodies(a).length,
      SHARED_SYSTEM_SEED.bodies.length,
      "enter is idempotent",
    );
    assert.deepEqual(
      new Set(sharedBodies(a).map((r) => r.id)),
      bodyIds,
      "catalog refresh preserves all placed body UUIDs",
    );
    const celestial = sharedBodies(a).filter((r) => r.kind === "planet");
    assert.equal(
      celestial.length,
      11,
      "all ten planet families plus a mixed world are admitted for observation",
    );
    assert(
      celestial.some((r) => r.appearance === "temperate-volcanic"),
      "mixed terrain/effect preset is server-authored",
    );
    assert(
      celestial.filter((r) => Math.hypot(r.x, r.y) > 1000).length >= 8,
      "new planet destinations are distributed across the lab",
    );
    summary.canonical_shared_bodies = true;
    // Alpha starts on the approach rock axis and can only send piloting intent. Contact and impulse must come from the
    // scheduled authority; there is no transform/velocity/collision reducer.
    for (let i = 1; i <= 45; i++) {
      await a.reducers.setIntent({
        sprint: false,
        sequence: BigInt(i),
        throttle: 1,
        turn: 0,
        dx: 0,
        dy: 0,
      });
      await new Promise((r) => setTimeout(r, 100));
    }
    await a.reducers.setIntent({
      sprint: false,
      sequence: 46n,
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
    });
    await wait(
      () =>
        sharedBodies(b).some(
          (r) => r.key === "approach-rock" && r.vy > 0 && r.tick > 0n,
        ),
      "server asteroid collision",
    );
    const movingRock = sharedBodies(b).find((r) => r.key === "approach-rock")!;
    const collisionShip = [...a.db.ownShips.iter()][0];
    assert(collisionShip.vy < 10, "ship loses forward speed on contact");
    assert(
      sharedBodies(a).find((r) => r.id === movingRock.id)!.vy > 0,
      "the same canonical rock's impulse is visible to both accounts",
    );
    summary.server_asteroid_collision = true;
    const { connection: flight } = await client();
    try {
      await flight.reducers.enterLab({ name: "IFCS proof" });
      await flight.reducers.claimInputControl({});
      await wait(() => flight.db.ownShips.count() === 1n, "IFCS fixture");
      await wait(
        () => flight.db.ownActuatorOutputs.count() === 9n,
        "bounded fixture output rows",
      );
      assert(
        [...flight.db.ownActuatorOutputs.iter()].every(
          (o) => o.shipId === [...flight.db.ownShips.iter()][0].id,
        ),
        "telemetry is scoped to own ship",
      );
      let outputRejected = false;
      flight
        .subscriptionBuilder()
        .onError(() => (outputRejected = true))
        .subscribe("SELECT * FROM actuator_output");
      await wait(() => outputRejected, "private actuator table rejected");
      let sequence = 0n;
      const commandFlight = async (throttle: number, turn: number) => {
        await flight.reducers.setIntent({
          sprint: false,
          sequence: ++sequence,
          throttle,
          turn,
          dx: 0,
          dy: 0,
        });
        await new Promise((r) => setTimeout(r, 100));
      };
      for (let i = 0; i < 6; i++) await commandFlight(1, 1);
      const moving = [...flight.db.ownShips.iter()][0];
      assert(
        Math.hypot(moving.vx, moving.vy) > 0.5 && moving.omega > 0.1,
        "available engines accelerate and turn",
      );
      for (let i = 0; i < 45; i++) await commandFlight(0, 0);
      assert(
        [...flight.db.ownActuatorOutputs.iter()].some(
          (o) => o.actuatorId.startsWith("drives-retro") && o.throttle > 0,
        ),
        "achieved retro output is subscribed",
      );
      const stopped = [...flight.db.ownShips.iter()][0];
      assert(
        Math.hypot(stopped.vx, stopped.vy) < 0.03,
        "fresh released input applies reverse thrust",
      );
      assert(
        Math.abs(stopped.omega) < 0.003,
        "fresh released input applies counter-torque",
      );
      for (let i = 0; i < 4; i++) await commandFlight(1, 1);
      await new Promise((r) => setTimeout(r, 500));
      assert(
        [...flight.db.ownActuatorOutputs.iter()].every((o) => o.throttle === 0),
        "expiry clears achieved output",
      );
      const expired = [...flight.db.ownShips.iter()][0];
      await new Promise((r) => setTimeout(r, 300));
      const coast = [...flight.db.ownShips.iter()][0];
      assert.equal(
        coast.vx,
        expired.vx,
        "expired control cannot continue assisted thrust",
      );
      assert.equal(coast.vy, expired.vy, "expired control coasts");
      assert.equal(
        coast.omega,
        expired.omega,
        "expired control cannot continue assisted torque",
      );
      await flight.reducers.useStation({});
      await commandFlight(0, 0);
      const unseated = [...flight.db.ownShips.iter()][0];
      assert.equal(
        unseated.omega,
        coast.omega,
        "walking input cannot reactivate flight computer",
      );
      summary.ifcs_engine_braking_and_authority_expiry = true;
    } finally {
      flight.disconnect();
    }

    await a.reducers.renameShip({
      shipId: ship.id,
      name: "Persistent Wayfarer",
      expectedRevision: ship.revision,
      operationId: "persistent-edit",
    });
    await a.reducers.renameShip({
      shipId: ship.id,
      name: "Persistent Wayfarer",
      expectedRevision: ship.revision,
      operationId: "persistent-edit",
    });
    await assert.rejects(
      a.reducers.renameShip({
        shipId: ship.id,
        name: "Stale",
        expectedRevision: ship.revision,
        operationId: "stale-edit",
      }),
    );
    await assert.rejects(
      a.reducers.renameShip({
        shipId: ship.id,
        name: "Wrong payload",
        expectedRevision: ship.revision,
        operationId: "persistent-edit",
      }),
    );
    await wait(
      () => a.db.ownEditReceipts.count() === 1n,
      "one idempotent receipt",
    );
    summary.revision_idempotency = true;
    await a.reducers.setIntent({
      sprint: false,
      sequence: 101n,
      throttle: 1,
      turn: 0,
      dx: 0,
      dy: 0,
    });
    await wait(() => [...a.db.ownShips.iter()][0].vy > 0, "authority thrust");
    summary.authoritative_flight = true;
    await a.reducers.useStation({});
    await assert.rejects(
      a.reducers.setIntent({
        sprint: false,
        sequence: 102n,
        throttle: 1,
        turn: 0,
        dx: 0,
        dy: 0,
      }),
    );
    summary.unseated_control_rejected = true;
    await a.reducers.setIntent({
      sprint: false,
      sequence: 103n,
      throttle: 0,
      turn: 0,
      dx: 1,
      dy: 0,
    });
    await wait(
      () => [...a.db.ownCharacters.iter()][0].localX > 0,
      "local-frame walking",
    );
    summary.authoritative_walk = true;
    await assert.rejects(
      a.reducers.setIntent({
        sprint: false,
        sequence: 104n,
        throttle: 0,
        turn: 0,
        dx: 100,
        dy: 0,
      }),
    );
    summary.invalid_input_rejected = true;
    // Anchor each short sprint near the seat so timing variance cannot make
    // the later acquisition assertion depend on network round-trip latency.
    await a.reducers.useStation({});
    await a.reducers.useStation({});
    const ownActor = () => [...a.db.ownCharacters.iter()][0];
    await a.reducers.setIntent({
      sequence: 105n,
      throttle: 0,
      turn: 0,
      dx: 1,
      dy: 0,
      sprint: true,
    });
    await wait(() => ownActor().sprinting, "authoritative sprint activation");
    const sprintX = ownActor().localX;
    assert(sprintX > 0, "sprint state accompanies server displacement");
    await a.reducers.setIntent({
      sequence: 106n,
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: true,
    });
    await wait(() => !ownActor().sprinting, "zero movement clears sprint");
    // Replayed input is an idempotent no-op, not a rejected promise. It must not
    // refresh the movement timeout or replace the newer accepted stop.
    const stopped = { x: ownActor().localX, y: ownActor().localY };
    await a.reducers.setIntent({
      sequence: 105n,
      throttle: 0,
      turn: 0,
      dx: 1,
      dy: 0,
      sprint: true,
    });
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(
      ownActor().localX,
      stopped.x,
      "stale input leaves accepted stop unchanged",
    );
    assert.equal(ownActor().localY, stopped.y);
    assert.equal(ownActor().sprinting, false);
    summary.stale_input_is_noop = true;

    await a.reducers.useStation({});
    await a.reducers.useStation({});
    await a.reducers.setIntent({
      sequence: 107n,
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: -1,
      sprint: true,
    });
    await wait(() => ownActor().sprinting, "sprint before input timeout");
    await wait(() => !ownActor().sprinting, "input timeout clears sprint");
    await a.reducers.useStation({});
    await a.reducers.setIntent({
      sequence: 108n,
      throttle: 0,
      turn: 0,
      dx: 1,
      dy: 0,
      sprint: true,
    });
    // An idle shared ship correctly emits no motion ticks. Allow consumption
    // time, then prove the seated actor cannot walk or enter sprint state.
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(ownActor().sprinting, false);
    assert.equal(ownActor().localX, 0);
    assert.equal(ownActor().localY, PILOT_LAYOUT.station.y);
    await a.reducers.useStation({});
    await a.reducers.setIntent({
      sequence: 109n,
      throttle: 0,
      turn: 0,
      dx: 1,
      dy: 0,
      sprint: true,
    });
    await wait(() => ownActor().sprinting, "sprint before station acquisition");
    await a.reducers.useStation({});
    await wait(
      () => !ownActor().sprinting,
      "station acquisition clears sprint",
    );
    await a.reducers.useStation({});
    summary.authoritative_sprint_and_resets = true;

    // Re-seat to a known server-owned position, then walk toward an actual room bulkhead.
    await a.reducers.useStation({});
    await a.reducers.useStation({});
    let sequence = 110n;
    const walkFor = async (dx: number, dy: number, duration: number) => {
      const end = Date.now() + duration;
      while (Date.now() < end) {
        await a.reducers.setIntent({
          sprint: false,
          sequence: sequence++,
          throttle: 0,
          turn: 0,
          dx,
          dy,
        });
        await new Promise((r) => setTimeout(r, 100));
      }
      await a.reducers.setIntent({
        sprint: false,
        sequence: sequence++,
        throttle: 0,
        turn: 0,
        dx: 0,
        dy: 0,
      });
    };
    await walkFor(1, 0, 1300);
    assert(
      Math.abs(ownActor().localX - 1.968) < 0.01,
      "native straight canopy blocks crew",
    );
    await walkFor(0, -1, 1200);
    assert(
      ownActor().localY >= 9.3 && ownActor().localY < 9.43,
      "native bridge rear jamb blocks crew",
    );
    await walkFor(-1, 0, 800);
    assert(
      Math.abs(ownActor().localX) < 0.2,
      "crew aligned with central bridge doorway",
    );
    await walkFor(0, -1, 1000);
    assert(
      ownActor().localY < 8.325,
      "central native doorway remains walkable",
    );
    await walkFor(1, 0, 800);
    await walkFor(0, -1, 1500);
    summary.authoritative_native_bow_collision = true;
    const atWall = [...a.db.ownCharacters.iter()][0];
    assert(
      atWall.localX > 1.5 && atWall.localX < 2.8,
      "crew reached the room partition",
    );
    assert(
      atWall.localY >= 5.65 && atWall.localY < 5.9,
      "authority stops crew at the visible bulkhead",
    );
    summary.authoritative_room_collision = true;
    const inventoryClient = await client();
    let inventoryEvidence;
    try {
      inventoryEvidence = await inventorySmoke(
        inventoryClient.connection,
        b,
        wait,
      );
    } finally {
      inventoryClient.connection.disconnect();
    }
    summary.inventory_authority_packing_equipment_hotbar_privacy = true;
    const interactionClient = await client();
    let interactionEvidence;
    try {
      interactionEvidence = await interactionSmoke(
        interactionClient.connection,
        b,
        wait,
      );
    } finally {
      interactionClient.connection.disconnect();
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    const interactionReconnect = await client(interactionClient.token);
    try {
      await interactionReconnect.connection.reducers.enterLab({
        name: "Interaction Smoke",
      });
      await wait(
        () => interactionReconnect.connection.db.ownInteractions.count() === 4n,
        "interaction reconnect",
      );
      const rows = [
        ...interactionReconnect.connection.db.ownInteractions.iter(),
      ];
      assert(
        rows.every((row) => !row.seatedByYou),
        "disconnect clears couch seat",
      );
      assert.equal(
        rows.find((row) => row.id === interactionEvidence.lightId)!.enabled,
        false,
        "grow-light state persists reconnect",
      );
    } finally {
      interactionReconnect.connection.disconnect();
    }
    summary.interaction_authority_reach_seating_lights_retry_privacy = true;
    const combatClient = await client();
    let combatEvidence;
    try {
      combatEvidence = await combatSmoke(combatClient.connection, b, wait);
    } finally {
      combatClient.connection.disconnect();
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    const combatReconnect = await client(combatClient.token);
    try {
      await combatReconnect.connection.reducers.enterLab({
        name: "Combat Smoke",
      });
      await wait(
        () => combatReconnect.connection.db.ownCombat.count() === 1n,
        "combat reconnect",
      );
      const combatRow = [...combatReconnect.connection.db.ownCombat.iter()][0];
      assert.equal(combatRow.weaponItemId, combatEvidence.itemId);
      assert.equal(combatRow.revision.toString(), combatEvidence.revision);
      assert.equal(
        combatRow.shotSequence.toString(),
        combatEvidence.shotSequence,
      );
      assert.equal(combatRow.aimActive, false);
      assert(
        combatRow.energy >= combatEvidence.energy &&
          combatRow.energy <= combatRow.capacity,
      );
    } finally {
      combatReconnect.connection.disconnect();
    }
    summary.combat_authority_energy_aim_cooldown_retry_persistence = true;
    summary.construction_authority_denials = await constructionDenialSmoke(
      a,
      b,
    );
    summary.character_components = await characterComponentsSmoke(client, wait);
    const persistenceEvidence = await persistenceSmoke(client, wait);
    summary.two_account_appearance_inventory_equipment_reconnect = true;
    if (process.env.SIDEREAL_SMOKE_OIDC_TOKEN_FILE)
      summary.real_oidc_identity_link = await identityLinkSmoke(
        client,
        readFileSync(process.env.SIDEREAL_SMOKE_OIDC_TOKEN_FILE, "utf8").trim(),
        wait,
      );
    writeFileSync(
      evidencePath("smoke-identity.json"),
      JSON.stringify({
        database,
        persistenceEvidence,
        token: first.token,
        shipId: ship.id,
        bodyId: celestial[0]!.id,
        collisionToken: second.token,
        movingRockId: movingRock.id,
        inventoryToken: inventoryClient.token,
        inventoryEvidence,
        combatToken: combatClient.token,
        combatEvidence,
      }),
      { mode: 0o600 },
    );
    writeFileSync(
      evidencePath("smoke-results.json"),
      JSON.stringify(summary, null, 2) + "\n",
    );
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    a.disconnect();
    b.disconnect();
  }
}
