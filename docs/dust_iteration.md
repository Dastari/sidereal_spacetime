# Velocity dust iteration

Status: speed/density correction implemented; the newly requested multi-depth parallax pass belongs to the lead and remains outstanding.

The owner screenshot at 27.7 m/s showed near-maximum long lines. The old response saturated at30 m/s and scaled streak length separately from grain width, producing very long aspect ratios at ordinary ship speed.

`packages/render/src/environment/dust.ts` now keeps27.7 m/s as cubic grains. Short trails begin beyond40 m/s, reach aspect2 at100 m/s and aspect3 at160 m/s. Distinct long-streak styling begins beyond600 m/s, reaching its bounded aspect48 at3000 m/s. These are presentation thresholds, not a warp control or simulation grant. Reduced motion retains cubic grains at every speed.

The fixed buffer now holds at most576 cubes (6912 triangles), with complete rectangular active fields selected for the viewport aspect. Positions use seeded world-cell coordinates and snapped spacing LOD. Cell width/height does not continuously stretch with the camera. A second visual iteration enlarged the grains2.4× because the first were subpixel at ordinary zoom. The result is roughly2–3 pixel voxel specks at wide zoom.

Actual Chromium renderer captures at the required tailnet origin, using the production environment module and prescribed presentation velocity:

- `output/playwright/dust-zoomed-out.png`:27.7 m/s, half extent650,1280×760,558 active cells, spacing128, aspect1. Inspected: visibly cubic specks across the viewport.
- `output/playwright/dust-fast.png`:same camera and origin,3000 m/s, aspect48. Inspected: clearly distinct long lines.
- `output/playwright/dust-ultrawide.png`:27.7 m/s, half extent650,1920×700,560 active cells; visible coverage survives aspect change.

`dust-ordinary.png` is not accepted evidence: its first render captured shader warmup, and the attempted settled resized capture timed out after60 seconds. That timeout occurred before the subsequent ship-shadow capture could execute. The browser was closed and GPU handed back to the UI/planet reviewers.

Validation: all110 tests and `npm run check` passed after the dust change. Five dust tests cover ordinary/high speed, reduced motion, heading convention, finite fallbacks, rectangular bounds/population, and stable world-cell coordinates across translation/resized grid indexing. The final build belongs to the lead's combined integration gate.

New owner correction: fixed grain heights−12..−54 m provide weak depth separation when the camera is far away. This pass has **not** established the requested near/mid/far motion parallax. Dust helper and environment update ownership transferred to the lead for camera-depth plumbing and projected-motion validation before final acceptance. The dedicated geometry agent proceeds to the ten-character source fidelity pass.
