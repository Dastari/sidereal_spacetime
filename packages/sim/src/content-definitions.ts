/**
 * Content definition registry rules (roadmap batch X-1, wiki `Systems/Content Definitions`).
 *
 * Pure and shared: the world reducers, the Studio preview and the tests call the same kind
 * registry, field schemas and validators, so a Studio form never accepts what the server rejects.
 * A definition is `kind:id`; each publish freezes an immutable `kind:id@revision`. Runtime code
 * still reads the TypeScript catalogues until X-2 switches items and weapons to pinned revisions.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  CHARACTER_COMPONENTS,
  CHARACTER_EQUIPMENT_SLOTS,
} from "@sidereal/content/character-components";
import { CREW_WARDROBE } from "@sidereal/content/crew-wardrobe";
import {
  HANDHELD_DEFINITIONS,
  LEGACY_HANDHELD_ART,
  LIQUID_DENSITY_KG_PER_LITRE,
} from "@sidereal/content/inventory";
import { stableStringify } from "./layout-geometry";

/** Every Tier D kind from the roadmap. A kind exists when it has a registered validator. */
export const DEFINITION_KINDS = [
  "item",
  "weapon",
  "component",
  "loot_table",
  "interaction",
  "resource",
  "recipe",
  "facility",
  "market",
  "quest",
  "dialogue",
  "npc_profile",
  "faction",
  "spawn_table",
  "behaviour",
  "logic_kit",
  "station_service",
  "drive",
] as const;
export type DefinitionKind = (typeof DEFINITION_KINDS)[number];
export const DEFINITION_CAPABILITIES = [
  "definition.read",
  "definition.write",
  "definition.publish",
] as const;
export type DefinitionCapability = (typeof DEFINITION_CAPABILITIES)[number];
export const DEFINITION_LIMITS = {
  /** Canonical payload bytes. The largest seeded item is about 340 bytes. */
  payloadBytes: 16384,
  definitionsPerKind: 2048,
  revisionsPerDefinition: 256,
  receiptsPerPrincipal: 4096,
  /** Rows `refresh_definition_usage` may scan in one transaction. */
  usageScanRows: 200000,
} as const;
/** Definition IDs are lowercase, stable and URL-safe (`compact-pistol`, `wardrobe-t1-chest`). */
export const DEFINITION_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const OPERATION_ID_PATTERN = /^[a-zA-Z0-9:_./-]{1,80}$/;
/**
 * Until X-2 records explicit pins, every existing instance (for example an `inventory_item`) uses
 * the code catalogue, which the seed import reproduces exactly as revision 1.
 */
export const IMPLICIT_PIN_REVISION = 1n;
export const DEFINITION_WORKSPACE_PREFIX = "definitions:";

export const isDefinitionKind = (v: unknown): v is DefinitionKind =>
  typeof v === "string" && (DEFINITION_KINDS as readonly string[]).includes(v);
export const isDefinitionCapability = (v: unknown): v is DefinitionCapability =>
  typeof v === "string" &&
  (DEFINITION_CAPABILITIES as readonly string[]).includes(v);
export const definitionWorkspace = (kind: DefinitionKind) =>
  DEFINITION_WORKSPACE_PREFIX + kind;
export function definitionKindOfWorkspace(
  workspaceId: string,
): DefinitionKind | null {
  if (!workspaceId.startsWith(DEFINITION_WORKSPACE_PREFIX)) return null;
  const kind = workspaceId.slice(DEFINITION_WORKSPACE_PREFIX.length);
  return isDefinitionKind(kind) ? kind : null;
}
/**
 * Grant scope rule shared by `set_construction_grant` and `operator_set_definition_grant`:
 * definition capabilities only on `definitions:<registered kind>`; construction capabilities
 * never on a definitions workspace (except `grant.manage`, which delegates grant editing).
 */
export function validGrantScope(workspaceId: string, capability: string) {
  const definitions = workspaceId.startsWith(DEFINITION_WORKSPACE_PREFIX);
  if (isDefinitionCapability(capability))
    return definitionKindOfWorkspace(workspaceId) !== null;
  if (!definitions) return true;
  return (
    capability === "grant.manage" &&
    definitionKindOfWorkspace(workspaceId) !== null
  );
}
/** Read is implied by write or publish; write and publish are separate duties. */
export function grantAllows(
  held: DefinitionCapability,
  needed: DefinitionCapability,
) {
  return held === needed || needed === "definition.read";
}
export const definitionKey = (kind: DefinitionKind, definitionId: string) =>
  `${kind}:${definitionId}`;
