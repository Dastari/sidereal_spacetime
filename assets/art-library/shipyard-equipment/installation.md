# Approved equipment installation

The owner approved the exact current review set and explicitly authorized implementation: “Okay I'm happy with that. Implement them in the game in place of the existing assets.” The [publication record](publication.json) binds that statement to nine designs, ten reusable asset IDs and seventeen placements.

Both Shipyard and the game load the same approved native Blender GLBs, including emissive screens and fourteen placed fixture lights. Catalog thumbnails use the approved transparent renders. Stable placement IDs, transforms and occupancy data remain unchanged; proposed statistics do not become implemented mechanics. Earlier Blender sources remain under `assets/source/archive/pre-equipment-migration`; the approved editable sources are under `assets/source/approved-equipment`.

The TypeScript exporters retain legacy equipment occupancy references but skip their visual batches. Native equipment damage preview is unsupported: saved damage edits remain in the draft, and Shipyard reports the limitation instead of replacing the approved surface with a coarse remesh.

[Exact export and identity validation](installation-validation.json). Review-era screenshots and validation remain historical evidence; their “not published” statements describe that earlier checkpoint.

## Performance follow-up

The owner reported 13,901,784 active indices and 2,369 draw calls in a distant flight view. The installed equipment contains 183,076 triangles across all seventeen placements (549,228 indices for one geometry pass), with 131 visible material primitives when all equipment is enabled. These are detailed close-up models, not fleet-scale optimized meshes.

The inspected lighting path includes eight shadow maps and a glow pass, multiplying the rendering work. The attempted distant-cabin culling changes were withdrawn at the owner’s request to leave performance work to the main agent. No successful same-camera before/after measurement was obtained; browser capture attempts timed out or encountered scene reloads. The counts above are measured exported geometry, not a claim of runtime optimization.
