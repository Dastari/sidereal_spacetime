import { readFileSync, writeFileSync } from "node:fs";
import type { PartCatalog } from "@sidereal/content/assembly";
import { createQualifiedWayfarerExterior } from "../../packages/sim/src/wayfarer-exterior-qualification";
import { compileConstruction } from "../../packages/sim/src/construction-transactions";
import { planConstructionInstance } from "../../packages/sim/src/construction-instance";
import { qualifiedWayfarerWalkingBindings } from "../../packages/sim/src/wayfarer-walking-bindings";
const catalog = JSON.parse(
  readFileSync("assets/runtime/assembly/catalog-shipyard-r005.json", "utf8"),
) as PartCatalog;
const candidate = createQualifiedWayfarerExterior(catalog);
const snapshot = compileConstruction(candidate.canonical);
let sequence = 1;
const plan = planConstructionInstance(
  snapshot,
  {
    blueprintRevisionId: "framed-wayfarer-visual-review",
    expectedBlueprintSha256: snapshot.sha256,
    sourceDeckId: candidate.document.layout.playableDeckId,
    bodyRadiusM: 0.3,
    bodyHeightM: 1.8,
    perimeterHalfWidthM: 0,
    partitionHalfWidthM: 0,
    objectCollisionBindings: qualifiedWayfarerWalkingBindings(
      snapshot,
      0.3,
      1.8,
    ),
  },
  () => `30000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`,
);
writeFileSync(
  ".runtime/shipyard-completion/wayfarer-framed-20260914/assembly-review/document.json",
  JSON.stringify({
    instanceId: plan.document.layout.id,
    deckId: plan.spawn.deckId,
    documentJson: JSON.stringify(plan.document),
    scope:
      "Pure qualified instance fixture; no database or player state mutation",
  }),
);