export const definitionRef = (
  kind: DefinitionKind,
  definitionId: string,
  revision: bigint | number,
) => `${kind}:${definitionId}@${revision}`;
export function parseDefinitionRef(ref: string): {
  kind: DefinitionKind;
  definitionId: string;
  revision: bigint;
} {
  const m = /^([a-z_]+):([a-z0-9][a-z0-9._-]{0,79})@([1-9][0-9]{0,9})$/.exec(
    ref,
  );
  if (!m || !isDefinitionKind(m[1]))
    throw Error("Invalid definition reference " + JSON.stringify(ref));
  return { kind: m[1], definitionId: m[2], revision: BigInt(m[3]) };
}

// ---------------------------------------------------------------------------------------------
// Field schemas: one description drives validation here and form generation in the Studio.

export type FieldSpec =
  | {
      key: string;
      type: "string";
      label: string;
      required?: boolean;
      minLength?: number;
      maxLength: number;
      pattern?: RegExp;
      patternHint?: string;
      options?: readonly string[];
      help?: string;
    }
  | {
      key: string;
      type: "number";
      label: string;
      required?: boolean;
      integer?: boolean;
      min: number;
      max: number;
      /** Strictly greater than `min`. */
      exclusiveMin?: boolean;
      unit?: string;
      help?: string;
    }
  | {
      key: string;
      type: "boolean";
      label: string;
      required?: boolean;
      help?: string;
    }
  | {
      key: string;
      type: "object";
      label: string;
      required?: boolean;
      fields: readonly FieldSpec[];
      help?: string;
    }
  | {
      /** Free JSON object (planned kinds until their batch defines real fields). */
      key: string;
      type: "json";
      label: string;
      required?: boolean;
      help?: string;
    };
export interface DefinitionIssue {
  path: string;
  message: string;
}
type Payload = Record<string, unknown>;
export interface DefinitionKindSpec {
  kind: DefinitionKind;
  label: string;
  description: string;
  /** `seeded`: validator and seed ship in X-1; `planned`: envelope only until `landsIn`. */
  stage: "seeded" | "planned";
  /** Batch that makes this kind publishable and gives it a runtime consumer. */
  landsIn: string;
  /** Studio batch with the dedicated editor. */
  studioEditor: string;
  runtimeConsumer: string;
  seededFrom: string;
  /** Changes whenever the schema or rules change; stored on every revision. */
  validator: string;
  fields: readonly FieldSpec[];
  rules?: (value: Payload, definitionId: string) => DefinitionIssue[];
  /** Rules between the previous published revision and the next one. */
  revisionRules?: (previous: Payload, next: Payload) => DefinitionIssue[];
  template: (definitionId: string) => Payload;
}

const text = (
  key: string,
  label: string,
  maxLength: number,
  extra: Partial<Extract<FieldSpec, { type: "string" }>> = {},
): FieldSpec => ({ key, type: "string", label, maxLength, ...extra });
const num = (
  key: string,
  label: string,
  min: number,
  max: number,
  extra: Partial<Extract<FieldSpec, { type: "number" }>> = {},
): FieldSpec => ({ key, type: "number", label, min, max, ...extra });
const flag = (key: string, label: string, help?: string): FieldSpec => ({
  key,
  type: "boolean",
  label,
  ...(help ? { help } : {}),
});
const ASSET_ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const ICON_URL =
  /^\/assets\/[A-Za-z0-9/_.-]{1,240}(\?[A-Za-z0-9=&_.-]{1,40})?$/;

const EQUIP_SLOTS = [...CHARACTER_EQUIPMENT_SLOTS, "hand"] as const;
const CHARACTER_COMPONENT_IDS = CHARACTER_COMPONENTS.map((c) => c.id);
const WARDROBE_IDS = CREW_WARDROBE.map((w) => w.id);
const CREW_ITEM_IDS = [
  ...new Set([
    ...HANDHELD_DEFINITIONS.flatMap((d) =>
      d.crewItemId ? [d.crewItemId] : [],
    ),
    ...Object.values(LEGACY_HANDHELD_ART),
  ]),
].sort();

