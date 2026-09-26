/**
 * Regenerates the checked-in ship component catalog snapshot and the
 * generated tables in docs/ship_components.md from the canonical TypeScript
 * source. Pure file generation: no services, database or publication.
 *
 *   npm run ship-components:export            write files
 *   npm run ship-components:export -- --check fail if files are stale
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildShipComponentCatalog } from "../packages/content/src/ship-components-source";
import {
  validateShipComponentCatalog,
  type ShipComponentDefinition,
} from "../packages/content/src/ship-components";
import { SHIP_COMPONENT_REFERENCE_FITS } from "../packages/content/src/ship-components-reference-fits";
import {
  compileShipSystems,
  shipComponentFlightInput,
} from "../packages/sim/src/ship-systems";
import { compileFlightDefinition } from "../packages/sim/src/flight-definition";

const root = resolve(import.meta.dirname, "..");
const jsonPath = resolve(root, "packages/content/src/ship-components.v1.json");
const docPath = resolve(root, "docs/ship_components.md");
const check = process.argv.includes("--check");

const catalog = buildShipComponentCatalog();
const problems = validateShipComponentCatalog(catalog);
if (problems.length) throw new Error("Invalid catalog:\n" + problems.join("\n"));

const n = (v: number, d = 1) =>
  v === 0 ? "–" : Number.isInteger(v) ? String(v) : v.toFixed(d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
/** One-line summary of the type-specific stats. */
function keyStat(c: ShipComponentDefinition): string {
  if (c.propulsion)
    return c.propulsion.thrustKn > 0
      ? `${n(c.propulsion.thrustKn)} kN ${c.propulsion.role}, Isp ${c.propulsion.specificImpulseS || "n/a"} s, gimbal ${c.propulsion.gimbalDeg}°`
      : `${c.propulsion.role} drive (future)`;
  if (c.weapon) {
    const w = c.weapon;
    const shot = w.projectilesPerShot > 1 ? `${w.projectilesPerShot}×${w.damagePerShot}` : `${w.damagePerShot}`;
    const dps = (w.damagePerShot * w.projectilesPerShot * w.shotsPerMinute) / 60;
    return `${shot} ${w.damageType} × ${n(w.shotsPerMinute, 2)}/min (${n(dps)} dps), ${w.rangeM} m, ${w.ammoType ?? `${w.energyPerShotKj} kJ/shot`}${w.areaRadiusM ? `, r${w.areaRadiusM} m` : ""}`;
  }
  if (c.magazine) return `${c.magazine.capacityKg} kg ${c.magazine.ammoClass} (${c.magazine.ammoTypes.join(", ")})`;
  if (c.shield)
    return c.shield.role === "generator"
      ? `${c.shield.capacityHp} hp, ${c.shield.rechargePerS} hp/s, delay ${c.shield.rechargeDelayS} s`
      : `bubble r${c.shield.radiusM} m`;
  if (c.armor)
    return `${c.armor.hpPerCell} hp/cell, resist K${c.armor.resist.kinetic} T${c.armor.resist.thermal} E${c.armor.resist.explosive} P${c.armor.resist.plasma}`;
  if (c.sensor)
    return c.sensor.kind === "relay"
      ? `comm ${c.sensor.commRangeM / 1000} km`
      : `${c.sensor.rangeM} m, ${c.sensor.arcDeg}°${c.sensor.scanTimeS ? `, scan ${c.sensor.scanTimeS} s` : ""}`;
  if (c.tool) {
    const t = c.tool;
    if (t.kind === "tractor") return `${t.forceKn} kN, ${t.rangeM} m, ≤${t.maxTargetMassKg / 1000} t`;
    if (t.kind === "mining") return `${t.rateKgPerS} kg/s, ${t.rangeM} m`;
    if (t.kind === "salvage") return `${t.rateKgPerS} kg/s cut, reach ${t.rangeM} m`;
    if (t.kind === "clamp") return `holds ≤${t.maxTargetMassKg / 1000} t`;
    return `${t.drones} drones, ${t.rangeM} m control`;
  }
  if (c.access)
    return `${c.access.openingWidthM}×${c.access.openingHeightM} m, cycle ${c.access.cycleS} s, ${c.access.throughputM3PerMin} m³/min${c.access.pressureSeal ? ", seals" : ""}`;
  if (c.control) return `grants ${c.control.grants} (${c.crew.station})`;
  if (c.gravity) return `${c.gravity.areaM2} m² gravity`;
  if (c.power.generationKw) return `generates ${c.power.generationKw} kW`;
  if (c.power.storageKwh) return `${c.power.storageKwh} kWh, discharge ${c.power.maxDischargeKw} kW`;
  if (c.fluids.fuelCapacityL) return `${c.fluids.fuelCapacityL} L fuel`;
  if (c.heat.rejectionKw) return `rejects ${c.heat.rejectionKw} kW`;
  if (c.fluids.coolantSupplyLps) return `pumps ${c.fluids.coolantSupplyLps} L/s (${c.fluids.coolantSupplyLps * 25} kW)`;
  if (c.heat.storageMj) return `buffers ${c.heat.storageMj} MJ`;
  if (c.fluids.crewSupported) return `supports ${c.fluids.crewSupported} crew, ${c.fluids.airSupplyM3s} m³/s`;
  if (c.fluids.reserveCrewHours) return `${c.fluids.reserveCrewHours} crew-hours O₂`;
  if (c.data.supplyKbps) return `${c.data.supplyKbps / 1000} Mbit/s, ${c.data.controlSlots} control slots`;
  if (c.crew.berths) return `${c.crew.berths} berths`;
  return "";
}

