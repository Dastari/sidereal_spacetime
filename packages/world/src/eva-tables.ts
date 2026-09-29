/**
 * EVA milestone 1 tables (design: wiki `Systems/EVA`). Both are private; clients read them only
 * through `own_eva_body`, `own_eva_airlock_cycle` and the discovery-filtered `visible_eva_bodies`.
 */
import { table, t } from "spacetimedb/server";

/**
 * A character outside every ship. Its existence is what "in EVA" means: the character has no
 * `construction_location` while this row exists, and `character.ship_id` keeps the ship it left
 * (camera anchor, respawn and return). World pose is f64 metres in the space-sim frame.
 */
export const evaBody = table(
  {
    name: "eva_body",
    indexes: [
      { accessor: "by_owner", algorithm: "btree", columns: ["owner"] },
      {
        accessor: "by_cell",
        algorithm: "btree",
        columns: ["systemId", "cellX", "cellY"],
      },
      { accessor: "by_anchor", algorithm: "btree", columns: ["anchorShipId"] },
    ],
  },
  {
    characterId: t.string().primaryKey(),
    owner: t.identity(),
    systemId: t.string(),
    cellX: t.i64(),
    cellY: t.i64(),
    /** "free" (jetpack) or "maglocked" (boots on a hull, pose derived from the anchor ship). */
    phase: t.string(),
    x: t.f64(),
    y: t.f64(),
    vx: t.f64(),
    vy: t.f64(),
    /** Ship heading convention: counter-clockwise, forward = (-sin h, cos h). */
    heading: t.f64(),
    /** Maglocked: the hull's ship id and the ship-local point and heading. Empty/0 when free. */
    anchorShipId: t.string(),
    localX: t.f64(),
    localY: t.f64(),
    localHeading: t.f64(),
    /** Stabiliser reference: captured ship ("" = holding the last reference) and its velocity. */
    refShipId: t.string(),
    refVx: t.f64(),
    refVy: t.f64(),
    /** Last applied input, for presentation (clip and exhaust selection). */
    forward: t.f64(),
    strafe: t.f64(),
    turn: t.f64(),
    walking: t.bool(),
    /** Ship the character left through an airlock, and the aboard visit/deck it left: the
     * owner keeps read-only views of the home ship while outside, and re-entry restores the visit
     * id so the client keeps its loaded ship scene. */
    exitShipId: t.string(),
    visitId: t.string(),
    deckId: t.string(),
    /** Emergency return beacon completion time (0 = none). */
    returnEndsMicros: t.u64(),
    serverTick: t.u64(),
    revision: t.u64(),
  },
);

/** One running airlock cycle per character and per airlock (`lock_key` = `<shipId>/<airlockId>`). */
export const evaAirlockCycle = table(
  {
    name: "eva_airlock_cycle",
    indexes: [{ accessor: "by_ship", algorithm: "btree", columns: ["shipId"] }],
  },
  {
    characterId: t.string().primaryKey(),
    lockKey: t.string().unique(),
    owner: t.identity(),
    shipId: t.string(),
    airlockId: t.string(),
    /** "out" (aboard → space) or "in" (space → aboard). */
    direction: t.string(),
    startedMicros: t.u64(),
    endsMicros: t.u64(),
  },
);

/**
 * EVA milestone 2: the suit of a character in EVA (rigid body and suit IFCS state). Private; the
 * owner reads it through `own_eva_suit`. Created when the character steps outside, removed when it
 * comes back aboard. Angular velocity lives here because a rigid body keeps its spin.
 */
export const evaSuit = table(
  { name: "eva_suit" },
  {
    characterId: t.string().primaryKey(),
    owner: t.identity(),
    /** "hold" (stabiliser: hold facing, kill relative velocity) or "free" (no stabiliser). */
    mode: t.string(),
    /** Desired facing (heading in the body's current frame) and whether one is commanded. */
    facing: t.f64(),
    facingActive: t.bool(),
    /** Angular velocity (rad/s, counter-clockwise). */
    omega: t.f64(),
    /** Mass of body, suit and carried items (kg), refreshed while outside. */
    massKg: t.f64(),
    revision: t.u64(),
  },
);