const ITEM_FIELDS: readonly FieldSpec[] = [
  text("id", "Definition ID", 80, {
    required: true,
    pattern: DEFINITION_ID_PATTERN,
    patternHint: "lowercase letters, digits, '.', '_' or '-'",
    help: "Must equal the definition ID. Stable forever; instances refer to it.",
  }),
  text("name", "Name", 80, { required: true, minLength: 1 }),
  num("width", "Grid width", 1, 16, {
    required: true,
    integer: true,
    unit: "cells",
  }),
  num("height", "Grid height", 1, 16, {
    required: true,
    integer: true,
    unit: "cells",
  }),
  num("massKg", "Mass", 0, 1000, { required: true, unit: "kg" }),
  text("assetId", "World model asset", 80, {
    required: true,
    pattern: ASSET_ID,
    patternHint: "an asset ID",
  }),
  text("equipSlot", "Equip slot", 20, { options: EQUIP_SLOTS }),
  text("characterComponentId", "Character component", 80, {
    options: CHARACTER_COMPONENT_IDS,
  }),
  text("wardrobeId", "Crew wardrobe item", 80, { options: WARDROBE_IDS }),
  text("iconUrl", "Grid icon", 300, {
    pattern: ICON_URL,
    patternHint: "a /assets/... path",
  }),
  text("pose", "Hold pose", 10, { options: ["pistol", "rifle"] }),
  {
    key: "storage",
    type: "object",
    label: "Container grid",
    help: "Items with storage open a grid of their own (backpacks).",
    fields: [
      num("width", "Width", 1, 32, {
        required: true,
        integer: true,
        unit: "cells",
      }),
      num("height", "Height", 1, 32, {
        required: true,
        integer: true,
        unit: "cells",
      }),
      num("maxMassKg", "Max mass", 0, 1000, {
        required: true,
        unit: "kg",
        exclusiveMin: true,
      }),
    ],
  },
  {
    key: "reservoir",
    type: "object",
    label: "Liquid reservoir",
    fields: [
      num("capacityLitres", "Capacity", 0, 1000, {
        required: true,
        unit: "L",
        exclusiveMin: true,
      }),
      text("liquidType", "Liquid", 20, {
        required: true,
        options: Object.keys(LIQUID_DENSITY_KG_PER_LITRE),
      }),
    ],
  },
  text("crewItemId", "Handheld art (r001)", 80, { options: CREW_ITEM_IDS }),
  text("category", "Category", 20, {
    options: ["weapon", "medical", "tool", "utility"],
  }),
  text("role", "Role label", 80),
  flag("twoHanded", "Two-handed"),
  num("maxStack", "Max stack", 1, 999, {
    integer: true,
    help: "Nothing stacks yet (S5-1); keep 1.",
  }),
  flag(
    "legacy",
    "Legacy footprint",
    "Owned before r001: footprint and mass may never grow.",
  ),
];

const WEAPON_MODES = ["beam", "pellets", "melee", "thrown"] as const;
const WEAPON_FIELDS: readonly FieldSpec[] = [
  num("capacity", "Energy capacity", 1, 10000, {
    required: true,
    integer: true,
    unit: "units",
  }),
  num("shotCost", "Energy per shot", 0, 10000, {
    required: true,
    integer: true,
    unit: "units",
  }),
  num("cooldownMs", "Cooldown", 0, 60000, {
    required: true,
    integer: true,
    unit: "ms",
  }),
  num("rangeMeters", "Range", 0, 2000, {
    required: true,
    exclusiveMin: true,
    unit: "m",
  }),
  num("damage", "Damage", 0, 10000, {
    required: true,
    help: "Per shot; per pellet for pellets; at the centre for thrown.",
  }),
  text("mode", "Fire mode", 10, {
    options: WEAPON_MODES,
    help: "Absent means beam.",
  }),
  num("pellets", "Pellets", 1, 64, { integer: true }),
  num("spreadRad", "Pellet cone", 0, Math.PI, { unit: "rad" }),
  num("reloadMs", "Reload time", 0, 60000, {
    integer: true,
    unit: "ms",
    help: "Absent means no manual reload (melee, thrown).",
  }),
  num("stunMs", "Stun on hit", 0, 60000, { integer: true, unit: "ms" }),
  num("blastRadiusM", "Blast radius", 0, 50, { exclusiveMin: true, unit: "m" }),
  num("blastEdgeFraction", "Blast edge fraction", 0, 1),
  num("fuseMs", "Fuse", 0, 60000, { integer: true, unit: "ms" }),
];

