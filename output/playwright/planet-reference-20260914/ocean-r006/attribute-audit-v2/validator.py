"""Read-only native kit JSON versus GLB material/corner-attribute audit.
Run: python3 scripts/art_library/audit_native_kit_attributes.py --output NEW_DIR KIT_DIR...
Never rewrites candidate files. Expected material values come only from JSON;
actual glTF omission defaults are identified, not assumed to be source intent.
"""
import argparse, collections, hashlib, io, json, math, struct
from pathlib import Path

IDENTITY=[1.,0,0,0,0,1.,0,0,0,0,1.,0,0,0,0,1.]
def multiply(a,b):return [sum(a[r*4+k]*b[k*4+c]for k in range(4))for r in range(4)for c in range(4)]
def matrix(node):
 if 'matrix'in node:return [node['matrix'][c*4+r]for r in range(4)for c in range(4)]
 x,y,z,w=node.get('rotation',[0,0,0,1]);s=node.get('scale',[1,1,1]);t=node.get('translation',[0,0,0])
 a=[1-2*y*y-2*z*z,2*x*y-2*z*w,2*x*z+2*y*w,t[0],2*x*y+2*z*w,1-2*x*x-2*z*z,2*y*z-2*x*w,t[1],2*x*z-2*y*w,2*y*z+2*x*w,1-2*x*x-2*y*y,t[2],0,0,0,1]
 for r in range(3):
  for c in range(3):a[r*4+c]*=s[c]
 return a
def point(a,v):return tuple(sum(a[r*4+c]*v[c]for c in range(3))+a[r*4+3]for r in range(3))
def normalize(v):
 length=math.sqrt(sum(x*x for x in v))
 if length<1e-15:raise ValueError('zero normal')
 return tuple(x/length for x in v)
def normal(a,v):
 # Cofactor matrix / determinant is inverse-transpose for the upper3x3.
 x=[[a[r*4+c]for c in range(3)]for r in range(3)];cof=[]
 for r in range(3):
  for c in range(3):
   rows=[i for i in range(3)if i!=r];cols=[i for i in range(3)if i!=c]
   cof.append((-1)**(r+c)*(x[rows[0]][cols[0]]*x[rows[1]][cols[1]]-x[rows[0]][cols[1]]*x[rows[1]][cols[0]]))
 det=sum(x[0][c]*cof[c]for c in range(3))
 if abs(det)<1e-15:raise ValueError('singular node transform')
 return normalize(tuple(sum(cof[r*3+c]*v[c]/det for c in range(3))for r in range(3)))
def rotate(v):return(v[0],v[2],-v[1])
def quant(v,digits=5):return tuple(round(x,digits)for x in v)
def read_glb(path):
 raw=path.read_bytes();magic,version,total=struct.unpack_from('<III',raw)
 if magic!=0x46546c67 or version!=2 or total!=len(raw):raise ValueError('invalid GLB header/length')
 offset=12;g=None;binary=b''
 while offset<len(raw):
  length,kind=struct.unpack_from('<II',raw,offset);offset+=8;chunk=raw[offset:offset+length];offset+=length
  if kind==0x4e4f534a:g=json.loads(chunk)
  elif kind==0x004e4942:binary=chunk
 if g is None:raise ValueError('missing GLB JSON')
 return g,binary

def accessor(g,binary,index):
 a=g['accessors'][index]
 if 'sparse'in a:raise ValueError('sparse accessor unsupported; not silently ignored')
 component={5120:('b',1),5121:('B',1),5122:('h',2),5123:('H',2),5125:('I',4),5126:('f',4)}[a['componentType']]
 width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];fmt='<'+component[0]*width
 view=g['bufferViews'][a['bufferView']]
 if view.get('buffer',0)!=0:raise ValueError('external accessor buffer unsupported')
 start=view.get('byteOffset',0)+a.get('byteOffset',0);stride=view.get('byteStride',component[1]*width);result=[]
 for i in range(a['count']):
  value=struct.unpack_from(fmt,binary,start+i*stride)
  if a.get('normalized')and a['componentType']!=5126:
   signed=a['componentType']in(5120,5122);bits=component[1]*8;den=2**(bits-1)-1 if signed else 2**bits-1;value=tuple(max(-1,x/den)if signed else x/den for x in value)
  result.append(value)
 return result

