/**
 * Developer prefab ships (grammar documents). Each is ordinary Shipyard data: it can be
 * opened, edited, validated and published from the dashboard Shipyard.
 */
import type { ShipPrefabDocumentV1 } from "../ship-prefab";
import { AU_CATHEDRAL, AU_CRESCENT, AU_LUMEN } from "./aurelian";
import { FED_BASTION, FED_CREST, FED_WREN } from "./federation";
import { CRY_SHARD, IND_MULE } from "./frontier";
import { RJ_JACKAL, RJ_MARAUDER, RJ_MAW } from "./riftjack";

export const PREFAB_SHIPS: readonly ShipPrefabDocumentV1[] = [
  FED_WREN,
  FED_CREST,
  FED_BASTION,
  RJ_JACKAL,
  RJ_MARAUDER,
  RJ_MAW,
  AU_LUMEN,
  AU_CRESCENT,
  AU_CATHEDRAL,
  IND_MULE,
  CRY_SHARD,
];

/** Small ships offered to the owner as starter candidates (one per faction). */
export const STARTER_CANDIDATES: readonly string[] = ["fed.s.wren", "rj.s.jackal", "au.s.lumen"];

export function prefabById(id: string): ShipPrefabDocumentV1 | undefined {
  return PREFAB_SHIPS.find((p) => p.id === id);
}
