# Wayfarer semantic rebuild r002 — review candidate

Date: 2026-09-12. Status: layout compiles; publication, native substitution and game activation are incomplete. This is a concrete design candidate, not a qualified live template. No existing code, assets, catalog, authority, inventory or live ships were changed by this audit.

The candidate is generated with `npx tsx .runtime/shipyard-completion/wayfarer-rebuild/prepare.ts`. Outputs in that directory are `layout.json`, `document.json`, `placement-map.json`, and `report.json`. The report records SHA-256 input pins and exact compiler/preview results. Root integration owns adoption and qualification.

## Geometry and retained identity

The 51 original semantic floor placements retain all stable IDs, polygons and deck coordinates. Their union is still the original 10 × 22 m structural envelope, X −5 to +5 m and Y −9 to +13 m. Both diagonal bow floor patches remain structural support and now carry explicit nonwalkable reservations. Exterior armor and engines retain their original transforms; their overhang does not enlarge the floorplan or navigation bounds.

The standard vertical profile is floor 0.1875 m, clear height 3 m, roof 0.125 m and service void 0.1875 m, for a 3.5 m pitch. This deliberately does **not** stretch the swept canopy. Its lower legacy height is retained as an explicit native boundary/cockpit-roof exception awaiting clearance/substitution integration.

The placement map accounts for every one of the 262 source identities:

| Disposition | Count |
| --- | ---: |
| Retained semantic native floors | 51 |
| Retained equipment/container placements, original transforms | 21 |
| Retained exterior/engine interface placements | 39 |
| Retained explicit cockpit boundary/frame/partition variants | 15 |
| Retained cockpit/context roofs and collars | 6 |
| Old walls replaced by semantic boundaries | 60 |
| Old standard roofs replaced at the new roof datum | 67 |
| Old ceiling decorations removed | 3 |

All retained records include exact asset IDs, native visual URL/hash metadata and source transforms. Old non-pilot wall placements are absent from the candidate assembly; there is no undeletable duplicate legacy main wall layer. The 15 retained cockpit records are individually editable placed objects awaiting explicit boundary binding; retaining them does not claim the substitution adapter exists.

## Editable arrangement

A 4 m central passage runs between X −2 and +2 m. The two side room wings have semantic corridor partitions, horizontal dividers and eight explicit 1 m passage openings. Port preserves engineering, hydroponics and storage; starboard preserves crew, medbay and lounge. Forward service spaces, bridge and central corridor have labels. Original furniture/container centres remain unchanged. These are proposed room boundaries close to the original equipment zoning, not inferred exact replacements for every irregular legacy wall mesh.

Five `cockpit-glass` overrides reference the actual perimeter spans from the cockpit audit: two straight sides, two diagonal cheeks and the nose. The report maps each span to its exact low sill and glazing placement pair. Buttresses, frame22, and two rear partitions are separately retained native structures. Frame22 remains a frame/passage, not a functional airlock or sealed door.

## Executed readiness checks and actual gaps

- `readLayout` accepts the document; `compileLayout` returns valid with **zero errors**.
- `bindConstructionLayout` matches **all 51 floors**, with no unmatched polygons.
- `compileConstruction` rejects it with `Boundary-treatment native installation adapters are not yet qualified`. This is the correct authority gate; it must not be removed to ship this template.
- `planLayoutInsetVisuals` rejects retained assembly with `Retained assembly requires explicit native substitution mapping`.
- A diagnostic-only copy without retained assembly or cockpit overrides still cannot render all walls: the current complex-family fallback rejects internal partitions/openings. Its error is `Complex native walls currently require a closed opaque perimeter without internal partitions or openings`. This diagnostic copy is not the candidate.
- Subgrid room labels currently follow whole floor tiles, so warnings say named areas share an unpartitioned region. They do not establish sealed room topology or pressure.
- The report includes a replacement roof placement proposal at Z 102/32 = 3.1875 m for main floor modules. It is not yet bound into the construction document. Generic `roof` remains false to avoid covering the retained swept cockpit with an unqualified flat roof.
- Old main roof origins at 2.5625–2.6875 m intersect a new 3 m clear deck, so retaining all old roofs is not acceptable. Raising the cockpit likewise requires new art/clearance qualification and was not done.
- Retained equipment is still exact native assembly placement, not guessed `LayoutFitting` metadata. Root integration must connect actual fitting/container definitions by stable ID, preserving live resources and UUIDs on refit. No live inventory contents were copied.

The next integration must qualify explicit native substitutions, partition junctions/opening spans, replacement roof coverage, swept-canopy/navigation clearance, exterior support interfaces, and stable fitting bindings. Only then can an immutable template pass authority and an expected-revision live refit be reviewed. No browser or game evidence is claimed by this audit, and no contract is marked complete.
