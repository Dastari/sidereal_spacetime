# Side armor R003 publication

The owner approved the exact R003 with “Great make them live please.” The eighteen reviewed side armor modules now replace the current ship's legacy side armor in the published catalog and shared native hull manifest. All 244 other placed records are preserved, including the approved roof, bow, floors, equipment, cargo and independent thrusters.

The installer is `scripts/install_side_hull.py`. It validates the exact signed-off kit hash and current placement frames, archives the previous catalog/layout/volumes/GLBs, copies the native kit and editable source, and merges only these assets and their two markings. The original R006 hull and R004 roof publication metadata remain intact.

The old side armor's visual cells are retired only in the two side-run regions; stern armor remains. The original voxel data is still exported separately. `legacy-retirement.json` checks 270,096 removed side visual cells and 12,232 retained other armor cells against the actual filter. No authoritative state or statistics changed.

Validation: art:voxels, art:assembly, art:check, project check and build passed. Native release validation passes; all eighteen native placements and 244 other placements survive regeneration. Browser evidence uses installed asset URLs in the actual game, with paced frames and camera framing only. A first loaded scene retained the pre-publication manifest; a fresh reload verified the published kit.

The approved geometry totals 33,648 triangles, with seven design families, eight bounded fixture lights and two independently placed side markings. This triangle count is not an FPS claim.

`publication.json` records authorization, hashes and archive location. Browser scripts, logs and screenshots are retained in `output/playwright/side-hull-publication/`; final screenshots and checks are copied alongside this record. Review history remains separately preserved in the art library.
