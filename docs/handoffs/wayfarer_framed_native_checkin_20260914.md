# Framed Wayfarer native implementation check-in

Status: native and renderer implementation verified; game and Shipyard visuals live.
No whole Shipyard contract, pressure/damage integration or artistic sign-off is claimed.

The owner accepted the framed whole-ship concept and requested implementation,
including front panels, matching engines and translucent voxel-like exhaust.
The dimensional/architecture contract is `wayfarer_framed_native_spec_20260914.md`.

## Native deliverables

- Hull r002: five 2 × 3 m side bays, five width/height examples, and six front
  replacements preserving the original glazing/profile interfaces. Sixteen GLBs,
  14,668 triangles in the complete library, editable Blender source and packed maps.
  Models manifest `c6f7565964e61d52d24d946bfac3e7fec04b96b0e412ae032cf1105ff89c477c`;
  source `b2a07d7bac8fa85a039c4e4b84446b1bbb563061d6ede3efdb7c76b7fc69eb3b`.
- Engine r003: six canonical native definitions cover nine placed drives. Main
  engines have 2,096 triangles; compact thrusters 632. The six physical envelopes,
  all nine placements and nozzle anchors remain unchanged. Sources/GLBs are under
  `assets/art-library/framed-wayfarer/r003/engines`.
- Exhaust: three nested stepped translucent shells per nozzle, bright narrow core,
  27 meshes, three shared materials, no added lights. Achieved output controls size
  and opacity; missing/invalid output disables the effect. It is luminous additive
  transparency, not refractive glass. Caller telemetry expiry remains unchanged.

All native GLBs pass independent byte, bounds, unit-transform, socket, nondegenerate
triangle, normal and embedded-map checks. Meaningful attempts and original r001
sources remain preserved. The unchanged dimension caps and metric texture density
are demonstrated in the native size variants; this does not qualify new physical
pressure/collision adapters or make every size a published editor catalog entry.

## Integration and evidence

Thirty explicit visual bindings cover eighteen r005 side definitions, six front
definitions and six engines. Original catalogs and construction/native physical
pins stay unchanged. Local game and Shipyard use these surfaces after source checks.
The public-stock renderer uses qualified r005 side poses, keeps nine engine poses,
excludes legacy engine duplicates and retains the seven-piece filler exclusion.

`assets/art-library/framed-wayfarer/r001/plume` contains six dark/bright throttle
captures, opposite-angle views, opaque occlusion and an all-nine fixture. Actual
browser draw counts are 27, or zero after clearing output. Reversing transparent
mesh order changed no pixels; a full orbit returned pixel-identically. Bright
backgrounds saturate the small inner core to white while outer volumes stay clear.

`assets/art-library/framed-wayfarer/r001/assembly` contains six actual game-loader
views of the qualified instance fixture, including bow, engines/plume and top.
This is browser/game-renderer evidence, not a server-authorized gameplay session.
No live database, player resources, transforms, cargo, crew, power or thrust were
changed to create the fixture. Browser application errors were zero; software GPU
ReadPixels warnings occurred during screenshot capture.

The first resource audit found excess duplicated materials from separate GLB
imports. Exact native buffers/maps now use two losslessly packed shared libraries;
rigid engine primitives retain material slots in one placed mesh. Unrequested
prototype geometry is disposed after every requested library group resolves.
Existing resource caps pass unchanged. The historical public r005 selector also rejected its valid
delimiter-terminated mesh prefix; the construction loader now uses the existing
tested `nativeMeshInGroup` helper. A fair old-art benchmark applies only this
selector correction to the old renderer and identifies it explicitly.

The final fixed-camera comparison at 1200 × 825 WebGL2 uses five warmup and ten
measured frames per view. Front draw calls fall from 457 to 328; rear from 479 to
350. Median render submission CPU falls from 3.7/3.6 ms to 2.4/2.5 ms respectively.
Both pass the 10% regression gate. These are CPU submission measurements on
SwiftShader, not a claim about hardware GPU frame rate. Exact results and final
candidate captures are in `r001/assembly/{performance,browser-review,manifest}.json`;
earlier captures remain in `before-shared-kits`.

Runtime library pins:

- `/assets/assembly/native/framed-wayfarer/runtime-r001/hull.glb`:
  `c1be29990fc65fc60fe89989c4c9dac74072578fa9e3c44db7cd41c536f280b3`.
- `/assets/assembly/native/framed-wayfarer/runtime-r001/engines.glb`:
  `3236a0175f567760c0b4307931e475f492224b5d607ab771a558685d583fc54c`.

Both are byte-verified on the normal HTTPS dashboard after its managed asset refresh
and restart. The previous running Vite public-file index returned the SPA fallback
for newly copied assets; `stop-dashboard` / `up-dashboard` corrected delivery.

The normal unrouted Shipyard imported the qualified 74-component local draft,
displayed the new Hull, Front and Objects views, and reported no console errors.
Actual viewport selection of the identity panel and an inspector Height edit from
0.1875 to 0.21875 m moved exactly one native node by 31.25 mm, preserved geometry
and all other placements, and Undo restored the complete placement list. There
was exactly one canvas. Two existing inward-wall native-fit notes remain; this
surface update does not resolve or conceal those separate qualifications.

