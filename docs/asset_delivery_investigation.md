# Game-client asset delivery investigation

Date: 2026-09-21 (Australia/Hobart). Status: investigation and proposed implementation scope; no runtime, art or deployment changes. Agent Mail: GrayLotus.

## Recommendation

First reconcile the deployed delivery handler with the existing compression work, then introduce content-addressed assets and a bounded, dependency-aware loader. Put the resulting immutable objects behind a CDN backed by object storage when regional testing and traffic justify the infrastructure. Keep SpacetimeDB authoritative and completely separate from bulk asset transfer.

The scaling invariant should be: **startup cost depends on the player's current playable scene, not the total published asset library**. A CDN improves distance and origin capacity; it cannot remove unnecessary downloads, JSON parsing, GLB creation or GPU uploads.

## Evidence and scope

Inspected upstream main `f19a4b2105fd8fa7dc478d74f4051b776e5afb44`, the active checkout at `9c58c07774d7d3c4a58a40c49e90f2a2c647249c` plus existing uncommitted work, installed client release `1ea3f5f74d3860bf3d0768462382401d4d1a22be0c277a1787ed78cf61149ae7`, and actual public HTTPS responses. The active checkout, upstream main and deployed delivery code differ; these are not interchangeable evidence.

Open PRs were inspected before work. PR #1 includes newer preparation/compression and renderer work; PR #11 changes scene population. Integrate existing work rather than recreating it. This documentation branch starts from upstream main and leaves those branches and the shared dirty checkout intact.

### Installed artifact inventory

Recursive inventory of `.runtime/public-client/releases/20260915-183040-1ea3f5f74d38`, excluding `.br` and `.gz` sidecars. MB is decimal. This is disk inventory, **not a startup download measurement**.

| Group | Files | Original bytes, MB | Observation |
| --- | ---: | ---: | --- |
| Entire release | 3,372 | 1,705.65 | Publication and release-copy cost grows with the whole library. |
| Construction | 1,366 | 740.23 | 1,354 GLBs account for 739.97 MB; many individually small joint variants. |
| Assembly | 900 | 234.34 | Includes 135.52 MB GLBs and 81.35 MB PNGs. |
| Crew | 260 | 70.07 | Includes 43.47 MB GLBs and 26.39 MB PNGs. |
| Root `/assets/` JavaScript | 331 | 7.03 | Emitted chunk inventory; not all chunks load on login. |

Large examples: volcanic kit JSON 62.66 MB, ice-moon kit JSON 45.89 MB, assembly `parts.glb` 23.90 MB, modular crew GLB 18.03 MB. The crew GLB contains 118 meshes, 287 materials and 12 animation groups. The parts GLB contains 296 meshes. Transport compression does not reduce the decoded object/geometry workload.

### Public delivery observations

Performed full GETs with `Accept-Encoding: br, gzip`, recording actual response-body length. Compared with installed `.br` files. HTTPS HTML and loopback port 5183 both reference `/assets/index-BFmX6_ed.js`.

| Public URL | Original bytes | Actual GET encoding/body bytes | Existing Brotli sidecar bytes | Potential body reduction from current GET |
| --- | ---: | ---: | ---: | ---: |
| `/reviewed-planets/volcanic-r023/kit.json` | 62,662,131 | gzip / 7,665,178 | 5,910,515 | 22.9% |
| `/assets/crew/components/modular-crew.glb` | 18,026,492 | gzip / 2,163,188 | 1,377,436 | 36.3% |
| `/assets/index-BFmX6_ed.js` | 1,737,756 | gzip / 394,853 | 308,691 | 21.8% |

All three return `Cache-Control: no-cache`. Crew uses the old `gzip6-v1` ETag variant; delivery metadata still pins `520de12b8dada34e0016524008d5e098af7b5cd1ac42a89f7875024898e5678d`. The active checkout has a newer whole-`/assets/` handler with precompressed Brotli/gzip and immutable Vite bundle caching. Those benefits are not established by merely finding the code in the checkout.

