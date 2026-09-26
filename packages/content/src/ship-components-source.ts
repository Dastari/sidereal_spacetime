/**
 * Canonical source tables for `sidereal.ship-components.v1`.
 *
 * All numbers are PROPOSED design values chosen to balance against the
 * existing Wayfarer lab flight numbers (12 t, 36 kN main thrust, 3 m/s^2) and
 * the reference fits in `ship-components-reference-fits.ts`. Reasoning and the
 * resulting balance sheets are in docs/ship_components.md.
 *
 * Each kind lists its sizes and per-size values explicitly. Derived values
 * (coolant demand, port capacities and positions, fuel-derived specific
 * impulse, envelopes) come from the small helpers below so the rules stay
 * uniform across the catalog.
 */
import {
  SHIP_COMPONENT_SCHEMA,
  SHIP_SIZE_CELLS,
  SHIP_THERMAL_MODEL,
  shipMountFrameOf,
  type ShipComponentCatalog,
  type ShipComponentChannel,
  type ShipComponentDefinition,
  type ShipComponentPort,
  type ShipMountSocket,
  type ShipSizeClass,
  type ShipVec3,
} from "./ship-components";

export const SHIP_COMPONENT_CATALOG_ID = "ship-components-v1";
export const SHIP_COMPONENT_CATALOG_REVISION = 1;
/** Art-library revision directory that holds the exported component GLBs. */
export const SHIP_COMPONENT_ART_REVISION = "r002";
export const shipComponentGlbPath = (id: string) =>
  `assets/art-library/ship-components/${SHIP_COMPONENT_ART_REVISION}/glb/${id}.glb`;

type Sizes = readonly ShipSizeClass[];
type PerSize<T> = readonly T[];
type Box = readonly [ShipVec3, ShipVec3];

const r2 = (v: number) => Math.round(v * 100) / 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const ceil1 = (v: number) => Math.ceil(v * 10 - 1e-9) / 10;

/** Envelope helpers (see the frame description in ship-components.ts). */
const outward = (w: number, len: number, h = w): Box => [
  [-w / 2, -len, -h / 2],
  [w / 2, 0, h / 2],
];
const topMount = (w: number, d: number, h: number, forward = 0): Box => [
  [-w / 2, -d / 2, 0],
  [w / 2, d / 2 + forward, h],
];
const interior = (w: number, d: number, h: number): Box => [
  [-w / 2, -d / 2, 0],
  [w / 2, d / 2, h],
];
/** Edge modules sit on the edge line and stand outward (-Y) by `depth`. */
const edge = (w: number, depth: number, h: number): Box => [
  [-w / 2, -depth, 0],
  [w / 2, 0, h],
];

const CONNECTOR: Record<ShipComponentChannel, [string, string]> = {
  power: ["electric-dc", "pwr-std"],
  data: ["optical", "dat-std"],
  coolant: ["glycol-water", "cool-std"],
  fuel: ["fuel", "fuel-std"],
  ventilation: ["air", "atm-std"],
  ammo: ["ballistic", "feed-std"],
};
interface PortSpec {
  id: string;
  channel: ShipComponentChannel;
  direction: "in" | "out" | "both";
  capacity: number;
  medium?: string;
}
/** Lays ports out on the mounting plane of the first socket, left to right in
 * a fixed channel order, inset from the hardpoint edge. */
function layoutPorts(
  socket: ShipMountSocket,
  envelope: Box,
  specs: readonly PortSpec[],
): ShipComponentPort[] {
  const [lo, hi] = envelope;
  const n = specs.length;
  const span = Math.min(hi[0] - lo[0], 3.2) * 0.8;
  return specs.map((p, i) => {
    const x = r3(n === 1 ? 0 : -span / 2 + (span * i) / (n - 1));
    let position: ShipVec3, normal: ShipVec3;
    if (socket === "top" || socket === "bottom") {
      position = [x, r3(Math.max(lo[1], Math.min(hi[1], 0))), 0];
      normal = [0, 0, -1];
    } else if (socket === "interior") {
      position = [x, r3(lo[1] + Math.min(0.25, (hi[1] - lo[1]) / 4)), 0];
      normal = [0, 0, -1];
    } else if (socket === "edge") {
      position = [r3(Math.max(lo[0], Math.min(hi[0], x))), 0, 0.25];
      normal = [0, 1, 0];
    } else {
      position = [x, 0, 0];
      normal = [0, 1, 0];
    }
    const [medium, connectorFamily] = CONNECTOR[p.channel];
    return {
      id: p.id,
      channel: p.channel,
      direction: p.direction,
      capacity: r2(p.capacity),
      medium: p.medium ?? medium,
      connectorFamily,
      position,
      normal,
    };
  });
}

interface Loads {
  idle: PerSize<number>;
  active: PerSize<number>;
  /** Defaults to active x 1.2. */
  peak?: PerSize<number>;
}
interface KindSpec {
  kind: string;
  name: string;
  family: ShipComponentDefinition["family"];
  variant?: string;
  faction?: ShipComponentDefinition["faction"];
  status?: ShipComponentDefinition["status"];
  sizes: Sizes;
  sockets: readonly ShipMountSocket[];
  cells?: (i: number, s: ShipSizeClass) => readonly [number, number];
  envelope: (i: number, s: ShipSizeClass) => Box;
  clearance?: (i: number, s: ShipSizeClass) => ShipComponentDefinition["mount"]["clearance"];
  massKg: PerSize<number>;
  hp: PerSize<number>;
  armor?: PerSize<number>;
  destroyedEffect?: ShipComponentDefinition["integrity"]["destroyedEffect"];
  explosionDamage?: PerSize<number>;
  crew?: Partial<ShipComponentDefinition["crew"]>;
  power?: Loads & {
    generation?: PerSize<number>;
    storageKwh?: PerSize<number>;
    discharge?: PerSize<number>;
    charge?: PerSize<number>;
  };
  heat?: Loads & { rejection?: PerSize<number>; storageMj?: PerSize<number> };
  coolantSupplyLps?: PerSize<number>;
  /** Coolant return/flow-through capacity for radiators and heat sinks. */
  coolantThroughLps?: PerSize<number>;
  fuel?: { idle?: PerSize<number>; active?: PerSize<number>; capacityL?: PerSize<number>; outLps?: PerSize<number> };
  air?: { supplyM3s?: PerSize<number>; crewSupported?: PerSize<number>; reserveCrewHours?: PerSize<number>; intakeM3s?: PerSize<number> };
  data?: { demandKbps?: PerSize<number>; supplyKbps?: PerSize<number>; controlSlots?: PerSize<number>; slotsUsed?: PerSize<number> };
  ammoFeed?: { direction: "in" | "out"; capacity: PerSize<number>; medium: string };
  extraPorts?: (i: number, s: ShipSizeClass) => PortSpec[];
  stats?: (i: number, s: ShipSizeClass) => Partial<ShipComponentDefinition>;
  cost: PerSize<number>;
  buildTimeS: PerSize<number>;
  techTier?: PerSize<1 | 2 | 3 | 4>;
  kitKey?: (i: number, s: ShipSizeClass) => string | null;
  artLibraryDesignId?: (i: number, s: ShipSizeClass) => string | null;
  notes?: string;
  idSuffix?: (i: number, s: ShipSizeClass) => string;
}
const zero = (sizes: Sizes) => sizes.map(() => 0);
const at = (v: PerSize<number> | undefined, i: number) => (v ? v[i] : 0);
const repeat = <T,>(sizes: Sizes, v: T): T[] => sizes.map(() => v);

function build(spec: KindSpec): ShipComponentDefinition[] {
  return spec.sizes.map((s, i) => {
    const variant = spec.variant ?? "standard";
    const suffix = spec.idSuffix ? spec.idSuffix(i, s) : s.toLowerCase();
    const id =
      spec.kind + (variant === "standard" ? "" : "." + variant) + "." + suffix;
    const envelope = spec.envelope(i, s);
    const powerIdle = at(spec.power?.idle, i),
      powerActive = at(spec.power?.active, i),
      powerPeak = spec.power?.peak
        ? spec.power.peak[i]
        : Math.max(powerActive, r2(powerActive * 1.2));
    const heatIdle = at(spec.heat?.idle, i),
      heatActive = at(spec.heat?.active, i),
      heatPeak = spec.heat?.peak
        ? spec.heat.peak[i]
        : Math.max(heatActive, r2(heatActive * 1.2));
    const coolantDemand =
      heatActive > SHIP_THERMAL_MODEL.airCooledMaxKw
        ? r2(heatActive / SHIP_THERMAL_MODEL.coolantKwPerLps)
        : 0;
    const generation = at(spec.power?.generation, i),
      discharge = at(spec.power?.discharge, i),
      charge = at(spec.power?.charge, i);
    const ports: PortSpec[] = [];
    if (powerPeak > 0 || charge > 0)
      ports.push({
        id: "power-in",
        channel: "power",
        direction: "in",
        capacity: ceil1(Math.max(powerPeak, charge)),
      });
    if (generation > 0 || discharge > 0)
      ports.push({
        id: "power-out",
        channel: "power",
        direction: "out",
        capacity: ceil1(Math.max(generation, discharge)),
      });
    const dataDemand = at(spec.data?.demandKbps, i),
      dataSupply = at(spec.data?.supplyKbps, i);
    if (dataDemand > 0)
      ports.push({ id: "data-in", channel: "data", direction: "in", capacity: dataDemand });
    if (dataSupply > 0)
      ports.push({ id: "data-out", channel: "data", direction: "out", capacity: dataSupply });
    const through = at(spec.coolantThroughLps, i);
    if (coolantDemand > 0 || through > 0)
      ports.push({
        id: "coolant-in",
        channel: "coolant",
        direction: "in",
        capacity: Math.max(coolantDemand, through),
      });
    const pump = at(spec.coolantSupplyLps, i);
    // Pumps drive the loop; flow-through parts (radiators, sinks) pass it on.
    if (pump > 0 || through > 0)
      ports.push({ id: "coolant-out", channel: "coolant", direction: "out", capacity: Math.max(pump, through) });
    const fuelActive = at(spec.fuel?.active, i),
      fuelCap = at(spec.fuel?.capacityL, i);
    if (fuelActive > 0)
      ports.push({ id: "fuel-in", channel: "fuel", direction: "in", capacity: ceil1(fuelActive * 1.25) || 0.1 });
    if (fuelCap > 0)
      ports.push({ id: "fuel-out", channel: "fuel", direction: "out", capacity: at(spec.fuel?.outLps, i) });
    const airOut = at(spec.air?.supplyM3s, i);
    if (airOut > 0)
      ports.push({ id: "air-out", channel: "ventilation", direction: "out", capacity: airOut });
    const airIn = at(spec.air?.intakeM3s, i);
    if (airIn > 0)
      ports.push({ id: "air-in", channel: "ventilation", direction: "in", capacity: airIn });
    if (spec.ammoFeed)
      ports.push({
        id: spec.ammoFeed.direction === "in" ? "ammo-in" : "ammo-out",
        channel: "ammo",
        direction: spec.ammoFeed.direction,
        capacity: spec.ammoFeed.capacity[i],
        medium: spec.ammoFeed.medium,
      });
    if (spec.extraPorts) ports.push(...spec.extraPorts(i, s));
    const stats = spec.stats ? spec.stats(i, s) : {};
    const n = SHIP_SIZE_CELLS[s];
    const definition: ShipComponentDefinition = {
      id,
      revision: 1,
      status: spec.status ?? "proposed",
      name: `${spec.name} ${s}`,
      family: spec.family,
      kind: spec.kind,
      variant,
      faction: spec.faction ?? "common",
      sizeClass: s,
      mount: {
        frame: shipMountFrameOf(spec.sockets[0]),
        sockets: spec.sockets,
        cells: spec.cells ? spec.cells(i, s) : [n, n],
        envelopeM: envelope,
        clearance: spec.clearance ? spec.clearance(i, s) : null,
        rearOnly: false,
      },
      massKg: spec.massKg[i],
      integrity: {
        hp: spec.hp[i],
        armor: at(spec.armor, i),
        destroyedEffect: spec.destroyedEffect ?? "none",
        explosionDamage: at(spec.explosionDamage, i),
      },
      crew: {
        operators: 0,
        station: null,
        automation: "passive",
        berths: 0,
        ...spec.crew,
      },
      power: {
        idleKw: powerIdle,
        activeKw: powerActive,
        peakKw: powerPeak,
        generationKw: generation,
        storageKwh: at(spec.power?.storageKwh, i),
        maxDischargeKw: discharge,
        maxChargeKw: charge,
      },
      heat: {
        idleKw: heatIdle,
        activeKw: heatActive,
        peakKw: heatPeak,
        rejectionKw: at(spec.heat?.rejection, i),
        storageMj: at(spec.heat?.storageMj, i),
      },
      fluids: {
        coolantDemandLps: coolantDemand,
        coolantSupplyLps: pump,
        fuelIdleLps: at(spec.fuel?.idle, i),
        fuelActiveLps: fuelActive,
        fuelCapacityL: fuelCap,
        airSupplyM3s: airOut,
        crewSupported: at(spec.air?.crewSupported, i),
        reserveCrewHours: at(spec.air?.reserveCrewHours, i),
      },
      data: {
        demandKbps: dataDemand,
        supplyKbps: dataSupply,
        controlSlots: at(spec.data?.controlSlots, i),
        controlSlotsUsed: at(spec.data?.slotsUsed, i),
      },
      ports: layoutPorts(spec.sockets[0], envelope, ports),
      propulsion: null,
      weapon: null,
      magazine: null,
      shield: null,
      armor: null,
      sensor: null,
      tool: null,
      access: null,
      control: null,
      gravity: null,
      economy: {
        costCredits: spec.cost[i],
        buildTimeS: spec.buildTimeS[i],
        techTier: spec.techTier ? spec.techTier[i] : 1,
      },
      art: {
        kitKey: spec.kitKey ? spec.kitKey(i, s) : null,
        glb: spec.kitKey && spec.kitKey(i, s) ? shipComponentGlbPath(id) : null,
        artLibraryDesignId: spec.artLibraryDesignId
          ? spec.artLibraryDesignId(i, s)
          : null,
      },
      notes: spec.notes ?? "",
      ...stats,
    };
    return definition;
  });
}

