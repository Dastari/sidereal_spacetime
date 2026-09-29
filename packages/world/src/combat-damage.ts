/**
 * Server adapter for handheld weapon damage (2026-09-28).
 *
 * The accepted shot's authoritative end point (`resolveShotImpact`) decides what takes damage:
 * - a character body: health from `character_vitals` (friendly fire is on, owner decision
 *   2026-09-28, so crewmates are hit like anyone else). At zero health the character dies: control
 *   is released like a disconnect and walking, aiming, firing, piloting and interacting are
 *   refused until the tick respawns them (`./character-death`, `RESPAWN_MICROS`). Inventory is
 *   never dropped.
 * - a placed prefab component (`mount:<id>`) on the shooter's ship, including the shooter's own:
 *   catalogue hp minus the flat per-hit armour. The catalogue damage state sets its performance;
 *   components with flight fittings (engines, RCS nozzles, the flight computer) lose availability
 *   through the server IFCS damage producer, so the ship recompiles on the flight-dirty path.
 *   Generator damage changes the finite S4-2 power solve; it never permanently damages other fittings.
 * Structure hits (walls, hull, glass, hatches) are recorded on the impact row only: prefab ships
 * have no pressure/breach model, and per-tile hull hp is deferred.
 */
import type { InferSchema, ReducerCtx, ViewCtx } from "spacetimedb/server";
import { SenderError, t } from "spacetimedb/server";
import type world from "./index";
import { readShipPrefab } from "@sidereal/content/ship-prefab";
import { prefabComponentDefinition } from "@sidereal/sim/prefab-deck-objects";
import {
  availabilityLoss,
  catalogDamageStates,
  componentDamageState,
  componentHitDamage,
  freshVitals,
  hitCharacter,
  settledVitals,
  conditionOf,
  type CharacterTarget,
} from "@sidereal/sim/combat-damage";
import { queueFlightDamage } from "./construction-flight-availability";
import { markShipSystemsDirty } from "./ship-systems-dirty";
import { markShipFlightDirty } from "./construction-flight-dirty";
import { releaseForDeath, vitalsOf } from "./character-death";
import { recordLifecycleEvent, type LifecycleCause } from "./lifecycle";

type Context = ReducerCtx<InferSchema<typeof world>>;
type ReadContext = Pick<ViewCtx<InferSchema<typeof world>>, "db" | "sender">;
/** Stored condition (a hit or respawn commits it in the same transaction); enforcement reads this.
 * Rows stored as "downed" before death existed count as dead. */
export function isDead(ctx: Pick<ReadContext, "db">, characterId: string) {
  const state = ctx.db.characterVitals.characterId.find(characterId)?.state;
  return !!state && conditionOf(state) === "dead";
}

/** Reducer guard: the sender's character must be alive to act in the world. */
export function requireAlive(ctx: Pick<ReadContext, "db" | "sender">) {
  for (const actor of ctx.db.character.by_owner.filter(ctx.sender))
    if (isDead(ctx, actor.id)) throw new SenderError("You are dead");
}

/** Characters a beam fired by `actor` can hit: same ship, same deck, standing on it. */
export function characterTargets(
  ctx: Context,
  actor: { id: string; shipId: string },
): CharacterTarget[] {
  if (!actor.shipId) return [];
  const own = ctx.db.constructionLocation.characterId.find(actor.id);
  const targets: CharacterTarget[] = [];
  let count = 0;
  for (const other of ctx.db.character.by_ship.filter(actor.shipId)) {
    if (++count > 256) break;
    if (other.id === actor.id || !other.connected) continue;
    if (isDead(ctx, other.id)) continue; // a dead body lies below the beam
    if (ctx.db.evaBody.characterId.find(other.id)) continue; // outside the hull
    if (
      ctx.db.constructionTraversal.characterId.find(other.id) ||
      ctx.db.constructionStairWalk.characterId.find(other.id)
    )
      continue;
    const location = ctx.db.constructionLocation.characterId.find(other.id);
    if (
      !!own !== !!location ||
      (own &&
        location &&
        (own.instanceId !== location.instanceId ||
          own.deckId !== location.deckId))
    )
      continue;
    targets.push({ id: other.id, x: other.localX, y: other.localY });
  }
  return targets;
}

