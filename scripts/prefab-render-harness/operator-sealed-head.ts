/** Six-node scratch proposal only. No production manifest, source table or registration changes. */
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { CREW_HEAD_CATALOG } from "@sidereal/content/crew-heads";
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
  SEALED_HEAD_EYE_LINE_CHEEK_JAW_DIAGNOSTIC_REVISION,
  SEALED_HEAD_MARINE_CROWN_RECEIVER_DIAGNOSTIC_REVISION,
} from "../../packages/render/src/crew/head-palette";
import { verifyCrewSource } from "../../packages/render/src/crew/crew-asset-cache";
import { validateHeadArtBytes } from "../../packages/render/src/crew/head-art-revision";
import type { OperatorEnsembleRequest } from "../../packages/render/src/crew/operator-ensemble";

export const SEALED_DIAGNOSTIC_BASE =
  "/@fs/root/sidereal-worktrees/candidate-pilot-seat-contact/.operator-diagnostic-assets/sealed-r006-tactical/";
export const SEALED_DIAGNOSTIC_MANIFEST_SHA =
  "0a0acf52f11ab0ef583586abb607ae733fc81457e79f15e5aa2dd149d4e6f31d";
export const SEALED_DIAGNOSTIC_GLB_SHA =
  "aa3ef2033c43fd70ecb2ffa8fb4cf60546ed5f71e2750f93537a567373b4ddef";
