"""Audit installed native planet artifacts independently of presentation state."""
from pathlib import Path
import hashlib,json,struct

ROOT=Path(__file__).resolve().parents[1]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def validate():
    results=[]
    for path in sorted((ROOT/'assets/runtime/planets').glob('*/manifest.json')):
        m=json.loads(path.read_text())
        assert m['schema']=='sidereal.native-planet-runtime-manifest.v1'
        for record in m['files']+m['sources']:
            p=path.parent/record['path'] if record in m['files'] else ROOT/record['path']
            assert p.is_file() and sha(p)==record['sha256'],str(p)
            assert p.stat().st_size==record['bytes'],str(p)
        kit=json.loads((path.parent/'kit.json').read_text())
        assert kit['schema']=='sidereal.native-planet-kit.v1'
        triangles=0
        for index,form in enumerate(kit['variants']):
            raw=(path.parent/f'form-{index}.glb').read_bytes()
            assert raw[:4]==b'glTF' and struct.unpack_from('<I',raw,4)[0]==2
            assert struct.unpack_from('<I',raw,8)[0]==len(raw)
            gltf=json.loads(raw[20:20+struct.unpack_from('<I',raw,12)[0]])
            primitives=[p for mesh in gltf['meshes']for p in mesh['primitives']]
            count=sum(gltf['accessors'][p['indices']]['count']for p in primitives)
            assert count==len(form['indices']) and count%3==0
            assert len(form['triangleMaterials'])==count//3
            assert all(0<=i<len(form['positions'])//3 for i in form['indices'])
            assert all(0<=i<len(kit['materials'])for i in form['triangleMaterials'])
            triangles+=count//3
        results.append({'revision':m['revision'],'files':len(m['files']),'native_form_triangles':triangles,'manifest_sha256':sha(path)})
    out=ROOT/'docs/releases/native-ship-2026-09-08/planet-asset-validation.json'
    out.write_text(json.dumps({'status':'passed','scope':'Pinned source/artifact hashes and GLB/compiled-stream topology counts; actual visual review recorded separately','planets':results},indent=2)+'\n')
    print(json.dumps(results))
if __name__=='__main__':validate()
