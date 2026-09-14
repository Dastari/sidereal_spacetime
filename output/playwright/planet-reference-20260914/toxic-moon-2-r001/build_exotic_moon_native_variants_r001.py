"""Final four reference-specific native lunar candidates. Blender --python THIS -- OUTPUT ID."""
import sys,json,hashlib
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();rid=sys.argv[sys.argv.index('--')+2]
recipes={
 'planets--toxic-moon-1':dict(seed=1747,family='toxic',cover=.24,scales=[.40,.38,.42,.39,.41,.38,.43,.39,.40,.37,.42,.40],cue='Dark olive crater body, narrow yellow-green exposed rims and localized wet chemical crust'),
 'planets--toxic-moon-2':dict(seed=1861,family='toxic',cover=.58,scales=[.43,.40,.44,.39,.42,.41,.43,.40,.42,.39,.44,.41],cue='Broader yellow-green broken upper crust and irregular silhouette over dark open cavities'),
 'planets--crystal-moon-1':dict(seed=1973,family='crystal',hero=.16,count=10,scales=[.36,.33,.37,.34,.36,.32,.37,.33,.36,.34],cue='Rounded fractured purple lunar crust with compact regional magenta crystal relief'),
 'planets--crystal-moon-2':dict(seed=2087,family='crystal',hero=.27,count=8,scales=[.36,.32,.38,.33,.37,.31,.36,.34],cue='More angular compact purple moon with fewer stronger native crystalline protrusions and open cavities'),
}
assert rid in recipes;recipe=recipes[rid];root=Path('/root/sidereal_spacetime');path=root/'scripts/art_library'/('build_rocky_native_kit_r010.py'if recipe['family']=='toxic'else'build_crystal_native_kit_r009.py');source=path.read_text()
out.mkdir(parents=True,exist_ok=True);assert not(out/'kit.blend').exists()
comp=dict(referenceId=rid,layoutSeed=recipe['seed'],scales=recipe['scales'],variantOffset=recipe['seed']%2,hero=recipe.get('hero',0))
if recipe['family']=='toxic':
 colors=[(.027,.045,.012),(.34,.48,.018),(.005,.011,.003),(.060,.090,.018),(.28,.40,.006),(.52,.65,.048)]if rid.endswith('-1')else[(.065,.09,.018),(.48,.61,.055),(.007,.013,.003),(.10,.14,.022),(.36,.49,.014),(.69,.76,.12)]
 names=['olive-crust','acid-rim','dark-cavity','olive-fracture','wet-chemical-fault','yellow-green-upper-crust'];rough=[.76,.62,.91,.73,.35,.60]
 a=source.index('palette=[');b=source.index('\nmaterials=[]',a);source=source[:a]+'palette='+repr([(rid+'-'+n,c,r)for n,c,r in zip(names,colors,rough)])+'\n'+source[b:]
 source=source.replace("'layout':'rocky-crater-geology'","'layout':'toxic-moon-craters','coveredReferenceIds':"+repr([rid])+",'compositionRecipe':"+repr(comp))
 insertion='''
for name,parts in forms:
 if not name.startswith('battered-region-'):continue
 for obj in parts:
  for face in obj.data.polygons:
   q=face.center
   # Authored chemical coverage lives on broken upper crust. Dark cavities and
   # fracture depth are never painted over or replaced by a liquid sphere.
   field=.50+.24*math.sin(q.x*1.8+q.y*.9)+.15*math.cos(q.y*3.1-q.x)
   if face.material_index==0 and face.normal.z>.62 and q.z>.09 and field<COVER:face.material_index=5
'''.replace('COVER',repr(recipe['cover']))
 source=source.replace("kit={'schema'",insertion+"\nkit={'schema'")
 source=source.replace("'native-rocky-r010'",repr('native-'+rid+'-r001'))
else:
 source=source.replace('rocky-r009/kit.json','rocky-r010/kit.json')
 source=source.replace("'layout':'crystal-geology'","'layout':'crystal-moon-geology','coveredReferenceIds':"+repr([rid])+",'compositionRecipe':"+repr(comp))
 source=source.replace("'native-crystal-r009'",repr('native-'+rid+'-r001'))
 # Native crystal geometry remains editable. Make the first moon's forms squat
 # and broad, the second taller/unequal. This is source authoring, not LOD shaping.
 insertion='''
for name,parts in forms:
 if name not in ('colossal-cluster','leaning-colossal-cluster','medium-cluster','single-crystal'):continue
 for obj in parts:
  for vertex in obj.data.vertices:
   vertex.co.z*=HEIGHT_FACTOR
   vertex.co.x*=WIDTH_FACTOR;vertex.co.y*=WIDTH_FACTOR
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces));bm.to_mesh(obj.data);bm.free()
'''.replace('HEIGHT_FACTOR','0.65'if rid.endswith('-1')else'0.92').replace('WIDTH_FACTOR','1.18'if rid.endswith('-1')else'1.08')
 source=source.replace("kit={'schema'",insertion+"\nkit={'schema'")
source=source.replace('obj.location=(i%4*2.3-3.45,i//4*2.6-1.3,0)','obj.location+=Vector((i%4*2.3-3.45,i//4*2.6-1.3,0))')
(out/'generator.py').write_text(source);(out/'foundation-source.py').write_bytes(path.read_bytes());(out/'variant-recipe.json').write_text(json.dumps(dict(referenceId=rid,foundation=str(path),foundationSha256=hashlib.sha256(path.read_bytes()).hexdigest(),runtimeStyle='moon',status='isolated authored candidate, exact visual review pending',**recipe),indent=2))
exec(compile(source,str(out/'generator.py'),'exec'))
