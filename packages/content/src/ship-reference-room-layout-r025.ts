/** Private art candidate only; never registered in the default prefab list. */
import { FED_CREST } from "./prefabs/federation";
import {
  canonicalShipPrefabJson,
  readShipPrefab,
  type ShipPrefabDocumentV1,
} from "./ship-prefab";

export const REFERENCE_ROOM_LAYOUT_R025 = "reference-r025" as const;

export function referenceRoomLayoutR025(
  base: ShipPrefabDocumentV1,
): ShipPrefabDocumentV1 {
  if (
    base.id !== "fed.m.crest" ||
    base.revision !== 4 ||
    base.sizeClass !== "M" ||
    base.faction !== "Federation" ||
    base.theme !== "federation" ||
    canonicalShipPrefabJson(base) !== canonicalShipPrefabJson(FED_CREST)
  )
    throw Error(
      "Reference room layout requires the exact original Crest revision 4",
    );
  const original = structuredClone(base);
  const candidate = readShipPrefab({
    ...original,
    revision: 5,
    fixtures: [
      ...(original.fixtures ?? []),
      {
        id: "reference-lounge-table",
        design: "pale-studless.table.standard",
        at: [12.85, 7.0],
        facing: "port",
      },
      {
        id: "reference-workshop-bank",
        design: "shipyard.equipment.workshop-bank-r025",
        at: [9.35, 0.3],
        facing: "starboard",
      },
      {
        id: "reference-medical-equipment",
        design: "shipyard.equipment.medical-equipment-bank-r025",
        at: [6.35, 0.3],
        facing: "port",
      },
    ],
  });
  const restored = structuredClone(candidate);
  restored.revision = base.revision;
  if (base.fixtures === undefined) delete restored.fixtures;
  else restored.fixtures = restored.fixtures!.slice(0, base.fixtures.length);
  if (canonicalShipPrefabJson(restored) !== canonicalShipPrefabJson(base))
    throw Error("Reference room layout changed an original document field");
  return candidate;
}
