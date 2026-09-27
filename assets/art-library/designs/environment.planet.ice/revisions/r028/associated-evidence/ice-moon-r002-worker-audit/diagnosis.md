# Ice-moon1 r002 worker composition diagnosis — 2026-09-14

Read-only investigation of frozen source/imported code after root reported three software-browser sessions closing during initial wait, without JavaScript errors. No browser actions or shared implementation edits. Local Node24.18/Linux measurements establish substantial algorithmic and allocation cost; they do not prove that browser sessions were OOM-killed, and are not GPU/hardware frame timings.

## Measurements

| Case | Compose ms | Peak resident memory | Packed output |
| --- | ---: | ---: | ---: |
| Actual frozen Ice moon1, direct process with CPU profile | 4304.8 | 500.5 MiB | 21.0 MiB /203904tri |
| Actual hybrid Temp moon1, control | 735.9 | 341.8 MiB | 21.3 MiB /206840tri |
| Actual Ice worker protocol, full source cloned | 5954.1 | 545.4 MiB | 21.0 MiB |
| Same worker, only used source variants cloned | 6141.7 | 484.8 MiB | 21.0 MiB |
| Isolated instrumented frozen copy | 4299.5 | Not independently compared | Exact reference buffers |
| Isolated optimized proposal copy | 1735.7 | Not independently compared | Every buffer and range identical |

Direct-process benchmarks retain their read buffer intentionally for source hashing; that adds95.7MB for Ice,18.2MB for hybrid. Do not equate those absolute numbers with a browser worker. The worker-protocol measurements instead release parse temporaries at an event-loop boundary, force GC, keep the main parsed kit, clone to a real worker thread, compose, transfer typed output buffers and terminate the worker. Parent parsed heap is~51MB before the worker. Earlier measurements that retained the JSON string are preserved with `-string-retained` filenames (~637MiB peak full), not used as the normal protocol estimate. Node/tsx loader overhead and host scheduling differ from browser workers.

## Confirmed work amplification

Ice kit JSON is95,700,105 bytes versus18,173,364 for the hybrid control, despite virtually equal final triangle/output counts. Ground originals are all stored in the source archive; only high ground is composed, but all five variants are cloned by current candidate worker dispatch.

High ground has67,984 triangles/203,952 expanded corners but34,330 unique positions. Each corner maps once for position and four more times for finite-difference authored-normal transport. Exact probe counters:1,019,760 substrate calls,45,794,196 floor queries,141,096,252 candidate-floor triangle tests. Each substrate evaluation recomputes all10 immutable region tangent frames and trig values. Eight sample offsets are reallocated inside the region loop. Most distant queries still build string cell keys before discovering an empty cell. The profile attributes~3731ms self-time to compositor substrate/floor callbacks; GC and ordinary emit/normal work are secondary. CPU profile names map to transpiled line1; exact counts come from the isolated instrumentation copy.

Emitter uses growable JS number arrays and later copies them to typed arrays. The~21MiB final output therefore coexists with larger boxed/double backing arrays and growth capacity. The per-level candidate creates a worker and clones the entire kit each time. Cache can request adjacent levels concurrently during approach; these moon compositions retain identical macro geometry across allLOD, so concurrent builds can duplicate this cost. No browser concurrency or OOM trace was available to attribute the observed session exits.

## Bounded proposal, NOT applied

1. Precompute immutable region east/north/trig, reuse a fixed clearance stencil, reject floor queries outside a conservative source XY bounding box, and replace bounded string cell keys with numeric cell keys. `proposed-optimized-copy.ts` implements this only inside this evidence directory. Exact seed38/LOD0 proof compares every position/normal/UV/index byte and every triangle-placement range against the frozen copy: all equal. Measured2.48x faster. No sampling, authored surface, optical material, LOD or clearance changes. Numeric-key stride has an explicit bounds assertion; bounding rejection keeps1e-6 margin, larger than current barycentric tolerance.
2. Dispatch only the source variants actually consumed: ground-sphere, snow-cut-region, snow-open-gorge. Preserve the complete native archive. Protocol peak falls by about61MiB without a visual change; compute duration does not materially improve. Do not clone unused medium/low originals into each worker.
3. Pre-count role triangle sizes and emit directly into typed output buffers, preserving JS-number arithmetic before the final Float32 write. This should reduce the growable-array peak but is a proposal, not measured or implemented here. Do not use Float32Array.map for finite-difference intermediates: it would round perturbations earlier and could change normals.
4. Reuse one composition result for identical allLOD geometry and avoid concurrent duplicate builds, while retaining cache visibility/swap ordering and source material identity. This is a lifecycle proposal only; existing imported code is untouched.

These changes should be followed by exact full-buffer equality across representative seeds/LODs, existing NullEngine shaft/gorge and all-region floor rays, material/identity checks, then a real browser capture and hardware approach/MapObserve measurements. Node completion does not close the hardware acceptance gate or prove the capture-service failure resolved.

## Evidence and preservation

`benchmark.ts`, CPU profile/top-self-time JSON, direct memory/time JSON, `static-work-counts.json`, isolated instrumented and proposed copies, exact `probe-result.json`, real-worker protocol scripts/results are self-contained here. No frozen source, imported compositor/helper, worker, viewer or browser was changed. Local cgroup reports memory.max=max and an existing oom_kill counter2; no timestamps/process identity tie that historical counter to these captures, so it is not crash evidence.