const ALL: Sizes = ["SM", "MD", "LG", "XL"];
const SML: Sizes = ["SM", "MD", "LG"];
const SMMD: Sizes = ["SM", "MD"];
const MDLG: Sizes = ["MD", "LG"];
const lower = (s: ShipSizeClass) => s.toLowerCase();
const g0 = 9.80665;
/** Effective specific impulse implied by thrust and fuel flow (0 when fuel-free). */
const isp = (thrustKn: number, fuelLps: number) =>
  fuelLps > 0
    ? Math.round((thrustKn * 1000) / (fuelLps * SHIP_THERMAL_MODEL.fuelKgPerL * g0))
    : 0;
const propulsion = (
  role: NonNullable<ShipComponentDefinition["propulsion"]>["role"],
  thrustKn: number,
  fuelLps: number,
  gimbalDeg: number,
  throttleResponseS: number,
  plume: { lengthM: number; radiusM: number } | null,
): Partial<ShipComponentDefinition> => ({
  propulsion: {
    role,
    thrustKn,
    gimbalDeg,
    throttleResponseS,
    specificImpulseS: isp(thrustKn, fuelLps),
    plume,
  },
});
const plumeClear = (w: number, len: number) => ({
  kind: "plume" as const,
  lengthM: r2(len),
  arcDeg: 20,
});

// ---------------------------------------------------------------- propulsion
const ION_LEN = [2.75, 4.625, 5.75, 8.25];
const ION_THRUST = [11, 24, 50, 95];
const ION_FUEL = [0.012, 0.026, 0.054, 0.1];
const ionSpec = (variant: "standard" | "salvaged"): KindSpec => {
  const k = variant === "salvaged";
  const m = (a: readonly number[], f: number, d = 0) =>
    a.map((v) => (d ? Math.round(v * f * d) / d : Math.round(v * f)));
  const thrust = k ? ION_THRUST.map((t) => r2(t * 0.85)) : ION_THRUST;
  return {
    kind: "ion-drive",
    name: k ? "Salvaged ion drive" : "Ion drive",
    family: "propulsion",
    variant,
    faction: k ? "riftjack" : "common",
    sizes: ALL,
    sockets: ["rear", "face"],
    // The salvaged bypass pipe and patches stand 0.0625 m proud on one side.
    envelope: (i, s) => outward(SHIP_SIZE_CELLS[s] + (k ? 0.125 : 0), ION_LEN[i]),
    clearance: (i, s) => plumeClear(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s] * 3.3),
    massKg: m([380, 900, 2000, 4200], k ? 1.12 : 1),
    hp: m([140, 300, 520, 820], k ? 0.7 : 1),
    armor: [2, 3, 4, 5],
    destroyedEffect: k ? "fire" : "none",
    crew: { automation: "computer", station: "pilot" },
    power: {
      idle: [2, 4, 8, 15],
      active: m([60, 130, 260, 480], k ? 1.2 : 1),
    },
    heat: {
      idle: [1, 2, 3, 5],
      active: m([21, 46, 91, 168], k ? 1.5 : 1),
    },
    fuel: { active: k ? ION_FUEL.map((f) => r3(f * 1.15)) : ION_FUEL },
    data: { demandKbps: [20, 20, 30, 40], slotsUsed: [1, 1, 1, 1] },
    stats: (i, s) =>
      propulsion(
        "main",
        thrust[i],
        k ? r3(ION_FUEL[i] * 1.15) : ION_FUEL[i],
        5,
        1.2,
        { lengthM: r2(SHIP_SIZE_CELLS[s] * 2.2), radiusM: r2(SHIP_SIZE_CELLS[s] * 0.31) },
      ),
    cost: m([4200, 9800, 21000, 42000], k ? 0.4 : 1),
    buildTimeS: m([120, 240, 480, 900], k ? 0.6 : 1),
    techTier: [1, 2, 2, 3],
    kitKey: (_i, s) => (k ? `ion.${s}.scrap` : `ion.${s}`),
    notes: k
      ? "Same sockets and envelope as the ion drive. Cheaper, weaker, hotter and more fragile; burns on destruction."
      : "Electric main drive: efficient on propellant, heavy on power. XL is rear-only and may overhang the hull height.",
  };
};

const BLOCK_LEN = [2.375, 3.5, 4.5, 5.5];
const BLOCK_H = [0.75, 1.5, 2.25, 3.0];
const BLOCK_FUEL = [0.08, 0.17, 0.35, 0.65];
const BLOCK_THRUST = [16, 34, 70, 130];
const blockSpec: KindSpec = {
  kind: "thrust-block",
  name: "Thrust block",
  family: "propulsion",
  sizes: ALL,
  sockets: ["rear", "face"],
  // Collar and side trims stand 0.125 m proud of the hardpoint square.
  envelope: (i, s) => outward(SHIP_SIZE_CELLS[s] + 0.25, BLOCK_LEN[i], BLOCK_H[i] + 0.25),
  clearance: (i, s) => plumeClear(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s] * 3),
  massKg: [320, 800, 1800, 3800],
  hp: [160, 340, 600, 950],
  armor: [3, 4, 6, 8],
  destroyedEffect: "fire",
  crew: { automation: "computer", station: "pilot" },
  power: { idle: [1, 1.5, 3, 5], active: [10, 20, 38, 70] },
  heat: { idle: [1, 2, 3, 5], active: [20, 42, 85, 160], peak: [25, 53, 106, 200] },
  fuel: { active: BLOCK_FUEL },
  data: { demandKbps: [20, 20, 30, 40], slotsUsed: [1, 1, 1, 1] },
  stats: (i, s) =>
    propulsion("main", BLOCK_THRUST[i], BLOCK_FUEL[i], 8, 0.3, {
      lengthM: r2(SHIP_SIZE_CELLS[s] * 1.8),
      radiusM: r2(BLOCK_H[i] * 0.3),
    }),
  cost: [3200, 7600, 16500, 33000],
  buildTimeS: [100, 200, 420, 780],
  techTier: [1, 1, 2, 2],
  kitKey: (_i, s) => `block.${s}`,
  notes: "Chemical/fusion torch block: 45% more thrust than the ion drive of the same size, ~7x the propellant, little power. XL has twin nozzles and is rear-only.",
};

const RES_THRUST = [13, 28, 58];
const resonanceSpec: KindSpec = {
  kind: "resonance-drive",
  name: "Aurelian resonance drive",
  family: "propulsion",
  variant: "aurelian",
  faction: "aurelian",
  sizes: SML,
  sockets: ["rear", "face"],
  // Crystal fins stand proud of the pod by 0.0625 m per size step.
  envelope: (i, s) => outward(SHIP_SIZE_CELLS[s] + 0.125 * SHIP_SIZE_CELLS[s], [1.875, 2.625, 3.75][i]),
  clearance: (_i, s) => plumeClear(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s] * 2.6),
  massKg: [300, 720, 1600],
  hp: [120, 260, 460],
  armor: [2, 3, 4],
  destroyedEffect: "explosion",
  explosionDamage: [120, 260, 500],
  crew: { automation: "computer", station: "pilot" },
  power: { idle: [3, 6, 12], active: [70, 150, 300] },
  heat: { idle: [1, 1, 2], active: [13, 28, 55] },
  data: { demandKbps: [40, 40, 60], slotsUsed: [1, 1, 1] },
  stats: (i, s) =>
    propulsion("main", RES_THRUST[i], 0, 12, 0.6, {
      lengthM: r2(SHIP_SIZE_CELLS[s] * 1.8),
      radiusM: r2(SHIP_SIZE_CELLS[s] * 0.28),
    }),
  cost: [10500, 24500, 52000],
  buildTimeS: [300, 600, 1200],
  techTier: [4, 4, 4],
  kitKey: (_i, s) => `x.resonance.${s}`,
  notes: "Alien variant: propellant-free (power only), lighter and cooler, explodes when destroyed. Faction-locked tech tier 4.",
};

