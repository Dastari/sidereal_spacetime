import {
  SHARED_SYSTEM_SEED,
  SHARED_SYSTEM_SEED_SHA256,
  LEGACY_SYSTEM_SEED,
  LEGACY_SYSTEM_SEED_SHA256,
  SOLAR_SYSTEM_BODY_LIMIT,
} from "@sidereal/content/shared-system";
import { constructionHash } from "@sidereal/sim/construction-transactions";
import { spatialCell, validateSpacePoint } from "@sidereal/sim/spatial-cells";
import type {
  SharedWorldDatabase,
  SystemBodyRow,
  BodyMotionRow,
} from "./shared-world";
export const SOLAR_MIGRATION_ID = "solar-system-r002-20260915";
export interface SolarMigrationReceipt {
  id: string;
  status: string;
  reason: string;
  beforeJson: string;
  afterSha256: string;
  createdMicros: bigint;
}
export type SolarMigrationDatabase = SharedWorldDatabase & {
  systemBody: { id: { delete(id: string): unknown } };
  bodyWorldMotion: { bodyId: { delete(id: string): unknown } };
  celestialMigrationReceipt: {
    id: { find(id: string): SolarMigrationReceipt | null | undefined };
    insert(row: SolarMigrationReceipt): unknown;
  };
};
const snapshot = (value: unknown) =>
  JSON.stringify(value, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  );
/** Called only from the authenticated database schedule, after deliberate module
 * publication. No client parameters, login trigger, player rows or reset paths.
 * All validation precedes writes; the reducer transaction commits all or none. */
export function migrateSolarSystem(
  db: SolarMigrationDatabase,
  now: bigint,
): string {
  const receipt = db.celestialMigrationReceipt.id.find(SOLAR_MIGRATION_ID);
  if (receipt) return receipt.status;
  const system = db.worldSystem.id.find(SHARED_SYSTEM_SEED.systemId);
  if (!system) return "not-installed";
  if (
    system.seedRevision === 2n &&
    system.seedSha256 === SHARED_SYSTEM_SEED_SHA256
  )
    return "current";
  const before: {
    body: SystemBodyRow;
    motion: BodyMotionRow | null | undefined;
  }[] = [];
  const refuse = (reason: string) => {
    db.celestialMigrationReceipt.insert({
      id: SOLAR_MIGRATION_ID,
      status: "refused",
      reason,
      beforeJson: snapshot({ system, bodies: before }),
      afterSha256: SHARED_SYSTEM_SEED_SHA256,
      createdMicros: now,
    });
    return "refused";
  };
  if (
    system.seedRevision !== 1n ||
    system.seedSha256 !== LEGACY_SYSTEM_SEED_SHA256 ||
    system.migrationRevision !== 1n
  )
    return refuse("Expected pinned r001 system");
  if (
    constructionHash(JSON.stringify(SHARED_SYSTEM_SEED)) !==
    SHARED_SYSTEM_SEED_SHA256
  )
    return refuse("Replacement seed hash mismatch");
  for (const body of db.systemBody.by_system.filter(system.id)) {
    if (before.length >= SOLAR_SYSTEM_BODY_LIMIT)
      return refuse("Body budget exceeded");
    before.push({ body, motion: db.bodyWorldMotion.bodyId.find(body.id) });
  }
  if (before.length !== LEGACY_SYSTEM_SEED.bodies.length)
    return refuse("Unexpected existing body set");
  for (const old of LEGACY_SYSTEM_SEED.bodies) {
    const row = before.find((value) => value.body.id === old.id);
    if (!row?.motion || row.motion.systemId !== system.id)
      return refuse("Missing or cross-system body motion");
    const body = row.body;
    if (
      body.authoredKey !== old.key ||
      body.kind !== old.kind ||
      body.appearance !== old.appearance ||
      body.seed !== old.seed ||
      body.radius !== old.radius ||
      body.height !== old.height ||
      body.massKg !== old.massKg ||
      body.charted !== (old.kind !== "asteroid")
    )
      return refuse("Existing body descriptor changed");
    try {
      validateSpacePoint(row.motion);
    } catch {
      return refuse("Invalid existing body position");
    }
  }
  const replacements = SHARED_SYSTEM_SEED.bodies.filter(
    (body) => body.kind !== "asteroid",
  );
  if (
    replacements.length +
      before.filter((row) => row.body.kind === "asteroid").length >
    SOLAR_SYSTEM_BODY_LIMIT
  )
    return refuse("Replacement body budget exceeded");
  const ids = new Set<string>();
  for (const body of replacements) {
    if (
      ids.has(body.id) ||
      db.systemBody.id.find(body.id) ||
      db.bodyWorldMotion.bodyId.find(body.id)
    )
      return refuse("Replacement identity collision");
    ids.add(body.id);
    try {
      validateSpacePoint(body);
    } catch {
      return refuse("Replacement coordinate outside world bounds");
    }
    if (
      !Number.isFinite(body.radius) ||
      body.radius <= 0 ||
      body.height + body.radius * 1.3 >= -20
    )
      return refuse("Replacement body intersects playable plane");
  }
  // Mutation begins only after the complete plan has passed preflight.
  for (const old of before)
    if (old.body.kind !== "asteroid") {
      db.bodyWorldMotion.bodyId.delete(old.body.id);
      db.systemBody.id.delete(old.body.id);
    }
  for (const body of replacements) {
    const cell = spatialCell(body);
    db.systemBody.insert({
      id: body.id,
      systemId: system.id,
      authoredKey: body.key,
      kind: body.kind,
      appearance: body.appearance,
      seed: body.seed,
      radius: body.radius,
      height: body.height,
      massKg: body.massKg,
      charted: true,
    });
    db.bodyWorldMotion.insert({
      bodyId: body.id,
      systemId: system.id,
      x: body.x,
      y: body.y,
      vx: 0,
      vy: 0,
      heading: 0,
      omega: 0,
      serverTick: system.lastSimulationTick,
      cellX: BigInt(cell.cellX),
      cellY: BigInt(cell.cellY),
    });
  }
  db.worldSystem.id.update({
    ...system,
    seedRevision: 2n,
    seedSha256: SHARED_SYSTEM_SEED_SHA256,
    migrationRevision: 2n,
  });
  db.celestialMigrationReceipt.insert({
    id: SOLAR_MIGRATION_ID,
    status: "applied",
    reason:
      "Owner-directed celestial replacement; ships, players, asteroids and historical aliases untouched",
    beforeJson: snapshot({ system, bodies: before }),
    afterSha256: SHARED_SYSTEM_SEED_SHA256,
    createdMicros: now,
  });
  return "applied";
}
