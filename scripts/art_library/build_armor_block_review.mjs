// Freeze every actual game source consumed by the private browser review.
import { build } from "esbuild";
import { readFile, writeFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((s, i, a) => (i % 2 === 0 ? [s.replace(/^--/, ""), a[i + 1]] : null))
    .filter(Boolean),
);
if (!args.source || !args.review) throw Error("--source and --review required");
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const candidate = await realpath(args.source),
  review = await realpath(args.review);
const entry = path.join(root, "scripts/art_library/armor_block_browser.mjs");
const sha = (data) => createHash("sha256").update(data).digest("hex");
const result = await build({
  absWorkingDir: root,
  entryPoints: [entry],
  outfile: path.join(review, "review.bundle.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  metafile: true,
  nodePaths: [path.join(root, "node_modules")],
  plugins: [
    {
      name: "exact-game-candidate",
      setup(builder) {
        builder.onResolve({ filter: /^\.\.\/\.\.\/packages\// }, (arg) => {
          if (arg.importer !== entry) return;
          return builder.resolve(
            path.resolve(candidate, "scripts/art_library", arg.path),
            { kind: arg.kind, resolveDir: candidate },
          );
        });
      },
    },
  ],
});
const sources = [];
for (const name of Object.keys(result.metafile.inputs)) {
  if (name.includes("node_modules")) continue;
  const file = path.resolve(root, name);
  sources.push({ path: file, sha256: sha(await readFile(file)) });
}
const provenance = {
  candidate,
  sha256: sha(await readFile(path.join(review, "review.bundle.js"))),
  sources,
  sourceOverrides: [],
  limitation:
    "Private visual filtering and rigid review equipment mounts only; original qualified fixture loads unchanged.",
};
await writeFile(
  path.join(review, "bundle-provenance.json"),
  JSON.stringify(provenance, null, 2) + "\n",
);
await writeFile(
  path.join(review, "index.html"),
  '<!doctype html><html><head><meta charset="utf-8"><title>Native armor block review</title><style>html,body{margin:0;height:100%;background:#09111b}canvas{display:block;width:100%;height:100%}</style></head><body><canvas></canvas><script type="module" src="/__armor-review/review.bundle.js"></script></body></html>',
);
console.log(
  JSON.stringify({ sha256: provenance.sha256, sourceCount: sources.length }),
);
