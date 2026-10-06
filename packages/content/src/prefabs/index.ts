/**
 * Registered developer ships. Grammar presets are editable Shipyard data; authored
 * gameplay profiles remain exact code-owned trial ships outside the grammar editor.
 */
import type { ShipPrefabDocumentV1 } from "../ship-prefab";
import { AU_CATHEDRAL, AU_CRESCENT, AU_LUMEN } from "./aurelian";
import { FED_BASTION, FED_CREST, FED_MERIDIAN, FED_WREN } from "./federation";
import { CRY_SHARD, IND_MULE } from "./frontier";
import { RJ_JACKAL, RJ_MARAUDER, RJ_MAW } from "./riftjack";
import { WAYFARER_ACCESS_SOURCE } from "../wayfarer-access-profile";
import { FEDERATION_FLEET } from "./federation-fleet";
export {
  FEDERATION_FLEET,
  FEDERATION_FLEET_ACCESS,
  fleetAccessAuthorPoint,
  fleetAccessPhysicalGeometry,
} from "./federation-fleet";

export const PREFAB_SHIPS: readonly ShipPrefabDocumentV1[] = [
  FED_WREN,
  FED_CREST,
  FED_MERIDIAN,
  FED_BASTION,
  RJ_JACKAL,
  RJ_MARAUDER,
  RJ_MAW,
  AU_LUMEN,
  AU_CRESCENT,
  AU_CATHEDRAL,
  IND_MULE,
  CRY_SHARD,
  WAYFARER_ACCESS_SOURCE,
  ...FEDERATION_FLEET,
];

/** Templates expressible and editable with the ordinary Shipyard grammar tools. */
export const EDITABLE_PREFAB_SHIPS = PREFAB_SHIPS.filter(
  (ship) => !ship.authoredGameplay,
);

/** Small ships offered to the owner as starter candidates (one per faction). */
export const STARTER_CANDIDATES: readonly string[] = [
  "fed.s.wren",
  "rj.s.jackal",
  "au.s.lumen",
];

export function prefabById(id: string): ShipPrefabDocumentV1 | undefined {
  return PREFAB_SHIPS.find((p) => p.id === id);
}