The frozen candidate's actual `createHullViewport` also passed separate whole,
bow and engine browser captures with one canvas and no page errors. Its existing
API predates the current shared UI's measurement methods, so substituting that
viewport directly into the newer UI produced a harness API mismatch. That attempt
is preserved; no compatibility shim or runtime source alteration concealed it.
Acceptance separates the matching frozen viewport fixture from the normal
unrouted, newer editor UI interaction proof.

Frozen Shipyard report `r001/shipyard/REVIEW.md` SHA-256
`22ddc097214e5099d43a49f177cb7dc5ac5a6b50d8012829b7290fd769975c79`,
browser record `4a3fb0791997effa6532e0311ba12e0a2cab6cbb3de438f571f8eb741de09abc`.
The post-release public browser entry displayed normal Dastari sign-in with zero
page errors or failed requests. No login was attempted, so this is an entry/delivery
smoke, not authenticated gameplay acceptance. Both named review browsers are closed.

## Candidate, ownership and remaining gates

Entry HEAD `0de90fe8913bd84db1a9e7f32aefd91b0d7690c8`; the complete dirty list, original
native pins and selected backups are in `.runtime/shipyard-completion/wayfarer-framed-20260914`.
No staging, reset, cleaning or restoration of other owners' work occurred.

The release candidate is `/root/wayfarer-framed-r001-candidate`, based on the previous
public-client source `/root/ifcs-input-fix-20260914`. It carries only the listed
cosmetic changes and patch versions, preserving the other owner's unfinished
authority work in the shared tree. Test fixtures copied into the candidate retain
their expected hashes; validators and resource limits are not weakened.

Final candidate `npm run check` passes: 325 files, 1,901 tests, typecheck and 88
document/provenance checks. The initial full-concurrency run hit the unchanged
planet test's 20-second timeout; it passed alone and the complete suite then
passed with two workers and the same timeout. `npm run build` and `npm run
art:check` pass. World compilation/generation is verification only; no world
publication occurs. The non-cosmetic source audit preserves 983 baseline files,
including authority and generated bindings. The sim package adds only a declared
test-fixture export; versions/dependency metadata and 18 cosmetic/test files are
explicitly inventoried. `layout-hull.ts` receives only the visual-binding addition
in the candidate, preserving the shared owner's newer editor work separately.

The broader art-library inventory check retains one unrelated unregistered input,
`reference/art/editor-mockup-5.png`. Every new ledger evidence hash and native
validation passes; that unrelated reference was preserved without a waiver.

All five entry physical/source/native pins remain byte-identical. No reducers,
live ship/player records, cargo, crew, inventory, collision or pressure state are
written for this release; no player migration or account deletion is performed.
The original nine engine placements/nozzles and flight output contract remain
unchanged. Conservation evidence is
`.runtime/shipyard-completion/wayfarer-framed-20260914/physical-pin-conservation.json`.

The required PR destination is unresolved because this checkout has no Git remote.
The owner was asked for the destination while implementation continued. Native
artistic approval remains a separate exact-revision owner decision.

Open owner decisions: provide the repository destination for the required PR;
proposed default is a scoped draft PR without merging. Review native hull r002,
engine r003 and the exact assembled captures for final art sign-off; proposed
default is to keep them explicitly unapproved until that review. No dimensional,
physical, authority or IFCS decision is reopened.

Unsupported families remain separate: arbitrary-sized pressure/collision-qualified
adapters, additional roof/deck bands, and live persistent crater/breach damage with
room pressure consequences. The size specimens and visual materials do not claim
those implementations. No whole Shipyard contract is marked complete.

## Activated release

Normal game: https://sidereal.dastari.net. Managed immutable release
`.runtime/public-client/releases/20260914-141801-048e6f35a49f`, complete tree SHA-256
`048e6f35a49fffb161d1361dda21cf5f53e69c1e24f73c978525fe99299c7b88`.
Activation required both the expected prior live digest and reviewed staged digest.
The public HTTPS index, its 25 linked entry assets and both new GLB libraries
match the activated files byte-for-byte (28 responses total).

Normal Shipyard: https://sidereal.tail7a58a6.ts.net:8445/shipyard. It remains an
independently managed developer application with refreshed runtime assets; the
candidate dashboard build was verified but not substituted over newer editor work.
The game uses the immutable isolated client above. Database PID 458746 remained
running; no database restart, module publication or gameplay state edit occurred.

Frozen source manifest
`0e0cbe3fcbe825b61496e82c76e1d474edfa34e250342347801155e499650bb4`;
verification report JSON
`d75cbfa7146828394ca1a0f5ac6bd9aead9235bbdc4215365460763b79620bf1`.
Native/library/browser/build/delivery evidence is preserved under
`assets/art-library/framed-wayfarer/r001/{assembly,plume,shipyard,verification}`.
The art-library material-study ledger records native implementation revision 5;
owner final artistic sign-off remains unset. The scoped review patch is
`.runtime/shipyard-completion/wayfarer-framed-20260914/candidate-changes.patch`.
No git index, commit or remote was changed; the required PR still needs a destination.