def glb_corners(g,binary):
 corners=[];attributes=set()
 def visit(index,parent):
  node=g['nodes'][index];world=multiply(parent,matrix(node))
  if 'mesh'in node:
   for primitive in g['meshes'][node['mesh']]['primitives']:
    if primitive.get('mode',4)!=4:raise ValueError('non-triangle primitive unsupported')
    attrs={name:accessor(g,binary,a)for name,a in primitive['attributes'].items()if name in('POSITION','NORMAL','TEXCOORD_0')};attributes.update(attrs)
    indices=[x[0]for x in accessor(g,binary,primitive['indices'])]if 'indices'in primitive else range(len(attrs['POSITION']))
    material=g['materials'][primitive['material']]['name']
    for i in indices:corners.append((material,point(world,attrs['POSITION'][i]),normal(world,attrs['NORMAL'][i])if'NORMAL'in attrs else None,attrs['TEXCOORD_0'][i]if'TEXCOORD_0'in attrs else None))
  for child in node.get('children',[]):visit(child,world)
 roots=g.get('scenes',[{}])[g.get('scene',0)].get('nodes',[])
 if not roots:roots=[i for i in range(len(g.get('nodes',[])))if not any(i in n.get('children',[])for n in g['nodes'])]
 for root in roots:visit(root,IDENTITY)
 return corners,attributes

def compare_corners(expected,actual,has_normals,has_uvs,position_tol=1e-5,normal_tol=1e-4,uv_tol=1e-5):
 # Float32 transforms and Blender export normal rounding can cross a decimal
 # quantization bin. Match real distances with explicit tolerances, not rounded
 # Counter equality; preserve corner multiplicity and material boundaries.
 bins=collections.defaultdict(list)
 key=lambda c:(c[0],*(math.floor(x/position_tol)for x in c[1]))
 for i,c in enumerate(actual):bins[key(c)].append(i)
 used=set();missing=0;normal_bad=0;uv_bad=0;max_position=0;max_normal=0;max_uv=0
 for corner in expected:
  k=key(corner);candidates=[]
  for dx in(-1,0,1):
   for dy in(-1,0,1):
    for dz in(-1,0,1):
     for i in bins.get((k[0],k[1]+dx,k[2]+dy,k[3]+dz),[]):
      if i in used:continue
      other=actual[i];pd=math.dist(corner[1],other[1])
      if pd>position_tol:continue
      nd=math.dist(corner[2],other[2])if has_normals and other[2]is not None else 0
      ud=math.dist(corner[3],other[3])if has_uvs and other[3]is not None else 0
      candidates.append((pd/position_tol+nd/normal_tol+ud/uv_tol,i,pd,nd,ud))
  if not candidates:missing+=1;continue
  _,i,pd,nd,ud=min(candidates);used.add(i);max_position=max(max_position,pd);max_normal=max(max_normal,nd);max_uv=max(max_uv,ud)
  if nd>normal_tol:normal_bad+=1
  if ud>uv_tol:uv_bad+=1
 return {'positionMaterialCornerDifference':missing+len(actual)-len(used),'normalsCornerDifference':normal_bad,'uvsCornerDifference':uv_bad,'maximumMatchedPositionDelta':max_position,'maximumMatchedNormalDelta':max_normal,'maximumMatchedUVDelta':max_uv,'tolerances':{'position':position_tol,'normal':normal_tol,'uv':uv_tol}}

