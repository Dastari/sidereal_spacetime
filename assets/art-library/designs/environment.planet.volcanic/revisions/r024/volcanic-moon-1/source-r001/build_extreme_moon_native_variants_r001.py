"""Reference-specific glacial and volcanic native moon authoring, isolated candidates.
Blender --python THIS -- NEW_OUTPUT EXACT_ID. Full resolved source preserved.
"""
import sys,json,hashlib
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();rid=sys.argv[sys.argv.index('--')+2]
recipes={
 'planets--ice-moon-1':dict(seed=1297,family='ice',count=8,scales=[.34,.29,.35,.30,.33,.28,.34,.31],columns=1.,districts=28,cue='Broken white snow over saturated blue vertical glacial exposure and unequal protrusions'),
 'planets--ice-moon-2':dict(seed=1409,family='ice',count=6,scales=[.33,.26,.29,.25,.30,.27],columns=.67,districts=22,cue='Quieter smaller white-dominant glacial moon with substantial dark blue openings and lower projections'),
 'planets--volcanic-moon-1':dict(seed=1523,family='volcanic',count=12,scales=[.41,.38,.43,.39,.40,.38,.42,.39,.43,.37,.41,.40],cue='Purple charcoal crater crust with connected localized orange fissures and a few molten rim exposures'),
 'planets--volcanic-moon-2':dict(seed=1637,family='volcanic',count=12,scales=[.38,.40,.39,.41,.37,.40,.38,.42,.39,.37,.41,.38],cue='Darker compact volcanic crater moon with fewer active fault districts and restrained hot patches'),
}
assert rid in recipes;recipe=recipes[rid];root=Path('/root/sidereal_spacetime');path=root/'scripts/art_library'/('build_ice_native_kit_r025.py'if recipe['family']=='ice'else'build_rocky_native_kit_r010.py');source=path.read_text()
out.mkdir(parents=True,exist_ok=True);assert not(out/'kit.blend').exists()
composition=dict(referenceId=rid,layoutSeed=recipe['seed'],scales=recipe['scales'],variantOffset=recipe['seed']%2)
if recipe['family']=='ice':
 source=source.replace("'layout':'single-glacial-cut-diagnostic'","'layout':'ice-moon-glacial','coveredReferenceIds':"+repr([rid])+",'compositionRecipe':"+repr(composition))
 source=source.replace("'native-ice-r025'",repr('native-'+rid+'-r001'))
 source=source.replace('n=sides;verts=[]','h*='+repr(recipe['columns'])+'\n n=sides;verts=[]')
 source=source.replace('range(42)','range('+str(recipe['districts'])+')').replace('(i+.5)/42','(i+.5)/'+str(recipe['districts']))
 if rid.endswith('-2'):source=source.replace('o.data.materials.append(materials[2])','o.data.materials.append(materials[0])')
else:
 colors=[(.14,.10,.18),(.27,.20,.30),(.012,.008,.019),(.045,.025,.061),(1.,.11,.003),(.35,.24,.34)]if rid.endswith('-1')else[(.078,.047,.095),(.18,.11,.19),(.006,.003,.010),(.025,.013,.037),(1.,.095,.002),(.25,.13,.24)]
 names=['charcoal-crust','purple-rim','dark-cavity','cooled-fracture','molten-fault','pale-purple-fracture'];rough=[.91,.87,.97,.92,.57,.86]
 a=source.index('palette=[');b=source.index('\nmaterials=[]',a);source=source[:a]+'palette='+repr([(rid+'-'+n,c,r)for n,c,r in zip(names,colors,rough)])+'\n'+source[b:]
 source=source.replace("'layout':'rocky-crater-geology'","'layout':'volcanic-moon-craters','coveredReferenceIds':"+repr([rid])+",'compositionRecipe':"+repr(composition))
 source=source.replace("'native-rocky-r010'",repr('native-'+rid+'-r001'))
 insertion='''
# Native hot accents are localized to one of the two reusable crust variants.
# The main dark cavity floor remains unchanged; no glowing grout or sphere.
for name,parts in forms:
 if not name.startswith('battered-region-'):continue
 for obj in parts:
  for face in obj.data.polygons:
   q=face.center
   if name.endswith('-b') and face.material_index==4:face.material_index=3
   elif name.endswith('-a') and face.material_index==1 and .22<q.z<.31 and q.x<-.92 and -.5<q.y<-.17:face.material_index=4
shader=materials[4].node_tree.nodes.get('Principled BSDF');shader.inputs['Emission Color'].default_value=(1,.095,.002,1);shader.inputs['Emission Strength'].default_value=2.2
'''
 source=source.replace("kit={'schema'",insertion+"\nkit={'schema'")
 source=source.replace("kit['uvConvention']=", "kit['materials'][4].update(emissiveColor=[1,.095,.002],emissiveStrength=2.2)\nkit['uvConvention']=")
 source=source.replace('obj.location=(i%4*2.3-3.45,i//4*2.6-1.3,0)','obj.location+=Vector((i%4*2.3-3.45,i//4*2.6-1.3,0))')
(out/'generator.py').write_text(source);(out/'foundation-source.py').write_bytes(path.read_bytes());(out/'variant-recipe.json').write_text(json.dumps(dict(referenceId=rid,foundation=str(path),foundationSha256=hashlib.sha256(path.read_bytes()).hexdigest(),runtimeStyle='moon',status='isolated authored candidate; exact variant visual review pending',**recipe),indent=2))
exec(compile(source,str(out/'generator.py'),'exec'))