const proposals = {
  [SEALED_HEAD_DIAGNOSTIC_REVISION]: {
    base: SEALED_DIAGNOSTIC_BASE,
    manifestBytes: 5052,
    manifestSha: SEALED_DIAGNOSTIC_MANIFEST_SHA,
    glbBytes: 682516,
    glbSha: SEALED_DIAGNOSTIC_GLB_SHA,
  },
  [SEALED_HEAD_OUTER_DIAGNOSTIC_REVISION]: {
    base: "/@fs/root/sidereal-worktrees/candidate-pilot-seat-contact/.operator-diagnostic-assets/sealed-r006-tactical-outer-002/",
    manifestBytes: 5258,
    manifestSha:
      "a8a408515e54f15cc7a10659f67a8af1a31167e55f49548238f27f4dd5134bfc",
    glbBytes: 586548,
    glbSha: "f7896e1d00fad244fcfea44816ac57f23da5f9fc1044bed61eef5a615a0a5264",
  },
  [SEALED_HEAD_FACETED_DIAGNOSTIC_REVISION]: {
    base: "/@fs/root/sidereal-worktrees/candidate-pilot-seat-contact/.operator-diagnostic-assets/sealed-r006-tactical-faceted-003/",
    manifestBytes: 5372,
    manifestSha:
      "ebf6f444a486eb36e66a4c7be5f6f275fb200069a9c422897aa1fa3e89ff035d",
    glbBytes: 240332,
    glbSha: "5cddb081f70af22e75b46dcc4bd94759ccb7f5b8cfd0d6615c65d8981147c1fa",
  },
  [SEALED_HEAD_FUNCTIONAL_DIAGNOSTIC_REVISION]: {
    base: "/@fs/root/sidereal-worktrees/candidate-pilot-seat-contact/.operator-diagnostic-assets/sealed-r006-tactical-functional-004/",
    manifestBytes: 5385,
    manifestSha:
      "079a52dc2e7ba190dd09c4e8ed8e3372e7248b85ac38af126bc22559aed598cc",
    glbBytes: 136604,
    glbSha: "72076685af6b2d5412a3374f680d3c8c26be7b63f50febc76d70f52a78bc55e1",
  },
  [SEALED_HEAD_FUNCTIONAL_DETAIL_DIAGNOSTIC_REVISION]: {
    base: "/@fs/root/sidereal-worktrees/candidate-pilot-seat-contact/.operator-diagnostic-assets/sealed-r006-tactical-functional-005-exact/",
    manifestBytes: 5632,
    manifestSha:
      "b99d05f06f5c92e88b68fab040590382720b6fcbc8869f08ba668b33a084b0b9",
    glbBytes: 162232,
    glbSha: "a9ac50faf23853ac4133d503b7171824f91584f23a2e344e8ba77504e2912fda",
  },
  [SEALED_HEAD_FUNCTIONAL_MACHINE_DIAGNOSTIC_REVISION]: {
    base: "/@fs/root/sidereal-worktrees/candidate-pilot-seat-contact/.operator-diagnostic-assets/sealed-r006-tactical-functional-006-machine-exact/",
    manifestBytes: 5894,
    manifestSha:
      "7b41cc6e433b316734db1e28a2a505f29e9b0f1cb2cf3cadbaf9787beaacb0b9",
    glbBytes: 196680,
    glbSha: "654e17f7043a99e458ae24fbfbaa3cb6926055dc25a1f760433d833eeda04c50",
  },
  [SEALED_HEAD_FUNCTIONAL_CLIPPED_DIAGNOSTIC_REVISION]: {
    base: "/@fs/root/sidereal-worktrees/candidate-pilot-seat-contact/.operator-diagnostic-assets/sealed-r006-tactical-functional-007-emissive-bevel/",
    manifestBytes: 6480,
    manifestSha:
      "81e9b84ea9570a5a67ab881d505ed1c17f040c43ce11d86fa781a1a454fb8d0d",
    glbBytes: 166844,
    glbSha: "59b70be678e116bc30eaa6fc0895abd481b60d2107197146685d1c35500acca1",
  },
  [SEALED_HEAD_PRESSURE_CONTOUR_DIAGNOSTIC_REVISION]: {
    base: "/@fs/root/sidereal-worktrees/candidate-pilot-seat-contact/.operator-diagnostic-assets/sealed-r006-tactical-pressure-contour-008-actual-validated/",
    manifestBytes: 2924,
    manifestSha:
      "aef063927a6b0069262b8ab068ee1900b793a9ba5d47b628f2e0ef000a00345c",
    glbBytes: 108128,
    glbSha: "f9f638902e215177a0ad77788621133f4d1e4d5964bb9f32ec835014c77e937d",
  },
  [SEALED_HEAD_WIDE_VISOR_CONTOUR_DIAGNOSTIC_REVISION]: {
    base: "/@fs/root/sidereal-worktrees/candidate-pilot-seat-contact/.operator-diagnostic-assets/sealed-r006-tactical-wide-visor-contour-009-actual-validated/",
    manifestBytes: 2926,
    manifestSha:
      "2f5f1e6676e47c44c3720e27224fe1726ea4007c510aee2da54a620988b7892b",
    glbBytes: 108996,
    glbSha: "2987638a2971438e66a82d01ae86ecaf1cd110d12647372fff3ffa4b30103a19",
  },
  [SEALED_HEAD_CROWN_TEMPLE_CONTOUR_DIAGNOSTIC_REVISION]: {
    base: "/@fs/root/sidereal-worktrees/candidate-pilot-seat-contact/.operator-diagnostic-assets/sealed-r006-tactical-crown-temple-contour-010-finite-cavity/",
    manifestBytes: 6112,
    manifestSha:
      "244433e2041496d4c6a62f52874cc97624c76bcca73915d54286a6b2c7762f96",
    glbBytes: 126548,
    glbSha: "5e380682caf0ae9d9336922b6dea585d02214a443fda53bf8cfb19195a36f5af",
  },
  [SEALED_HEAD_EYE_LINE_CHEEK_JAW_DIAGNOSTIC_REVISION]: {
    base: "/@fs/root/sidereal-worktrees/candidate-pilot-seat-contact/.operator-diagnostic-assets/sealed-r006-tactical-eye-line-cheek-jaw-011-selected-crown-adjacency/",
    manifestBytes: 6600,
    manifestSha:
      "0bf285b7aa9f5aa37f5f214674e66af1168ce949dc6c499abc15676d02c07428",
    glbBytes: 134168,
    glbSha: "689fad55dd23f2db582662d762e5cd3d1eb6f6537890c03def0ade9d534a513a",
  },
  [SEALED_HEAD_MARINE_CROWN_RECEIVER_DIAGNOSTIC_REVISION]: {
    base: "/@fs/root/sidereal-worktrees/candidate-pilot-seat-contact/.operator-diagnostic-assets/sealed-r006-tactical-marine-crown-stepped-receiver-012/",
    manifestBytes: 7015,
    manifestSha:
      "001b15bfc41f3db412af9856ee7960690d5c920aa006053c694fd545f143825c",
    glbBytes: 140572,
    glbSha: "ab63bd042ec909ec826f723b0d07389cd5098eca5903de863e57f3493a00cac1",
  },
};
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
  if (
    selection !== SEALED_HEAD_DIAGNOSTIC_REVISION &&
    selection !== SEALED_HEAD_OUTER_DIAGNOSTIC_REVISION &&
    selection !== SEALED_HEAD_FACETED_DIAGNOSTIC_REVISION &&
    selection !== SEALED_HEAD_FUNCTIONAL_DIAGNOSTIC_REVISION &&
    selection !== SEALED_HEAD_FUNCTIONAL_DETAIL_DIAGNOSTIC_REVISION &&
    selection !== SEALED_HEAD_FUNCTIONAL_MACHINE_DIAGNOSTIC_REVISION &&
    selection !== SEALED_HEAD_FUNCTIONAL_CLIPPED_DIAGNOSTIC_REVISION &&
    selection !== SEALED_HEAD_PRESSURE_CONTOUR_DIAGNOSTIC_REVISION &&
    selection !== SEALED_HEAD_WIDE_VISOR_CONTOUR_DIAGNOSTIC_REVISION &&
    selection !== SEALED_HEAD_CROWN_TEMPLE_CONTOUR_DIAGNOSTIC_REVISION &&
    selection !== SEALED_HEAD_EYE_LINE_CHEEK_JAW_DIAGNOSTIC_REVISION &&
    selection !== SEALED_HEAD_MARINE_CROWN_RECEIVER_DIAGNOSTIC_REVISION
  )
    return request;
  const proposal = proposals[selection];
  if (request.appearance.equippedComponents?.helmet !== "marine-helmet")
    throw new Error(
      "Sealed tactical diagnostic requires the tactical Marine helmet",
    );
  const fetchBytes = async (path: string) => {
    const response = await fetch(proposal.base + path);
    if (!response.ok)
      throw new Error("Sealed tactical diagnostic source unavailable");
    return new Uint8Array(await response.arrayBuffer()).slice();
  };
  const manifestBytes = await fetchBytes("manifest.json");
  if (
    manifestBytes.length !== proposal.manifestBytes ||
    bytesToHex(sha256(manifestBytes)) !== proposal.manifestSha
  )
    throw new Error("Sealed tactical diagnostic manifest mismatch");
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  const pin = manifest.files?.helmets;
  if (
    manifest.schema !== "sidereal.crew-head-seal-diagnostic.v1" ||
    manifest.id !== selection ||
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
    pin.sha256 !== proposal.glbSha ||
    pin.bytes !== proposal.glbBytes ||
    !exact(pin.nodes, nodes)
  )
    throw new Error("Invalid sealed tactical diagnostic descriptor");
  const bytes = validateHeadArtBytes(await fetchBytes(pin.path), pin);
  const source = await verifyCrewSource(bytes, {
    sha256: pin.sha256,
    byteLength: pin.bytes,
    variant: `sidereal.operator-diagnostic:${selection}:helmets`,
  });
  const head = new Map(request.outfitSources.head);
  if (!head.has("helmets"))
    throw new Error("Missing normal helmet source in diagnostic request");
  head.set("helmets", source);
  return {
    ...request,
    appearance: {
      ...request.appearance,
      headArtRevision: selection,
    },
    outfitSources: { ...request.outfitSources, head },
  };
}