def compare_material(expected,actual):
 pbr=actual.get('pbrMetallicRoughness',{});ext=actual.get('extensions',{});actual_values={'linearColor':pbr.get('baseColorFactor',[1,1,1,1])[:3],'roughness':pbr.get('roughnessFactor',1),'metallic':pbr.get('metallicFactor',1),'alpha':pbr.get('baseColorFactor',[1,1,1,1])[3],'alphaMode':actual.get('alphaMode','OPAQUE'),'doubleSided':actual.get('doubleSided',False),'normalScale':actual.get('normalTexture',{}).get('scale',1),'ior':ext.get('KHR_materials_ior',{}).get('ior',1.5),'clearcoatFactor':ext.get('KHR_materials_clearcoat',{}).get('clearcoatFactor',0),'clearcoatRoughnessFactor':ext.get('KHR_materials_clearcoat',{}).get('clearcoatRoughnessFactor',0)}
 fields={k:v for k,v in expected.items()if k in actual_values}
 if 'clearCoat'in expected:fields.update({'clearcoatFactor':expected['clearCoat']['intensity'],'clearcoatRoughnessFactor':expected['clearCoat']['roughness']})
 def close(a,b):
  if isinstance(a,(list,tuple)):return len(a)==len(b)and all(close(x,y)for x,y in zip(a,b))
  if isinstance(a,(float,int))and not isinstance(a,bool):return abs(a-b)<1e-5
  return a==b
 issues=[]
 for key,value in fields.items():
  if not close(value,actual_values[key]):issues.append({'field':key,'expected':value,'actual':actual_values[key],'note':'Actual includes glTF defined omission defaults; no absent JSON field is treated as source intent.'})
 if 'emissiveColor'in expected:
  # Runtime kit convention: absent multiplier leaves the authored color as-is.
  e=[x*expected.get('emissiveStrength',1)for x in expected['emissiveColor']];strength=ext.get('KHR_materials_emissive_strength',{}).get('emissiveStrength',1);a=[x*strength for x in actual.get('emissiveFactor',[0,0,0])]
  if not close(e,a):issues.append({'field':'effectiveEmission','expected':e,'actual':a})
 return issues

def texture_bytes(g,binary,material,path,field='baseColorTexture'):
 if field in ('baseColorTexture','metallicRoughnessTexture'):info=material.get('pbrMetallicRoughness',{}).get(field)
 elif field=='clearcoatNormalTexture':info=material.get('extensions',{}).get('KHR_materials_clearcoat',{}).get(field)
 else:info=material.get(field)
 if info is None:return None
 image=g['images'][g['textures'][info['index']]['source']]
 if 'bufferView'in image:
  v=g['bufferViews'][image['bufferView']];return binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
 uri=image.get('uri','')
 if uri.startswith('data:'):
  import base64
  return base64.b64decode(uri.split(',',1)[1])
 return(path.parent/uri).read_bytes()
def texture_equal(a,b):
 if a==b:return'byte-identical'
 try:
  from PIL import Image
 except ImportError:return'bytes-differ-pixel-decoder-unavailable'
 x=Image.open(io.BytesIO(a)).convert('RGBA');y=Image.open(io.BytesIO(b)).convert('RGBA')
 return'pixel-identical'if x.size==y.size and x.tobytes()==y.tobytes()else'pixels-differ'

