# Qualified Wayfarer walking review

Status: complete pinned visual template spawned twice in an isolated authority database; conservative walking and native rendering integrated. Not a live refit, functional ship, approved damage/pressure system, or final art acceptance.
Updated: 2026-09-10.

## Exact candidate and qualification

The source remains the canonical candidate in `wayfarer_semantic_conversion_candidate.md`, SHA-256 `362f37217f63a44a470676f104c8368bd0973ca03f5e29eab190bc4d6df71340`. No Blender geometry, equipment identity, native floor transform or live ship was modified.

`packages/content/src/wayfarer-walking-proof.json` contains all 211 nonfloor placement bindings. The reproducible qualifier reads 28 exact installed GLBs, including retained legacy `parts.glb` (`e45b79a8d40ca46124a51e4d5e24f89d0b00a0361989766e54b64deb8ad6999f`). It reads actual POSITION accessors with native node transforms; it does not use catalog bounds or sampled voxel proxies as collision truth.

- 98 objects have conservative outward octagonal support covers derived from all their projected native vertices. The 1 μm numerical expansion is explicit.
- 74 objects are wholly outside the standing vertical interval 0.1875–2.4375 m, proven by transformed native vertex extrema.
- 39 objects have zero projected intersection with the union of supported nominal floor polygons. Only those two geometric exclusions yield empty obstacle bindings.

These are conservative whole-object covers. They may close legitimate gaps between components. They never claim such gaps are passable. The actor envelope is radius exactly 0.3 m and positive height at most 2.25 m. Partitions23/24 also have a finer separate 768-native-vertex convex-cover proof with exact nominal-floor support containment. Neither cover is a load rating or pressure seal.

Reproduce:

```sh
npx tsx scripts/prepare_wayfarer_conversion.ts
python3 scripts/qualify_wayfarer_cockpit_partitions.py
python3 scripts/qualify_wayfarer_walking.py
npx tsx scripts/review_wayfarer_walking.ts
```

The Python qualifiers default to checking the committed proof. `--write` explicitly rewrites the proof after inspection. They never publish assets or mutate a database. NumPy is the existing local dependency of the batch native-transform inspector.

## Authority wiring and persistence

`qualifiedWayfarerWalkingBindings` admits only the exact canonical snapshot and actor envelope. `construction-instances.ts` selects this trusted provider on the server; reducers accept no client collision definitions. A different blueprint retains the existing safe spawn requirements.

`qualifiedWayfarerInstanceObstacles` reconstructs the exact source through the authority's saved deck/floor/object UUID map, restores source metadata, recompiles and checks the canonical hash. It rejects altered transforms, source bytes, missing or duplicated mappings and unqualified damage. `construction-doors.ts` uses it when building cached runtime movement collision. Thus collision remains after instance UUID remapping and reload; it is not merely a spawn-time check.

No schema/index/authentication changes are part of this slice. Existing operation IDs, blueprint revision checks, workspace grants, review-entry control and safe review-exit remain authoritative. The original actor, equipment and cargo state survive review visits.

## Real isolated server evidence

Database: `sidereal-spacetime-dev-wayfarer-semantic-20260910-smoke`.

- Actor: `babceca2-d1d9-455e-8902-94248434a6db`.
- First instance: `421ace6c-20a6-48f4-b68a-7382d20c2219`.
- Second instance: `d2d1d0ca-f8e9-4335-8c53-8260778795e1`.
- Original ship: `b57b30c3-6fc7-485d-9c2e-1006b27b4e67`, original position `(0, 10.25)`.

The real provider PKCE session bound its game proof, acquired normal authoring grants, saved/published the exact document, and spawned both copies. Replaying each spawn operation did not duplicate an instance. Each copy has 264 independent allocated IDs: one instance, one deck, 51 floors and 211 objects. The two copies share only immutable asset identities.

Normal input walked from spawn `(-2,-2)` through `(-2,-1.5)`, `(0,-1.5)`, `(0,0)`, `(0,7)`, `(0,8)`, `(-1.8,8)`. Continuing toward the actual rear partition stopped at approximately `y=8.3169989`. Both visits returned through the existing safe exit to the original ship/position. Character UUID, appearance and every inventory snapshot were unchanged.

Evidence: `.runtime/wayfarer-authority-review/{fixture,journey,role-denial,credential-cleanup}.json` and `run.log`. Temporary construction-admin role was revoked, a freshly refreshed provider token failed the administrator operation, the helper's provider session was logged out and its ID/refresh files were deleted. Other browser/provider sessions were untouched.

The initial standard smoke run published this named database but failed its legacy `persistent lab bodies` assertion under concurrent shared-world changes. The dedicated Wayfarer provider journey passed. Do not present the generic smoke as passed until its corrected isolated rerun is recorded by the release owner.

## Renderer

`construction-authored-assembly.ts` adds all 211 visual objects beside the existing 51 semantic native floors. Each exact GLB is byte-hash verified, loaded once per local library, and selected by native node prefix or the existing catalog's legacy node list. Every spawned placement has its own UUID root; native node transforms, material channels, transparent parts and shared geometry remain intact.

Roof/collar placement roots hide for interior viewing and restore in exterior viewing. Legacy cutaway mesh layers respond to camera side. No glass material is overwritten merely to fade a wall. The doorway frame remains visible; there is no invented door animation. Instance-owned imported containers dispose after their clones; the parent scene node survives adapter disposal.

Two actual-GLB NullEngine tests verify all 211 placements, 28 libraries, independent IDs, source transform mapping, material retention, 73 roof toggles, no duplicated floor objects, rejection of altered catalog bytes and cleanup. The real browser review is owned by the coordinator and is not claimed by these tests.

## Remaining clearances and functionality

Offline quarter-metre reachability found 922 standing grid points, of which 816 connect to the selected spawn. Main, aft and forward corridor probes are reachable. Some room openings are conservatively blocked by whole-object covers. The bridge sill is a real 31.25 mm step, with 2.09375 m clearance above it; current flat-deck authority cannot step over it. The pilot seat's center is correctly occupied geometry, not an ordinary walking destination. A seated approach/support transition needs separate qualification.

This is sufficient for a complete static visual template review and safe conservative walking. It does **not** allocate functional cargo containers, medical beds, reactors or control stations. The four cargo containers are independent visual placements only. No live contents are copied, no starter kit is duplicated, and no item/fitting health, thrust, mass, capacity, air or power is invented. Qualified functional instance allocation and multi-deck rebuild remain the next work.

## Coordinator browser review — 2026-09-10

The ordinary Dastari review account entered the first qualified instance via the actual review button. Scene readiness passed with all native parts rendered. Evidence under `output/playwright/wayfarer-browser-review`: `entry.png` shows cockpit, interior furniture, floor and outer armor; `walk.png` and `walk.json` record real W-key movement from (-2,-2) to approximately(-2.2746,-0.7746); `roof.png` records Tab restoring the roof/exterior view. The return button removed the visit and restored the original ship. The browser account was signed out, blanked and closed. No native visual source was altered.

Room-specific floor colouring is not present in the pinned floor variants; the authored grey mapped surfaces are retained. This is a future semantic theme/decal feature, not lost imported material. The 31.25 mm bridge sill remains a conservative walking barrier pending a qualified step-over rule. Complete visuals and ordinary corridor walking are accepted for this static review slice; functional cargo, piloting, physical airlocks and complete multi-deck gameplay are not claimed.
