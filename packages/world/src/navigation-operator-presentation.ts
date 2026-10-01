/** Unregistered presentation scaffold. Admission and actual visual activation remain separate. */
import { NAVIGATION_OPERATOR_ACTIVATIONS } from "@sidereal/content/navigation-operator-activation.generated";
import type { InventoryDefinition } from "@sidereal/content/inventory";
import { CHARACTER_EQUIPMENT_SLOTS } from "@sidereal/content/character-components";
import {
  acceptedNavigationOperator,
  type AcceptedOperatorTuple,
  type registeredNavigationContext,
} from "@sidereal/sim/navigation-operator-context";
import type { PinnedItemDefinitions } from "./item-definitions";

type Matched = NonNullable<ReturnType<typeof registeredNavigationContext>>;
type EquippedInstance = {
  id: string;
  definitionId: string;
  equipmentSlot: string;
};
export interface PublicOperatorVisual {
  slot: string;
  definitionId: string;
  definitionRevision: string;
  crewItemId: string | null;
  wardrobeId: string | null;
  characterComponentId: string | null;
}
const slots = new Set<string>(["hand", ...CHARACTER_EQUIPMENT_SLOTS]);

/** A key uses the actual pinned public fields, never a current/seed definition or instance UUID. */
export function operatorVisualKey(visual: PublicOperatorVisual) {
  return JSON.stringify([
    visual.slot,
    visual.definitionId,
    visual.definitionRevision,
    visual.crewItemId,
    visual.wardrobeId,
    visual.characterComponentId,
  ]);
}

export function pinnedOperatorVisuals(
  items: Iterable<EquippedInstance>,
  definitions: Pick<PinnedItemDefinitions, "find" | "pin">,
): PublicOperatorVisual[] | null {
  const out: PublicOperatorVisual[] = [];
  const seen = new Set<string>();
  let scanned = 0;
  try {
    for (const item of items) {
      if (++scanned > 512) return null;
      if (!item.equipmentSlot) continue;
      if (!slots.has(item.equipmentSlot) || seen.has(item.equipmentSlot))
        return null;
      seen.add(item.equipmentSlot);
      const definition: InventoryDefinition | undefined =
        definitions.find(item);
      const pin = definitions.pin(item);
      if (
        !definition ||
        definition.id !== item.definitionId ||
        definition.equipSlot !== item.equipmentSlot ||
        pin.itemRevision <= 0n ||
        !(
          definition.crewItemId ||
          definition.wardrobeId ||
          definition.characterComponentId
        )
      )
        return null;
      out.push({
        slot: item.equipmentSlot,
        definitionId: definition.id,
        definitionRevision: pin.itemRevision.toString(),
        crewItemId: definition.crewItemId ?? null,
        wardrobeId: definition.wardrobeId ?? null,
        characterComponentId: definition.characterComponentId ?? null,
      });
    }
    return out.sort((a, b) => a.slot.localeCompare(b.slot));
  } catch {
    return null;
  }
}

/** Pure positive serialization for injected tests/future adapter, with an explicit measured cohort. */
export function operatorSnapshotJson(
  matched: Matched,
  tuple: AcceptedOperatorTuple,
  appearanceJson: string,
  visuals: readonly PublicOperatorVisual[] | null,
  measuredVisualKeys: ReadonlySet<string>,
) {
  const accepted = acceptedNavigationOperator(matched, tuple);
  if (
    !accepted ||
    !visuals ||
    visuals.some((v) => !measuredVisualKeys.has(operatorVisualKey(v)))
  )
    return null;
  let appearance: unknown;
  try {
    appearance = JSON.parse(appearanceJson);
    if (
      !appearance ||
      typeof appearance !== "object" ||
      Array.isArray(appearance)
    )
      return null;
  } catch {
    return null;
  }
  // Explicit fields: private inventory identities and adapter inputs cannot leak by object spread.
  const registration = matched.registration;
  return JSON.stringify({
    version: 1,
    profileId: registration.profileId,
    certificateSha256: registration.certificateSha256,
    proofSha256: registration.proofSha256,
    manifestSha256: registration.manifestSha256,
    compilerSha256: registration.compilerSha256,
    geometrySha256: registration.geometrySha256,
    navigationSha256: registration.navigationSha256,
    characterId: tuple.characterId,
    instanceId: tuple.instanceId,
    deckId: tuple.deckId,
    visitId: tuple.visitId,
    stationId: tuple.stationId,
    seatPlacedObjectId: tuple.seatPlacedObjectId,
    consolePlacedObjectId: tuple.consolePlacedObjectId,
    mountSourceId: matched.context.mountSourceId,
    instanceRevision: tuple.instanceRevision,
    locationRevision: tuple.locationRevision,
    bindingRevision: tuple.bindingRevision,
    mappingRevision: tuple.mappingRevision,
    seatRevision: tuple.seatRevision,
    acceptedX: tuple.acceptedX,
    acceptedY: tuple.acceptedY,
    standingElevationM: tuple.standingElevationM,
    connected: tuple.connected,
    dead: tuple.dead,
    pose: "occupied",
    appearance,
    visuals: visuals.map((v) => ({
      slot: v.slot,
      definitionId: v.definitionId,
      definitionRevision: v.definitionRevision,
      crewItemId: v.crewItemId,
      wardrobeId: v.wardrobeId,
      characterComponentId: v.characterComponentId,
    })),
  });
}

/** No admission/resolver callback is invoked while the production literal registry is EMPTY.
 * Positive world admission is intentionally not wired in this generic scaffold. */
export function currentNavigationOperatorSnapshots() {
  if (NAVIGATION_OPERATOR_ACTIVATIONS.length === 0) return () => undefined;
  return () => undefined;
}