All three sampled Brotli sidecars were decompressed locally and compared byte-for-byte with their installed originals; all matched. Their potential savings therefore preserve the sampled decoded assets exactly.

The planet JSON and JavaScript responses vary on `Origin`; the GLB varies on `Accept-Encoding`. Audit and correct encoding variation across the full proxy chain before introducing shared caching. HEAD for the planet JSON showed its original length and no encoding, while GET was gzipped by the proxy. **HEAD alone would have produced the wrong transfer conclusion.** No edge cache hit was demonstrated. Chromium negotiated HTTP/2, so enabling HTTP/2 is not a new optimization here.

The newer handler still matches only `/assets/`; `/reviewed-planets/` and `/reviewed-stars/` need explicit coverage or migration to a unified published object namespace. Sidecars on disk are insufficient without matching delivery behavior. Binary `.snp` files also require an explicit MIME/encoding decision and measured compression, rather than assuming JSON rules apply.

### Real browser login sample

One fresh, isolated headless Chromium profile visited the public login page without authentication or gameplay mutations. Resource Timing recorded 30 resources, 2,674,230 transferred bytes including its estimated response overhead, and 2,665,230 encoded body bytes. The login background `/assets/environment/veil-nebula-v1.png` contributes 2,122,014 bytes, approximately 80% of encoded resource bytes. Serve a suitably sized WebP/AVIF derivative for the login background; preserve the original authored asset and qualify the derivative visually.

A same-profile reload reported 30 resource entries and 9,000 transfer bytes, consistent with cached bodies plus revalidation overhead. Existing caching already avoids retransmitting most unchanged bytes; immutable URLs primarily remove validation round trips. This is one same-host/network login sample, not a geographically representative latency benchmark. Full authenticated time-to-play, transition timing and GPU upload cost remain unmeasured.

### Loader and publication findings

- `packages/render/src/construction-authored-assembly.ts` loops over placements, awaits a first encounter's fetch, hash and Babylon container load, then proceeds to the next library. It deduplicates inside that load, but serializes distinct libraries. `installed-equipment.ts` has a similar pattern. Prefetch unique dependencies with bounded concurrency while keeping scene mutation controlled.
- `packages/render/src/index.ts` sequences ship preparation, environment readiness and crew loading. Environment work starts earlier, but awaiting it can still gate crew/startup. `environment/index.ts` includes asteroid and legacy ice/volcanic readiness. Measure which dependencies are actually required for the initial scene before changing the ready barrier.
- `crew/index.ts` loads the modular bundle for each visual creation. HTTP cache reuse does not equal parsed-container reuse. Separate immutable prototypes from per-character skeleton, animation, appearance and placement state before sharing runtime resources.
- Large libraries are fetched and parsed before mesh selectors retain relevant groups. Split assets along useful dependencies (body/rig, equipment family, ship structure, region/LOD), balancing reuse against request count. Avoid one archive for the whole universe and avoid creating thousands of tiny mandatory startup requests.
- The active checkout's `scripts/prepare_app.py` has an explicit publication allowlist and `precompress_assets.mjs`; upstream main still copies the runtime tree. Both apps have independent releases. Make the approved dependency closure per consumer the eventual publication input. Never infer approval from a directory name or delete preserved source/history to reduce the runtime package.
- The client already dynamically imports `@sidereal/render`, but the login still fetches Babylon-related chunks. Examine the eager UI/content import graph and actual bundle output before promising that another dynamic import will solve it.

## Proposed design and implementation sequence

### 1. Establish baselines and finish existing delivery work

Integrate the relevant existing PR changes, qualify a delivery-only candidate and validate real GETs through the public proxy. Ensure Brotli/gzip/identity variants, validators, ranges, MIME and cache keys agree. Hashes and compression sidecars should be computed at publication, not repeatedly by a cold delivery process. Serve hashed JavaScript immutably, HTML with revalidation, and plain mutable runtime paths with revalidation until migration.

Add targeted timing around fetch, integrity check, parse/decode, scene assembly and first ready frame. Record cold/warm bytes, critical dependency count and transitions. This is a response to identified loading costs, not a general telemetry expansion. Include the login background derivative and code-splitting audit in this stage.