const rcsSpec: KindSpec = {
  kind: "rcs",
  name: "RCS thruster",
  family: "propulsion",
  sizes: SMMD,
  sockets: ["face", "rear"],
  cells: () => [1, 1],
  envelope: (i) => outward([0.75, 1.25][i], [0.5, 1.0][i], [0.75, 1.25][i]),
  clearance: (i) => plumeClear(1, [1.5, 2.5][i]),
  massKg: [45, 120],
  hp: [60, 120],
  armor: [1, 2],
  crew: { automation: "computer", station: "pilot" },
  power: { idle: [0.2, 0.4], active: [4, 10] },
  heat: { idle: [0, 0], active: [2, 4] },
  fuel: { active: [0.015, 0.04] },
  data: { demandKbps: [10, 10], slotsUsed: [0, 0] },
  stats: (i) => propulsion("maneuver", [3, 9][i], [0.015, 0.04][i], 0, 0.1, { lengthM: [0.8, 1.4][i], radiusM: [0.12, 0.22][i] }),
  cost: [600, 1500],
  buildTimeS: [30, 60],
  kitKey: (_i, s) => `rcs.${s}`,
  notes: "Monopropellant attitude thruster. Both sizes fit a single 1 m cell; RCS clusters share the ship's IFCS computer slot.",
};

const vtolSpec: KindSpec = {
  kind: "vtol-thruster",
  name: "VTOL thruster",
  family: "propulsion",
  status: "future",
  sizes: SMMD,
  sockets: ["bottom"],
  envelope: (_i, s) => topMount(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s] * 0.6),
  massKg: [260, 620],
  hp: [120, 260],
  crew: { automation: "computer", station: "pilot" },
  power: { idle: [1, 2], active: [15, 32] },
  heat: { idle: [0, 1], active: [18, 40] },
  fuel: { active: [0.1, 0.22] },
  data: { demandKbps: [20, 20], slotsUsed: [1, 1] },
  stats: (i) => propulsion("vertical", [20, 45][i], [0.1, 0.22][i], 10, 0.3, { lengthM: [1.5, 2.5][i], radiusM: [0.3, 0.55][i] }),
  cost: [3800, 8800],
  buildTimeS: [120, 240],
  techTier: [2, 2],
  kitKey: (_i, s) => `x.vtol.${s}`,
  notes: "FUTURE: vertical gameplay needs its own design and tests (AGENTS.md). Rejected by the compiler unless future parts are allowed; never feeds planar flight.",
};

const warpSpec: KindSpec = {
  kind: "warp-drive",
  name: "Warp drive",
  family: "propulsion",
  status: "future",
  sizes: ["LG", "XL"],
  sockets: ["interior"],
  cells: (i) => [[3, 4], [4, 5]][i] as [number, number],
  envelope: (i) => interior([3, 4][i], [4, 5][i], [2.6, 3.2][i]),
  massKg: [6500, 12000],
  hp: [600, 1000],
  armor: [6, 8],
  destroyedEffect: "explosion",
  explosionDamage: [1500, 3000],
  crew: { automation: "manual", station: "engineer", operators: 1 },
  power: { idle: [5, 10], active: [1500, 4000], peak: [1800, 4800] },
  heat: { idle: [2, 4], active: [300, 800] },
  data: { demandKbps: [500, 1000], slotsUsed: [2, 2] },
  stats: () => propulsion("jump", 0, 0, 0, 30, null),
  cost: [180000, 400000],
  buildTimeS: [3600, 7200],
  techTier: [4, 4],
  kitKey: (_i, s) => `x.warp.${s}`,
  notes: "FUTURE: jump travel is not designed. Charge draw shown so power planning can reserve it.",
};

// --------------------------------------------------------------------- power
const reactorSpec: KindSpec = {
  kind: "reactor",
  name: "Fusion reactor",
  family: "power",
  sizes: SML,
  sockets: ["interior"],
  cells: (i) => [[2, 2], [3, 3], [4, 4]][i] as [number, number],
  envelope: (i) => interior([1.8, 2.8, 3.8][i], [1.8, 2.8, 3.8][i], [1.9, 2.6, 3.2][i]),
  massKg: [600, 1500, 3800],
  hp: [300, 650, 1100],
  armor: [6, 8, 10],
  destroyedEffect: "explosion",
  explosionDamage: [400, 900, 2000],
  crew: { automation: "computer", station: "engineer" },
  power: { idle: [2, 5, 10], active: [2, 5, 10], peak: [2, 5, 10], generation: [250, 700, 1800] },
  heat: { idle: [10, 25, 60], active: [50, 140, 360], peak: [60, 170, 430] },
  fuel: { idle: [0.0008, 0.002, 0.005], active: [0.004, 0.01, 0.024] },
  data: { demandKbps: [40, 60, 80], slotsUsed: [1, 1, 1] },
  cost: [9000, 22000, 52000],
  buildTimeS: [300, 600, 1200],
  techTier: [1, 2, 3],
  kitKey: (_i, s) => `x.reactor.${s}`,
  artLibraryDesignId: (i) => (i === 1 ? "shipyard.equipment.reactor" : null),
  notes: "Generation is rated output. Waste heat ~20% of delivered power at full load; fuel scales with load. The art-library reactor review lists 1 MW / 200 kW heat, which is not an approved stat.",
};
const batterySpec: KindSpec = {
  kind: "battery",
  name: "Battery bank",
  family: "power",
  sizes: SML,
  sockets: ["interior"],
  cells: (i) => [[1, 1], [1, 2], [2, 2]][i] as [number, number],
  envelope: (i) => interior([0.9, 0.9, 1.8][i], [0.9, 1.8, 1.8][i], [1.4, 1.6, 1.8][i]),
  massKg: [180, 450, 1100],
  hp: [120, 240, 420],
  armor: [3, 4, 5],
  destroyedEffect: "fire",
  power: { idle: [0, 0, 0], active: [0, 0, 0], peak: [0, 0, 0], storageKwh: [20, 60, 160], discharge: [120, 320, 800], charge: [60, 160, 400] },
  heat: { idle: [0, 0, 0], active: [4, 10, 24] },
  data: { demandKbps: [5, 5, 10] },
  cost: [2400, 6000, 14500],
  buildTimeS: [90, 180, 360],
  kitKey: (_i, s) => `x.battery.${s}`,
  notes: "Buffers generation deficits; heat is at maximum discharge.",
};
const capacitorSpec: KindSpec = {
  kind: "capacitor",
  name: "Capacitor bank",
  family: "power",
  sizes: SML,
  sockets: ["interior"],
  cells: (i) => [[1, 1], [1, 1], [2, 1]][i] as [number, number],
  envelope: (i) => interior([0.8, 0.9, 1.8][i], [0.8, 0.9, 0.9][i], [1.0, 1.6, 1.6][i]),
  massKg: [90, 220, 520],
  hp: [80, 160, 280],
  armor: [2, 3, 4],
  destroyedEffect: "explosion",
  explosionDamage: [60, 150, 400],
  power: { idle: [0, 0, 0], active: [0, 0, 0], peak: [0, 0, 0], storageKwh: [0.4, 1.2, 3.5], discharge: [1200, 3000, 7500], charge: [150, 400, 1000] },
  heat: { idle: [0, 0, 0], active: [3, 8, 20] },
  data: { demandKbps: [5, 5, 10] },
  cost: [1800, 4400, 10500],
  buildTimeS: [60, 120, 240],
  techTier: [2, 2, 3],
  kitKey: (_i, s) => `x.capacitor.${s}`,
  notes: "Small store, very high discharge. Pulse weapons (railgun, plasma) need a bank holding at least one shot each.",
};
const fuelTankSpec: KindSpec = {
  kind: "fuel-tank",
  name: "Fuel tank",
  family: "power",
  sizes: SML,
  sockets: ["interior"],
  cells: (_i, s) => [SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s]],
  envelope: (i) => interior([0.9, 1.9, 2.9][i], [0.9, 1.9, 2.9][i], [0.9, 0.9, 1.1][i] + 0.4),
  massKg: [120, 320, 850],
  hp: [100, 220, 420],
  armor: [2, 3, 4],
  destroyedEffect: "fuel-leak",
  fuel: { capacityL: [400, 1400, 4500], outLps: [0.5, 1.5, 4] },
  cost: [900, 2200, 5500],
  buildTimeS: [60, 120, 240],
  kitKey: (_i, s) => `x.fuel-tank.${s}`,
  notes: "Dry mass shown; fuel adds 0.8 kg/L (inventory `liquid:fuel`). Shared by reactors, engines, RCS and aux generators.",
};
const solarSpec: KindSpec = {
  kind: "solar-array",
  name: "Solar array",
  family: "power",
  sizes: SMMD,
  sockets: ["top", "face"],
  envelope: (i, s) => topMount(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s], [0.5, 0.65][i]),
  massKg: [60, 160],
  hp: [40, 80],
  power: { idle: [0, 0], active: [0, 0], peak: [0, 0], generation: [12, 35] },
  cost: [900, 2300],
  buildTimeS: [45, 90],
  kitKey: (_i, s) => `x.solar.${s}`,
  notes: "Auxiliary; output assumes 1 AU-equivalent light. Fragile.",
};
const auxGenSpec: KindSpec = {
  kind: "aux-generator",
  name: "Fuel-cell generator",
  family: "power",
  sizes: ["SM"],
  sockets: ["interior"],
  envelope: () => interior(0.9, 0.9, 1.4),
  massKg: [220],
  hp: [120],
  armor: [3],
  destroyedEffect: "fire",
  power: { idle: [0.5], active: [0.5], peak: [0.5], generation: [80] },
  heat: { idle: [1], active: [16] },
  fuel: { idle: [0.0005], active: [0.01] },
  data: { demandKbps: [5] },
  cost: [2600],
  buildTimeS: [120],
  kitKey: () => "x.aux-generator.SM",
  notes: "Backup/black-start generator for small craft.",
};

