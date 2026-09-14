# Reusable backed armor kit check-in — 2026-09-14

Status: native r005 family-03 and exact browser candidate are passed final independent Astra review and are ready for owner art review. This is the requested Blender component pass; no larger Shipyard contract or new live release is declared complete.

## Result and construction method

The new family has a real closed 0.75 m armor backing between the fixed structural datum and a 0.25 m decorative frame/face. Its total outward reservation is 1 m. The structural wall remains 250 mm inward. Common straight spans, convex and concave joints, height terminations and thinner bulkhead examples replace the previous special bow/pod silhouettes in the review. Source Blender meshes, maps, contacts and exact GLB exports are retained.

Native heights are 0.75, 1.5, 2.25 and 3 m. The library contains 76 parameter-keyed models: 75 family models plus a numerically equivalent isolated identity display specimen. It demonstrates 32 directed floor-edge vectors, eight supported turn magnitudes in both convexities, and required height variants. Direction coverage does not mean every pair of directions has a supported junction. Unsupported turns and short runs fail explicitly. No mesh is stretched to fake diagonal fit.

The native planner selects spans and junctions from a selected boundary, reserves corner intervals, and records exact endpoint-derived lengths and individual placement identities. Wayfarer uses 42 pieces; an alternate station uses 54 and a tug uses 23. The intended player interaction is: select boundary, choose family/height/face, inspect the generated assembly, confirm one validated operation. The convenient UI, server operation and external mount qualification are still integration work; this pass does not pretend they are implemented.

Fine seams, fasteners, markings and shallow relief use color, normal and roughness maps. Large shoulders, pale wrapped connectors, deep vent louvers and solid backing remain geometry. BACKING and FINISH remain separately inspectable while sharing the native library and runtime batching.

## Exact review candidate

- Native source: `assets/art-library/framed-wayfarer/r005/family-03/source.blend`, SHA-256 `f0f381f1f9b38a8b19cb6a91226aafbff082e678e9471b607c0823c15fdbf2ec`.
- Native manifest SHA-256: `2e199dba85fe112fd3249c1837cf73c581939ef327aaaf517b47c8d9e25eede9`.
- Lossless shared library: `r005/library-02/hull.glb`, SHA-256 `dcc978612d390e08895cb8dc9011d02e3ffe2a83be9480bcaa7bbc04fce4d1c8`, 2,583,732 bytes.
- Exact standalone exports: `family-03/models.tar.xz`, SHA-256 `008497e572de427950d9b91f10befe2af5cbaaae845094135bd4032462425e77`. Every archived byte matches its native GLB.
- Sixteen native images: `family-03/renders/`; whole ship, separation and alternate browser images: `r005/browser/final-02/`.

The browser imports the unchanged qualified fixture through the actual game construction loader from frozen `/root/wayfarer-framed-r001-candidate`. It records all 117 consumed nondependency source hashes. The exact original document and source provenance are retained beside captures. After validation, private presentation filtering removes designated old hull/special part triangles by their placement identity. New GLBs use the same game static batcher, preserving vertex channels and placement ranges while keeping backing and finish separate.

Retained engine/thruster assets and orientation are unchanged. Their private review positions move rigidly outward using measured native bounds to the new external face. Each original/new mount plane and delta is recorded in browser captures. This is not a live refit or qualified equipment mount. The unchanged canopy is retained; the common half-height armor obscures the lower 0.375 m of its previous glazed area. That is a visual fit choice, not a new pressure-seal claim.

## Validation and retained failures

Closed exported backing, signed volume, full cap coverage, unit normals, finite/nondegenerate triangles, bounds, contact faces and disjoint ownership envelopes pass. All 152 backing contact faces and all closed-boundary opposing sockets match; every test assembly uses unit scale. Rejection probes cover unsupported direction, unsupported turn between supported directions, and insufficient corner space. No validator threshold was relaxed.

