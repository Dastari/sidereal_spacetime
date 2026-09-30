/** Prefab ship smoke (isolated copied module only; see scripts/prefab_smoke_module.py).
 *
 *   python3 scripts/dev.py smoke --smoke-name prefab --fresh-smoke --prefab
 *
 * A dev identity enters the lab, the smoke-only reducer assigns a developer prefab through
 * the real installPrefabShip, and the pilot walks to the derived station, takes the seat and
 * flies with compiled-from-components flight. Asserts game access, flight admission, mass
 * against prefabStats, actuator count against the prefab flight model, and motion.
 */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { nextSequence, walkNative } from "./native-starter-smoke";
import { prefabById } from "../packages/content/src/prefabs/index";
import { prefabStats } from "../packages/content/src/ship-prefab";
import { defaultPrefabComponentCatalog } from "../packages/content/src/ship-prefab-catalog";
import { prefabFlightModel } from "../packages/sim/src/prefab-flight";
import { prefabPilotPose } from "../packages/sim/src/construction-pilot";
import {
  prefabToShipMetres,
  prefabWalkFrame,
  prefabWalkRoute,
} from "../packages/sim/src/prefab-construction";
import {
  prefabDeckBlockers,
  shipToPlanMetres,
} from "../packages/sim/src/prefab-deck-objects";
import {
  castPrefabBeam,
  prefabBeamModel,
} from "../packages/sim/src/prefab-beam";
import {
  prefabBedSeats,
  qualifyPrefabBed,
} from "../packages/sim/src/prefab-seats";
import { canOccupyDeck } from "../packages/sim/src/construction-collision";
import { evaSmoke } from "./eva-smoke-steps";
import { blastDamage, pelletAngles } from "../packages/sim/src/combat";
import { LAB_WEAPONS } from "../packages/content/src/weapons";
import { compilePrefabShipSystems } from "../packages/sim/src/prefab-ship-systems";

const host = process.env.SIDEREAL_SMOKE_URL,
  database = process.env.SIDEREAL_SMOKE_DATABASE,
  bindings = process.env.SIDEREAL_IFCS_TEST_BINDINGS;
if (
  !host ||
  !database?.endsWith("-smoke") ||
  !bindings ||
  !resolve(bindings).startsWith(resolve(".runtime/smoke-runs") + "/")
)
  throw Error("Reserved isolated prefab module bindings required");
const { DbConnection, tables } = await import(pathToFileURL(bindings).href);
const PREFAB = process.env.SIDEREAL_PREFAB_SMOKE_ID ?? "fed.s.wren";

async function wait(fn: () => boolean, label: string, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error("Timeout: " + label);
}
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ready = false;
let smokeToken = "";
const subscribed = () => [
  tables.ownCharacters,
  tables.ownShips,
  tables.ownStations,
  tables.ownInteractions,
  tables.ownConstructionSeat,
  tables.ownGameShipAccess,
  tables.ownConstructionLocation,
  tables.ownWorldAdmission,
  tables.ownAuthoredFlights,
  tables.ownAuthoredFlightFittings,
  tables.ownAuthoredFlightPhysics,
  tables.ownAuthoredFlightActuators,
  tables.ownActuatorOutputs,
  tables.ownInventoryState,
  tables.ownInventoryItems,
  tables.ownInventoryHotbar,
  tables.ownCombat,
  tables.ownCombatImpact,
  tables.visibleCombatActions,
  tables.ownCharacterVitals,
  tables.ownShipComponentDamage,
  tables.ownEvaBody,
  tables.ownEvaAirlockCycle,
  tables.visibleEvaBodies,
  tables.visibleShipLogic,
  tables.ownEvaSuit,
  tables.ownReachableCargoItems,
  tables.ownReachableCargoContainers,
  tables.ownShipPower,
  tables.ownShipPowerDevices,
  tables.ownShipNetworks,
  tables.ownShipSystemsReport,
  tables.visibleShipSystemEffects,
];
const c = DbConnection.builder()
  .withUri(host)
  .withDatabaseName(database)
  .onConnect((c: any, _identity: unknown, token: string) => {
    smokeToken = token;
    c.subscriptionBuilder()
      .onApplied(() => {
        ready = true;
      })
      .subscribe(subscribed());
  })
  .build();
const actor = () => [...c.db.ownCharacters.iter()][0] as any;
const flightOf = (shipId: string) =>
  [...c.db.ownAuthoredFlights.iter()].find(
    (f: any) => f.shipId === shipId,
  ) as any;
const physicsOf = (shipId: string) =>
  [...c.db.ownAuthoredFlightPhysics.iter()].find(
    (p: any) => p.shipId === shipId,
  ) as any;
const shipOf = (shipId: string) =>
  [...c.db.ownShips.iter()].find((s: any) => s.id === shipId) as any;
// S4-1: the server-compiled systems budget and the shared client estimate over the same inputs.
const networkOf = (shipId: string) =>
  [...c.db.ownShipNetworks.iter()].find((n: any) => n.shipId === shipId) as any;
const powerOf = (shipId: string) =>
  [...c.db.ownShipPower.iter()].find((r: any) => r.shipId === shipId) as any;
const systemsReportOf = (shipId: string) =>
  [...c.db.ownShipSystemsReport.iter()].find(
    (n: any) => n.shipId === shipId,
  ) as any;
