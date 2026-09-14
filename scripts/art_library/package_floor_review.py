"""Preserve a complete floor review package and generate its human review page.

This copies actual Blender/browser evidence without changing image pixels. It
does not sign off, install, publish, or write to a world database.
"""
from pathlib import Path
import hashlib
import html
import json
import shutil
import subprocess
import sys
import zipfile

ROOT=Path(__file__).resolve().parents[2]
REV=int(sys.argv[1]) if len(sys.argv)>1 else 2
OUT=ROOT/'.runtime/art-library/floor'/f'r{REV:03}'
LIB=ROOT/'assets/art-library'
REVIEW=LIB/'shipyard-floor'/f'r{REV:03}'
CAPTURES=ROOT/'output/playwright/floor-kit'
DESIGN='shipyard.floor.mapped-deck-kit'
components=json.loads((OUT/'components.json').read_text())
assert json.loads((OUT/'placement-validation.json').read_text())['passed']
assert not json.loads((OUT/'browser-validation.json').read_text())['failures']
REVIEW.mkdir(parents=True,exist_ok=False)
for name in ['component-board.png','blender-top.png','components.json','specification.json',
             'validation.json','browser-validation.json','placement-validation.json',
             'placement-migration-preview.json','kit.glb','floor-kit.blend']:
    shutil.copy2(OUT/name,REVIEW/name)
shutil.copytree(OUT/'maps',REVIEW/'maps')
shutil.copytree(CAPTURES,REVIEW/'runtime')
for c in components:
    shutil.copytree(OUT/c['slug'],REVIEW/'variants'/c['slug'])

def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
capture={
    'revision':REV,'design_id':DESIGN,'commit':commit,'worktree':'Dirty shared worktree; generator and loader snapshots retained in recipe.zip.',
    'blender':'Blender 4.3.2, Cycles CPU; true selected-to-active bakes. Transparent stills: 24 samples, no denoising.',
    'runtime':'Actual dashboard Shipyard http://localhost:5174/shipyard, isolated browser network routes; WebGL2, 1440x1000. RAF paused for deterministic stills; no FPS measurement.',
    'camera':'RPG elevation 35.264 degrees. Top screenshots use a documented review-only overhead override. Exact camera data in browser-validation.json.',
    'lighting':'Normal on/off pair uses identical workshop key + fill + environment. Reduced preview disables workshop-fill; key + environment intensity 0.5 remain. Zero lights authored on tiles.',
    'ship_preview':'55 floor placements in isolated 267-part ship snapshot; same placement IDs, explicit origin adjustments in placement-migration-preview.json. Existing structural backing below the deck is a separate integration concern.',
    'approval':None,'published':False,'native_game_client_flight_review':'Pending; these images are Shipyard evidence.',
    'files':{str(p.relative_to(REVIEW)):sha(p) for p in sorted(REVIEW.rglob('*')) if p.is_file()}}
(OUT/'capture.json').write_text(json.dumps(capture,indent=2)+'\n')
shutil.copy2(OUT/'capture.json',REVIEW/'capture.json')

rows=[]
cards=[]
for c in components:
    slug=c['slug'];label=c['label'];xy=c['polygon_xy_m']
    dims=f"{max(p[0] for p in xy):g} × {max(p[1] for p in xy):g} × {c['thickness_m']:g} m"
    rows.append(f"| {label} | {dims} | {c['area_m2']:g} m² | {c['runtime_triangles']} | [Cutout](r{REV:03}/variants/{slug}/cutout.png) · [GLB](r{REV:03}/variants/{slug}/model.glb) · [Shipyard](r{REV:03}/runtime/{slug}-runtime-close.png) | r{REV:03}; awaiting owner |")
    cards.append(f'<article><a href="variants/{slug}/cutout.png"><img src="variants/{slug}/cutout.png" alt="{html.escape(label)} — actual transparent Blender render"></a><h3>{html.escape(label)}</h3><p>{dims}; {c["area_m2"]:g} m²; {c["runtime_triangles"]} triangles</p><p><a href="variants/{slug}/model.glb">GLB</a> · <a href="runtime/{slug}-runtime-close.png">Shipyard close</a> · <a href="runtime/{slug}-runtime-top.png">Shipyard top</a></p><small>r{REV:03} · unsigned</small></article>')

