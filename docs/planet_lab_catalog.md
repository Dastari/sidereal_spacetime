# Distributed planet observation laboratory

Status: Normal publication, authority smoke and live catalog Observe/Return acceptance passed; final family texture review remains separate
Date: 2026-09-08

The private test lab now seeds all ten procedural planet families and one mixed temperate/volcanic world. Existing Pelagic, Amethyst, Ivory Star and four asteroid IDs/positions remain intact. New destinations span several kilometres instead of crowding the starter ship. Their height remains visual depth, not vertical gameplay or a collision grant.

| Destination | Family | World XY metres |
| --- | --- | --- |
| Pelagic | Temperate | -120, 210 |
| Amethyst | Gas giant | 38, -28 |
| Azure Ocean | Ocean | -1800, 2400 |
| Dunes Desert | Desert | 2600, 1700 |
| Basalt Rock | Rocky | 4200, -900 |
| Frost Ice | Ice | -3400, -2400 |
| Cinder Volcanic | Volcanic | 1700, -3800 |
| Viridian Toxic | Toxic | -4800, 1100 |
| Prism Crystal | Crystal | 5800, 3200 |
| Companion Moon | Moon | -2600, 4100 |
| Ember Garden | Temperate with volcanic zones and smoke | 6800, -4200 |

The client requests the existing idempotent `enterLab` path when an admitted character lacks the new celestial catalog. The reducer supplies authored rows, IDs, seeds and positions; clients submit none of those values. Existing bodies retain UUIDs and momentum. The `ownSpaceBodies` view continues to restrict every row to its private laboratory, with server-derived asteroid range. Celestial destinations in this test lab are admitted at any distance.

The Map destination picker paginates its full list, with Observe and Return controlling only the presentation camera. Surface, atmosphere, rings and composable effects resolve from one validated recipe selected by the server-authored appearance key. `temperate-volcanic` uses 15% volcanic coverage, 12% smoke and emission 2. No live recipe editing, planetary landing or shared-world discovery is claimed.

Isolated authority smoke passed with all 16 bodies (11 planets, one star, four asteroids), unchanged UUIDs after repeated entry, cross-actor privacy, and the existing collision/flight/inventory suite. Normal publication then passed without a database reset. The actual tailnet client subscribed to all 16 bodies and reached all 12 destinations across pages of 5, 5 and 2, including Companion Moon and Ember Garden on the last page. Observe displayed the actual Ember Garden at 7.99 km and Return restored the original ship camera. Full subscribed character, ship and inventory-item rows were identical before and after, preserving character/item UUIDs, hand/back equipment and authoritative position. Evidence: `output/playwright/ui-catalog-last-page.png`, `ui-catalog-observe-ember.png` and `ui-catalog-return-ship.png`. The software-rendered review used bounded presentation frame stepping. This accepts catalog access and camera-only observation; final family texture comparisons remain a separate visual gate.
