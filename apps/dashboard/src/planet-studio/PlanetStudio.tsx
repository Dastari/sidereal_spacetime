import { useEffect, useRef, useState } from "react";
import {
  PLANET_STYLES,
  planetRecipe,
  validatePlanetRecipe,
  planetEffects,
  type PlanetRecipe,
  type PlanetStyle,
} from "../../../../packages/content/src/environment";
import { createPlanetPreview } from "../../../../packages/render/src/environment/planet-preview";
import "./planet-studio.css";
const ranges = [
  ["terrain", "Surface relief", 1, 0.01],
  ["mountains", "Mountains & spires", 1, 0.01],
  ["seaLevel", "Sea level", 1, 0.01],
  ["cloudCoverage", "Cloud cover", 1, 0.01],
  ["cloudSpeed", "Weather drift", 0.1, 0.001],
  ["emission", "Deposit radiance", 4, 0.05],
] as const;
export default function PlanetStudio() {
  const [recipe, setRecipe] = useState<PlanetRecipe>(() => planetRecipe());
  const [gallery, setGallery] = useState(false);
  const [status, setStatus] = useState("Generating surface…");
  const [error, setError] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null);
  const preview = useRef<ReturnType<typeof createPlanetPreview> | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    preview.current = createPlanetPreview(canvas.current, setStatus);
    return () => {
      preview.current?.dispose();
      preview.current = null;
    };
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        preview.current?.update(validatePlanetRecipe(recipe), gallery);
        setError("");
      } catch (e) {
        setError(String(e));
      }
    }, 120);
    return () => window.clearTimeout(timer);
  }, [recipe, gallery]);
  function change(key: keyof PlanetRecipe, value: number | boolean) {
    setGallery(false);
    setRecipe((r) => ({ ...r, [key]: value }));
  }
  async function importRecipe(file?: File) {
    if (!file) return;
    try {
      if (file.size > 16000) throw new Error("Recipe file exceeds 16 KB");
      const candidate = validatePlanetRecipe(JSON.parse(await file.text()));
      setRecipe(candidate);
      setGallery(false);
      setError("");
    } catch (e) {
      setError(`Could not import recipe: ${String(e)}`);
    }
  }
  function effect(key: keyof ReturnType<typeof planetEffects>, value: number) {
    setGallery(false);
    setRecipe((r) => ({
      ...r,
      effects: { ...planetEffects(r), [key]: value },
    }));
  }
  function exportRecipe() {
    try {
      const json = JSON.stringify(validatePlanetRecipe(recipe), null, 2);
      const url = URL.createObjectURL(
        new Blob([json], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `${recipe.style}-${recipe.seed}.planet.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(String(e));
    }
  }
  return (
    <main className="planet-studio">
      <section className="planet-view">
        <div className="planet-heading">
          <div>
            <h1>Genesis</h1>
            <p>Shape a world from a seed.</p>
          </div>
          <button className="secondary" onClick={() => setGallery((v) => !v)}>
            {gallery ? "Edit selected world" : "Compare ten families"}
          </button>
        </div>
        <canvas ref={canvas} aria-label="Procedural planet preview" />
        {gallery && (
          <div className="planet-family-key">
            {PLANET_STYLES.map((style) => (
              <button
                key={style}
                onClick={() => {
                  setRecipe(planetRecipe(style, recipe.seed));
                  setGallery(false);
                }}
              >
                {style}
              </button>
            ))}
          </div>
        )}
        <div className="planet-view-footer">
          <span role="status">{status}</span>
          <span>Drag to orbit · scroll to zoom</span>
        </div>
      </section>
      <aside className="planet-controls">
        <h2>World recipe</h2>
        <label>
          Family
          <select
            value={recipe.style}
            onChange={(e) => {
              setGallery(false);
              setRecipe(
                planetRecipe(e.target.value as PlanetStyle, recipe.seed),
              );
            }}
          >
            {PLANET_STYLES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Seed
          <input
            type="number"
            min="0"
            max="2147483647"
            value={recipe.seed}
            onChange={(e) => change("seed", Number(e.target.value))}
          />
        </label>
        <div className="planet-seed-actions">
          <button
            className="secondary"
            onClick={() => change("seed", (recipe.seed + 1) % 2147483648)}
          >
            Next seed
          </button>
          <button
            className="secondary"
            onClick={() => {
              setRecipe(planetRecipe(recipe.style, recipe.seed));
              setGallery(false);
            }}
          >
            Reset shape
          </button>
        </div>
        {ranges.map(([key, label, max, step]) => (
          <label className="planet-range" key={key}>
            <span>
              {label}
              <output>
                {recipe[key].toFixed(key === "cloudSpeed" ? 3 : 2)}
              </output>
            </span>
            <input
              type="range"
              min="0"
              max={max}
              step={step}
              value={recipe[key]}
              onChange={(e) => change(key, Number(e.target.value))}
            />
          </label>
        ))}
        <label>
          Detail
          <select
            value={recipe.resolution}
            onChange={(e) => change("resolution", Number(e.target.value))}
          >
            <option value="24">24 cells · distant</option>
            <option value="40">40 cells · balanced</option>
            <option value="52">52 cells · detailed</option>
            <option value="64">64 cells · fine</option>
            <option value="96">96 cells · hero</option>
          </select>
        </label>
        <h2>Surface effects</h2>
        {(
          [
            ["vegetation", "Forest coverage"],
            ["volcanicCoverage", "Volcanic zones"],
            ["crystalCoverage", "Crystal clusters"],
            ["smoke", "Smoke & haze"],
            ["atmosphere", "Atmosphere rim"],
          ] as const
        ).map(([key, label]) => (
          <label className="planet-range" key={key}>
            <span>
              {label}
              <output>{planetEffects(recipe)[key].toFixed(2)}</output>
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step=".01"
              value={planetEffects(recipe)[key]}
              onChange={(e) => effect(key, Number(e.target.value))}
            />
          </label>
        ))}
        <label className="planet-check">
          <input
            type="checkbox"
            checked={recipe.rings}
            onChange={(e) => change("rings", e.target.checked)}
          />
          Ring system
        </label>
        <fieldset className="planet-palette">
          <legend>Surface palette</legend>
          {recipe.palette.map((color, index) => (
            <input
              key={index}
              type="color"
              aria-label={`Palette color ${index + 1}`}
              value={"#" + color}
              onChange={(e) => {
                setGallery(false);
                setRecipe((r) => ({
                  ...r,
                  palette: r.palette.map((c, i) =>
                    i === index ? e.target.value.slice(1) : c,
                  ),
                }));
              }}
            />
          ))}
        </fieldset>
        {error && <p role="alert">{error}</p>}
        <button className="primary full" onClick={exportRecipe}>
          Export recipe
        </button>
        <label className="planet-import">
          Import recipe
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              void importRecipe(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <p className="fine-print">
          A reusable local art draft. World placement and publication require
          the authoring workflow.
        </p>
      </aside>
    </main>
  );
}
