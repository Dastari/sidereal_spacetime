# UI reference review

Status: **r003 is a suitable reference match** after independent visual review and two rounds of requested refinements. Shared release checks remain the integrating agent's responsibility. This is not owner final art sign-off.

Reviewer: independent agent `/root/ui_reference_review`, 2026-09-08.

Scope: the owner's character, paper doll, stats, vitals, inventory item-frame and action-bar redesign. The owner explicitly authorizes autonomous agent review/iteration and installing the resulting UI in the game. Reviewer acceptance is an implementation quality judgment; it is not owner final art sign-off.

## Reference observations

Both full original images were opened directly with `view_image`:

- `reference/art/ui-elements-5.png`: the primary character/equipment/stats composition, four vitals, framed paper-doll equipment, resistance cards, inventory, and a compact bottom action bar with a separate pair of quick slots.
- `reference/art/ui-elements-3.png`: item rarity and selected states, consistent clipped-edge double borders, useful empty-slot treatment, item counts, structured detail rows, and the compact bottom player/vitals/action HUD.

The shared visual language is translucent midnight-blue glass, restrained blue texture, finely cut corners, bright cyan perimeter rails and divider lines, cool pale lettering, and concentrated bloom on active controls or item rims. It is a dense game interface with clear alignment and generous separation between functional groups. Reference branding and invented legacy mechanics should not be copied into Sidereal.

Observed approximate palette: deep navy `#03162D`, well blue `#062A44`, cyan `#13D7FF`, active electric blue `#2875FF`, pale text `#B9CEFF`. Treat these as visual guides rather than extracted exact pixel colors.

## Acceptance rubric

| Area | Required for a suitable match | Specific failure to avoid |
| --- | --- | --- |
| Panel chrome | Clipped/chiseled outer corners, a fine cyan outer edge, a distinct inner rail with dark separation, blue glass fill, legible section hierarchy. Active tabs visibly brighter than inactive ones. | Uniform rounded dashboard cards, heavy solid cyan fills, glow that washes out labels. |
| Character composition | Character identity/progression and vitals; a prominent full-body equipment preview; labeled surrounding equipment slots; a useful stats view. Existing game model and current Sidereal identity remain recognizable. | A tiny preview lost in empty space, equipment rows visually unconnected to the character, placeholder rectangles taking most of the screen. |
| Item frames | One reusable frame system in inventory, equipment and hotbar. Chamfered/chiseled silhouette; a luminous outer contour and separate inset contour with a clearly darker gutter; edge/corner highlights and a dark icon well. At least common, rare, epic and legendary are visibly represented. | Merely changing the border color of a plain square; coincident outlines that read as one thick stroke; bright opaque item backgrounds; clipping icons or stack counts. |
| Rarity and states | Common silver/slate, rare cyan/electric blue, epic violet, legendary warm gold. Optional green/uncommon is distinct if present. Rarity is also exposed in labels/tooltips, not color alone. Selected/hover/focus remain clear without erasing rarity. | Common and rare becoming identical under cyan glow; selected gold looking like a different rarity; unsupported mechanics implied by frames. |
| Vitals | Four readable mock-data bars: health red, shield blue/cyan, energy yellow, stamina green/teal. Matching icons, explicit labels, current/max or percentage values, and visible dark empty tracks. At least some values are below full to demonstrate filling. | Four indistinguishable cyan bars, fake bars presented as server-owned actual stats, text overlap, values jittering randomly each frame. |
| Stats | A coherent page/group with stable illustrative values, aligned labels and numbers, units or percentages where meaningful. Survival, offense, utility and/or resistances reproduce the reference's organized scanability. Demo status is clear without making developer implementation details the main interface. | Arbitrary unlabeled numbers, incoherent units, flat prose instead of a scannable stat layout, demo numbers changing authority. |
| Holographic disc | Reusable effect below the boots: several thin concentric cyan/blue rings, broken arcs, radial ticks and subtle independently rotating segments; mostly transparent center and floor; soft blue light beneath the character fading outward. Fine electrical traces and concentrated ring bloom support the projected appearance. Character can rotate independently over it. | A thick physical platter or metal pedestal; opaque cyan center; huge opaque glow hiding boots; all rings rotating as one rigid object; orbiting camera instead of rotating the preview character. |
| Projection light | Boots/lower-body presentation catches cyan illumination/reflection or a convincing composited glow. Ring emission remains readable with restrained falloff; animation frames show motion and electrical variation. | A static sticker under an otherwise disconnected character, whole-body overexposure, claiming physical reflection from a still without evidence. |
| Action bar | Compact bottom grouping with recognizable icons, consistent inset slot wells, hotkey badges and counts/cooldowns where appropriate. Two clearly separated quick slots match the reference's adjacent pair. Preserve existing input bindings unless there is a documented deliberate change. | Quick slots visually indistinguishable from the main row, hidden hotkeys, labels overlapping icons, accidental gameplay key conflicts. |
| Usability | Actual game Canvas2D UI; usable pointer and keyboard paths, tooltips/focus, inventory paging/filtering if already available, correct resize/DPR behavior, and reduced-motion handling for ongoing effects. | Implementing only a detached mock page, inaccessible controls, lower-resolution text, layout hiding game controls on the smaller review viewport. |

