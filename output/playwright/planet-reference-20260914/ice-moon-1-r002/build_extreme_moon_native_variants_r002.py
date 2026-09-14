"""Reference-specific glacial and volcanic native moon authoring, isolated candidates.
Blender --python THIS -- NEW_OUTPUT EXACT_ID. Full resolved source preserved.
"""
import sys,json,hashlib
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();rid=sys.argv[sys.argv.index('--')+2]
recipes={
 'planets--ice-moon-1':dict(seed=1297,family='ice',count=10,scales=[.34,.29,.35,.30,.33,.28,.34,.31,.33,.30],columns=1.,districts=72,cue='Broken white snow over saturated blue vertical glacial exposure and unequal protrusions'),
 'planets--ice-moon-2':dict(seed=1409,family='ice',count=8,scales=[.34,.29,.32,.28,.33,.30,.32,.29],columns=.82,districts=64,cue='Quieter smaller white-dominant glacial moon with substantial dark blue openings and lower projections'),
 'planets--volcanic-moon-1':dict(seed=1523,family='volcanic',count=12,scales=[.41,.38,.43,.39,.40,.38,.42,.39,.43,.37,.41,.40],cue='Purple charcoal crater crust with connected localized orange fissures and a few molten rim exposures'),
 'planets--volcanic-moon-2':dict(seed=1637,family='volcanic',count=12,scales=[.38,.40,.39,.41,.37,.40,.38,.42,.39,.37,.41,.38],cue='Darker compact volcanic crater moon with fewer active fault districts and restrained hot patches'),
}
assert rid in recipes;recipe=recipes[rid];root=Path('/root/sidereal_spacetime');path=root/'scripts/art_library'/('build_ice_native_kit_r025.py'if recipe['family']=='ice'else'build_rocky_native_kit_r010.py');source=path.read_text()
out.mkdir(parents=True,exist_ok=True);assert not(out/'kit.blend').exists()
composition=dict(referenceId=rid,layoutSeed=recipe['seed'],scales=recipe['scales'],variantOffset=recipe['seed']%2)
if recipe['family']=='ice':
 source=source.replace("'layout':'single-glacial-cut-diagnostic'","'layout':'ice-moon-glacial','coveredReferenceIds':"+repr([rid])+",'compositionRecipe':"+repr(composition))
 source=source.replace("'native-ice-r025'",repr('native-'+rid+'-r002'))
 source=source.replace('n=sides;verts=[]','h*='+repr(recipe['columns'])+'\n n=sides;verts=[]')
 source=source.replace('range(42)','range('+str(recipe['districts'])+')').replace('(i+.5)/42','(i+.5)/'+str(recipe['districts']))
 if rid.endswith('-2'):source=source.replace('o.data.materials.append(materials[2])','o.data.materials.append(materials[0])')
else:
 colors=[(.14,.10,.18),(.27,.20,.30),(.012,.008,.019),(.045,.025,.061),(1.,.11,.003),(.35,.24,.34)]if rid.endswith('-1')else[(.078,.047,.095),(.18,.11,.19),(.006,.003,.010),(.025,.013,.037),(1.,.095,.002),(.25,.13,.24)]
 names=['charcoal-crust','purple-rim','dark-cavity','cooled-fracture','molten-fault','pale-purple-fracture'];rough=[.91,.87,.97,.92,.57,.86]
 a=source.index('palette=[');b=source.index('\nmaterials=[]',a);source=source[:a]+'palette='+repr([(rid+'-'+n,c,r)for n,c,r in zip(names,colors,rough)])+'\n'+source[b:]
 source=source.replace("'layout':'rocky-crater-geology'","'layout':'volcanic-moon-craters','coveredReferenceIds':"+repr([rid])+",'compositionRecipe':"+repr(composition))
 source=source.replace("'native-rocky-r010'",repr('native-'+rid+'-r002'))
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