function itemRules(v: Payload, definitionId: string): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  if (v.id !== definitionId)
    issues.push({ path: "id", message: "Must equal the definition ID" });
  if ((v.characterComponentId || v.wardrobeId) && !v.equipSlot)
    issues.push({
      path: "equipSlot",
      message: "Wearable items need an equip slot",
    });
  if (v.characterComponentId && v.wardrobeId)
    issues.push({
      path: "wardrobeId",
      message: "Use a character component or a wardrobe item, not both",
    });
  if (v.pose && v.equipSlot !== "hand")
    issues.push({ path: "pose", message: "Only hand items have a hold pose" });
  if (v.storage && v.reservoir)
    issues.push({
      path: "reservoir",
      message: "An item is a container or a reservoir, not both",
    });
  return issues;
}
function itemRevisionRules(previous: Payload, next: Payload) {
  const issues: DefinitionIssue[] = [];
  if (previous.legacy === true) {
    const area = (p: Payload) => Number(p.width) * Number(p.height);
    if (next.legacy !== true)
      issues.push({ path: "legacy", message: "A legacy item stays legacy" });
    if (
      Number(next.width) > Number(previous.width) ||
      Number(next.height) > Number(previous.height) ||
      area(next) > area(previous)
    )
      issues.push({
        path: "width",
        message: "A legacy item's footprint may not grow (placed instances)",
      });
    if (Number(next.massKg) > Number(previous.massKg))
      issues.push({
        path: "massKg",
        message: "A legacy item's mass may not grow (carried mass)",
      });
  }
  return issues;
}
function weaponRules(v: Payload): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const mode = (v.mode as string | undefined) ?? "beam";
  if (Number(v.shotCost) > Number(v.capacity))
    issues.push({
      path: "shotCost",
      message: "A shot cannot cost more than the capacity",
    });
  const need = (key: string, when: boolean, what: string) => {
    if (when && v[key] === undefined)
      issues.push({ path: key, message: `Required for ${what}` });
    if (!when && v[key] !== undefined)
      issues.push({ path: key, message: `Only used by ${what}` });
  };
  need("pellets", mode === "pellets", "pellets mode");
  need("spreadRad", mode === "pellets", "pellets mode");
  need("blastRadiusM", mode === "thrown", "thrown mode");
  need("fuseMs", mode === "thrown", "thrown mode");
  if (mode !== "thrown" && v.blastEdgeFraction !== undefined)
    issues.push({
      path: "blastEdgeFraction",
      message: "Only used by thrown mode",
    });
  return issues;
}

const ENVELOPE_FIELDS: readonly FieldSpec[] = [
  text("name", "Name", 80, { required: true, minLength: 1 }),
  text("notes", "Designer notes", 2000),
  {
    key: "data",
    type: "json",
    label: "Data (free JSON until the kind's batch defines fields)",
  },
];
function planned(
  kind: DefinitionKind,
  label: string,
  description: string,
  landsIn: string,
  studioEditor: string,
  runtimeConsumer: string,
  seededFrom = "New",
): DefinitionKindSpec {
  return {
    kind,
    label,
    description,
    stage: "planned",
    landsIn,
    studioEditor,
    runtimeConsumer,
    seededFrom,
    validator: `${kind}/envelope-v1`,
    fields: ENVELOPE_FIELDS,
    template: () => ({ name: "Untitled" }),
  };
}

export const DEFINITION_KIND_SPECS: Readonly<
  Record<DefinitionKind, DefinitionKindSpec>