function catalogTable(): string {
  const head =
    "| Id | Size | Sockets | Mass kg | HP | Power idle/active/peak kW | Gen kW | Heat kW | Coolant L/s | Fuel L/s | Data kbit/s | Key stats | Cost |\n" +
    "| --- | --- | --- | --: | --: | --: | --: | --: | --: | --: | --: | --- | --: |";
  const sections: string[] = [];
  for (const family of [...new Set(catalog.components.map((c) => c.family))]) {
    const rows = catalog.components
      .filter((c) => c.family === family)
      .map((c) =>
        [
          `\`${c.id}\`${c.status === "future" ? " (future)" : ""}`,
          c.sizeClass,
          c.mount.sockets.join("/") + ` ${c.mount.cells.join("×")}`,
          c.massKg,
          c.integrity.hp,
          c.power.peakKw ? `${n(c.power.idleKw)}/${n(c.power.activeKw)}/${n(c.power.peakKw)}` : "–",
          n(c.power.generationKw || c.power.maxDischargeKw),
          n(c.heat.activeKw),
          n(c.fluids.coolantDemandLps, 2),
          n(c.fluids.fuelActiveLps, 3),
          n(c.data.demandKbps || c.data.supplyKbps),
          keyStat(c),
          c.economy.costCredits,
        ].join(" | "),
      )
      .map((r) => `| ${r} |`);
    sections.push(`#### ${family[0].toUpperCase() + family.slice(1)} (${rows.length})\n\n${head}\n${rows.join("\n")}`);
  }
  return sections.join("\n\n");
}

