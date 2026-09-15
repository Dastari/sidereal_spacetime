# Genesis selects reviewed native assets explicitly

Date: 2026-09-15. Status: accepted for the owner-requested integration.

Genesis currently uses legacy procedural rendering although PR2 delivered reviewed Blender assets. It can carry explicit local catalog identity, unlike authoritative generic moons. Use one renderer-owned catalog and the existing shared planet worker/scheduler, with worker-side validated asset loading and body-owned retained GPU levels. Keep procedural controls in a separate explicit mode because those controls cannot faithfully edit all authored native surfaces.

An iframe to the review tooling or production imports from scripts would create divergent paths and private /@fs asset dependencies. Copying per-body review workers would multiply memory and violate the shared scheduler boundary. Neither is used. This integration adds packaging/registration and lifecycle work, but permits faithful reuse and eventual game integration without changing authority. Full-world moon identity remains a separate contract.
