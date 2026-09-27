"""Regenerate the private, linked comparison gallery from saved actual captures."""
from pathlib import Path
import html
R=Path(__file__).resolve().parents[2];out=R/'assets/art-library/character-components/calibration/index.html';base='../../designs/crew.base-and-outfits/revisions/r008/candidate/'
parts=['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>r008 character reference calibration</title><style>*{box-sizing:border-box}body{margin:0;background:#091220;color:#e1eaf4;font:16px/1.6 system-ui}main{max-width:1450px;margin:auto;padding:36px}h1{font-size:34px;font-weight:550;letter-spacing:-.02em}h2{font-size:23px;font-weight:550;margin-top:42px}a{color:#78d9ed}p{max-width:920px;color:#b8c8d7}.tag{color:#70d5dc;font-size:13px;letter-spacing:.12em}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:20px}figure{margin:0;padding:10px;background:#111f30;border:1px solid #274052}img{width:100%;display:block;object-fit:contain;max-height:650px}figcaption{font-size:14px;padding:8px;color:#b4c8d7}.wide img{max-height:none}.small img{width:auto;max-width:100%;margin:auto;image-rendering:auto}</style><main><div class="tag">R008 · INSTALLED WITH OWNER AUTHORIZATION · FINAL ART SIGN-OFF PENDING</div><h1>Closer to the character references</h1><p>Exact owner crop, preserved r002 baseline and reviewed native Blender r008 model, photographed through the same Babylon renderer. The focused r008 models and matching medic inventory images are now installed; these saved comparisons retain their original pre-publication evidence. The focus is two modesty bases, three hairstyles and the medic equipment set. Other archetypes remain r002. Open comms is a separate proposed unisex design.</p><p><a href="../publications/r008/README.md">Publication and rollback</a> · <a href="README.md">Study and repeatable test</a> · <a href="../INDEX.md">Living component ledger</a> · <a href="../../../../docs/character_reference_fidelity.md">Fidelity guide</a> · <a href="'+base+'blender-source.blend">Editable Blender source</a></p>']
def pic(file,caption,cls=''):
 url=base+file;parts.append(f'<figure class="{cls}"><a href="{url}"><img loading="lazy" src="{url}" alt="{html.escape(caption)}"></a><figcaption>{html.escape(caption)}</figcaption></figure>')
parts.append('<h2>Reference / preserved r002 / reviewed r008</h2>')
for body in ['female','male']:pic('runtime/character-fidelity-r008-'+body+'-final-comparison.png',body.title()+' reference comparison; explicit open comms or sealed helmet, same carrying stance and renderer.','wide')
parts.append('<h2>Preserved production paper-doll review</h2><p>The production UI and portrait run against an isolated test database, with all nine real medic items equipped through reducers. Reviewed r008 central model; then-installed r002 inventory thumbnail icons. Mock stats are unchanged. This capture predates publication; current medic inventory icons now use the reviewed renders.</p>')
for body in ['female','male']:pic('runtime/character-fidelity-r008-paperdoll-'+body+'-reviewed.png',body.title()+' paper doll, actual game UI.','wide')
parts.append('<h2>Modesty bases and hair</h2><div class="grid">')
for body in ['male','female']:pic('base-'+body+'.png',body.title()+' base; same shared skeleton, required opaque modesty layers.')
for hair in ['swept','crest','ponytail']:pic('hair-'+hair+'.png',hair.title()+' authored hair.');pic('hair-'+hair+'-rear.png',hair.title()+' rear coverage; inferred continuation of source side locks.')
parts.append('</div><h2>Independent medic equipment</h2><div class="grid">')
for part in ['helmet','visor','chest','shoulders','gloves','belt','legs','boots','back-outward','open-comms']:pic('medic-'+part+'.png','Medic '+part.replace('-',' ')+'; Blender render of native geometry.')
parts.append('</div><h2>Actual small canvas renders</h2><div class="grid">')
for body in ['female','male']:
 for size in [256,128]:pic(f'runtime/character-fidelity-r008-{body}-open-{size}.png',f'{body.title()} at {size}px canvas height; no bloom.','small')
parts.append('</div><h2>Pose and mixed fit samples</h2><div class="grid">')
for body in ['female','male']:
 for clip in ['Walk','Sprint','Seated','Idle-Rifle','Idle-Pistol']:pic(f'runtime/character-fidelity-r008-{body}-{clip}.png',f'{body.title()} / {clip}, preserved original animation.')
 pic(f'runtime/character-fidelity-r008-{body}-mixed-fit.png',body.title()+' mixed equipment sample.','wide')
parts.append('</div><h2>Surface diagnostics</h2><div class="grid">')
for hair in ['swept','crest','ponytail']:pic('diagnostics/'+hair+'-upper-rear-clay.png',hair.title()+' diffuse clay check, light background, no bloom.')
pic('diagnostics/ponytail-side-clay.png','Ponytail native surface continuity.');pic('diagnostics/sealed-optical-close.png','Independent visor and closed helmet gasket fit.')
parts.append('</div><p><a href="../../designs/crew.base-and-outfits/DESIGN.md">Preserved failed iterations and exact evidence hashes</a>. Agent suitability is separate from final owner approval. Coarser hair/helmet contours and greater costume-specific detail remain future refinements; this calibration does not certify every possible mix-and-match pose.</p></main></html>')
out.write_text('\n'.join(parts)+'\n')
