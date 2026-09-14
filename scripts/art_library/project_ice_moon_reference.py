#!/usr/bin/env python3
"""Allowlisted, reproducible runtime projection. Preserves all frozen authoring files.
Prepare the projection, run the independent equality suite, then seal provenance.
"""
import argparse,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
RULE='sidereal.ice-moon-used-native-variants.v1'
KEPT=['snow-cut-region','snow-open-gorge','ground-sphere']
OMITTED=['ground-sphere-medium','ground-sphere-low']
# Exact frozen inputs, not a general-purpose kit transformation.
APPROVED={
 'ice-moon-1-r002':{'sourceSHA256':'dd192b60d46ad562bef442306a7ded75053647ea69a5ceca2fe05b70323a5fb8','projectionSHA256':'8bf42eb720f34978fc174ce519a76b72f8b27debbd42f80e700d5f0383f50b95','equalitySHA256':'55bd56f68d2aa3d649ebb7a37c60fe0fd0cf7d4fba910be3733ec802b421ec7a'},
 'ice-moon-2-r002':{'sourceSHA256':'15cc6b11bcdc0abb94987bf36f632bdf0a71ef315b7e66d76c3da90bb66ae64e','projectionSHA256':'f5e21fbe3c38689fddcc3a8120eeec2715c8265ceef31af28d13a8175e95c2ee','equalitySHA256':'ec8af4494dee272f6a2958fc90568e5e3e46253ccb4a8849ce3ffb9bb2d7d388'},
}
def sha(raw):return hashlib.sha256(raw).hexdigest()
def encode(value):return (json.dumps(value,separators=(',',':'),ensure_ascii=False,allow_nan=False)+'\n').encode()
def checked_file(path,parent):
 if path.is_symlink() or not path.resolve().is_relative_to(parent.resolve()):raise ValueError('Projection file escapes its fixed directory')
 return path.read_bytes()
def paths(revision,root):
 if revision not in APPROVED:raise ValueError('Runtime projection is restricted to Ice moon 1/2 r002')
 evidence=root/'output/playwright/planet-reference-20260914';source=evidence/revision;destination=evidence/'runtime-projections'/revision
 for folder in [source,evidence/'runtime-projections',destination]:
  if folder.is_symlink() or not folder.resolve().is_relative_to(evidence.resolve()):raise ValueError('Projection directory escapes fixed evidence root')
 return source,destination

def prepare(revision,root=ROOT):
 source,destination=paths(revision,root);raw=checked_file(source/'kit.json',source)
 if sha(raw)!=APPROVED[revision]['sourceSHA256']:raise ValueError('Frozen full-source hash differs')
 kit=json.loads(raw)
 if kit.get('schema')!='sidereal.native-planet-kit.v1' or kit.get('layout')!='ice-moon-glacial':raise ValueError('Expected frozen Ice moon layout')
 names=[v.get('name')for v in kit['variants']]
 if names!=KEPT+OMITTED:raise ValueError('Unexpected native variant order or coverage')
 kit['variants']=[v for v in kit['variants']if v['name']in KEPT];projected=encode(kit)
 if len(projected)>64*1024*1024:raise ValueError('Projected kit exceeds unchanged staging bound')
 destination.mkdir(parents=True,exist_ok=True)
 path=destination/'kit.json'
 if path.exists():
  if checked_file(path,destination)!=projected:raise FileExistsError('Preserve existing projection: bytes differ')
 else:path.write_bytes(projected)
 return destination

def expected_record(revision,source_raw,projected,equality_raw):
 return{'schema':'sidereal.runtime-projection.v1','rule':RULE,'revision':revision,'source':{'path':f'output/playwright/planet-reference-20260914/{revision}/kit.json','sha256':sha(source_raw),'bytes':len(source_raw)},'projection':{'path':f'output/playwright/planet-reference-20260914/runtime-projections/{revision}/kit.json','sha256':sha(projected),'bytes':len(projected)},'keptVariantIds':KEPT,'omittedVariantIds':OMITTED,'preserved':'all retained native geometry attributes, placement recipe, materials and top-level metadata; source archive unchanged','equalityEvidence':{'path':'equality.json','sha256':sha(equality_raw)}}

def seal(revision,root=ROOT):
 destination=prepare(revision,root);source,_=paths(revision,root);source_raw=checked_file(source/'kit.json',source);projected=checked_file(destination/'kit.json',destination);equality=checked_file(destination/'equality.json',destination)
 approved=APPROVED[revision]
 if not approved.get('equalitySHA256') or sha(equality)!=approved['equalitySHA256']:raise ValueError('Equality evidence has not been independently verified and pinned')
 record=expected_record(revision,source_raw,projected,equality);raw=encode(record);target=destination/'projection.json'
 if target.exists():
  if checked_file(target,destination)!=raw:raise FileExistsError('Preserve existing projection record')
 else:target.write_bytes(raw)
 return destination

def validated_projection(revision,root=ROOT):
 source,destination=paths(revision,root);approved=APPROVED[revision]
 source_raw=checked_file(source/'kit.json',source)
 if sha(source_raw)!=approved['sourceSHA256']:raise ValueError('Frozen full-source hash differs')
 projected=checked_file(destination/'kit.json',destination);equality=checked_file(destination/'equality.json',destination)
 if not approved.get('projectionSHA256') or sha(projected)!=approved['projectionSHA256']:raise ValueError('Projected kit hash differs from verified output')
 if not approved.get('equalitySHA256') or sha(equality)!=approved['equalitySHA256']:raise ValueError('Equality evidence hash differs')
 record=json.loads(checked_file(destination/'projection.json',destination))
 if record!=expected_record(revision,source_raw,projected,equality):raise ValueError('Projection metadata differs from verified provenance')
 return projected,record

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('revision',choices=APPROVED);parser.add_argument('--seal',action='store_true');args=parser.parse_args();print(seal(args.revision)if args.seal else prepare(args.revision))
