# Installed interim pilot hull r001

Owner explicitly authorized publication as an improvement while requesting a further reference-matching pass. No final design approval is claimed.

The published default has 34 native hull placements and all17 prior equipment placements. Exactr001 GLBs andeditable source are preserved; the2:1 sample is catalog-only. The old pointed visual bow is retired; existing outboard armor throughY9 supports unchanged thruster mounts. Existing gameplay proxies remainunchanged. All new hull placements pass actualoccupied-cell validation against the complete defaultship.

Actual live Shipyard screenshot: [shipyard-live.png](shipyard-live.png). Shared game-renderer exterior/interior via actualdashboard `/models`: [exterior](world-exterior.png), [interior](world-interior.png). The latter captures use camera/roof visibility overrides and hardwareScale2 forsoftware-renderer stills; they are not authenticated client gameplay captures. They confirm51nativeplacements,150hullmeshes and scene readiness. Browser required severalminutes forinitial worldasset/materialwarmup; no performancecode changes made.

`npm run check` passed145tests and47documentationchecks; build andartchecks passed. Allold equipmentidentities/transforms/proxies preserved; unrelated renderer typeerror previouslynoted is now fixed byseparate work.

Publishedmanifest: `assets/runtime/assembly/hull-manifest.json`. Runtime publicationauthorization and exactrevision independent of pending r002 design review.

## Placement correction

The captures above preserve the initial, incorrect Y5 attachment. The owner identified that it cut into the main cabin. Integration revision 2 moves the exact r001 hull to the main hull front at Y9, and moves the four existing pilot fixtures +4 m without changing their IDs. The authoritative station moves from Y6 to Y10 on authenticated re-entry; the deployed migration preserves occupancy and clears stale movement. See `../placement-correction/` for corrected evidence. The r004 compact design remains unpublished.
