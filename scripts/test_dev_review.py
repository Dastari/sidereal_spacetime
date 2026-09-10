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

    def test_artifact_flags_are_paired_and_review_only(self):
        with patch.object(dev, "publish") as publish, contextlib.redirect_stderr(io.StringIO()):
            for args in [("publish", "--module-artifact", "old.js", "--artifact-sha256", "a" * 64), ("publish-review", "--review-name", "safe", "--module-artifact", "old.js"), ("publish-review", "--review-name", "safe", "--artifact-sha256", "a" * 64)]:
                with self.subTest(args=args), self.assertRaises(SystemExit):
                    self.invoke(*args)
        publish.assert_not_called()

    def test_named_smoke_is_isolated_and_additive(self):
        with patch.object(dev, "publish") as publish, patch.object(dev, "run") as run:
            self.invoke("smoke", "--smoke-name", "pressure-r006")
        expected = dev.CFG['project']['database'] + '-pressure-r006-smoke'
        publish.assert_called_once_with(expected, reset=False)
        self.assertEqual(run.call_args.kwargs['env']['SIDEREAL_SMOKE_DATABASE'], expected)

    def test_fresh_smoke_uses_reserved_database_without_reset(self):
        fixture={'database':'live-check-r0001-smoke','smokeName':'check-r0001','evidenceDirectory':'/private/evidence'}
        with patch('fresh_smoke.reserve',return_value=fixture) as reserve, patch.object(dev,'publish') as publish, patch.object(dev,'run') as run, contextlib.redirect_stdout(io.StringIO()):
            self.invoke('smoke','--smoke-name','check','--fresh-smoke')
        publish.assert_called_once_with(fixture['database'],reset=False)
        self.assertEqual(run.call_args.kwargs['env']['SIDEREAL_SMOKE_EVIDENCE_DIR'],fixture['evidenceDirectory'])
        reserve.assert_called_once()

    def test_fresh_flag_cannot_change_restart_or_main(self):
        with patch('fresh_smoke.reserve') as reserve, patch.object(dev,'publish') as publish, contextlib.redirect_stderr(io.StringIO()):
            for args in [('publish','--fresh-smoke'),('smoke','--fresh-smoke'),('smoke-restart','--smoke-name','check','--fresh-smoke')]:
                with self.subTest(args=args), self.assertRaises(SystemExit):self.invoke(*args)
        reserve.assert_not_called();publish.assert_not_called()

    def test_restart_uses_same_reserved_database_and_evidence(self):
        with patch('fresh_smoke.evidence_directory',return_value='/private/exact') as evidence, patch('fresh_smoke.reserve') as reserve, patch.object(dev,'publish') as publish, patch.object(dev,'run') as run:
            self.invoke('smoke-restart','--smoke-name','check-r0001')
        expected=dev.CFG['project']['database']+'-check-r0001-smoke'
        self.assertEqual(run.call_args.kwargs['env']['SIDEREAL_SMOKE_DATABASE'],expected)
        self.assertEqual(run.call_args.kwargs['env']['SIDEREAL_SMOKE_EVIDENCE_DIR'],'/private/exact')
        self.assertIn('--verify-restart',run.call_args.args[0])
        reserve.assert_not_called();publish.assert_not_called()

    def test_smoke_namespace_cannot_change_normal_publish(self):
        with patch.object(dev, "publish") as publish, contextlib.redirect_stderr(io.StringIO()):
            for command, name in [('publish', 'safe'), ('smoke', '../normal'), ('smoke', '')]:
                with self.subTest(command=command, name=name), self.assertRaises(SystemExit):
                    self.invoke(command, '--smoke-name', name)
        publish.assert_not_called()


    def test_prebuilt_client_flags_cannot_activate_or_publish(self):
        with patch('public_client.command') as public, patch.object(dev, 'publish') as publish, contextlib.redirect_stderr(io.StringIO()):
            for args in [('public-client-activate','--client-artifact','dist','--client-artifact-sha256','a'*64),('publish','--client-artifact','dist','--client-artifact-sha256','a'*64),('public-client-stage','--client-artifact','dist'),('public-client-stage','--client-artifact-sha256','a'*64)]:
                with self.subTest(args=args), self.assertRaises(SystemExit): self.invoke(*args)
        public.assert_not_called();publish.assert_not_called()

    def test_prebuilt_client_stage_passes_exact_artifact_contract(self):
        with patch('public_client.command') as public, patch.object(dev, 'publish') as publish:
            self.invoke('public-client-stage','--client-artifact','/private/candidate/dist','--client-artifact-sha256','a'*64)
        self.assertEqual(public.call_args.args[0],'stage')
        self.assertEqual(public.call_args.kwargs, {'artifact':'/private/candidate/dist','artifact_sha256':'a'*64})
        publish.assert_not_called()

    def test_activation_guards_are_paired_and_cannot_publish(self):
        with patch('public_client.command') as public, patch.object(dev, 'publish') as publish, contextlib.redirect_stderr(io.StringIO()):
            for args in [('publish','--expected-live-client-sha256','a','--expected-staged-client-sha256','b'),('public-client-stage','--expected-live-client-sha256','a','--expected-staged-client-sha256','b'),('public-client-activate','--expected-live-client-sha256','a')]:
                with self.subTest(args=args), self.assertRaises(SystemExit): self.invoke(*args)
        public.assert_not_called();publish.assert_not_called()
        with patch('public_client.command') as public:
            self.invoke('public-client-activate','--expected-live-client-sha256','a'*64,'--expected-staged-client-sha256','b'*64)
        self.assertEqual(public.call_args.kwargs['expected_live_sha256'],'a'*64)
        self.assertEqual(public.call_args.kwargs['expected_staged_sha256'],'b'*64)


if __name__ == "__main__":
    unittest.main()
