"""Bounded native mineral optical trial; original crust and all geometry preserved."""
import ast,sys,json,hashlib
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();name=sys.argv[sys.argv.index('--')+2]
assert name in ['gas-giant-moon-1','gas-giant-moon-3']
prior=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914')/(name+'-r002')
source=(prior/'generator.py').read_text();a=source.index('palette=');b=source.index('\nmaterials=[]',a);palette=ast.literal_eval(source[a+8:b]);palette[6]=(palette[6][0],palette[6][1],.10);palette[7]=(palette[7][0],palette[7][1],.12);source=source[:a]+'palette='+repr(palette)+source[b:]
insert='''for role in (6,7):
 shader=materials[role].node_tree.nodes.get('Principled BSDF');shader.inputs['IOR'].default_value=2.2;shader.inputs['Coat Weight'].default_value=1;shader.inputs['Coat Roughness'].default_value=.08
 kit['materials'][role].update(ior=2.2,clearcoat=1,clearcoatRoughness=.08)
'''
source=source.replace("validation={'publication':",insert+"\nvalidation={'publication':",1)
out.mkdir(parents=True,exist_ok=True);assert not(out/'kit.blend').exists();(out/'generator.py').write_text(source)
(out/'interpretation.json').write_text(json.dumps(dict(referenceId='planets--'+name,priorSourceSha256=hashlib.sha256((prior/'generator.py').read_bytes()).hexdigest(),hypothesis='Test whether native high-IOR polished mineral optics localize highlights under existing review lighting. No emission and no original crust changes.',changes={'ior':2.2,'roughness':[.10,.12],'clearcoat':1,'coatRoughness':.08},approval='none'),indent=2))
exec(compile(source,str(out/'generator.py'),'exec'))
old=json.loads((prior/'kit.json').read_text());new=json.loads((out/'kit.json').read_text());assert old['variants']==new['variants'];assert old['materials'][:6]==new['materials'][:6]
(out/'geometry-parity.json').write_text(json.dumps(dict(allVariants=len(old['variants']),geometryUVNormalsRoles='exact',originalSixMaterials='exact'),indent=2))
