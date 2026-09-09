"""A browser review may survive disposable smoke fixture rebuilds."""
import contextlib
import io
import unittest
from unittest.mock import patch

import dev


class ReviewDatabaseTests(unittest.TestCase):
    def invoke(self, *arguments):
        with patch("sys.argv", ["dev.py", *arguments]):
            dev.main()

    def test_review_is_project_scoped_and_never_reset(self):
        with patch.object(dev, "publish") as publish:
            self.invoke("publish-review", "--review-name", "boundaries-20260909")
        publish.assert_called_once_with(
            dev.CFG["project"]["database"] + "-review-boundaries-20260909",
            reset=False,
        )

    def test_invalid_review_cannot_fall_back_to_normal_database(self):
        with patch.object(dev, "publish") as publish, contextlib.redirect_stderr(io.StringIO()):
            for suffix in (None, "", "../normal", "UPPER", "a" * 41, "-leading"):
                with self.subTest(suffix=suffix), self.assertRaises(SystemExit):
                    self.invoke("publish-review", *([] if suffix is None else ["--review-name", suffix]))
        publish.assert_not_called()

    def test_review_option_cannot_modify_another_operation(self):
        with patch.object(dev, "publish") as publish, contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaises(SystemExit):
                self.invoke("publish", "--review-name", "safe")
        publish.assert_not_called()

    def test_named_smoke_is_isolated_and_additive(self):
        with patch.object(dev, "publish") as publish, patch.object(dev, "run") as run:
            self.invoke("smoke", "--smoke-name", "pressure-r006")
        expected = dev.CFG['project']['database'] + '-pressure-r006-smoke'
        publish.assert_called_once_with(expected, reset=False)
        self.assertEqual(run.call_args.kwargs['env']['SIDEREAL_SMOKE_DATABASE'], expected)

    def test_smoke_namespace_cannot_change_normal_publish(self):
        with patch.object(dev, "publish") as publish, contextlib.redirect_stderr(io.StringIO()):
            for command, name in [('publish', 'safe'), ('smoke', '../normal'), ('smoke', '')]:
                with self.subTest(command=command, name=name), self.assertRaises(SystemExit):
                    self.invoke(command, '--smoke-name', name)
        publish.assert_not_called()


if __name__ == "__main__":
    unittest.main()
