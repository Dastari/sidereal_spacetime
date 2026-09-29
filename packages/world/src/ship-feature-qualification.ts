/**
 * Ship features that only the retired Wayfarer was qualified for (owner:
 * "Retire Wayfarer.", 2026-09-29): passenger admission, device power circuits,
 * and flight-fitting removal/detach.
 *
 * No current ship qualifies these, so they fail closed with the reducers'
 * existing errors. Prefab ships need their own qualification (authority rules
 * plus tests) before a feature is enabled here for trusted prefab blueprints.
 */
export type QualifiedShipFeature =
  "passengers" | "device-power" | "fitting-disposition";

export function shipFeatureQualified(
  _feature: QualifiedShipFeature,
  _blueprintSha256: string,
): boolean {
  return false;
}
