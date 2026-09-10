import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("review_rotation", Path(__file__).resolve().parents[1] / "ops/keycloak/rotate-review-password.py")
rotation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rotation)

class ReviewRotationTests(unittest.TestCase):
    def test_exact_review_target_required(self):
        rotation.validate_review({"id": rotation.REVIEW_ID, "username": rotation.REVIEW_USERNAME})
        for value in [{}, {"id": rotation.REVIEW_ID, "username": "dastari"}, {"id": "another", "username": rotation.REVIEW_USERNAME}]:
            with self.assertRaises(ValueError):
                rotation.validate_review(value)

if __name__ == "__main__":
    unittest.main()
