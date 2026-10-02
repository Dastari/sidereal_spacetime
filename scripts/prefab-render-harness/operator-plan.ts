/** Explicit diagnostic selection only; production operator registration and source policy stay unchanged. */
import type { CrewAppearance } from "../../packages/render/src/crew/appearance";
import {
  currentOperatorEnsemblePlan,
  type OperatorEnsemblePlan,
  type OperatorEnsembleRequest,
} from "../../packages/render/src/crew/operator-ensemble";
import {
  HEAD_ART_CANDIDATE,
  HEAD_ART_MANIFEST_SHA256,
  validateHeadArtManifest,
  validateHeadArtBytes,
  type HeadArtManifest,
} from "../../packages/render/src/crew/head-art-revision";
import { verifiedCrewSourceBytes } from "../../packages/render/src/crew/crew-asset-cache";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import {
  SEALED_HEAD_DIAGNOSTIC_REVISION,
  SEALED_HEAD_OUTER_DIAGNOSTIC_REVISION,
  SEALED_HEAD_FACETED_DIAGNOSTIC_REVISION,
  SEALED_HEAD_FUNCTIONAL_DIAGNOSTIC_REVISION,
  SEALED_HEAD_FUNCTIONAL_DETAIL_DIAGNOSTIC_REVISION,
  SEALED_HEAD_FUNCTIONAL_MACHINE_DIAGNOSTIC_REVISION,
  SEALED_HEAD_FUNCTIONAL_CLIPPED_DIAGNOSTIC_REVISION,
  SEALED_HEAD_PRESSURE_CONTOUR_DIAGNOSTIC_REVISION,
  SEALED_HEAD_WIDE_VISOR_CONTOUR_DIAGNOSTIC_REVISION,
  SEALED_HEAD_CROWN_TEMPLE_CONTOUR_DIAGNOSTIC_REVISION,
} from "../../packages/render/src/crew/head-palette";

export function diagnosticOperatorAppearance(
  bodyType: "male" | "female",
  tier: "security" | "marine",
  partial: boolean,
): CrewAppearance {
  return {
    bodyType,
    outfit: tier,
    equippedComponents: {
      chest: `${tier}-chest`,
      shoulders: `${tier}-shoulders`,
      gloves: `${tier}-gloves`,
      boots: `${tier}-boots`,
      back: `${tier}-back`,
      belt: `${tier}-belt`,
      helmet: tier === "security" ? "pilot-helmet" : "marine-helmet",
      visor: tier === "security" ? "pilot-visor" : "marine-visor",
      // Existing authored inventory wardrobe, explicitly disclosed for both armor sets.
      ...(!partial
        ? { legs: `${tier}-legs`, uniform: "wardrobe-uniform-security" }
        : {}),
    },
    weapon: "none",
    weaponFixture: false,
  };
}

export async function diagnosticOperatorPlan(
  appearance: CrewAppearance,
  heldItem: string | null,
  headSelection: string,
): Promise<{ plan: OperatorEnsemblePlan; manifest?: HeadArtManifest }> {
  const plan = currentOperatorEnsemblePlan(
    { appearance, heldItem },
    "isolated-not-admitted",
    "isolated-current-request",
  );
  if (
    headSelection === "legacy" ||
    headSelection === SEALED_HEAD_DIAGNOSTIC_REVISION ||
    headSelection === SEALED_HEAD_OUTER_DIAGNOSTIC_REVISION ||
    headSelection === SEALED_HEAD_FACETED_DIAGNOSTIC_REVISION ||
    headSelection === SEALED_HEAD_FUNCTIONAL_DIAGNOSTIC_REVISION ||
    headSelection === SEALED_HEAD_FUNCTIONAL_DETAIL_DIAGNOSTIC_REVISION ||
    headSelection === SEALED_HEAD_FUNCTIONAL_MACHINE_DIAGNOSTIC_REVISION ||
    headSelection === SEALED_HEAD_FUNCTIONAL_CLIPPED_DIAGNOSTIC_REVISION ||
    headSelection === SEALED_HEAD_PRESSURE_CONTOUR_DIAGNOSTIC_REVISION ||
    headSelection === SEALED_HEAD_WIDE_VISOR_CONTOUR_DIAGNOSTIC_REVISION ||
    headSelection === SEALED_HEAD_CROWN_TEMPLE_CONTOUR_DIAGNOSTIC_REVISION
  )
    return { plan };
  if (headSelection !== HEAD_ART_CANDIDATE)
    throw new Error("Unknown isolated head selection");
  const base = `/assets/crew/heads/${HEAD_ART_CANDIDATE}/`;
  const response = await fetch(base + "manifest.json");
  if (!response.ok) throw new Error("Isolated head manifest unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer()).slice();
  if (bytesToHex(sha256(bytes)) !== HEAD_ART_MANIFEST_SHA256)
    throw new Error("Isolated head manifest mismatch");
  const manifest = validateHeadArtManifest(
    JSON.parse(new TextDecoder().decode(bytes)),
  );
  const head = new Map(plan.outfitSources.head);
  for (const key of head.keys()) {
    const pin = manifest.files[key];
    if (!pin) continue; // This manifest deliberately retains legacy head/face resources.
    head.set(key, {
      url: base + pin.path,
      sha256: pin.sha256,
      byteLength: pin.bytes,
      variant: `sidereal.operator-diagnostic:${HEAD_ART_CANDIDATE}:${key}`,
    });
  }
  return {
    manifest,
    plan: {
      ...plan,
      appearance: { ...plan.appearance, headArtRevision: HEAD_ART_CANDIDATE },
      outfitSources: { ...plan.outfitSources, head },
    },
  };
}

/** Inspect the exact privately attested bytes the normal ensemble will pass to Babylon. */
export function validateDiagnosticHeadSources(
  request: Pick<OperatorEnsembleRequest, "outfitSources">,
  manifest: HeadArtManifest | undefined,
): void {
  if (!manifest) return;
  for (const [key, source] of request.outfitSources.head) {
    const pin = manifest.files[key];
    if (pin) validateHeadArtBytes(verifiedCrewSourceBytes(source), pin);
  }
}