async function expectSystemsMatchEstimate(
  shipId: string,
  label: string,
  after = 0n,
) {
  await wait(
    () =>
      networkOf(shipId)?.compileRevision > after &&
      systemsReportOf(shipId)?.compileRevision ===
        networkOf(shipId).compileRevision,
    `ship systems compiled (${label})`,
    10000,
  );
  const row = networkOf(shipId);
  const report = systemsReportOf(shipId);
  const damage = [...c.db.ownShipComponentDamage.iter()]
    .filter((d: any) => d.shipId === shipId)
    .map((d: any) => ({ objectId: d.objectId, performance: d.performance }));
  const estimate = compilePrefabShipSystems(
    prefabById(report.prefabId)!,
    report.catalog,
    damage,
  );
  assert.equal(row.access, "owner");
  assert.equal(
    report.reportJson,
    JSON.stringify(estimate.report),
    `server ship-systems compile equals the client estimate (${label})`,
  );
  assert.equal(row.generationKw, estimate.report.power.generationKw);
  assert.equal(row.destroyedComponents, estimate.destroyed);
  return row;
}

try {
  await wait(() => ready, "subscription");
  await c.reducers.enterLab({ name: "Prefab Smoke" });
  await c.reducers.claimInputControl({});
  await wait(() => !!actor(), "lab character");
  const before = actor().shipId;
  await c.reducers.assignPrefabSmokeShip({ prefabId: PREFAB });
  await wait(
    () => actor()?.shipId && actor().shipId !== before,
    "boarded prefab ship",
  );
  const shipId = actor().shipId as string;
  // Prefab assignment boards the character at the ship's trusted spawn point: the respawn target.
  const spawnPoint: [number, number] = [actor().localX, actor().localY];
  await wait(
    () =>
      [...c.db.ownGameShipAccess.iter()].some((a: any) => a.shipId === shipId),
    "prefab game access row",
    5000,
  ).catch(() => {
    const dump = (name: string, t: any) =>
      console.log(
        name,
        JSON.stringify([...t.iter()], (_, v) =>
          typeof v === "bigint" ? v.toString() : v,
        ),
      );
    dump("actor", c.db.ownCharacters);
    dump("ships", c.db.ownShips);
    dump("access", c.db.ownGameShipAccess);
    dump("location", c.db.ownConstructionLocation);
    dump("admission", c.db.ownWorldAdmission);
    dump("flights", c.db.ownAuthoredFlights);
  });
  const access = [...c.db.ownGameShipAccess.iter()].find(
    (a: any) => a.shipId === shipId,
  ) as any;
  assert(
    access && access.instanceId === shipId,
    "game ship access projected for the prefab ship",
  );
  const instanceRow = [...c.db.ownConstructionLocation.iter()][0] as any;
  assert(
    instanceRow?.instanceId === shipId,
    "character located aboard the prefab instance",
  );
  await wait(
    () => physicsOf(shipId)?.status === "ready",
    "prefab physical definition ready",
  );
  const prefab = prefabById(PREFAB)!;
  const catalog = defaultPrefabComponentCatalog();
  const stats = prefabStats(prefab, catalog);
  const model = prefabFlightModel(prefab, catalog);
  const physics = physicsOf(shipId);
  // Crew body mass rides along (one smoke character on board).
  assert(
    Math.abs(physics.massKg - stats.massKg) < 200,
    `compiled mass ${physics.massKg} ~ prefab stats ${stats.massKg}`,
  );
  const actuators = [...c.db.ownAuthoredFlightActuators.iter()].filter(
    (a: any) => a.shipId === shipId,
  );
  assert.equal(
    actuators.length,
    model.fittings.filter((f) => f.role === "actuator").length,
    "one actuator per engine/RCS nozzle",
  );
  const flight = flightOf(shipId);
  assert(
    flight?.active && flight.flightAdmitted,
    "prefab flight active and admitted",
  );
  const systemsInstalled = await expectSystemsMatchEstimate(shipId, "install");
  assert(systemsInstalled.generationKw > 0, "installed reactor generates");
  await wait(
    () =>
      [...c.db.visibleShipSystemEffects.iter()].some(
        (e: any) => e.shipId === shipId && e.power === "powered",
      ),
    "outward power effect of the own ship",
  );

  // Lower-berth/medical seats reuse the authoritative couch occupancy and CAS channel.
  const bed = prefabBedSeats(prefab, catalog).find((b) =>
    qualifyPrefabBed(prefabWalkFrame(prefab, catalog), b),
  );
  assert(bed, "current admitted prefab has a physically qualified bed seat");
  const bedId = `${shipId}:seat:${bed.placementId}`;
  await wait(
    () => [...c.db.ownInteractions.iter()].some((r: any) => r.id === bedId),
    "private admitted bed descriptor",
  );
  const bedRow = () =>
    [...c.db.ownInteractions.iter()].find((r: any) => r.id === bedId) as any;
  await assert.rejects(
    c.reducers.interactObject({
      objectId: bedId,
      action: "sit",
      expectedRevision: 999n,
      operationId: crypto.randomUUID(),
    }),
    /Object changed/i,
  );
  assert.equal(
    [...c.db.ownConstructionSeat.iter()].length,
    0,
    "failed first use creates no occupied bed",
  );
  for (const [x, y] of prefabWalkRoute(
    prefab,
    catalog,
    [actor().localX, actor().localY],
    [bed.approachX, bed.approachY],
  ))
    await walkNative(c, x, y);
  await wait(() => bedRow()?.reachable, "bed approach is reachable");
  const pack = [...c.db.ownInventoryItems.iter()].find(
    (r: any) => r.equipmentSlot === "back",
  ) as any;
  assert(pack, "starter back gear available for lower-bunk clearance proof");
  assert.equal(
    bedRow().enabled,
    false,
    "equipped back gear disables lower-bunk sit",
  );
  const bedOperation = crypto.randomUUID();
  const bedRevision = bedRow().revision;
  const sitBed = {
    objectId: bedId,
    action: "sit",
    expectedRevision: bedRevision,
    operationId: bedOperation,
  };
  await assert.rejects(
    c.reducers.interactObject(sitBed),
    /Stow back gear and equipment belt/i,
  );
  assert.equal(
    [...c.db.ownConstructionSeat.iter()].length,
    0,
    "gear refusal leaves no occupied seat",
  );
  const inventoryRevision = () =>
    ([...c.db.ownInventoryState.iter()][0] as any).revision;
  const belt = [...c.db.ownInventoryItems.iter()].find(
    (r: any) => r.definitionId === "wardrobe-t2-belt",
  ) as any;
  assert(
    belt && !belt.equipmentSlot,
    "real belt fixture stowed in carried pockets",
  );
  await c.reducers.assignInventoryHotbar({
    slot: 4,
    itemId: belt.id,
    expectedRevision: inventoryRevision(),
    operationId: crypto.randomUUID(),
  });
  await c.reducers.dropInventoryItem({
    itemId: pack.id,
    expectedRevision: inventoryRevision(),
    operationId: crypto.randomUUID(),
  });
  await wait(
    () => bedRow()?.enabled,
    "stowed back gear restores lower-bunk sit",
  );
  await c.reducers.interactObject(sitBed);
  await wait(
    () =>
      [...c.db.ownConstructionSeat.iter()].some(
        (r: any) => r.objectId === bedId,
      ),
    "seated on bed",
  );
  assert(
    Math.hypot(actor().localX - bed.seatX, actor().localY - bed.seatY) < 1e-5,
    "server-derived bed anchor",
  );
  assert.notEqual(
    flightOf(shipId)?.seatState,
    "seated",
    "bed supplies no helm control",
  );
  await c.reducers.interactObject(sitBed); // exact operation receipt retry survives incremented CAS
  const beltEquip = {
    itemId: belt.id,
    expectedRevision: inventoryRevision(),
    operationId: crypto.randomUUID(),
  };
  await assert.rejects(
    c.reducers.equipInventoryItem(beltEquip),
    /Stand from bed/i,
  );
  const packPickup = {
    itemId: pack.id,
    expectedRevision: inventoryRevision(),
    containerId: "",
    operationId: crypto.randomUUID(),
  };
  await assert.rejects(
    c.reducers.transferInventoryItem(packPickup),
    /Item is out of reach/i,
  );
  await assert.rejects(
    c.reducers.activateInventoryHotbar({
      slot: 4,
      expectedRevision: inventoryRevision(),
      operationId: crypto.randomUUID(),
    }),
    /Stand from bed/i,
  );
  assert.equal(
    inventoryRevision(),
    beltEquip.expectedRevision,
    "refused carried belt equip/hotbar and inaccessible ground pickup leave inventory CAS unchanged",
  );
  await assert.rejects(
    c.reducers.interactObject({ ...sitBed, operationId: crypto.randomUUID() }),
    /Object changed/i,
  );
  await c.reducers.interactObject({
    objectId: bedId,
    action: "stand",
    expectedRevision: bedRow().revision,
    operationId: crypto.randomUUID(),
  });
  await wait(
    () => [...c.db.ownConstructionSeat.iter()].length === 0,
    "safe bed exit",
  );
  assert(
    Math.hypot(actor().localX - bed.approachX, actor().localY - bed.approachY) <
      1e-5,
    "bed exit returns to validated approach",
  );
  await c.reducers.transferInventoryItem(packPickup); // same failed ground-pickup operation remains retryable
  await wait(
    () =>
      [...c.db.ownInventoryItems.iter()].some(
        (r: any) => r.id === pack.id && r.equipmentSlot === "back",
      ),
    "back gear restored after standing",
  );
  await c.reducers.equipInventoryItem({
    ...beltEquip,
    expectedRevision: inventoryRevision(),
  }); // failed operation ID remains usable after inventory CAS advances
  await wait(
    () =>
      [...c.db.ownInventoryItems.iter()].some(
        (r: any) => r.id === belt.id && r.equipmentSlot === "belt",
      ),
    "belt equip succeeds after standing",
  );
  console.log(
    JSON.stringify({
      bedSeat: {
        id: bedId,
        source: bed.assetId,
        seat: [bed.seatX, bed.seatY],
        approach: [bed.approachX, bed.approachY],
        facing: bed.facing,
        cas: true,
        receiptRetry: true,
        bedEquipmentSitRejected: true,
        backEquipAndHotbarRejected: true,
        noHelm: true,
      },
    }),
  );

  // Furniture collision (SHIP-INTERACTION): walk up to a blocking module and push into it.
  const blocker =
    prefabDeckBlockers(prefab, catalog).find((b) =>
      b.objectId.includes("bunk"),
    ) ?? prefabDeckBlockers(prefab, catalog)[0];
  const frame = prefabWalkFrame(prefab, catalog);
  const toShip = prefabToShipMetres(prefab);
  const toPlan = shipToPlanMetres(prefab);
  const standing = (p: [number, number]) =>
    canOccupyDeck(
      frame,
      { shipId: frame.shipId, deckId: frame.deckId, position: p },
      0.3,
    );
  const [bx0, by0, bx1, by1] = blocker.rect;
  const faces: { at: [number, number]; into: [number, number] }[] = [
    { at: [(bx0 + bx1) / 2, by0 - 0.35], into: [0, 1] },
    { at: [(bx0 + bx1) / 2, by1 + 0.35], into: [0, -1] },
    { at: [bx0 - 0.35, (by0 + by1) / 2], into: [1, 0] },
    { at: [bx1 + 0.35, (by0 + by1) / 2], into: [-1, 0] },
  ];
  const face = faces.find((f) => standing(toShip(f.at)));
  assert(face, `a standing spot beside ${blocker.objectId}`);
  for (const [x, y] of prefabWalkRoute(
    prefab,
    catalog,
    [actor().localX, actor().localY],
    toShip(face.at),
  ))
    await walkNative(c, x, y);
  // Push straight into the module for 1.5 s: the server must stop the body at its face.
  const push = toShip([face.at[0] + face.into[0], face.at[1] + face.into[1]]);
  const from = toShip(face.at);
  let deepest = Infinity;
  for (let n = 0; n < 25; n++) {
    await c.reducers.setIntent({
      sequence: nextSequence(c),
      throttle: 0,
      turn: 0,
      dx: push[0] - from[0],
      dy: push[1] - from[1],
      sprint: false,
    });
    await pause(60);
    const p = toPlan([actor().localX, actor().localY]);
    const gap = face.into[1]
      ? face.into[1] > 0
        ? by0 - p[1]
        : p[1] - by1
      : face.into[0] > 0
        ? bx0 - p[0]
        : p[0] - bx1;
    deepest = Math.min(deepest, gap);
  }
  await c.reducers.setIntent({
    sequence: nextSequence(c),
    throttle: 0,
    turn: 0,
    dx: 0,
    dy: 0,
    sprint: false,
  });
  assert(
    deepest >= 0.3 - 1e-3,
    `walking into ${blocker.objectId} stopped at its face (closest body-centre gap ${deepest.toFixed(3)} m)`,
  );
  console.log(
    JSON.stringify({
      furniture: blocker.objectId,
      closestBodyCentreGapM: deepest,
    }),
  );

  // Laser vs ship (SHIP-INTERACTION): accepted shots end where the prefab structure stops them.
  await c.reducers.claimStarterKit({});
  const item = () =>
    [...c.db.ownInventoryItems.iter()].find(
      (i: any) => i.definitionId === "compact-pistol",
    ) as any;
  await wait(() => !!item(), "starter pistol");
  await c.reducers.equipInventoryItem({
    itemId: item().id,
    expectedRevision: ([...c.db.ownInventoryState.iter()][0] as any).revision,
    operationId: crypto.randomUUID(),
  });
  await wait(
    () => [...c.db.ownCombat.iter()][0]?.weaponItemId === item().id,
    "pistol equipped",
  );
  const beam = prefabBeamModel(prefab, catalog);
  const impacts: unknown[] = [];
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    await c.reducers.setCombatAim({ active: true, angle });
    await wait(() => [...c.db.ownCombat.iter()][0]?.aimActive, "aim active");
    const combat = [...c.db.ownCombat.iter()][0] as any;
    await c.reducers.fireWeapon({
      itemId: item().id,
      expectedRevision: combat.revision,
      operationId: crypto.randomUUID(),
    });
    await wait(
      () =>
        ([...c.db.ownCombatImpact.iter()][0] as any)?.shotSequence ===
        combat.shotSequence + 1n,
      "authoritative impact row",
    );
    const impact = [...c.db.ownCombatImpact.iter()][0] as any;
    const expected = castPrefabBeam(
      beam,
      [actor().localX, actor().localY],
      angle,
      combat.rangeMeters,
    );
    assert.notEqual(impact.kind, "none", "the beam stopped on the ship");
    assert(impact.distanceM < 15, "the beam did not pass through the ship");
    assert.equal(impact.kind, expected.kind);
    assert(Math.abs(impact.distanceM - expected.distanceM) < 1e-6);
    impacts.push({
      angle,
      kind: impact.kind,
      targetId: impact.targetId,
      distanceM: impact.distanceM,
    });
    await pause(300); // pistol cooldown
  }
  await c.reducers.setCombatAim({ active: false, angle: 0 });
  console.log(JSON.stringify({ impacts }));

  // Items batch A (2026-09-29): shotgun pellets, reload, baton reach and a grenade's blast,
  // resolved by the same authoritative beam as the pistol above.
  const combatNow = () => [...c.db.ownCombat.iter()][0] as any;
  const ownAction = () =>
    [...c.db.visibleCombatActions.iter()].find(
      (r: any) => r.characterId === actor().id,
    ) as any;
  const health = () =>
    ([...c.db.ownCharacterVitals.iter()][0] as any)?.health ?? 100;
  const hold = async (definitionId: string) => {
    await c.reducers.holdPrefabSmokeWeapon({ definitionId });
    await wait(
      () => combatNow()?.weaponDefinitionId === definitionId,
      "holding " + definitionId,
    );
  };
  const fireAt = async (angle: number) => {
    await c.reducers.setCombatAim({ active: true, angle });
    await wait(() => combatNow()?.aimActive, "aim active");
    const before = combatNow();
    await c.reducers.fireWeapon({
      itemId: heldId,
      expectedRevision: before.revision,
      operationId: crypto.randomUUID(),
    });
    await wait(
      () => ownAction()?.shotSequence === before.shotSequence + 1n,
      "own combat action row",
    );
    return ownAction();
  };
  const heldId = item().id; // one item UUID; the smoke-only reducer retypes it
  await hold("shotgun");
  const pelletAngle = Math.PI / 2;
  const pelletShot = await fireAt(pelletAngle);
  const pellets = JSON.parse(pelletShot.pointsJson) as number[][];
  assert.equal(pelletShot.mode, "pellets");
  assert.equal(pelletShot.definitionId, "shotgun");
  assert.equal(pellets.length, LAB_WEAPONS.shotgun.pellets);
  pelletAngles(
    pelletAngle,
    LAB_WEAPONS.shotgun.pellets!,
    LAB_WEAPONS.shotgun.spreadRad!,
  ).forEach((a, i) => {
    const expected = castPrefabBeam(
      beam,
      [actor().localX, actor().localY],
      a,
      LAB_WEAPONS.shotgun.rangeMeters,
    );
    assert(
      Math.hypot(
        pellets[i][0] - expected.point[0],
        pellets[i][1] - expected.point[1],
      ) < 1e-6,
      `pellet ${i} ends where the authoritative beam ends`,
    );
    assert.equal(pellets[i][2], expected.kind === "none" ? 0 : 1);
  });
  const beforeReload = combatNow();
  await c.reducers.reloadWeapon({
    itemId: heldId,
    expectedRevision: beforeReload.revision,
    operationId: crypto.randomUUID(),
  });
  await wait(
    () =>
      combatNow().energy === combatNow().capacity &&
      ownAction()?.reloadSequence === 1n,
    "shotgun reloaded",
  );
  await c.reducers.setCombatAim({ active: true, angle: pelletAngle });
  await assert.rejects(
    c.reducers.fireWeapon({
      itemId: heldId,
      expectedRevision: combatNow().revision,
      operationId: crypto.randomUUID(),
    }),
    /Reloading/,
  );
  await pause(LAB_WEAPONS.shotgun.reloadMs! + 200);
  await hold("baton");
  const swing = await fireAt(pelletAngle);
  assert.equal(swing.mode, "melee");
  const reach = ([...c.db.ownCombatImpact.iter()][0] as any).distanceM;
  assert(reach <= LAB_WEAPONS.baton.rangeMeters + 1e-9, "baton reach");
  // A grenade toward the nearest wall lands 0.3 m short of it and, after the fuse, damages the
  // thrower standing inside the blast (friendly fire), with the authoritative falloff.
  const nearest = [
    ...(impacts as { angle: number; kind: string; distanceM: number }[]),
  ]
    .filter((i) => i.kind === "wall")
    .sort((a, b) => a.distanceM - b.distanceM)[0];
  await hold("grenade");
  await pause(LAB_WEAPONS.baton.cooldownMs);
  const healthBefore = health();
  const thrown = await fireAt(nearest.angle);
  assert.equal(thrown.mode, "thrown");
  assert.equal(thrown.detonated, false);
  const landGap = Math.hypot(
    thrown.landX - actor().localX,
    thrown.landY - actor().localY,
  );
  assert(
    Math.abs(landGap - Math.max(0, nearest.distanceM - 0.3)) < 1e-4,
    "lands 0.3 m short of the wall",
  );
  await wait(() => ownAction()?.detonated === true, "detonation", 5000);
  const expectedBlast = blastDamage(
    LAB_WEAPONS.grenade.damage,
    landGap,
    LAB_WEAPONS.grenade.blastRadiusM!,
    LAB_WEAPONS.grenade.blastEdgeFraction!,
  );
  await wait(
    () => ([...c.db.ownCombatImpact.iter()][0] as any)?.kind === "blast",
    "blast impact row",
  );
  const blastRow = [...c.db.ownCombatImpact.iter()][0] as any;
  assert(Math.abs(blastRow.damage - expectedBlast) < 1e-6, "blast damage");
  await wait(
    () => Math.abs(healthBefore - health() - expectedBlast) < 1e-6,
    "thrower health after the blast",
  );
  await c.reducers.setCombatAim({ active: false, angle: 0 });
  await hold("compact-pistol");
  console.log(
    JSON.stringify({
      itemsBatchA: {
        pellets: pellets.map((p) => p[2]),
        reach,
        grenade: { landGap, blastDamage: expectedBlast },
      },
    }),
  );

  // Walk from here to the derived pilot approach (around furniture), then sit.
  const pose = prefabPilotPose(model.station!);
  const spawn = { x: actor().localX, y: actor().localY };
  for (const [x, y] of prefabWalkRoute(
    prefab,
    catalog,
    [spawn.x, spawn.y],
    pose.approach,
  ))
    await walkNative(c, x, y);
  // The lab character still owns its original Wayfarer; select the prefab ship's flight row.
  const seatFlight = flightOf(shipId);
  await c.reducers.enterAuthoredPilot({
    stationId: seatFlight.stationId,
    expectedStationRevision: seatFlight.stationRevision,
    operationId: crypto.randomUUID(),
  });
  await wait(
    () => flightOf(shipId)?.seatState === "seated",
    "prefab pilot entry",
  );
  assert(
    Math.hypot(
      actor().localX - pose.position[0],
      actor().localY - pose.position[1],
    ) < 1e-3,
    "seated at the derived station",
  );

  // Fly: forward burn changes velocity; release and turn produce rotation.
  const s0 = shipOf(shipId);
  for (let n = 0; n < 20; n++) {
    await c.reducers.setIntent({
      sequence: nextSequence(c),
      throttle: 1,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
    await pause(60);
  }
  const s1 = shipOf(shipId);
  const speed = Math.hypot(s1.vx, s1.vy);
  assert(
    speed > 0.3,
    `prefab ship accelerated (speed ${speed.toFixed(3)} m/s)`,
  );
  for (let n = 0; n < 15; n++) {
    await c.reducers.setIntent({
      sequence: nextSequence(c),
      throttle: 0,
      turn: 1,
      dx: 0,
      dy: 0,
      sprint: false,
    });
    await pause(60);
  }
  assert(
    Math.abs(shipOf(shipId).heading - s0.heading) > 1e-3,
    "prefab ship turned",
  );
  const turning = shipOf(shipId);
  // Released keys ask the IFCS for rest: counter-torque from the RCS stops the spin (fly-by-wire,
  // 2026-09-29; the later steps measure in the ship frame and need a ship that is not spinning).
  for (let n = 0; n < 50; n++) {
    await c.reducers.setIntent({
      sequence: nextSequence(c),
      throttle: 0,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    });
    await pause(60);
  }
  const braked = shipOf(shipId);
  assert(
    Math.abs(braked.omega) < 0.05 &&
      Math.abs(braked.omega) < Math.abs(turning.omega),
    `released keys stop the rotation by counter-torque (${turning.omega} -> ${braked.omega} rad/s)`,
  );
  console.log(
    JSON.stringify({
      prefab: PREFAB,
      shipId,
      massKg: physics.massKg,
      actuators: actuators.length,
      speed,
      heading: shipOf(shipId).heading,
      turningOmega: turning.omega,
      brakedOmega: braked.omega,
      brakedSpeed: Math.hypot(braked.vx, braked.vy),
    }),
  );

  // Death at the helm (2026-09-28): a lethal hit on the seated pilot (real character damage
  // adapter) releases the pilot seat like a disconnect, refuses helm input, and the pilot
  // respawns aboard the ship about 8 s later.
  const vitals = () => [...c.db.ownCharacterVitals.iter()][0] as any;
  await wait(() => !!vitals(), "own vitals projected");
  assert.equal(flightOf(shipId)?.seatState, "seated", "seated before death");
  await c.reducers.damagePrefabSmokeCharacter({ damage: 1000 });
  await wait(() => vitals()?.state === "dead", "pilot killed at the helm");
  await wait(
    () => flightOf(shipId)?.seatState !== "seated",
    "death released the pilot seat",
  );
  const helmWhileDead = await c.reducers
    .setIntent({
      sequence: nextSequence(c),
      throttle: 1,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    })
    .then(
      () => "accepted",
      (e: Error) => String(e.message ?? e),
    );
  assert.notEqual(helmWhileDead, "accepted", "no helm input while dead");
  await wait(
    () => vitals()?.state === "active",
    "respawned after helm death",
    15000,
  );
  assert.equal(vitals().health, vitals().maxHealth);
  console.log(JSON.stringify({ helmDeath: { helmWhileDead } }));

  // Damage (2026-09-28): stand up and shoot the own ship's life support with the pistol until it
  // is destroyed (friendly fire on the own ship), then destroy the reactor through the real
  // damage adapter and check that the ship loses thrust on the flight-dirty path.
  await c.reducers.leaveAuthoredPilot({}).catch(() => {});
  await wait(() => flightOf(shipId)?.seatState !== "seated", "left the seat");
  assert.equal(vitals().health, vitals().maxHealth, "full health before");
  const TARGET = "mount:life";
  const targetObject = beam.objects.find((o) => o.id === TARGET);
  assert(targetObject, "life support blocks beams");
  const cx =
    targetObject.polygon.reduce((a, p) => a + p[0], 0) /
    targetObject.polygon.length;
  const cy =
    targetObject.polygon.reduce((a, p) => a + p[1], 0) /
    targetObject.polygon.length;
  let firing: [number, number] | undefined;
  for (let r = 0.75; r <= 3 && !firing; r += 0.25)
    for (let k = 0; k < 32 && !firing; k++) {
      const a = (k / 32) * Math.PI * 2;
      const at: [number, number] = [cx + Math.sin(a) * r, cy + Math.cos(a) * r];
      if (
        standing(at) &&
        castPrefabBeam(beam, at, Math.atan2(cx - at[0], cy - at[1]), 60)
          .targetId === TARGET
      )
        firing = at;
    }
  assert(firing, "a standing spot with line of fire to life support");
  for (const [x, y] of prefabWalkRoute(
    prefab,
    catalog,
    [actor().localX, actor().localY],
    firing,
  ))
    await walkNative(c, x, y);
  const componentRow = (objectId: string) =>
    [...c.db.ownShipComponentDamage.iter()].find(
      (d: any) => d.shipId === shipId && d.objectId === objectId,
    ) as any;
  const hits: { damage: number; state: string; hp: number }[] = [];
  for (let n = 0; n < 12 && componentRow(TARGET)?.state !== "destroyed"; n++) {
    const angle = Math.atan2(cx - actor().localX, cy - actor().localY);
    await c.reducers.setCombatAim({ active: true, angle });
    await wait(() => [...c.db.ownCombat.iter()][0]?.aimActive, "aim active");
    const combat = [...c.db.ownCombat.iter()][0] as any;
    await c.reducers.fireWeapon({
      itemId: item().id,
      expectedRevision: combat.revision,
      operationId: crypto.randomUUID(),
    });
    await wait(
      () =>
        ([...c.db.ownCombatImpact.iter()][0] as any)?.shotSequence ===
        combat.shotSequence + 1n,
      "damage impact row",
    );
    const impact = [...c.db.ownCombatImpact.iter()][0] as any;
    assert.equal(impact.targetId, TARGET, "the shot hit life support");
    hits.push({
      damage: impact.damage,
      state: impact.targetState,
      hp: impact.targetHp,
    });
    await pause(300);
  }
  await c.reducers.setCombatAim({ active: false, angle: 0 });
  await wait(
    () => componentRow(TARGET)?.state === "destroyed",
    "life support destroyed",
    5000,
  );
  // life-support.sm: 120 hp, armour 2; the pistol deals 15, so 13 per hit.
  assert.deepEqual(
    hits.map((h) => h.damage),
    [13, 13, 13, 13, 13, 13, 13, 13, 13, 3],
  );
  assert.deepEqual(
    hits.map((h) => h.state),
    [
      "pristine",
      "pristine",
      "scuffed",
      "scuffed",
      "damaged",
      "damaged",
      "damaged",
      "damaged",
      "damaged",
      "destroyed",
    ],
  );
  assert.equal(componentRow(TARGET).hp, 0);
  const systemsDamaged = await expectSystemsMatchEstimate(
    shipId,
    "life support destroyed",
    systemsInstalled.compileRevision,
  );
  assert(systemsDamaged.destroyedComponents >= 1, "destroyed part counted");
  assert.equal(
    vitals().health,
    vitals().maxHealth,
    "shooting a module does not hurt the shooter",
  );
  // Generation loss uses finite battery support; it does not damage unrelated flight fittings.
  const physicsBefore = physicsOf(shipId);
  await c.reducers.damagePrefabSmokeComponent({
    objectId: "mount:reactor",
    damage: 5000,
  });
  await wait(
    () => componentRow("mount:reactor")?.state === "destroyed",
    "reactor destroyed",
  );
  await wait(
    () => powerOf(shipId)?.generationW === 0 && powerOf(shipId)?.energyJ > 0,
    "finite battery supports destroyed reactor",
  );
  const batteryBefore = powerOf(shipId).energyJ;
  await pause(200);
  assert(
    powerOf(shipId).energyJ < batteryBefore,
    "battery joules debited without generation",
  );
  assert(powerOf(shipId).corePowered, "battery still powers intact core");
  assert(
    JSON.parse(physicsOf(shipId).envelopeJson).forward > 0,
    "finite battery supports compiled forward thrust",
  );
  await c.reducers.damagePrefabSmokeComponent({
    objectId: "mount:battery",
    damage: 5000,
  });
  await wait(
    () => powerOf(shipId)?.energyJ === 0 && !powerOf(shipId)?.corePowered,
    "destroyed battery leaves dark bus",
  );
  await wait(
    () =>
      physicsOf(shipId)?.status !== "pending" &&
      physicsOf(shipId)?.revision > physicsBefore.revision &&
      JSON.parse(physicsOf(shipId).envelopeJson).forward === 0,
    "flight recompiled after damage",
    10000,
  );
  const envelope = JSON.parse(physicsOf(shipId).envelopeJson);
  assert.equal(
    envelope.forward,
    0,
    "no forward thrust after generation and storage are lost",
  );
  const systemsDark = await expectSystemsMatchEstimate(
    shipId,
    "reactor destroyed",
    systemsDamaged.compileRevision,
  );
  assert.equal(systemsDark.generationKw, 0, "no generation without a reactor");
  assert.equal(systemsDark.cruiseBrownout, true, "cruise browns out");
  console.log(
    JSON.stringify({
      s41: {
        install: {
          compileRevision: String(systemsInstalled.compileRevision),
          status: systemsInstalled.status,
          generationKw: systemsInstalled.generationKw,
          cruiseBalanceKw: systemsInstalled.cruiseBalanceKw,
        },
        lifeSupportDestroyed: {
          compileRevision: String(systemsDamaged.compileRevision),
          destroyed: systemsDamaged.destroyedComponents,
        },
        reactorDestroyed: {
          compileRevision: String(systemsDark.compileRevision),
          generationKw: systemsDark.generationKw,
          cruiseBalanceKw: systemsDark.cruiseBalanceKw,
        },
      },
    }),
  );
  const reseat = flightOf(shipId);
  let seated = true;
  for (const [x, y] of prefabWalkRoute(
    prefab,
    catalog,
    [actor().localX, actor().localY],
    pose.approach,
  ))
    await walkNative(c, x, y);
  await c.reducers
    .enterAuthoredPilot({
      stationId: reseat.stationId,
      expectedStationRevision: reseat.stationRevision,
      operationId: crypto.randomUUID(),
    })
    .catch(() => {
      seated = false;
    });
  if (seated)
    await wait(() => flightOf(shipId)?.seatState === "seated", "reseated");
  const v0 = shipOf(shipId);
  await assert.rejects(
    c.reducers.setIntent({
      sequence: nextSequence(c),
      throttle: 1,
      turn: 0,
      dx: 0,
      dy: 0,
      sprint: false,
    }),
    /Occupy the control station to pilot/,
    "dark core refuses flight intent",
  );
  await pause(1200);
  const v1 = shipOf(shipId);
  const burnDelta = Math.hypot(v1.vx - v0.vx, v1.vy - v0.vy);
  assert(
    burnDelta < 0.05,
    `dark ship coasts without thrust or free braking (velocity change ${burnDelta.toFixed(3)} m/s)`,
  );
  console.log(
    JSON.stringify({
      damage: {
        weaponTarget: TARGET,
        hits,
        reactor: componentRow("mount:reactor").state,
        forwardEnvelope: [
          JSON.parse(physicsBefore.envelopeJson).forward,
          envelope.forward,
        ],
        envelope,
        reseated: seated,
        burnDeltaMps: burnDelta,
      },
    }),
  );

  // Death and respawn (2026-09-28, owner: "Death, die and respawn, no loss of inventory yet."):
  // a lethal hit through the real character damage adapter while seated at the helm kills the
  // pilot, releases the seat, refuses every action and respawns them aboard Wren at its spawn
  // point with full health after RESPAWN_MICROS; inventory is unchanged. Then the same again
  // with a disconnect while dead.
  const inventorySnapshot = (conn: any) =>
    JSON.stringify(
      [...conn.db.ownInventoryItems.iter()]
        .map((i: any) => [i.id, i.definitionId, i.containerId, i.revision])
        .sort(),
      (_, v) => (typeof v === "bigint" ? v.toString() : v),
    );
  // Die away from the spawn point so the respawn relocation is observable.
  if (seated) {
    await c.reducers.leaveAuthoredPilot({});
    await wait(() => flightOf(shipId)?.seatState !== "seated", "stood up");
  }
  for (const [x, y] of prefabWalkRoute(
    prefab,
    catalog,
    [actor().localX, actor().localY],
    firing,
  ))
    await walkNative(c, x, y);
  const corpseGap = Math.hypot(
    actor().localX - spawnPoint[0],
    actor().localY - spawnPoint[1],
  );
  assert(corpseGap > 1, `died away from the spawn point (${corpseGap} m)`);
  const inventoryBefore = inventorySnapshot(c);
  const locationOf = (conn: any) =>
    [...conn.db.ownConstructionLocation.iter()][0] as any;
  const spawnDeck = locationOf(c)?.deckId;
  const killedAt = Date.now();
  await c.reducers.damagePrefabSmokeCharacter({ damage: 1000 });
  await wait(() => vitals()?.state === "dead", "character dead");
  assert.equal(vitals().health, 0);
  const refusals: string[] = [];
  const refused = async (label: string, call: () => Promise<unknown>) => {
    const error = await call().then(
      () => undefined,
      (e: Error) => e,
    );
    assert(error, `${label} refused while dead`);
    assert.match(String(error.message ?? error), /dead/, label);
    refusals.push(label);
  };
  await refused("aim", () =>
    c.reducers.setCombatAim({ active: true, angle: 0 }),
  );
  await refused("fire", () =>
    c.reducers.fireWeapon({
      itemId: item().id,
      expectedRevision: ([...c.db.ownCombat.iter()][0] as any).revision,
      operationId: crypto.randomUUID(),
    }),
  );
  const station = flightOf(shipId);
  await refused("pilot", () =>
    c.reducers.enterAuthoredPilot({
      stationId: station.stationId,
      expectedStationRevision: station.stationRevision,
      operationId: crypto.randomUUID(),
    }),
  );
  await refused("inventory", () =>
    c.reducers.equipInventoryItem({
      itemId: item().id,
      expectedRevision: ([...c.db.ownInventoryState.iter()][0] as any).revision,
      operationId: crypto.randomUUID(),
    }),
  );
  const corpse = [actor().localX, actor().localY];
  for (let n = 0; n < 8; n++) {
    await c.reducers.setIntent({
      sequence: nextSequence(c),
      throttle: 0,
      turn: 0,
      dx: 1,
      dy: 0,
      sprint: true,
    });
    await pause(60);
  }
  assert.deepEqual(
    [actor().localX, actor().localY],
    corpse,
    "a dead body does not walk",
  );
  await wait(() => vitals()?.state === "active", "respawned", 15000);
  const deadForMs = Date.now() - killedAt;
  assert(
    deadForMs > 7000 && deadForMs < 11000,
    `respawn after about 8 s (${deadForMs} ms)`,
  );
  assert.equal(vitals().health, vitals().maxHealth, "full health on respawn");
  const respawnGap = Math.hypot(
    actor().localX - spawnPoint[0],
    actor().localY - spawnPoint[1],
  );
  assert(respawnGap <= 2.3, `respawned at the spawn point (${respawnGap} m)`);
  assert.equal(actor().shipId, shipId, "respawned aboard the own ship");
  assert.equal(locationOf(c)?.deckId, spawnDeck, "respawned on the spawn deck");
  assert.equal(inventorySnapshot(c), inventoryBefore, "inventory unchanged");
  // Alive again: aiming is accepted.
  await c.reducers.setCombatAim({ active: true, angle: 0 });
  await c.reducers.setCombatAim({ active: false, angle: 0 });

  // Disconnect while dead: the retained body respawns on the server; the reconnected session
  // finds the character alive aboard Wren with the same inventory.
  await c.reducers.damagePrefabSmokeCharacter({ damage: 1000 });
  await wait(() => vitals()?.state === "dead", "character dead again");
  c.disconnect();
  await pause(9500);
  let readyAgain = false;
  const again = DbConnection.builder()
    .withUri(host)
    .withDatabaseName(database)
    .withToken(smokeToken)
    .onConnect((conn: any) =>
      conn
        .subscriptionBuilder()
        .onApplied(() => {
          readyAgain = true;
        })
        .subscribe(subscribed()),
    )
    .build();
  try {
    await wait(() => readyAgain, "reconnected subscription");
    await again.reducers.enterLab({ name: "Prefab Smoke" });
    const vitalsAgain = () => [...again.db.ownCharacterVitals.iter()][0] as any;
    const actorAgain = () => [...again.db.ownCharacters.iter()][0] as any;
    await wait(() => actorAgain()?.connected && !!vitalsAgain(), "rejoined");
    assert.equal(vitalsAgain().state, "active", "respawned while offline");
    assert.equal(vitalsAgain().health, vitalsAgain().maxHealth);
    assert.equal(actorAgain().shipId, shipId);
    const offlineGap = Math.hypot(
      actorAgain().localX - spawnPoint[0],
      actorAgain().localY - spawnPoint[1],
    );
    assert(
      offlineGap <= 2.3,
      `offline respawn at the spawn point (${offlineGap} m)`,
    );
    await wait(
      () => inventorySnapshot(again) === inventoryBefore,
      "inventory unchanged after offline respawn",
      5000,
    );
    console.log(
      JSON.stringify({
        death: {
          refusals,
          deadForMs,
          corpseGapM: corpseGap,
          respawnGapM: respawnGap,
          offlineRespawnGapM: offlineGap,
          inventoryItems: JSON.parse(inventoryBefore).length,
        },
      }),
    );
    // EVA milestone 2: buttons, interlocked cycle, same-plane walk out, hull, ride along, back in.
    console.log(
      JSON.stringify(
        { eva: await evaSmoke(again, shipId, prefab, catalog) },
        (_, v) => (typeof v === "bigint" ? v.toString() : v),
      ),
    );
  } finally {
    again.disconnect();
  }
  console.log("prefab smoke passed");
} finally {
  c.disconnect();
}