> = {
  item: {
    kind: "item",
    label: "Items",
    description:
      "Inventory items: footprint, mass, slots, container grid, reservoir, art.",
    stage: "seeded",
    landsIn: "X-1",
    studioEditor: "ST-3",
    runtimeConsumer: "Inventory (S5), from X-2",
    seededFrom:
      "INVENTORY_DEFINITIONS (lab items, r001 handhelds, armour, wardrobe)",
    validator: "item/v1",
    fields: ITEM_FIELDS,
    rules: itemRules,
    revisionRules: itemRevisionRules,
    template: (id) => ({
      id,
      name: "New item",
      width: 1,
      height: 1,
      massKg: 1,
      assetId: id,
      maxStack: 1,
    }),
  },
  weapon: {
    kind: "weapon",
    label: "Weapons",
    description:
      "Handheld weapon rules for the item with the same ID: energy, damage, cooldown, range, mode.",
    stage: "seeded",
    landsIn: "X-1",
    studioEditor: "ST-3",
    runtimeConsumer: "Combat (S12), from X-2",
    seededFrom: "LAB_WEAPONS",
    validator: "weapon/v1",
    fields: WEAPON_FIELDS,
    rules: weaponRules,
    template: () => ({
      capacity: 100,
      shotCost: 10,
      cooldownMs: 250,
      rangeMeters: 60,
      damage: 10,
      reloadMs: 1500,
    }),
  },
  component: planned(
    "component",
    "Ship components",
    "Size, sockets, mass, hp, damage states, power, heat, coolant, fuel, data, ports, kind stats.",
    "X-3",
    "ST-4",
    "Flight compile, networks, combat",
    "ship-components-source.ts (revision 4)",
  ),
  loot_table: planned(
    "loot_table",
    "Loot tables",
    "Weighted entries, quantity ranges, conditions.",
    "X-3",
    "ST-3",
    "Destruction profiles, wrecks, pirates, quests",
  ),
  interaction: planned(
    "interaction",
    "Interactions",
    "Verbs, reach, approach point, required tool, permission.",
    "X-3",
    "ST-6",
    "Interactions, logic (S2)",
    "LAB_INTERACTIONS",
  ),
  resource: planned(
    "resource",
    "Resources",
    "Ore composition and resource properties.",
    "S6-1",
    "ST-14",
    "Mining and refining (S6)",
  ),
  recipe: planned(
    "recipe",
    "Recipes",
    "Inputs, outputs, duration and power.",
    "S6-5",
    "ST-14",
    "Refining and crafting (S6)",
  ),
  facility: planned(
    "facility",
    "Facilities",
    "Facility capabilities for recipes.",
    "S6-5",
    "ST-14",
    "Refining and crafting (S6)",
  ),
  market: planned(
    "market",
    "Markets",
    "Buy and sell lists, target stock, budget, price bounds.",
    "S9-2",
    "ST-12",
    "Economy (S9)",
  ),
  quest: planned(
    "quest",
    "Quests",
    "Objectives, prerequisites, rewards.",
    "S10-1",
    "ST-8",
    "Quests (S10)",
  ),
  dialogue: planned(
    "dialogue",
    "Dialogue",
    "Dialogue nodes and choices.",
    "S10-3",
    "ST-8",
    "Quests (S10)",
  ),
  npc_profile: planned(
    "npc_profile",
    "NPC profiles",
    "Appearance, loadout, behaviour profile.",
    "S11-1",
    "ST-9",
    "NPCs (S11)",
  ),
  faction: planned(
    "faction",
    "Factions",
    "Faction relations.",
    "S11-1",
    "ST-9",
    "NPCs (S11)",
  ),
  spawn_table: planned(
    "spawn_table",
    "Spawn tables",
    "Spawn weights and bounds.",
    "S11-3",
    "ST-9",
    "NPCs (S11)",
  ),
  behaviour: planned(
    "behaviour",
    "Behaviours",
    "Bounded state-machine programs.",
    "S3-1",
    "ST-7",
    "Behaviour interpreter (S3)",
  ),
  logic_kit: planned(
    "logic_kit",
    "Logic kits",
    "Device group and wiring template.",
    "S2-3",
    "ST-5",
    "Logic (S2)",
  ),
  station_service: planned(
    "station_service",
    "Station services",
    "Service kind, price, capacity.",
    "S8-4",
    "ST-11",
    "Stations (S8)",
  ),
  drive: planned(
    "drive",
    "Warp and jump drives",
    "Speed, range, spool, cost.",
    "S13-4",
    "ST-4",
    "Navigation (S13)",
    "Component catalogue",
  ),
};

