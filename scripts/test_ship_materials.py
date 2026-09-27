"""CPU material contract tests; python3 scripts/test_ship_materials.py."""
import json,struct,tempfile,unittest
from pathlib import Path
from ship_materials import preserve_polymer_ior,ship_surface_slot

class ShipMaterialTests(unittest.TestCase):
    def test_optics_emission_soft_and_matter_roles_stay_separate(self):
        self.assertEqual(ship_surface_slot(3),10) # ceramic edge is a dielectric
        self.assertEqual([ship_surface_slot(i) for i in (9,10,30)],[2]*3)
        self.assertEqual([ship_surface_slot(i) for i in (7,31,34,35)],[1,4,5,7])
        self.assertEqual([ship_surface_slot(i) for i in (23,24,32)],[3]*3)
        self.assertEqual([ship_surface_slot(i) for i in (6,21)],[6]*2)
    def test_equipment_and_assembly_do_not_adopt_ship_policy(self):
        self.assertEqual(ship_surface_slot(3,'equipment-control-console'),2)
        self.assertEqual(ship_surface_slot(15,'room-lounge'),0)
        self.assertEqual(ship_surface_slot(3,'walls',assembly=True),2)
        self.assertEqual(ship_surface_slot(15,'walls'),12)
    def test_opaque_ior_preserves_binary_and_unrelated_materials(self):
        doc={'materials':[{'name':'MAT-light-hull-polymer'},{'name':'MAT-exposed-steel'}]}
        data=json.dumps(doc).encode();data+=b' '*((-len(data))%4)
        binary=struct.pack('<II',8,0x004e4942)+b'12345678'
        raw=struct.pack('<III',0x46546c67,2,20+len(data)+len(binary))+struct.pack('<II',len(data),0x4e4f534a)+data+binary
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'test.glb';p.write_bytes(raw);preserve_polymer_ior(p);result=p.read_bytes()
        n=struct.unpack_from('<I',result,12)[0];parsed=json.loads(result[20:20+n])
        self.assertEqual(result[20+n:],binary)
        self.assertEqual(struct.unpack_from('<I',result,8)[0],len(result))
        self.assertEqual(parsed['materials'][0]['extensions']['KHR_materials_ior']['ior'],1.46)
        self.assertNotIn('extensions',parsed['materials'][1])

if __name__=='__main__':unittest.main()
