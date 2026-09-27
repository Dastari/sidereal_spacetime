"""Later browser evidence must remain separately pinned and fully accounted for."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import validate_installed_poses_r003 as validator


class PosePublicationNamespaceTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        for name in ['publication.json', 'canonical-before.json']:
            (self.directory / name).write_text('{}')
        patched = patch.object(validator, 'PUBLICATION', self.directory)
        patched.start()
        self.addCleanup(patched.stop)

    def add_evidence(self):
        folder = self.directory / 'live-test'
        folder.mkdir()
        (folder / 'browser-record.json').write_text('{"frames":10}')
        (folder / 'review.jpg').write_bytes(b'image bytes')
        manifest = {'publicBrowserRecord': 'browser-record.json', 'captureHashes': {
            name: hashlib.sha256((folder / name).read_bytes()).hexdigest()
            for name in ['browser-record.json', 'review.jpg']}}
        (folder / 'release.json').write_text(json.dumps(manifest))
        pins = {'live-test': hashlib.sha256((folder / 'release.json').read_bytes()).hexdigest()}
        patched = patch.object(validator, 'PUBLIC_RELEASE_EVIDENCE', pins)
        patched.start()
        self.addCleanup(patched.stop)
        return folder

    def test_historical_two_receipt_namespace_still_valid(self):
        validator.validate_publication_namespace()

    def test_receipted_public_evidence_is_valid_but_unknown_files_fail(self):
        folder = self.add_evidence()
        validator.validate_publication_namespace()
        (folder / 'unlisted.jpg').write_bytes(b'unknown capture')
        with self.assertRaisesRegex(ValueError, 'Unexpected/incomplete public-release'):
            validator.validate_publication_namespace()

    def test_capture_and_manifest_tampering_are_rejected(self):
        folder = self.add_evidence()
        original = (folder / 'review.jpg').read_bytes()
        (folder / 'review.jpg').write_bytes(b'replacement')
        with self.assertRaisesRegex(ValueError, 'capture changed'):
            validator.validate_publication_namespace()
        (folder / 'review.jpg').write_bytes(original)
        (folder / 'release.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'manifest changed'):
            validator.validate_publication_namespace()


if __name__ == '__main__':
    unittest.main()
