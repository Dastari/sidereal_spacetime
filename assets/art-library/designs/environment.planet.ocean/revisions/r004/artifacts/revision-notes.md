# Ocean r004: authored face normal transform

Uses exact ocean-r003 kit without new geometry or art export. Follows the independently reviewed desert normal diagnostic. The emitter transforms the native face normal through local placement derivatives at each vertex, preserving hard source edges while allowing continuously curved caps to shade continuously. All positions, native indices and placement ranges remain unchanged.

New regression checks compare every position/index byte and every placement range at all three levels, then verify finite unit normals and an actual normal change. The first assertion-heavy run exceeded Vitest's5second per-test timeout; native byte comparisons and aggregate finite/unit validation retain exhaustive coverage without hundreds of thousands of assertion calls. Existing rendering/material/identity checks remain.

Source and helper snapshots/hashes are frozen here. No wholeplanet reference acceptance, owner approval or hardware timing claim is made from this technical correction. Actual two-angle comparison remains with the root/reviewer.
