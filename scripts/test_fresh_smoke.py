import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from concurrent.futures import ThreadPoolExecutor
from urllib.error import HTTPError
import fresh_smoke

class FreshSmokeTests(unittest.TestCase):
    def lifecycle(self, root):
        return SimpleNamespace(STATE=Path(root),CFG={'project':{'database':'live'}},DB_URL='http://localhost:3100')
    def test_skips_existing_host_db_and_reserves_private_deterministic_name(self):
        with TemporaryDirectory() as root:
            lifecycle=self.lifecycle(root); exists=Mock(side_effect=[True,False])
            result=fresh_smoke.reserve(lifecycle,'collision',exists)
            self.assertEqual(result['database'],'live-collision-r0002-smoke')
            self.assertFalse(result['reset'])
            folder=Path(result['evidenceDirectory'])
            self.assertEqual(folder.stat().st_mode&0o777,0o700)
            self.assertEqual((folder/'reservation.json').stat().st_mode&0o777,0o600)
            self.assertEqual(fresh_smoke.evidence_directory(lifecycle,result['database']),str(folder))
            with self.assertRaises(ValueError):fresh_smoke.evidence_directory(lifecycle,'live')
    def test_concurrent_reservations_never_share_a_fixture(self):
        with TemporaryDirectory() as root:
            lifecycle=self.lifecycle(root)
            with ThreadPoolExecutor(max_workers=4) as pool:
                rows=list(pool.map(lambda _:fresh_smoke.reserve(lifecycle,'parallel',lambda *_:False),range(4)))
            self.assertEqual(len({r['database'] for r in rows}),4)
            self.assertTrue(all(r['database'].endswith('-smoke') for r in rows))
    def test_scope_and_exhaustion_never_fall_back_to_main(self):
        with TemporaryDirectory() as root:
            lifecycle=self.lifecycle(root);exists=Mock(return_value=True)
            for label in ['../live','Upper','','x'*33]:
                with self.assertRaises(ValueError):fresh_smoke.reserve(lifecycle,label,exists)
            exists.assert_not_called()
            with self.assertRaises(RuntimeError):fresh_smoke.reserve(lifecycle,'occupied',exists,attempts=2)
            self.assertEqual(exists.call_count,2)
    def test_only_404_is_considered_unused(self):
        with patch('fresh_smoke.urlopen',side_effect=HTTPError('url',404,'missing',None,None)):
            self.assertFalse(fresh_smoke.database_exists('http://localhost','name'))
        with patch('fresh_smoke.urlopen',side_effect=HTTPError('url',403,'denied',None,None)):
            with self.assertRaises(RuntimeError):fresh_smoke.database_exists('http://localhost','name')

if __name__=='__main__':unittest.main()