export interface AppliedDamage {
  damage: number;
  targetState: string;
  targetHp: number;
  targetMaxHp: number;
}
const NO_DAMAGE: AppliedDamage = {
  damage: 0,
  targetState: "",
  targetHp: 0,
  targetMaxHp: 0,
};

export function damageCharacter(
  ctx: Context,
  characterId: string,
  damage: number,
  cause: LifecycleCause = { causationId: "damage:" + characterId },
): AppliedDamage {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  const row = ctx.db.characterVitals.characterId.find(characterId);
  const result = hitCharacter(
    row ? vitalsOf(row) : freshVitals(now),
    damage,
    now,
  );
  const next = {
    characterId,
    ...result.vitals,
    hitSequence: (row?.hitSequence ?? 0n) + (result.applied > 0 ? 1n : 0n),
    lastHitDamage:
      result.applied > 0 ? result.applied : (row?.lastHitDamage ?? 0),
  };
  if (row) ctx.db.characterVitals.characterId.update(next);
  else ctx.db.characterVitals.insert(next);
  // One lifecycle event per applied hit: the killing hit is the death.
  if (result.applied > 0)
    recordLifecycleEvent(
      ctx,
      {
        objectId: characterId,
        objectKind: "character",
        frameId: ctx.db.character.id.find(characterId)?.shipId,
      },
      result.killed ? "combat.death" : "combat.after_damage",
      cause,
      { damage: result.applied, health: result.vitals.health },
    );
  if (result.killed) releaseForDeath(ctx, characterId);
  return {
    damage: result.applied,
    targetState: result.killed ? "dead" : "",
    targetHp: 0,
    targetMaxHp: 0,
  };
}

type PrefabBinding = {
  doc: ReturnType<typeof readShipPrefab>;
  catalog: string;
};
const bindings = new Map<
  string,
  { source: string; binding: PrefabBinding | null }
>();
/** Parsed prefab binding of a construction instance, cached per instance revision. */
export function prefabBindingOf(instance: {
  id: string;
  revision: bigint;
  documentJson: string;
}): PrefabBinding | undefined {
  const key = instance.id + ":" + instance.revision;
  if (bindings.get(key)?.source !== instance.documentJson) {
    if (bindings.size >= 64) bindings.clear();
    bindings.set(key, {
      source: instance.documentJson,
      binding: parseBinding(instance.documentJson) ?? null,
    });
  }
  return bindings.get(key)?.binding ?? undefined;
}
function parseBinding(documentJson: string): PrefabBinding | undefined {
  try {
    const binding = (
      JSON.parse(documentJson) as {
        prefab?: { document?: unknown; catalog?: unknown };
      }
    ).prefab;
    if (!binding || typeof binding.catalog !== "string") return;
    return {
      doc: readShipPrefab(binding.document),
      catalog: binding.catalog,
    };
  } catch {
    return;
  }
}

