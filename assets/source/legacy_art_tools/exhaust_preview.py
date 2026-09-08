"""Render the actual runtime WGSL through the game's GPU preview adapter."""
import base64
import io
import json
import subprocess
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'artifacts/space_tiles'
source = (ROOT / 'data/shaders/runtime_effect.wgsl').read_text()
renderer = ROOT / 'target/debug/sidereal-shader-preview-render'
frames = []
for index in range(24):
    request = {'width': 128, 'height': 512, 'transparent': True, 'layers': [{
        'source': source, 'values': {
            'effect.identity_a': [1, index / 24, 1, 1],
            'effect.params_a': [1.4, .12, .2, 24],
            'effect.params_b': [0, 0, 0, 0],
            'effect.color_a': [1, .34, .08, 1],
            'effect.color_b': [1, .92, .82, 1],
            'effect.color_c': [.15, .65, 1, 1],
        }}]}
    run = subprocess.run([str(renderer)], input=json.dumps(request), text=True,
                         capture_output=True, cwd=ROOT)
    if run.returncode:
        raise RuntimeError(run.stderr[-5000:])
    result = json.loads(run.stdout)
    if not result['ok'] or not result.get('pngBase64'):
        raise RuntimeError(result.get('diagnostics'))
    frames.append(Image.open(io.BytesIO(base64.b64decode(result['pngBase64']))).convert('RGBA'))
assert frames[0].tobytes() != frames[6].tobytes(), 'exhaust must animate'
frames[0].save(OUTPUT / 'exhaust_frame.png')
frames[0].save(OUTPUT / 'exhaust_animation.png', save_all=True, append_images=frames[1:],
               duration=1000/24, loop=0, disposal=1)
print('Rendered 24 animated frames from runtime_effect.wgsl:', OUTPUT / 'exhaust_animation.png')
