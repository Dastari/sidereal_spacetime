"""Owner-directed Ice26: selected native tall shard sides gain transmission only.
Geometry, snow caps, terrain and existing source optics stay intact.
"""
import sys,hashlib
from pathlib import Path
out=Path(sys.argv[sys.argv.index('--')+1]).resolve();out.mkdir(parents=True,exist_ok=True);assert not(out/'kit.blend').exists()
path=Path('/root/sidereal_spacetime/scripts/art_library/build_ice_native_kit_r025.py');source=path.read_text().replace("'native-ice-r025'","'native-ice-r026'")
insertion='''
# Selected authored tall crystal-ice sides only. Snow caps keep role0, all other
# opaque ice/cavity/ground geometry and material assignments stay unchanged.
optical_selected=['GEO-hero-blue-column','GEO-blue-column-mid-a','GEO-bank-attached-blue-cluster-1-1','GEO-gorge-unequal-column-0','GEO-gorge-unequal-column-2','GEO-gorge-unequal-column-5']
optical_definition=[]
for name,color,rough,transmission,thickness in [('clear-glacial-shard',(.42,.77,.94),.075,.82,.16),('blue-glacial-shard',(.20,.56,.85),.11,.68,.20)]:
 m=bpy.data.materials.new(name);m.use_nodes=True;shader=m.node_tree.nodes.get('Principled BSDF');shader.inputs['Base Color'].default_value=(*color,1);shader.inputs['Roughness'].default_value=rough;shader.inputs['IOR'].default_value=1.31;shader.inputs['Transmission Weight'].default_value=transmission;shader.inputs['Coat Weight'].default_value=.18;shader.inputs['Coat Roughness'].default_value=.08
 group=bpy.data.node_groups.new('glTF Material Output '+name,'ShaderNodeTree');group.interface.new_socket('Thickness',in_out='INPUT',socket_type='NodeSocketFloat');group.nodes.new('NodeGroupInput');group.nodes.new('NodeGroupOutput');node=m.node_tree.nodes.new('ShaderNodeGroup');node.node_tree=group;node.inputs['Thickness'].default_value=thickness
 volume=m.node_tree.nodes.new('ShaderNodeVolumeAbsorption');volume.inputs['Color'].default_value=(.42,.72,.96,1);volume.inputs['Density'].default_value=1/1.8;output=m.node_tree.nodes.get('Material Output');m.node_tree.links.new(volume.outputs['Volume'],output.inputs['Volume'])
 definition=dict(name=name,linearColor=list(color),roughness=rough,metallic=0,ior=1.31,transmissionFactor=transmission,thicknessFactor=thickness,attenuationColor=[.42,.72,.96],attenuationDistance=1.8,clearcoatFactor=.18,clearcoatRoughnessFactor=.08,opticalRole='transmissive-ice-shard')
 materials.append(m);definitions.append(definition);optical_definition.append(definition)
optical_counts={}
for name,parts in forms:
 for obj in parts:
  if obj.name not in optical_selected:continue
  for mat in materials[5:]:obj.data.materials.append(mat)
  count=0
  for face in obj.data.polygons:
   if face.material_index in (2,3,4) and abs(face.normal.z)<.45:
    face.material_index=5 if face.material_index==3 else 6;count+=1
  obj['role']='planet';obj['opticalRole']='selected-transmissive-sides-opaque-snow-cap';obj['opticalMaterialRoles']='[5,6]';optical_counts[obj.name]=count
assert set(optical_counts)==set(optical_selected) and min(optical_counts.values())>0,optical_counts
'''
source=source.replace("kit={'schema'",insertion+"\nkit={'schema'")
source=source.replace("# Native powder and facet optical finish", "kit['opticalPolicy']={'scope':'Selected named tall shard vertical sides only; opaque snow caps and surrounding geology','transmissiveRoleIds':[5,6],'opaqueRoleIds':[0,1,2,3,4],'selectedNativeObjects':optical_selected,'selectedNativeFaceCounts':optical_counts}\n# Native powder and facet optical finish")
(out/'generator.py').write_text(source);(out/'foundation-source.py').write_bytes(path.read_bytes());(out/'foundation-sha256.txt').write_text(hashlib.sha256(path.read_bytes()).hexdigest()+'\n')
exec(compile(source,str(out/'generator.py'),'exec'))
