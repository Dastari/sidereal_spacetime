"""Install the reviewed Blender MCP revision into an isolated project environment."""
from pathlib import Path
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[2]
REVISION = "c5f35d9cc54451d785ac4c00c48bf9e98a2e8db9"
ENV = ROOT / ".art-tools" / "venv"


def main():
    venv.EnvBuilder(with_pip=True).create(ENV)
    python = ENV / "bin/python"
    subprocess.run([
        str(python), "-m", "pip", "install", "--disable-pip-version-check",
        f"https://github.com/ahujasid/blender-mcp/archive/{REVISION}.zip",
        "Pillow==12.3.0", "requests==2.34.2",
    ], check=True)
    lock = subprocess.check_output([str(python), "-m", "pip", "freeze"], text=True)
    (ROOT / ".art-tools" / "installed-requirements.txt").write_text(lock)
    print("Blender MCP installed. Use scripts/siderealctl art-build or art-mcp.")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        sys.exit(error.returncode)
