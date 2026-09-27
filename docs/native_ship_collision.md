# Native R006 ship collision alignment

The installed Blender hull remains visual art. Its approved floor and structural cross-sections informed this explicit laboratory authority fixture; no render bounding box, camera mode or client transform controls collision.

## Corrected walking boundary

The old bow permitted crew centres up to X ±4.325 m and diagonal |X|+Y 15.200736 m. The installed R006 straight bridge sides instead stand at X ±3 m, and its diagonal outer line is |X|+Y=14 m. The old fixture also omitted the rear bridge bulkhead and its single doorway.

`packages/content/src/pilot-layout.ts` revision 3 applies a conservative standing-crew canopy clearance, sampled at assembly height 2.25 m: structural seals intrude .732 m, and the planar crew radius remains .3 m. This gives straight centre limits ±1.968 m, nose Y≤11.968 m and diagonal |X|+Y≤12.540532 m. The aft laboratory footprint remains X ±4 m, Y≥−8 m. These are deliberate planar collision rules, not vertical gameplay, detailed limb collision or damage geometry.

`CABIN_PARTITIONS` includes the actual combined rear panels and jambs: X[-2.625,−.625] and [.625,2.625], Y[8.625,9]. Their central 1.25 m opening leaves crew centres ±.325 m. Walking now resolves constrained axes without allowing a narrowed footprint to snap the other coordinate through a wall. Console, room and furniture blockers remain active.

The idempotent revision-3 installer preserves station UUID, occupancy, operational state and inventory. Existing invalid crew positions are moved inside the supported footprint, embedded jamb positions are moved to the nearer side, and stale movement commands clear. Valid station/aisle positions remain unchanged. Normal publication is coordinated separately; an existing live session receives the migration through the server's `enterLab` path.

## External hull contacts

The ship capsule now has radius 5.4 m, half-length 7.125 m and a +1.125 m local-forward midpoint offset. Its centreline spans [−6,+8.25] m, preserving the former aft extent −11.4 m while reaching the new nose at +13.65 m. This conservative capsule is not an exact outline of each glass or armor panel.

The body X/Y still identify the original centre of mass. Mass and inertia are unchanged. Contact lever arms use that centre, and conservative rotational advancement includes the midpoint offset. No graphical mesh participates in contact stepping.

## Verification

On 2026-09-08 at 20:44:15 UTC, `npm run smoke` passed against the isolated smoke database. Added real reducer-driven walking checks prove straight canopy blocking, rear jamb blocking, central doorway passage and the original room partition. Existing flight contact, IFCS, inventory persistence, interaction and combat checks also passed. Typecheck and 32 focused tests passed, covering both side walls, nose, diagonal clearance, no lateral snapping, both doorway directions, migration, rotated capsule nose contact, unchanged aft reach and rotational impacts.

Normal-database walking verification is recorded below; art sign-off remains the owner’s decision. The 2.25 m sampling height covers the tallest optional source bounds (2.04722 m plus the .1875 m deck). No full assembly-to-collision compiler, pressure simulation or per-part damage is claimed.

Following normal non-destructive publication, the real tailnet client passed keyboard-driven checks with the existing Inventory Review character. Repeated right/forward escape input stopped at(1.81019756,10.73033405), whose sum12.54053160 lies on the new diagonal boundary. A rear-jamb attempt stopped atY9.300098. The crew crossed the central doorway fromY9.517 to8.0159, returned to9.5229, and used E to occupy the same persistent helm at(0,10.25). Inventory UUIDs, hand/back slots and backpack contents remained intact. No direct actor transform was submitted. Exact straight/nose boundaries are additionally covered by pure tests; the isolated database also exercised straight-wall contact. The normal client did not bypass the console to force a transom contact.

`output/playwright/native-r006-final-bow-deck.png` records the actual installed finish04 hull, clear glazing, doorway and new tiled floor with the roof cut away. This is live integration evidence, not separate owner approval of an art revision.

The paired actual normal-client image `output/playwright/native-r006-final-roof-flight.png` shows settled Flight with roof visibility1 and the exterior engine meshes still enabled. `output/playwright/native-r006-final-doorway.png` shows settled Deck with roof visibility0 and the crew after walking through the doorway to(−.0126,8.1250). Camera changes remained presentation-only, and occupying the helm did not switch views automatically.

Review cleanup: the character walked back to storage at(−2.43181,2.68611), within .096 m of the original position. Helm occupancy and combat aim are clear, sprint is off, carbine shot sequence remains5 and energy recovered normally to120. Scanner rotation/cell(3,0), pistol cell(0,0), all carried UUIDs and the two original supply-crate weapons were retained. The browser was closed after verification.
