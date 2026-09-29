/**
 * The one-time seed of the content definition registry (roadmap X-1): today's TypeScript
 * catalogues, written as revision 1 by `operator_import_content_seed`. Items and weapons first;
 * components, loot tables and interactions are seeded by X-3.
 *
 * Every payload is the catalogue entry exactly, so revision 1 reproduces current behaviour. The
 * seed ID is stored as the source of every revision it creates; changing any catalogue entry
 * after the import makes the import report that definition as `diverged` (never overwritten).
 */
import { INVENTORY_DEFINITIONS } from "./inventory";
import { LAB_WEAPONS } from "./weapons";

export const CONTENT_DEFINITION_SEED_ID = "content-seed-v1";
export type SeededDefinitionKind = "item" | "weapon";
export interface ContentDefinitionSeedEntry {
  kind: SeededDefinitionKind;
  definitionId: string;
  payload: Readonly<Record<string, unknown>>;
}
export const CONTENT_DEFINITION_SEED: readonly ContentDefinitionSeedEntry[] = [
  ...INVENTORY_DEFINITIONS.map((d) => ({
    kind: "item" as const,
    definitionId: d.id,
    payload: { ...d },
  })),
  ...Object.entries(LAB_WEAPONS).map(([id, w]) => ({
    kind: "weapon" as const,
    definitionId: id,
    payload: { ...w },
  })),
];
export const SEEDED_DEFINITION_KINDS: readonly SeededDefinitionKind[] = [
  "item",
  "weapon",
];
