# Wayfarer separate exterior armor — native r004

The corrected candidate is **hull/final-03**, with **library-03** as its lossless
shared GLB export. It adds a separate armored shell: stepped navy shoulders and
impact rails, wrapped pale ribs, recessed cassettes, broad paired bays, and fitted
front armor. Fine seams, bolts, markings and shallow relief use shared color,
normal and roughness maps; deep recesses and silhouette features use geometry.

[Whole ship](browser/final-03/concept.png) · [Bow](browser/final-03/bow.png) ·
[Joined bay](browser/final-03/joined.png) · [Armor only](browser/final-03/armor.png) ·
[Structure](browser/final-03/bare.png) · [Exploded](browser/final-03/exploded.png)

The target is the accepted [Wayfarer concept](../../hull-voxel-study/wayfarer-layout-concept-r001/proposal.png).
The result is cleaner and less densely detailed than that proposal. The native
and exact browser suites passed [independent final review](../armor-correction-review-20260914/final-03-review.md).
This is not final owner artistic approval, a live release, or completion of the
larger Shipyard contracts.

## Dimensions and family

Each side member has an independent 2 m attachment span, standard height 3 m,
and outward X in [0, 0.5] m. Two members form a broad 4 m visual bay. `left` means
lower local Y, `right` higher local Y. `-port` changes UV orientation for existing
reflected placements; geometry, sockets and poses remain identical.

The 46 native models cover plain, red-service, vent, utility and identity sides
as single and paired members in both orientations; plain 1 m/0.5 m widths and
0.75/1.5/2.25 m heights; and six front profiles. Small examples keep fixed physical
features instead of stretching a finished mesh. The front profiles use the frozen
inherited bounds in `scripts/art_library/armor_cassette_interfaces.json`.

ARMOR and LINER are distinct named export groups. Interior wall artwork, engines,
thrusters, plume, collision, pressure, damage and authority are outside this pass.
The authoritative inward 250 mm structural wall and live native pins are unchanged.

## Review and verification

All 46 GLBs / 33,640 triangles pass native hash, bounds, socket, normalized-normal,
finite, nondegenerate triangle, map/UV, semantic group, handedness and mating
checks. Ten paired variant/handedness families retain owning half-spaces. Cyan
front triangles have no competing opaque surface and at least 15.625 mm housing
clearance. Both fitted bow contacts have 0.04826956 m² shared area without crossing
the neighboring owning space. See `hull/final-03/validation-mating-and-lights.json`.

Fourteen neutral imported-GLB Blender captures and eight exact game-renderer
browser captures are saved with hashes, cameras and source provenance. The browser
uses all 28 intended new placements with zero older-hull fallbacks or missing
required variants, and reported zero page errors. It uses a qualified pure fixture
through the actual construction loader, including explicit armor/bare/exploded
inspection modes. It does not exercise login, movement, live publish/refit,
pressure or damage authority. Frame timings are isolated CPU samples, not a
comparative hardware benchmark or publication performance gate.

`delivery-validation/checks.json` records the exact native PR checks. On untouched
upstream main and again with this pass, project `check`/`build` fail on inherited
missing renderer modules; `art:check` fails on absent historical Blender sources.
The art PR does not import unrelated shared changes to conceal those baseline
gaps. No authority smoke is claimed because no authority code changed.

## Open and reproduce

The repository carries the exact 46 standalone exports in `models.tar.xz` to avoid
repeating embedded atlas bytes in Git LFS. All extracted bytes were validated
against the native manifest. The editable Blender source and external maps are
available directly, as is the 5.96 MB shared `library-03/hull.glb`.

```sh
tar -xJf assets/art-library/framed-wayfarer/r004/hull/final-03/models.tar.xz -C assets/art-library/framed-wayfarer/r004/hull/final-03
python3 scripts/art_library/check_armor_cassette_hull.py assets/art-library/framed-wayfarer/r004/hull/final-03
```

Author into an unused directory; never replace the reviewed candidate:

```sh
python3 scripts/art_library/armor_cassette_hull.py --out .runtime/armor-full-reproduction --full
python3 scripts/art_library/check_armor_cassette_hull.py .runtime/armor-full-reproduction
python3 scripts/art_library/render_armor_cassette_hull.py .runtime/armor-full-reproduction
python3 scripts/art_library/pack_armor_cassette.py .runtime/armor-full-reproduction .runtime/armor-packed-reproduction
```

The default recipe without `--full` produces the six-model prototype. Blender is
selected by `dev.toml` and runs with four threads. The frozen interface fixture
makes native authoring independent of the earlier uncommitted runtime catalog.
Whole-ship reproduction additionally needs the exact runtime source and asset tree
recorded in `browser/final-03/bundle-provenance.json` and its explicit bindings and
fixture. The browser helpers accept that source directory; this native PR does
not silently include or replace that earlier runtime integration.

## Preserved iterations

| Attempt | Result |
| --- | --- |
| proof-01 | Shoulder exceeded its inherited bound; export check failed. |
| proof-02 | Paired reveal exceeded its owning span; export check failed. |
| proof-03 | Dimensional check passed; visual review rejected cap/rail overlap. |
| proof-04 | Interrupted during the memory incident; no completed candidate. |
| proof-05 | Corrected rails/caps passed independent native and game-loader prototype comparison. |
| final-01 | Complete family passed dimensional checks; visual review found light overlap, diagonal UV crossings, missing single emblem and bow gap. |
| final-02 | Visual repairs authored; strict triangle check rejected a bevel sliver on the narrow bow return. |
| final-03 | Planar mating return retains adjacent chamfers; strict native checks and complete browser captures pass. |

Every meaningful native attempt remains preserved in the shared art library.
The PR carries the current editable/exported candidate, comparison images and
review/hash records; historical standalone exports remain local archive history.
No earlier approval is transferred to this candidate.
