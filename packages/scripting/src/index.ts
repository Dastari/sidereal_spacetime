/** Stable lifecycle vocabulary shared by the authoring compiler and authority adapters.
 * This package defines contracts only: importing a binding does not execute code.
 */
export const LIFECYCLE_EVENTS = [
  "object.created",
  "object.restored",
  "object.activated",
  "object.suspended",
  "object.updated",
  "object.despawned",
  "object.destroyed",
  "component.installed",
  "component.removed",
  "component.supply_changed",
  "actor.interacted",
  "actor.entered",
  "actor.exited",
  "actor.connected",
  "actor.disconnected",
  "control.acquired",
  "control.revoked",
  "combat.before_damage",
  "combat.after_damage",
  "combat.death",
  "inventory.transferred",
  "inventory.equipped",
  "inventory.unequipped",
  "craft.started",
  "craft.completed",
  "craft.cancelled",
  "timer.fired",
  "signal.received",
  "script.upgraded",
] as const;
export type LifecycleEventKind = (typeof LIFECYCLE_EVENTS)[number];
export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface LifecycleEvent {
  id: string;
  kind: LifecycleEventKind;
  entityId: string;
  actorId?: string;
  frameId?: string;
  sequence: bigint;
  authorityTick: bigint;
  causationId: string;
  payload: Readonly<Record<string, JsonValue>>;
}
export const SCRIPT_CAPABILITIES = [
  "state.own",
  "timer.own",
  "signal.emit",
  "door.request",
  "control.request",
  "inventory.request",
  "craft.request",
  "damage.request",
  "spawn.request",
  "despawn.request",
  "presentation.emit",
] as const;
export type ScriptCapability = (typeof SCRIPT_CAPABILITIES)[number];
export interface ScriptRevision {
  id: string;
  revision: bigint;
  apiVersion: 1;
  contentHash: string;
  runtime: "compiled-typescript" | "bounded-behavior";
  hooks: readonly LifecycleEventKind[];
  capabilities: readonly ScriptCapability[];
}
export interface ScriptBinding {
  entityId: string;
  scriptId: string;
  pinnedRevision: bigint;
  stateRevision: bigint;
  stateSchemaVersion: number;
  enabled: boolean;
}
/** Validate serialized authoring input before installing a revision.
 * Signature verification, compilation, grants and state migration remain server jobs.
 */
export function validateScriptRevision(value: unknown): ScriptRevision {
  if (!value || typeof value !== "object")
    throw new Error("Invalid script revision");
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !/^[a-z][a-z0-9_.-]{1,95}$/.test(row.id))
    throw new Error("Invalid script ID");
  if (
    typeof row.revision !== "bigint" ||
    row.revision < 1n ||
    row.revision > 0xffffffffffffffffn
  )
    throw new Error("Invalid revision");
  if (row.apiVersion !== 1) throw new Error("Unsupported lifecycle API");
  if (
    typeof row.contentHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(row.contentHash)
  )
    throw new Error("Expected SHA-256");
  if (
    row.runtime !== "compiled-typescript" &&
    row.runtime !== "bounded-behavior"
  )
    throw new Error("Unsupported runtime");
  for (const [key, allowed] of [
    ["hooks", LIFECYCLE_EVENTS],
    ["capabilities", SCRIPT_CAPABILITIES],
  ] as const) {
    const list = row[key];
    if (
      !Array.isArray(list) ||
      list.length > allowed.length ||
      new Set(list).size !== list.length ||
      list.some(
        (item) =>
          typeof item !== "string" ||
          !(allowed as readonly string[]).includes(item),
      )
    )
      throw new Error(`Invalid ${key}`);
  }
  return {
    id: row.id,
    revision: row.revision,
    apiVersion: 1,
    contentHash: row.contentHash,
    runtime: row.runtime as ScriptRevision["runtime"],
    hooks: [...(row.hooks as LifecycleEventKind[])],
    capabilities: [...(row.capabilities as ScriptCapability[])],
  };
}
export type ObjectLifecycle =
  "new" | "active" | "suspended" | "despawned" | "destroyed";
/** Restore rehydrates an existing phase: it never replays creation rewards. */
export function nextLifecycle(
  current: ObjectLifecycle,
  event: LifecycleEventKind,
): ObjectLifecycle {
  if (current === "destroyed") throw new Error("Destroyed object is final");
  if (event === "object.created") {
    if (current !== "new") throw new Error("Creation may only run once");
    return "active";
  }
  if (event === "object.destroyed") return "destroyed";
  if (event === "object.activated") {
    if (current !== "suspended" && current !== "despawned")
      throw new Error("Object is not inactive");
    return "active";
  }
  if (event === "object.suspended") {
    if (current !== "active") throw new Error("Object is not active");
    return "suspended";
  }
  if (event === "object.despawned") return "despawned";
  return current;
}
