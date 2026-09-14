#!/usr/bin/env python3
"""Explicit local-review staging. No server start or production publication.
Copies one immutable selected kit, only its referenced images, and the fixed HDR.
"""
import argparse, hashlib, json, re, shutil, tempfile
from pathlib import Path
from project_ice_moon_reference import validated_projection
ROOT=Path(__file__).resolve().parents[2]
REVISION=re.compile(r'(?:(?:desert|rocky|ocean|temperate|ice|crystal|toxic|volcanic)(?:-moon-[12])?|rocky-moon|gas-giant-moon-[123]|toxic-fog|gas|cloud)-r[0-9]{3}\Z')
TEXTURE=re.compile(r'[A-Za-z0-9_-]+\.(?:png|jpg|jpeg|webp|ktx2|basis)\Z',re.I)
FIELDS=('baseColorTexture','normalTexture','emissiveTexture','metallicRoughnessTexture','clearcoatNormalTexture')
def digest(data):return hashlib.sha256(data).hexdigest()
def stage_revision(revision,root=ROOT,runtime_projection=False):
 if not isinstance(revision,str) or not REVISION.fullmatch(revision):raise ValueError('Unsupported revision folder')
 evidence=root/'output/playwright/planet-reference-20260914';source=evidence/revision
 if source.is_symlink() or not source.resolve().is_relative_to(evidence.resolve()):raise ValueError('Revision escapes fixed evidence root')
 kit_path=source/'kit.json'
 if kit_path.is_symlink() or not kit_path.resolve().is_relative_to(source.resolve()):raise ValueError('Kit escapes revision')
 projection=None
 if runtime_projection:raw,projection=validated_projection(revision,root)
 else:raw=kit_path.read_bytes()
 if len(raw)>64*1024*1024:raise ValueError('Kit exceeds review payload bound')
 kit=json.loads(raw)
 if kit.get('schema')!='sidereal.native-planet-kit.v1' or not isinstance(kit.get('materials'),list):raise ValueError('Expected native planet kit')
 payload={'kit.json':raw}
 for material in kit['materials']:
  for field in FIELDS:
   if field not in material:continue
   filename=material[field]
   if not isinstance(filename,str) or not TEXTURE.fullmatch(filename):raise ValueError('Texture must be a flat revision-local image filename')
   path=source/filename
   if path.is_symlink() or not path.resolve().is_relative_to(source.resolve()):raise ValueError('Texture escapes selected revision')
   payload[filename]=path.read_bytes()
 hdr=root/'assets/runtime/materials/frontier-workshop.hdr'
 if hdr.is_symlink() or not hdr.resolve().is_relative_to((root/'assets/runtime/materials').resolve()):raise ValueError('HDR escapes fixed runtime source')
 payload['frontier-workshop.hdr']=hdr.read_bytes()
 if len(payload)>128 or sum(map(len,payload.values()))>256*1024*1024:raise ValueError('Review payload bound exceeded')
 manifest={'scope':'explicit isolated local review; no production publication','revision':revision,'source':f'output/playwright/planet-reference-20260914/{revision}','files':{name:{'sha256':digest(data),'bytes':len(data)}for name,data in sorted(payload.items())}}
 if projection:manifest['runtimeProjection']=projection
 staging=root/'scripts/art_library/review-staging'
 if staging.is_symlink() or not staging.resolve().is_relative_to((root/'scripts/art_library').resolve()):raise ValueError('Staging root escapes review tooling')
 destination=staging/revision
 if destination.is_symlink():raise ValueError('Staging destination cannot be a symlink')
 if destination.exists():
  if not (destination/'staging-manifest.json').is_file() or json.loads((destination/'staging-manifest.json').read_text())!=manifest:raise FileExistsError('Preserve staged revision; manifest differs')
  if {p.name for p in destination.iterdir()}!=set(payload)|{'staging-manifest.json'}:raise FileExistsError('Unexpected file in immutable staged revision')
  for name,data in payload.items():
   target=destination/name
   if target.is_symlink() or not target.is_file() or target.read_bytes()!=data:raise FileExistsError('Staged content differs from manifest')
  return destination,manifest
 staging.mkdir(parents=True,exist_ok=True)
 temporary=Path(tempfile.mkdtemp(prefix='.stage-',dir=staging))
 try:
  for name,data in payload.items():(temporary/name).write_bytes(data)
  (temporary/'staging-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
  temporary.rename(destination)
 except BaseException:
  shutil.rmtree(temporary,ignore_errors=True);raise
 return destination,manifest
if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('revision');parser.add_argument('--runtime-projection',action='store_true',help='Use a hash-verified, equality-proven Ice moon 1/2 r002 runtime projection');args=parser.parse_args();path,manifest=stage_revision(args.revision,runtime_projection=args.runtime_projection);print(json.dumps({'directory':str(path),'manifest':manifest},indent=2))
