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
import { buildShipComponentCatalog } from "./ship-components-source";

export const CONTENT_DEFINITION_SEED_ID = "content-seed-v1";
export type SeededDefinitionKind =
  "item" | "weapon" | "component" | "interaction";
/** Catalogue revision the component seed (registry revision 1) is taken from. */
export const COMPONENT_SEED_CATALOG_REVISION = 4 as const;
/**
 * The interaction kinds the game has today (`LAB_INTERACTIONS`), described by the rules that
 * govern them in `sim/interactions.ts` and `world/interactions.ts`: 1.8 m reach, cabin line of
 * sight, an authored approach point, anyone aboard the ship, seats hold one character.
 */
export const INTERACTION_SEED: Readonly<
  Record<string, Record<string, unknown>>
> = {
  seat: {
    name: "Seat",
    verbs: [
      { id: "sit", label: "Sit" },
      { id: "stand", label: "Stand" },
    ],
    reachM: 1.8,
    lineOfSight: true,
    approachPoint: true,
    requiredTool: null,
    permission: "aboard",
    occupancy: 1,
  },
  light: {
    name: "Light",
    verbs: [
      { id: "set-light-on", label: "Turn on" },
      { id: "set-light-off", label: "Turn off" },
    ],
    reachM: 1.8,
    lineOfSight: true,
    approachPoint: true,
    requiredTool: null,
    permission: "aboard",
    occupancy: 0,
  },
};
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
  ...buildShipComponentCatalog(COMPONENT_SEED_CATALOG_REVISION).components.map(
    (c) => ({
      kind: "component" as const,
      definitionId: c.id,
      payload: JSON.parse(JSON.stringify(c)) as Record<string, unknown>,
    }),
  ),
  ...Object.entries(INTERACTION_SEED).map(([id, payload]) => ({
    kind: "interaction" as const,
    definitionId: id,
    payload,
  })),
];
export const SEEDED_DEFINITION_KINDS: readonly SeededDefinitionKind[] = [
  "item",
  "weapon",
  "component",
  "interaction",
];
