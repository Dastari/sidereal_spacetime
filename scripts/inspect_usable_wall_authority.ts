/** Offline compilation/source-gate evidence. No database, catalog or runtime writes. */
import { readFileSync, writeFileSync } from "node:fs";
import { WAYFARER_STARTER } from "@sidereal/content/wayfarer-starter";
import { compileConstruction } from "@sidereal/sim/construction-transactions";
import { qualifiedWayfarerWalkingBindings } from "../packages/sim/src/wayfarer-walking-bindings";

const mappingPath =
  "assets/art-library/designs/shipyard.structure.usable-boundary-wall/revisions/r000/a009/combined-replacement-mapping.json";
const mapping = JSON.parse(readFileSync(mappingPath, "utf8")) as {
  bindings: {
    sourcePlacedId: string;
    originalPlacement: { assetId: string };
    candidateNativeVisual: { sha256: string };
  }[];
};
const before = compileConstruction(WAYFARER_STARTER.documentJson);
const document = JSON.parse(before.canonical);
const replacements = new Map(
  mapping.bindings.map((b) => [b.sourcePlacedId, b]),
);
let changed = 0;
for (const part of document.layout.assembly.parts) {
  const replacement = replacements.get(part.id);
  if (!replacement) continue;
  if (part.assetId !== replacement.originalPlacement.assetId)
    throw Error("Original source placement asset differs");
  // Deterministic proposed asset IDs only, not published catalog definitions.
  part.assetId =
    "part-usablewall-" + replacement.candidateNativeVisual.sha256.slice(0, 20);
  document.layout.assembly.revisions[part.assetId] =
    replacement.candidateNativeVisual.sha256;
  changed++;
}
if (changed !== 50) throw Error("Expected exact50-source delta");
const retainedAssets = new Set(
  document.layout.assembly.parts.map(
    (part: { assetId: string }) => part.assetId,
  ),
);
for (const id of Object.keys(document.layout.assembly.revisions))
  if (!retainedAssets.has(id)) delete document.layout.assembly.revisions[id];
const after = compileConstruction(JSON.stringify(document));
const baselineBindings = qualifiedWayfarerWalkingBindings(before, 0.3, 1.8);
let rejected = "";
try {
  qualifiedWayfarerWalkingBindings(after, 0.3, 1.8);
} catch (error) {
  rejected = String(error);
}
if (!rejected.includes("exact canonical source required"))
  throw Error("Changed template reused unqualified old walking authority");
const result = {
  schema: "sidereal.usable-wall-authority-gate-inspection.v1",
  baselineSha256: before.sha256,
  proposedAssetIdOnlyDocumentSha256: after.sha256,
  currentQualifiedWalkingBindings: baselineBindings.length,
  replacedSourceIds: [...replacements.keys()],
  currentWalkingProofRejection: rejected,
  canonicalCompilation:
    "passes schema; compilation alone does not qualify native collider/support/materials",
  scope:
    "Offline proposed IDs only. No catalog, blueprint, collision binding or live instance installed.",
};
writeFileSync(
  ".runtime/usable-wall-authority-gates.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
