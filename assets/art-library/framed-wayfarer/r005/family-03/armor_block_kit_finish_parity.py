"""Verify a bounded identity graphic edit preserves native geometry and metric maps."""
import argparse,hashlib,json,math
from pathlib import Path
from PIL import Image,ImageChops
from armor_block_kit_check import reader,sha

def geometry_signature(path):
 data,doc,blob=reader.read_glb(path);result=[]
 for node,matrix in reader.scene_nodes(doc):
  if 'mesh' not in node:continue
  streams=[]
  for primitive in doc['meshes'][node['mesh']]['primitives']:
   streams.append({'attributes':{name:reader.accessor(doc,blob,index) for name,index in primitive['attributes'].items()},'indices':reader.accessor(doc,blob,primitive['indices'])})
  result.append({'name':node['name'],'matrix':matrix,'streams':streams})
 raw=json.dumps(result,sort_keys=True,separators=(',',':')).encode();return hashlib.sha256(raw).hexdigest()

def check(before,after):
 before,after=Path(before),Path(after);old=json.loads((before/'models.json').read_text());new=json.loads((after/'models.json').read_text());older={m['modelId']:m for m in old['models']};newer={m['modelId']:m for m in new['models']};shared=[]
 assert set(older)<=set(newer)
 for ident,a in older.items():
  b=newer[ident]
  for key in ('bounds','contacts','backingSolids','backingVolumeM3','parameters'):assert a[key]==b[key],(ident,key)
  previous=geometry_signature(before/a['glb']);current=geometry_signature(after/b['glb']);assert previous==current,(ident,'GEOMETRY_OR_UV_CHANGED')
  shared.append({'modelId':ident,'geometryAndMetricUvSha256':current})
 maps=[]
 for name in ('armor-normal.png','armor-roughness.png'):
  a,b=before/'textures'/name,after/'textures'/name;assert sha(a)==sha(b),(name,'UNEXPECTED_PHYSICAL_MATERIAL_CHANGE');maps.append({'path':'textures/'+name,'sha256':sha(b),'byteIdentical':True})
 a=Image.open(before/'textures/armor-basecolor.png').convert('RGB');b=Image.open(after/'textures/armor-basecolor.png').convert('RGB');diff=ImageChops.difference(a,b);bbox=diff.getbbox();assert bbox
 # PNG coordinates are top-down. Source atlas identity region is [12,0,2,3]m.
 density=new['textureTexelsPerMetre'];expected=(12*density,a.height-3*density,14*density,a.height)
 assert expected[0]<=bbox[0] and expected[1]<=bbox[1] and expected[2]>=bbox[2] and expected[3]>=bbox[3],('COLOR_CHANGE_ESCAPES_IDENTITY_REGION',bbox,expected)
 arrangement=[]
 for name,assembly in old['assemblies'].items():
  aa=assembly['placements'];bb=new['assemblies'][name]['placements'];assert len(aa)==len(bb)
  finishchanges=[]
  for x,y in zip(aa,bb):
   assert {k:v for k,v in x.items() if k!='modelId'}=={k:v for k,v in y.items() if k!='modelId'}
   if x['modelId']!=y['modelId']:
    p,q=older[x['modelId']]['parameters'],newer[y['modelId']]['parameters'];assert {k:v for k,v in p.items() if k!='finish'}=={k:v for k,v in q.items() if k!='finish'}
    assert p['finish']=='identity' and q['finish']=='plain';finishchanges.append(x['placementId'])
  arrangement.append({'name':name,'placementTransformsUnchanged':True,'identityToPlainFinishOnly':finishchanges})
 identities=[]
 for p in new['assemblies']['wayfarer']['placements']:
  m=newer[p['modelId']]
  if m['parameters'].get('finish')=='identity':
   fit=m['graphicFit'];g=fit['graphicMetricUvBounds'];safe=fit['safeFaceMetricUvBounds'];assert all((g[i]>=safe[i] if i<2 else g[i]<=safe[i]) for i in range(4));identities.append({'placementId':p['placementId'],'edgeIndex':p['edgeIndex'],'graphicFit':fit})
 assert len(identities)==2 and {p['edgeIndex'] for p in identities}=={1,9}
 result={'schema':'sidereal.native-identity-finish-parity.v1','status':'pass','beforeManifestSha256':sha(before/'models.json'),'afterManifestSha256':sha(after/'models.json'),'checkerSha256':sha(__file__),'unchangedExistingModels':shared,'physicalMaterialMaps':maps,'baseColorChangePixelBounds':bbox,'allowedIdentityRegionPixelBounds':expected,'assemblyParity':arrangement,'wayfarerIdentityFaces':identities,'newDisplayFixtureModels':sorted(set(newer)-set(older)),'scope':'Existing position, normal, tangent, UV and index streams, node transforms, bounds, contacts and backing parameters are identical. Only bounded identity base-color pixels and two identity-to-plain fixture finishes changed. An additional numerically equivalent 2m identity display specimen is isolated from existing placements.'}
 dest=after/'validation-finish-parity.json';assert not dest.exists();dest.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':'pass','unchangedExistingModels':len(shared),'baseColorChangePixelBounds':bbox,'identityFaces':2}))
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('before');p.add_argument('after');a=p.parse_args();check(a.before,a.after)