def audit(directory):
 directory=Path(directory);path=directory/'kit.json';kit=json.loads(path.read_text());report={'candidate':directory.name,'kit':str(path),'kitSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'materialDifferences':[],'attributeGaps':[],'variants':[],'limitations':['Material/position-matched corner multisets check values at explicit tolerances independently of index ordering, not mesh topology equivalence.','Only explicit JSON material fields are compared; source-side omissions remain unspecified.','Normals compared only when carried in JSON. Reconstruction of omitted normals by a renderer is outside this artifact audit.','Geometry converted from BlenderZ-up JSON to glTFY-up and accumulated node transforms; UVs follow recorded glTF convention.']}
 for variant in kit['variants']:
  glb=directory/(variant['name']+'.glb');result={'name':variant['name'],'glb':str(glb)};report['variants'].append(result)
  if not glb.exists():result['error']='matching GLB missing';continue
  try:
   g,binary=read_glb(glb);result['glbSha256']=hashlib.sha256(glb.read_bytes()).hexdigest();corners,attrs=glb_corners(g,binary)
   expected=[]
   for t in range(len(variant['indices'])//3):
    material=kit['materials'][variant['triangleMaterials'][t]]['name']
    for k in range(3):
     i=variant['indices'][t*3+k];expected.append((material,rotate(variant['positions'][i*3:i*3+3]),rotate(variant['normals'][i*3:i*3+3])if'normals'in variant else None,tuple(variant['uvs'][i*2:i*2+2])if'uvs'in variant else None))
   result['jsonCorners']=len(expected);result['glbCorners']=len(corners);result['glbAttributes']=sorted(attrs)
   result.update(compare_corners(expected,corners,'normals'in variant and'NORMAL'in attrs,'uvs'in variant and'TEXCOORD_0'in attrs))
   for field,attribute in [('normals','NORMAL'),('uvs','TEXCOORD_0')]:
    if field not in variant:
     if attribute in attrs:report['attributeGaps'].append({'variant':variant['name'],'field':field,'kind':'GLB channel not carried by JSON; derived runtime replacement cannot be audited here'})
    elif attribute not in attrs:report['attributeGaps'].append({'variant':variant['name'],'field':field,'kind':'JSON channel missing from GLB'})
   result['textures']=[]
   for material in g['materials']:
    authored=next((m for m in kit['materials']if m['name']==material['name']),None)
    if authored is None:report['materialDifferences'].append({'variant':variant['name'],'material':material['name'],'field':'missing JSON material'});continue
    for issue in compare_material(authored,material):report['materialDifferences'].append({'variant':variant['name'],'material':material['name'],**issue})
    for field in ('baseColorTexture','normalTexture','metallicRoughnessTexture','clearcoatNormalTexture'):
     if field not in authored:continue
     exported=texture_bytes(g,binary,material,glb,field);status='GLB texture missing'if exported is None else texture_equal((directory/authored[field]).read_bytes(),exported)
     result['textures'].append({'material':material['name'],'field':field,'expected':authored[field],'status':status})
  except Exception as error:result['error']=str(error)
 report['summary']={'variants':len(report['variants']),'materialDifferenceOccurrences':len(report['materialDifferences']),'attributeGaps':len(report['attributeGaps']),'variantErrors':sum('error'in v for v in report['variants']),'positionMismatchVariants':sum(bool(v.get('positionMaterialCornerDifference'))for v in report['variants']),'normalMismatchVariants':sum(bool(v.get('normalsCornerDifference'))for v in report['variants']),'uvMismatchVariants':sum(bool(v.get('uvsCornerDifference'))for v in report['variants'])}
 return report

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);parser.add_argument('directories',nargs='+');args=parser.parse_args();out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
 if(out/'report.json').exists():raise SystemExit('Refusing to overwrite saved audit; use a new output directory')
 reports=[audit(d)for d in args.directories];(out/'report.json').write_text(json.dumps(reports,indent=2)+'\n')
 lines=['# Native JSON / GLB attribute audit','', 'Read-only artifact audit. No candidate was modified; this is not visual or hardware acceptance.','', '| Candidate | Material differences | JSON/GLB channel gaps | Position mismatch variants | Normal mismatch variants | UV mismatch variants | Errors |','|---|---:|---:|---:|---:|---:|---:|']
 for r in reports:
  s=r['summary'];lines.append(f"| {r['candidate']} | {s['materialDifferenceOccurrences']} | {s['attributeGaps']} | {s['positionMismatchVariants']} | {s['normalMismatchVariants']} | {s['uvMismatchVariants']} | {s['variantErrors']} |")
 for r in reports:
  lines.extend(['',f"## {r['candidate']}",''])
  unique={(x['material'],x['field'],json.dumps(x.get('expected')),json.dumps(x.get('actual')))for x in r['materialDifferences']}
  for name,field,expected,actual in sorted(unique):lines.append(f'- Material `{name}` / `{field}`: JSON {expected}; GLB {actual}.')
  gaps=collections.Counter((x['field'],x['kind'])for x in r['attributeGaps'])
  for(field,kind),count in gaps.items():lines.append(f'- {count} variants: `{field}` — {kind}.')
  for v in r['variants']:
   for t in v.get('textures',[]):lines.append(f"- `{v['name']}` texture `{t['expected']}`: {t['status']}.")
   if'error'in v:lines.append(f"- `{v['name']}`: {v['error']}")
 lines.extend(['','## Limits','',*['- '+x for x in reports[0]['limitations']],'','Full per-variant hashes, corner counts and exact differences are in report.json.'])
 (out/'report.md').write_text('\n'.join(lines)+'\n');print(json.dumps([{r['candidate']:r['summary']}for r in reports],indent=2))
if __name__=='__main__':main()
