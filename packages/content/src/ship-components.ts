/**
 * Ship component catalog, schema `sidereal.ship-components.v1`.
 *
 * Status: every value in this catalog is a PROPOSED design value. Nothing here
 * is approved balance, economy or art. Future-flagged entries (`status:
 * "future"`) are placeholders the compiler rejects unless explicitly allowed.
 *
 * The canonical source is the pure table builder in
 * `ship-components-source.ts`. `ship-components.v1.json` is its checked-in
 * snapshot for non-TypeScript consumers (Blender exporter, docs, tools); a test
 * keeps them identical. Regenerate with `npm run ship-components:export`.
 *
 * Part-local frame (metres), shared by ports, envelopes and flight vectors:
 * - +X starboard, +Y forward (ship nose at quarterTurns 0), +Z up.
 * - External face/rear/edge mounts: origin at the hardpoint centre on the hull
 *   face; the component extends OUTWARD along -Y. Thrusters push along +Y
 *   (their exhaust leaves along -Y). A starboard face uses quarterTurns 1.
 * - Top/bottom mounts: origin at the hardpoint centre on the roof (floor)
 *   plane; the component extends along +Z (-Z for bottom after mirroring by
 *   placement); barrels and emitters face +Y.
 * - Interior components: origin at the footprint centre on the floor plane;
 *   the access/operator side faces +Y.
 * - Ports on external mounts sit on the mount plane (normal into the hull);
 *   interior ports sit in the floor utility layer (normal -Z).
 * GLB exports use glTF +Y up, so part (x, y, z) is glTF (x, z, -y), matching
 * the renderer rule "world XY maps to renderer X/-Z, renderer Y is height".
 */
import type { ServiceChannel } from "./ship-layout";

export const SHIP_COMPONENT_SCHEMA = "sidereal.ship-components.v1" as const;
export const SHIP_SIZE_CLASSES = ["SM", "MD", "LG", "XL"] as const;
export type ShipSizeClass = (typeof SHIP_SIZE_CLASSES)[number];
/** Whole-cell hardpoint edge length in metres (1 m build cells). */
export const SHIP_SIZE_CELLS: Readonly<Record<ShipSizeClass, number>> = {
  SM: 1,
  MD: 2,
  LG: 3,
  XL: 4,
};
export const shipSizeRank = (s: ShipSizeClass): number =>
  SHIP_SIZE_CLASSES.indexOf(s);

export const SHIP_COMPONENT_FAMILIES = [
  "propulsion",
  "power",
  "thermal",
  "weapon",
  "ammunition",
  "defense",
  "sensor",
  "utility",
  "structure",
  "interior",
] as const;
export type ShipComponentFamily = (typeof SHIP_COMPONENT_FAMILIES)[number];

/** Utility channels. The first five are the existing layout `ServiceChannel`
 * values (`ventilation` is the air channel); `ammo` is a mechanical feed
 * between magazines and weapons that construction-services does not route yet. */
export type ShipComponentChannel = ServiceChannel | "ammo";
export const SHIP_COMPONENT_CHANNELS: readonly ShipComponentChannel[] = [
  "power",
  "data",
  "coolant",
  "fuel",
  "ventilation",
  "ammo",
];
/** Catalog units per channel. Conversions to the construction-services
 * quantities (J, byte, kg, kg, mol per second) are in `SHIP_CHANNEL_TO_SERVICE_RATE`. */
export const SHIP_COMPONENT_CHANNEL_UNITS: Readonly<
  Record<ShipComponentChannel, string>
> = {
  power: "kW",
  data: "kbit/s",
  coolant: "L/s",
  fuel: "L/s",
  ventilation: "m3/s",
  ammo: "rounds/s",
};
/** Multiply a catalog capacity by this factor to get the per-second quantity
 * used by `packages/sim/src/construction-services.ts` (null: not routed there). */
export const SHIP_CHANNEL_TO_SERVICE_RATE: Readonly<
  Record<ShipComponentChannel, number | null>