// ------------------------------------------------------------------- thermal
const radiatorSpec: KindSpec = {
  kind: "radiator",
  name: "Radiator panel",
  family: "thermal",
  sizes: SML,
  sockets: ["top", "face"],
  envelope: (i, s) => topMount(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s], [0.6, 0.9, 1.2][i]),
  massKg: [90, 240, 600],
  hp: [60, 120, 200],
  armor: [0, 1, 1],
  destroyedEffect: "coolant-leak",
  heat: { idle: [0, 0, 0], active: [0, 0, 0], rejection: [60, 160, 400] },
  coolantThroughLps: [2.4, 6.4, 16],
  cost: [1100, 2800, 6600],
  buildTimeS: [60, 120, 240],
  kitKey: (_i, s) => `x.radiator.${s}`,
  notes: "Rejects heat only while pumps move coolant to it: effective rejection = min(radiators, pumps x 25 kW per L/s).",
};
const pumpSpec: KindSpec = {
  kind: "coolant-pump",
  name: "Coolant pump loop",
  family: "thermal",
  sizes: SML,
  sockets: ["interior"],
  cells: (i) => [[1, 1], [1, 1], [2, 1]][i] as [number, number],
  envelope: (i) => interior([0.8, 0.9, 1.8][i], [0.8, 0.9, 0.9][i], [0.9, 1.2, 1.4][i]),
  massKg: [80, 180, 420],
  hp: [80, 150, 260],
  armor: [2, 3, 4],
  destroyedEffect: "coolant-leak",
  power: { idle: [1, 2, 4], active: [4, 9, 20] },
  heat: { idle: [0, 0, 0], active: [1, 2, 4] },
  coolantSupplyLps: [8, 20, 48],
  coolantThroughLps: [8, 20, 48],
  data: { demandKbps: [5, 5, 10] },
  cost: [700, 1600, 3800],
  buildTimeS: [45, 90, 180],
  kitKey: (_i, s) => `x.coolant-pump.${s}`,
  notes: "Supplies loop flow (out) and takes the return (in). 1 L/s carries 25 kW.",
};
const heatSinkSpec: KindSpec = {
  kind: "heat-sink",
  name: "Heat sink",
  family: "thermal",
  sizes: SMMD,
  sockets: ["interior"],
  cells: (i) => [[1, 1], [2, 1]][i] as [number, number],
  envelope: (i) => interior([0.9, 1.8][i], 0.9, [1.2, 1.4][i]),
  massKg: [150, 400],
  hp: [120, 240],
  armor: [3, 4],
  heat: { idle: [0, 0], active: [0, 0], storageMj: [20, 60] },
  coolantThroughLps: [4, 10],
  cost: [800, 2000],
  buildTimeS: [45, 90],
  kitKey: (_i, s) => `x.heat-sink.${s}`,
  notes: "Phase-change buffer: time to overheat = storage / heat deficit.",
};

// ------------------------------------------------------------------- weapons
type WeaponStats = NonNullable<ShipComponentDefinition["weapon"]>;
const fireArc = (range: number, arc: number) => ({
  kind: "fire-arc" as const,
  lengthM: Math.min(range, 30),
  arcDeg: arc,
});
interface WeaponKind {
  kind: string;
  name: string;
  kit: string;
  sizes: Sizes;
  sockets?: readonly ShipMountSocket[];
  heightScale?: number;
  forward?: number;
  mass: PerSize<number>;
  hp: PerSize<number>;
  armor?: PerSize<number>;
  power: Loads;
  heat: Loads;
  dataKbps: PerSize<number>;
  ammoFeed?: { capacity: PerSize<number>; medium: string };
  automation?: ShipComponentDefinition["crew"]["automation"];
  destroyedEffect?: ShipComponentDefinition["integrity"]["destroyedEffect"];
  explosionDamage?: PerSize<number>;
  w: (i: number) => WeaponStats;
  cost: PerSize<number>;
  buildTimeS: PerSize<number>;
  techTier?: PerSize<1 | 2 | 3 | 4>;
  notes: string;
  faceOnly?: boolean;
}
function weaponSpec(k: WeaponKind): KindSpec {
  return {
    kind: k.kind,
    name: k.name,
    family: "weapon",
    sizes: k.sizes,
    sockets: k.sockets ?? ["top", "face", "bottom"],
    envelope: (_i, s) =>
      k.faceOnly
        ? outward(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s] * 2.15, SHIP_SIZE_CELLS[s] * 0.9)
        : topMount(
            SHIP_SIZE_CELLS[s],
            SHIP_SIZE_CELLS[s],
            r2(SHIP_SIZE_CELLS[s] * (k.heightScale ?? 0.95)),
            r2(SHIP_SIZE_CELLS[s] * (k.forward ?? 0)),
          ),
    clearance: (i) => fireArc(k.w(i).rangeM, k.w(i).arcDeg),
    massKg: k.mass,
    hp: k.hp,
    armor: k.armor ?? k.sizes.map((_s, i) => 2 + i * 2),
    destroyedEffect: k.destroyedEffect ?? "none",
    explosionDamage: k.explosionDamage,
    crew: {
      automation: k.automation ?? "computer",
      station: "gunner",
      operators: k.automation === "manual" ? 1 : 0,
    },
    power: k.power,
    heat: k.heat,
    data: { demandKbps: k.dataKbps, slotsUsed: k.sizes.map(() => 1) },
    ammoFeed: k.ammoFeed ? { direction: "in", ...k.ammoFeed } : undefined,
    stats: (i) => ({ weapon: k.w(i) }),
    cost: k.cost,
    buildTimeS: k.buildTimeS,
    techTier: k.techTier,
    kitKey: (_i, s) => `${k.kit}.${s}`,
    notes: k.notes,
  };
}
const W = (
  p: Omit<WeaponStats, "capacitorKjPerShot" | "heatPerShotKj" | "areaRadiusM" | "projectilesPerShot" | "roundsPerShot"> &
    Partial<WeaponStats>,
): WeaponStats => ({
  projectilesPerShot: 1,
  roundsPerShot: p.ammoType ? 1 : 0,
  areaRadiusM: 0,
  capacitorKjPerShot: 0,
  heatPerShotKj: 0,
  ...p,
});
/** Energy weapons: active draw = energy per shot x shots per second. */
const energyActive = (idle: number[], kj: number[], spm: number[]) =>
  idle.map((v, i) => r2(v + (kj[i] * spm[i]) / 60));
const LASER_KJ = [40, 110, 320],
  LASER_SPM = [60, 45, 30];
const RAIL_KJ = [900, 2400],
  RAIL_SPM = [10, 6];
const PLASMA_KJ = [200, 480],
  PLASMA_SPM = [24, 18];
