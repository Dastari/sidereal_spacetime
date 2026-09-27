"""Independent exported backing contact-face and assembled socket validation."""
import argparse,hashlib,json,math
from pathlib import Path
from armor_block_kit_check import reader,cross3,dot3,sub,transformed,sha

def validate(base):
 base=Path(base);manifest=json.loads((base/'models.json').read_text());models={m['modelId']:m for m in manifest['models']};faces=[]
 for rec in models.values():
  data,doc,blob=reader.read_glb(base/rec['glb']);assert hashlib.sha256(data).hexdigest()==rec['sha256'];backing=[]
  for node,matrix in reader.scene_nodes(doc):
   if 'mesh' not in node or node.get('extras',{}).get('render_group')!='BACKING':continue
   for primitive in doc['meshes'][node['mesh']]['primitives']:
    verts=[reader.world_point(p,matrix) for p in reader.accessor(doc,blob,primitive['attributes']['POSITION'])];indices=[v[0] for v in reader.accessor(doc,blob,primitive['indices'])]
    backing.extend([[verts[j] for j in indices[i:i+3]] for i in range(0,len(indices),3)])
  for name in ('incoming','outgoing'):
   contact=rec['contacts'][name];normal=contact['normal'];center=contact['position'];area=0.;count=0
   for tri in backing:
    cr=cross3(sub(tri[1],tri[0]),sub(tri[2],tri[0]));length=math.sqrt(dot3(cr,cr))
    if all(abs(dot3(sub(v,center),normal))<2e-5 for v in tri) and dot3(cr,normal)/length>.99999:
     area+=length/2;count+=1
   p=rec['parameters'];height=p['heightM'] if p['kind']=='span' else p['incomingHeightM' if name=='incoming' else 'outgoingHeightM'];expected=p['backingDepthM']*height
   assert abs(area-expected)<2e-5,(rec['modelId'],name,'BACKING_CONTACT_AREA',area,expected)
   faces.append({'modelId':rec['modelId'],'contact':name,'areaM2':area,'expectedAreaM2':expected,'exportedFaceTriangles':count})
 assemblies=[]
 for name,assembly in manifest['assemblies'].items():
  sockets=[];rotationchecks=0
  for place in assembly['placements']:
   rec=models[place['modelId']];yaw=place['rotationZRad'];c,s=math.cos(yaw),math.sin(yaw)
   vec=place.get('nominalEndpointVector32')
   if vec:
    expected=math.atan2(vec[1],vec[0]);assert abs(math.atan2(math.sin(yaw-expected),math.cos(yaw-expected)))<1e-12;rotationchecks+=1
   for side in ('incoming','outgoing'):
    socket=rec['contacts'][side];point=transformed(socket['position'],place)+[socket['position'][2]+place['position'][2]];n=socket['normal'];normal=[c*n[0]-s*n[1],s*n[0]+c*n[1],n[2]]
    sockets.append({'placementId':place['placementId'],'side':side,'point':point,'normal':normal})
  pairs=[];matched=set()
  for i,a in enumerate(sockets):
   if i in matched:continue
   matches=[(j,b) for j,b in enumerate(sockets[i+1:],i+1) if j not in matched and b['placementId']!=a['placementId'] and math.dist(a['point'],b['point'])<2e-5 and dot3(a['normal'],b['normal'])<-.99999]
   assert len(matches)<=1,(name,'AMBIGUOUS_CONTACT',a,matches)
   if matches:
    j,b=matches[0];matched.update((i,j));pairs.append({'a':a['placementId']+':'+a['side'],'b':b['placementId']+':'+b['side'],'gapM':math.dist(a['point'],b['point']),'normalDot':dot3(a['normal'],b['normal'])})
  unpaired=[a for i,a in enumerate(sockets) if i not in matched]
  if assembly.get('boundaryEndpoints32'):assert not unpaired,(name,'UNPAIRED_CLOSED_BOUNDARY_CONTACTS',unpaired)
  assemblies.append({'name':name,'pairedContacts':pairs,'openFixtureEnds':len(unpaired),'closedBoundary':bool(assembly.get('boundaryEndpoints32')),'endpointDerivedYawChecks':rotationchecks})
 result={'schema':'sidereal.native-block-contact-validation.v1','status':'pass','manifestSha256':sha(base/'models.json'),'validatorSha256':sha(__file__),'dependencySha256':sha(Path(__file__).with_name('armor_block_kit_check.py')),'backingContactFaces':faces,'assemblies':assemblies,'scope':'Exact exported backing triangles cover each native named span/corner contact plane; placed sockets coincide with opposing normals. Closed polygons permit no unpaired ends. Direction proofs derive yaw directly from declared integer endpoint vectors.'}
 dest=base/'validation-contacts.json';assert not dest.exists();dest.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'status':'pass','backingContactFaces':len(faces),'closedBoundaryPairedContacts':{r['name']:len(r['pairedContacts']) for r in assemblies if r['closedBoundary']}}))
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory');a=p.parse_args();validate(a.directory)
