#!/usr/bin/env python3
"""Serve only the local art-review library, using dev.toml configuration."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tomllib
import json
from urllib.parse import urlsplit, unquote

root = Path(__file__).resolve().parents[2]
config = tomllib.loads((root / "dev.toml").read_text())["art_library"]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root / "assets/art-library"), **kwargs)

    def translate_path(self, path):
        requested=unquote(urlsplit(path).path)
        if requested=="/docs/blender_asset_migration.md":
            return str(root/"docs/blender_asset_migration.md")
        sources=json.loads((root/"assets/art-library/sources.json").read_text())
        for source in sources:
            if requested=="/"+source["path"]:
                return str(root/source["path"])
        return super().translate_path(path)


if __name__ == "__main__":
    server = ThreadingHTTPServer((config["host"], config["port"]), Handler)
    print(f"Art library: http://{config['host']}:{config['port']}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
