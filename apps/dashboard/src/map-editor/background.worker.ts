import { spaceVista } from "@sidereal/content/environment";
import {
  prepareSpaceBackground,
  type SpaceRegion,
} from "@sidereal/sim/space-background";
import type { Camera } from "./MapCanvas";
self.onmessage = (
  event: MessageEvent<{
    region: SpaceRegion;
    camera: Camera;
    width: number;
    height: number;
    ratio: number;
    previewHeight: number;
    plates: Map<string, Uint8ClampedArray>;
  }>,
) => {
  const { region, camera, width, height, ratio, previewHeight, plates } =
    event.data;
  const resolve = prepareSpaceBackground(region);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4,
        weights = resolve({
          x: camera.x + (x / width - 0.5) * camera.span,
          y: camera.y - ((y / height - 0.5) * camera.span) / ratio,
          height: previewHeight,
        });
      let r = 2,
        g = 5,
        b = 12;
      for (const w of weights) {
        const data = plates.get(w.id);
        if (!data) continue;
        const v = spaceVista(w.id),
          a = w.weight * Math.min(1, v.nebulaStrength) * 0.7;
        r += data[i] * v.nebulaTint[0] * a;
        g += data[i + 1] * v.nebulaTint[1] * a;
        b += data[i + 2] * v.nebulaTint[2] * a;
      }
      pixels[i] = r;
      pixels[i + 1] = g;
      pixels[i + 2] = b;
      pixels[i + 3] = 255;
    }
  self.postMessage({ pixels }, { transfer: [pixels.buffer] });
};
