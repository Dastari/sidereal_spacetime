"""Reversible R006 finish study. Never modifies approved inputs or publishes assets."""
from pathlib import Path
import json,struct,hashlib,sys,subprocess,tomllib
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/art-library/shipyard-hull/material-studies/native-r006-polymer-01'
SOURCE=ROOT/'assets/art-library/designs/shipyard.hull.pilot-section/revisions/r006/blender-source.blend'
def role(name):
    if name in ('clean hull paint','clean nameplate'):return dict(metallic=0,roughness=.60,coat=.16,mapped=True)
    if name=='Graphite seals':return dict(metallic=0,roughness=.60,coat=0,mapped=False)
    if name in ('Service red','Outer service paint / palette 15 sRGB 8e345b'):return dict(metallic=0,roughness=.29,coat=.12,mapped=False)
def sha(b):return hashlib.sha256(b).hexdigest()
if '--blender' in sys.argv:
    import bpy
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    audit=[]
    for m in bpy.data.materials:
        r=role(m.name)
        if not r or not m.use_nodes:continue
        p=next(n for n in m.node_tree.nodes if n.type=='BSDF_PRINCIPLED')
        if r['mapped'] and p.inputs['Roughness'].is_linked:
            link=p.inputs['Roughness'].links[0];upstream=link.from_socket;m.node_tree.links.remove(link)
            node=m.node_tree.nodes.new('ShaderNodeMath');node.operation='MULTIPLY';node.name='Study roughness multiplier';node.inputs[1].default_value=r['roughness'];m.node_tree.links.new(upstream,node.inputs[0]);m.node_tree.links.new(node.outputs[0],p.inputs['Roughness'])
        else:p.inputs['Roughness'].default_value=r['roughness']
        for key,v in [('Metallic',0),('IOR',1.46),('Coat Weight',r['coat']),('Coat Roughness',.2)]:p.inputs[key].default_value=v
        audit.append({'name':m.name,**r})
    bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'candidate.blend'))
    (OUT/'source-material-changes.json').write_text(json.dumps(audit,indent=2))
    raise SystemExit()
if (OUT/'study.json').exists():raise SystemExit('Preserve existing study; select a new revision')
OUT.mkdir(parents=True,exist_ok=True)
records=[]
for path in sorted((ROOT/'.runtime/art-library/hull/r006').glob('*/clean.glb')):
    raw=path.read_bytes();n=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+n]);tail=raw[20+n:];changes=[]
    for m in doc.get('materials',[]):
        r=role(m['name'])
        if not r:continue
        before=json.loads(json.dumps(m));p=m['pbrMetallicRoughness'];p['metallicFactor']=0;p['roughnessFactor']=r['roughness'];e=m.setdefault('extensions',{});e['KHR_materials_ior']={'ior':1.46};e['KHR_materials_clearcoat']={'clearcoatFactor':r['coat'],'clearcoatRoughnessFactor':.2};changes.append({'before':before,'after':m})
    if not changes:continue
    for extension in ['KHR_materials_ior','KHR_materials_clearcoat']:
        if extension not in doc.setdefault('extensionsUsed',[]):doc['extensionsUsed'].append(extension)
    chunk=json.dumps(doc,separators=(',',':')).encode();chunk+=b' '*((-len(chunk))%4)
    dst=OUT/path.parent.name/'clean.glb';dst.parent.mkdir(exist_ok=True);dst.write_bytes(struct.pack('<4sII',b'glTF',2,20+len(chunk)+len(tail))+struct.pack('<I4s',len(chunk),b'JSON')+chunk+tail)
    records.append({'slug':path.parent.name,'source':str(path.relative_to(ROOT)),'sourceSha256':sha(raw),'candidate':str(dst.relative_to(ROOT)),'sha256':sha(dst.read_bytes()),'binaryBufferUnchanged':True,'binarySha256':sha(tail),'changes':changes})
(OUT/'study.json').write_text(json.dumps({'status':'staged; awaiting matched game image review','publication':False,'approval':None,'source':str(SOURCE.relative_to(ROOT)),'sourceSha256':sha(SOURCE.read_bytes()),'scope':'R006 named hull paint/seal/accent roles only; equipment, glass, metal, emitters, floor ORM and geometry unchanged','exports':records},indent=2))
config=tomllib.loads((ROOT/'dev.toml').read_text());subprocess.run([config['art']['blender'],'--background','--threads','4','--python-exit-code','1','--python',__file__,'--','--blender'],check=True,cwd=ROOT)
print(json.dumps({'exports':len(records),'output':str(OUT)}))
