"""Freeze a reviewed native attempt and encode supported glTF colour factors.

Blender's glTF exporter omits the constant side of a MixRGB MULTIPLY node. This
bounded postprocess writes that same linear factor into glTF baseColorFactor;
pixels, geometry, rig, UVs and all other materials are untouched. No publication.
"""
import argparse,hashlib,json,shutil,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def linear(hexcolor):
    values=[int(hexcolor[i:i+2],16)/255 for i in [1,3,5]]
    return [v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in values]
def main():
    p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('output');args=p.parse_args()
    source=(ROOT/args.source).resolve();out=(ROOT/args.output).resolve()
    assert source.is_relative_to(ROOT) and out.is_relative_to(ROOT) and not out.exists()
    assert source.joinpath('modular-crew.glb').is_file() and source.joinpath('blender-source.blend').is_file()
    shutil.copytree(source,out)
    factors={
        'crew.face.iris':[*linear('#754c2b'),1],
        'crew.face.brows':[*(v*.5 for v in linear('#353047')),1],
        'crew.face.facialHair':[*(v*.72 for v in linear('#353047')),1],
    }
    records=[]
    for file in sorted(out.glob('*.glb')):
        raw=file.read_bytes();n,kind=struct.unpack_from('<II',raw,12);assert kind==0x4e4f534a
        data=json.loads(raw[20:20+n]);changed=[]
        for material in data.get('materials',[]):
            if material['name'] in factors:
                material['pbrMetallicRoughness']['baseColorFactor']=factors[material['name']];changed.append(material['name'])
        if changed:
            encoded=json.dumps(data,separators=(',',':')).encode();encoded+=b' '*((-len(encoded))%4)
            tail=raw[20+n:];packed=struct.pack('<III',0x46546c67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+tail
            file.write_bytes(packed)
        records.append({'file':file.name,'sourceSha256':sha(source/file.name),'sha256':sha(file),'encodedNativeMultiplyFactors':changed})
    shutil.copy2(__file__,out/'pack_faces.py')
    (out/'export-factor-record.json').write_text(json.dumps({'sourceAttempt':str(source.relative_to(ROOT)),'nativeSourceSha256':sha(out/'blender-source.blend'),
        'reason':'Encode the existing native Multiply constant as glTF baseColorFactor. No source pixels, geometry, UVs, skin or animation modification.',
        'factors':factors,'files':records,'ownerFinalSignoff':None},indent=2)+'\n')
    print(json.dumps({'candidate':str(out.relative_to(ROOT)),'files':len(records),'runtimeSha256':sha(out/'modular-crew.glb')}))
if __name__=='__main__':main()
