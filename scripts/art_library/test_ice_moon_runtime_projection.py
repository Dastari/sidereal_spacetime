import json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
import project_ice_moon_reference as projection
from stage_planet_reference import stage_revision
class ProjectionTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name);self.revision='ice-moon-1-r002';self.source=self.root/'output/playwright/planet-reference-20260914'/self.revision;self.source.mkdir(parents=True)
  self.kit={'schema':'sidereal.native-planet-kit.v1','layout':'ice-moon-glacial','compositionRecipe':{'seed':38},'materials':[{'name':'native','baseColorTexture':'albedo.png'}],'variants':[{'name':name,'positions':[1,2,3],'normals':[0,0,1],'uvs':[.25,.5]}for name in projection.KEPT+projection.OMITTED]}
  self.source_raw=projection.encode(self.kit);(self.source/'kit.json').write_bytes(self.source_raw);(self.source/'albedo.png').write_bytes(b'ORIGINAL IMAGE');(self.source/'source.blend').write_bytes(b'KEEP PRIVATE');hdr=self.root/'assets/runtime/materials';hdr.mkdir(parents=True);(hdr/'frontier-workshop.hdr').write_bytes(b'HDR')
  # Synthetic pins exist only within this test's patched registry. CLI cannot override pins.
  self.approved={self.revision:{'sourceSHA256':projection.sha(self.source_raw)}};self.mock=patch.object(projection,'APPROVED',self.approved);self.mock.start();self.addCleanup(self.mock.stop)
  self.destination=projection.prepare(self.revision,self.root);self.projection_raw=(self.destination/'kit.json').read_bytes();self.equality_raw=projection.encode({'testFixture':'synthetic equality proof'});(self.destination/'equality.json').write_bytes(self.equality_raw);self.approved[self.revision].update(projectionSHA256=projection.sha(self.projection_raw),equalitySHA256=projection.sha(self.equality_raw));projection.seal(self.revision,self.root)
 def test_stages_only_verified_projection_and_original_images_with_honest_manifest(self):
  destination,manifest=stage_revision(self.revision,self.root,runtime_projection=True)
  self.assertEqual((destination/'kit.json').read_bytes(),self.projection_raw);self.assertEqual((destination/'albedo.png').read_bytes(),b'ORIGINAL IMAGE');self.assertEqual((self.source/'kit.json').read_bytes(),self.source_raw)
  self.assertEqual(manifest['runtimeProjection']['source']['sha256'],projection.sha(self.source_raw));self.assertEqual(manifest['runtimeProjection']['projection']['sha256'],projection.sha(self.projection_raw));self.assertNotEqual(manifest['runtimeProjection']['source']['sha256'],manifest['files']['kit.json']['sha256']);self.assertFalse((destination/'source.blend').exists());self.assertEqual(projection.prepare(self.revision,self.root),self.destination)
 def test_source_projection_equality_and_record_tampering_are_rejected(self):
  for path in [self.source/'kit.json',self.destination/'kit.json',self.destination/'equality.json',self.destination/'projection.json']:
   old=path.read_bytes();path.write_bytes(old.replace(b'{',b'{"tampered":true,',1))
   with self.subTest(path=path.name),self.assertRaises(ValueError):stage_revision(self.revision,self.root,runtime_projection=True)
   path.write_bytes(old)
  self.assertFalse((self.root/'scripts/art_library/review-staging'/self.revision).exists())
 def test_rejects_unsupported_revision_and_symlink_escape(self):
  for revision in ['ice-r025','ice-moon-1-r003','ice-moon-3-r002','../ice-moon-1-r002']:
   with self.subTest(revision=revision),self.assertRaises(ValueError):projection.prepare(revision,self.root)
  path=self.destination/'kit.json';raw=path.read_bytes();path.unlink();outside=self.root/'outside.json';outside.write_bytes(raw);path.symlink_to(outside)
  with self.assertRaises(ValueError):stage_revision(self.revision,self.root,runtime_projection=True)
 def test_texture_path_guards_still_apply_to_a_verified_projection(self):
  projected=json.loads(self.projection_raw);projected['materials'][0]['baseColorTexture']='../secret.png';raw=projection.encode(projected);(self.destination/'kit.json').write_bytes(raw);self.approved[self.revision]['projectionSHA256']=projection.sha(raw)
  record=projection.expected_record(self.revision,self.source_raw,raw,self.equality_raw);(self.destination/'projection.json').write_bytes(projection.encode(record))
  with self.assertRaisesRegex(ValueError,'flat revision-local'):stage_revision(self.revision,self.root,runtime_projection=True)
 def test_unpinned_proof_and_conflicting_projection_are_refused(self):
  self.approved[self.revision].pop('equalitySHA256')
  with self.assertRaises(ValueError):projection.seal(self.revision,self.root)
  (self.destination/'kit.json').write_bytes(b'CHANGED')
  with self.assertRaises(FileExistsError):projection.prepare(self.revision,self.root)
if __name__=='__main__':unittest.main()