readme=f'''# Ship floor kit — r{REV:03}

Twelve Blender-authored floor shapes with mapped panel relief. **Ready for owner visual review; unsigned and unpublished.** The living record is [the design ledger](../designs/{DESIGN}/DESIGN.md) and its [machine-readable history](../designs/{DESIGN}/design.json).

[Open the visual review](r{REV:03}/index.html) · [Blender source](r{REV:03}/floor-kit.blend) · [Shared GLB kit](r{REV:03}/kit.glb) · [Exact dimensions/material specification](r{REV:03}/specification.json)

![Actual Blender render of all twelve floor shapes](r{REV:03}/component-board.png)

| Variant | Nominal envelope | Walkable polygon area | Triangles | Evidence | Revision / approval |
| --- | --- | --- | --- | --- | --- |
'''+'\n'.join(rows)+f'''

## Surface and construction

The owner requested angled and long triangular tiles, replacing raised plate detail with bump/normal maps. The source references retain pale studless panels, dark joints, restrained amber registration marks and small fasteners. This revision deliberately flattens those panel details in the runtime surface while keeping an editable high-detail Blender bake source.

The 2 m repeat contains four 1 m panels. True Blender bakes supply base color, tangent-space +Y normal, roughness, ambient occlusion, metallic and a 0–16 mm height map. The runtime uses three 1024² textures: base color, normal and packed **R=AO / G=roughness / B=metallic**. Height is preserved for reauthoring and is not applied again on top of its baked normal. UV density is 512 pixels/m; long forms repeat the same atlas. The normal relief is intentionally shallow; some fine bevels disappear at ordinary zoom. Diagonal outlines currently crop the regular panel pattern; bespoke perimeter seams and markings are candidates for the next visual revision.

Pale surfaces are molded polymer (metallic 0; roughness .34–.37; IOR 1.46; coat .08). Exposed fasteners receive selective metallic response. Tile sides use one dark indigo material. Physical thickness is 187.5 mm, matching the current deck top datum; a 4 mm perimeter bevel preserves silhouette and edge highlights. Panel rise, fasteners and grip bars are baked rather than exported as individual raised shapes. There are no tile lights or emissive materials.

Each shape has 80–136 triangles and two material primitives. The shared kit is 368,076 bytes with two materials and three embedded images. Existing procedural floor assets measured 322–976 triangles; the 2 m square here has 108. These are mesh counts, **not a measured frame-rate or lighting-cost improvement**. Two primitives still mean two draw meshes per placed tile in this renderer; sharing materials/textures does not automatically batch those draws.

## Scale, fitting and gameplay

Blender XY is the deck plane, +Z is up; renderer coordinates are X / height / −Y. Origin is the nominal lower-left datum, not the bevel-shrunken mesh bound. A 2 m module is suitable for a roughly 1.8 m crew member; quarter and slender pieces fill edges rather than define a standard walk corridor. Tile tops are z=0.1875 m. Long wedges use authored slopes; placement rotation remains quarter turns with optional mirror, on the existing 1/32 m snap grid.

The separate 1/16 m occupancy proxies are for isolated draft fitting. Polygon-centre sampling excludes cells exactly on a shared diagonal, with at most one-cell boundary uncertainty. They do not replace authoritative collision, pressure containment, support or damage. All 12 board placements, five complementary triangle joins, square adjacency, duplicate rejection, empty triangular space, rotations, mirroring and top support passed the actual assembly rules. Use nominal polygon vertices for mating; beveled measured tips are slightly inset.

Mass (kg), deck load (kg/m²), health (HP), armor and pressure sealing remain **unspecified proposals** pending a structural material/support contract. Visual slab volume is not solid material mass; the envelope could contain a sandwich core. No new gameplay values, authority grants, live placement migration or visual voxel damage were implemented. The precise polygon area, volume envelope and fitting datum are recorded per variant.

## Render evidence and revision history

[Ship context](r{REV:03}/runtime/ship-floor-context.png) · [Ship close](r{REV:03}/runtime/ship-floor-close.png) · [Normals enabled](r{REV:03}/runtime/normal-on.png) · [Normals disabled](r{REV:03}/runtime/normal-off.png) · [One key + environment](r{REV:03}/runtime/one-key-plus-environment.png)

These are actual Shipyard screenshots from an isolated browser preview, including 55 replaced floor visuals in a 267-part ship. Placement IDs remain distinct. The origin-adaptation record is preserved. The original procedural floors included deeper backing below the deck; final installation must retain or replace that structure explicitly. Native game-client flight, cutaway, underside joins and authoritative migration remain pending. The reduced-light comparison establishes legibility in this controlled view, not permission to remove lights globally.

r001 retained the first real Blender bakes, source and GLB but failed export review because the clipped-corner ngon lacked explicit tangents. r002 triangulated the evaluated export, enabled backface culling and passed tangent/material checks. An initial tight cutout framing attempt and a placement test that incorrectly used beveled bounds were preserved; framing and nominal fitting were corrected. No owner final approval has been recorded.

## Continue in a fresh agent

Read `assets/art-library/INDEX.md`, `WORKFLOW.md`, this page, the exact current design ledger and `docs/blender_asset_migration.md`. Inspect the actual reference crops and current Blender/Shipyard images. Work only on the floor kit unless scope is expanded. Record owner feedback verbatim and start the next revision before altering accepted evidence. Preserve every variant and its coverage; do not refine the old TypeScript solid generator as the visual replacement. Improve the smallest evidenced issue, rebake affected maps in Blender, export native GLB surfaces and validate UVs, tangents, material channels and fits. Capture real Blender and Shipyard evidence and update the living ledger. Owner sign-off and runtime publication are separate explicit actions.

The master `.blend` keeps `BAKE-SOURCE-editable-relief`, `RUNTIME-MASTERS` and a review board. The high-detail bake source stays hidden from the runtime export. Author geometry/UVs with `scripts/art_library/build_floor_review.py`; bake selected-to-active into the 2 m target, save all channels and pack ORM; export only runtime masters. `refine_floor_review.py` records the r001→r002 tangent correction. Use a new output revision:

```sh
npm run art:library:floor -- --revision 3 --stage build
npm run art:library:floor -- --revision 3 --stage render
npm run art:library:floor -- --revision 3 --stage prepare
npm run art:library:floor:fit -- .runtime/art-library/floor/r003
```

Build is a fresh generation from the current recipe; modify the recipe/source for the intended feedback before running. Rendering and browser capture have explicit framing/URL/output settings; update those for a new revision. Do not overwrite preserved artifacts. Sources and capture recipes are in the ledger recipe archive. Required verification: `npm run check`, `npm run build`, `npm run art:check`, library integrity check, and real browser review. Authority changes need their additional isolated smoke checks.
'''
(REVIEW.parent/'README.md').write_text(readme)

