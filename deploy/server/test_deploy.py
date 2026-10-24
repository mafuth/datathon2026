"""Stdlib regression coverage for the fixed deployment boundary; no Docker required."""

import importlib.util
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("datathon2026_gateway", Path(__file__).with_name("deploy.py"))
gateway = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = gateway
SPEC.loader.exec_module(gateway)

OLD = gateway.Release("sha256:" + "a" * 64, "1" * 40)
NEW = gateway.Release("sha256:" + "b" * 64, "2" * 40)
MANUAL = gateway.ManualRelease("sha256:" + "c" * 64, "3" * 40)


class RequestTests(unittest.TestCase):
    def request(self, **changes):
        value = {"digest": NEW.digest, "revision": NEW.revision}
        value.update(changes)
        return json.dumps(value).encode()

    def test_fixed_image_repository_and_full_revision(self):
        request = gateway.parse_request(self.request())
        self.assertEqual(request.release.image, "ghcr.io/mafuth/datathon2026@" + NEW.digest)
        self.assertEqual(request.release.revision, NEW.revision)

    def test_tags_paths_commands_and_non_strings_are_refused(self):
        for digest in ("latest", "ghcr.io/other/app@" + NEW.digest, NEW.digest + ";id", 123, None):
            with self.subTest(digest=digest), self.assertRaises(gateway.DeployError):
                gateway.parse_request(self.request(digest=digest))
        for revision in ("main", "abcd123", "A" * 40, "2" * 40 + "\n", False):
            with self.subTest(revision=revision), self.assertRaises(gateway.DeployError):
                gateway.parse_request(self.request(revision=revision))

    def test_request_shape_size_and_duplicate_fields_are_refused(self):
        for raw in (b"", b"[]", b"null", b"{", b" " * 8193, b'{"digest":"one","digest":"two"}'):
            with self.subTest(raw=raw[:30]), self.assertRaises(gateway.DeployError):
                gateway.parse_request(raw)
        with self.assertRaises(gateway.DeployError):
            gateway.parse_request(self.request(command="id"))

    def test_partial_or_unsafe_registry_credentials_are_refused(self):
        values = (
            {"registry_user": "mafuth"},
            {"registry_token": "secret"},
            {"registry_user": "--flag", "registry_token": "secret"},
            {"registry_user": "mafuth", "registry_token": "secret\ncommand"},
            {"registry_user": "mafuth", "registry_token": "x" * 4097},
        )
        for changes in values:
            with self.subTest(changes=list(changes)), self.assertRaises(gateway.DeployError):
                gateway.parse_request(self.request(**changes))

    def test_token_is_not_in_request_representation(self):
        request = gateway.parse_request(self.request(registry_user="mafuth", registry_token="private-token"))
        self.assertNotIn("private-token", repr(request))


