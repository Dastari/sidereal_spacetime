"""Focused tests for the read-only kit/GLB attribute audit."""
import hashlib,json,struct,tempfile,unittest
from pathlib import Path
from audit_native_kit_attributes import audit,compare_material,compare_corners,matrix,point,normal,read_glb,accessor,texture_bytes

class AttributeAuditTests(unittest.TestCase):
 def test_normal_orm_and_coat_texture_channels(self):
  g={'images':[{'bufferView':i}for i in range(3)],'textures':[{'source':i}for i in range(3)],'bufferViews':[{'byteOffset':i*3,'byteLength':3}for i in range(3)]}
  material={'normalTexture':{'index':0,'scale':.5},'pbrMetallicRoughness':{'metallicRoughnessTexture':{'index':1}},'extensions':{'KHR_materials_clearcoat':{'clearcoatNormalTexture':{'index':2}}}}
  for field,expected in [('normalTexture',b'abc'),('metallicRoughnessTexture',b'def'),('clearcoatNormalTexture',b'ghi')]:self.assertEqual(texture_bytes(g,b'abcdefghi',material,Path('/unused.glb'),field),expected)
  self.assertIsNone(texture_bytes(g,b'abcdefghi',material,Path('/unused.glb')))
  self.assertEqual(compare_material({'normalScale':.5},material),[])
  self.assertEqual(compare_material({'normalScale':1},material)[0]['field'],'normalScale')
 def test_material_omissions_and_effective_emission(self):
  self.assertEqual(compare_material({'name':'unspecified'},{'name':'unspecified','pbrMetallicRoughness':{'roughnessFactor':.2}}),[])
  differences=compare_material({'name':'ice','ior':1.31},{'name':'ice'})
  self.assertEqual(differences[0]['field'],'ior');self.assertEqual(differences[0]['actual'],1.5)
  self.assertEqual(compare_material({'name':'core','emissiveColor':[.4,.1,.2],'emissiveStrength':2},{'name':'core','emissiveFactor':[.8,.2,.4]}),[])
  self.assertEqual(compare_material({'name':'water','clearCoat':{'intensity':.3,'roughness':.1}},{'name':'water','extensions':{'KHR_materials_clearcoat':{'clearcoatFactor':.3,'clearcoatRoughnessFactor':.1}}}),[])
 def test_distance_tolerance_does_not_misdiagnose_decimal_bin_rounding(self):
  expected=[('m',(0,0,0),(0,1,0),(0,0))]
  actual=[('m',(1e-7,0,0),(0,1-2e-9,7e-5),(1e-7,0))]
  result=compare_corners(expected,actual,True,True)
  self.assertEqual(result['positionMaterialCornerDifference'],0);self.assertEqual(result['normalsCornerDifference'],0);self.assertEqual(result['uvsCornerDifference'],0)
  wrong=[('m',(0,0,0),(1,0,0),(0,.5))];result=compare_corners(expected,wrong,True,True)
  self.assertEqual(result['normalsCornerDifference'],1);self.assertEqual(result['uvsCornerDifference'],1)
  self.assertEqual(compare_corners(expected,[('other',*actual[0][1:])],True,True)['positionMaterialCornerDifference'],2)
 def test_inverse_transpose_for_nonuniform_node_scale(self):
  m=matrix({'translation':[2,3,4],'scale':[2,1,.5]})
  self.assertEqual(point(m,(1,2,3)),(4,5,5.5));n=normal(m,(1,1,0));self.assertAlmostEqual(n[1]/n[0],2)
 def test_complete_fixture_attributes_axis_and_read_only_behavior(self):
  with tempfile.TemporaryDirectory()as directory:
   root=Path(directory)
   kit={'materials':[{'name':'rock','linearColor':[.2,.3,.4],'roughness':.3}],'variants':[{'name':'triangle','positions':[0,0,0,1,0,0,0,1,0],'normals':[0,0,1]*3,'uvs':[0,0,1,0,0,1],'indices':[0,1,2],'triangleMaterials':[0]}]}
   (root/'kit.json').write_text(json.dumps(kit))
   arrays=[('VEC3',5126,[0,0,0,1,0,0,0,0,-1]),('VEC3',5126,[0,1,0]*3),('VEC2',5126,[0,0,1,0,0,1]),('SCALAR',5123,[0,1,2])]
   binary=b'';views=[];accessors=[]
   for shape,component,values in arrays:
    binary+=b'\0'*((-len(binary))%4);raw=struct.pack('<'+('f'if component==5126 else'H')*len(values),*values);views.append({'buffer':0,'byteOffset':len(binary),'byteLength':len(raw)});binary+=raw;accessors.append({'bufferView':len(views)-1,'componentType':component,'count':len(values)//{'VEC3':3,'VEC2':2,'SCALAR':1}[shape],'type':shape})
   g={'asset':{'version':'2.0'},'buffers':[{'byteLength':len(binary)}],'bufferViews':views,'accessors':accessors,'materials':[{'name':'rock','pbrMetallicRoughness':{'baseColorFactor':[.2,.3,.4,1],'roughnessFactor':.3}}],'meshes':[{'primitives':[{'attributes':{'POSITION':0,'NORMAL':1,'TEXCOORD_0':2},'indices':3,'material':0}]}],'nodes':[{'mesh':0}],'scenes':[{'nodes':[0]}],'scene':0}
   text=json.dumps(g).encode();text+=b' '*((-len(text))%4);binary+=b'\0'*((-len(binary))%4);raw=struct.pack('<III',0x46546c67,2,28+len(text)+len(binary))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(binary),0x004e4942)+binary;(root/'triangle.glb').write_bytes(raw)
   hashes=lambda:{p.name:hashlib.sha256(p.read_bytes()).hexdigest()for p in root.iterdir()};before=hashes();report=audit(root)
   self.assertEqual(before,hashes());self.assertEqual(report['materialDifferences'],[]);self.assertEqual(report['attributeGaps'],[]);self.assertEqual(report['summary']['variantErrors'],0)
   for field in ['positionMismatchVariants','normalMismatchVariants','uvMismatchVariants']:self.assertEqual(report['summary'][field],0)
   variant=kit['variants'][0];del variant['normals'];(root/'kit.json').write_text(json.dumps(kit));self.assertEqual(audit(root)['attributeGaps'][0]['field'],'normals')
 def test_accessor_normalization_and_stride(self):
  g={'bufferViews':[{'byteOffset':0,'byteStride':4}],'accessors':[{'bufferView':0,'componentType':5121,'normalized':True,'type':'VEC2','count':2}]}
  self.assertEqual(accessor(g,bytes([0,255,7,7,255,0,8,8]),0),[(0.,1.),(1.,0.)])
if __name__=='__main__':unittest.main()
