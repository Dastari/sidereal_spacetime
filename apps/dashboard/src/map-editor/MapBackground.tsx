import { useEffect, useRef } from "react";
import { backgroundRenderer } from "./background-renderer";
import { spaceVista } from "@sidereal/content/environment";
import type { SystemMapDocument } from "@sidereal/content/system-map";
import { spaceRegion } from "@sidereal/sim/space-background";
import type { Camera } from "./MapCanvas";

const images = new Map<string, Promise<HTMLImageElement>>();
function image(url: string) {
  let pending = images.get(url);
  if (!pending) {
    pending = new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(Error("Background unavailable"));
      i.src = url;
    });
    images.set(url, pending);
    void pending.catch(() => images.delete(url));
  }
  return pending;
}
interface View {
  doc: SystemMapDocument;
  camera: Camera;
  ratio: number;
}
/** Planar editor membership preview; feather is always 10% of projected size. */
export function MapBackground(view: View) {
  const ref = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ReturnType<typeof createRenderer> | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const instance = createRenderer(ref.current);
    renderer.current = instance;
    return () => {
      renderer.current = null;
      instance.dispose();
    };
  }, []);
  useEffect(() => {
    renderer.current?.update(view);
  }, [view.doc, view.camera, view.ratio]);
  return <canvas ref={ref} className="map-space-preview" aria-hidden="true" />;
}

function createRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const worker = new Worker(
    new URL("./background.worker.ts", import.meta.url),
    {
      type: "module",
    },
  );
  let cachedDoc: SystemMapDocument | undefined;
  let cachedRegion: ReturnType<typeof spaceRegion>;
  let platesKey = "";
  let platesPromise: Promise<Map<string, Uint8ClampedArray>>;
  const render = backgroundRenderer(
    async ({ doc, camera, ratio }: View) => {
      if (doc !== cachedDoc) {
        const source = spaceRegion(doc);
        const planar = <
          T extends { height: number; width: number; length: number },
        >(
          z: T,
        ) => ({
          ...z,
          height: 0,
          depth: Math.max(z.width, z.length) * 2,
          feather: Math.min(z.width, z.length) * 0.1,
        });
        cachedRegion = {
          ...source,
          center: { ...source.center, height: 0 },
          feather: source.radius * 0.2,
          fields: source.fields.map(planar),
          zones: source.zones?.map(planar),
        };
        cachedDoc = doc;
      }
      const region = cachedRegion;
      const width = 320,
        height = Math.max(80, Math.round(width / ratio));
      const ids = [
        ...new Set(
          [
            doc.backgroundId,
            ...(region.zones ?? region.fields).map((f) => f.backgroundId),
          ].filter((id): id is string => !!id && id !== "deep-space"),
        ),
      ].sort();
      const key = JSON.stringify([width, height, ids]);
      if (key !== platesKey) {
        platesKey = key;
        platesPromise = Promise.all(
          ids.map(async (id) => {
            const v = spaceVista(id);
            try {
              const img = await image(
                `/assets/environment/${v.nebulaAsset ?? "veil-nebula-v1.png"}`,
              );
              const c = document.createElement("canvas");
              c.width = width;
              c.height = height;
              const g = c.getContext("2d")!;
              g.drawImage(img, 0, 0, width, height);
              return [id, g.getImageData(0, 0, width, height).data] as const;
            } catch {
              return undefined;
            }
          }),
        ).then((entries) => new Map(entries.filter((e) => e !== undefined)));
      }
      return {
        region,
        camera,
        width,
        height,
        ratio,
        previewHeight: 0,
        plates: await platesPromise,
      };
    },
    (frame) => worker.postMessage(frame),
    ({ width, height }, data) => {
      const pixels = ctx.createImageData(width, height);
      pixels.data.set(data);
      // Dimension assignment clears a canvas, even when the value is unchanged.
      // Resize only here, in the same task that commits the complete replacement.
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      ctx.putImageData(pixels, 0, 0);
      let seed = 173;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let i = 0; i < 180; i++) {
        ctx.fillStyle = `rgba(204,221,240,${0.25 + random() * 0.65})`;
        ctx.fillRect(
          random() * width,
          random() * height,
          i % 17 === 0 ? 1.3 : 0.65,
          0.7,
        );
      }
    },
  );
  worker.onmessage = (event: MessageEvent<{ pixels: Uint8ClampedArray }>) =>
    render.complete(event.data.pixels);
  return {
    update: render.update,
    dispose() {
      render.dispose();
      worker.terminate();
    },
  };
}
