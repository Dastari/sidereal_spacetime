/**
 * Roadmap X-3 definition kinds: ship components, loot tables and interactions (wiki
 * `Systems/Content Definitions`). Real validators and Studio forms; components and interactions
 * are seeded from today's code. Since X-3b the game reads pinned components (new ships) and
 * interactions (new objects); loot tables keep drafts only until destruction profiles exist.
 */
import {
  SHIP_COMPONENT_CHANNELS,
  SHIP_COMPONENT_FAMILIES,
  SHIP_COMPONENT_SCHEMA,
  SHIP_SIZE_CLASSES,
  validateShipComponentCatalog,
  type ShipComponentDefinition,
} from "@sidereal/content/ship-components";
import { buildShipComponentCatalog } from "@sidereal/content/ship-components-source";
import {
  flag,
  group,
  list,
  num,
  text,
  vector,
  type DefinitionIssue,
  type FieldSpec,
  type Payload,
} from "./content-definition-schema";
import type { DefinitionKindSpec } from "./content-definitions";

const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const TOKEN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const BIG = 1e9;
const id = (key: string, label: string, extra = {}) =>
  text(key, label, 80, {
    pattern: ID,
    patternHint: "lowercase letters, digits, '.', '_' or '-'",
    ...extra,
  });
const token = (key: string, label: string, extra = {}) =>
  text(key, label, 64, {
    pattern: TOKEN,
    patternHint: "a lowercase token",
    ...extra,
  });
const qty = (key: string, label: string, unit?: string, extra = {}) =>
  num(key, label, 0, BIG, {
    required: true,
    ...(unit ? { unit } : {}),
    ...extra,
  });
const choice = (
  key: string,
  label: string,
  options: readonly string[],
  extra = {},
) => text(key, label, 32, { required: true, options, ...extra });

// ------------------------------------------------------------------ component