The primary reference determines the character-page layout and action/quick-slot relationship. The inventory reference gives the stronger close view of item rim construction and detail density. A suitable match preserves these distinctive visual traits while fitting Sidereal's working screen and content; literal reference branding, the exact source character mesh and identical data values are not required.

## Evidence needed for independent review

1. Actual desktop game screenshot with character/paper doll, stats, inventory and bottom HUD visible, plus a second screenshot of any separate stats page.
2. Actual smaller-viewport screenshot and actual inventory frame/detail close view containing all four required rarities, plus empty and selected/focused slots.
3. At least two captured animation times or a short recording demonstrating disc motion, electrical variation and character rotation. Capture reduced motion separately if available.
4. Interaction results for opening/closing panels, switching stats/inventory tabs, rotating the preview, action/quick-slot selection and existing keyboard bindings. Record limitations honestly.
5. Source/evidence paths identifying the candidate under review. Passing checks are useful but do not replace visual inspection.

## Iteration reviews

### Primitive sheet r001 — suitable frame/glyph match

Inspected `output/playwright/rarity-frames/frames-r001.png` directly and read `docs/handoffs/item_frames.md`. This is an actual Canvas2D component sheet, not the integrated game screen.

The frame primitive meets its part of the reference rubric: clipped corners, separated outer and inset contours with a dark gutter, dark icon wells, restrained corner highlights, and five cleanly distinct rarity colors. Common remains silver beside cyan-blue rare; gold and violet are easy to identify. The small hotbar examples retain their contours without a large opaque halo. Empty slots have the correct quiet crossed treatment. Colored heart/shield/energy/stamina and utility glyphs are legible and recognizably close to the reference's icon language.

No blocking primitive revision requested. Integration checks still required:

- Preserve at least the documented 6 px content gutter at the 40 px slot size. Real thumbnails, stack counts and hotkey badges must not paint across the inset rim.
- Preserve rarity under item selection/focus; do not apply a global blue wash that makes the common/gold states indistinguishable.
- Use restrained icon bloom in dense stat rows; the component sheet's glyph halo should not spill into adjacent labels when packed into the actual UI.
- Show rare, epic, legendary and common items with their real imagery and tooltips in the final inventory evidence. Generic cube/wrench placeholders on this primitive sheet do not establish integrated visual quality.

Whole-client layout, live interactions, mock stat labeling, holographic disc and action/quick-slot layout remain unreviewed. This component judgment is neither whole-task acceptance nor owner final art sign-off.

### Integrated character r001 — changes requested

