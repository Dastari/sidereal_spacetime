#!/usr/bin/env python3
"""Package reviewed Genesis assets, one source at a time; never alter native art.
Run with --source-root pointing to the checkout containing real (not LFS pointer)
accepted output files. SDNPK001 stores geometry as lossless little-endian f64/u32.
"""
import argparse,array,gc,hashlib,json,re,struct,sys
from pathlib import Path
from project_ice_moon_reference import validated_projection
ROOT=Path(__file__).resolve().parents[2]
REL=Path('output/playwright/planet-reference-20260914')
LIMIT=64*1024*1024
WEATHER_PINS={'cloud-r002':'ae4a1f95517ff4425d0f7ab532c2d91e960b6512f833c23d01b816e717dbdd01','toxic-fog-r005':'f4f47fdf8a2652d91284c77ac591b522adae45795495c4fd45c3c8a258deb731'}
FIELDS=('positions','normals','uvs','indices','triangleMaterials')
TEXTURES=('baseColorTexture','normalTexture','emissiveTexture','metallicRoughnessTexture','clearcoatNormalTexture')
def sha(b):return hashlib.sha256(b).hexdigest()
def encode(v):return json.dumps(v,ensure_ascii=False,separators=(',',':'),allow_nan=False).encode()
def packed(kit):
 headerkit={**kit,'variants':[]};buffers=[];blob=bytearray()
 for variant in kit['variants']:
  target=dict(variant);headerkit['variants'].append(target)
  for field in FIELDS:
   if field not in variant:continue
   values=variant[field];integer=field in ('indices','triangleMaterials');kind='I' if integer else 'd'
   if integer and any(not isinstance(x,int) or x<0 or x>0xffffffff for x in values):raise ValueError('Non-u32 index')
   data=array.array(kind,values)
   if data.itemsize!=(4 if integer else 8):raise ValueError('Unexpected native array width')
   if sys.byteorder!='little':data.byteswap()
   raw=data.tobytes();blob.extend(b'\0'*((-len(blob))%8));offset=len(blob);blob.extend(raw)
   # Independent unpack compares every value, including IEEE signed-zero bits.
   for original,(restored,) in zip(values,struct.iter_unpack('<I' if integer else '<d',raw)):
    if struct.pack('<d',original)!=struct.pack('<d',restored):raise ValueError('Numeric roundtrip differs')
   target[field]={'$nativeBuffer':len(buffers)};buffers.append({'type':'u32' if integer else 'f64','offset':offset,'length':len(values)})
 header=encode({'kit':headerkit,'buffers':buffers})
 if len(header)>4*1024*1024:raise ValueError('Header bound')
 prefix=b'SDNPK001'+struct.pack('<II',len(header),len(blob))+header
 return prefix+b'\0'*((-len(prefix))%8)+blob

def write_exact(path,raw):
 path.parent.mkdir(parents=True,exist_ok=True)
 if path.exists() and path.read_bytes()!=raw:raise ValueError(f'Existing package differs: {path}')
 if not path.exists():path.write_bytes(raw)

def package(revision,expected,source,out):
 directory=source/REL/revision;raw=(directory/'kit.json').read_bytes();sourcehash=sha(raw)
 if expected and sourcehash!=expected:raise ValueError(f'Unaccepted source hash: {revision}')
 projection=None
 if revision=='ice-moon-1-r002':raw,projection=validated_projection(revision,source)
 kit=json.loads(raw);encoding='json'
 if len(raw)>LIMIT:raw=packed(kit);encoding='native-packed-v1'
 if len(raw)>LIMIT:raise ValueError(f'Payload exceeds unchanged 64MiB cap: {revision}')
 filename='kit.snp' if encoding!='json' else 'kit.json';destination=out/revision;write_exact(destination/filename,raw)
 textures={}
 for material in kit['materials']:
  for field in TEXTURES:
   name=material.get(field)
   if not name:continue
   if not isinstance(name,str) or not re.fullmatch(r'[A-Za-z0-9_-]+\.(png|jpg|jpeg|webp|ktx2|basis)',name):raise ValueError(f'Unsafe texture path {name}')
   texture=(directory/name).read_bytes();write_exact(destination/name,texture);textures[name]={'sha256':sha(texture),'bytes':len(texture)}
 descriptor={'revision':revision,'layout':kit['layout'],'kitURL':f'/reviewed-planets/{revision}/{filename}','textureBaseURL':f'/reviewed-planets/{revision}/','sourceKitSha256':sourcehash,'runtimeKitSha256':sha(raw),'encoding':encoding}
 provenance={'schema':'sidereal.reviewed-native-package.v1','sourcePath':str(REL/revision/'kit.json'),'sourceKitSha256':sourcehash,'runtime':{**descriptor,'bytes':len(raw)},'textures':textures,'projection':projection,'numericTransport':'exact source JSON binary64 values; u32 triangle/role indices; unchanged metadata, variant order and attributes','roundTrip':'every packed numeric value independently unpacked and IEEE binary64 compared' if encoding!='json' else 'byte-identical validated projection' if projection else 'byte-identical source'}
 write_exact(destination/'provenance.json',encode(provenance)+b'\n')
 print(revision,encoding,len(raw),flush=True)
 return descriptor

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source-root',type=Path,required=True);parser.add_argument('--output-root',type=Path,default=ROOT/'apps/dashboard/public/reviewed-planets');args=parser.parse_args()
 manifest=json.loads((ROOT/REL/'reviews/broader-seed-capture-manifest.json').read_text());jobs={j['revision']:j for j in manifest['jobs']};catalog=[];weather={}
 if len(jobs)!=28:raise ValueError('Expected exact 28 reviewed candidates')
 for revision,job in jobs.items():
  descriptor=package(revision,job['kitSha256'],args.source_root,args.output_root)
  descriptor.update(id=revision,label=revision.rsplit('-r',1)[0].replace('-',' ').title(),style=job['style'],fixedDetail=revision not in ('desert-r014','ocean-r007','temperate-r003','volcanic-r023'),glow=job['lighting']['glow'],localLight=job['lighting']['localLight'])
  if job['style'] in ('ocean','temperate','toxic'):
   wr=job['weatherRevision']
   if wr not in weather:weather[wr]=package(wr,WEATHER_PINS[wr],args.source_root,args.output_root)
   descriptor['weather']=weather[wr]
  catalog.append(descriptor);gc.collect()
 target=ROOT/'packages/render/src/environment/reviewed-native-planet-catalog.json';target.write_text(json.dumps(catalog,indent=2)+'\n')
 print('Packaged 28 reviewed bodies and',len(weather),'weather kits',flush=True)
if __name__=='__main__':main()