/** Why a kind cannot publish yet, or null. Planned kinds keep drafts but never publish. */
export function publishBlocker(kind: DefinitionKind): string | null {
  const spec = DEFINITION_KIND_SPECS[kind];
  return spec.stage === "seeded"
    ? null
    : `${spec.label} have no runtime validator yet; they become publishable in ${spec.landsIn}`;
}

// ---------------------------------------------------------------------------------------------
// Validation

const record = (v: unknown): v is Payload =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const bytes = (s: string) => new TextEncoder().encode(s).length;
export const definitionHash = (canonical: string) =>
  bytesToHex(sha256(new TextEncoder().encode(canonical)));

function jsonDepthOk(v: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (Array.isArray(v)) return v.every((x) => jsonDepthOk(x, depth + 1));
  if (record(v))
    return Object.values(v).every((x) => jsonDepthOk(x, depth + 1));
  return typeof v !== "number" || Number.isFinite(v);
}
function checkFields(
  value: Payload,
  fields: readonly FieldSpec[],
  prefix: string,
  issues: DefinitionIssue[],
) {
  const known = new Set(fields.map((f) => f.key));
  for (const key of Object.keys(value))
    if (!known.has(key))
      issues.push({ path: prefix + key, message: "Unknown field" });
  for (const f of fields) {
    const path = prefix + f.key,
      v = value[f.key];
    if (v === undefined || v === null) {
      if (v === null)
        issues.push({ path, message: "Use absent instead of null" });
      else if (f.required) issues.push({ path, message: "Required" });
      continue;
    }
    switch (f.type) {
      case "string":
        if (typeof v !== "string") {
          issues.push({ path, message: "Must be text" });
          break;
        }
        if (v.length > f.maxLength || v.length < (f.minLength ?? 0))
          issues.push({
            path,
            message: `Length must be ${f.minLength ?? 0} to ${f.maxLength}`,
          });
        else if (f.options && !f.options.includes(v))
          issues.push({ path, message: "Not one of the allowed values" });
        else if (f.pattern && !f.pattern.test(v))
          issues.push({
            path,
            message: "Must be " + (f.patternHint ?? "valid"),
          });
        break;
      case "number":
        if (typeof v !== "number" || !Number.isFinite(v)) {
          issues.push({ path, message: "Must be a number" });
          break;
        }
        if (f.integer && !Number.isInteger(v))
          issues.push({ path, message: "Must be a whole number" });
        if (v > f.max || v < f.min || (f.exclusiveMin && v === f.min))
          issues.push({
            path,
            message: `Must be ${f.exclusiveMin ? "above" : "at least"} ${f.min} and at most ${f.max}`,
          });
        break;
      case "boolean":
        if (typeof v !== "boolean")
          issues.push({ path, message: "Must be true or false" });
        break;
      case "object":
        if (!record(v)) issues.push({ path, message: "Must be an object" });
        else checkFields(v, f.fields, path + ".", issues);
        break;
      case "json":
        if (!record(v)) issues.push({ path, message: "Must be a JSON object" });
        else if (!jsonDepthOk(v))
          issues.push({ path, message: "Too deeply nested or not finite" });
        break;
    }
  }
}

export type DefinitionValidation =
  | {
      ok: true;
      value: Payload;
      canonical: string;
      sha256: string;
      validator: string;
    }
  | { ok: false; issues: DefinitionIssue[] };

