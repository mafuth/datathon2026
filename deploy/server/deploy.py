#!/usr/bin/python3 -I
"""Root-owned, fixed-operation deployment gateway for Datathon 2026."""

from __future__ import annotations

import json
import os
import re
import signal
import stat
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

CONTROL = Path("/opt/datathon2026/control")
IMAGE = "ghcr.io/mafuth/datathon2026"
MAX_REQUEST_BYTES = 8192
DIGEST = re.compile(r"sha256:[0-9a-f]{64}\Z")
REVISION = re.compile(r"[0-9a-f]{40}\Z")
REGISTRY_USER = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\Z")


class DeployError(Exception):
    """Only fixed, credential-free messages may leave this gateway."""


@dataclass(frozen=True)
class Release:
    digest: str
    revision: str

    def __post_init__(self) -> None:
        if not all(
            isinstance(value, str) and pattern.fullmatch(value)
            for value, pattern in ((self.digest, DIGEST), (self.revision, REVISION))
        ):
            raise DeployError("A SHA-256 image digest and full Git revision are required.")

    @property
    def image(self) -> str:
        return f"{IMAGE}@{self.digest}"

    def render(self) -> str:
        return f"DATATHON_IMAGE={self.image}\nDATATHON_REVISION={self.revision}\n"


@dataclass(frozen=True)
class ManualRelease(Release):
    """Administrator-installed local image baseline, never accepted in requests."""

    @property
    def image(self) -> str:
        return self.digest


@dataclass(frozen=True)
class Request:
    release: Release
    registry_user: str | None = None
    registry_token: str | None = field(default=None, repr=False)


def _unique_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise DeployError("Duplicate request fields are forbidden.")
        result[key] = value
    return result


def parse_request(raw: bytes) -> Request:
    if not raw or len(raw) > MAX_REQUEST_BYTES:
        raise DeployError("Deployment request must contain at most 8 KiB.")
    try:
        value = json.loads(raw, object_pairs_hook=_unique_object)
    except (ValueError, UnicodeError, RecursionError):
        raise DeployError("Deployment request must be a JSON object.") from None
    fields = {"digest", "revision", "registry_user", "registry_token"}
    if not isinstance(value, dict) or set(value) - fields:
        raise DeployError("Unsupported deployment request fields.")
    if not {"digest", "revision"} <= value.keys():
        raise DeployError("The image digest and source revision are required.")
    release = Release(value["digest"], value["revision"])
    user, token = value.get("registry_user"), value.get("registry_token")
    if (user is None) != (token is None):
        raise DeployError("Registry authentication requires both username and token.")
    if user is not None and (
        not isinstance(user, str)
        or not REGISTRY_USER.fullmatch(user)
        or not isinstance(token, str)
        or not 1 <= len(token) <= 4096
        or not all(33 <= ord(character) <= 126 for character in token)
    ):
        raise DeployError("Invalid registry authentication fields.")
    return Request(release, user, token)


def read_release(path: Path) -> Release | None:
    if not path.exists():
        return None
    if path.stat().st_size > 1024:
        raise DeployError("Stored release state requires administrator repair.")
    try:
        content = path.read_text("utf-8")
        values = dict(line.split("=", 1) for line in content.splitlines())
        if set(values) != {"DATATHON_IMAGE", "DATATHON_REVISION"}:
            raise ValueError
        image = values["DATATHON_IMAGE"]
        if not image.startswith(IMAGE + "@"):
            raise ValueError
        release = Release(image.removeprefix(IMAGE + "@"), values["DATATHON_REVISION"])
        if content != release.render():
            raise ValueError
        return release
    except (ValueError, UnicodeError, DeployError):
        raise DeployError("Stored release state requires administrator repair.") from None


def read_manual_release(path: Path) -> ManualRelease | None:
    if not path.exists():
        return None
    if path.stat().st_size > 1024:
        raise DeployError("Stored manual release baseline requires administrator repair.")
    try:
        content = path.read_text("utf-8")
        values = dict(line.split("=", 1) for line in content.splitlines())
        if set(values) != {"DATATHON_IMAGE", "DATATHON_REVISION"}:
            raise ValueError
        release = ManualRelease(values["DATATHON_IMAGE"], values["DATATHON_REVISION"])
        if content != release.render():
            raise ValueError
        return release
    except (ValueError, UnicodeError, DeployError):
        raise DeployError("Stored manual release baseline requires administrator repair.") from None


