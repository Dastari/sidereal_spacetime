"""Two selected peripheral hot-junction variants, preserving moon2 r003 history.
Blender --background --python THIS -- NEW_OUTPUT
"""
import sys,json,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[2];out=Path(sys.argv[sys.argv.index('--')+1]).resolve();prior=root/'output/playwright/planet-reference-20260914/volcanic-moon-2-r003';source=(prior/'generator.py').read_text()
out.mkdir(parents=True,exist_ok=True);assert not(out/'kit.blend').exists()
insertion="""# Preserve the exact normal B source; only two recipe placements use its
# broader hot-edge successor. No seeded camera-dependent selection.
for original_name,original_parts in list(forms):
 if original_name!='battered-region-b':continue
 copies=[]
 for original in original_parts:
  obj=original.copy();obj.data=original.data.copy();obj.name=original.name+'-hot-edge';bpy.context.collection.objects.link(obj);copies.append(obj)
 forms.append(('battered-region-b-edge',copies))
"""
source=source.replace('# Native closed ribbons',insertion+'\n# Native closed ribbons',1)
source=source.replace("if name.endswith('-b'):paths=paths[:1]", "if name.endswith('-b') or name.endswith('-b-edge'):paths=paths[:1]")
source=source.replace('   multiplier=profile[j] if selected else 1.', "   if name.endswith('-b-edge'):profile=[.8,2.5,9.2,7.2,2.4,.72]\n   multiplier=profile[j] if selected else 1.")
source=source.replace("kit['materials'][4].update", "kit['compositionRecipe']['warmEdgeRegions']=[2,9]\nkit['materials'][4].update",1)
source=source.replace('isolated volcanic moon r003 hot-junction candidate','isolated volcanic moon2 r004 two hot-edge candidate')
(out/'generator.py').write_text(source);(out/'foundation-source-r003.py').write_bytes((prior/'generator.py').read_bytes())
exec(compile(source,str(out/'generator.py'),'exec'))
a=json.loads((prior/'kit.json').read_text());b=json.loads((out/'kit.json').read_text());assert a['materials']==b['materials']
for v in a['variants']:assert v==next(w for w in b['variants']if w['name']==v['name']),v['name']
for p in prior.glob('rocky-*.png'):assert p.read_bytes()==(out/p.name).read_bytes(),p.name
(out/'preservation.json').write_text(json.dumps({'prior':str(prior),'priorKitSHA256':hashlib.sha256((prior/'kit.json').read_bytes()).hexdigest(),'all11OriginalVariants':'exact JSON attributes and material roles','materialsAnd12Textures':'exact','newVariant':'battered-region-b-edge','warmEdgeRegions':[2,9],'scope':'only two existing B placement IDs select native broader junction; no crater/layout/emission change'},indent=2))
