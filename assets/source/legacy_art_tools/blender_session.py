"""Own a Blender process and upstream stdio MCP server for one authoring session.

No existing Blender session or saved preferences are modified. All stdout is
reserved for MCP; Blender diagnostics go to logs/art-blender.log.
"""
from pathlib import Path
import argparse
import os
import signal
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import devenv


def stop(process):
    if process is not None and process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--build-session", action="store_true")
    args = parser.parse_args()
    service = "blender-art-build" if args.build_session else "blender-art"
    settings = devenv.expand(devenv.load_config(), service, raw_cert=True, use_dotenv=False)
    env = os.environ.copy()
    env.update(settings)
    # Config is local-only because the upstream add-on executes Python.
    if env["BLENDER_HOST"] != "127.0.0.1":
        raise RuntimeError("Blender authoring must bind to 127.0.0.1")
    address = (env["BLENDER_HOST"], int(env["BLENDER_PORT"]))
    with socket.socket() as probe:
        probe.bind(address)  # refuse to attach to or overwrite another session
    sites = list((ROOT / ".art-tools/venv/lib").glob("python*/site-packages"))
    if len(sites) != 1:
        raise RuntimeError("Run scripts/siderealctl setup-blender first")
    env["SIDEREAL_ART_SITE_PACKAGES"] = str(sites[0])
    env["PYTHONUNBUFFERED"] = "1"
    logs = ROOT / "logs"
    logs.mkdir(exist_ok=True)
    blender = server = None

    def interrupted(_signum, _frame):
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        with (logs / f"{service}.log").open("w") as log:
            blender = subprocess.Popen([
                "xvfb-run", "-a", "-s", "-screen 0 1280x1024x24",
                env["SIDEREAL_BLENDER_EXECUTABLE"], "--factory-startup", "-noaudio",
                "--python", str(ROOT / "scripts/art/blender_bootstrap.py"),
            ], cwd=ROOT, env=env, stdout=log, stderr=log, start_new_session=True)
            deadline = time.monotonic() + 45
            while True:
                if blender.poll() is not None:
                    raise RuntimeError(f"Blender exited; inspect logs/{service}.log")
                try:
                    with socket.create_connection(address, timeout=0.3):
                        break
                except OSError:
                    if time.monotonic() >= deadline:
                        raise RuntimeError(f"Blender readiness timed out; inspect logs/{service}.log")
                    time.sleep(0.1)
            server = subprocess.Popen([
                str(ROOT / ".art-tools/venv/bin/blender-mcp"),
            ], cwd=ROOT, env=env, start_new_session=True)
            return server.wait()
    finally:
        stop(server)
        stop(blender)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(130)
