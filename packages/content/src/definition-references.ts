/**
 * Definitions the game creates on its own (starter kits, uniform issue, operator kits). Retiring the
 * last published revision of one of these would make that creation path fail, so the registry
 * refuses it (wiki `Systems/Content Definitions`, retire guard). Authored content; keep in step with
 * `packages/world/src/personal-kit.ts` and `inventory.ts` (a test checks both).
 */
import { CREW_WARDROBE_DEFINITIONS, OPERATOR_ITEM_KITS } from "./inventory";

/** Personal kit of every new character (`issuePersonalKit`). */
export const STARTER_KIT_DEFINITION_IDS = [
  "field-pack",
  "compact-pistol",
  "carbine",
  "scanner",
  "medkit",
  "power-cell",
  "resource-canister",
] as const;
/** Lab starter kit (`claim_starter_kit`): the personal kit plus the supply crate weapons. */
export const LAB_KIT_DEFINITION_IDS = [
  ...STARTER_KIT_DEFINITION_IDS,
  "long-rifle",
  "heavy-handgun",
] as const;

/**
 * Why a definition is protected from losing its last published revision: one reason per creation
 * path that uses it. Weapons share the item's ID, so a kit item protects its weapon too. Empty when
 * nothing creates it automatically.
 */
export function protectedDefinitionUses(
  kind: string,
  definitionId: string,
): string[] {
  if (kind !== "item" && kind !== "weapon") return [];
  const uses: string[] = [];
  if ((STARTER_KIT_DEFINITION_IDS as readonly string[]).includes(definitionId))
    uses.push("the starter kit of every new character");
  else if ((LAB_KIT_DEFINITION_IDS as readonly string[]).includes(definitionId))
    uses.push("the lab starter kit");
  if (CREW_WARDROBE_DEFINITIONS.some((d) => d.id === definitionId))
    uses.push("uniform and armour tier issue");
  for (const [kit, ids] of Object.entries(OPERATOR_ITEM_KITS))
    if (ids.includes(definitionId)) uses.push(`operator kit "${kit}"`);
  return uses;
}
