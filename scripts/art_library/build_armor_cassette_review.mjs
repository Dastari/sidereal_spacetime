// Bundle only for an explicitly selected source candidate. Retain every source
// hash so browser evidence cannot be confused with the evolving shared checkout.
import { build } from 'esbuild';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((s, i, a) =>
  i % 2 === 0 ? [s.replace(/^--/, ''), a[i + 1]] : null).filter(Boolean));
if (!args.source || !args.review) throw Error('--source and --review required');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const candidate = await realpath(args.source);
const review = await realpath(args.review);
const entry = path.join(root, 'scripts/art_library/armor_cassette_browser.mjs');
const sourceHash = data => createHash('sha256').update(data).digest('hex');
const outputs = [];
for (const kind of ['whole', 'bare']) {
  const result = await build({
    absWorkingDir: root, entryPoints: [entry], outfile: path.join(review, kind + '.bundle.js'),
    bundle: true, format: 'esm', platform: 'browser', metafile: true,
    nodePaths: [path.join(root, 'node_modules')],
    plugins: [{ name: 'exact-candidate', setup(builder) {
      builder.onResolve({ filter: /^\.\.\/\.\.\/packages\// }, arg => {
        if (arg.importer !== entry) return;
        return builder.resolve(path.resolve(candidate, 'scripts/art_library', arg.path), {
          kind: arg.kind, resolveDir: candidate,
        });
      });
      builder.onLoad({ filter: /framed-wayfarer-visuals\.json$/ }, async () => ({
        contents: await readFile(path.join(review, kind + '-bindings.json'), 'utf8'), loader: 'json',
      }));
    } }],
  });
  const sources = [];
  for (const name of Object.keys(result.metafile.inputs)) {
    if (name.includes('node_modules')) continue;
    const file = path.resolve(root, name);
    sources.push({ path: file, sha256: sourceHash(await readFile(file)) });
  }
  outputs.push({ kind, sha256: sourceHash(await readFile(path.join(review, kind + '.bundle.js'))), sources,
    bindingOverrideSha256: sourceHash(await readFile(path.join(review, kind + '-bindings.json'))) });
}
await writeFile(path.join(review, 'bundle-provenance.json'), JSON.stringify({ candidate, outputs }, null, 2) + '\n');
await writeFile(path.join(review, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Wayfarer armor native review</title><style>html,body{margin:0;height:100%;background:#09111b}canvas{display:block;width:100%;height:100%}</style></head><body><canvas></canvas><script type="module">const mode=new URLSearchParams(location.search).get('mode');await import('/__armor-review/'+(['bare','exploded'].includes(mode)?'bare':'whole')+'.bundle.js');</script></body></html>`);
console.log(JSON.stringify(outputs.map(({kind, sha256, sources}) => ({kind, sha256, sources: sources.length}))));