const weaponKinds: WeaponKind[] = [
  {
    kind: "point-defense",
    name: "Point-defense turret",
    kit: "wpn.pd",
    sizes: SMMD,
    heightScale: 1.19,
    forward: 0.29,
    mass: [180, 420],
    hp: [90, 180],
    power: { idle: [1, 2], active: [6, 12] },
    heat: { idle: [0, 1], active: [4, 7] },
    dataKbps: [60, 80],
    ammoFeed: { capacity: [16, 40], medium: "ballistic" },
    w: (i) =>
      W({
        class: "anti-fighter",
        damageType: "kinetic",
        damagePerShot: [6, 9][i],
        projectilesPerShot: [1, 2][i],
        roundsPerShot: [1, 2][i],
        shotsPerMinute: [600, 700][i],
        rangeM: [600, 800][i],
        projectileSpeedMps: 1400,
        ammoType: "pd-20mm",
        energyPerShotKj: 0,
        arcDeg: 300,
        trackingDegPerS: [120, 100][i],
      }),
    cost: [2600, 6200],
    buildTimeS: [90, 180],
    notes: "Autonomous under a fire-control slot; intercepts missiles and fighters.",
  },
  {
    kind: "autocannon",
    name: "Twin autocannon",
    kit: "wpn.autocannon",
    sizes: SML,
    heightScale: 1.32,
    forward: 0.73,
    mass: [260, 620, 1400],
    hp: [120, 260, 460],
    power: { idle: [1, 2, 4], active: [6, 12, 22] },
    heat: { idle: [0, 1, 2], active: [5, 10, 18] },
    dataKbps: [50, 60, 80],
    ammoFeed: { capacity: [10, 10, 10], medium: "ballistic" },
    w: (i) =>
      W({
        class: "ballistic",
        damageType: "kinetic",
        damagePerShot: [28, 52, 90][i],
        projectilesPerShot: 2,
        roundsPerShot: 2,
        shotsPerMinute: [240, 210, 180][i],
        rangeM: [1000, 1300, 1600][i],
        projectileSpeedMps: [1100, 1200, 1300][i],
        ammoType: "ac-30mm",
        energyPerShotKj: 0,
        arcDeg: 270,
        trackingDegPerS: [60, 45, 30][i],
      }),
    cost: [3000, 7200, 16000],
    buildTimeS: [90, 180, 360],
    notes: "Versatile ballistic mount; twin barrels fire together (damage per projectile).",
  },
  {
    kind: "laser-cannon",
    name: "Laser cannon",
    kit: "wpn.laser",
    sizes: SML,
    heightScale: 1.13,
    forward: 0.44,
    mass: [300, 700, 1600],
    hp: [110, 240, 420],
    power: {
      idle: [2, 4, 8],
      active: energyActive([2, 4, 8], LASER_KJ, LASER_SPM),
    },
    heat: {
      idle: [1, 2, 3],
      active: LASER_KJ.map((kj, i) => r2((kj * 0.7 * LASER_SPM[i]) / 60)),
    },
    dataKbps: [60, 80, 100],
    w: (i) =>
      W({
        class: "energy",
        damageType: "thermal",
        damagePerShot: [45, 100, 220][i],
        shotsPerMinute: LASER_SPM[i],
        rangeM: [1200, 1600, 2100][i],
        projectileSpeedMps: 0,
        ammoType: null,
        energyPerShotKj: LASER_KJ[i],
        heatPerShotKj: r2(LASER_KJ[i] * 0.7),
        arcDeg: 270,
        trackingDegPerS: [50, 40, 28][i],
      }),
    cost: [4200, 10000, 23000],
    buildTimeS: [120, 240, 480],
    techTier: [2, 2, 3],
    notes: "Hitscan (projectile speed 0). No ammunition; 70% of shot energy becomes heat.",
  },
  {
    kind: "railgun",
    name: "Railgun mount",
    kit: "wpn.railgun",
    sizes: MDLG,
    heightScale: 0.94,
    forward: 0.73,
    mass: [1200, 2600],
    hp: [300, 520],
    power: {
      idle: [5, 10],
      active: energyActive([5, 10], RAIL_KJ, RAIL_SPM),
    },
    heat: {
      idle: [2, 3],
      active: RAIL_KJ.map((kj, i) => r2((kj * 0.45 * RAIL_SPM[i]) / 60)),
    },
    dataKbps: [120, 160],
    ammoFeed: { capacity: [1, 1], medium: "ballistic" },
    automation: "manual",
    w: (i) =>
      W({
        class: "ballistic",
        damageType: "kinetic",
        damagePerShot: [420, 950][i],
        shotsPerMinute: RAIL_SPM[i],
        rangeM: [3000, 4200][i],
        projectileSpeedMps: [6000, 8000][i],
        ammoType: "rail-slug",
        energyPerShotKj: RAIL_KJ[i],
        capacitorKjPerShot: RAIL_KJ[i],
        heatPerShotKj: r2(RAIL_KJ[i] * 0.45),
        arcDeg: 120,
        trackingDegPerS: [15, 10][i],
      }),
    cost: [22000, 52000],
    buildTimeS: [480, 960],
    techTier: [3, 3],
    notes: "Pulse weapon: capacitor bank must hold one shot; the reactor pays the average draw. Needs a gunner station.",
  },
  {
    kind: "missile-pod",
    name: "Missile pod",
    kit: "wpn.missile",
    sizes: SML,
    heightScale: 1.38,
    forward: 0,
    mass: [350, 800, 1700],
    hp: [110, 230, 400],
    power: { idle: [1, 2, 3], active: [4, 7, 11] },
    heat: { idle: [0, 1, 1], active: [2, 4, 6] },
    dataKbps: [80, 120, 160],
    ammoFeed: { capacity: [0.5, 1, 1.5], medium: "missile" },
    destroyedEffect: "explosion",
    explosionDamage: [300, 600, 900],
    w: (i) =>
      W({
        class: "missile",
        damageType: "explosive",
        damagePerShot: 160,
        projectilesPerShot: [4, 8, 12][i],
        roundsPerShot: [4, 8, 12][i],
        shotsPerMinute: [6, 5, 4.29][i],
        rangeM: [3500, 4000, 4500][i],
        projectileSpeedMps: 320,
        areaRadiusM: 6,
        ammoType: "missile-std",
        energyPerShotKj: 0,
        arcDeg: 360,
        trackingDegPerS: [40, 35, 30][i],
      }),
    cost: [5200, 12000, 26000],
    buildTimeS: [150, 300, 600],
    techTier: [2, 2, 3],
    notes: "Salvo launcher (4/8/12 tubes); shots per minute are salvos. Loaded pods explode when destroyed.",
  },
  {
    kind: "torpedo-launcher",
    name: "Torpedo launcher",
    kit: "x.torpedo",
    sizes: MDLG,
    sockets: ["face", "top"],
    faceOnly: true,
    mass: [1100, 2400],
    hp: [320, 560],
    power: { idle: [2, 4], active: [8, 14] },
    heat: { idle: [1, 1], active: [4, 7] },
    dataKbps: [150, 200],
    ammoFeed: { capacity: [0.1, 0.2], medium: "torpedo" },
    automation: "manual",
    destroyedEffect: "explosion",
    explosionDamage: [900, 1800],
    w: (i) =>
      W({
        class: "missile",
        damageType: "explosive",
        damagePerShot: [1400, 2600][i],
        projectilesPerShot: [1, 2][i],
        roundsPerShot: [1, 2][i],
        shotsPerMinute: [2.4, 2][i],
        rangeM: [6000, 7000][i],
        projectileSpeedMps: 180,
        areaRadiusM: [15, 20][i],
        ammoType: "torpedo-hvy",
        energyPerShotKj: 0,
        arcDeg: 60,
        trackingDegPerS: 15,
      }),
    cost: [18000, 40000],
    buildTimeS: [480, 900],
    techTier: [3, 3],
    notes: "Heavy anti-capital strike through a hull face; needs a gunner station and a torpedo rack.",
  },
  {
    kind: "flak-cannon",
    name: "Flak cannon",
    kit: "wpn.flak",
    sizes: SML,
    heightScale: 1.25,
    forward: 0.3,
    mass: [240, 560, 1250],
    hp: [110, 230, 400],
    power: { idle: [1, 2, 3], active: [5, 9, 15] },
    heat: { idle: [0, 1, 1], active: [4, 7, 11] },
    dataKbps: [50, 70, 90],
    ammoFeed: { capacity: [8, 10, 12], medium: "ballistic" },
    w: (i) =>
      W({
        class: "anti-fighter",
        damageType: "explosive",
        damagePerShot: [16, 22, 30][i],
        shotsPerMinute: [360, 400, 450][i],
        rangeM: [700, 800, 950][i],
        projectileSpeedMps: 900,
        areaRadiusM: [10, 12, 14][i],
        ammoType: "flak-40mm",
        energyPerShotKj: 0,
        arcDeg: 300,
        trackingDegPerS: [80, 65, 50][i],
      }),
    cost: [2800, 6600, 14500],
    buildTimeS: [90, 180, 360],
    notes: "Six-barrel burst cluster; area damage against small craft and missiles.",
  },
  {
    kind: "plasma-turret",
    name: "Plasma turret",
    kit: "x.plasma",
    sizes: MDLG,
    heightScale: 1.1,
    forward: 0,
    mass: [800, 1800],
    hp: [240, 420],
    power: {
      idle: [4, 8],
      active: energyActive([4, 8], PLASMA_KJ, PLASMA_SPM),
    },
    heat: {
      idle: [2, 4],
      active: PLASMA_KJ.map((kj, i) => r2((kj * 0.85 * PLASMA_SPM[i]) / 60)),
    },
    dataKbps: [90, 120],
    destroyedEffect: "explosion",
    explosionDamage: [300, 600],
    w: (i) =>
      W({
        class: "energy",
        damageType: "plasma",
        damagePerShot: [260, 580][i],
        shotsPerMinute: PLASMA_SPM[i],
        rangeM: [900, 1100][i],
        projectileSpeedMps: 700,
        areaRadiusM: [3, 4][i],
        ammoType: null,
        energyPerShotKj: PLASMA_KJ[i],
        capacitorKjPerShot: PLASMA_KJ[i],
        heatPerShotKj: r2(PLASMA_KJ[i] * 0.85),
        arcDeg: 270,
        trackingDegPerS: [30, 22][i],
      }),
    cost: [14000, 32000],
    buildTimeS: [360, 720],
    techTier: [3, 4],
    notes: "Short-range high damage; the hottest weapon per shot (85% of shot energy). Capacitor-fed.",
  },
  {
    kind: "side-cannon",
    name: "Side cannon sponson",
    kit: "cannon",
    sizes: SML,
    sockets: ["face"],
    faceOnly: true,
    mass: [220, 520, 1200],
    hp: [120, 250, 440],
    power: { idle: [0.5, 1, 2], active: [3, 5, 9] },
    heat: { idle: [0, 0, 1], active: [3, 5, 9] },
    dataKbps: [40, 50, 60],
    ammoFeed: { capacity: [2, 2, 4], medium: "ballistic" },
    w: (i) =>
      W({
        class: "ballistic",
        damageType: "kinetic",
        damagePerShot: [55, 110, 210][i],
        projectilesPerShot: [1, 1, 2][i],
        roundsPerShot: [1, 1, 2][i],
        shotsPerMinute: [80, 65, 50][i],
        rangeM: [1000, 1250, 1500][i],
        projectileSpeedMps: 1000,
        ammoType: "cannon-60mm",
        energyPerShotKj: 0,
        arcDeg: 90,
        trackingDegPerS: [25, 20, 15][i],
      }),
    cost: [2200, 5200, 12000],
    buildTimeS: [80, 160, 320],
    notes: "Hull-face broadside sponson with a limited 90 degree arc; LG has twin barrels.",
  },
];

// ---------------------------------------------------------------- ammunition
const AMMO_TYPES = [
  { id: "pd-20mm", ammoClass: "ballistic" as const, massKgPerRound: 0.12 },
  { id: "ac-30mm", ammoClass: "ballistic" as const, massKgPerRound: 0.4 },
  { id: "flak-40mm", ammoClass: "ballistic" as const, massKgPerRound: 1.2 },
  { id: "cannon-60mm", ammoClass: "ballistic" as const, massKgPerRound: 2.5 },
  { id: "rail-slug", ammoClass: "ballistic" as const, massKgPerRound: 6 },
  { id: "missile-std", ammoClass: "missile" as const, massKgPerRound: 45 },
  { id: "torpedo-hvy", ammoClass: "torpedo" as const, massKgPerRound: 600 },
];
const magazine = (
  ammoClass: "ballistic" | "missile" | "torpedo",
  capacityKg: number,
): Partial<ShipComponentDefinition> => ({
  magazine: {
    ammoClass,
    ammoTypes: AMMO_TYPES.filter((a) => a.ammoClass === ammoClass).map((a) => a.id),
    capacityKg,
  },
});
const magBallisticSpec: KindSpec = {
  kind: "magazine",
  name: "Ballistic magazine",
  family: "ammunition",
  variant: "ballistic",
  sizes: SML,
  sockets: ["interior"],
  cells: (i) => [[1, 1], [2, 1], [2, 2]][i] as [number, number],
  envelope: (i) => interior([0.9, 1.8, 1.8][i], [0.9, 0.9, 1.8][i], [1.2, 1.4, 1.6][i]),
  massKg: [240, 560, 1300],
  hp: [150, 300, 520],
  armor: [6, 8, 10],
  destroyedEffect: "explosion",
  explosionDamage: [300, 700, 1500],
  ammoFeed: { direction: "out", capacity: [40, 100, 200], medium: "ballistic" },
  power: { idle: [0.2, 0.4, 0.8], active: [1, 2, 4] },
  data: { demandKbps: [5, 5, 10] },
  stats: (i) => magazine("ballistic", [600, 2000, 6000][i]),
  cost: [1200, 2800, 6200],
  buildTimeS: [60, 120, 240],
  kitKey: (_i, s) => `x.magazine-ballistic.${s}`,
  notes: "Armoured locker with a conveyor feed. Capacity by mass (see ammo types).",
};
const magMissileSpec: KindSpec = {
  kind: "magazine",
  name: "Missile magazine",
  family: "ammunition",
  variant: "missile",
  sizes: MDLG,
  sockets: ["interior"],
  cells: (i) => [[2, 1], [3, 2]][i] as [number, number],
  envelope: (i) => interior([1.8, 2.8][i], [0.9, 1.8][i], [1.4, 1.8][i]),
  massKg: [500, 1200],
  hp: [260, 480],
  armor: [8, 10],
  destroyedEffect: "explosion",
  explosionDamage: [1200, 3000],
  ammoFeed: { direction: "out", capacity: [2, 4], medium: "missile" },
  power: { idle: [0.3, 0.6], active: [2, 4] },
  data: { demandKbps: [5, 10] },
  stats: (i) => magazine("missile", [720, 1800][i]),
  cost: [2600, 6000],
  buildTimeS: [120, 240],
  kitKey: (_i, s) => `x.magazine-missile.${s}`,
  notes: "16 / 40 standard missiles.",
};
const magTorpedoSpec: KindSpec = {
  kind: "magazine",
  name: "Torpedo rack",
  family: "ammunition",
  variant: "torpedo",
  sizes: ["LG"],
  sockets: ["interior"],
  cells: () => [3, 2],
  envelope: () => interior(2.8, 1.8, 1.8),
  massKg: [1400],
  hp: [560],
  armor: [12],
  destroyedEffect: "explosion",
  explosionDamage: [4000],
  ammoFeed: { direction: "out", capacity: [0.2], medium: "torpedo" },
  power: { idle: [0.5], active: [4] },
  data: { demandKbps: [10] },
  stats: () => magazine("torpedo", 3600),
  cost: [7500],
  buildTimeS: [300],
  kitKey: () => "x.magazine-torpedo.LG",
  notes: "Six heavy torpedoes.",
};