function balanceTable(): string {
  const rows: string[][] = [];
  const cols = SHIP_COMPONENT_REFERENCE_FITS.map((f) => {
    const input = { catalog, hull: f.hull, components: f.components };
    const r = compileShipSystems(input);
    const flight = compileFlightDefinition(shipComponentFlightInput(input, r));
    return { f, r, flight };
  });
  const add = (label: string, f: (c: (typeof cols)[number]) => string) =>
    rows.push([label, ...cols.map(f)]);
  const s = (v: number | null) => (v === null ? "sustained" : `${Math.round(v)} s`);
  add("Status (issues)", ({ r }) => `${r.status} (${r.issues.map((i) => i.code).join(", ") || "none"})`);
  add("Hull / components / fuel / ammo t", ({ r }) => `${r.mass.hullKg / 1000} / ${(r.mass.componentsKg / 1000).toFixed(1)} / ${(r.mass.fuelKg / 1000).toFixed(1)} / ${(r.mass.ammoKg / 1000).toFixed(1)}`);
  add("Total mass t", ({ r }) => (r.mass.totalKg / 1000).toFixed(1));
  add("Thrust fwd / rev / lat kN", ({ r }) => `${r.propulsion.forwardKn} / ${r.propulsion.reverseKn} / ${r.propulsion.starboardKn}`);
  add("Accel fwd / rev / lat m/s² (flight envelope)", ({ flight }) =>
    flight.status === "ready"
      ? `${flight.envelope.forward.toFixed(2)} / ${flight.envelope.reverse.toFixed(2)} / ${flight.envelope.left.toFixed(2)}`
      : "rejected",
  );
  add("Yaw accel rad/s²", ({ flight }) => (flight.status === "ready" ? flight.envelope.angularPositive.toFixed(3) : "–"));
  add("Generation kW / battery kWh", ({ r }) => `${r.power.generationKw} / ${r.power.storageKwh}`);
  for (const m of ["cruise", "combat", "peak"] as const)
    add(`Power ${m}: demand kW (balance)`, ({ r }) => `${r.power.modes[m].demandKw} (${r.power.modes[m].balanceKw >= 0 ? "+" : ""}${r.power.modes[m].balanceKw}${r.power.modes[m].batteryEnduranceS !== null ? `, battery ${r.power.modes[m].batteryEnduranceS} s` : ""})`);
  add("Heat rejection kW (radiators, pump-limited + hull)", ({ r }) => `${r.heat.pumpLimitedKw} + ${r.heat.passiveKw}`);
  for (const m of ["cruise", "combat", "peak"] as const)
    add(`Heat ${m}: generated kW → time`, ({ r }) => `${r.heat.modes[m].generatedKw} → ${s(r.heat.modes[m].timeToOverheatS)}`);
  add("Coolant supply / demand L/s", ({ r }) => `${r.coolant.supplyLps} / ${r.coolant.demandLps}`);
  add("Fuel L; cruise burn L/s → endurance", ({ r }) => `${r.fuel.capacityL}; ${r.fuel.modes.cruise.burnLps} → ${Math.round((r.fuel.modes.cruise.enduranceS ?? 0) / 60)} min`);
  add("Data kbit/s used/available; control slots", ({ r }) => `${r.data.demandKbps}/${r.data.supplyKbps}; ${r.data.controlSlotsUsed}/${r.data.controlSlots}`);
  add("Crew min / berths / life support", ({ r }) => `${r.crew.minimumCrew} / ${r.crew.berths} / ${r.crew.lifeSupportCrew}`);
  add("Weapons: alpha / sustained dps / max range", ({ r }) => `${r.weapons.alphaDamage} / ${r.weapons.sustainedDps} / ${r.weapons.maxRangeM} m`);
  add("Ammo sustain (continuous fire)", ({ r }) => r.weapons.ammo.map((a) => `${a.type} ${s(a.sustainS)}`).join(", ") || "–");
  add("Shield hp / recharge / radius", ({ r }) => `${r.defense.shieldHp} / ${r.defense.shieldRechargePerS} hp/s / ${r.defense.shieldRadiusM} m`);
  add("Sensors max range", ({ r }) => `${r.sensors.maxRangeM} m${r.sensors.radar360 ? " (360° radar)" : ""}`);
  add("Cost / build time (placeholders)", ({ r }) => `${r.economy.costCredits} cr / ${Math.round(r.economy.buildTimeS / 60)} min`);
  const header = `| Measure | ${cols.map((c) => c.f.name).join(" | ")} |\n| --- | ${cols.map(() => "---").join(" | ")} |`;
  return header + "\n" + rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
}

/** Indented JSON that keeps short arrays/objects on one line (stable, diffable). */
function stringify(v: unknown, indent = ""): string {
  const flat = JSON.stringify(v);
  if (v === null || typeof v !== "object" || flat.length + indent.length <= 110) return flat;
  const next = indent + "  ";
  if (Array.isArray(v)) return `[\n${v.map((x) => next + stringify(x, next)).join(",\n")}\n${indent}]`;
  return `{\n${Object.entries(v as Record<string, unknown>)
    .map(([k, x]) => `${next}${JSON.stringify(k)}: ${stringify(x, next)}`)
    .join(",\n")}\n${indent}}`;
}
const json = stringify(catalog) + "\n";
const counts = Object.entries(
  catalog.components.reduce<Record<string, number>>((m, c) => ((m[c.family] = (m[c.family] ?? 0) + 1), m), {}),
)
  .map(([k, v]) => `${k} ${v}`)
  .join(", ");
const generated =
  `Generated by \`npm run ship-components:export\` from catalog revision ${catalog.revision}: ` +
  `${catalog.components.length} components (${counts}).\n\n` +
  `### Balance sheets (reference fits, bus mode)\n\n${balanceTable()}\n\n### Component tables\n\n${catalogTable()}\n`;
const begin = "<!-- ship-components:generated:begin -->",
  end = "<!-- ship-components:generated:end -->";
const doc = readFileSync(docPath, "utf8");
const a = doc.indexOf(begin),
  b = doc.indexOf(end);
if (a < 0 || b < a) throw new Error("docs/ship_components.md is missing generated markers");
const nextDoc = doc.slice(0, a + begin.length) + "\n" + generated + doc.slice(b);
const stale: string[] = [];
const current = (() => {
  try {
    return readFileSync(jsonPath, "utf8");
  } catch {
    return "";
  }
})();
if (current !== json) stale.push(jsonPath);
if (doc !== nextDoc) stale.push(docPath);
if (check) {
  if (stale.length) {
    console.error("Stale generated files:\n" + stale.join("\n") + "\nRun npm run ship-components:export");
    process.exit(1);
  }
  console.log(`Ship component catalog up to date (${catalog.components.length} components).`);
} else {
  writeFileSync(jsonPath, json);
  writeFileSync(docPath, nextDoc);
  console.log(`Wrote ${catalog.components.length} components; updated ${stale.length} file(s).`);
}
