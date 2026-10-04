"""Repository policy rejects report/evidence formats without rejecting real fixtures."""
import unittest
from check_docs import policy_errors


class DocumentationBoundaryTest(unittest.TestCase):
    def test_reports_cannot_evade_policy_by_using_non_markdown_formats(self):
        for path in ('docs/releases/run/publication.json', 'docs/handoffs/integration.patch',
                     'docs/shipyard_player_builder/kit.json', 'output/capture.webp'):
            with self.subTest(path=path):
                self.assertTrue(policy_errors(path))

    def test_archival_receipts_block_reintroduced_review_files(self):
        path = 'assets/runtime/equipment/icons/contact-sheet.png'
        self.assertTrue(policy_errors(path, archived={path: {'sha256': 'digest'}}))

    def test_fixtures_runtime_textures_and_tooling_remain_allowed(self):
        for path in ('assets/ci/cargo-grid-model-audit.json', 'assets/runtime/materials/normal.png',
                     'docs/archived-media.json', 'docs/public/shipyard.md', 'README.md',
                     '.agents/skills/sidereal-wiki/SKILL.md'):
            with self.subTest(path=path):
                self.assertEqual(policy_errors(path), [])

    def test_retired_review_exceptions_do_not_allow_documents_or_logs(self):
        for path in ('assets/art-library/framed-wayfarer/review.log',
                     'assets/art-library/framed-wayfarer/armor-correction-review-20260914/review.md'):
            self.assertTrue(policy_errors(path))


if __name__ == '__main__':
    unittest.main()
