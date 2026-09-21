import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('development_review', Path(__file__).resolve().parents[1] / 'ops/keycloak/development-review-account.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


class AccountTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'account.json'
        self.users = []
        self.posts = 0
        self.fail = None

    def request(self, path, data=None, method=None):
        if method == 'POST':
            self.posts += 1
            if self.fail == 'before-post':
                raise ConnectionError('interrupted')
            user = {k: v for k, v in data.items() if k != 'credentials'}
            user['id'] = 'stable-review-id'
            self.users.append(user)
            if self.fail == 'after-post':
                raise ConnectionError('lost response')
            return 201, {'Location': '/users/stable-review-id'}, None
        return 200, {}, self.users if '?' in path else self.users[0]

    def test_resume_before_and_after_post(self):
        for phase in ('before-post', 'after-post'):
            with self.subTest(phase=phase):
                self.users = []
                self.path.unlink(missing_ok=True)
                self.fail = phase
                with self.assertRaises(ConnectionError):
                    m.ensure_account(self.request, self.path)
                pending = m.read_record(self.path.with_suffix('.pending.json'))
                self.fail = None
                result, _ = m.ensure_account(self.request, self.path)
                self.assertEqual(result['password'], pending['password'])
                self.assertEqual(len(self.users), 1)
                again, created = m.ensure_account(self.request, self.path)
                self.assertFalse(created)
                self.assertEqual(again, result)

    def test_resume_after_id_write_and_reject_wrong_ownership(self):
        original = m.os.replace
        def interrupted(source, target):
            if Path(target) == self.path:
                raise OSError('interrupted promotion')
            original(source, target)
        with patch.object(m.os, 'replace', interrupted):
            with self.assertRaises(OSError):
                m.ensure_account(self.request, self.path)
        account, created = m.ensure_account(self.request, self.path)
        self.assertFalse(created)
        self.assertEqual(account['id'], 'stable-review-id')
        self.assertEqual(self.posts, 1)
        self.users[0]['attributes']['sidereal_review_owner'] = ['different']
        with self.assertRaisesRegex(RuntimeError, 'marker'):
            m.ensure_account(self.request, self.path)

    def test_unmanaged_and_ambiguous_pending_are_not_adopted(self):
        self.users = [{'id': 'other', 'username': m.USERNAME, 'enabled': True}]
        with self.assertRaisesRegex(RuntimeError, 'refusing adoption'):
            m.ensure_account(self.request, self.path)
        m.store_record(self.path.with_suffix('.pending.json'), {'username': m.USERNAME, 'managedBy': m.OWNER, 'password': 'sentinel-' * 5})
        with self.assertRaisesRegex(RuntimeError, 'verify provider ID manually'):
            m.ensure_account(self.request, self.path)
        self.assertEqual(self.posts, 0)


if __name__ == '__main__':
    unittest.main()
