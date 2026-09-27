"""Build isolated native Blender planet drafts; never publish runtime assets."""
from pathlib import Path
import subprocess, sys, tomllib
root = Path(__file__).resolve().parents[2]
out = (root / '.runtime/art-library/planets' / (sys.argv[1] if len(sys.argv)>1 else 'ice-r001')).resolve()
if not out.is_relative_to(root / '.runtime/art-library/planets'):
    raise ValueError('Isolated review path required')
if any((out / source).exists() for source in ['planet.blend', 'kit.blend']):
    raise ValueError('Preserve prior source revision')
config = tomllib.loads((root / 'dev.toml').read_text())
recipe = ('build_volcanic_geology_kit.py' if '--volcanic-geology-kit' in sys.argv else
          'build_glacial_interior_kit.py' if '--glacial-interior-kit' in sys.argv else
          'build_glacial_geography_kit.py' if '--glacial-geography-kit' in sys.argv else
          'build_clustered_glacier_kit.py' if '--cluster-glacier-kit' in sys.argv else
          'build_basin_corner_ice_kit.py' if '--corner-basin-kit' in sys.argv else
          'build_basin_sealed_ice_kit.py' if '--sealed-basin-kit' in sys.argv else
          'build_basin_ice_kit.py' if '--basin-kit' in sys.argv else
          'build_faceted_ice_kit.py' if '--faceted-kit' in sys.argv else
          'build_glacial_repaired_ice_kit.py' if '--repaired-kit' in sys.argv else
          'build_glacial_ice_kit.py' if '--glacial-kit' in sys.argv else
          'build_stepped_ice_kit.py' if '--stepped-kit' in sys.argv else
          'build_ice_shelf_review.py' if '--shelf' in sys.argv else
          'build_planet_crust_review.py' if '--crust' in sys.argv else
          'build_planet_review.py')
subprocess.run([config['art']['blender'], '--background', '--threads', '4',
                '--python-exit-code', '1', '--python', str(root / 'scripts/art_library' / recipe),
                '--', str(out)], cwd=root, check=True)
