"""Owner art approval must remain distinct from technical evidence acceptance."""
import copy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import art_catalog as catalog


class OwnerSignoffTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.addCleanup(patch.stopall)
        patch.object(catalog, "LIB", self.root).start()
        artifact = self.root / "source.blend"
        artifact.write_bytes(b"native source fixture")
        self.design = {"profile": "animation"}
        self.revision = {
            "revision": 3,
            "covered_reference_ids": ["aim-key-pose-1"],
            "review": None,
            "evidence": [{"role": "blender-source", "path": "source.blend", "sha256": catalog.digest(artifact)}],
        }

    def approve(self, **overrides):
        args = dict(owner_quote="I approve the delivered art.", message_reference="Owner review message 2026-09-10", art_only=True, technical_notes="Runtime overhead and sustained playback remain unverified.")
        args.update(overrides)
        return catalog.final_approval(self.design, self.revision, **args)

    def test_normal_signoff_still_requires_complete_evidence(self):
        with self.assertRaisesRegex(ValueError, "Missing evidence roles"):
            self.approve(art_only=False)

    def test_explicit_art_approval_preserves_pending_review_and_hashes(self):
        approval = self.approve()
        self.assertEqual(approval["evidence_hashes"], {e["path"]: e["sha256"] for e in self.revision["evidence"]})
        self.assertIn("Agent review has not passed", approval["technical_pending"]["readiness_gaps"])
        self.assertIsNone(self.revision["review"])
        self.assertEqual(catalog.approval_readiness(self.design, self.revision, approval), [])

    def test_owner_identity_and_limitations_are_required(self):
        for field in ["owner_quote", "message_reference", "technical_notes"]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.approve(**{field: " "})

    def test_changed_or_missing_artifact_cannot_be_waived(self):
        for remove in [False, True]:
            with self.subTest(remove=remove):
                artifact = self.root / "source.blend"
                if remove:
                    artifact.unlink()
                else:
                    artifact.write_bytes(b"changed after evidence registration")
                with self.assertRaisesRegex(ValueError, "Missing/changed evidence"):
                    self.approve()

    def test_missing_reference_coverage_and_empty_history_cannot_be_approved(self):
        for field, value in [("covered_reference_ids", []), ("evidence", []), ("revision", 0)]:
            previous = copy.deepcopy(self.revision)
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.revision[field] = value
                self.approve()
            self.revision = previous

    def test_runtime_evidence_requires_factual_capture_context(self):
        self.revision["evidence"][0]["role"] = "runtime-close"
        with self.assertRaisesRegex(ValueError, "capture context"):
            self.approve()

    def test_approval_does_not_allow_pending_evidence_to_be_silently_cleared(self):
        approval = self.approve()
        approval["technical_pending"]["readiness_gaps"] = []
        self.assertIn("Artistic approval technical evidence status changed", catalog.approval_readiness(self.design, self.revision, approval))
        approval["technical_pending"]["status"] = "passed"
        self.assertIn("Artistic approval lacks explicit pending technical validation", catalog.approval_readiness(self.design, self.revision, approval))


if __name__ == "__main__":
    unittest.main()