if recipe['family']=='ice':
 source=source.replace("[('ground-sphere',5),('ground-sphere-medium',4),('ground-sphere-low',3)]","[('ground-sphere',6),('ground-sphere-medium',5),('ground-sphere-low',4)]")
 source=source.replace('width=[.29,.22,.34,.27,.30][i%5];depth=[.27,.33,.23,.30][i%4]','width=[.25,.20,.28,.23,.26][i%5];depth=[.24,.28,.21,.26][i%4]')
 source=source.replace('for obj in objects:\n  # The editable', '''for obj in objects:
  # Native adaptive tessellation bounds post-depression chord length.
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=list(bm.faces))
  for _ in range(5):
   edges=[e for e in bm.edges if e.calc_length()>.095]
   if not edges:break
   bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True);bmesh.ops.triangulate(bm,faces=list(bm.faces))
  bm.to_mesh(obj.data);bm.free()
  # The editable''')
else:
 source=source.replace("kit={'schema'", '''
# Native closed ribbons enter deliberately selected upper fracture districts.
# Irregular variable widths and stepped heights preserve sparse regional breaks.
for name,parts in forms:
 if not name.startswith('battered-region-'):continue
 paths=[([(-1.72,.20),(-1.53,.27),(-1.45,.40),(-1.22,.43),(-1.11,.63),(-.87,.71)],.022),
        ([(-.38,-1.29),(-.16,-1.18),(-.10,-1.02),(.16,-.97),(.34,-.84),(.59,-.87)],.025),
        ([(1.52,.43),(1.62,.59),(1.46,.71),(1.52,.89),(1.29,1.02)],.019)]
 if name.endswith('-b'):paths=paths[:1]
 for pi,(points,width) in enumerate(paths):
  verts=[]
  for j,(x,y) in enumerate(points):
   before=points[max(0,j-1)];after=points[min(len(points)-1,j+1)];dx=after[0]-before[0];dy=after[1]-before[1];length=math.hypot(dx,dy);nx=-dy/length;ny=dx/length;w=width*(.80+.33*math.sin(j*1.3+pi)**2)
   top=-10
   for obj in parts:
    hit,p,n,index=obj.ray_cast(Vector((x,y,3)),Vector((0,0,-1)))
    if hit:top=max(top,p.z)
   assert top>.09,(name,x,y,top)
   z=top+.004
   verts.extend([(x-nx*w,y-ny*w,z-.014),(x+nx*w,y+ny*w,z-.014),(x-nx*w,y-ny*w,z),(x+nx*w,y+ny*w,z)])
  faces=[(0,2,3,1)];roles=[3]
  for j in range(len(points)-1):
   a=j*4;b=a+4;faces.extend([(a,a+1,b+1,b),(a+2,b+2,b+3,a+3),(a,b,b+2,a+2),(a+1,a+3,b+3,b+1)]);roles.extend([3,4,4,4])
  a=(len(points)-1)*4;faces.append((a,a+1,a+3,a+2));roles.append(3)
  obj=mesh_object(name+'-exposed-hot-fracture-'+str(pi),verts,faces,roles)
  bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=list(bm.faces))
  for _ in range(5):
   edges=[e for e in bm.edges if e.calc_length()>.095]
   if not edges:break
   bmesh.ops.subdivide_edges(bm,edges=edges,cuts=1,use_grid_fill=True);bmesh.ops.triangulate(bm,faces=list(bm.faces))
  bm.to_mesh(obj.data);bm.free();parts.append(obj)
kit={'schema' ''')

(out/'generator.py').write_text(source);(out/'foundation-source.py').write_bytes(path.read_bytes());(out/'variant-recipe.json').write_text(json.dumps(dict(referenceId=rid,foundation=str(path),foundationSha256=hashlib.sha256(path.read_bytes()).hexdigest(),runtimeStyle='moon',status='isolated authored candidate; exact variant visual review pending',**recipe),indent=2))
exec(compile(source,str(out/'generator.py'),'exec'))
