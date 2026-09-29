/**
 * Component catalogues composed from the definition registry (roadmap X-3b, wiki
 * `Systems/Content Definitions`).
 *
 * A prefab ship pins its component catalogue by a string stored in its construction document:
 * - `ship-components-v1@N` (N = 1..4): the code catalogue at revision N, exactly as before.
 * - `ship-components-v1@N+<hash>`: code catalogue N with registry revisions applied (changed or
 *   new components replace or join it; components whose every revision is retired leave it). The
 *   hash is the first 16 hex of the sha256 of the canonical snapshot, so a pin names exactly one
 *   catalogue forever. Snapshots live in `component_catalog_snapshot` and are registered here
 *   before use (server entry points and the client both load them).
 *
 * Registry revision 1 of every component is catalogue revision 4 (the X-3 seed), so while nothing
 * is published the current catalogue is plain `ship-components-v1@4` and nothing changes.
 */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  SHIP_COMPONENT_CATALOG_ID,
  SHIP_COMPONENT_CATALOG_REVISIONS,
  buildShipComponentCatalog,
  type ShipComponentCatalogRevision,
} from "@sidereal/content/ship-components-source";
import {
  validateShipComponentCatalog,
  type ShipComponentCatalog,
  type ShipComponentDefinition,
} from "@sidereal/content/ship-components";
import { prefabCatalogFromShipComponents } from "@sidereal/content/ship-prefab-components";
import { componentVisualUrl } from "@sidereal/content/ship-prefab-catalog";
import type { PrefabComponentCatalog } from "@sidereal/content/ship-prefab";
import { stableStringify } from "./layout-geometry";

const PIN = /^ship-components-v1@([1-9][0-9]{0,3})(?:\+([0-9a-f]{16}))?$/;
export interface ComponentCatalogSnapshot {
  /** Code catalogue revision the snapshot starts from. */
  base: number;
  /** Registry payloads that replace or join base components, sorted by id. */
  components: readonly ShipComponentDefinition[];
  /** Base component ids left out (every registry revision retired), sorted. */
  removed: readonly string[];
}

/** Code catalogue revision a pin is based on (`@4+hash` → 4). Throws on an unknown pin. */
export function catalogBaseRevision(pin: string): number {
  const m = PIN.exec(pin);
  if (!m) throw Error(`Unsupported component catalogue ${pin}`);
  return Number(m[1]);
}
export const isComposedCatalogPin = (pin: string) => !!PIN.exec(pin)?.[2];

export function canonicalSnapshot(s: ComponentCatalogSnapshot): string {
  return stableStringify({
    base: s.base,
    components: [...s.components].sort((a, b) => (a.id < b.id ? -1 : 1)),
    removed: [...s.removed].sort(),
  });
}
export function snapshotPin(s: ComponentCatalogSnapshot) {
  const canonical = canonicalSnapshot(s);
  const hash = bytesToHex(sha256(new TextEncoder().encode(canonical)));
  return {
    pin: `${SHIP_COMPONENT_CATALOG_ID}@${s.base}+${hash.slice(0, 16)}`,
    canonical,
    sha256: hash,
  };
}

/** Full catalogue of a snapshot (validated like the code catalogue). */
export function composeShipComponentCatalog(
  s: ComponentCatalogSnapshot,
  pin: string,
): ShipComponentCatalog {
  if (!(SHIP_COMPONENT_CATALOG_REVISIONS as readonly number[]).includes(s.base))
    throw Error(`Unknown base component catalogue revision ${s.base}`);
  const base = buildShipComponentCatalog(
    s.base as ShipComponentCatalogRevision,
  );
  const replaced = new Map(s.components.map((c) => [c.id, c]));
  const removed = new Set(s.removed);
  const components = [
    ...base.components
      .filter((c) => !removed.has(c.id))
      .map((c) => replaced.get(c.id) ?? c),
    ...s.components.filter((c) => !base.components.some((b) => b.id === c.id)),
  ];
  const catalog: ShipComponentCatalog = {
    ...base,
    // `${id}@${revision}` is the pin: every consumer keys caches and bindings by it.
    revision: s.base,
    components,
  };
  const problems = validateShipComponentCatalog(catalog);
  if (problems.length)
    throw Error(
      `Composed component catalogue ${pin} is invalid: ${problems[0]}`,
    );
  return catalog;
}

const composed = new Map<
  string,
  { ship: ShipComponentCatalog; prefab: PrefabComponentCatalog }
>();

/** Register a stored snapshot (content-addressed: the pin must match its hash). Idempotent. */
export function registerComponentCatalogSnapshot(
  pin: string,
  snapshotJson: string,
) {
  if (composed.has(pin)) return;
  const snapshot = JSON.parse(snapshotJson) as ComponentCatalogSnapshot;
  const expected = snapshotPin(snapshot);
  if (expected.pin !== pin)
    throw Error(
      `Component catalogue snapshot ${pin} does not match its content`,
    );
  const ship = composeShipComponentCatalog(snapshot, pin);
  const prefab = prefabCatalogFromShipComponents(ship, {
    visual: (d) => (d.art.glb ? { url: componentVisualUrl(d.id) } : undefined),
  });
  composed.set(pin, { ship, prefab: { ...prefab, revision: pin } });
}
export const registeredComponentCatalogCount = () => composed.size;

function composedEntry(pin: string) {
  const hit = composed.get(pin);
  if (!hit)
    throw Error(
      `Component catalogue snapshot ${pin} is not loaded (component_catalog_snapshot)`,
    );
  return hit;
}
/** Composed catalogue by pin; undefined for plain code pins. */
export function composedShipComponentCatalog(
  pin: string,
): ShipComponentCatalog | undefined {
  return isComposedCatalogPin(pin) ? composedEntry(pin).ship : undefined;
}
export function composedPrefabComponentCatalog(
  pin: string,
): PrefabComponentCatalog | undefined {
  return isComposedCatalogPin(pin) ? composedEntry(pin).prefab : undefined;
}
