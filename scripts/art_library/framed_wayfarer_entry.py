"""Blender entry point, invoked through the managed authoring command."""
import importlib.util
from pathlib import Path
import sys

recipe, out = map(Path, sys.argv[sys.argv.index('--') + 1:])
spec = importlib.util.spec_from_file_location('framed_component', recipe)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
module.build_all(out)
