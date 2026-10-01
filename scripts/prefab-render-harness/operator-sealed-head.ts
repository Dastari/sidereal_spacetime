/** Six-node scratch proposal only. No production manifest, source table or registration changes. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { CREW_HEAD_CATALOG } from "@sidereal/content/crew-heads";
import { SEALED_HEAD_DIAGNOSTIC_REVISION } from "../../packages/render/src/crew/head-palette";
import { verifyCrewSource } from "../../packages/render/src/crew/crew-asset-cache";
import { validateHeadArtBytes } from "../../packages/render/src/crew/head-art-revision";
import type { OperatorEnsembleRequest } from "../../packages/render/src/crew/operator-ensemble";

export const SEALED_DIAGNOSTIC_BASE =
  "/@fs/root/sidereal-worktrees/candidate-pilot-seat-contact/.operator-diagnostic-assets/sealed-r006-tactical/";
export const SEALED_DIAGNOSTIC_MANIFEST_SHA =
  "0a0acf52f11ab0ef583586abb607ae733fc81457e79f15e5aa2dd149d4e6f31d";
export const SEALED_DIAGNOSTIC_GLB_SHA =
  "aa3ef2033c43fd70ecb2ffa8fb4cf60546ed5f71e2750f93537a567373b4ddef";
const nodes = [
  "helmet.tactical",
  ...["clear", "tinted", "hud", "mirrored", "ar"].map(
    (v) => `visor.tactical.${v}`,
  ),
];
const exact = (a: unknown, b: readonly string[]) =>
  Array.isArray(a) &&
  a.length === b.length &&
  [...a].sort().join("|") === [...b].sort().join("|");

/** Copy/hash the exact early proposal before private byte attestation and normal ensemble loading. */
export async function applySealedDiagnosticHead(
  request: OperatorEnsembleRequest,
  selection: string,
): Promise<OperatorEnsembleRequest> {
  if (selection !== SEALED_HEAD_DIAGNOSTIC_REVISION) return request;
  if (request.appearance.equippedComponents?.helmet !== "marine-helmet")
    throw new Error(
      "Sealed tactical diagnostic requires the tactical Marine helmet",
    );
  const fetchBytes = async (path: string) => {
    const response = await fetch(SEALED_DIAGNOSTIC_BASE + path);
    if (!response.ok)
      throw new Error("Sealed tactical diagnostic source unavailable");
    return new Uint8Array(await response.arrayBuffer()).slice();
  };
  const manifestBytes = await fetchBytes("manifest.json");
  if (
    manifestBytes.length !== 5052 ||
    bytesToHex(sha256(manifestBytes)) !== SEALED_DIAGNOSTIC_MANIFEST_SHA
  )
    throw new Error("Sealed tactical diagnostic manifest mismatch");
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  const pin = manifest.files?.helmets;
  if (
    manifest.schema !== "sidereal.crew-head-seal-diagnostic.v1" ||
    manifest.id !== SEALED_HEAD_DIAGNOSTIC_REVISION ||
    manifest.status !== "diagnostic-only-not-complete-release" ||
    manifest.catalogRevision !== CREW_HEAD_CATALOG.revision ||
    manifest.headScale !== 0.9 ||
    manifest.voxelMeters !== CREW_HEAD_CATALOG.voxelMeters ||
    JSON.stringify(manifest.space) !==
      JSON.stringify(CREW_HEAD_CATALOG.space) ||
    !exact(manifest.helmets, ["tactical"]) ||
    !exact(manifest.visors, ["clear", "tinted", "hud", "mirrored", "ar"]) ||
    Object.keys(manifest.files).join("|") !== "helmets" ||
    pin?.path !== "helmets.glb" ||
    pin.sha256 !== SEALED_DIAGNOSTIC_GLB_SHA ||
    pin.bytes !== 682516 ||
    !exact(pin.nodes, nodes)
  )
    throw new Error("Invalid sealed tactical diagnostic descriptor");
  const bytes = validateHeadArtBytes(await fetchBytes(pin.path), pin);
  const source = await verifyCrewSource(bytes, {
    sha256: pin.sha256,
    byteLength: pin.bytes,
    variant: `sidereal.operator-diagnostic:${SEALED_HEAD_DIAGNOSTIC_REVISION}:helmets`,
  });
  const head = new Map(request.outfitSources.head);
  if (!head.has("helmets"))
    throw new Error("Missing normal helmet source in diagnostic request");
  head.set("helmets", source);
  return {
    ...request,
    appearance: {
      ...request.appearance,
      headArtRevision: SEALED_HEAD_DIAGNOSTIC_REVISION,
    },
    outfitSources: { ...request.outfitSources, head },
  };
}