const MOUNT_SOCKETS = ["top", "face", "rear", "bottom", "edge", "interior"];
const COMPONENT_FIELDS: readonly FieldSpec[] = [
  id("id", "Component ID", {
    required: true,
    help: "Must equal the definition ID. Placements refer to it.",
  }),
  num("revision", "Component revision", 1, 999, {
    required: true,
    integer: true,
    help: "The catalogue's per-component revision (grammar and rule changes).",
  }),
  choice("status", "Status", ["proposed", "future"], {
    help: "future: placeholder the compiler rejects unless explicitly allowed.",
  }),
  text("name", "Name", 80, { required: true, minLength: 1 }),
  choice("family", "Family", SHIP_COMPONENT_FAMILIES),
  token("kind", "Kind", { required: true }),
  token("variant", "Variant", { required: true }),
  choice("faction", "Faction", [
    "common",
    "federation",
    "riftjack",
    "aurelian",
  ]),
  choice("sizeClass", "Size class", SHIP_SIZE_CLASSES),
  group(
    "mount",
    "Mount",
    [
      choice("frame", "Authored frame", ["top", "face", "interior"]),
      list("sockets", "Sockets", choice("", "Socket", MOUNT_SOCKETS), 1, 6, {
        required: true,
        help: "The first socket must match the authored frame.",
      }),
      vector("cells", "Footprint cells [x, y]", 2, 1, 16, {
        required: true,
        integer: true,
        unit: "cells",
      }),
      list(
        "envelopeM",
        "Envelope [min xyz, max xyz]",
        vector("", "Corner", 3, -100, 100, { unit: "m" }),
        2,
        2,
        { required: true },
      ),
      group(
        "clearance",
        "Clearance",
        [
          choice("kind", "Kind", [
            "plume",
            "fire-arc",
            "beam",
            "sweep",
            "door-swing",
          ]),
          qty("lengthM", "Length", "m"),
          num("arcDeg", "Arc", 0, 360, { required: true, unit: "deg" }),
        ],
        { nullable: true },
      ),
      flag("rearOnly", "Rear hardpoints only", { required: true }),
    ],
    { required: true },
  ),
  num("massKg", "Mass", 0, BIG, {
    required: true,
    exclusiveMin: true,
    unit: "kg",
  }),
  group(
    "integrity",
    "Integrity",
    [
      num("hp", "Hit points", 0, BIG, { required: true, exclusiveMin: true }),
      qty("armor", "Armour (flat per hit)"),
      choice("destroyedEffect", "When destroyed", [
        "none",
        "fire",
        "explosion",
        "coolant-leak",
        "fuel-leak",
        "air-leak",
      ]),
      qty("explosionDamage", "Explosion damage (3 m)"),
    ],
    { required: true },
  ),
  group(
    "crew",
    "Crew",
    [
      qty("operators", "Operators", undefined, { integer: true, max: 32 }),
      text("station", "Station", 16, {
        nullable: true,
        options: ["pilot", "gunner", "engineer", "sensor", "command"],
      }),
      choice("automation", "Automation", ["passive", "computer", "manual"]),
      qty("berths", "Berths", undefined, { integer: true, max: 64 }),
    ],
    { required: true },
  ),
  group(
    "power",
    "Power",
    [
      qty("idleKw", "Idle", "kW"),
      qty("activeKw", "Active", "kW"),
      qty("peakKw", "Peak", "kW"),
      qty("generationKw", "Generation", "kW"),
      qty("storageKwh", "Storage", "kWh"),
      qty("maxDischargeKw", "Max discharge", "kW"),
      qty("maxChargeKw", "Max charge", "kW"),
    ],
    { required: true, help: "idle <= active <= peak." },
  ),
  group(
    "heat",
    "Heat",
    [
      qty("idleKw", "Idle", "kW"),
      qty("activeKw", "Active", "kW"),
      qty("peakKw", "Peak", "kW"),
      qty("rejectionKw", "Rejection", "kW"),
      qty("storageMj", "Storage", "MJ"),
    ],
    { required: true },
  ),
  group(
    "fluids",
    "Fluids and life support",
    [
      qty("coolantDemandLps", "Coolant demand", "L/s"),
      qty("coolantSupplyLps", "Coolant supply", "L/s"),
      qty("fuelIdleLps", "Fuel idle", "L/s"),
      qty("fuelActiveLps", "Fuel active", "L/s"),
      qty("fuelCapacityL", "Fuel capacity", "L"),
      qty("airSupplyM3s", "Air supply", "m3/s"),
      qty("crewSupported", "Crew supported"),
      qty("reserveCrewHours", "Reserve", "h"),
    ],
    { required: true },
  ),
  group(
    "data",
    "Data and control",
    [
      qty("demandKbps", "Demand", "kbit/s"),
      qty("supplyKbps", "Supply", "kbit/s"),
      qty("controlSlots", "Control slots provided", undefined, {
        integer: true,
      }),
      qty("controlSlotsUsed", "Control slots used", undefined, {
        integer: true,
      }),
    ],
    { required: true },
  ),
  list(
    "ports",
    "Ports",
    group("", "Port", [
      token("id", "Port ID", { required: true }),
      choice("channel", "Channel", SHIP_COMPONENT_CHANNELS),
      choice("direction", "Direction", ["in", "out", "both"]),
      num("capacity", "Capacity", 0, BIG, {
        required: true,
        exclusiveMin: true,
      }),
      token("medium", "Medium", { required: true }),
      token("connectorFamily", "Connector family", { required: true }),
      vector("position", "Position", 3, -100, 100, {
        required: true,
        unit: "m",
      }),
      vector("normal", "Normal (unit)", 3, -1, 1, { required: true }),
    ]),
    0,
    32,
    { required: true, help: "Every rated flow needs a typed port." },
  ),
  group(
    "propulsion",
    "Propulsion",
    [
      choice("role", "Role", ["main", "maneuver", "vertical", "jump"]),
      qty("thrustKn", "Thrust", "kN"),
      num("reverseThrustKn", "Reverse thrust", 0, BIG, { unit: "kN" }),
      num("gimbalDeg", "Gimbal", 0, 180, { required: true, unit: "deg" }),
      qty("throttleResponseS", "Throttle response", "s"),
      qty("specificImpulseS", "Specific impulse", "s"),
      group(
        "plume",
        "Plume",
        [qty("lengthM", "Length", "m"), qty("radiusM", "Radius", "m")],
        { nullable: true },
      ),
    ],
    { nullable: true },
  ),
  group(
    "weapon",
    "Weapon",
    [
      choice("class", "Class", [
        "ballistic",
        "energy",
        "missile",
        "anti-fighter",
      ]),
      choice("damageType", "Damage type", [
        "kinetic",
        "thermal",
        "explosive",
        "plasma",
      ]),
      qty("damagePerShot", "Damage per shot"),
      qty("projectilesPerShot", "Projectiles per shot", undefined, {
        integer: true,
      }),
      qty("shotsPerMinute", "Shots per minute"),
      qty("rangeM", "Range", "m"),
      qty("projectileSpeedMps", "Projectile speed", "m/s"),
      qty("areaRadiusM", "Area radius", "m"),
      token("ammoType", "Ammunition", { nullable: true }),
      qty("roundsPerShot", "Rounds per shot", undefined, { integer: true }),
      qty("energyPerShotKj", "Energy per shot", "kJ"),
      qty("capacitorKjPerShot", "Capacitor per shot", "kJ"),
      qty("heatPerShotKj", "Heat per shot", "kJ"),
      num("arcDeg", "Arc", 0, 360, { required: true, unit: "deg" }),
      qty("trackingDegPerS", "Tracking", "deg/s"),
    ],
    { nullable: true },
  ),
  group(
    "magazine",
    "Magazine",
    [
      choice("ammoClass", "Ammunition class", [
        "ballistic",
        "missile",
        "torpedo",
      ]),
      list("ammoTypes", "Ammunition types", token("", "Type"), 1, 16, {
        required: true,
      }),
      qty("capacityKg", "Capacity", "kg"),
    ],
    { nullable: true },
  ),
  group(
    "shield",
    "Shield",
    [
      choice("role", "Role", ["generator", "emitter"]),
      qty("capacityHp", "Capacity", "hp"),
      qty("rechargePerS", "Recharge", "hp/s"),
      qty("rechargeDelayS", "Recharge delay", "s"),
      qty("radiusM", "Radius", "m"),
    ],
    { nullable: true },
  ),
  group(
    "armor",
    "Armour",
    [
      choice("class", "Class", ["light", "medium", "heavy", "reactive"]),
      qty("hpPerCell", "Hit points per cell"),
      qty("massKgPerCell", "Mass per cell", "kg"),
      group(
        "resist",
        "Resistance",
        [
          num("kinetic", "Kinetic", 0, 1, { required: true }),
          num("thermal", "Thermal", 0, 1, { required: true }),
          num("explosive", "Explosive", 0, 1, { required: true }),
          num("plasma", "Plasma", 0, 1, { required: true }),
        ],
        { required: true },
      ),
    ],
    { nullable: true },
  ),
  group(
    "sensor",
    "Sensor",
    [
      choice("kind", "Kind", ["dish", "radar", "scanner", "relay"]),
      qty("rangeM", "Range", "m"),
      num("arcDeg", "Arc", 0, 360, { required: true, unit: "deg" }),
      qty("scanTimeS", "Scan time", "s"),
      qty("commRangeM", "Comm range", "m"),
    ],
    { nullable: true },
  ),
  group(
    "tool",
    "Tool",
    [
      choice("kind", "Kind", [
        "tractor",
        "salvage",
        "clamp",
        "mining",
        "drone-bay",
      ]),
      qty("rangeM", "Range", "m"),
      qty("forceKn", "Force", "kN"),
      qty("maxTargetMassKg", "Max target mass", "kg"),
      qty("rateKgPerS", "Rate", "kg/s"),
      qty("drones", "Drones", undefined, { integer: true }),
    ],
    { nullable: true },
  ),
  group(
    "access",
    "Access",
    [
      choice("kind", "Kind", [
        "cargo-door",
        "airlock",
        "hatch",
        "docking-port",
      ]),
      qty("openingWidthM", "Opening width", "m"),
      qty("openingHeightM", "Opening height", "m"),
      qty("cycleS", "Cycle", "s"),
      flag("pressureSeal", "Pressure seal", { required: true }),
      qty("throughputM3PerMin", "Throughput", "m3/min"),
      qty("airLossM3PerCycle", "Air loss per cycle", "m3"),
    ],
    { nullable: true },
  ),
  group(
    "control",
    "Control",
    [
      choice("grants", "Grants", [
        "flight",
        "fire-control",
        "sensors",
        "engineering",
        "command",
      ]),
      qty("seats", "Seats", undefined, { integer: true }),
    ],
    { nullable: true },
  ),
  group("gravity", "Gravity", [qty("areaM2", "Area", "m2")], {
    nullable: true,
  }),
  group(
    "economy",
    "Economy (placeholder)",
    [
      qty("costCredits", "Cost", "cr"),
      qty("buildTimeS", "Build time", "s"),
      num("techTier", "Tech tier", 1, 4, { required: true, integer: true }),
    ],
    { required: true },
  ),
  group(
    "art",
    "Art",
    [
      text("kitKey", "Blender kit key", 120, { nullable: true }),
      text("glb", "GLB path", 300, { nullable: true }),
      text("artLibraryDesignId", "Art-library design", 120, { nullable: true }),
    ],
    { required: true },
  ),
  text("notes", "Notes", 2000, { required: true }),
];
/** Ammunition types of the current catalogue (the component validator checks references). */
const CATALOG = buildShipComponentCatalog();
function componentRules(v: Payload, definitionId: string): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  if (v.id !== definitionId)
    issues.push({ path: "id", message: "Must equal the definition ID" });
  // The catalogue's own structural and port rules, on a one-component catalogue.
  for (const problem of validateShipComponentCatalog({
    ...CATALOG,
    schema: SHIP_COMPONENT_SCHEMA,
    components: [v as unknown as ShipComponentDefinition],
  }))
    issues.push({
      path: "",
      message: problem.replace(/^[^:]*: /, ""),
    });
  return issues;
}
export const COMPONENT_KIND: DefinitionKindSpec = {
  kind: "component",
  label: "Ship components",
  description:
    "Size, sockets, mass, hp, damage states, power, heat, coolant, fuel, data, ports and kind stats.",
  stage: "seeded",
  landsIn: "X-3b",
  studioEditor: "ST-4",
  runtimeConsumer:
    "New ships: flight compile, ship systems, combat damage and deck objects (existing ships keep their catalogue until an operator upgrade)",
  seededFrom: "ship-components-source.ts, catalogue revision 4",
  validator: "component/v1",
  fields: COMPONENT_FIELDS,
  rules: componentRules,
  template: (definitionId) => {
    const base = CATALOG.components.find((c) => c.id === "computer-core.sm")!;
    return JSON.parse(
      JSON.stringify({ ...base, id: definitionId, name: "New component" }),
    ) as Payload;
  },
};