> = {
  power: 1000, // kW -> J/s
  data: 125, // kbit/s -> byte/s
  coolant: 1.04, // L/s water-glycol -> kg/s
  fuel: 0.8, // L/s -> kg/s, matches inventory `liquid:fuel` 0.8 kg/L
  ventilation: 41.6, // m3/s at 1 atm, 20 C -> mol/s
  ammo: null,
};
/** Physical constants for the proposed thermal model. */
export const SHIP_THERMAL_MODEL = {
  /** Heat carried per L/s of coolant (water-glycol, ~6 K loop rise). */
  coolantKwPerLps: 25,
  /** Below this active heat a component is air/hull cooled and needs no coolant port. */
  airCooledMaxKw: 5,
  fuelKgPerL: 0.8,
} as const;

export type ShipMountSocket =
  | "top"
  | "face"
  | "rear"
  | "bottom"
  | "edge"
  | "interior";
export type ShipComponentStatus = "proposed" | "future";
export type ShipFaction = "common" | "federation" | "riftjack" | "aurelian";
export type ShipVec3 = readonly [number, number, number];

export interface ShipComponentPort {
  id: string;
  channel: ShipComponentChannel;
  direction: "in" | "out" | "both";
  /** Maximum flow through the port in the channel unit. */
  capacity: number;
  medium: string;
  connectorFamily: string;
  /** Part-local metres. */
  position: ShipVec3;
  /** Unit normal pointing along the connector (into the hull for external mounts). */
  normal: ShipVec3;
}
export interface ShipComponentClearance {
  kind: "plume" | "fire-arc" | "beam" | "sweep" | "door-swing";
  /** Clear length measured from the component along its working direction. */
  lengthM: number;
  /** Full cone/sector angle in degrees; 0 for a straight cylinder. */
  arcDeg: number;
}
/** Frame the component (and its GLB and ports) is authored in:
 * `top` (origin on the roof plane, +Z outward, working direction +Y),
 * `face` (origin on the hull face, outward -Y, +X along the face, +Z up),
 * `interior` (origin on the deck floor, +Z up, access side +Y).
 * Sockets of another class re-mount the component with `shipMountRotation`. */
export type ShipMountFrame = "top" | "face" | "interior";
export const shipMountFrameOf = (socket: ShipMountSocket): ShipMountFrame =>
  socket === "top" || socket === "bottom"
    ? "top"
    : socket === "interior"
      ? "interior"
      : "face";
/** Rotation (row-major 3x3) from the authored frame into the frame of the
 * socket class the component is mounted on, before the placement yaw:
 * - top-authored on bottom: roll 180 degrees about +Y (outward becomes -Z);
 * - top-authored on face/rear/edge: outward +Z becomes -Y, the working
 *   direction +Y runs along the face (+X);
 * - face-authored on top/bottom: outward -Y becomes +Z (or -Z).
 * Identity when the socket class matches the authored frame. */
