import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const hash = (path: string) =>
  createHash("sha256").update(readFileSync(path)).digest("hex");
const sources = [
  "packages/content/src/construction-boundary-interfaces.json",
  "assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r001/boundary-kit.blend",
  "assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r001/kit.glb",
  "assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r002/boundary-kit.blend",
  "assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r002/kit.glb",
  "assets/art-library/designs/shipyard.structure.boundary-kit/revisions/r002/interfaces.json",
  "assets/art-library/designs/shipyard.structure.inset-boundary-wall/revisions/r005/blender-source.blend",
  "assets/art-library/designs/shipyard.floor.mapped-deck-kit/revisions/r002/glb.glb",
  "packages/content/src/ship-tileset-corner-spec.v1.json",
];
const spec = {
  schema: "sidereal.tileset-inward-doorway-request.v1",
  revision: "r002-gasket-stroke-channels",
  supersedesRequestSha256:
    "8f3aa7166354efacabb47068e60a9713dc10c4ec16360e861d7a123fa486c13e",
  wallConvention: "inset250-v1",
  latticePerMeter: 32,
  sourceFrame:
    "Blender X along boundary, Y inward, Z up; floor-relative metres; applied transforms",
  placementFloorTopM: 0.1875,
  standardRoofUndersideM: 3.1875,
  sources: sources.map((path) => ({ path, sha256: hash(path) })),
  frame: {
    id: "doorway-frame-2m",
    outerMinM: [0, 0, 0],
    outerMaxM: [2, 0.25, 3],
    apertureMinM: [0.375, 0, 0],
    apertureMaxM: [1.625, 0.25, 2.25],
    description:
      "Full2m span, 375mm jambs, 750mm lintel. Complete end contact patches X0/2, Y0...25, Z0...3. Aperture stays open from actual floor to2.25m. Native authored frame/seat preserve the entire inward envelope.",
  },
  hingeCorrection: {
    scope:
      "New derivative only: replace the two penetrating hinge straps with connected native elbow/bridge hardware. Retain leaf panels/slab, moving gasket, fixed seat and exact hinge axis unchanged after the declared source reflection/rebase.",
    strapCandidateTranslationM: [0, 0.034, 0],
    strapClosedYIntervalM: [0.0845, 0.0965],
    leafBridgeRegion:
      "Connect to the leaf atX>0.390m, outside the gasket inner contour; no22mm floating gap. Connect the other end to the original hinge axis without passing through the fixed seat or gasket.",
    jambReliefEnvelopeMinM: [0.25, 0.0625, 0.002],
    jambReliefEnvelopeMaxM: [0.375, 0.25, 2.248],
    jambReliefRule:
      "A declared pocket within this bounded envelope may clear the complete leaf/new-hardware sweep. Preserve all fixed seat and deployed-gasket patches; the seat is not carved away. Machine exact seat accommodation into the new frame so fixed bodies do not positively overlap. Full module end and roof contacts remain unchanged. Static floor contact follows the separately declared gasket-stroke channel mask. If this envelope is insufficient, return measured witnesses before expanding it.",
    commonMechanismYTranslationM: 0,
    requiredProof:
      "All91 integer-degree poses plus conservative between-sample sweep bound, all21 closed seal fractions plus continuous morph bound; actual native Boolean/triangle intersection tests, connected hardware and complete retained seal contacts. SourceAABB checks alone are insufficient.",
    reason:
      "Preserved doorway r001 feasibility found inherited strap/fixed-seat positive-volume intersections. Translating all mechanism pieces together cannot correct their relative interference. New connected hardware is explicitly authorized inside the same250mm closed reservation; no validator tolerance is changed.",
  },
  gasketStrokeChannels: {
    minM: [0.365, 0.0625, 0],
    maxM: [1.635, 0.0845, 2.26],
    rule: "Machine only the intersection of this declared stroke envelope with new jamb/lintel bodies. Keep the complete retained fixed seat and all deployed opposing seal contact faces. Left/right10mm lips and top10mm lip have explicit clearance outside the unchanged1.25x2.25 aperture. No cut through the outerY0 backing, module end contacts or roof contact.",
    floorContact:
      "Static jamb floor-foot contact is the original375x250mm region minus its declared10x22mm stroke-channel intersection (0.09353m2 per jamb before separate exact fixed-seat accommodation). Preserve and measure fixed-seat/floor and moving bottom-gasket/floor contacts separately. Unoccupied channel volume is an intentional internal mechanism recess, not a tolerated missing contact. All actual declared patches must match completely at unchanged tolerance.",
    scope:
      "New versioned frame geometry only; old asset and validator contracts remain unchanged. Record closed/retracted/operational coverage separately and prove complete closed-state enclosure before any pressure grant.",
  },
  retainedMechanismDerivative: {
    source:
      "r001 leaf plus r002 moving perimeter seal and fixed frame seal seat, reconstructed in original Blender world coordinates before transformation",
    exactSourceTransform: { x: "x", y: "-y", z: "z - 0.1875" },
    meaning:
      "Reflect sourceY and rebase the old floor-top height. Apply once to all mesh vertices, shape keys, hinge geometry and fixed seat. Recalculate native winding/normals after reflection. Do not independently add socketheight or translate each piece again.",
    hingeBindM: [0.3125, 0.0625, -0.1875],
    hingeSocketM: [0.3125, 0.0625, 0],
    hingeAxis: "+Z",
    closedAngleDegrees: 0,
    openAngleDegrees: 90,
    sweepDirection: "positiveY inward",
    slabMinM: [0.377, 0, 0.002],
    slabMaxM: [1.623, 0.0625, 2.248],
    conservativeSweepMinM: [0.3125, 0, 0.002],
    conservativeSweepMaxM: [1.6244895197752154, 1.3744895197752154, 2.248],
    description:
      "These slab/sweep figures describe the retained mechanism derivative, not a substitute for measuring every exported hardware vertex. Evaluate motion as h + R(angle) × (p - h) on the transformed source-world vertex p; the hinge bind is not an extra translation at closed pose. Report any discrepancy before changing the request.",
    sealMorph: {
      name: "SealRetracted",
      deployed: 0,
      retracted: 1,
      sequence:
        "Fully retract before moving the leaf; close fully before deploying seal.",
    },
    frameRole: "fixed frame and fixed gasket seat",
    leafRole: "one moving leaf with its gasket sharing one physical hinge",
  },
  fixture: {
    id: "inward-door-in-4x2-room",
    footprintM: [
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ],
    floorParts: [
      { id: "square-2m", originM: [0, 0] },
      { id: "square-2m", originM: [2, 0] },
    ],
    doorwayOriginM: [1, 0, 0.1875],
    corners: [
      { profileId: "corner-7daf02f77db4", originM: [0, 0] },
      { profileId: "corner-2d29d106ea4c", originM: [4, 0] },
      { profileId: "corner-5b03c711aa8b", originM: [4, 2] },
      { profileId: "corner-0792c389209e", originM: [0, 2] },
    ],
    spans: [
      { lengthM: 0.625, originM: [0.25, 0], quarterTurns: 0 },
      { lengthM: 0.125, originM: [0.875, 0], quarterTurns: 0 },
      { lengthM: 0.125, originM: [3, 0], quarterTurns: 0 },
      { lengthM: 0.625, originM: [3.125, 0], quarterTurns: 0 },
      { lengthM: 1.5, originM: [4, 0.25], quarterTurns: 1 },
      { lengthM: 3.5, originM: [3.75, 2], quarterTurns: 2 },
      { lengthM: 1.5, originM: [0, 1.75], quarterTurns: 3 },
    ],
    retainedFamilies: {
      convex:
        "assets/art-library/designs/shipyard.structure.convex-inset-boundary/revisions/r004/",
      roof: "assets/art-library/designs/shipyard.structure.roof125/revisions/r000/",
    },
    qualificationQuarterTurns: [0, 1, 2, 3],
    initialRuntimeReflection: "unsupported",
    actorClearanceStudy: {
      radiusM: 0.3,
      heightM: 1.8,
      meaning:
        "Existing bounded test-body dimensions; not a new character capability.",
    },
  },
  requirements: [
    "Author a new editable native frame and the explicitly scoped connected hinge correction; transform retained leaf-panel/gasket/seat surfaces in Blender. Do not reshape coarse TypeScript visual solids. Preserve r005 wall materials and actual leaf/gasket material maps and shape keys. Do not reintroduce penetrating legacy straps.",
    "Retain all old sources/runtime identities/pins unchanged. New frame/leaf/gasket dependency IDs and new adapter metadata remain distinct. One installed leaf instance will own its paired moving gasket; no independent hinge or ownership grant.",
    "Closed solid body, complete native end patches, floor/frame/seat contacts and actual deployed gasket patches must be measured from exported triangles, not ideal boxes. Aperture and full leaf hardware/sweep must stay correctly represented.",
    "The new frame extends to full3m abovefloor; old frame/pressure proofs do not apply. Re-audit exact floor/jamb/lintel/roof/neighbor contacts in the complete4x2m fixture at all4rotations.",
    "Use the actual retained floor at its native transform. If a native seam/recess prevents full gasket/threshold contact, preserve the failure and report the exact missing patch; root must freeze a new floor-junction/threshold correction before it is authored. No invisible fill or ideal-floor substitution.",
    "Validate source/export manifoldness, containment, finite vertices and nondegenerate faces; no fixed export count is imposed, but every fixed/moving node and both morph endpoints must be named, hashed and audited.",
    "Validate closed+deployed, closed+retracted, moving+retracted at intermediate angles, fullyopen+retracted. Reject deployed-seal leaf motion, wrong hinge/socket transform, 1mm gap/overlap, height and winding/normal changes. Original1micrometre export allowance remains unchanged.",
    "Actual opaque-background native renders: front/back, closed seal details, retracted seal, intermediate swing, fullyopen and assembled floor/roof context. Opening passage and1.8m-body clearance are measured geometrically; no game passage/pressure qualification is granted by an image.",
    "All physical adapters remain unqualified until root authority integration and exactcandidate browser/game tests. Source/control reuse does not authorize new collision/pressure/damage/material ratings. Art remains unapproved; no catalog/bindings/runtime/deployment/live mutation.",
  ],
};
const output = "packages/content/src/ship-tileset-doorway-spec.v1.json";
const docs = "docs/ship_tileset_doorway_authoring_requirements.md";
for (const [path, content] of [
  [output, JSON.stringify(spec, null, 2) + "\n"],
  [
    docs,
    `# Inward250 doorway native request\n\nGenerated by scripts/generate_ship_tileset_doorway_spec.ts. Machine-readable source: ${output}.\n\nNew2m/3mclear frame retains1.25×2.25m mechanism dimensions with an explicitly reflected/rebased inward swing. Existing native sources and pressure qualifications remain unchanged.\n\n${spec.requirements.map((s) => `- ${s}`).join("\n")}\n`,
  ],
]) {
  if (process.argv.includes("--check")) {
    if (readFileSync(path, "utf8") !== content)
      throw Error(`Stale request: ${path}`);
  } else writeFileSync(path, content);
}
console.log(hash(output));