/** Damage a placed component (`mount:<id>`) of the prefab ship `shipId`. */
export function damageComponent(
  ctx: Context,
  shipId: string,
  objectId: string,
  damage: number,
  disclose: boolean,
  cause: LifecycleCause = { causationId: "damage:" + shipId },
): AppliedDamage {
  if (!objectId.startsWith("mount:")) return NO_DAMAGE;
  const instance = ctx.db.constructionInstance.id.find(shipId);
  const binding = instance && prefabBindingOf(instance);
  const mount = binding?.doc.mounts.find(
    (m) => m.id === objectId.slice("mount:".length),
  );
  const definition =
    mount && prefabComponentDefinition(mount.component, binding!.catalog);
  if (!binding || !mount || !definition) return NO_DAMAGE;
  const id = shipId + "|" + objectId;
  const row = ctx.db.shipComponentDamage.id.find(id);
  const maxHp = row?.maxHp ?? definition.integrity.hp;
  const before = row?.hp ?? maxHp;
  const hp = Math.max(
    0,
    before - componentHitDamage(damage, definition.integrity.armor),
  );
  const applied = before - hp;
  const state = componentDamageState(
    hp,
    maxHp,
    catalogDamageStates(binding.catalog),
  );
  if (applied > 0) {
    const next = {
      id,
      shipId,
      objectId,
      componentId: mount.component,
      catalog: binding.catalog,
      hp,
      maxHp,
      state: state.state,
      performance: state.performance,
      revision: (row?.revision ?? 0n) + 1n,
      updatedMicros: ctx.timestamp.microsSinceUnixEpoch,
    };
    if (row) ctx.db.shipComponentDamage.id.update(next);
    else ctx.db.shipComponentDamage.insert(next);
    recordLifecycleEvent(
      ctx,
      {
        objectId: id,
        objectKind: "component",
        definitionRef: binding.catalog + "/" + mount.component,
        frameId: shipId,
        ownerId: shipId,
      },
      "combat.after_damage",
      cause,
      {
        damage: applied,
        hp,
        maxHp,
        state: state.state,
        previousState: row?.state ?? "pristine",
      },
    );
    // S4-1: the compiled systems budget follows the damage state.
    if (state.performance !== (row?.performance ?? 1)) {
      markShipSystemsDirty(ctx, shipId, "damage");
      // Tank and generator damage change actuator supply (prefab-flight-supply): recompile flight.
      markShipFlightDirty(ctx, shipId);
    }
  }
  return {
    damage: applied,
    // Only the ship's owner learns its systems' state (passengers see the damage dealt).
    targetState: disclose ? state.state : "",
    targetHp: disclose ? hp : 0,
    targetMaxHp: disclose ? maxHp : 0,
  };
}

/** Apply an accepted shot's damage to whatever the authoritative beam stopped at. */
export function applyShotDamage(
  ctx: Context,
  actor: {
    id: string;
    shipId: string;
    owner: { isEqual(o: unknown): boolean };
  },
  hit: { kind: string; targetId: string },
  damage: number,
  cause: LifecycleCause = {
    causationId: "shot:" + actor.id,
    actorId: actor.id,
  },
): AppliedDamage {
  if (!(damage > 0)) return NO_DAMAGE;
  if (hit.kind === "character")
    return damageCharacter(ctx, hit.targetId, damage, cause);
  if (hit.kind === "object") {
    const ship = ctx.db.ship.id.find(actor.shipId);
    return damageComponent(
      ctx,
      actor.shipId,
      hit.targetId,
      damage,
      !!ship && actor.owner.isEqual(ship.owner),
      cause,
    );
  }
  return NO_DAMAGE;
}

/**
 * Scheduled step: settle regeneration at most 4 Hz per character and push component performance
 * to flight fittings through the server damage producer. Respawn is `stepRespawns`.
 */
export function stepDamage(ctx: Context) {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  let count = 0;
  for (const row of ctx.db.characterVitals.iter()) {
    if (++count > 4096) break;
    if (conditionOf(row.state) === "dead" || row.health >= row.maxHealth)
      continue;
    if (now - row.checkpointMicros < 250_000n) continue;
    const settled = settledVitals(vitalsOf(row), now);
    if (
      settled.health !== row.health ||
      settled.checkpointMicros !== row.checkpointMicros
    )
      ctx.db.characterVitals.characterId.update({ ...row, ...settled });
  }
  count = 0;
  const ships = new Set<string>();
  for (const row of ctx.db.shipComponentDamage.iter()) {
    if (++count > 1024) break;
    if (row.performance < 1) ships.add(row.shipId);
  }
  for (const shipId of ships) pushFittingDamage(ctx, shipId);
}

/**
 * Lower each installed flight fitting of a damaged prefab ship to its target availability: its
 * own mount's physical damage-state performance. Transient power is supplied separately by S4-2. Damage never raises availability (no repair yet).
 */