// ------------------------------------------------------------------- defense
const shieldGenSpec: KindSpec = {
  kind: "shield-generator",
  name: "Shield generator",
  family: "defense",
  sizes: SML,
  sockets: ["interior"],
  cells: (i) => [[1, 1], [2, 2], [3, 3]][i] as [number, number],
  envelope: (i) => interior([0.9, 1.8, 2.8][i], [0.9, 1.8, 2.8][i], [1.4, 1.9, 2.4][i]),
  massKg: [350, 850, 2000],
  hp: [160, 340, 600],
  armor: [4, 6, 8],
  destroyedEffect: "explosion",
  explosionDamage: [150, 350, 700],
  crew: { automation: "computer", station: "engineer" },
  power: { idle: [12, 30, 75], active: [90, 220, 520], peak: [110, 270, 640] },
  heat: { idle: [4, 10, 25], active: [45, 110, 260] },
  data: { demandKbps: [40, 60, 100], slotsUsed: [1, 1, 1] },
  stats: (i) => ({
    shield: {
      role: "generator",
      capacityHp: [800, 2400, 6500][i],
      rechargePerS: [25, 60, 150][i],
      rechargeDelayS: [5, 5, 6][i],
      radiusM: 0,
    },
  }),
  cost: [6500, 16000, 38000],
  buildTimeS: [240, 480, 960],
  techTier: [2, 3, 3],
  kitKey: (_i, s) => `x.shield-generator.${s}`,
  notes: "Stores shield capacity; idle draw holds the field, active draw recharges it. Needs at least one emitter whose bubble covers the hull.",
};
const shieldEmitterSpec: KindSpec = {
  kind: "shield-emitter",
  name: "Shield emitter",
  family: "defense",
  sizes: SML,
  sockets: ["top", "face", "bottom"],
  envelope: (_i, s) => topMount(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s], r2(SHIP_SIZE_CELLS[s] * 1.38)),
  massKg: [60, 150, 380],
  hp: [50, 110, 200],
  armor: [1, 2, 3],
  crew: { automation: "computer" },
  power: { idle: [1, 2, 4], active: [5, 10, 20] },
  heat: { idle: [0, 1, 2], active: [2, 4, 8] },
  data: { demandKbps: [20, 20, 30] },
  stats: (i) => ({
    shield: {
      role: "emitter",
      capacityHp: 0,
      rechargePerS: 0,
      rechargeDelayS: 0,
      radiusM: [8, 16, 28][i],
    },
  }),
  cost: [1800, 4400, 10500],
  buildTimeS: [90, 180, 360],
  techTier: [2, 2, 3],
  kitKey: (_i, s) => `wpn.shield.${s}`,
  notes: "Projects the generator's field; the ship bubble radius is the largest emitter radius.",
};
const ARMOR = [
  { v: "light", mass: 60, hp: 120, r: [0.1, 0.1, 0.05, 0.05], cost: 150 },
  { v: "medium", mass: 140, hp: 260, r: [0.25, 0.2, 0.2, 0.15], cost: 380 },
  { v: "heavy", mass: 260, hp: 480, r: [0.4, 0.3, 0.3, 0.25], cost: 800 },
  { v: "reactive", mass: 200, hp: 320, r: [0.3, 0.15, 0.55, 0.2], cost: 1100 },
] as const;
const armorSpecs: KindSpec[] = ARMOR.map((a, n) => ({
  kind: "armor-plate",
  name: `${a.v[0].toUpperCase()}${a.v.slice(1)} armour plate`,
  family: "defense",
  variant: a.v,
  sizes: ["SM"],
  sockets: ["face", "top", "bottom", "rear"],
  cells: () => [1, 1],
  envelope: () => outward(1, [0.125, 0.1875, 0.25, 0.25][n], 1),
  massKg: [a.mass],
  hp: [a.hp],
  armor: [[4, 8, 14, 10][n]],
  stats: () => ({
    armor: {
      class: a.v,
      hpPerCell: a.hp,
      massKgPerCell: a.mass,
      resist: { kinetic: a.r[0], thermal: a.r[1], explosive: a.r[2], plasma: a.r[3] },
    },
  }),
  cost: [a.cost],
  buildTimeS: [[20, 40, 70, 90][n]],
  techTier: [([1, 1, 2, 3] as const)[n]],
  kitKey: () => null,
  notes: "Per 1 m x 1 m hull cell. Armour is voxel ship structure (design doc 5): stats feed the damage model; its art comes from the structure style pass, not a component GLB.",
}));

// ------------------------------------------------------------------- sensors
const sensor = (
  kind: NonNullable<ShipComponentDefinition["sensor"]>["kind"],
  rangeM: number,
  arcDeg: number,
  scanTimeS = 0,
  commRangeM = 0,
): Partial<ShipComponentDefinition> => ({
  sensor: { kind, rangeM, arcDeg, scanTimeS, commRangeM },
});
const dishSpec: KindSpec = {
  kind: "sensor-dish",
  name: "Sensor dish",
  family: "sensor",
  sizes: SML,
  sockets: ["top", "face", "bottom"],
  envelope: (_i, s) => topMount(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s], r2(SHIP_SIZE_CELLS[s] * 1.44)),
  clearance: (_i, s) => ({ kind: "sweep", lengthM: SHIP_SIZE_CELLS[s] * 0.6, arcDeg: 360 }),
  massKg: [120, 300, 700],
  hp: [60, 120, 220],
  crew: { automation: "computer", station: "sensor" },
  power: { idle: [1, 2, 4], active: [10, 22, 45] },
  heat: { idle: [0, 1, 1], active: [3, 7, 14] },
  data: { demandKbps: [200, 500, 1200], slotsUsed: [1, 1, 1] },
  stats: (i) => sensor("dish", [3000, 6000, 10000][i], [90, 120, 150][i]),
  cost: [2200, 5400, 12500],
  buildTimeS: [90, 180, 360],
  kitKey: (_i, s) => `wpn.sensor.${s}`,
  notes: "Steerable long-range dish; arc is the instantaneous field.",
};
const radarSpec: KindSpec = {
  kind: "radar-array",
  name: "Radar array",
  family: "sensor",
  sizes: MDLG,
  sockets: ["top", "bottom"],
  envelope: (_i, s) => topMount(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s], r2(SHIP_SIZE_CELLS[s] * 0.9)),
  clearance: (_i, s) => ({ kind: "sweep", lengthM: SHIP_SIZE_CELLS[s] * 0.6, arcDeg: 360 }),
  massKg: [420, 950],
  hp: [140, 260],
  crew: { automation: "computer", station: "sensor" },
  power: { idle: [3, 6], active: [28, 60] },
  heat: { idle: [1, 2], active: [9, 20] },
  data: { demandKbps: [800, 1600], slotsUsed: [1, 1] },
  stats: (i) => sensor("radar", [4500, 8000][i], 360),
  cost: [6800, 15000],
  buildTimeS: [240, 480],
  techTier: [2, 3],
  kitKey: (_i, s) => `x.radar.${s}`,
  notes: "Rotating 360 degree search radar.",
};
const scannerSpec: KindSpec = {
  kind: "scanner-mast",
  name: "Scanner mast",
  family: "sensor",
  sizes: SMMD,
  sockets: ["top", "face"],
  envelope: (_i, s) => topMount(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s], r2(SHIP_SIZE_CELLS[s] * 1.82)),
  massKg: [90, 220],
  hp: [50, 100],
  crew: { automation: "computer", station: "sensor" },
  power: { idle: [0.5, 1], active: [8, 16] },
  heat: { idle: [0, 0], active: [3, 6] },
  data: { demandKbps: [300, 600], slotsUsed: [1, 1] },
  stats: (i) => sensor("scanner", [600, 1200][i], 360, [8, 5][i]),
  cost: [1900, 4600],
  buildTimeS: [90, 180],
  kitKey: (_i, s) => `x.scanner.${s}`,
  notes: "Short-range detailed scan (cargo, composition, signatures).",
};
const beaconSpec: KindSpec = {
  kind: "relay-beacon",
  name: "Relay beacon",
  family: "sensor",
  sizes: SMMD,
  sockets: ["top"],
  envelope: (_i, s) => topMount(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s], r2(SHIP_SIZE_CELLS[s] * 1.69)),
  massKg: [70, 180],
  hp: [40, 90],
  crew: { automation: "computer" },
  power: { idle: [1, 2], active: [6, 15] },
  heat: { idle: [0, 1], active: [2, 5] },
  data: { demandKbps: [100, 200] },
  stats: (i) => sensor("relay", 0, 360, 0, [25000, 60000][i]),
  cost: [1400, 3400],
  buildTimeS: [60, 120],
  kitKey: (_i, s) => `wpn.beacon.${s}`,
  notes: "Long-range comm/data relay; not a detection sensor.",
};