def figure(path,label):return f'<figure><a href="{path}"><img src="{path}" alt="{html.escape(label)}"></a><figcaption>{html.escape(label)}</figcaption></figure>'
comparisons=''
if (REVIEW/'runtime/legacy-ship-close.png').exists():
    comparisons+='<h2>Same Shipyard camera and lighting</h2><div class="pair">'+figure('runtime/legacy-ship-close.png','Existing floor surfaces')+figure('runtime/ship-floor-close.png','r002 mapped floor preview')+'</div>'
comparisons+='<h2>Normal and lighting comparison</h2><div class="pair">'+figure('runtime/normal-on.png','Normal enabled — key + fill + environment')+figure('runtime/normal-off.png','Normal disabled — same camera and lights')+'</div>'+figure('runtime/one-key-plus-environment.png','Normal enabled — one key + environment; no floor lights')
doc='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ship floor kit · r002 review</title><style>body{margin:0;background:#142832;color:#e6eef0;font:16px/1.6 system-ui}main{max-width:1400px;margin:auto;padding:32px}a{color:#88d1dc}h1{font-size:40px;line-height:1.2}h2{margin-top:48px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:20px}article,figure{margin:0;background:#213b47;border:1px solid #385765;border-radius:8px;overflow:hidden}article h3,article p,article small{margin:12px 18px}article small{display:block;color:#b7c7cd}img{width:100%;display:block;object-fit:contain}article img{background:repeating-conic-gradient(#e7ebee 0% 25%,#dce2e6 0% 50%) 50%/24px 24px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:18px}figcaption{padding:12px}p{max-width:1000px}@media(max-width:700px){.pair{grid-template-columns:1fr}main{padding:18px}}</style><main><p><a href="../README.md">Specifications and continuation instructions</a> · <a href="../../designs/'+DESIGN+'/design.json">Living ledger</a></p><h1>Ship floor kit / r002</h1><p>12 Blender-authored variants · Shallow detail baked into normal and material maps · Awaiting owner review · Unpublished</p>'+figure('runtime/ship-floor-context.png','Actual Shipyard: isolated preview of 55 floor placements')+'<h2>Every variant</h2><div class="grid">'+''.join(cards)+'</div>'+comparisons+'<h2>Saved sources</h2><p><a href="floor-kit.blend">Editable Blender source</a> · <a href="kit.glb">Shared GLB kit</a> · <a href="specification.json">Specification</a> · <a href="capture.json">Capture provenance and hashes</a></p><div class="grid">'+''.join(figure('maps/'+n+'.png',n+' — actual Blender bake') for n in ['basecolor','normal','orm','height'])+'</div><p>Actual Blender and Shipyard evidence. Normal maps still respond to lighting; no game-wide light reduction or measured FPS gain is claimed. Source colors, fine mapped relief, diagonal edge treatment and final underside integration remain subject to owner review.</p></main></html>'
(REVIEW/'index.html').write_text(doc)

with zipfile.ZipFile(OUT/'native-source.zip','w',zipfile.ZIP_DEFLATED) as z:
    for p in sorted(REVIEW.rglob('*')):
        if p.is_file():z.write(p,str(p.relative_to(REVIEW)))
with zipfile.ZipFile(OUT/'recipe.zip','w',zipfile.ZIP_DEFLATED) as z:
    paths=[*sorted((ROOT/'scripts/art_library').glob('*floor*')),
           ROOT/'packages/render/src/installed-equipment.ts',ROOT/'packages/render/src/installed-equipment.test.ts',
           ROOT/'packages/content/src/assembly.ts',ROOT/'docs/blender_asset_migration.md',REVIEW.parent/'README.md']
    for p in paths:
        if p.is_file():z.write(p,str(p.relative_to(ROOT)))
    for name in ['catalog.json','wayfarer.json','catalog.voxels.json','ship-catalog.json','ship-wayfarer.json','ship-catalog.voxels.json']:
        z.write(OUT/name,'isolated-review/'+name)
    for p in sorted((OUT/'attempts').rglob('*')):
        if p.is_file():z.write(p,'attempts/'+str(p.relative_to(OUT/'attempts')))
print('FLOOR_PACKAGE',REVIEW,len(components),'variant image/model sets preserved')