export function shipMountRotation(
  frame: ShipMountFrame,
  socket: ShipMountSocket,
): readonly [ShipVec3, ShipVec3, ShipVec3] {
  const I: [ShipVec3, ShipVec3, ShipVec3] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  if (frame === "top" && socket === "bottom")
    return [
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ];
  if (frame === "top" && (socket === "face" || socket === "rear" || socket === "edge"))
    // (x, y, z) -> (y, -z, -x)
    return [
      [0, 1, 0],
      [0, 0, -1],
      [-1, 0, 0],
    ];
  if (frame === "face" && socket === "top")
    // (x, y, z) -> (x, z, -y)
    return [
      [1, 0, 0],
      [0, 0, 1],
      [0, -1, 0],
    ];
  if (frame === "face" && socket === "bottom")
    // (x, y, z) -> (x, -z, y)
    return [
      [1, 0, 0],
      [0, 0, -1],
      [0, 1, 0],
    ];
  return I;
}
export interface ShipComponentMount {
  frame: ShipMountFrame;
  sockets: readonly ShipMountSocket[];
  /** Hardpoint (external) or floor (interior) footprint in whole 1 m cells, [x, y]. */
  cells: readonly [number, number];
  /** Axis-aligned envelope in the part-local frame: [min xyz, max xyz]. */
  envelopeM: readonly [ShipVec3, ShipVec3];
  clearance: ShipComponentClearance | null;
  /** Grammar rule: XL engines may only use rear hardpoints. */
  rearOnly: boolean;
}
export interface ShipComponentIntegrity {
  hp: number;
  /** Flat per-hit reduction before hp loss. */
  armor: number;
  destroyedEffect:
    | "none"
    | "fire"
    | "explosion"
    | "coolant-leak"
    | "fuel-leak"
    | "air-leak";
  /** Damage dealt to neighbours in a 3 m radius when destroyed (explosion only). */
  explosionDamage: number;
}
export interface ShipComponentCrew {
  /** Operators needed to use the component manually. */
  operators: number;
  /** Station role an operator occupies, if any. */
  station: "pilot" | "gunner" | "engineer" | "sensor" | "command" | null;
  /** passive: no control; computer: works under a powered computer core
   * control slot; manual: needs an occupied station of `station`. */
  automation: "passive" | "computer" | "manual";
  /** Crew berths provided (bunks). */
  berths: number;
}
/** kW. Consumption and generation are separate so a battery can do both. */
export interface ShipComponentPower {
  idleKw: number;
  activeKw: number;
  peakKw: number;
  generationKw: number;
  storageKwh: number;
  maxDischargeKw: number;
  maxChargeKw: number;
}
export interface ShipComponentHeat {
  idleKw: number;
  activeKw: number;
  peakKw: number;
  /** Heat rejected to space (radiators) at full coolant supply. */
  rejectionKw: number;
  /** Heat buffer (heat sinks). */
  storageMj: number;
}
export interface ShipComponentFluids {
  /** Coolant demand at active load (L/s) and pump supply (L/s). */
  coolantDemandLps: number;
  coolantSupplyLps: number;
  fuelIdleLps: number;
  fuelActiveLps: number;
  fuelCapacityL: number;
  /** Breathable air supply/demand and crew-life capacity. */
  airSupplyM3s: number;
  crewSupported: number;
  reserveCrewHours: number;
}
export interface ShipComponentData {
  demandKbps: number;
  supplyKbps: number;
  /** Control slots provided (computer cores) / used (controlled devices). */
  controlSlots: number;
  controlSlotsUsed: number;
}
export interface ShipPropulsionStats {
  role: "main" | "maneuver" | "vertical" | "jump";
  thrustKn: number;
  gimbalDeg: number;
  throttleResponseS: number;
  specificImpulseS: number;
  plume: { lengthM: number; radiusM: number } | null;
}
export interface ShipWeaponStats {
  class: "ballistic" | "energy" | "missile" | "anti-fighter";
  damageType: "kinetic" | "thermal" | "explosive" | "plasma";
  damagePerShot: number;
  projectilesPerShot: number;
  shotsPerMinute: number;
  rangeM: number;
  projectileSpeedMps: number;
  /** Area radius for flak/missiles; 0 for direct hits. */
  areaRadiusM: number;
  /** null for pure energy weapons. */
  ammoType: string | null;
  roundsPerShot: number;
  energyPerShotKj: number;
  /** Pulse weapons draw each shot from capacitors; the bank must hold one shot. */
  capacitorKjPerShot: number;
  heatPerShotKj: number;
  arcDeg: number;
  trackingDegPerS: number;
}
export interface ShipMagazineStats {
  ammoClass: "ballistic" | "missile" | "torpedo";
  ammoTypes: readonly string[];
  /** Ammunition capacity by mass; rounds = capacityKg / massKgPerRound. */
  capacityKg: number;
}
export interface ShipShieldStats {
  role: "generator" | "emitter";
  capacityHp: number;
  rechargePerS: number;
  rechargeDelayS: number;
  radiusM: number;
}
export interface ShipArmorStats {
  class: "light" | "medium" | "heavy" | "reactive";
  /** Per 1 m x 1 m face cell. */
  hpPerCell: number;
  massKgPerCell: number;
  resist: { kinetic: number; thermal: number; explosive: number; plasma: number };
}
export interface ShipSensorStats {
  kind: "dish" | "radar" | "scanner" | "relay";
  rangeM: number;
  arcDeg: number;
  scanTimeS: number;
  /** Relay beacons: long-range comm link. */
  commRangeM: number;
}
export interface ShipToolStats {
  kind: "tractor" | "salvage" | "clamp" | "mining" | "drone-bay";
  rangeM: number;
  forceKn: number;
  maxTargetMassKg: number;
  /** Mining yield or salvage cutting rate. */
  rateKgPerS: number;
  drones: number;
}
export interface ShipAccessStats {
  kind: "cargo-door" | "airlock" | "hatch" | "docking-port";
  openingWidthM: number;
  openingHeightM: number;
  cycleS: number;
  pressureSeal: boolean;
  throughputM3PerMin: number;
  airLossM3PerCycle: number;
}
export interface ShipControlStats {
  grants: "flight" | "fire-control" | "sensors" | "engineering" | "command";
  seats: number;
}
export interface ShipGravityStats {
  areaM2: number;
}
export interface ShipComponentEconomy {
  /** Placeholder scale; no economy is approved. */
  costCredits: number;
  buildTimeS: number;
  techTier: 1 | 2 | 3 | 4;
}
export interface ShipComponentArt {
  /** Blender kit builder key used by `scripts/art_library/ship_component_export.py`. */
  kitKey: string | null;
  /** Repository path of the exported GLB when produced. */
  glb: string | null;
  /** Existing art-library design id for interior objects, if one exists. */
  artLibraryDesignId: string | null;
}
export interface ShipComponentDefinition {
  id: string;
  revision: number;
  status: ShipComponentStatus;
  name: string;
  family: ShipComponentFamily;
  kind: string;
  variant: string;
  faction: ShipFaction;
  sizeClass: ShipSizeClass;
  mount: ShipComponentMount;
  massKg: number;
  integrity: ShipComponentIntegrity;
  crew: ShipComponentCrew;
  power: ShipComponentPower;
  heat: ShipComponentHeat;
  fluids: ShipComponentFluids;
  data: ShipComponentData;
  ports: readonly ShipComponentPort[];
  propulsion: ShipPropulsionStats | null;
  weapon: ShipWeaponStats | null;
  magazine: ShipMagazineStats | null;
  shield: ShipShieldStats | null;
  armor: ShipArmorStats | null;
  sensor: ShipSensorStats | null;
  tool: ShipToolStats | null;
  access: ShipAccessStats | null;
  control: ShipControlStats | null;
  gravity: ShipGravityStats | null;
  economy: ShipComponentEconomy;
  art: ShipComponentArt;
  notes: string;
}
export interface ShipDamageState {
  state: "pristine" | "scuffed" | "damaged" | "destroyed";
  /** State applies while hp fraction >= this value. */
  minHpFraction: number;
  /** Multiplier on output (thrust, damage, generation, range...). */
  performance: number;
}
export interface ShipComponentCatalog {
  schema: typeof SHIP_COMPONENT_SCHEMA;
  id: string;
  revision: number;
  status: "proposed";
  units: Readonly<Record<string, string>>;
  frame: string;
  damageStates: readonly ShipDamageState[];
  ammoTypes: readonly {
    id: string;
    ammoClass: ShipMagazineStats["ammoClass"];
    massKgPerRound: number;
  }[];
  components: readonly ShipComponentDefinition[];
}

