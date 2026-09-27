import json,struct,unittest
from preserve_native_kit_ior import corrected_glb
class IorPreservationTests(unittest.TestCase):
 def test_changes_only_explicit_ior_and_keeps_all_binary_bytes(self):
  original={'asset':{'version':'2.0'},'materials':[{'name':'crystal','pbrMetallicRoughness':{'roughnessFactor':.2},'extensions':{'KHR_materials_clearcoat':{'clearcoatFactor':.4}}},{'name':'unknown'}]}
  encoded=json.dumps(original).encode();encoded+=b' '*((-len(encoded))%4)
  tail=struct.pack('<II',8,0x004e4942)+b'12345678'
  raw=struct.pack('<III',0x46546c67,2,20+len(encoded)+len(tail))+struct.pack('<II',len(encoded),0x4e4f534a)+encoded+tail
  result,changes=corrected_glb(raw,{'crystal':{'ior':1.48},'unknown':{'roughness':.5}})
  length=struct.unpack_from('<I',result,12)[0];g=json.loads(result[20:20+length])
  self.assertEqual(result[20+length:],tail)
  self.assertEqual(g['materials'][0]['extensions']['KHR_materials_ior']['ior'],1.48)
  self.assertEqual(g['materials'][0]['extensions']['KHR_materials_clearcoat'],original['materials'][0]['extensions']['KHR_materials_clearcoat'])
  self.assertEqual(g['materials'][1],original['materials'][1]);self.assertEqual(len(changes),1)
  again,no_changes=corrected_glb(result,{'crystal':{'ior':1.48}})
  self.assertEqual(again,result);self.assertEqual(no_changes,[])
 def test_rejects_invalid_container(self):
  with self.assertRaises(ValueError):corrected_glb(struct.pack('<III',0,2,12),{})
if __name__=='__main__':unittest.main()
