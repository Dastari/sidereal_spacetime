import unittest
from art_catalog import valid_revision_history, revision_record


class RevisionHistoryTests(unittest.TestCase):
    def test_existing_reference_history_cannot_skip_zero_or_interior_versions(self):
        d = {"reference_ids": ["source-crop"], "current_revision": 2,
             "revisions": [{"revision": n} for n in [0, 1, 2]]}
        self.assertTrue(valid_revision_history(d))
        d["revisions"].pop(1)
        self.assertFalse(valid_revision_history(d))
        d.update(first_recorded_revision=1, history_note="cannot delete extraction")
        d["revisions"] = [{"revision": 1}, {"revision": 2}]
        self.assertFalse(valid_revision_history(d))

    def test_native_companion_requires_explicit_origin_and_retains_revision_lookup(self):
        d = {"reference_ids": [], "current_revision": 2,
             "revisions": [{"revision": 1}, {"revision": 2}]}
        self.assertFalse(valid_revision_history(d))
        d.update(first_recorded_revision=1, history_note="First authored revision was r001; no r000 exists.")
        self.assertTrue(valid_revision_history(d))
        self.assertIs(revision_record(d, 1), d["revisions"][0])
        d["revisions"].pop(0)
        self.assertFalse(valid_revision_history(d))


if __name__ == "__main__":
    unittest.main()