// ------------------------------------------------------------------- utility
const tool = (t: NonNullable<ShipComponentDefinition["tool"]>) => ({ tool: t });
const tractorSpec: KindSpec = {
  kind: "tractor-projector",
  name: "Tractor projector",
  family: "utility",
  sizes: SML,
  sockets: ["top", "face", "bottom"],
  envelope: (_i, s) => topMount(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s], r2(SHIP_SIZE_CELLS[s] * 1.32)),
  clearance: (i) => ({ kind: "beam", lengthM: [120, 220, 350][i], arcDeg: 30 }),
  massKg: [250, 650, 1500],
  hp: [90, 190, 340],
  crew: { automation: "computer", station: "sensor" },
  power: { idle: [2, 5, 10], active: [60, 160, 380], peak: [75, 200, 470] },
  heat: { idle: [1, 2, 3], active: [30, 80, 190] },
  data: { demandKbps: [60, 80, 100], slotsUsed: [1, 1, 1] },
  stats: (i) =>
    tool({
      kind: "tractor",
      rangeM: [120, 220, 350][i],
      forceKn: [6, 18, 45][i],
      maxTargetMassKg: [10000, 40000, 150000][i],
      rateKgPerS: 0,
      drones: 0,
    }),
  cost: [4800, 11500, 27000],
  buildTimeS: [180, 360, 720],
  techTier: [2, 2, 3],
  kitKey: (_i, s) => `wpn.tractor.${s}`,
  notes: "Force is applied to both bodies; target mass limit is for full control.",
};
const salvageSpec: KindSpec = {
  kind: "salvage-arm",
  name: "Salvage arm",
  family: "utility",
  sizes: MDLG,
  sockets: ["face", "top"],
  envelope: (_i, s) => outward(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s] * 1.8, SHIP_SIZE_CELLS[s]),
  clearance: (i) => ({ kind: "sweep", lengthM: [10, 18][i], arcDeg: 120 }),
  massKg: [600, 1400],
  hp: [200, 360],
  armor: [4, 6],
  crew: { automation: "manual", station: "engineer", operators: 1 },
  power: { idle: [1, 2], active: [25, 60] },
  heat: { idle: [0, 1], active: [8, 18] },
  data: { demandKbps: [80, 120], slotsUsed: [1, 1] },
  stats: (i) =>
    tool({ kind: "salvage", rangeM: [10, 18][i], forceKn: [4, 10][i], maxTargetMassKg: [2000, 8000][i], rateKgPerS: [2, 5][i], drones: 0 }),
  cost: [6000, 14000],
  buildTimeS: [240, 480],
  techTier: [2, 2],
  kitKey: (_i, s) => `x.salvage-arm.${s}`,
  notes: "Articulated cutter/grabber for wrecks; operator-driven.",
};
const clampSpec: KindSpec = {
  kind: "docking-clamp",
  name: "Docking clamp",
  family: "utility",
  sizes: MDLG,
  sockets: ["top", "face", "bottom"],
  envelope: (_i, s) => topMount(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s], r2(SHIP_SIZE_CELLS[s] * 1.22)),
  massKg: [500, 1200],
  hp: [240, 420],
  armor: [6, 8],
  crew: { automation: "computer", station: "pilot" },
  power: { idle: [0.5, 1], active: [12, 25] },
  heat: { idle: [0, 0], active: [2, 4] },
  data: { demandKbps: [20, 30] },
  stats: (i) => tool({ kind: "clamp", rangeM: [3, 5][i], forceKn: 0, maxTargetMassKg: [80000, 300000][i], rateKgPerS: 0, drones: 0 }),
  cost: [3600, 8600],
  buildTimeS: [150, 300],
  kitKey: (_i, s) => `wpn.clamp.${s}`,
  notes: "Hard-docks a craft or container to the hull.",
};
const miningSpec: KindSpec = {
  kind: "mining-laser",
  name: "Mining laser",
  family: "utility",
  sizes: SML,
  sockets: ["top", "face", "bottom"],
  envelope: (_i, s) => topMount(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s], r2(SHIP_SIZE_CELLS[s] * 0.95), r2(SHIP_SIZE_CELLS[s] * 0.5)),
  clearance: (i) => ({ kind: "beam", lengthM: [120, 200, 300][i], arcDeg: 60 }),
  massKg: [280, 700, 1600],
  hp: [100, 210, 380],
  crew: { automation: "computer", station: "engineer" },
  power: { idle: [1, 3, 6], active: [45, 120, 300] },
  heat: { idle: [0, 1, 2], active: [32, 84, 210] },
  data: { demandKbps: [60, 80, 100], slotsUsed: [1, 1, 1] },
  stats: (i) => tool({ kind: "mining", rangeM: [120, 200, 300][i], forceKn: 0, maxTargetMassKg: 0, rateKgPerS: [0.4, 1.2, 3][i], drones: 0 }),
  cost: [3800, 9000, 21000],
  buildTimeS: [150, 300, 600],
  kitKey: (_i, s) => `x.mining-laser.${s}`,
  notes: "Industrial beam; 70% of draw becomes heat. Yield before refining.",
};
const droneBaySpec: KindSpec = {
  kind: "drone-bay",
  name: "Drone bay",
  family: "utility",
  sizes: MDLG,
  sockets: ["top", "bottom"],
  envelope: (_i, s) => topMount(SHIP_SIZE_CELLS[s], SHIP_SIZE_CELLS[s], r2(SHIP_SIZE_CELLS[s] * 0.72)),
  clearance: (_i, s) => ({ kind: "door-swing", lengthM: SHIP_SIZE_CELLS[s], arcDeg: 0 }),
  massKg: [900, 2000],
  hp: [260, 460],
  armor: [4, 6],
  destroyedEffect: "fire",
  crew: { automation: "manual", station: "sensor", operators: 1 },
  power: { idle: [3, 6], active: [20, 40] },
  heat: { idle: [1, 2], active: [5, 10] },
  data: { demandKbps: [800, 1600], slotsUsed: [2, 4] },
  stats: (i) => tool({ kind: "drone-bay", rangeM: [2000, 3500][i], forceKn: 0, maxTargetMassKg: 0, rateKgPerS: 0, drones: [2, 4][i] }),
  cost: [12000, 26000],
  buildTimeS: [360, 720],
  techTier: [3, 3],
  kitKey: (_i, s) => `x.drone-bay.${s}`,
  notes: "Launch hatch plus drone cradles. Drones and their stats are not modelled yet; each drone uses a control slot.",
};

// ----------------------------------------------------------- structure/edge
const access = (a: NonNullable<ShipComponentDefinition["access"]>) => ({ access: a });
const cargoDoorSpec: KindSpec = {
  kind: "cargo-door",
  name: "Cargo bay door",
  family: "structure",
  sizes: SML,
  sockets: ["edge"],
  idSuffix: (i) => `${[2, 4, 6][i]}m`,
  cells: (i) => [[2, 4, 6][i], 1],
  envelope: (i) => edge([2, 4, 6][i], 0.3125, [2.75, 3.25, 3.25][i]),
  clearance: (i) => ({ kind: "door-swing", lengthM: [1.5, 2, 2.5][i], arcDeg: 0 }),
  massKg: [250, 600, 1100],
  hp: [200, 400, 600],
  armor: [4, 6, 8],
  destroyedEffect: "air-leak",
  power: { idle: [0.2, 0.4, 0.6], active: [4, 9, 15] },
  data: { demandKbps: [5, 5, 5] },
  stats: (i) =>
    access({
      kind: "cargo-door",
      openingWidthM: [2, 4, 6][i],
      openingHeightM: [2.5, 3, 3][i],
      cycleS: [3, 5, 7][i],
      pressureSeal: true,
      throughputM3PerMin: [3, 8, 15][i],
      airLossM3PerCycle: 0,
    }),
  cost: [1500, 3400, 6200],
  buildTimeS: [90, 180, 300],
  kitKey: (i) => `x.cargo-door.${[2, 4, 6][i]}m`,
  notes: "Hull-edge module that is also a pressure boundary. Bays are pumped down before opening, so no air is lost per cycle.",
};
const airlockSpecs: KindSpec[] = [
  {
    kind: "airlock",
    name: "Exterior airlock",
    family: "structure",
    variant: "exterior",
    sizes: ["MD"],
    sockets: ["edge"],
    cells: () => [2, 1],
    envelope: () => edge(2, 1, 2.75),
    clearance: () => ({ kind: "door-swing", lengthM: 1.2, arcDeg: 0 }),
    massKg: [450],
    hp: [300],
    armor: [6],
    destroyedEffect: "air-leak",
    power: { idle: [0.2], active: [6] },
    air: { intakeM3s: [0.2] },
    data: { demandKbps: [10] },
    stats: () =>
      access({ kind: "airlock", openingWidthM: 1.2, openingHeightM: 2.2, cycleS: 12, pressureSeal: true, throughputM3PerMin: 1, airLossM3PerCycle: 0.3 }),
    cost: [3200],
    buildTimeS: [180],
    kitKey: () => "x.airlock-exterior.MD",
    artLibraryDesignId: () => "shipyard.structure.external-airlock",
    notes: "Two-door hull airlock; pumps air back (0.3 m3 lost per cycle).",
  },
  {
    kind: "airlock",
    name: "Interior airlock door",
    family: "structure",
    variant: "interior",
    sizes: ["SM"],
    sockets: ["edge"],
    cells: () => [2, 1],
    envelope: () => edge(2, 0.5, 2.75),
    massKg: [220],
    hp: [200],
    armor: [4],
    power: { idle: [0.1], active: [3] },
    data: { demandKbps: [5] },
    stats: () =>
      access({ kind: "airlock", openingWidthM: 1.2, openingHeightM: 2.2, cycleS: 6, pressureSeal: true, throughputM3PerMin: 1.5, airLossM3PerCycle: 0 }),
    cost: [1200],
    buildTimeS: [90],
    kitKey: () => "x.airlock-interior.SM",
    notes: "Pressure door between compartments on a 2 m module edge.",
  },
];
const hatchSpecs: KindSpec[] = [
  {
    kind: "hatch",
    name: "Deck hatch",
    family: "structure",
    sizes: ["SM"],
    sockets: ["interior"],
    cells: () => [1, 1],
    envelope: () => interior(1, 1, 0.3),
    massKg: [80],
    hp: [150],
    armor: [4],
    power: { idle: [0.05], active: [1] },
    stats: () =>
      access({ kind: "hatch", openingWidthM: 0.9, openingHeightM: 0.9, cycleS: 3, pressureSeal: true, throughputM3PerMin: 0.5, airLossM3PerCycle: 0 }),
    cost: [400],
    buildTimeS: [40],
    kitKey: () => "x.hatch.SM",
    notes: "Floor/roof hatch for the multi-deck shaft rules (launch is single-deck).",
  },
  {
    kind: "hatch",
    name: "Exterior roof hatch",
    family: "structure",
    variant: "exterior",
    sizes: ["SM"],
    sockets: ["top", "bottom"],
    cells: () => [1, 1],
    envelope: () => topMount(1, 1, 0.35),
    massKg: [120],
    hp: [220],
    armor: [6],
    destroyedEffect: "air-leak",
    power: { idle: [0.05], active: [1.5] },
    stats: () =>
      access({ kind: "hatch", openingWidthM: 0.9, openingHeightM: 0.9, cycleS: 4, pressureSeal: true, throughputM3PerMin: 0.4, airLossM3PerCycle: 0.8 }),
    cost: [600],
    buildTimeS: [60],
    kitKey: () => "x.hatch-exterior.SM",
    notes: "Emergency/EVA hatch through the hull roof; loses the trunk volume per cycle.",
  },
];
const dockingPortSpec: KindSpec = {
  kind: "docking-port",
  name: "Docking port",
  family: "structure",
  sizes: MDLG,
  sockets: ["edge", "top"],
  cells: (i) => [[2, 1], [3, 1]][i] as [number, number],
  envelope: (i) => edge([2, 3][i], [1.2, 1.6][i], [2.75, 3.25][i]),
  massKg: [700, 1500],
  hp: [320, 540],
  armor: [6, 8],
  destroyedEffect: "air-leak",
  power: { idle: [0.5, 1], active: [8, 14] },
  data: { demandKbps: [20, 40] },
  extraPorts: (i) => [
    { id: "shore-power", channel: "power", direction: "both", capacity: [100, 300][i] },
    { id: "shore-data", channel: "data", direction: "both", capacity: [1000, 4000][i] },
    { id: "shore-fuel", channel: "fuel", direction: "both", capacity: [2, 6][i] },
    { id: "shore-air", channel: "ventilation", direction: "both", capacity: [0.3, 0.8][i] },
  ],
  stats: (i) =>
    access({
      kind: "docking-port",
      openingWidthM: [1.4, 2.4][i],
      openingHeightM: [2.2, 2.6][i],
      cycleS: [20, 25][i],
      pressureSeal: true,
      throughputM3PerMin: [4, 12][i],
      airLossM3PerCycle: 0,
    }),
  cost: [5200, 11500],
  buildTimeS: [240, 480],
  techTier: [2, 2],
  kitKey: (_i, s) => `x.docking-port.${s}`,
  notes: "Sealed ship-to-station/ship-to-ship collar with shore power, data, fuel and air pass-through (both directions).",
};

