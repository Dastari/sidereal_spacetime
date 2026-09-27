"""Read-only Gas5 UV-only preservation checks; standard-library only."""
import json,unittest
from audit_native_kit_attributes import read_glb,accessor
from gas_preservation_fixtures import GasRevision
OLD=GasRevision('gas-r004');NEW=GasRevision('gas-r005')
TRANSFORMS=[(.22,.56),(.25,.50),(.12,.76)]
class Gas5PreservationTests(unittest.TestCase):
 def test_materials_body_debris_and_textures_remain_exact(self):
  old=json.loads((OLD/'kit.json').read_text());new=json.loads((NEW/'kit.json').read_text())
  self.assertEqual(old['materials'],new['materials'])
  for name in ['gas-body.glb','ring-rocks.glb','gas-albedo-generated.png','ring-dust-0.png','ring-dust-1.png','ring-dust-2.png']:self.assertEqual((OLD/name).read_bytes(),(NEW/name).read_bytes())
 def test_json_changes_only_radial_v_on_three_dust_variants(self):
  old=json.loads((OLD/'kit.json').read_text());new=json.loads((NEW/'kit.json').read_text())
  for a,b in zip(old['variants'],new['variants']):
   if not a['name'].startswith('ring-dust-'):self.assertEqual(a,b);continue
   index=int(a['name'].rsplit('-',1)[1]);offset,span=TRANSFORMS[index]
   self.assertEqual({k:v for k,v in a.items()if k!='uvs'},{k:v for k,v in b.items()if k!='uvs'})
   for i,(before,after)in enumerate(zip(a['uvs'],b['uvs'])):self.assertAlmostEqual(after,offset+span*before if i%2 else before,places=12)
 def test_glb_position_normal_and_indices_are_exact(self):
  for i in range(3):
   a,ab=read_glb(OLD/f'ring-dust-{i}.glb');b,bb=read_glb(NEW/f'ring-dust-{i}.glb')
   for am,bm in zip(a['meshes'],b['meshes']):
    for ap,bp in zip(am['primitives'],bm['primitives']):
     for field in ['POSITION','NORMAL']:self.assertEqual(accessor(a,ab,ap['attributes'][field]),accessor(b,bb,bp['attributes'][field]))
     self.assertEqual(accessor(a,ab,ap['indices']),accessor(b,bb,bp['indices']))
 def test_current_uv_transforms_commute_with_blender_to_gltf_v_flip(self):
  # In general JSON V'=1-offset-span+span*V. Current centred transforms
  # satisfy 2*offset+span=1, making the authored offset+span*V equivalent.
  for offset,span in TRANSFORMS:
   self.assertAlmostEqual(2*offset+span,1)
   for v in [0,.2,.5,.8,1]:self.assertAlmostEqual(1-(offset+span*(1-v)),offset+span*v)
if __name__=='__main__':unittest.main()