// ----------------------------------------------------------------- loot table

const LOOT_FIELDS: readonly FieldSpec[] = [
  text("name", "Name", 80, { required: true, minLength: 1 }),
  num("rolls", "Rolls", 1, 16, {
    required: true,
    integer: true,
    help: "Independent weighted draws per use of the table.",
  }),
  num("emptyWeight", "Nothing (weight)", 0, 1e6, {
    required: true,
    help: "Weight of drawing nothing; 0 means every roll yields an entry.",
  }),
  list(
    "entries",
    "Entries",
    group("", "Entry", [
      id("itemId", "Item definition", { required: true }),
      num("weight", "Weight", 0, 1e6, { required: true, exclusiveMin: true }),
      num("minQuantity", "Minimum", 1, 999, { required: true, integer: true }),
      num("maxQuantity", "Maximum", 1, 999, { required: true, integer: true }),
    ]),
    1,
    64,
    { required: true },
  ),
  text("notes", "Designer notes", 2000),
];
function lootRules(v: Payload): DefinitionIssue[] {
  const issues: DefinitionIssue[] = [];
  const entries = v.entries as {
    itemId: string;
    minQuantity: number;
    maxQuantity: number;
  }[];
  const seen = new Set<string>();
  entries.forEach((e, i) => {
    if (e.minQuantity > e.maxQuantity)
      issues.push({
        path: `entries[${i}].maxQuantity`,
        message: "Maximum must be at least the minimum",
      });
    if (seen.has(e.itemId))
      issues.push({
        path: `entries[${i}].itemId`,
        message: "Each item appears once; merge the entries",
      });
    seen.add(e.itemId);
  });
  return issues;
}
export const LOOT_TABLE_KIND: DefinitionKindSpec = {
  kind: "loot_table",
  label: "Loot tables",
  description:
    "Weighted item entries with quantity ranges, drawn per roll (wrecks, destruction, pirates, quests).",
  stage: "validated",
  landsIn: "S1-4 / S12-9 (destruction profiles and wrecks)",
  studioEditor: "ST-3",
  runtimeConsumer:
    "Destruction profiles, wrecks, pirates, quests (not built yet)",
  seededFrom: "Nothing to seed: no loot exists in code",
  validator: "loot_table/v1",
  fields: LOOT_FIELDS,
  rules: lootRules,
  template: () => ({
    name: "New loot table",
    rolls: 1,
    emptyWeight: 0,
    entries: [{ itemId: "medkit", weight: 1, minQuantity: 1, maxQuantity: 1 }],
  }),
};