// ------------------------------------------------------------------ interior
const lifeSupportSpec: KindSpec = {
  kind: "life-support",
  name: "Life support unit",
  family: "interior",
  sizes: SML,
  sockets: ["interior"],
  cells: (i) => [[1, 1], [2, 1], [2, 2]][i] as [number, number],
  envelope: (i) => interior([0.9, 1.8, 1.8][i], [0.9, 0.9, 1.8][i], [1.8, 2.0, 2.2][i]),
  massKg: [200, 480, 1100],
  hp: [120, 240, 420],
  armor: [2, 3, 4],
  destroyedEffect: "air-leak",
  crew: { automation: "computer", station: "engineer" },
  power: { idle: [3, 8, 18], active: [8, 20, 48] },
  heat: { idle: [1, 3, 6], active: [3, 8, 20] },
  air: { supplyM3s: [0.2, 0.5, 1.2], crewSupported: [4, 10, 24] },
  data: { demandKbps: [10, 10, 20] },
  cost: [3000, 7200, 16500],
  buildTimeS: [120, 240, 480],
  kitKey: (_i, s) => `x.life-support.${s}`,
  notes: "Oxygen generation, CO2 scrubbing and circulation. Crew supported is continuous capacity.",
};
const airFilterSpec: KindSpec = {
  kind: "air-filter",
  name: "Air filter",
  family: "interior",
  sizes: SMMD,
  sockets: ["interior"],
  cells: () => [1, 1],
  envelope: (i) => interior(0.9, 0.9, [1.2, 1.8][i]),
  massKg: [80, 200],
  hp: [60, 120],
  power: { idle: [1, 2], active: [2, 5] },
  heat: { idle: [0, 1], active: [1, 2] },
  air: { supplyM3s: [0.15, 0.4], crewSupported: [3, 8], intakeM3s: [0.15, 0.4] },
  cost: [700, 1700],
  buildTimeS: [40, 80],
  kitKey: (_i, s) => `x.air-filter.${s}`,
  notes: "Extra scrubbing/circulation capacity; does not generate oxygen reserves.",
};
const oxygenSpec: KindSpec = {
  kind: "oxygen-tank",
  name: "Oxygen tank",
  family: "interior",
  sizes: SMMD,
  sockets: ["interior"],
  cells: (i) => [[1, 1], [2, 1]][i] as [number, number],
  envelope: (i) => interior([0.9, 1.8][i], 0.9, [1.6, 1.8][i]),
  massKg: [120, 350],
  hp: [80, 160],
  armor: [3, 4],
  destroyedEffect: "explosion",
  explosionDamage: [80, 200],
  air: { supplyM3s: [0.1, 0.3], reserveCrewHours: [48, 160] },
  cost: [500, 1300],
  buildTimeS: [30, 60],
  kitKey: (_i, s) => `x.oxygen-tank.${s}`,
  notes: "Emergency reserve used when life support is unpowered.",
};
const hydroponicsSpec: KindSpec = {
  kind: "hydroponics",
  name: "Hydroponics rack",
  family: "interior",
  sizes: ["SM"],
  sockets: ["interior"],
  cells: () => [2, 1],
  envelope: () => interior(1.8, 0.9, 1.9),
  massKg: [45],
  hp: [40],
  power: { idle: [0.1], active: [0.2] },
  air: { supplyM3s: [0.02], crewSupported: [1] },
  cost: [900],
  buildTimeS: [60],
  kitKey: () => "x.hydroponics.SM",
  artLibraryDesignId: () => "shipyard.equipment.hydroponics",
  notes: "Supplementary oxygen/food; mass/power follow the art-library review numbers (not approved).",
};
const gravitySpec: KindSpec = {
  kind: "gravity-unit",
  name: "Gravity unit",
  family: "interior",
  sizes: MDLG,
  sockets: ["interior"],
  cells: (i) => [[2, 2], [3, 3]][i] as [number, number],
  envelope: (i) => interior([1.8, 2.8][i], [1.8, 2.8][i], [1.6, 2.0][i]),
  massKg: [800, 1900],
  hp: [200, 360],
  armor: [4, 6],
  crew: { automation: "computer", station: "engineer" },
  power: { idle: [10, 25], active: [30, 80] },
  heat: { idle: [3, 8], active: [12, 32] },
  data: { demandKbps: [20, 30] },
  stats: (i) => ({ gravity: { areaM2: [80, 250][i] } }),
  cost: [9500, 22000],
  buildTimeS: [300, 600],
  techTier: [3, 3],
  kitKey: (_i, s) => `x.gravity.${s}`,
  notes: "Artificial gravity over the listed deck area. Without it crews walk in magnetic boots (gameplay TBD).",
};
const coreSpec: KindSpec = {
  kind: "computer-core",
  name: "Computer core",
  family: "interior",
  sizes: SML,
  sockets: ["interior"],
  cells: (i) => [[1, 1], [1, 1], [2, 1]][i] as [number, number],
  envelope: (i) => interior([0.9, 0.9, 1.8][i], 0.9, [1.2, 1.9, 2.1][i]),
  massKg: [80, 180, 400],
  hp: [80, 160, 280],
  armor: [3, 4, 6],
  destroyedEffect: "fire",
  power: { idle: [0.5, 1.2, 3], active: [0.5, 1.2, 3], peak: [0.6, 1.5, 3.6] },
  heat: { idle: [0.5, 1.2, 3], active: [0.5, 1.2, 3] },
  data: { supplyKbps: [4000, 12000, 32000], controlSlots: [8, 20, 48] },
  cost: [2500, 6500, 15000],
  buildTimeS: [120, 240, 480],
  techTier: [1, 2, 3],
  kitKey: (_i, s) => `x.computer-core.${s}`,
  notes: "IFCS flight computer and fire control. A powered core is required for fly-by-wire (maps to the flight compiler's `computer` kind; SM = the existing 500 W lab computer).",
};
const consoleSpecs: KindSpec[] = (
  [
    ["navigation", "Navigation console", "pilot", "flight", "shipyard.equipment.pilot-seat", 1.5, 40],
    ["command", "Command console", "command", "command", "shipyard.equipment.command-console", 0.35, 60],
    ["fire-control", "Fire-control console", "gunner", "fire-control", null, 0.8, 120],
    ["engineering", "Engineering console", "engineer", "engineering", null, 0.6, 80],
    ["sensor", "Sensor console", "sensor", "sensors", "shipyard.equipment.bridge-bank", 0.6, 150],
  ] as const
).map(([v, name, station, grants, art, kw, kbps]) => ({
  kind: "console",
  name,
  family: "interior" as const,
  variant: v,
  sizes: ["SM"] as Sizes,
  sockets: ["interior"] as const,
  cells: () => [1, 1] as const,
  envelope: () => interior(1, 1, 1.3),
  massKg: [110],
  hp: [60],
  crew: { automation: "manual" as const, station, operators: 1 },
  power: { idle: [r2(kw / 3)], active: [kw] },
  heat: { idle: [0], active: [r2(kw * 0.8)] },
  data: { demandKbps: [kbps] },
  stats: () => ({ control: { grants, seats: 1 } }),
  cost: [1800],
  buildTimeS: [90],
  kitKey: () => `x.console-${v}.SM`,
  artLibraryDesignId: () => art,
  notes:
    grants === "flight"
      ? "Occupied valid control station grants piloting (ownership alone does not)."
      : `Occupied station grants ${grants}; required for manual components of that role.`,
}));
const bunkSpec: KindSpec = {
  kind: "crew-bunk",
  name: "Crew bunk",
  family: "interior",
  sizes: ["SM"],
  sockets: ["interior"],
  cells: () => [2, 1],
  envelope: () => interior(2, 1, 1.6),
  massKg: [145],
  hp: [60],
  crew: { berths: 2 },
  power: { idle: [0.005], active: [0.012] },
  cost: [600],
  buildTimeS: [40],
  kitKey: () => "x.crew-bunk.SM",
  artLibraryDesignId: () => "shipyard.equipment.crew-bunk",
  notes: "Two berths. Mass/power follow the art-library review numbers (not approved).",
};

const SPECS: readonly KindSpec[] = [
  ionSpec("standard"),
  blockSpec,
  ionSpec("salvaged"),
  resonanceSpec,
  rcsSpec,
  vtolSpec,
  warpSpec,
  reactorSpec,
  batterySpec,
  capacitorSpec,
  fuelTankSpec,
  solarSpec,
  auxGenSpec,
  radiatorSpec,
  pumpSpec,
  heatSinkSpec,
  ...weaponKinds.map(weaponSpec),
  magBallisticSpec,
  magMissileSpec,
  magTorpedoSpec,
  shieldGenSpec,
  shieldEmitterSpec,
  ...armorSpecs,
  dishSpec,
  radarSpec,
  scannerSpec,
  beaconSpec,
  tractorSpec,
  salvageSpec,
  clampSpec,
  miningSpec,
  droneBaySpec,
  cargoDoorSpec,
  ...airlockSpecs,
  ...hatchSpecs,
  dockingPortSpec,
  lifeSupportSpec,
  airFilterSpec,
  oxygenSpec,
  hydroponicsSpec,
  gravitySpec,
  coreSpec,
  ...consoleSpecs,
  bunkSpec,
];

/** XL propulsion is rear-only (grammar rule, design doc r006). */
function applyGrammar(c: ShipComponentDefinition): ShipComponentDefinition {
  if (c.family === "propulsion" && c.sizeClass === "XL" && c.mount.sockets.includes("rear"))
    return { ...c, mount: { ...c.mount, sockets: ["rear"], rearOnly: true } };
  return c;
}
/** Plain JSON data (drops undefined fields) so the snapshot compares exactly. */
function clean(c: ShipComponentDefinition): ShipComponentDefinition {
  return JSON.parse(JSON.stringify(c));
}

export function buildShipComponentCatalog(): ShipComponentCatalog {
  const components = SPECS.flatMap(build)
    .map(applyGrammar)
    .map(clean);
  return {
    schema: SHIP_COMPONENT_SCHEMA,
    id: SHIP_COMPONENT_CATALOG_ID,
    revision: SHIP_COMPONENT_CATALOG_REVISION,
    status: "proposed",
    units: {
      mass: "kg",
      power: "kW (storage kWh)",
      heat: "kW (storage MJ)",
      coolant: "L/s",
      fuel: "L/s (capacity L, 0.8 kg/L)",
      data: "kbit/s",
      ventilation: "m3/s",
      ammo: "rounds/s (capacity kg)",
      thrust: "kN",
      distance: "m",
      angle: "deg",
      time: "s",
      cost: "credits (placeholder)",
    },
    frame:
      "Part-local metres: +X starboard, +Y forward, +Z up. External face/rear/edge mounts extend along -Y from the hardpoint centre; top mounts extend +Z; interior items stand on the floor plane. Thrust acts along +Y. glTF export: (x, y, z) -> (x, z, -y).",
    damageStates: [
      { state: "pristine", minHpFraction: 0.75, performance: 1 },
      { state: "scuffed", minHpFraction: 0.5, performance: 1 },
      { state: "damaged", minHpFraction: 0.0001, performance: 0.5 },
      { state: "destroyed", minHpFraction: 0, performance: 0 },
    ],
    ammoTypes: AMMO_TYPES,
    components,
  };
}
