import { useEffect, useRef } from "react";
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
/** Spatial preview samples the same membership/feather policy as the game. */
export function MapBackground({
  doc,
  camera,
  ratio,
  previewHeight,
}: {
  doc: SystemMapDocument;
  camera: Camera;
  ratio: number;
  previewHeight: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false;
    const worker = new Worker(
      new URL("./background.worker.ts", import.meta.url),
      { type: "module" },
    );
    const canvas = ref.current;
    if (!canvas) return;
    const width = 320,
      height = Math.max(80, Math.round(width / ratio));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let region;
    try {
      region = spaceRegion(doc);
    } catch {
      worker.terminate();
      return;
    }
    const ids = [
      ...new Set([
        "deep-space",
        doc.backgroundId,
        ...(region.zones ?? region.fields)
          .map((f) => f.backgroundId)
          .filter((id): id is string => !!id),
      ]),
    ];
    const draw = async () => {
      const plates = new Map<string, Uint8ClampedArray>();
      await Promise.all(
        ids.map(async (id) => {
          if (id === "deep-space") return;
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
            plates.set(id, g.getImageData(0, 0, width, height).data);
          } catch {
            /* Keep the starfield available when an optional image fails. */
          }
        }),
      );
      if (disposed) return;
      worker.onmessage = (
        event: MessageEvent<{ pixels: Uint8ClampedArray }>,
      ) => {
        if (disposed) return;
        const pixels = ctx.createImageData(width, height);
        pixels.data.set(event.data.pixels);
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
      };
      worker.postMessage({
        region,
        camera,
        width,
        height,
        ratio,
        previewHeight,
        plates,
      });
    };
    void draw();
    return () => {
      disposed = true;
      worker.terminate();
    };
  }, [doc, camera, ratio, previewHeight]);
  return <canvas ref={ref} className="map-space-preview" aria-hidden="true" />;
}
