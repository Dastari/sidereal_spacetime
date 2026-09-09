import proof from "./wayfarer-refit-fuel-proof.json";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import {
  REFIT_FUEL_ATTACHMENT,
  qualifyRefitFuelLayout,
} from "./wayfarer-refit-audit";
/** Explicit provisional gameplay mount for conserved legacy tanks. The80kg/100L
 * limits are existing authority values, not inferred from approved artwork. This
 * mount has no stacking, deformation or automatic fluid-routing capabilities. */
export const PRESERVED_FUEL_MOUNT = Object.freeze({
  definitionId: "preserved-fuel-floor-mount-v1",
  baseSha256: WAYFARER_STARTER.sha256,
  assetId: REFIT_FUEL_ATTACHMENT.assetId,
  assetSha256: REFIT_FUEL_ATTACHMENT.glbSha256,
  footprintM: [1, 1] as const,
  capacityLitres: 100,
  maxMassKg: 80,
  stacking: false as const,
  qualification:
    "native-separation-supported-static-floor-and-conserved-load-limit" as const,
});
let layoutChecked = false;
export function requireQualifiedPreservedFuelMount(input: {
  baseSha256: string;
  assetId: string;
  assetSha256: string;
  x: number;
  y: number;
  z: number;
  capacityLitres: number;
  maxMassKg: number;
}) {
  const d = PRESERVED_FUEL_MOUNT;
  if (
    proof.baseSha256 !== d.baseSha256 ||
    proof.assetSha256 !== d.assetSha256 ||
    !proof.nativeVolumeSeparation ||
    !proof.nominalFloorCoverage ||
    proof.checkedNativeGroups !== 1047 ||
    JSON.stringify(proof.positionM) !== JSON.stringify([-3, 7, 0.1875]) ||
    JSON.stringify(proof.reservationM) !== JSON.stringify([1, 1])
  )
    throw Error("Preserved fuel native certificate mismatch");
  if (!layoutChecked) {
    const q = qualifyRefitFuelLayout();
    if (!q.footprintClear || !q.approachClear)
      throw Error("Preserved fuel floor qualification changed");
    layoutChecked = true;
  }
  if (
    input.baseSha256 !== d.baseSha256 ||
    input.assetId !== d.assetId ||
    input.assetSha256 !== d.assetSha256 ||
    input.x !== -3 ||
    input.y !== 7 ||
    input.z !== 0.1875 ||
    input.capacityLitres !== d.capacityLitres ||
    input.maxMassKg !== d.maxMassKg
  )
    throw Error("Exact preserved fuel floor mount required");
  return d;
}
