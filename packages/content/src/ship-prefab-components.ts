/**
 * Adapter from the ship component catalog (`sidereal.ship-components.v1`, owned by
 * SHIPS-COMPONENTS in ship-components.ts) to the narrow spec prefab grammar consumes.
 *
 * The input type is a structural subset of `ShipComponentDefinition`, so this module does
 * not restate catalog data or validation; it only reads the fields grammar needs.
 */
import type { MountSizeId } from "./construction-grammar";
import { componentCatalogFrom, type PrefabComponentCatalog, type PrefabComponentSpec } from "./ship-prefab";

type Vec3 = readonly [number, number, number];

export interface ShipComponentLike {
  id: string;
  revision: number;
  status: string;
  name: string;
  family: string;
  kind: string;
  variant: string;
  sizeClass: MountSizeId;
  mount: { sockets: readonly string[]; cells: readonly [number, number]; envelopeM: readonly [Vec3, Vec3] };
  massKg: number;
  crew: { station: string | null; berths: number };
  power: { activeKw: number; generationKw: number };
  heat: { activeKw: number; rejectionKw: number };
  propulsion: { role: string; thrustKn: number } | null;
  control: { grants: string } | null;
  art: { glb: string | null; artLibraryDesignId: string | null };
}

export interface ShipComponentCatalogLike {
  id: string;
  revision: number;
  components: readonly ShipComponentLike[];
}

const TEXELS_PER_M = 16;

/** Runtime URL for a component GLB (published from the component art revision). */
export type ComponentVisualResolver = (c: ShipComponentLike) => { url: string; node?: string } | undefined;

export function prefabSpecFromComponent(c: ShipComponentLike, visual?: ComponentVisualResolver): PrefabComponentSpec {
  const [lo, hi] = c.mount.envelopeM;
  const attach: PrefabComponentSpec["attach"] = [];
  for (const s of c.mount.sockets) if (s === "top" || s === "face" || s === "rear" || s === "edge" || s === "interior") attach.push(s);
  const heightM = hi[2] - lo[2];
  return {
    id: c.id,
    label: /\b(SM|MD|LG|XL)\b/.test(c.name) ? c.name : `${c.name} ${c.sizeClass}`,
    category: c.family === "interior" && c.kind === "console" ? `console.${c.variant}` : c.kind === "cargo-door" ? "cargo-door" : c.family,
    sizeClass: c.sizeClass,
    attach,
    cells: [c.mount.cells[0], c.mount.cells[1]],
    heightTexels: Math.max(1, Math.round(heightM * TEXELS_PER_M)),
    massKg: c.massKg,
    thrustN: c.propulsion && c.propulsion.role === "main" ? c.propulsion.thrustKn * 1000 : undefined,
    maneuverThrustN: c.propulsion && c.propulsion.role === "maneuver" ? c.propulsion.thrustKn * 1000 : undefined,
    powerGenerationW: c.power.generationKw * 1000,
    powerDrawW: c.power.activeKw * 1000,
    heatW: c.heat.activeKw * 1000,
    heatRejectionW: c.heat.rejectionKw * 1000,
    // Only control components (consoles) provide stations; crew.station on other parts names
    // the operator role, not a seat.
    station: c.control ? (c.control.grants === "flight" ? "pilot" : c.crew.station) : null,
    berths: c.crew.berths,
    visual: visual?.(c),
  };
}

/** Future-flagged components stay out of the prefab palette unless explicitly allowed. */
export function prefabCatalogFromShipComponents(
  catalog: ShipComponentCatalogLike,
  options: { visual?: ComponentVisualResolver; includeFuture?: boolean } = {},
): PrefabComponentCatalog {
  const specs = catalog.components
    .filter((c) => options.includeFuture || c.status !== "future")
    .map((c) => prefabSpecFromComponent(c, options.visual));
  return componentCatalogFrom(`${catalog.id}@${catalog.revision}`, specs);
}
