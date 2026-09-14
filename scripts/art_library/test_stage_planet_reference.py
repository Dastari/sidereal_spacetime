import json,tempfile,unittest
from pathlib import Path
from stage_planet_reference import stage_revision, REVISION
class StagingTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name);self.source=self.root/'output/playwright/planet-reference-20260914/ice-r025';self.source.mkdir(parents=True);self.kit={'schema':'sidereal.native-planet-kit.v1','materials':[{'baseColorTexture':'albedo.png','normalTexture':'normal.png'}],'variants':[]};self.save();(self.source/'albedo.png').write_bytes(b'EXACT ALBEDO');(self.source/'normal.png').write_bytes(b'EXACT NORMAL');(self.source/'kit.blend').write_bytes(b'PRIVATE EDITABLE SOURCE');(self.source/'reference.png').write_bytes(b'UNREQUESTED REFERENCE');hdr=self.root/'assets/runtime/materials';hdr.mkdir(parents=True);(hdr/'frontier-workshop.hdr').write_bytes(b'EXACT HDR')
 def save(self):(self.source/'kit.json').write_text(json.dumps(self.kit))
 def test_only_declared_payload_is_staged_exactly_and_idempotently(self):
  destination,manifest=stage_revision('ice-r025',self.root);self.assertEqual({p.name for p in destination.iterdir()},{'kit.json','albedo.png','normal.png','frontier-workshop.hdr','staging-manifest.json'});self.assertEqual((destination/'kit.json').read_bytes(),(self.source/'kit.json').read_bytes());self.assertEqual(stage_revision('ice-r025',self.root),(destination,manifest));self.assertFalse((destination/'kit.blend').exists())
 def test_all_nineteen_numbered_moons_match_typescript_families(self):
  families=[f'{family}-moon-{number}' for family in ['desert','rocky','ocean','temperate','ice','crystal','toxic','volcanic'] for number in [1,2]]+[f'gas-giant-moon-{number}' for number in [1,2,3]]
  self.assertEqual(len(families),19)
  for family in families:
   revision=family+'-r002'
   with self.subTest(revision=revision):
    source=self.source.parent/revision;source.mkdir()
    for name in ['kit.json','albedo.png','normal.png']:(source/name).write_bytes((self.source/name).read_bytes())
    destination,manifest=stage_revision(revision,self.root)
    self.assertEqual(manifest['revision'],revision)
    self.assertEqual((destination/'kit.json').read_bytes(),(source/'kit.json').read_bytes())
  for invalid in ['ice-moon-r002','ice-moon-3-r002','gas-moon-1-r002','gas-giant-moon-4-r002','cloud-moon-1-r002','rocky-moon-0-r002']:
   with self.subTest(invalid=invalid):self.assertIsNone(REVISION.fullmatch(invalid))
  ts=(Path(__file__).parent/'planet_reference_direct_paths.ts').read_text()
  family_expression=ts.split("const FAMILY='")[1].split("';")[0]
  self.assertEqual(REVISION.pattern,family_expression+r'-r[0-9]{3}\Z')
 def test_rejects_paths_schemes_and_encoded_traversal(self):
  for bad in ['../ice-r025','ice-r025/../gas-r005','/etc/passwd','https://a','ice-r025%2f..','ice-r025\\..','ice-r025\0','other-r025']:
   with self.subTest(bad=bad),self.assertRaises(ValueError):stage_revision(bad,self.root)
  for bad in ['../secret.png','/secret.png','a.png?x','sub/a.png','run.js']:
   self.kit['materials'][0]['baseColorTexture']=bad;self.save()
   with self.assertRaises(ValueError):stage_revision('ice-r025',self.root)
 def test_rejects_symlink_escape_and_partial_staging(self):
  target=self.source/'albedo.png';target.unlink();outside=self.root/'secret';outside.write_bytes(b'SECRET');target.symlink_to(outside)
  with self.assertRaises(ValueError):stage_revision('ice-r025',self.root)
  self.assertFalse((self.root/'scripts/art_library/review-staging/ice-r025').exists())
 def test_immutable_revision_rejects_source_or_destination_changes(self):
  destination,_=stage_revision('ice-r025',self.root);(destination/'albedo.png').write_bytes(b'MODIFIED')
  with self.assertRaises(FileExistsError):stage_revision('ice-r025',self.root)
  (destination/'albedo.png').write_bytes(b'EXACT ALBEDO');(self.source/'normal.png').write_bytes(b'NEW SOURCE')
  with self.assertRaises(FileExistsError):stage_revision('ice-r025',self.root)
if __name__=='__main__':unittest.main()
