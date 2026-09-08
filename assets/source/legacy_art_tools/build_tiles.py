"""Exercise real MCP, render editable geometry, then pack 2D review assets."""
from pathlib import Path
import argparse
import asyncio
from datetime import timedelta
import json
import sys
import zipfile

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from pack_tiles import pack

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import devenv


async def render(output, probe_only):
    params = StdioServerParameters(command=str(ROOT / "scripts/siderealctl"), args=["art-mcp", "--build-session"])
    with (output / "mcp.log").open("w") as log:
        async with stdio_client(params, errlog=log) as (read, write):
            async with ClientSession(read, write) as session:
                init = await session.initialize()
                available = await session.list_tools()
                names = [tool.name for tool in available.tools]
                if "execute_blender_code" not in names:
                    raise RuntimeError("Upstream MCP code tool missing")
                scene = await session.call_tool("get_scene_info", {
                    "user_prompt": "I'm thinking straight top down is better."
                })
                if scene.isError:
                    raise RuntimeError(f"Blender scene inspection failed: {scene.content}")
                proof = {"server": init.serverInfo.model_dump(), "tools": names,
                         "scene_probe": scene.model_dump(mode="json")}
                (output / "mcp-verification.json").write_text(json.dumps(proof, indent=2) + "\n")
                print("MCP initialized; scene inspected; code tool available.", flush=True)
                if probe_only:
                    return None
                code = "OUTPUT = " + repr(str(output)) + "\n"
                themes = json.loads((ROOT / "scripts/art/themes.json").read_text())["themes"]
                code += "THEMES = " + repr(themes) + "\n"
                code += (ROOT / "scripts/art/space_tiles_scene.py").read_text()
                code += (ROOT / "scripts/art/space_tiles_expansion.py").read_text()
                code += (ROOT / "scripts/art/space_tiles_render.py").read_text()
                batches = [code + "\nscene['sidereal_tiles_json'] = json.dumps(TILES)\nscene.name = 'Sidereal kit'\n"]
                for theme in themes:
                    batches.append("THEMES = " + repr([theme]) + "\n" + (ROOT / "scripts/art/space_tiles_shaded.py").read_text())
                from preview import sample_layouts
                for name, prefix in (("station", "comparison"), ("ship", "ship"), ("frigate", "frigate")):
                    study = "ASSEMBLY_LAYOUT = " + repr(sample_layouts()[name]) + "\n"
                    study += "ASSEMBLY_NAME = " + repr(name) + "\nASSEMBLY_PREFIX = " + repr(prefix) + "\n"
                    study += (ROOT / "scripts/art/space_assembly_scene.py").read_text()
                    batches.append(study)
                responses = []
                for index, batch in enumerate(batches):
                    # Restore plain authoring data and existing datablocks between bounded RPCs.
                    # Stay inside upstream safe mode: no exec, drivers, handlers or file reads in Blender.
                    header = "OUTPUT = " + repr(str(output)) + "\nTHEMES = " + repr(themes) + "\n"
                    header += (ROOT / "scripts/art/space_tiles_scene.py").read_text().split("def material(color):")[0]
                    header += "\nscene = bpy.data.scenes['Sidereal kit']\nbpy.context.window.scene = scene\n"
                    header += "TILES = json.loads(scene['sidereal_tiles_json'])\nMATERIALS = {name: bpy.data.materials['MAT-' + name] for name in COLORS}\n"
                    header += "def linear_channel(value):\n    value /= 255\n    return value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4\n"
                    wrapper = batch if index == 0 else header + batch
                    result = await session.call_tool("execute_blender_code", {"code": wrapper},
                                                     read_timeout_seconds=timedelta(minutes=3))
                    response = "\n".join(item.text for item in result.content if item.type == "text")
                    if result.isError or "Error executing code" in response:
                        raise RuntimeError("Blender build failed: " + response[-1800:])
                    responses.append(response)
                    print(f"Blender pass {index + 1}/{len(batches)} complete", flush=True)
                text = "\n".join(responses)
                (output / "build-result.txt").write_text(text)
                if "SIDEREAL_TILES=" not in text or "SIDEREAL_3D_STUDY=complete" not in text:
                    raise RuntimeError("Blender build incomplete: " + text[-1800:])
                line = next(line for line in text.splitlines() if line.startswith("SIDEREAL_TILES="))
                return json.loads(line.partition("=")[2])



def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--probe", action="store_true", help="verify MCP without generating artwork")
    parser.add_argument("--pack-only", action="store_true", help="repack previously rendered source")
    args = parser.parse_args()
    config = devenv.expand(devenv.load_config(), "blender-art", raw_cert=True, use_dotenv=False)
    output = (ROOT / config["SIDEREAL_ART_OUTPUT"]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    if args.pack_only:
        source = json.loads((output / "source_manifest.json").read_text())
    else:
        source = asyncio.run(render(output, args.probe))
        if source is None:
            return
        (output / "source_manifest.json").write_text(json.dumps(source, indent=2) + "\n")
    manifest = pack(output, source)
    from preview import build_preview
    build_preview(output, manifest)
    bundle = output / "sidereal_space_kit.zip"
    with zipfile.ZipFile(bundle, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(output.rglob("*")):
            if not path.is_file() or path == bundle or path.suffix in (".log", ".blend1"):
                continue
            if path.name.startswith("source_") and path.suffix == ".png":
                continue
            if path.name in ("build-result.txt", ".gitignore"):
                continue
            archive.write(path, "sidereal_space_kit/" + str(path.relative_to(output)))
    print(f'Built {len(manifest["tiles"])} tiles: {output / "contact_sheet.png"}', flush=True)


if __name__ == "__main__":
    main()
