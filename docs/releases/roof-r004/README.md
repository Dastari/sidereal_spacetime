# Roof R004 publication

The owner approved the exact reviewed R004 and requested it become the current in-game roof. The approved native Blender kit now supplies all 73 roof placements, with 26 reusable component designs, 34,200 geometry triangles, eight bounded spot fixtures and three independent paint markings. The 189 other current placements are preserved, including newer floors, equipment and cargo.

`publication.json` records the exact authorization, kit/source hashes and pre-publication archive. `scripts/install_roof.py` performs a guarded, scoped installation. The shared hull manifest retains the R006 hull and adds the R004 roof receipt and entries; regeneration retains both. Original occupancy data remains separate from retired legacy roof/marking visuals. Four retained legacy catalog wall parts are regenerated from their preserved data so old drafts remain loadable.

The runtime paint integration now retains alpha through cutaway and excludes paint from solid shadow occluders. Two regressions cover these paths. Native geometry and approved materials are unchanged.

Validation: project check (82 files, 303 tests), build, art:voxels, art:assembly, art:check and native release validation passed. Browser evidence uses actual installed URLs in the game and Shipyard, with camera framing and paced rendering for software WebGL capture. No substitute models or lighting overrides were used. The game retains its existing space lighting, so its appearance varies with the environment.

Evidence: `output/playwright/roof-publication/` contains scripts, logs and screenshots. Final copied evidence and hashes are in this directory and the roof review board. Owner signoff remains against the immutable R004 review artifacts; publication evidence is separate. No authority or gameplay stats changed.
