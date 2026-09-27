# Voxel dust and perspective motion

Status: Runtime implementation, pure projection checks and browser motion comparison passed
Date: 2026-09-08

## Latest size and zoom correction

The owner clarified that angled 3D dust was already satisfactory. Only the three top-down flight strata now use 42% of their previous grain size, with a three-pixel projected size cap to prevent extreme nearby grains from becoming large tiles. Their population, world anchoring, velocity thresholds and depth separation are unchanged. Deck and focused-body background grains retain their earlier size. Inspected final captures are `output/playwright/dust-topdown-small.png` and `dust-3d-preserved.png`.

Wheel input now changes a retained target zoom, with frame-rate-independent exponential easing of the displayed deck/flight zoom. Reduced-motion preference retains immediate response. The real browser wheel probe measured radius 215.40 before and immediately after input, then 225.99, 256.23, 270.91 and 273.68 over subsequent frames, converging on 273.82. Flight retained 540 particles across three layers; deck retained its separate 558-particle background field. This is bounded presentation-frame stepping, not a hardware FPS benchmark. A regression checks convergence across 30/60/144 Hz and reversal without overshoot.

The owner rejected long streaks at ordinary 27.7 m/s flight, weak population at wide zoom, and dust that appeared to move at the same rate as planets.

Dust is a bounded 576-instance field. Rectangular cell layouts adapt to the viewport. Ordinary speed keeps cubic grains; short trails begin above 40 m/s, and the long-streak blend spans 600–3000 m/s. These are presentation thresholds, not gameplay warp capabilities. Reduced motion suppresses streaking.

Flight now distributes the budget across three world-horizontal depth strata. Their heights use quantized world bands; each has its own seeded XY cell lattice and viewport coverage. Perspective projection produces different screen speeds. No velocity is integrated into particle positions: render-origin translation reveals the stationary world field. Camera orbit changes projection rather than rotating a particle sheet around the camera. Deck and focused-body observation retain the subdued background field.

The six focused dust tests cover ordinary/high/reduced-motion response, coordinate convention, bounded viewport population, stable cells at a 1e12 m origin, and actual perspective projection across 18/55/650 m zoom extents. Near particles project more than twice as fast as the middle layer and a planet at height -85; the middle layer moves more than 1.5 times as fast as the far layer.

The first browser parallax stills show 561 instances across three strata at maximum zoom, with ordinary-speed grains. The initial motion measurement mistakenly read Babylon's cached `thinInstanceGetWorldMatrices()` after direct buffer updates. The review now reads the live instance buffer; those first zero-match results are not accepted motion evidence. Final browser metrics and captures will be appended after verification.

The corrected real-browser comparison passed using the same runtime environment on the required tailnet host, at a 650 m half extent and 27.7 m/s presentation input. A controlled 60 m origin translation matched 79 near, 68 middle and 108 far world particles across frames. Mean projected travel was respectively **211.94, 61.22 and 25.27 pixels**, an 8.4× near/far separation. The field contained 540 instances at that viewport, with grain aspect 1 and no warp blend. These are controlled renderer measurements, not a claim that the review moved an authoritative ship. Inspected captures are `output/playwright/dust-parallax-before.png` and `dust-parallax-after.png`. The probe omits the main scene's lighting, so its reference body's appearance is not planet-art evidence. The fresh review started on a static asset page to avoid competing application render loops; production still uses one game canvas.
