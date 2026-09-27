"""Validate and preserve review metadata for the isolated fluid extension outputs."""
from pathlib import Path
import hashlib,json,math,shutil,struct,zipfile
from PIL import Image

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'.runtime/art-library/cargo/fluid-extension/r001'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def validate(path):
    b=path.read_bytes();magic,version,length=struct.unpack_from('<III',b)
    assert magic==0x46546C67 and version==2 and length==len(b)
    offset=12;doc=None;binary=None
    while offset<len(b):
        size,kind=struct.unpack_from('<II',b,offset);chunk=b[offset+8:offset+8+size];offset+=8+size
        if kind==0x4E4F534A:doc=json.loads(chunk)
        if kind==0x004E4942:binary=chunk
    assert doc is not None and binary is not None
    finite=0;normals=0
    for mesh in doc.get('meshes',[]):
        for p in mesh['primitives']:
            for name in ['POSITION','NORMAL']:
                a=doc['accessors'][p['attributes'][name]];v=doc['bufferViews'][a['bufferView']]
                assert a['componentType']==5126 and a['type']=='VEC3'
                start=v.get('byteOffset',0)+a.get('byteOffset',0);stride=v.get('byteStride',12)
                for i in range(a['count']):
                    values=struct.unpack_from('<fff',binary,start+i*stride);assert all(math.isfinite(x) for x in values)
                    if name=='NORMAL':assert .95<sum(x*x for x in values)<1.05;normals+=1
                    else:finite+=1
    return {'glb_version':version,'mesh_count':len(doc.get('meshes',[])),'material_count':len(doc.get('materials',[])),'finite_positions':finite,'unit_normals':normals,'extensions_used':doc.get('extensionsUsed',[]),'sha256':sha(path)}

jobs=json.loads((OUT/'jobs.json').read_text());variants=json.loads((OUT/'variant-jobs.json').read_text()) if (OUT/'variant-jobs.json').exists() else []
summary=[]
for j in jobs+variants:
    p=Path(j['output'])
    if not (p/'capture-record.json').exists():continue
    spec=json.loads((p/'specification.json').read_text());refid=spec['reference_ids'][0]
    meta=json.loads((ROOT/'assets/art-library/assets'/refid/'reference.json').read_text());ref=ROOT/'assets/art-library'/meta['crop_path']
    if not (p/'reference.png').exists():shutil.copyfile(ref,p/'reference.png')
    with Image.open(p/'cutout.png') as im:
        assert im.mode=='RGBA';alpha=im.getchannel('A');extrema=alpha.getextrema();assert extrema[0]==0 and extrema[1]>0
    val=json.loads((p/'validation-blender.json').read_text());val['native_glb_validation']=validate(p/'glb.glb');val['alpha']={'mode':'RGBA','extrema':list(extrema),'verified_transparent_background':True}
    val['source_reference']={'id':refid,'crop_path':str(ref),'crop_sha256':sha(ref),'source_sha256':meta['source_sha256']}
    val['independent_review']='Pending; authoring-agent validation is not acceptance.'
    (p/'validation.json').write_text(json.dumps(val,indent=2)+'\n')
    recipe=p/'recipe.zip'
    if not recipe.exists():
        with zipfile.ZipFile(recipe,'w',zipfile.ZIP_DEFLATED) as z:
            for source in sorted((ROOT/'scripts/art_library').glob('cargo_fluid_extension*.py')):z.write(source,source.name)
            z.write(p/'specification.json','specification.json')
            if (p/'preset.json').exists():z.write(p/'preset.json','preset.json')
    note=f"# {j.get('id',j['design_id'])} — unsigned draft\n\nTargets `{refid}` at a proposed medium scale. Exact crop is preserved in `reference.png`. Blender source contains editable native solids/materials and semantic sockets; GLB preserves authored surface detail.\n\nMeasured exterior: {spec['dimensions_m']} m. Proposed usable capacity: {spec['usable_capacity']['value']} L at fill fraction {spec['usable_capacity']['fill_fraction']}. Mass and operating values are proposals; pressure, thermal, chemical compatibility and loaded transport have not been validated.\n\nReal Cycles close/top renders and alpha cutout are saved. Primary designs additionally include underside and diagnostic cavity views; the diagnostic hides selected shielding and closures and does not claim an implemented opening mechanism. Source shell topology, positive material volumes, finite native GLB positions and unit normals were checked.\n\nRuntime capture, crew-scale fitting evidence, independent agent review and exact owner approval are separate outstanding stages. No publication or live database mutation.\n"
    if 'geometry_note' in j:note+='\n'+j['geometry_note']+'\n'
    (p/'review.md').write_text(note)
    summary.append({'id':j.get('id',j['design_id']),'output':str(p),'reference_ids':[refid],'capacity_L':spec['usable_capacity']['value'],'dimensions_m':spec['dimensions_m'],'validation':str(p/'validation.json'),'glb_sha256':sha(p/'glb.glb')})
(OUT/'artifact-summary.json').write_text(json.dumps({'primary_count':sum('appearance-' not in x['id'] for x in summary),'variant_count':sum('appearance-' in x['id'] for x in summary),'artifacts':summary,'publication':False},indent=2)+'\n')
print('Validated preserved source/GLB/alpha for',len(summary),'fluid appearance artifacts.')
