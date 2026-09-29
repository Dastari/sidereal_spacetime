/**
 * Ship logic tables (wiki `Systems/Ship Logic`). Both are private: clients read device states only
 * through `visible_ship_logic`, and never write them (presses go through `press_ship_button`).
 *
 * The wiring is not stored here: it is part of each ship's embedded prefab document (per ship,
 * authored in the Shipyard). A device without a state row is in its initial state; rows written for
 * an earlier instance revision are ignored (an in-place upgrade starts from the new initial state).
 */
import { table, t } from "spacetimedb/server";

export const shipLogicState = table(
  {
    name: "ship_logic_state",
    indexes: [{ accessor: "by_ship", algorithm: "btree", columns: ["shipId"] }],
  },
  {
    /** `<shipId>/<deviceId>`. */
    key: t.string().primaryKey(),
    shipId: t.string(),
    deviceId: t.string(),
    kind: t.string(),
    /** Construction instance revision the state belongs to. */
    instanceRevision: t.u64(),
    /** Device state JSON (bounded, `packages/sim/src/ship-logic.ts`). */
    stateJson: t.string(),
    updatedMicros: t.u64(),
  },
);

/** Wake-ups a device asked for (stage timers, door close retries). Small: active timers only. */
export const shipLogicTimer = table(
  {
    name: "ship_logic_timer",
    indexes: [{ accessor: "by_ship", algorithm: "btree", columns: ["shipId"] }],
  },
  {
    key: t.string().primaryKey(),
    shipId: t.string(),
    deviceId: t.string(),
    instanceRevision: t.u64(),
    dueMicros: t.u64(),
  },
);
