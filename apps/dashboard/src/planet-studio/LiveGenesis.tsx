import { useEffect, useRef, useState } from "react";
import type { MapBody } from "@sidereal/content/system-map";
import { createReviewedNativePreview } from "@sidereal/render/reviewed-native-preview";
/** One native preview for the selected live instance; values share the map draft
 * and are committed by the same revision-checked world transaction. */
export function LiveGenesis({ body }: { body?: MapBody }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<ReturnType<typeof createReviewedNativePreview> | null>(
    null,
  );
  const [status, setStatus] = useState("Select a celestial instance"),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!canvas.current) return;
    const instance = createReviewedNativePreview(
      canvas.current,
      (message, error = false) => {
        setStatus(message);
        setFailed(error);
      },
    );
    preview.current = instance;
    return () => {
      preview.current = null;
      instance.dispose();
    };
  }, []);
  useEffect(() => {
    if (body?.appearance)
      void preview.current?.select(body.appearance, body.seed ?? 117);
  }, [body?.id, body?.appearance, body?.seed]);
  return (
    <section className="map-genesis-preview">
      <canvas
        ref={canvas}
        aria-label={
          body ? `${body.name} live Genesis preview` : "Genesis preview"
        }
      />
      {!body && (
        <div className="map-genesis-empty">
          Select a planet, moon or star in the Universe tree.
        </div>
      )}
      <p role={failed ? "alert" : "status"}>{body ? status : ""}</p>
    </section>
  );
}
