# Boundary r003: actual native floor contact adapter

This preserved additive candidate fills the real floor bevel trough under the r002 door gasket. It does not replace r001 walls/door, r002 gasket, or any floor source. No shared code/catalog/runtime/service or publication changes were made.

| Artifact | SHA-256 |
| --- | --- |
| `kit.glb` | `c77ebd056fa9fe5509b7e60598b68e9ab5858579542ffdf48cec7bfa785b3c0d` |
| `interfaces.json` | `a91f61c7137fc7c13455617f1be6ea97e55d44259848efde56ec2cf740349213` |
| `boundary-kit.blend` | `60541e29284aaf29673bcdc0663660958f8a06844899162f9b7234b032acb815` |
| Required installed floor r002 GLB | `138b483f6052f01e23883b8d8b48bb72cdbace44727c8e717b1e6351c3593585` |

Exact r001/r002 dependencies are pinned in `interfaces.json`. Their original artifacts/history remain unchanged.

## Diagnosis and measured result

The single square floor supports the whole .01143 m² gasket bottom patch. A legal pair of quarter tiles introduces a transverse seam: each top face stops 4 mm before its nominal edge, forming an 8 mm-wide trough nearly 4 mm below floorTop6. The old gasket misses .0000720000747 m² of contact at that seam.

The new native Blender insert is the complement of that **exported triangle cross-section**, extruded along the gasket strip. Its top stays exactly .1875 m. It adds no walking step and does not reduce the 1.25 × 2.25 m opening. Its underside contacts the actual native beveled triangles; it does not intersect a guessed floor AABB or an ideal horizontal plane.

`validation.json` records 12 checks, including triangle overlay clipping and affine height comparisons. In the exact quarter-tile fixture, all 16 underside overlap polygons agree with the native floor surface to numerical precision (maximum measured deviation 2.78e-17 m; acceptance tolerance 1e-7 m). The floor-plus-insert contact area becomes .011430000000000063 m², matching the entire declared gasket patch.

Sixteen square/half/quarter/strip pairs were also compared. They are **nominally compatible within 1 micrometre**, with maximum 0.432 micrometre mismatch from the independently exported float coordinates. These are not identical-contact proofs for those other placements. Their actual layout adapter must make its tolerance/sealing policy explicit; geometry alone does not establish an airtight joint.

## Native integration contract

- One fixed mesh: `GEO-door-flush-seam-contact--surface`, 16 triangles, one single-sided PBR material, retained normals/UVs/tangents.
- Source mesh has identity node transform. Place its X origin on the verified transverse seam in the doorway module frame; the demonstrated seam is X=1 m. Apply the whole doorway orientation once. Never stretch or reflect the mesh.
- Local X profile is approximately −.00400000811 through +.00400000019 m. Exact five-point section is in `interfaces.json`.
- Local Y runs −.09 through −.045 m. Top is Z=.1875 m, deepest point Z=.183500006795 m.
- It stays fixed to the floor, independent of the leaf/gasket hinge and morph. Existing r002 retract-before-hinge sequencing remains required.
- Only instantiate at actual supported floor-seam crossings within the contact strip. A single uninterrupted floor needs no insert. Missing native support, diagonal seams, corner bevels, other floor revisions and unverified rotations must reject seal acceptance rather than imply compatibility.
- No raised threshold or floor mutation is required. Actual authoritative walking and integrated browser verification remain the parent's work; this delivery verifies native clearance only.

This is a door-strip contact adapter, **not a general floor seam pressure seal**. It does not certify the r001 wall-bottom contact along every floor edge, floor/roof seams elsewhere, gasket attachment force, material permeability, wear or pressure capacity. Those surfaces still require their own validated coverage/sealing definitions. Do not set zero leakage from this artifact alone.

## Evidence and remaining work

The editable source contains unchanged r001/r002 door context plus copies of the actual installed quarter-floor GLB mesh. Six actual CPU images were opened and inspected: whole door closed/open, identical-camera native seam before/after, closed-lip contact detail and transparent insert cutout. They use Blender 4.3.2 Cycles CPU, 48 samples, AgX, 1000×900. Earlier cropped camera evidence is retained in `.runtime/construction-boundary-kit/r003/attempt-a001`; final framing is `attempt-a002`.

The parent owns catalog installation, current layout contact validation, seal authority/obstruction/leakage and real game tests. No structural material ratings, damage clipping, owner art acceptance or publication are asserted. Diagonal wall/node families are a separate staged follow-up; r003 does not complete enclosure coverage for all twelve floor polygons.

`npm run art:check` passed. All18 manifest file hashes verified. Shared source/index generation and aggregate software check/build remain integration-owner gates; no shared software changed in this candidate.
