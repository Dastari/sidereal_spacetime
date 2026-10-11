import { WAYFARER_GAMEPLAY_OBJECTS } from "@sidereal/content/wayfarer-authored-gameplay";
import {
  isWayfarerAccessProfile,
  wayfarerAccessObjects,
} from "@sidereal/content/wayfarer-access-profile";
import { isWayfarerHullAccessProfile } from "@sidereal/content/hull-access-profile";
import type { ShipPrefabDocumentV1 } from "@sidereal/content/ship-prefab";

/** Default authored placement, including the profile's shift, before saved user offsets. */
export function furnishingSources(doc?: ShipPrefabDocumentV1) {
  return doc &&
    (isWayfarerAccessProfile(doc) || isWayfarerHullAccessProfile(doc))
    ? wayfarerAccessObjects(WAYFARER_GAMEPLAY_OBJECTS)
    : WAYFARER_GAMEPLAY_OBJECTS;
}
