/**
 * Pinned item and weapon definitions (roadmap X-2, wiki `Systems/Content Definitions`).
 *
 * Every item instance pins an item revision and, when it is a weapon, a weapon revision. The
 * server, the game client and the tests resolve `kind:id@revision` through the same rule:
 *
 * - a published or retired registry revision (`content_definition`) is used when it exists;
 * - revision 1 falls back to the code catalogue, which is the seed (`content-seed-v1`), so a
 *   database without the seed import behaves exactly like the catalogue;
 * - an instance with no explicit pin (created before X-2) pins item revision 1, and weapon
 *   revision 1 only when the code catalogue has a weapon for it.
 *
 * New instances pin the definition's current revision (newest published, not retired).
 * Existing instances keep their pin until an operator resync moves them.
 */
import {
  INVENTORY_DEFINITIONS,
  type InventoryDefinition,
} from "@sidereal/content/inventory";
import { LAB_WEAPONS, type WeaponDefinition } from "@sidereal/content/weapons";

export interface PinnedRevision {
  payloadJson: string;
  sha256: string;
}
/** Read access to the registry (server tables or the client's published view). */
export interface DefinitionRegistryReader {
  revision(ref: string): PinnedRevision | undefined;
  /** Newest published, not retired revision; undefined when the registry has no such definition. */
  currentRevision?(
    kind: "item" | "weapon",
    definitionId: string,
  ): bigint | undefined;
}
export interface ItemPin {
  itemRevision: bigint;
  /** 0 = the instance has no weapon rules. */
  weaponRevision: bigint;
}
const CODE_ITEMS = new Map(INVENTORY_DEFINITIONS.map((d) => [d.id, d]));
const parsed = new Map<string, unknown>();
function parse<T>(ref: string, row: PinnedRevision): T {
  const key = ref + "#" + row.sha256;
  let value = parsed.get(key);
  if (value === undefined) {
    if (parsed.size > 4096) parsed.clear();
    value = Object.freeze(JSON.parse(row.payloadJson));
    parsed.set(key, value);
  }
  return value as T;
}
export const itemRef = (definitionId: string, revision: bigint) =>
  `item:${definitionId}@${revision}`;
export const weaponRef = (definitionId: string, revision: bigint) =>
  `weapon:${definitionId}@${revision}`;

/** The pin of an instance created before X-2 (no explicit pin row). */
export function implicitPin(definitionId: string): ItemPin {
  return {
    itemRevision: 1n,
    weaponRevision: LAB_WEAPONS[definitionId] ? 1n : 0n,
  };
}
export function resolveItemDefinition(
  reader: DefinitionRegistryReader,
  definitionId: string,
  revision: bigint,
): InventoryDefinition | undefined {
  const ref = itemRef(definitionId, revision);
  const row = reader.revision(ref);
  if (row) return parse<InventoryDefinition>(ref, row);
  return revision === 1n ? CODE_ITEMS.get(definitionId) : undefined;
}
export function resolveWeaponDefinition(
  reader: DefinitionRegistryReader,
  definitionId: string,
  revision: bigint,
): WeaponDefinition | undefined {
  if (revision === 0n) return undefined;
  const ref = weaponRef(definitionId, revision);
  const row = reader.revision(ref);
  if (row) return parse<WeaponDefinition>(ref, row);
  return revision === 1n ? LAB_WEAPONS[definitionId] : undefined;
}

/**
 * The pin a newly created instance takes: each kind's current revision. A definition the registry
 * has never seen uses the code catalogue (revision 1). A definition whose every revision is
 * retired cannot be instantiated.
 */
export function newInstancePin(
  reader: DefinitionRegistryReader,
  definitionId: string,
): ItemPin {
  const current = (kind: "item" | "weapon") =>
    reader.currentRevision?.(kind, definitionId);
  const item = current("item");
  if (item === 0n)
    throw Error(`item:${definitionId} has no published revision (all retired)`);
  const itemRevision = item ?? 1n;
  if (!resolveItemDefinition(reader, definitionId, itemRevision))
    throw Error(`Unknown item definition ${definitionId}`);
  const weapon = current("weapon");
  if (weapon === 0n)
    throw Error(
      `weapon:${definitionId} has no published revision (all retired)`,
    );
  const weaponRevision = weapon ?? (LAB_WEAPONS[definitionId] ? 1n : 0n);
  return { itemRevision, weaponRevision };
}

/** A published-rows reader (the client's `published_item_definitions` view, tests). */
export function registryFromRows(
  rows: Iterable<{
    definitionRef: string;
    kind: string;
    definitionId: string;
    revision: bigint;
    status: string;
    payloadJson: string;
    sha256: string;
  }>,
): DefinitionRegistryReader {
  const byRef = new Map<string, PinnedRevision>(),
    current = new Map<string, bigint>(),
    known = new Set<string>();
  for (const r of rows) {
    byRef.set(r.definitionRef, r);
    const key = `${r.kind}:${r.definitionId}`;
    known.add(key);
    if (r.status === "published" && r.revision > (current.get(key) ?? 0n))
      current.set(key, r.revision);
  }
  return {
    revision: (ref) => byRef.get(ref),
    currentRevision: (kind, id) =>
      known.has(`${kind}:${id}`)
        ? (current.get(`${kind}:${id}`) ?? 0n)
        : undefined,
  };
}