function pushFittingDamage(ctx: Context, shipId: string) {
  const instance = ctx.db.constructionInstance.id.find(shipId);
  const binding = instance && prefabBindingOf(instance);
  if (!binding) return;
  const performance = new Map<string, number>();
  let revision = 0n;
  for (const row of ctx.db.shipComponentDamage.by_ship.filter(shipId)) {
    performance.set(row.objectId.slice("mount:".length), row.performance);
    if (row.revision > revision) revision = row.revision;
  }
  const perf = (mountId: string) => performance.get(mountId) ?? 1;
  const fittings = [
    ...ctx.db.constructionFlightFitting.by_ship.filter(shipId),
  ].filter((f) => f.installed && f.sourceDeviceId.startsWith("mount-"));
  const mountOf = (sourceDeviceId: string) =>
    sourceDeviceId.slice("mount-".length).split("#")[0];
  for (const fitting of fittings) {
    const target = perf(mountOf(fitting.sourceDeviceId));
    const loss = availabilityLoss(fitting.availability, target);
    if (loss === undefined) continue;
    // One event per fitting revision: while it is queued (or once consumed) nothing more is
    // queued; consumption bumps the fitting revision and the next tick queues any remainder.
    const id = `combat-damage:${fitting.id}:${fitting.revision}`;
    if (
      ctx.db.constructionFlightDamageEvent.id.find(id) ||
      ctx.db.constructionFlightReceipt.id.find(
        JSON.stringify(["server-flight-damage", id]),
      )
    )
      continue;
    try {
      queueFlightDamage(ctx, {
        id,
        sourceEventId: `combat-damage:${shipId}:${revision}`,
        shipId,
        fittingId: fitting.id,
        expectedFittingRevision: fitting.revision,
        lossFraction: loss,
      });
    } catch {
      // A full queue retries next tick; the world step must never abort on it.
    }
  }
}

export const vitalsProjection = t.row("CharacterVitalsStatus", {
  characterId: t.string().primaryKey(),
  health: t.f64(),
  maxHealth: t.f64(),
  /** active | dead */
  state: t.string(),
  /** While dead: server time (µs since the epoch) of the automatic respawn. */
  downedUntilMicros: t.u64(),
  hitSequence: t.u64(),
  lastHitDamage: t.f64(),
});
/** The actor's own health (full health when never hit). */
export function vitalsView(ctx: ReadContext) {
  const actor = [...ctx.db.character.by_owner.filter(ctx.sender)][0];
  if (!actor) return [];
  const row = ctx.db.characterVitals.characterId.find(actor.id);
  const fresh = freshVitals(0n);
  return [
    {
      characterId: actor.id,
      health: row?.health ?? fresh.health,
      maxHealth: row?.maxHealth ?? fresh.maxHealth,
      state: row ? conditionOf(row.state) : "active",
      downedUntilMicros: row?.downedUntilMicros ?? 0n,
      hitSequence: row?.hitSequence ?? 0n,
      lastHitDamage: row?.lastHitDamage ?? 0,
    },
  ];
}

export const componentDamageProjection = t.row("ShipComponentDamageStatus", {
  id: t.string().primaryKey(),
  shipId: t.string(),
  objectId: t.string(),
  componentId: t.string(),
  hp: t.f64(),
  maxHp: t.f64(),
  state: t.string(),
  performance: t.f64(),
  revision: t.u64(),
});
/** Damaged components of ships the sender owns (passengers see no owner systems state). */
export function componentDamageView(ctx: ReadContext) {
  const rows = [];
  for (const ship of ctx.db.ship.by_owner.filter(ctx.sender))
    for (const r of ctx.db.shipComponentDamage.by_ship.filter(ship.id))
      rows.push({
        id: r.id,
        shipId: r.shipId,
        objectId: r.objectId,
        componentId: r.componentId,
        hp: r.hp,
        maxHp: r.maxHp,
        state: r.state,
        performance: r.performance,
        revision: r.revision,
      });
  return rows;
}
