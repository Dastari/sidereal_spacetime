import { useEffect, useRef, useState } from "react";
import type {
  CharacterPreviewAppearance,
  createCharacterPreview,
} from "@sidereal/render/character-preview";
import { GameButton, GameNotice } from "@sidereal/ui/game";

type Preview = ReturnType<typeof createCharacterPreview>;

/** A caller-owned portrait: render only while dirty, with no hidden animation loop. */
export function CharacterPreview({
  appearance,
  name,
}: {
  appearance: CharacterPreviewAppearance;
  name: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const preview = useRef<Preview | null>(null);
  const wake = useRef<() => void>(() => {});
  const latest = useRef(appearance);
  latest.current = appearance;
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false,
      frame = 0,
      visible = true,
      failed = false,
      attempts = 0;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const clearWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = undefined;
    };
    const fail = () => {
      if (disposed || failed) return;
      failed = true;
      clearWatchdog();
      cancelAnimationFrame(frame);
      frame = 0;
      const current = preview.current;
      preview.current = null;
      current?.canvas.remove();
      current?.dispose();
      setStatus("error");
    };
    const armWatchdog = () => {
      if (
        disposed ||
        failed ||
        document.hidden ||
        !visible ||
        watchdog !== undefined ||
        preview.current?.presentationStatus === "ready"
      )
        return;
      watchdog = setTimeout(() => {
        watchdog = undefined;
        if (!disposed && visible && !document.hidden) fail();
      }, 30_000);
    };
    const paint = (now: number) => {
      frame = 0;
      const current = preview.current;
      if (disposed || failed || !visible || document.hidden || !current) return;
      if (current.status === "error") {
        fail();
        return;
      }
      if (current.status !== "ready") return;
      try {
        current.render(now / 1000, true);
      } catch {
        fail();
        return;
      }
      if (current.presentationStatus === "error") {
        fail();
        return;
      }
      if (current.presentationStatus === "ready") {
        clearWatchdog();
        attempts = 0;
        setStatus("ready");
      } else {
        setStatus("loading");
      }
      if (current.needsRender) {
        if (++attempts > 600) {
          fail();
          return;
        }
        frame = requestAnimationFrame(paint);
      }
    };
    const schedule = () => {
      if (!disposed && !failed && visible && !document.hidden && !frame) {
        armWatchdog();
        frame = requestAnimationFrame(paint);
      }
    };
    wake.current = schedule;
    const resize = () => {
      const current = preview.current;
      if (!current) return;
      const width = Math.max(1, element.clientWidth);
      const height = Math.max(1, element.clientHeight);
      // Clamp both axes by one factor so CSS cannot stretch the portrait.
      // The renderer applies its own uniform 640-pixel resource cap afterward.
      const scale = Math.min(
        devicePixelRatio || 1,
        1.5,
        720 / width,
        900 / height,
      );
      current.resize(
        Math.max(1, Math.round(width * scale)),
        Math.max(1, Math.round(height * scale)),
      );
      attempts = 0;
      schedule();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) schedule();
      else clearWatchdog();
    });
    intersection.observe(element);
    const visibilityChanged = () => {
      if (document.hidden) clearWatchdog();
      else schedule();
    };
    document.addEventListener("visibilitychange", visibilityChanged);
    armWatchdog();
    setStatus("loading");
    void import("@sidereal/render/character-preview")
      .then(({ createCharacterPreview }) => {
        if (disposed || failed) return;
        const current = createCharacterPreview({ onInvalidate: schedule });
        preview.current = current;
        current.canvas.className = "character-model-canvas";
        current.canvas.setAttribute("aria-hidden", "true");
        current.setAppearance(
          latest.current.outfit ?? "engineer",
          latest.current,
        );
        current.setRotation(0.38);
        element.appendChild(current.canvas);
        resize();
        void current.ready.then(() => {
          if (disposed || failed) return;
          if (current.status === "error") fail();
          else schedule();
        });
      })
      .catch(() => {
        fail();
      });
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      clearWatchdog();
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", visibilityChanged);
      wake.current = () => {};
      const current = preview.current;
      preview.current = null;
      current?.canvas.remove();
      current?.dispose();
    };
  }, [retry]);
  useEffect(() => {
    preview.current?.setAppearance(appearance.outfit ?? "engineer", appearance);
    wake.current();
  }, [appearance]);
  const drag = useRef<{ id: number; x: number } | null>(null);
  const rotate = (delta: number) => {
    preview.current?.rotate(delta);
    wake.current();
  };
  return (
    <div className="character-preview">
      <div
        className="character-model-host"
        ref={host}
        role="img"
        aria-label={`Three-dimensional preview of ${name}. Use the rotation buttons to change its view.`}
        onPointerDown={(event) => {
          if (event.button !== 0 || status !== "ready") return;
          drag.current = { id: event.pointerId, x: event.clientX };
          event.currentTarget.setPointerCapture(event.pointerId);
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.id !== event.pointerId) return;
          rotate((event.clientX - active.x) * 0.008);
          active.x = event.clientX;
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
      />
      {status === "loading" && (
        <p className="character-preview-message" role="status">
          Preparing character preview…
        </p>
      )}
      {status === "error" && (
        <div className="character-preview-message">
          <GameNotice kind="warning">
            Preview unavailable. You can still enter the world.
          </GameNotice>
          <GameButton
            variant="secondary"
            onClick={() => setRetry((value) => value + 1)}
          >
            Retry preview
          </GameButton>
        </div>
      )}
      <div
        className="character-preview-controls"
        aria-label="Character preview controls"
      >
        <GameButton
          variant="ghost"
          disabled={status !== "ready"}
          aria-label="Rotate character left"
          onClick={() => rotate(-Math.PI / 8)}
        >
          ↶
        </GameButton>
        <GameButton
          variant="ghost"
          disabled={status !== "ready"}
          onClick={() => {
            preview.current?.setRotation(0.38);
            wake.current();
          }}
        >
          Reset view
        </GameButton>
        <GameButton
          variant="ghost"
          disabled={status !== "ready"}
          aria-label="Rotate character right"
          onClick={() => rotate(Math.PI / 8)}
        >
          ↷
        </GameButton>
      </div>
    </div>
  );
}