### 2. Content-addressed publication

Use a small, versioned manifest mapping logical asset/revision IDs to `/objects/<sha256>/<name>.<ext>`, MIME, original and encoded sizes, dependencies, supported format/LOD and provenance. Hashes identify exact published runtime representations; derived optimized assets get new hashes and preserve their source relationship. Existing native qualification pins must remain valid until an explicitly qualified replacement is adopted.

Serve immutable objects with `public, max-age=31536000, immutable`. A release pins its manifest hash; it must not silently follow a mutable global latest manifest mid-session. Partition manifests by dependencies or region as the catalog grows, with a bounded bootstrap index. Do not put private world placements, undiscovered contents, inventory or secrets in public manifests. Fetch scene selections only from authorized server projections.

Upload and validate objects first, publish the manifest second, then activate the client pointer atomically. Retain old manifests, JS chunks and reachable objects for supported active sessions and rollback. Garbage collection follows reachability plus an explicit retention policy, never simply the newest client release. Unchanged objects survive deployments with the same URL. Game and dashboard retain separate entrypoints/releases while reusing public object bytes.

### 3. Bounded demand loading

Provide an asset resolver/scheduler with priority classes: login shell; required playable ship/deck/character; visible nearby objects; optional detail/prefetch. Start with a tunable network limit such as six concurrent requests and one or two parse/upload tasks, then adjust using measurements. Deduplicate in-flight fetches by content hash; share scene-local prototypes with reference counts; release GPU resources when unused. Set byte and residency budgets as well as task-count limits.

Resolve all required ship libraries first and fetch them concurrently. Keep current readiness guarantees for required geometry, character and authoritative interactions. Optional scenery can improve after entry with validated visual fallbacks. Cosmetic fallback geometry must never become collision, damage, control or discovery authority. Retain correct local ship/deck coordinates and independent placed UUIDs.

Abort unused fetches on transitions/disposal, clear failed cache promises, bound retries, reject hash mismatches and provide explicit retry for required failures. Do not report playable while required assets are missing. Missing optional content must not block the whole game. Spatial prefetch uses server-permitted destinations and observations, not hidden world data.

### 4. CDN and object storage

Recommended target: dedicated public asset hostname backed by object storage and a CDN, with the game origin continuing to own HTML/auth routing and SpacetimeDB traffic. Cloudflare R2 with a custom domain is a credible candidate; S3 with CloudFront or another object-store/CDN pair is also suitable. Provider choice remains proposed, not a purchase or deployment decision.

Cloudflare documents custom-domain caching for R2 and identifies `r2.dev` as a development endpoint. Explicitly verify caching for GLB, JSON and custom binary objects rather than relying on extension defaults. Configure CORS for asset consumers, expose needed response headers and set `Timing-Allow-Origin` for cross-origin measurements. [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/).

Storage, request and egress costs all matter. Model monthly bytes as new sessions × critical bytes + transitions × cache-miss bytes; origin bytes additionally depend on edge hit ratio. R2 currently lists no direct egress charge, with storage and operation charges; compare current regional/provider costs using the measured workload rather than assuming free delivery. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

Precompressed object serving needs an explicit negotiation/cache-key design; an object bucket does not automatically reproduce the current sidecar middleware. Validate decoded hashes for each encoding, identity ranges, conditional requests and CORS through the chosen edge. Never cache authenticated APIs or WebSockets with public asset rules. A same-origin CDN path can be a transition option, but a self-hosted origin remains exposed to cache-miss bandwidth and availability costs.

