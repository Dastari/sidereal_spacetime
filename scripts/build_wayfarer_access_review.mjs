/** Build private evidence bytes outside the repository; never publish or change production source. */
import { rolldown } from "rolldown";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { gzipSync } from "node:zlib";
const root = resolve(import.meta.dirname, ".."),
  output = process.argv[2] && resolve(process.argv[2]);
if (!output || !relative(root, output).startsWith(".."))
  throw Error("An explicit evidence output outside the checkout is required");
const flag = "export const WAYFARER_ACCESS_REVIEW_ENABLED = false;";
let flipped = 0;
const bundle = await rolldown({
  input: resolve(root, "scripts/prefab-render-harness/wayfarer-access.ts"),
  plugins: [
    {
      name: "private-exact-profile-admission",
      transform(code, id) {
        if (
          id ===
          resolve(root, "packages/content/src/wayfarer-access-profile.ts")
        ) {
          if (code.split(flag).length !== 2)
            throw Error("Expected exactly one disabled profile admission flag");
          flipped++;
          return code.replace(flag, flag.replace("false", "true"));
        }
      },
    },
  ],
  transform: { define: { "import.meta": "{}" } },
});
const generated = await bundle.generate({
  format: "iife",
  inlineDynamicImports: true,
});
await bundle.close();
if (flipped !== 1)
  throw Error("Private build must enable exactly one copied admission flag");
const manifest = JSON.parse(
  await readFile(
    resolve(root, "assets/runtime/wayfarer-access/r001/descriptor.json"),
    "utf8",
  ),
);
const bytes = {};
for (const p of manifest.pieces)
  bytes[p.sha256] = (
    await readFile(resolve(root, "assets/runtime/wayfarer-access/r001", p.file))
  ).toString("base64");
const code = `window.__wayfarerAccessBytes=${JSON.stringify(bytes)};\n${generated.output.find((o) => o.type === "chunk").code}`;
await writeFile(output, gzipSync(Buffer.from(code)).toString("base64"));
console.log(
  JSON.stringify({
    output,
    flipped,
    privatePieces: manifest.pieces.length,
    base64Bytes: (await readFile(output)).length,
  }),
);