const isFiniteNonNegative = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;
const isVec3 = (v: unknown): v is ShipVec3 =>
  Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));
const ID = /^[a-z0-9][a-z0-9.-]{1,95}$/;

/** Structural validation of a catalog. Returns human-readable problems (empty
 * when valid). Pure; used by tests, the exporter and any loader. */
export function validateShipComponentCatalog(
  catalog: ShipComponentCatalog,
): string[] {
  const problems: string[] = [];
  const bad = (id: string, m: string) => problems.push(`${id}: ${m}`);
  if (catalog.schema !== SHIP_COMPONENT_SCHEMA)
    problems.push("catalog: wrong schema");
  if (!Number.isSafeInteger(catalog.revision) || catalog.revision < 1)
    problems.push("catalog: invalid revision");
  const ammo = new Map(catalog.ammoTypes.map((a) => [a.id, a]));
  const ids = new Set<string>();
  for (const c of catalog.components) {
    const id = String(c?.id);
    if (!ID.test(id)) bad(id, "invalid id");
    if (ids.has(id)) bad(id, "duplicate id");
    ids.add(id);
    if (!SHIP_SIZE_CLASSES.includes(c.sizeClass)) bad(id, "size class");
    if (!SHIP_COMPONENT_FAMILIES.includes(c.family)) bad(id, "family");
    if (!Number.isSafeInteger(c.revision) || c.revision < 1)
      bad(id, "revision");
    if (!(c.massKg > 0)) bad(id, "mass must be positive");
    if (!(c.integrity.hp > 0)) bad(id, "hp must be positive");
    const numeric = [
      ...Object.values(c.power),
      ...Object.values(c.heat),
      ...Object.values(c.fluids),
      ...Object.values(c.data),
      c.integrity.armor,
      c.integrity.explosionDamage,
      c.economy.costCredits,
      c.economy.buildTimeS,
    ];
    if (!numeric.every(isFiniteNonNegative))
      bad(id, "negative or non-finite system value");
    if (
      c.power.idleKw > c.power.activeKw ||
      c.power.activeKw > c.power.peakKw
    )
      bad(id, "power idle <= active <= peak violated");
    if (c.heat.idleKw > c.heat.activeKw || c.heat.activeKw > c.heat.peakKw)
      bad(id, "heat idle <= active <= peak violated");
    const [lo, hi] = c.mount.envelopeM;
    if (!isVec3(lo) || !isVec3(hi) || lo.some((v, i) => v >= hi[i]))
      bad(id, "envelope");
    if (!c.mount.sockets.length) bad(id, "no sockets");
    else if (c.mount.frame !== shipMountFrameOf(c.mount.sockets[0]))
      bad(id, "frame must match the first socket");
    if (c.mount.rearOnly && c.mount.sockets.some((s) => s !== "rear"))
      bad(id, "rear-only component lists non-rear sockets");
    const portIds = new Set<string>();
    for (const p of c.ports) {
      if (portIds.has(p.id)) bad(id, `duplicate port ${p.id}`);
      portIds.add(p.id);
      if (!SHIP_COMPONENT_CHANNELS.includes(p.channel))
        bad(id, `port ${p.id} channel`);
      if (!(p.capacity > 0)) bad(id, `port ${p.id} capacity`);
      if (!isVec3(p.position) || !isVec3(p.normal))
        bad(id, `port ${p.id} geometry`);
      else if (Math.abs(Math.hypot(...p.normal) - 1) > 1e-9)
        bad(id, `port ${p.id} normal not unit`);
      else if (
        p.position.some((v, i) => v < lo[i] - 1e-9 || v > hi[i] + 1e-9)
      )
        bad(id, `port ${p.id} outside envelope`);
    }
    const has = (ch: ShipComponentChannel, dir: "in" | "out") =>
      c.ports.some(
        (p) =>
          p.channel === ch && (p.direction === dir || p.direction === "both"),
      );
    // Every rated flow must be reachable through a typed port.
    if (c.power.peakKw > 0 && !has("power", "in"))
      bad(id, "consumes power without a power input");
    if (
      (c.power.generationKw > 0 || c.power.maxDischargeKw > 0) &&
      !has("power", "out")
    )
      bad(id, "supplies power without a power output");
    if (c.fluids.coolantDemandLps > 0 && !has("coolant", "in"))
      bad(id, "needs coolant without a coolant input");
    if (
      c.heat.activeKw > SHIP_THERMAL_MODEL.airCooledMaxKw &&
      c.fluids.coolantDemandLps <= 0
    )
      bad(id, "hot component without coolant demand");
    if (
      c.fluids.fuelActiveLps > 0 &&
      !has("fuel", "in")
    )
      bad(id, "burns fuel without a fuel input");
    if (c.fluids.fuelCapacityL > 0 && !has("fuel", "out"))
      bad(id, "stores fuel without a fuel output");
    if (c.data.demandKbps > 0 && !has("data", "in"))
      bad(id, "needs data without a data input");
    if (c.data.supplyKbps > 0 && !has("data", "out"))
      bad(id, "supplies data without a data output");
    if (c.fluids.airSupplyM3s > 0 && !has("ventilation", "out"))
      bad(id, "supplies air without a ventilation output");
    if (c.weapon?.ammoType) {
      const a = ammo.get(c.weapon.ammoType);
      if (!a) bad(id, `unknown ammo type ${c.weapon.ammoType}`);
      if (!has("ammo", "in")) bad(id, "ammunition weapon without feed port");
    }
    if (c.magazine) {
      for (const t of c.magazine.ammoTypes)
        if (ammo.get(t)?.ammoClass !== c.magazine.ammoClass)
          bad(id, `magazine type ${t} class mismatch`);
      if (!has("ammo", "out")) bad(id, "magazine without feed port");
    }
    if (c.family === "propulsion" && !c.propulsion)
      bad(id, "propulsion without stats");
    if (c.family === "weapon" && !c.weapon) bad(id, "weapon without stats");
  }
  return problems;
}