The first proof passed independent Astra review before full propagation. The first full family failed on a quarter-height duplicate vertex and is preserved. Family-02 passed geometry and bulk review but the identity graphic was clipped. Family-03 fits one complete WF-01/planet graphic per side. A parity report proves the existing 75 models retain identical position, normal, tangent, UV, index, transform, bounds and contact data; normal and roughness maps are unchanged. Only a bounded color patch and two assembly finish choices change. The private browser visibility bug that exposed normally hidden source prototypes is corrected, with failed captures retained.

The isolated PR checkout extracted all 76 original GLBs, reran native and contact checks, and reproduced the exact packed-library hash. Browser observations show the armor in three batches and whole Wayfarer at 299 draw calls, with zero page errors. Recorded cold two-frame CPU samples are observations, not an authenticated gameplay/F3 performance qualification. Live integration still needs the normal sustained runtime budget checks.

## Entry, live locations and conservation

Before code, git status/log -5 recorded HEAD `2af5fb3e98057f577b61a657e71f61067c7d338b` and 1,237 shared dirty entries. Full status and pins are in `.runtime/shipyard-completion/armor-block-kit-20260914/entry-status.txt` and `entry.json`; the required living progress document was updated. Existing other-owner work was not staged, reset, cleaned or restored.

Public client: https://sidereal.dastari.net/ . Shipyard: https://sidereal.tail7a58a6.ts.net:8445/shipyard . Installed release remains `048e6f35a49fffb161d1361dda21cf5f53e69c1e24f73c978525fe99299c7b88`, directory `20260914-141801-048e6f35a49f`. Both return HTTP 200, and all six entry native/catalog/interface/binding hashes remain unchanged. Receipt: `r005/delivery-validation/pins-and-live-state.json`.

This task invoked no deployment, world publication, reducer, spawn, refit, account or inventory mutation. That records absence of task state mutations, not a new transactional conservation test. Prior art and failure history are preserved. New art is not published incidentally.

## Open owner decisions and unsupported integration

Exact native artistic sign-off remains the owner's decision; the proposed default is to review this exact revision before recording it. The new 1 m armor reservation is explicit for this family and must receive its own collision/mount/authority qualification before installation; it does not inherit the old 0.5 m profile's approval. No approval is requested again for the already fixed inward structural wall and quarter-height dimensions.

Remaining reference differences include narrower repeated bow bays, denser pale ribs near small residual spans, blank generic shoulder faces, fewer amber lamps and simpler surface wear. These are visible for owner feedback. Arbitrary turn pairs, arbitrary heights, complete equipment adapters, new damage/pressure behavior, authenticated publish/refit, multi-deck gameplay and the simpler player UI remain separately gated. The common native kit and private assembly planner do not by themselves complete those contracts.

Delivery uses the existing isolated branch `wayfarer-armor-geometry` based on upstream main `599d2c7a`, through draft [PR #3](https://github.com/Dastari/sidereal_spacetime/pull/3). It is not merged. Repository-wide gate results and final independent review are recorded in the delivery receipt below.

## Final acceptance and project gates

Independent Astra review passes the exact family-03/library-02/browser-final-02 candidate after inspecting all 16 native and 21 browser images. Report: `assets/art-library/framed-wayfarer/armor-block-review-20260914/final-review.md`; the adjacent inventory hashes 143 exact candidate artifacts. Current canonical design revision 7 awaits owner art review; prior installed design remains separate. Browser and native jobs are closed.

Required `npm run check`, `npm run build` and `npm run art:check` were rerun in the isolated delivery checkout. They reproduce the upstream baseline gaps: missing `debug-collision-geometry.ts` and `scene-material-registration.ts` stop typecheck; world/client build passes but dashboard fails on the latter missing module; art check stops on missing historical `assets/source/voxel_wayfarer.blend`. No unrelated files were imported to hide these failures. Logs and receipts are under `r005/delivery-validation`. Seven fresh Blender exports are byte-identical to the final family, all 76 archived GLBs revalidate, and repacking reproduces the exact library hash. No authority code changed, so no new isolated authority smoke is claimed.

The standalone documentation check also reports 36 inherited broken links in existing README/AGENTS/PIVOT and older documents; no new pass file appears in that failure list. Full shared-library validation reports the existing unregistered editor-mockup-5.png, while all 47 current revision evidence hashes match. These checks remain open baseline issues.
