"""Export Blender-authored bow variants as five named-node GLBs, one per height.
Meshes share material slots and binary accessors; editable Blender sources stay separate.
Run: nice -n 15 blender -b -t 2 -P scripts/art_library/export_bow_kit.py
"""
import bpy, json, sys, struct, hashlib, math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from bow_modules import bow_module
from ship_kit_export import module_object,slot_materials,SLOTS
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'assets/runtime/ship-kit/r002'

class Bundle:
    def __init__(self):
        self.binary=bytearray();self.shared={};self.vertices={};self.meshes={}
        materials=[]
        for slot in SLOTS:
            mat={'name':slot,'pbrMetallicRoughness':{'baseColorFactor':[.7,.7,.7,1],'metallicFactor':0,'roughnessFactor':.5}}
            if slot=='glass':
                mat.update(alphaMode='BLEND',doubleSided=False)
                mat['pbrMetallicRoughness']['baseColorFactor']=[.12,.35,.6,.28]
            materials.append(mat)
        self.doc={'asset':{'version':'2.0','generator':'Sidereal Blender bow bundle exporter'},'extensionsUsed':['KHR_mesh_quantization'],'extensionsRequired':['KHR_mesh_quantization'],'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':materials,'buffers':[],'bufferViews':[],'accessors':[]}

    def accessor(self,values,kind):
        is_index=kind=='INDEX';is_normal=kind=='NORMAL'; fmt='I' if is_index else ('b' if is_normal else 'f')
        if is_normal:values=[round(max(-1,min(1,v))*127) for v in values]
        data=struct.pack('<'+fmt*len(values),*values)
        key=(kind,data)
        if key in self.shared:return self.shared[key]
        self.binary.extend(b'\0'*((-len(self.binary))%4))
        view={'buffer':0,'byteOffset':len(self.binary),'byteLength':len(data),'target':34963 if is_index else 34962}
        self.binary.extend(data);self.doc['bufferViews'].append(view)
        a={'bufferView':len(self.doc['bufferViews'])-1,'componentType':5125 if is_index else (5120 if is_normal else 5126),'count':len(values) if is_index else len(values)//3,'type':'SCALAR' if is_index else 'VEC3'}
        if is_normal:a['normalized']=True
        if kind=='POSITION':a.update(min=[min(values[i::3]) for i in range(3)],max=[max(values[i::3]) for i in range(3)])
        index=len(self.doc['accessors']);self.doc['accessors'].append(a);self.shared[key]=index
        return index

    def add(self,ob):
        me=ob.data;me.calc_loop_triangles();primitives=[];count=0;slots=[]
        for slot in SLOTS:
            tris=[t for t in me.loop_triangles if me.materials[t.material_index].name.split('.')[0]==slot]
            if not tris:continue
            vertices={};pos=[];norm=[];indices=[]
            for tri in tris:
                n=tri.normal
                for index in tri.vertices:
                    v=me.vertices[index].co
                    key=tuple(struct.unpack('<3f',struct.pack('<3f',v.x,v.z,-v.y)))+tuple(round(k*127)/127 for k in (n.x,n.z,-n.y))
                    if key not in vertices:
                        vertices[key]=len(vertices);pos.extend(key[:3]);norm.extend(key[3:])
                    indices.append(vertices[key])
            # All variants share one Blender vertex table. Per-node indices retain
            # only the triangles used by that variant; importers compact them.
            remap={}
            for key,local in vertices.items():
                if key not in self.vertices:self.vertices[key]=len(self.vertices)
                remap[local]=self.vertices[key]
            indices=[remap[i] for i in indices]
            primitives.append({'attributes':{},'indices':self.accessor(indices,'INDEX'),'material':SLOTS.index(slot),'mode':4})
            count+=len(indices)//3;slots.append(slot)
        self.doc['scenes'][0]['nodes'].append(len(self.doc['nodes']))
        key=json.dumps(primitives,sort_keys=True)
        if key not in self.meshes:
            self.meshes[key]=len(self.doc['meshes'])
            self.doc['meshes'].append({'primitives':primitives})
        self.doc['nodes'].append({'name':ob.name,'mesh':self.meshes[key]})
        return count,slots

    def write(self,path):
        pos=[v for k in self.vertices for v in k[:3]]
        norm=[v for k in self.vertices for v in k[3:]]
        attrs={'POSITION':self.accessor(pos,'POSITION'),'NORMAL':self.accessor(norm,'NORMAL')}
        for mesh in self.doc['meshes']:
            for primitive in mesh['primitives']:primitive['attributes']=attrs
        self.binary.extend(b'\0'*((-len(self.binary))%4))
        self.doc['buffers']=[{'byteLength':len(self.binary)}]
        raw=json.dumps(self.doc,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4)
        data=struct.pack('<III',0x46546c67,2,28+len(raw)+len(self.binary))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(self.binary),0x004e4942)+self.binary
        path.write_bytes(data)
        return hashlib.sha256(data).hexdigest()

def main(out=OUT,pieces=ROOT/'packages/content/src/ship-kit-pieces.v1.json'):
    specs=json.loads(pieces.read_text())['pieces']
    manifest=json.loads((out/'manifest.json').read_text());total=0
    bpy.context.preferences.filepaths.save_version=0
    for hc in ['deck','pod','cabin','wing','plate']:
        bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
        bpy.data.orphans_purge(do_recursive=True)
        mats=slot_materials();bundle=Bundle()
        group=[s for s in specs if s['family']=='bow' and s['args'][1]==hc]
        filename=f'bow-{hc}.glb'
        for i,s in enumerate(group):
            p=bow_module(*s['args']);ob=module_object(p,mats)
            assert all(math.isfinite(x) for v in ob.data.vertices for x in v.co)
            triangles,slots=bundle.add(ob)
            manifest['pieces'][s['id']]={'file':filename,'node':ob.name,'triangles':triangles,'bounds':p.bounds(),'slots':slots,'decals':[],'voxelAligned':False}
            ob.location=((i%48)*5,(i//48)*5,0);total+=1
        digest=bundle.write(out/filename)
        for s in group:manifest['pieces'][s['id']]['sha256']=digest
        source=ROOT/'assets/source/ship-kit/r002' if out==OUT else out/'source'
        source.mkdir(parents=True,exist_ok=True)
        path=source/f'bow_{hc}.blend'
        bpy.ops.wm.save_as_mainfile(filepath=str(path),compress=True)
        print('BOW_HEIGHT_EXPORTED',hc,len(group),(out/filename).stat().st_size,flush=True)
    # Same canonical form as ship_kit_export.write_manifest: sorted pieces, sorted keys, indent 1.
    manifest['pieces']={k:manifest['pieces'][k] for k in sorted(manifest['pieces'])}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=1,sort_keys=True)+'\n')
    # Delete only superseded individual bow outputs, never the earlier canopy families.
    for path in out.glob('bow.*.glb'):path.unlink()
    print('BOW_EXPORT_VALIDATED',total,flush=True)
if __name__=='__main__':main()
