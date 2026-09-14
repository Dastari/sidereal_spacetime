"""Artifact regressions for Gas4's material-only successor."""
import hashlib,json,unittest,math
from pathlib import Path
import bpy
import numpy as np
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from audit_native_kit_attributes import read_glb
ROOT=Path('output/playwright/planet-reference-20260914');NEW=ROOT/'gas-r004';OLD=ROOT/'gas-r003'
class Gas4MaterialTests(unittest.TestCase):
 def test_geometry_uv_normal_and_stable_placement_identity_exact(self):
  a=json.loads((NEW/'kit.json').read_text());b=json.loads((OLD/'kit.json').read_text())
  self.assertEqual(a['variants'],b['variants'])
  self.assertEqual(a['materials'][0],b['materials'][0]);self.assertEqual(a['materials'][4:],b['materials'][4:])
  for name in ['gas-body.glb','ring-rocks.glb','gas-albedo-generated.png']:self.assertEqual((NEW/name).read_bytes(),(OLD/name).read_bytes())
 def test_png_rgb_artwork_unchanged_and_black_density_transparent(self):
  def read(path):
   image=bpy.data.images.load(str(path),check_existing=False);pixels=np.empty(len(image.pixels),dtype=np.float32);image.pixels.foreach_get(pixels);return tuple(image.size),pixels.reshape((-1,4))
  size,source=read(NEW/'ring-dust-generated-black.png');rgb=source[:,:3]
  for index in range(3):
   dimensions,pixels=read(NEW/f'ring-dust-{index}.png');self.assertEqual(dimensions,size);self.assertTrue(np.array_equal(pixels[:,:3],rgb),'Decoded RGB artwork changed')
   black=np.max(pixels[:,:3],axis=1)==0
   self.assertGreater(np.sum(black),len(pixels)*.1);self.assertTrue(np.all(pixels[black,3]==0))
   self.assertGreater(np.sum((pixels[:,3]>0)&(pixels[:,3]<150/255)),len(pixels)*.05)
   self.assertGreater(np.sum(pixels[:,3]>150/255),len(pixels)*.05)
 def test_annulus_uv_uses_exact_angular_u_and_inner_to_outer_density_v(self):
  kit=json.loads((NEW/'kit.json').read_text())
  for index,variant in enumerate(kit['variants'][1:4]):
   inner,outer=[(1.16,1.37),(1.43,1.73),(1.73,1.88)][index]
   for corner in range(len(variant['positions'])//3):
    x,y,z=variant['positions'][corner*3:corner*3+3];u,v=variant['uvs'][corner*2:corner*2+2];angle=math.atan2(y,x)%math.tau
    distance=min(abs(angle/math.tau-u),abs(angle/math.tau-u+1),abs(angle/math.tau-u-1));self.assertLess(distance,1e-6)
    self.assertAlmostEqual(math.hypot(x,y),(inner if v==1 else outer)+.003*math.sin(angle*5+index),places=6)
 def test_ring_binary_geometry_unchanged_and_alpha_not_emissive_rails(self):
  for index in range(3):
   g,binary=read_glb(NEW/f'ring-dust-{index}.glb');old,prior=read_glb(OLD/f'ring-dust-{index}.glb')
   # Images also live in BIN, so compare accessor buffer views, not entire BIN.
   for accessor,previous in zip(g['accessors'],old['accessors']):
    self.assertEqual(accessor,previous)
    av=g['bufferViews'][accessor['bufferView']];bv=old['bufferViews'][previous['bufferView']]
    self.assertEqual(binary[av.get('byteOffset',0):av.get('byteOffset',0)+av['byteLength']],prior[bv.get('byteOffset',0):bv.get('byteOffset',0)+bv['byteLength']])
   for material in g['materials']:
    self.assertEqual(material['alphaMode'],'BLEND');self.assertEqual(material.get('emissiveFactor',[0,0,0]),[0,0,0]);self.assertIn('baseColorTexture',material['pbrMetallicRoughness'])
if __name__=='__main__':
 result=unittest.main(argv=[__file__],exit=False).result
 if not result.wasSuccessful():raise RuntimeError('Gas4 preservation test failed')
