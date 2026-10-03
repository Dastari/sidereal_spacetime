import type {
  ShipPrefabDocumentV1,
  PrefabComponentCatalog,
} from "@sidereal/content/ship-prefab";
import { prefabComponentDefinition } from "@sidereal/sim/prefab-deck-objects";

/** Mirrors damageComponent: undamaged mounts have no damage row. This aggregate
 * describes installed components, never structural hull HP or an owner permission. */
export function shipComponentIntegrity(
  shipId: string,
  owned: boolean,
  prefab:
    { doc: ShipPrefabDocumentV1; catalog: PrefabComponentCatalog } | undefined,
  damage: readonly {
    shipId: string;
    objectId: string;
    componentId: string;
    hp: number;
    maxHp: number;
  }[],
) {
  if (!owned || !prefab) return undefined;
  const byObject = new Map(
    damage.filter((r) => r.shipId === shipId).map((r) => [r.objectId, r]),
  );
  let hp = 0,
    maxHp = 0,
    damaged = 0;
  for (const mount of prefab.doc.mounts) {
    const definition = prefabComponentDefinition(
      mount.component,
      prefab.catalog.revision,
    );
    if (!definition) return undefined;
    const row = byObject.get("mount:" + mount.id);
    if (row && row.componentId !== mount.component) return undefined;
    const maximum = row?.maxHp ?? definition.integrity.hp;
    const current = row?.hp ?? maximum;
    if (
      !Number.isFinite(current) ||
      !Number.isFinite(maximum) ||
      maximum <= 0 ||
      current < 0 ||
      current > maximum
    )
      return undefined;
    hp += current;
    maxHp += maximum;
    if (current < maximum) damaged++;
  }
  return maxHp > 0
    ? { hp, maxHp, damaged, count: prefab.doc.mounts.length }
    : undefined;
}