def write_release(path: Path, release: Release) -> None:
    descriptor, temporary = tempfile.mkstemp(prefix=".release-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as target:
            target.write(release.render())
            target.flush()
            os.fsync(target.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def run_command(
    arguments: list[str],
    *,
    environment: dict[str, str],
    input_text: str | None = None,
    timeout: int = 240,
) -> None:
    try:
        subprocess.run(
            arguments,
            input=input_text,
            text=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
            timeout=timeout,
            env=environment,
            cwd=environment["HOME"],
        )
    except (OSError, subprocess.SubprocessError):
        raise DeployError("A fixed Docker operation failed; inspect it as administrator.") from None


class Deployment:
    def __init__(self, control: Path = CONTROL, runner: Callable = run_command) -> None:
        self.control = control
        self.state = control / "release.env"
        self.manual_state = control / "manual-release.env"
        self.runner = runner

    def _compose(self, environment: dict[str, str], *operation: str, manifest: Path | None = None) -> None:
        self.runner(
            [
                "/usr/bin/docker", "compose", "--project-name", "datathon2026",
                "--project-directory", str(self.control), "--env-file", str(manifest or self.state),
                "--file", str(self.control / "compose.yaml"), *operation,
            ],
            environment=environment,
        )

    def _start(self, environment: dict[str, str], *, manifest: Path | None = None) -> None:
        self._compose(
            environment, "up", "--detach", "--wait", "--wait-timeout", "180",
            "--remove-orphans", "--no-build", "--pull", "never",
            manifest=manifest,
        )

    def deploy(self, request: Request) -> None:
        previous = read_release(self.state)
        manual = read_manual_release(self.manual_state) if previous is None else None
        rollback = previous or manual
        with tempfile.TemporaryDirectory(prefix=".docker-", dir=self.control) as config:
            environment = {
                "PATH": "/usr/bin:/bin", "HOME": str(self.control),
                "DOCKER_CONFIG": config, "LANG": "C.UTF-8",
            }
            # A release may only replace an existing release when rollback remains local.
            if rollback is not None:
                try:
                    self.runner(
                        ["/usr/bin/docker", "image", "inspect", rollback.image],
                        environment=environment,
                    )
                except DeployError:
                    raise DeployError(
                        "The previous image is unavailable locally; restore it before deploying."
                    ) from None
            if request.registry_token is not None:
                self.runner(
                    ["/usr/bin/docker", "login", "ghcr.io", "--username",
                     request.registry_user, "--password-stdin"],
                    environment=environment, input_text=request.registry_token + "\n", timeout=90,
                )
            # Pull before changing state or the running service. Never execute checkout files.
            self.runner(
                ["/usr/bin/docker", "pull", request.release.image],
                environment=environment, timeout=900,
            )
            write_release(self.state, request.release)
            try:
                self._start(environment)
            except DeployError:
                if rollback is not None:
                    if previous is not None:
                        write_release(self.state, previous)
                        rollback_manifest = self.state
                    else:
                        # Leave CI state absent so another first-CI attempt sees the manual baseline.
                        self.state.unlink(missing_ok=True)
                        rollback_manifest = self.manual_state
                    try:
                        self._start(environment, manifest=rollback_manifest)
                    except DeployError:
                        raise DeployError(
                            "Deployment and health-checked rollback failed; administrator action is required."
                        ) from None
                    raise DeployError(
                        "Deployment failed; the previous image was restored and is healthy."
                    ) from None
                stop_failed = False
                try:
                    self._compose(environment, "stop", "--timeout", "20")
                except DeployError:
                    stop_failed = True
                self.state.unlink(missing_ok=True)
                if stop_failed:
                    raise DeployError(
                        "Initial deployment failed and services could not be stopped; administrator action is required."
                    ) from None
                raise DeployError("Initial deployment failed; no successful release was recorded.") from None


def assert_secure_path(path: Path, *, directory: bool, owner: int = 0) -> None:
    try:
        metadata = path.lstat()
    except OSError:
        raise DeployError("Deployment control files are missing; rerun administrator setup.") from None
    expected = stat.S_ISDIR if directory else stat.S_ISREG
    if not expected(metadata.st_mode) or metadata.st_uid != owner or metadata.st_mode & 0o022:
        raise DeployError("Deployment paths have unsafe ownership, type or write permissions.")


def secure_layout(control: Path = CONTROL) -> None:
    for directory in (control, *control.parents):
        assert_secure_path(directory, directory=True)
    for name in ("deploy.py", "compose.yaml", "INSTALLATION"):
        assert_secure_path(control / name, directory=False)
    env = control / "app.env"
    assert_secure_path(env, directory=False)
    if env.lstat().st_mode & 0o077:
        raise DeployError("The runtime environment file must be private to root (mode 0600).")
    for name in ("release.env", "manual-release.env", "deploy.lock"):
        path = control / name
        if path.exists() or path.is_symlink():
            assert_secure_path(path, directory=False)
    data = control.parent / "data"
    assert_secure_path(data, directory=True, owner=1000)
    assert_secure_path(data / "local.db", directory=False, owner=1000)
    if data.lstat().st_mode & 0o077 or (data / "local.db").lstat().st_mode & 0o077:
        raise DeployError("The database directory and file must be private to UID 1000.")


@contextmanager
def deployment_lock(path: Path):
    import fcntl

    descriptor = os.open(path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise DeployError("Another Datathon 2026 deployment is already running.") from None
        yield
    finally:
        os.close(descriptor)


def main() -> int:
    try:
        if len(sys.argv) != 1 or os.environ.get("SSH_ORIGINAL_COMMAND", "") not in ("", "deploy"):
            raise DeployError("Only the fixed deployment operation is accepted.")
        if not hasattr(os, "geteuid") or os.geteuid() != 0:
            raise DeployError("Use the restricted administrator rule to invoke this gateway.")
        if Path(__file__).absolute() != CONTROL / "deploy.py":
            raise DeployError("Install the gateway at its fixed protected control path.")
        secure_layout()

        def expired(_signal, _frame):
            raise DeployError("Deployment request input timed out.")

        signal.signal(signal.SIGALRM, expired)
        signal.alarm(15)
        try:
            request = parse_request(sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1))
        finally:
            signal.alarm(0)
        with deployment_lock(CONTROL / "deploy.lock"):
            Deployment().deploy(request)
        print(f"Datathon 2026 release {request.release.revision} is healthy.")
        return 0
    except DeployError as error:
        print(str(error), file=sys.stderr)
        return 1
    except Exception:
        print("Deployment failed; an administrator must inspect it locally.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
