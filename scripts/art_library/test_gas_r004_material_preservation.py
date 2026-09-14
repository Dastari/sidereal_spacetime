"""Artifact regressions for Gas4's material-only successor."""
import io,json,unittest,math
from pathlib import Path
from PIL import Image,ImageChops
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from audit_native_kit_attributes import read_glb
from gas_preservation_fixtures import GasRevision
NEW=GasRevision('gas-r004');OLD=GasRevision('gas-r003')
class Gas4MaterialTests(unittest.TestCase):
 def test_geometry_uv_normal_and_stable_placement_identity_exact(self):
  a=json.loads((NEW/'kit.json').read_text());b=json.loads((OLD/'kit.json').read_text())
  self.assertEqual(a['variants'],b['variants'])
  self.assertEqual(a['materials'][0],b['materials'][0]);self.assertEqual(a['materials'][4:],b['materials'][4:])
  for name in ['gas-body.glb','ring-rocks.glb','gas-albedo-generated.png']:self.assertEqual((NEW/name).read_bytes(),(OLD/name).read_bytes())
 def test_png_rgb_artwork_unchanged_and_black_density_transparent(self):
  def read(path):
   with Image.open(io.BytesIO(path.read_bytes())) as image:return image.convert('RGBA')
  source=read(NEW/'ring-dust-generated-black.png');size=source.size;rgb=source.convert('RGB').tobytes()
  for index in range(3):
   pixels=read(NEW/f'ring-dust-{index}.png');self.assertEqual(pixels.size,size);self.assertEqual(pixels.convert('RGB').tobytes(),rgb,'Decoded RGB artwork changed')
   red,green,blue,alpha=pixels.split();black=ImageChops.lighter(ImageChops.lighter(red,green),blue).point(lambda value:255 if value==0 else 0)
   count=size[0]*size[1];histogram=alpha.histogram()
   self.assertGreater(black.histogram()[255],count*.1);self.assertEqual(ImageChops.multiply(alpha,black).getextrema()[1],0)
   self.assertGreater(sum(histogram[1:150]),count*.05)
   self.assertGreater(sum(histogram[151:]),count*.05)
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
