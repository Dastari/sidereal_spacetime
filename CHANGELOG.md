# 0.5.0 — System map editor candidate (2026-09-15)

- Add Creator `/map` with metric chart, celestial movement, live ships, spherical systems and space backgrounds.
- Author box, ellipsoid and concave polygon asteroid volumes with seeded density, radius and resource occurrence controls.
- Validate privileged edits atomically, preserve ships, record source/revision checks and before/after history; expose nearby visual asteroids without resource metadata.
- Correct LFS attributes for canonical native JSON payloads and replace an obsolete smoke assertion with the pinned current celestial chart.

# Changelog

## 2026-09-15 — Genesis reviewed native planets (dashboard/render 0.2.1)

Genesis now defaults to all 28 reviewed Blender planet and moon variants, including selective transparent ice shards. Selection and seeded composition use validated worker-owned assets, shared PBR materials, precompiled retained LODs and ready-only replacement. Preserved the procedural editor as a separate mode. Added exact catalog/provenance, lossless bounded payload packaging and worker/NullEngine lifecycle tests.

## Unreleased — Wayfarer exterior armor native r004

Added separate Blender-authored exterior armor with broad paired bays, recessed cassettes, wrapped ribs and fitted bow returns. Fine surface details use shared color, normal and roughness maps. The 46-model final-03 family passes native checks and independent comparison of 14 native and 8 exact game-renderer images. Sources, compressed exact exports, validation and review evidence are retained in the art library. This is a review candidate; the installed ship and physical interfaces are unchanged.

- 2026-09-15: Render/dashboard0.3.0: native yellow-main-sequence star r007 passes independent Astra reference working review; animated shared flares, optically thin corona, warm-light evidence and NullEngine lifetime tests. System integration pending.

- 2026-09-15: Render/dashboard 0.3.1: Genesis planet view now includes the reviewed Yellow Main Sequence Star, active flares, star-specific controls, verified cancellable GLB loading, and restored planet illumination when switching bodies.

- 2026-09-15: Client 0.2.0, render/dashboard 0.3.2: stage exact reviewed planet and star assets independently from shared versioned celestial payloads; preserve public URLs and asset hashes.

## 2026-09-15 — Authored solar system and active stellar plasma

Added a 29-body authored celestial layout with owner-scaled radii and travel gaps, reviewed native planet/moon rendering, bounded retained LODs, distant stellar radiance and large-coordinate camera support. Added a guarded server-scheduled celestial-only migration, validated against an isolated copy of the deployed authority version; live publication remains pending game-view checks. Native r010 and plasma-r012 replace the rejected pale checkerboard/red annulus with orange-gold material regions, connected selective white-hot paths, a turbulent blended corona and shorter, broader active flares. Independent Astra original-atlas review and actual alternate/bloom-off/playback evidence qualify this revision for owner comparison; hardware timing and owner final approval remain unclaimed. Restored the two rendering helpers already referenced by upstream and added renderer startup error diagnostics.


## 2026-09-15 — Dynamic stellar relief (render/dashboard0.5.0; client/root0.4.0; content/net/world0.2.1)

Native r013 replaces permanently fixed sunspot basins with5,762 editable hexagonal/pentagonal closed tiles. Shared native PBR plugins animate rigid tile heights, drifting/dissolving dark complexes and connected hot regions without per-frame geometry generation. A wider orange corona carries rare curling eruptions with quiet intervals; retired small persistent flare actors are absent from the new native export. Genesis frames the expanded effect. Added compiled-shader regression for the vertex injection initialization defect, stable topology/shared-material checks and native byte-budget/UV/semantic tests. Actual software-browser playback and close/alternate/bloom-off evidence are saved as plasma-r018; hardware timing and owner final signoff are not claimed. Solar seed appearance now pins r013; its new hash requires isolated migration revalidation before live publication.
