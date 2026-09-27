"""Four exact crater-hybrid references. Native Rocky10 solids plus authored cap districts
and sparse original Ocean7 editable grove objects. Blender --python THIS -- NEW_OUTPUT ID.
"""
import sys,json,hashlib
from pathlib import Path
output=Path(sys.argv[sys.argv.index('--')+1]).resolve();reference_id=sys.argv[sys.argv.index('--')+2]
recipes={
 'planets--temperate-moon-1':dict(seed=857,cover=.72,groves=3,palette=[(.22,.30,.38),(.52,.58,.62),(.014,.023,.035),(.065,.11,.17),(.12,.25,.28),(.68,.72,.68)],coverColors=[(.24,.43,.035),(.48,.62,.075),(.045,.30,.45)],cue='Green upper broken caps over cool crater crust; scattered native groves, exposed dark cavities'),
 'planets--temperate-moon-2':dict(seed=967,cover=.44,groves=2,palette=[(.20,.29,.35),(.46,.56,.59),(.011,.025,.031),(.055,.11,.14),(.10,.25,.29),(.66,.72,.65)],coverColors=[(.19,.37,.025),(.43,.57,.065),(.033,.26,.37)],cue='Smaller cooler crater companion, restrained green cap districts and sparse vegetation'),
 'planets--ocean-moon-1':dict(seed=1069,cover=.34,groves=1,palette=[(.31,.40,.49),(.65,.73,.77),(.018,.031,.045),(.07,.13,.20),(.17,.34,.39),(.78,.82,.80)],coverColors=[(.20,.40,.035),(.48,.60,.10),(.055,.30,.44)],cue='Pale blue/white battered crust with small green sectors; large dark crater openings remain'),
 'planets--ocean-moon-2':dict(seed=1181,cover=.20,groves=0,palette=[(.10,.28,.44),(.48,.70,.79),(.007,.025,.052),(.025,.10,.20),(.045,.36,.48),(.72,.86,.87)],coverColors=[(.19,.40,.04),(.53,.70,.22),(.025,.37,.61)],cue='Blue/white crater moon, very sparse green edge cover and no invented forest blanket'),
}
assert reference_id in recipes
recipe=recipes[reference_id];recipe['scales']=[.40,.38,.42,.39,.41,.38,.43,.39,.40,.37,.42,.40]
source_path=Path('/root/sidereal_spacetime/scripts/art_library/build_rocky_native_kit_r010.py');source=source_path.read_text()
output.mkdir(parents=True,exist_ok=True);assert not(output/'kit.blend').exists()
names=['crust','rim','cavity','fracture-wall','cool-fault','pale-fracture','green-cap','sunlit-green-cap','blue-mineral-cover'];roughness=[.91,.87,.97,.92,.91,.85,.90,.88,.88]
a=source.index('palette=[');b=source.index('\nmaterials=[]',a)
source=source[:a]+'palette='+repr([(reference_id+'-'+n,c,r)for n,c,r in zip(names,recipe['palette']+recipe['coverColors'],roughness)])+'\n'+source[b:]
source=source.replace("'native-rocky-r010'",repr('native-'+reference_id+'-r001'))
source=source.replace("'layout':'rocky-crater-geology'","'layout':'hybrid-moon-craters','coveredReferenceIds':"+repr([reference_id])+",'compositionRecipe':"+repr(dict(referenceId=reference_id,layoutSeed=recipe['seed'],scales=recipe['scales'],variantOffset=recipe['seed']%2)))
# Native material assignments follow hand-authored upper districts. Never color
# deep crater floors/walls or new runtime-generated land geometry.
insertion='''
for form_name,parts in forms:
 if not form_name.startswith('battered-region-'):continue
 for obj in parts:
  for face in obj.data.polygons:
   q=face.center
   if face.normal.z < .58 or face.material_index not in (0,1,5) or q.z < .105:continue
   # Three nonconcentric cap districts, with eroded/quiet gaps.
   field=max(1-((q.x+1.26)/.73)**2-((q.y-.53)/.75)**2,
             .84-((q.x-.22)/.77)**2-((q.y+1.03)/.36)**2,
             .72-((q.x-1.48)/.44)**2-((q.y-.76)/.66)**2)
   field += .13*math.sin(q.x*7+q.y*3)+.09*math.sin(q.y*11)
   if field > COVER_THRESHOLD:
    face.material_index=7 if q.y>.74 or (q.x<-.95 and q.y<.1) else 6
   elif field > COVER_THRESHOLD-.20 and q.x>.30:face.material_index=8
'''.replace('COVER_THRESHOLD',repr(1-recipe['cover']))
# Original Blender grove meshes stay editable. Their existing UVs are retained;
# the source exporter is taught not to overwrite a pre-existing native UV map.
if recipe['groves']:
 insertion+='''
flora_path=Path('/root/sidereal_spacetime/output/playwright/planet-reference-20260914/ocean-r007/kit.blend')
with bpy.data.libraries.load(str(flora_path),link=False) as (available,loaded):
 loaded.objects=[n for n in available.objects if n.startswith('GEO-tree-grove-')]
flora=[o for o in loaded.objects if o and o.type=='MESH']
assert flora,'Missing original native grove objects'
for obj in flora:
 for mat in obj.data.materials:
  if mat not in materials:
   shader=mat.node_tree.nodes.get('Principled BSDF');color=tuple(shader.inputs['Base Color'].default_value[:3]);rough=shader.inputs['Roughness'].default_value
   materials.append(mat);palette.append((mat.name,color,rough))
for name,parts in forms:
 if not name.startswith('battered-region-'):continue
 # Sparse authored native grove locations on upper western cap district.
 for gi,(x,y) in enumerate([(-1.25,.48),(-1.02,.64),(-1.40,.76)][:GROVE_COUNT]):
  best=-10
  for obj in parts:
   hit,point,normal,index=obj.ray_cast(Vector((x,y,3)),Vector((0,0,-1)))
   if hit and normal.z>.5 and obj.data.polygons[index].material_index in (6,7):best=max(best,point.z)
  if best<.1:continue
  for original in flora:
   obj=original.copy();obj.data=original.data.copy();scene.collection.objects.link(obj)
   obj.name=name+'-native-grove-'+str(gi)+'-'+original.name
   scale=.034+gi*.009
   obj.location=(original.location-Vector((-1.15,1.3,0)))*scale+Vector((x,y,best-.006));obj.scale*=scale
   obj['role']='planet';obj['nativeSource']='Ocean7 original editable grove';parts.append(obj)
for obj in flora:bpy.data.objects.remove(obj,do_unlink=True)
bpy.context.view_layer.update()
'''.replace('GROVE_COUNT',str(recipe['groves']))
source=source.replace("kit={'schema'",insertion+"\nkit={'schema'")
# Preserve original native flora UVs; all newly authored geology gets its usual UVs.
source=source.replace("if not mesh.uv_layers.active:mesh.uv_layers.new(name='Native-rocky-UV')", "had_native_uv=bool(mesh.uv_layers.active)\n        if not had_native_uv:mesh.uv_layers.new(name='Native-rocky-UV')")
source=source.replace('for p in mesh.polygons:\n            axes=', 'for p in ([] if had_native_uv else mesh.polygons):\n            axes=')
source=source.replace('obj.location=(i%4*2.3-3.45,i//4*2.6-1.3,0)','obj.location+=Vector((i%4*2.3-3.45,i//4*2.6-1.3,0))')
(output/'generator.py').write_text(source);(output/'foundation-source.py').write_bytes(source_path.read_bytes())
(output/'variant-recipe.json').write_text(json.dumps(dict(referenceId=reference_id,sourceFoundation='Rocky10 native cavities plus original Ocean7 sparse groves',foundationSha256=hashlib.sha256(source_path.read_bytes()).hexdigest(),candidateRevision='r001',runtimeStyle='moon',publication='isolated candidate; independent visual review pending',**recipe),indent=2))
exec(compile(source,str(output/'generator.py'),'exec'))