export const shipComponentIndex = (
  catalog: ShipComponentCatalog,
): ReadonlyMap<string, ShipComponentDefinition> =>
  new Map(catalog.components.map((c) => [c.id, c]));

// ------------------------------------------------------------ ship fitting data
/** A typed hardpoint socket on a hull (design doc 12.8). Position is the
 * hardpoint centre in ship metres; the orientation is the placement a mounted
 * component must use. */
export interface ShipHardpoint {
  id: string;
  socket: Exclude<ShipMountSocket, "interior">;
  sizeClass: ShipSizeClass;
  position: ShipVec3;
  quarterTurns: 0 | 1 | 2 | 3;
  reflected: boolean;
}
/** Placed component instance. `id` is the placed-object identity, separate
 * from the reusable `componentId` (AGENTS.md asset/object id rule). */
export interface ShipComponentPlacement {
  id: string;
  componentId: string;
  position: ShipVec3;
  quarterTurns: 0 | 1 | 2 | 3;
  reflected: boolean;
  hardpointId: string | null;
  deckId?: string;
}
export interface ShipPortRef {
  placementId: string;
  portId: string;
}
/** Explicit logical link between two typed ports (physical routing is separate). */
export interface ShipComponentConnection {
  id: string;
  channel: ShipComponentChannel;
  from: ShipPortRef;
  to: ShipPortRef;
}
/** Hull-side inputs the systems compiler needs. Structure mass comes from the
 * hull/voxel structure, not from this catalog. */
export interface ShipHullSystemsProfile {
  id: string;
  sizeClass: ShipSizeClass;
  /** Structure (hull, floors, walls, armour cells not listed as components). */
  massKg: number;
  lengthM: number;
  beamM: number;
  heightM: number;
  decks: number;
  /** Heat the bare hull radiates without radiators. */
  passiveHeatRejectionKw: number;
  hardpoints: readonly ShipHardpoint[];
}
export interface ShipComponentFit {
  id: string;
  name: string;
  status: "proposed";
  hull: ShipHullSystemsProfile;
  components: readonly ShipComponentPlacement[];
  connections?: readonly ShipComponentConnection[];
  notes: string;
}

/** Component ids whose `kind` matches, ordered by size class. */
export function shipComponentSizes(
  catalog: ShipComponentCatalog,
  kind: string,
  variant = "standard",
): ShipComponentDefinition[] {
  return catalog.components
    .filter((c) => c.kind === kind && c.variant === variant)
    .sort((a, b) => shipSizeRank(a.sizeClass) - shipSizeRank(b.sizeClass));
}