class RecordingRunner:
    def __init__(self, control, fail_starts=0, fail_pull=False, fail_inspect=False, fail_stop=False):
        self.control = control
        self.fail_starts = fail_starts
        self.fail_pull = fail_pull
        self.fail_inspect = fail_inspect
        self.fail_stop = fail_stop
        self.calls = []
        self.started_releases = []

    def __call__(self, arguments, *, environment, input_text=None, timeout=240):
        self.calls.append((arguments, environment.copy(), input_text, timeout))
        if arguments[1:3] == ["image", "inspect"] and self.fail_inspect:
            raise gateway.DeployError("Simulated missing image.")
        if arguments[1] == "pull" and self.fail_pull:
            raise gateway.DeployError("Simulated failed pull.")
        if arguments[1] == "compose" and "stop" in arguments and self.fail_stop:
            raise gateway.DeployError("Simulated failed stop.")
        if arguments[1] == "compose" and "up" in arguments:
            manifest = Path(arguments[arguments.index("--env-file") + 1])
            reader = gateway.read_manual_release if manifest.name == "manual-release.env" else gateway.read_release
            self.started_releases.append(reader(manifest))
            if self.fail_starts:
                self.fail_starts -= 1
                raise gateway.DeployError("Simulated failed health check.")


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.control = Path(self.temporary.name)
        self.state = self.control / "release.env"

    def test_success_records_only_the_pulled_digest_and_revision(self):
        runner = RecordingRunner(self.control)
        gateway.Deployment(self.control, runner).deploy(gateway.Request(NEW))
        self.assertEqual(gateway.read_release(self.state), NEW)
        self.assertEqual(runner.started_releases, [NEW])
        self.assertEqual(runner.calls[0][0], ["/usr/bin/docker", "pull", NEW.image])
        compose = runner.calls[-1][0]
        self.assertEqual(compose[compose.index("--project-name") + 1], "datathon2026")
        self.assertIn("--wait", compose)
        self.assertEqual(compose[-2:], ["--pull", "never"])

    def test_registry_token_uses_stdin_and_temporary_config(self):
        runner = RecordingRunner(self.control)
        gateway.Deployment(self.control, runner).deploy(gateway.Request(NEW, "mafuth", "private-token"))
        login, environment, stdin, _ = runner.calls[0]
        self.assertEqual(login[-1], "--password-stdin")
        self.assertEqual(stdin, "private-token\n")
        self.assertNotIn("private-token", " ".join(login))
        self.assertFalse(Path(environment["DOCKER_CONFIG"]).exists())
        self.assertEqual(set(environment), {"PATH", "HOME", "DOCKER_CONFIG", "LANG"})

    def test_pull_failure_preserves_previous_state_and_running_service(self):
        gateway.write_release(self.state, OLD)
        runner = RecordingRunner(self.control, fail_pull=True)
        with self.assertRaises(gateway.DeployError):
            gateway.Deployment(self.control, runner).deploy(gateway.Request(NEW))
        self.assertEqual(gateway.read_release(self.state), OLD)
        self.assertEqual(runner.started_releases, [])

    def test_missing_previous_image_refuses_replacement_before_pull(self):
        gateway.write_release(self.state, OLD)
        runner = RecordingRunner(self.control, fail_inspect=True)
        with self.assertRaisesRegex(gateway.DeployError, "previous image"):
            gateway.Deployment(self.control, runner).deploy(gateway.Request(NEW))
        self.assertEqual(gateway.read_release(self.state), OLD)
        self.assertEqual(len(runner.calls), 1)

    def test_failed_health_restores_previous_state_and_waits_for_rollback(self):
        gateway.write_release(self.state, OLD)
        runner = RecordingRunner(self.control, fail_starts=1)
        with self.assertRaisesRegex(gateway.DeployError, "previous image was restored"):
            gateway.Deployment(self.control, runner).deploy(gateway.Request(NEW))
        self.assertEqual(runner.started_releases, [NEW, OLD])
        self.assertEqual(gateway.read_release(self.state), OLD)

    def test_rollback_failure_keeps_previous_manifest_and_reports_action(self):
        gateway.write_release(self.state, OLD)
        runner = RecordingRunner(self.control, fail_starts=2)
        with self.assertRaisesRegex(gateway.DeployError, "administrator action"):
            gateway.Deployment(self.control, runner).deploy(gateway.Request(NEW))
        self.assertEqual(gateway.read_release(self.state), OLD)
        self.assertEqual(runner.started_releases, [NEW, OLD])

    def test_failed_initial_release_stops_services_and_removes_manifest(self):
        runner = RecordingRunner(self.control, fail_starts=1)
        with self.assertRaisesRegex(gateway.DeployError, "Initial deployment failed"):
            gateway.Deployment(self.control, runner).deploy(gateway.Request(NEW))
        self.assertFalse(self.state.exists())
        self.assertEqual(runner.calls[-1][0][-3:], ["stop", "--timeout", "20"])

    def test_stored_release_rejects_foreign_image_duplicate_and_extra_fields(self):
        for content in (
            OLD.render().replace("mafuth/datathon2026", "other/app"),
            OLD.render() + "DATATHON_REVISION=" + OLD.revision + "\n",
            OLD.render() + "COMPOSE_FILE=/tmp/untrusted.yaml\n",
        ):
            with self.subTest(content=content), self.assertRaises(gateway.DeployError):
                self.state.write_text(content)
                gateway.read_release(self.state)

    def test_failed_initial_stop_reports_administrator_action(self):
        runner = RecordingRunner(self.control, fail_starts=1, fail_stop=True)
        with self.assertRaisesRegex(gateway.DeployError, "could not be stopped"):
            gateway.Deployment(self.control, runner).deploy(gateway.Request(NEW))
        self.assertFalse(self.state.exists())


class ManualBaselineTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.control = Path(self.temporary.name)
        self.state = self.control / "release.env"
        self.manual_state = self.control / "manual-release.env"
        gateway.write_release(self.manual_state, MANUAL)

    def test_manual_baseline_accepts_only_canonical_local_image_id_and_revision(self):
        self.assertEqual(gateway.read_manual_release(self.manual_state), MANUAL)
        self.assertEqual(MANUAL.image, "sha256:" + "c" * 64)
        for content in (
            MANUAL.render().replace(MANUAL.image, "mobilix:local"),
            MANUAL.render().replace(MANUAL.image, OLD.image),
            MANUAL.render().replace(MANUAL.revision, "main"),
            MANUAL.render() + "DATATHON_REVISION=" + MANUAL.revision + "\n",
            MANUAL.render() + "COMPOSE_FILE=/tmp/other.yaml\n",
        ):
            with self.subTest(content=content), self.assertRaises(gateway.DeployError):
                self.manual_state.write_text(content)
                gateway.read_manual_release(self.manual_state)

    def test_first_ci_success_records_registry_release_and_preserves_manual_history(self):
        runner = RecordingRunner(self.control)
        gateway.Deployment(self.control, runner).deploy(gateway.Request(NEW))
        self.assertEqual(runner.calls[0][0], ["/usr/bin/docker", "image", "inspect", MANUAL.image])
        self.assertEqual(gateway.read_release(self.state), NEW)
        self.assertEqual(gateway.read_manual_release(self.manual_state), MANUAL)
        self.assertEqual(runner.started_releases, [NEW])

    def test_first_ci_health_failure_restores_manual_manifest_and_removes_ci_state(self):
        runner = RecordingRunner(self.control, fail_starts=1)
        with self.assertRaisesRegex(gateway.DeployError, "previous image was restored"):
            gateway.Deployment(self.control, runner).deploy(gateway.Request(NEW))
        self.assertFalse(self.state.exists())
        self.assertEqual(gateway.read_manual_release(self.manual_state), MANUAL)
        self.assertEqual(runner.started_releases, [NEW, MANUAL])
        rollback_command = runner.calls[-1][0]
        self.assertEqual(rollback_command[rollback_command.index("--env-file") + 1], str(self.manual_state))
        self.assertIn("--wait", rollback_command)
        self.assertEqual(rollback_command[-2:], ["--pull", "never"])

    def test_failed_manual_rollback_reports_action_and_keeps_ci_state_absent(self):
        runner = RecordingRunner(self.control, fail_starts=2)
        with self.assertRaisesRegex(gateway.DeployError, "administrator action"):
            gateway.Deployment(self.control, runner).deploy(gateway.Request(NEW))
        self.assertFalse(self.state.exists())
        self.assertEqual(runner.started_releases, [NEW, MANUAL])
        self.assertEqual(gateway.read_manual_release(self.manual_state), MANUAL)

    def test_first_ci_pull_failure_leaves_manual_service_and_ci_state_untouched(self):
        runner = RecordingRunner(self.control, fail_pull=True)
        with self.assertRaises(gateway.DeployError):
            gateway.Deployment(self.control, runner).deploy(gateway.Request(NEW))
        self.assertFalse(self.state.exists())
        self.assertEqual(runner.started_releases, [])
        self.assertEqual(gateway.read_manual_release(self.manual_state), MANUAL)

    def test_missing_manual_image_refuses_first_ci_before_pull(self):
        runner = RecordingRunner(self.control, fail_inspect=True)
        with self.assertRaisesRegex(gateway.DeployError, "previous image"):
            gateway.Deployment(self.control, runner).deploy(gateway.Request(NEW))
        self.assertFalse(self.state.exists())
        self.assertEqual(len(runner.calls), 1)

    def test_registry_release_takes_precedence_over_manual_history(self):
        gateway.write_release(self.state, OLD)
        runner = RecordingRunner(self.control, fail_starts=1)
        with self.assertRaisesRegex(gateway.DeployError, "previous image was restored"):
            gateway.Deployment(self.control, runner).deploy(gateway.Request(NEW))
        self.assertEqual(runner.calls[0][0], ["/usr/bin/docker", "image", "inspect", OLD.image])
        self.assertEqual(runner.started_releases, [NEW, OLD])
        self.assertEqual(gateway.read_release(self.state), OLD)

    def test_remote_requests_still_resolve_to_the_fixed_registry_repository(self):
        request = gateway.parse_request(json.dumps({"digest": MANUAL.digest, "revision": MANUAL.revision}).encode())
        self.assertEqual(request.release.image, "ghcr.io/mafuth/datathon2026@" + MANUAL.digest)
        self.assertNotIsInstance(request.release, gateway.ManualRelease)

    def test_secure_layout_rejects_unsafe_optional_manual_manifest(self):
        (self.control / "app.env").write_text("configuration")
        (self.control / "app.env").chmod(0o600)
        real_check = gateway.assert_secure_path

        def inspect_manual(path, *, directory, owner=0):
            if path == self.manual_state:
                self.assertEqual(owner, 0)
                self.assertFalse(directory)
                real_check(path, directory=directory, owner=os.getuid())

        for unsafe_kind in ("writable", "symlink"):
            with self.subTest(unsafe_kind=unsafe_kind):
                self.manual_state.unlink()
                if unsafe_kind == "writable":
                    self.manual_state.write_text(MANUAL.render())
                    self.manual_state.chmod(0o666)
                else:
                    self.manual_state.symlink_to(self.control / "app.env")
                with patch.object(gateway, "assert_secure_path", side_effect=inspect_manual):
                    with self.assertRaises(gateway.DeployError):
                        gateway.secure_layout(self.control)


class PathProtectionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.file = self.root / "protected"
        self.file.write_text("protected")
        self.file.chmod(0o600)

    def test_regular_private_file_is_accepted_for_its_actual_owner(self):
        gateway.assert_secure_path(self.file, directory=False, owner=os.getuid())
        self.assertTrue(stat.S_ISREG(self.file.lstat().st_mode))

    def test_symlink_and_world_writable_files_are_rejected(self):
        link = self.root / "link"
        link.symlink_to(self.file)
        with self.assertRaises(gateway.DeployError):
            gateway.assert_secure_path(link, directory=False, owner=os.getuid())
        self.file.chmod(0o666)
        with self.assertRaises(gateway.DeployError):
            gateway.assert_secure_path(self.file, directory=False, owner=os.getuid())

    def test_wrong_owner_and_wrong_path_type_are_rejected(self):
        with self.assertRaises(gateway.DeployError):
            gateway.assert_secure_path(self.file, directory=False, owner=os.getuid() + 1)
        with self.assertRaises(gateway.DeployError):
            gateway.assert_secure_path(self.root, directory=False, owner=os.getuid())


if __name__ == "__main__":
    unittest.main()