Inspected `output/playwright/character-ui/r001-character-isolated.png` directly. Evidence is the actual 1920×1080 client CanvasUI and Babylon character portrait with isolated-database starter inventory. The visible ship-loader failure toast is retained honestly; this is not a clean live-client acceptance capture.

The primary reference's composition is now clearly recognizable: left identity/vitals/attributes, a large central character with flanking rarity-framed equipment, right grouped statistics and resistances, and bottom action slots with a separate pair of quick slots. Panel rails, glass fill, clipped corners, partially filled colored vitals and frame construction are all strong improvements. The recognizable current Sidereal character is appropriate; reproducing the exact source reference character is not required. The disc is thin and transparent in silhouette, without a metal pedestal.

Required revisions before a suitable whole-client judgment:

1. Fix the clipped bottom captions for carried weight, cosmetic appearance and mock statistics. They currently sit across the scroll viewport's lower clipping edge.
2. At this desktop width, align stat values to the right on the same row as their labels, as in the reference. The current repeated label-then-number stacking reduces scanability despite generous column width. Retain an intentional compact fallback where a smaller viewport actually requires it.
3. Improve the legibility of action icons 1–5. They currently look nearly empty/unavailable beside the bright quick slots. Preserve truthful disabled/unimplemented behavior, but use readable icons and explicit state feedback rather than near-invisible artwork.
4. Refine occupied cosmetic-equipment glyphs into recognizable helmet, visor, shoulder, glove and boot silhouettes. Their tiny generic blocks currently look unfinished next to the actual backpack icon and detailed character. Keep the `Appearance` distinction and do not invent equipped authoritative items.
5. Resolve the ship-model loading failure and inspect a clean game-world capture before claiming live integration complete.

Animation, preview rotation, electric-trace variation, cyan lower-body light, compact layout, inventory interactions and all four rarity tooltips remain awaiting evidence. The still establishes only disc shape and placement, not the effect's behavior.

### Integrated character r002 — desktop visual refinements accepted

Inspected `output/playwright/character-ui/r002-character-ready.png` and `output/playwright/character-ui/r001-inventory.png` directly.

The r002 character capture resolves the four visual revision requests: all lower captions are readable inside the panel; desktop stat values share their labels' rows and align to the right; unassigned action icons are legible and explicitly say `ASSIGN`; equipment appearance glyphs now have recognizable helmet, visor, shoulder, gauntlet, belt and boot shapes. The actual equipped carbine appears on the character, in its paper-doll slot and in the action bar. The clean capture no longer contains the ship-loader error toast. The desktop character composition is a suitable visual match for the requested reference direction.

The separate inventory capture demonstrates the reused chiseled frames around actual differently sized owned items, readable rarity distinctions, quiet empty cells and a distinct two-slot quick group. It preserves genuine inventory state rather than fabricating a legendary item to fill the screenshot. A clearly labeled component gallery with a real item thumbnail is an appropriate way to demonstrate the absent legendary appearance.

One remaining targeted check: selected-item details or a tooltip must expose rarity as text. The r001 scanner details shown in the capture contain name, mass and cell size but not `Rare`; the top legend helps color recognition but does not replace the item's own text description. Whole-task acceptance still awaits compact layout, final inventory/detail evidence and actual hologram/rotation behavior.

### Integrated r002 behavior and compact review — compact changes requested

Opened these actual captures directly under `output/playwright/character-ui/`:

- `r002-character-rotated.png`: character has visibly turned to the side independently over the projection; the native carbine, boots and complete disc fit the portrait. The coordinator records a real drag changing rotation from −0.3 to 0.811 radians.
- `r002-combat-stats.png` and `r002-resist-stats.png`: active tabs are clear, categories actually change, values remain readable, and preview-stat labeling remains visible.
- `r002-reduced-motion.png`: static presentation preserves the intended portrait appearance. The coordinator separately records stable portrait PNG output across time and a changed frame after manual rotation.
- `r002-hud.png`: actual loaded game world, four legible mock-data vitals, main action row and distinct quick-slot pair. Mock vitals are explicitly labeled `Vitals preview`.
- `r002-inventory-quick-inspect.png`: real medkit inspection displays `Common` alongside mass and cell dimensions, resolving the missing rarity text observation.
- `r002-compact-character.png` and `r002-compact-stats.png`: actual 700×580 compact layouts, with the two failures below.

