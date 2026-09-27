import { REVIEWED_YELLOW_STAR } from "../../../../packages/render/src/environment/reviewed-star-catalog";
import { useEffect, useRef, useState } from "react";
import { REVIEWED_NATIVE_PLANETS } from "../../../../packages/render/src/environment/reviewed-native-planet-catalog";
import { createReviewedNativePreview } from "../../../../packages/render/src/environment/reviewed-native-preview";

export function ReviewedPlanetStudio() {
  const [id, setId] = useState(
    REVIEWED_NATIVE_PLANETS.find((item) => item.style === "ice")?.id ??
      REVIEWED_NATIVE_PLANETS[0]?.id ??
      "",
  );
  const [seed, setSeed] = useState(38),
    [draftSeed, setDraftSeed] = useState("38");
  const [attempt, setAttempt] = useState(0),
    [status, setStatus] = useState("Loading reviewed planet…"),
    [error, setError] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<ReturnType<typeof createReviewedNativePreview> | null>(
    null,
  );
  useEffect(() => {
    if (!canvas.current) return;
    const instance = createReviewedNativePreview(
      canvas.current,
      (message, failed = false) => {
        setStatus(message);
        setError(failed);
      },
    );
    preview.current = instance;
    return () => {
      instance.dispose();
      preview.current = null;
    };
  }, []);
  useEffect(() => {
    void preview.current?.select(id, seed);
  }, [id, seed, attempt]);
  const isStar = id === REVIEWED_YELLOW_STAR.id;
  const selected = isStar
    ? REVIEWED_YELLOW_STAR
    : REVIEWED_NATIVE_PLANETS.find((item) => item.id === id);
  function generate() {
    const value = Number(draftSeed);
    if (!Number.isInteger(value) || value < 0 || value > 2147483647) {
      setStatus("Seed must be a whole number from 0 to 2147483647.");
      setError(true);
      return;
    }
    setSeed(value);
    setAttempt((value) => value + 1);
  }
  return (
    <main className="planet-studio">
      <section
        className="planet-view"
        aria-label="Reviewed celestial body preview"
      >
        <canvas
          ref={canvas}
          aria-label={`Orbit and zoom the reviewed ${isStar ? "star" : "planet"}`}
        />
        <div className="planet-heading">
          <div>
            <h1>Reviewed planets and stars</h1>
            <p>Drag to orbit · Scroll to zoom</p>
          </div>
        </div>
        <div className="native-planet-status" role="status" data-error={error}>
          {status}
          {error && (
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Retry
            </button>
          )}
        </div>
      </section>
      <aside className="native-planet-controls">
        <h2>Reviewed planets and stars</h2>
        <p>
          Authored Blender surfaces, materials and retained levels of detail.
        </p>
        <label>
          Planet, moon or star
          <select value={id} onChange={(event) => setId(event.target.value)}>
            <option value={REVIEWED_YELLOW_STAR.id}>
              {REVIEWED_YELLOW_STAR.label}
            </option>
            {REVIEWED_NATIVE_PLANETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <p className="native-planet-revision">
          Selected revision: {selected?.revision}
        </p>
        {!isStar && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              generate();
            }}
          >
            <label>
              Composition seed
              <input
                type="number"
                min="0"
                max="2147483647"
                step="1"
                value={draftSeed}
                onChange={(event) => setDraftSeed(event.target.value)}
              />
            </label>
            <button type="submit">Generate composition</button>
          </form>
        )}
        {isStar && <p>A golden main-sequence star with active solar flares.</p>}
        {isStar ? (
          <p>
            Orbit to inspect the surface and animated flares. The star retains
            its authored detail at every viewing distance.
          </p>
        ) : (
          <p>
            Zoom out and approach again to inspect the LOD transition. Authored
            surface details stay intact.
          </p>
        )}
      </aside>
    </main>
  );
}
