"""Record independent reviewer acceptance only; never owner sign-off/publication."""
from pathlib import Path
from argparse import Namespace
import json,sys,hashlib,shutil
R=Path(__file__).resolve().parents[2];B=R/'.runtime/art-library/cargo';sys.path.insert(0,str(R/'scripts'));import art_catalog as ac
reviews=json.loads((B/'reviews/final-review.json').read_text());assert reviews['visual']['no_further_feedback'] and reviews['physical']['no_further_feedback'] and reviews['coverage']['no_further_feedback'];manifest=json.loads((B/'current/manifest.json').read_text());designs=sorted({e['design_id'] for e in manifest['entries']});refresh=ac.refresh;ac.refresh=lambda:None
with ac.locked():
 for design in designs:
  ledger=ac.read(ac.design_path(design));revision=ledger['revisions'][-1];assert ledger['owner_final_signoff'] is None
  current=[e for e in manifest['entries'] if e['design_id']==design];assert all(e['revision']==revision['revision'] for e in current)
  for entry in current:
   d=Path(entry['output']);assert hashlib.sha256((d/'blender-source.blend').read_bytes()).hexdigest()==entry['source_sha256'];assert hashlib.sha256((d/'glb.glb').read_bytes()).hexdigest()==entry['glb_sha256']
  # All membership is explicit covered geometry/finish/reuse, never a broad inferred family.
  assert set(ledger['reference_ids'])==set(revision['covered_reference_ids']),design+' has unreviewed appearances'
  folder=ac.design_path(design).parent/'revisions'/f"r{revision['revision']:03}";dest=folder/'independent-final-review.json';src=B/'reviews/final-review.json'
  if not dest.exists():shutil.copy2(src,dest);revision['evidence'].append(dict(role='validation',path=str(dest.relative_to(ac.LIB)),sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),bytes=dest.stat().st_size,notes='Independent Astra final acceptance, exact artifact hashes in collection manifest. No owner sign-off.',capture_context=None,recorded_at=ac.now()))
  for feedback in ledger['feedback']:
   if feedback['author']=='agent':feedback['resolved_by_revision']=revision['revision']
  ledger['mapping_status']='Explicit canonical geometry with every assigned source appearance covered by current primary, finish/accessory or unchanged-reuse evidence; no owner approval.'
  ledger['next_action']='Owner review of exact current revision; further feedback starts a preserved new revision; publication requires separate authorization.'
  ac.write(ac.design_path(design),ledger)
  text='Independent Astra visual/runtime, mechanical and coverage reviews passed with no further feedback for the exact current source/GLB hashes. Next action: owner review of this exact revision; any requested change becomes a new revision. Stats remain proposed, runtime behavior unimplemented, publication separately authorized.'
  ac.mutate(Namespace(command='feedback',design=design,revision=revision['revision'],author='agent',text=text,message_reference=None));ac.mutate(Namespace(command='review',design=design,revision=revision['revision'],outcome='pass',notes=text))
 ac.refresh=refresh;ac.refresh()
print('Ready for owner review:',len(designs),'designs. No owner sign-offs created.')