Also read `docs/handoffs/holographic_portrait.md` and the actual browser output `output/playwright/holographic-portrait/quality.log`. The component evidence records transparent corner alpha zero, changed animated frames, static reduced-motion output, and safe close/disposal checks. The effect is an analytic zero-thickness quad with separate subject lighting, a fading reflection and emissive bloom, not an opaque platform. These component results support the integrated visual evidence; they are not a claim that a still alone proves animation or physical lighting.

Desktop behavior evidence meets the relevant rubric. Compact layout still requires r003:

1. A stale selected-medkit footer remains after inventory closes and obscures both the compact character and compact stat pages. Dismiss item details explicitly, and clear their active selection when the last inventory/details context closes so they cannot cover an unrelated character view.
2. The fixed portrait height is clipped by the short character viewport, hiding the lower body and projection. Fit the complete character/disc and rotation affordance inside the compact preview region. Keep intentional scrolling for secondary stats/equipment rather than demanding every panel fit at once.

No final whole-task judgment yet. Review the corrected compact screenshots and the labeled real-thumbnail rarity gallery next.

### Integrated r003 — suitable reference match

Final independent visual judgment: **suitable reference match; no further blocking UI refinements requested**.

Opened the final artifacts directly under `output/playwright/character-ui/`:

- `r003-character-desktop.png`
- `r003-inventory.png`
- `r003-compact-character.png`
- `r003-compact-rotated.png`
- `r003-compact-stats.png`
- `r002-frame-gallery.png`

Also inspected the actual browser capture/action output at `.runtime/art-library/character-ui/r003/final-browser.log`. It records rotation changing from −0.3 to 0.2235987756 radians through the compact arrow control, successful item-detail dismissal, cleared selection when the last inventory window closes, and the final loaded Wayfarer/ready-connection state. Action and quick-slot accessible labels include the assigned item names and rarity text.

Both compact blockers are resolved. The entire character, boots and thin projection now fit the short portrait region, with rotation controls immediately below. The rotated capture preserves framing. Scrolling reaches the compact statistics without a stale inventory footer obscuring them. Some secondary equipment, attributes and resistances remain intentionally scrollable at 700×580; this is an acceptable responsive layout, not clipped inaccessible content.

The final desktop retains the accepted composition, legible stat rows, four distinct partially filled mock vitals, recognizable equipment glyphs and current native character/equipped weapon. The scanner detail explicitly says `Rare` and has a working dismiss control. The separately labeled presentation gallery demonstrates common silver, rare cyan, epic violet and legendary gold using the production frame primitive with published item images; it does not misrepresent those examples as owned inventory. Double contours, chiseled corners, rarity retention through focus/selection, and empty/disabled states remain readable at actual hotbar size. The separate two-slot quick group is clear in both viewport sizes.

The previously reviewed unchanged hologram effect supplies the requested projected-ring appearance, transparent center, radial detail, counter-rotating/electrical animation, cyan lower-body illumination, faint reflection and bloom. Integrated rotation and reduced-motion evidence complement the component transparency/motion checks. The result fits the requested reference direction while retaining Sidereal's actual character and inventory data.

Acceptance scope is the implemented UI presentation and the documented interactions. Mock values remain labeled and are not approved game balance or implemented authoritative stats. This review does not create owner final art sign-off, deployment evidence, a whole-game performance claim, or a passing shared build/test result. The coordinator reports a newer concurrent crew-pose test failure after an earlier full passing run; that separate release gate must be resolved or reported explicitly and is not concealed by this visual acceptance.
