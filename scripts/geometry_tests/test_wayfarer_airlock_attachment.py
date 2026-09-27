from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import unittest
import checkout_guard  # Reject hidden reads from the author checkout.
import numpy as np
import qualify_wayfarer_airlock_attachment as candidate
class AttachmentTest(unittest.TestCase):
 def test_native_face_ray_does_not_confuse_cover_with_real_aperture(self):
  triangle=np.array([[[5,-1,0],[5,1,0],[5,0,2]]],dtype=float)
  self.assertEqual(candidate.ray_hits(triangle,[4,0,1],[6,0,1]),[.5])
  self.assertEqual(candidate.ray_hits(triangle,[4,.9,1.5],[6,.9,1.5]),[])
 def test_exact_two_candidates_preserve_sources_but_reject_false_attachment(self):
  r=candidate.qualify();self.assertEqual(r['preservation']['originalPlacementCount'],262);self.assertEqual(len(r['preservation']['cargoIds']),4)
  self.assertTrue(all(p['blockedRayCount']==20 for p in r['sourceNativeBarriers']))
  compact,extended=r['candidates'];self.assertEqual(len(compact['nativePlacements']),70);self.assertEqual(len(extended['nativePlacements']),70)
  self.assertEqual(compact['overlapExistingFloorM2'],4);self.assertEqual(extended['overlapExistingFloorM2'],0)
  self.assertEqual(extended['sharedFloorEdgeM'],2);self.assertEqual(r['interfaces']['roofUndersideMismatchM'],.3125)
  self.assertEqual([p['sourcePlacedId']for p in compact['protectedSourceCoverOverlaps']],['room-crew'])
  self.assertEqual(extended['protectedSourceCoverOverlaps'],[])
  self.assertFalse(r['checks']['attachedSealQualified']);self.assertFalse(r['checks']['readyForCompilerOrRuntime'])
  self.assertFalse(any(c['activationAllowed']for c in r['candidates']))
if __name__=='__main__':unittest.main()