Replace the managed Vite preview origin with production static/object serving as part of this stage while preserving the existing managed release workflow. Vite explicitly describes preview as a local preview server. [Vite deployment guidance](https://vite.dev/guide/static-deploy.html).

### 5. Optimize runtime representations where measurements justify it

Evaluate meshopt versus Draco on representative ship, crew and construction assets using total fetch + decode + upload time, not file size alone. Evaluate KTX2/Basis textures with mipmaps for GPU memory and upload cost, and WebP/AVIF for ordinary UI imagery. HTTP Brotli remains complementary. Self-host pinned decoders/transcoders; verify the installed Babylon version and target WebGL2 devices before adopting an extension.

Keep editable Blender originals. Generic optimizer defaults can merge nodes/materials, quantize geometry, resample animation and remove metadata. Preserve mesh selectors, named sockets, skeletons, authored optical materials, animation and gameplay proxy separation. New derived art representations require validation and the relevant publication/art approval; transport-only gzip/Brotli does not alter decoded art. [gltfpack behavior and preservation options](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md).

Large JSON kits deserve a separate parse/heap comparison against existing binary representations and worker-based preparation. Do not resume paused planet art redesign as part of delivery work.

Use the ordinary HTTP cache first. Add a service worker or managed Cache API/IndexedDB layer only if browser measurements show a specific need for resumable downloads, explicit prefetch or offline behavior. Browser storage can be evicted and quotas vary; a custom cache introduces versioning, quota and recovery work. [HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching), [storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

## Acceptance and outstanding measurements

Proposed targets, not demonstrated results:

1. Cold login payload below 1 MB; same-scene warm loads request no unchanged immutable object bodies and need no object revalidation while entries remain fresh.
2. Adding unrelated catalog content increases critical startup bytes by zero. A client-only UI release does not invalidate unchanged art objects.
3. For a fixed starter scene, aim for at least 30% lower p95 authenticated time-to-play relative to the measured baseline; establish an absolute budget after representative hardware measurements. Measure from authorized scene availability separately from human login time.
4. Compare at least 20 cold and warm runs per selected desktop/mobile class, with defined bandwidth/RTT/CPU profiles and actual target regions. Track p50/p95, peak heap, decoded bytes, GPU residency, failure rate and scene transitions. Include old-client/new-release, evicted cache, interrupted fetch, hash mismatch and unavailable CDN cases.
5. Prove unchanged authored materials, both approved bodies and equipment poses, sockets, instance identities and collision/authority semantics. No world publication is needed for transport-only changes.

At 10 Mbps the sampled volcanic kit's transfer floor is approximately 6.13 seconds with the current gzip body versus 4.73 seconds with the existing Brotli body, excluding RTT/decode/render. This is arithmetic for one file, not a prediction of overall game speed. Reducing a 20 MB critical payload to 5 MB would reduce the bandwidth floor from 16 to 4 seconds on the same link; actual feasibility remains to be measured.

## Reproduction and handoff

Inventory the installed release selected by `.runtime/public-client/release.json`, not a rebuilt working tree. Count regular files excluding `.br`/`.gz`, then group by URL subtree and extension. For representative public files:

```sh
curl -sS -H 'Accept-Encoding: br, gzip' -D /tmp/asset-headers.txt \
  -o /tmp/asset-body.bin https://sidereal.dastari.net/assets/crew/components/modular-crew.glb
wc -c /tmp/asset-body.bin
```

Do not use `curl --compressed` when counting encoded body bytes. Repeat for the planet kit and hashed entry above. Use a fresh browser profile and `performance.getEntriesByType('resource')` for login measurements; repeat in the same profile for warm behavior. These observations do not require production credentials.

No changes were made to publication, services, world state or authored assets. No full authenticated waterfall or regional CDN benchmark was performed. Implementation should begin with a detailed first-stage spec and integrate existing delivery work before later stages. The [proposed ADR](adr/ADR-20260921-asset-delivery.md) records the architecture and alternatives.

Validation in the isolated upstream-main worktree: `npm run build` passed world build, binding generation and both independent app builds, with existing Vite chunk/config warnings. It used the already installed SpacetimeDB binary through local tool symlinks; no database was started or published. `npm run check` passed TypeScript and 1,439 tests, with two skipped; one existing test failed because `apps/dashboard/public/reviewed-planets/desert-r014/kit.snp` is absent from the clean checkout. The separate documentation checker reports existing missing linked documents/art ledgers. Both new documents' relative links and staged whitespace were checked. These baseline gaps are not represented as a green aggregate check.
