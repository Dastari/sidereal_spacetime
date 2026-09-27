# Proof-03 independent review

Reviewer: `/root/armor_reference_review`  
Outcome: **Fail the initial family propagation gate. Repair connector/rail intersections and recapture.**

This review inspected seven actual fresh-GLB Blender views in `r004/hull/proof-03/renders`, the source/material manifest and validation record, and the actual game-loader whole-ship `r004/browser/proof-03/concept.png` against the same broadside baseline camera and the accepted proposal. Exact inspected evidence is hashed in `proof-03-evidence.json`.

The new proof demonstrates meaningful improvement. The side shoulders and lower bands are broad chamfered solids, and the cassette front sits behind them with a visible shadow reveal. The joined 4 m plain bay introduces a broad quiet surface instead of repeating a full vertical post at every 2 m center. The bow bumper has a distinct exterior assembly and separate liner, visible in the exploded native capture. The shoulder now has a projecting framed profile rather than the earlier flat triangular cladding. Fine seams, bolts and hazard markings are mapped; inspection of the exported service GLB confirms embedded base-color, normal and roughness textures connected through portable glTF material fields.

One defining reference feature still fails. The pale connector caps render largely black on their front and return surfaces, leaving isolated white chamfer tips. This occurs on side modules, the joined plain bay and the bow. It makes the pale ribs visually stop before the horizontal rails. At whole-ship zoom the new rails therefore form long black strips instead of the concept's interrupted dark courses with substantial pale wrapped ribs.

The coordinator identified a plausible geometric cause: the full-width rail fronts share the outer plane with pale connector shoes. An atlas/UV audit alone is insufficient. The next proof must terminate or step rails around shoes so that each visible surface has one intended owner, then verify pale enamel on the cap front, top, bottom and depth returns. Do not recolor conflicting surfaces to conceal overlap. Subtle mapped transverse cap seams can provide the reference's construction-course rhythm without adding small geometry.

| Criterion | Finding |
| --- | --- |
| Separate armor | Demonstrated for inspected side/bow proof; bow exploded view is clear. Full complete perimeter still pending. |
| Shoulders and cassette depth | Direction passes native proof: substantial step and recess now visible. |
| Broad bay proportions | Joined 4 m plain proof is improved. Whole layout with four paired bays and one single per side remains pending. |
| Wrapped connectors | Fails: black interruption across intended pale caps/returns. Repair before propagation. |
| Mating seam | Earlier proof-02 17.1875 mm overrun was reported to author and fixed in proof-03. Native close seam looks deliberate; technical validation records exact owning spans. |
| Bow continuity | Bumper/shoulder direction improved, but black cap defect also affects bow. Complete cheeks/transom family still pending. |
| Mapped details | Portable maps are present and visible. Geometry still carries the necessary major depth. |
| Whole-ship match | Partial proof only, with eight old fallback entries deliberately retained. It cannot establish final full-family concept match. |

This is a focused repair request for the first prototype, not rejection of the demonstrated depth/bay improvements. The next review will compare corrected cap surfaces at native close range and the same broadside game-loader camera before allowing family propagation. No final artistic sign-off, deployment, gameplay damage qualification or Shipyard contract completion is granted by this report.
