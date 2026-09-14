# Bridge wall and bunk-post correction

The owner requested removal of the conflicting bridge wall and a fix for bunk-post z-fighting, explicitly authorizing publication of both corrections.

The owner clarified: “Keep the tall doorway surround; remove the duplicate lower wall.” Both native Blender rear panels and the doorway frame are restored. A scoped legacy partition visual retirement removes the overlapping lower wall generated from collision fixtures. The other interior partitions, collision rules and equipment are unchanged. This supersedes the temporary tall-panel removal; both iterations remain recorded in the ledger.

The four bunk posts and end plates previously shared exterior Y planes. The Blender maintenance revision increases each post depth from 0.14 to 0.18 m, separating those planes by 20 mm. The authored source is preserved, and its evaluated surface is exported as a native GLB. Geometry remains 5,712 triangles; the overall bounds, materials, reading lights and occupancy proxy are unchanged. All original 262 placement records are present with unchanged transforms.

The exact previously signed design remains R005. R006 is an explicitly authorized maintenance publication, not a claim that the owner reviewed a new final design. Its source, GLB, validation and actual game screenshots are recorded in the living bunk ledger. The previous published assets and manifests are archived under `assets/source/archive/pre-bridge-bed-fix/`.

Reproduction: `scripts/art_library/fix_bunk_posts.py`, `scripts/install_bridge_bed_fix.py`, then the actual voxel and assembly export pipelines. `scripts/art_library/check_bridge_duplicate.ts` validates restored native panels, preserved other placements, and scoped retirement of the duplicate low wall against exported voxel cells. Screenshots use the actual client and installed URLs, with a paused render loop and camera framing for capture; no asset overrides.

Validation: native Blender export, voxel export, assembly regeneration, `art:check`, full project check and build passed. The broader optional art-library check reports an unrelated non-contiguous history in `shipyard.structure.roof-kit`; that ledger is outside this correction. During browser work, concurrent application changes caused transient dependency reload errors and an “Enter the lab first” notification. The saved bunk view includes that notification; the published asset geometry itself was inspected. This is visual publication, not an authentication or gameplay validation claim.

Capture audit: `runtime-bridge-final.png` verifies zero installed tall rear panels, the retained doorway and no model-load error. Use `runtime-close.png` for the actual bunk view. The later `runtime-bed-final.png` was occluded by the roof after a concurrent client reload and is retained as a failed supplemental capture, not validation evidence.


The owner-clarified publication supersedes the earlier bridge screenshot and removed-panel audit. See `bridge-clarified.png` and the current `bridge-validation.json`. The bunk correction is unchanged.