/** The one validator: Studio preview, reducers, seed import and tests all call this. */
export function validateDefinition(
  kind: string,
  definitionId: string,
  payload: unknown,
): DefinitionValidation {
  if (!isDefinitionKind(kind))
    return {
      ok: false,
      issues: [{ path: "", message: "Unknown definition kind" }],
    };
  if (
    typeof definitionId !== "string" ||
    !DEFINITION_ID_PATTERN.test(definitionId)
  )
    return {
      ok: false,
      issues: [
        {
          path: "",
          message:
            "Definition ID must be 1-80 lowercase letters, digits, '.', '_' or '-'",
        },
      ],
    };
  let value: unknown = payload;
  if (typeof payload === "string") {
    if (bytes(payload) > DEFINITION_LIMITS.payloadBytes * 2)
      return {
        ok: false,
        issues: [{ path: "", message: "Payload too large" }],
      };
    try {
      value = JSON.parse(payload);
    } catch {
      return {
        ok: false,
        issues: [{ path: "", message: "Payload is not valid JSON" }],
      };
    }
  }
  if (!record(value))
    return {
      ok: false,
      issues: [{ path: "", message: "Payload must be a JSON object" }],
    };
  const spec = DEFINITION_KIND_SPECS[kind];
  const issues: DefinitionIssue[] = [];
  checkFields(value, spec.fields, "", issues);
  if (!issues.length && spec.rules)
    issues.push(...spec.rules(value, definitionId));
  if (issues.length) return { ok: false, issues };
  const canonical = stableStringify(value);
  if (bytes(canonical) > DEFINITION_LIMITS.payloadBytes)
    return {
      ok: false,
      issues: [
        {
          path: "",
          message: `Payload exceeds ${DEFINITION_LIMITS.payloadBytes} bytes`,
        },
      ],
    };
  return {
    ok: true,
    value: JSON.parse(canonical) as Payload,
    canonical,
    sha256: definitionHash(canonical),
    validator: spec.validator,
  };
}
/** Cross-revision rules (for example: legacy items never grow). Empty when there is no previous. */
export function revisionIssues(
  kind: DefinitionKind,
  previousCanonical: string | null,
  nextCanonical: string,
): DefinitionIssue[] {
  const rule = DEFINITION_KIND_SPECS[kind].revisionRules;
  if (!rule || !previousCanonical) return [];
  return rule(
    JSON.parse(previousCanonical) as Payload,
    JSON.parse(nextCanonical) as Payload,
  );
}
export const formatIssues = (issues: readonly DefinitionIssue[]) =>
  issues
    .slice(0, 8)
    .map((i) => (i.path ? `${i.path}: ${i.message}` : i.message))
    .join("; ") + (issues.length > 8 ? ` (+${issues.length - 8} more)` : "");

// ---------------------------------------------------------------------------------------------
// Operation discipline (the construction contract, restated for definitions)

export interface DefinitionReceiptLike {
  request: string;
}
/**
 * Permission is checked before this helper, even for a replay. A replay of the exact same request
 * returns the stored receipt; reusing an operation ID for a different request is rejected; a
 * fresh request must name the current revision.
 */
export function definitionOperation(
  operationId: string,
  request: unknown,
  receipt: DefinitionReceiptLike | undefined | null,
  expectedRevision: bigint,
  currentRevision: bigint,
): { request: string; replay: boolean } {
  if (
    typeof operationId !== "string" ||
    !OPERATION_ID_PATTERN.test(operationId)
  )
    throw Error("Invalid definition operation ID");
  const canonical = stableStringify(request);
  if (bytes(canonical) > DEFINITION_LIMITS.payloadBytes * 2 + 1024)
    throw Error("Definition request exceeds budget");
  if (receipt) {
    if (receipt.request !== canonical)
      throw Error("Operation ID reused with a different request");
    return { request: canonical, replay: true };
  }
  if (expectedRevision < 0n || expectedRevision !== currentRevision)
    throw Error(
      `Definition revision conflict: expected ${expectedRevision}, current ${currentRevision}. Reload and retry.`,
    );
  return { request: canonical, replay: false };
}

/** Head status shown in the Studio. */
export function definitionStatus(head: {
  latestRevision: bigint;
  currentRevision: bigint;
}): "draft" | "published" | "retired" {
  if (head.latestRevision === 0n) return "draft";
  return head.currentRevision > 0n ? "published" : "retired";
}
/** The newest published revision that is not retired; 0 when none. */
export function currentRevisionOf(
  revisions: readonly { revision: bigint; status: string }[],
): bigint {
  let current = 0n;
  for (const r of revisions)
    if (r.status === "published" && r.revision > current) current = r.revision;
  return current;
}
