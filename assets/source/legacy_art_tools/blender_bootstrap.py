"""Load the pinned upstream add-on in an isolated Blender GUI (virtual display)."""
import importlib.util
import os
from pathlib import Path
import sys

import bpy

# Blender and the MCP environment may use different Python versions. Only the
# pure-Python requests dependencies are imported from this path by the add-on.
site = Path(os.environ["SIDEREAL_ART_SITE_PACKAGES"])
sys.path.append(str(site))
path = site / "blender_mcp/bundled/addon.py"
spec = importlib.util.spec_from_file_location("blender_mcp_addon", path)
addon = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = addon
spec.loader.exec_module(addon)
bpy.types.blendermcp_server = addon.BlenderMCPServer(
    host=os.environ["BLENDER_HOST"], port=int(os.environ["BLENDER_PORT"])
)
addon.register()
bpy.context.scene.blendermcp_auto_start_server = False
bpy.context.scene.blendermcp_server_running = True
print("SIDEREAL_BLENDER_READY", flush=True)