// ---------------------------------------------------------------- interaction

const INTERACTION_FIELDS: readonly FieldSpec[] = [
  text("name", "Name", 80, { required: true, minLength: 1 }),
  list(
    "verbs",
    "Verbs",
    group("", "Verb", [
      token("id", "Action ID", { required: true }),
      text("label", "Label", 40, { required: true, minLength: 1 }),
    ]),
    1,
    8,
    { required: true },
  ),
  num("reachM", "Reach", 0.3, 5, { required: true, unit: "m" }),
  flag("lineOfSight", "Needs line of sight", { required: true }),
  flag("approachPoint", "Placements author an approach point", {
    required: true,
  }),
  id("requiredTool", "Required tool (item)", { nullable: true }),
  choice("permission", "Who may use it", [
    "aboard",
    "owner",
    "crew",
    "admitted",
  ]),
  num("occupancy", "Occupants", 0, 8, {
    required: true,
    integer: true,
    help: "Seats: how many characters it holds; 0 for devices.",
  }),
  text("notes", "Designer notes", 2000),
];
function interactionRules(v: Payload): DefinitionIssue[] {
  const ids = (v.verbs as { id: string }[]).map((x) => x.id);
  return ids.length === new Set(ids).size
    ? []
    : [{ path: "verbs", message: "Verb IDs must be unique" }];
}
export const INTERACTION_KIND: DefinitionKindSpec = {
  kind: "interaction",
  label: "Interactions",
  description:
    "Verbs, reach, line of sight, approach point, required tool, permission and occupancy of an interactable object.",
  stage: "seeded",
  landsIn: "X-3b",
  studioEditor: "ST-6",
  runtimeConsumer:
    "Seats and lights: reach and available verbs (new objects pin the current revision)",
  seededFrom:
    "sim/interactions.ts rules for the LAB_INTERACTIONS kinds (seat, light)",
  validator: "interaction/v1",
  fields: INTERACTION_FIELDS,
  rules: interactionRules,
  template: () => ({
    name: "New interaction",
    verbs: [{ id: "use", label: "Use" }],
    reachM: 1.8,
    lineOfSight: true,
    approachPoint: true,
    requiredTool: null,
    permission: "aboard",
    occupancy: 0,
  }),
};
