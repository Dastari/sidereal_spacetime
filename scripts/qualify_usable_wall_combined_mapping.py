"""Exact offline50-ID asset replacement mapping; never alters a live assembly."""
import hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
BASE=ROOT/'assets/art-library/designs/shipyard.structure.usable-boundary-wall/revisions/r000'
MAP=ROOT/'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003/replacement-mapping.json'
POCKET=ROOT/'assets/art-library/designs/shipyard.hull.shoulder-construction-interface/revisions/r000/a003'

def plan():
 original={p['sourcePlacedId']:p for p in json.loads(MAP.read_text())['preserveOriginalPlacements']}
 bindings=[];proofs=[]
 for path in [BASE/'a006/qualification-a002.json',BASE/'a009/qualification-a002.json',POCKET/'qualification-a001.json']:
  report=json.loads(path.read_text());assert report['pass']
  proofs.append({'path':str(path.relative_to(ROOT)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'nativeChecks':len(report['checks'])})
 def add(ident,path,sha,prefix,role):
  assert path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest()==sha
  record=original[ident]
  bindings.append({'sourcePlacedId':ident,'originalPlacement':record['originalPlacement'],'originalVisual':record['visual'],
   'candidateNativeVisual':{'path':str(path.relative_to(ROOT)),'sha256':sha,'nodePrefix':prefix},'role':role,
   'placedIdentityUnchanged':True,'positionRotationMirrorUnchanged':True,'gameplayStateMigration':'Preserve original UUID/state through future authoritative expected-revision refit; this record does not execute one.'})
 for directory in [BASE/'a006',BASE/'a009']:
  manifest=json.loads((directory/'delivery-manifest.json').read_text())
  assert manifest['sourceMappingSha256']==hashlib.sha256(MAP.read_bytes()).hexdigest()
  for part in manifest['parts']:
   assert part['originalPlacement']==original[part['sourcePlacedId']]['originalPlacement']
   add(part['sourcePlacedId'],directory/part['file'],part['sha256'],part['nodePrefix'],'Native exterior structure/facing; named retained partitions preserve their separate historical role.')
 pocket=json.loads((POCKET/'delivery-manifest.json').read_text())
 for ident in pocket['preservePlacedIds']:
  kind='shoulder' if 'shoulder-transition' in ident else 'collar'
  asset=next(a for a in pocket['exports'] if a['id']==kind)
  add(ident,POCKET/asset['file'],asset['sha256'],None,'Separate armor with structural pocket' if kind=='shoulder' else 'Roof collar with structural pocket; obey roof/cutaway visibility')
 assert len(bindings)==len({p['sourcePlacedId'] for p in bindings})==50
 assert len(original)==262
 return {'schema':'sidereal.usable-wall-combined-asset-candidate.v1','sourceMappingSha256':hashlib.sha256(MAP.read_bytes()).hexdigest(),
   'originalPlacementCount':262,'preservedOriginalPlacementIds':list(original),'bindings':bindings,'proofs':proofs,
   'removedPlacedIds':[],'addedPlacedIds':[],'sourceTransformsChanged':0,'installed':False,'ownerFinalArtSignoff':None,
   'wholeTemplateAdmissible':False,'remaining':['Combined full-ship collision/support and retained partition mating qualification.','Whole native enclosure/leak qualification and pressure volume derivation.','Source-pinned authority/cutaway/damage bindings and exact installed-game review.'],
   'publicationRule':'Install only exact pinned native files after whole-candidate qualification. Do not overwrite the full live assembly snapshot or change equipment transforms.'}
if __name__=='__main__':
 result=plan();path=BASE/'a009/combined-replacement-mapping.json'
 if path.exists():assert json.loads(path.read_text())==result
 else:path.write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps({'bindings':len(result['bindings']),'preservedPlacements':262,'changedTransforms':0,'nativeChecks':sum(p['nativeChecks'] for p in result['proofs'])}))
