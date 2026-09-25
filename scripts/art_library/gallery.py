"""Standalone local review browser. No network, service or approval mutation.

Design: a cool paper workbench around source pixels. Slate #273b50, paper
#e9eef2, navy #132438, blue #225fa6, amber #8b5705, white #fff. Humanist
Trebuchet body, Georgia title. Large references lead; quiet compact controls
support inspection. The game reference's luminous borders stay in the images.
"""
import json
from html import escape
from pathlib import Path


def render_gallery(lib,catalog,designs,stats):
    render_design_pages(lib,catalog,designs)
    payload=json.dumps({"references":catalog["references"],"designs":designs,"stats":stats},ensure_ascii=False).replace("<","\\u003c")
    html='''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sidereal art library</title>
<link rel="icon" href="data:,">
<style>
:root{font-family:"Trebuchet MS",Arial,sans-serif;color:#273b50;background:#e9eef2;color-scheme:light}*{box-sizing:border-box}body{margin:0}a{color:#225fa6;text-underline-offset:3px}a:hover{text-decoration-thickness:2px}button,input,select{font:inherit}button,select,input{border:1px solid #9babb9;border-radius:4px;background:#fff;color:#21354b;padding:10px 12px}button{cursor:pointer}button:disabled{opacity:.45;cursor:default}:focus-visible{outline:3px solid #225fa6;outline-offset:3px}header{display:flex;gap:30px;align-items:end;justify-content:space-between;padding:34px 4vw 23px;background:#fff;border-bottom:1px solid #c7d2dd}h1{font:normal clamp(28px,4vw,48px)/1.1 Georgia,serif;margin:0 0 10px}header p{margin:0;max-width:75ch;line-height:1.5}nav{display:flex;gap:18px;flex-wrap:wrap;align-items:center}main{padding:24px 4vw 40px}.filters{display:grid;grid-template-columns:minmax(200px,2fr) repeat(3,minmax(130px,1fr));gap:12px;padding:0 0 18px}label{display:grid;gap:6px;font-size:14px}.statusline{display:flex;align-items:center;justify-content:space-between;gap:15px;margin:0 0 20px;flex-wrap:wrap}.statusline p{margin:0}.pagination{display:flex;gap:10px;align-items:center}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(238px,1fr));gap:24px 18px}.asset{background:#fff;border:1px solid #cad3dc;min-width:0}.image-link{display:flex;align-items:center;justify-content:center;aspect-ratio:1.26;background:#132438;overflow:hidden}.image-link img{max-width:100%;max-height:220px;object-fit:contain}.details{padding:14px 15px 16px}.details h2{font-size:17px;line-height:1.3;margin:0 0 7px;overflow-wrap:anywhere}.details p{font-size:13px;margin:5px 0;line-height:1.45;overflow-wrap:anywhere}.links{display:flex;gap:15px;margin-top:12px}.badge{display:inline-block;padding:3px 6px;background:#f2e7d7;color:#755013;border-radius:3px;font-size:12px}.badge.approved{background:#dcefe3;color:#23603a}.source{color:#66798a;font-size:12px}.notice{background:#dde6ed;padding:13px 16px;line-height:1.5;margin:0 0 20px;border-left:4px solid #758ca3;max-width:110ch}.empty{padding:60px 15px;text-align:center;grid-column:1/-1}footer{padding:20px 4vw;border-top:1px solid #c7d2dd;font-size:13px;line-height:1.6}.bottom{margin-top:24px}#count{font-weight:bold}@media(max-width:900px){header{display:block}nav{margin-top:20px}.filters{grid-template-columns:1fr 1fr}}@media(max-width:540px){.filters{grid-template-columns:1fr}.grid{grid-template-columns:1fr}header,main,footer{padding-left:18px;padding-right:18px}.image-link img{max-height:280px}}
</style></head><body>
<header><div><h1>Sidereal art library</h1><p>Reference crops, design revisions and your final sign-off.</p></div><nav aria-label="Library documents"><a href="INDEX.md">Living index</a><a href="WORKFLOW.md">Agent workflow</a><a href="prompts/REDESIGN_CURRENT_EQUIPMENT.md">Equipment prompt</a><a href="SOURCE_AUDIT.md">Source audit</a></nav></header>
<main><div class="filters"><label>Find an asset<input id="search" type="search" placeholder="Wall, medkit, Razor, repair…" autocomplete="off"></label><label>Asset type<select id="category"><option value="">All types</option></select></label><label>Source image<select id="source"><option value="">All sources</option></select></label><label>Review state<select id="state"><option value="">All states</option><option value="unsigned">Not signed off</option><option value="signed">Signed off for this reference</option><option value="evidence">Has iteration evidence</option><option value="blocked">Blocked</option></select></label></div>
<p class="notice" id="summary"></p><div class="statusline"><p id="count" aria-live="polite"></p><div class="pagination"><button id="prev" type="button">Previous</button><span id="page"></span><button id="next" type="button">Next</button></div></div><div id="grid" class="grid"></div><div class="pagination bottom"><button id="top" type="button">Back to filters</button></div></main>
<footer>Replacement models are authored Blender meshes and materials; TypeScript voxel-solid art is being phased out. Exact crops preserve source pixels. A crop is not a reconstructed cutout or an in-game render. Scale and stats are unapproved design proposals. This browser reads the saved ledgers; final approval is recorded only from your explicit feedback against a specific revision and its files.</footer>
<script id="catalog" type="application/json">__DATA__</script><script>
const data=JSON.parse(document.querySelector('#catalog').textContent),byDesign=new Map(data.designs.map(d=>[d.id,d])),refs=data.references;
const q=s=>document.querySelector(s),grid=q('#grid');let page=0;const perPage=36;
const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e};
for(const [id,values] of [['category',[...new Set(refs.map(a=>a.category))].sort()],['source',[...new Set(refs.map(a=>a.source))].sort()]]){for(const v of values){const o=el('option',v);o.value=v;q('#'+id).append(o)}}
const signed=(a,d)=>d.owner_final_signoff&&d.owner_final_signoff.revision===d.current_revision&&d.owner_final_signoff.covered_reference_ids.includes(a.id);
function render(){const term=q('#search').value.toLowerCase().trim(),cat=q('#category').value,src=q('#source').value,state=q('#state').value;
const filtered=refs.filter(a=>{const d=byDesign.get(a.design_id);return (!term||[a.name,a.id,a.design_id,a.style].join(' ').toLowerCase().includes(term))&&(!cat||a.category===cat)&&(!src||a.source===src)&&(!state||(state==='signed'?signed(a,d):state==='unsigned'?!signed(a,d):state==='blocked'?d.state==='blocked':d.revisions.some(r=>r.evidence.length)))});
const pages=Math.max(1,Math.ceil(filtered.length/perPage));page=Math.min(page,pages-1);q('#count').textContent=`${filtered.length.toLocaleString()} reference entries`;q('#page').textContent=`Page ${page+1} of ${pages}`;q('#prev').disabled=page===0;q('#next').disabled=page>=pages-1;grid.replaceChildren();
for(const a of filtered.slice(page*perPage,(page+1)*perPage)){const d=byDesign.get(a.design_id),card=el('article',undefined,'asset'),link=el('a',undefined,'image-link');link.href=a.crop_path;link.title='Open exact source crop';const im=el('img');im.src=a.crop_path;im.alt=a.name;im.loading='lazy';link.append(im);card.append(link);const details=el('div',undefined,'details');details.append(el('h2',a.name),el('p',a.source,'source'));const ok=signed(a,d);details.append(el('span',ok?'Owner signed off':'Not signed off','badge'+(ok?' approved':'')),el('p',`Design r${String(d.current_revision).padStart(3,'0')} · ${d.state}`),el('p',`${a.category} / ${a.kind}`));const links=el('div',undefined,'links');for(const [text,path] of [['Asset brief',a.brief],['Revision history',`designs/${a.design_id}/DESIGN.html`]]){const anchor=el('a',text);anchor.href=path;links.append(anchor)}details.append(links);const revision=d.revisions.at(-1),cutout=revision.evidence.find(e=>e.role==='cutout');if(cutout&&revision.covered_reference_ids.includes(a.id)){const label=el('p','Current reconstructed draft');const preview=el('a');preview.href=cutout.path;const thumb=el('img');thumb.src=cutout.path;thumb.alt='Reconstructed draft: '+a.name;thumb.style='width:100%;height:150px;object-fit:contain;background:#e9eef2';preview.append(thumb);details.append(label,preview)}card.append(details);grid.append(card)}
if(!filtered.length)grid.append(el('p','No matching assets. Change the search or clear a filter.','empty'));
}
q('#summary').textContent=`${data.stats.source_count} images inspected, ${data.stats.reference_count.toLocaleString()} reference crops, ${data.stats.design_count} design queues. ${data.stats.current_cutout_designs} current reconstructed cutouts; ${data.stats.owner_signed_off} current design revisions signed off. Open an asset brief for proposed dimensions, stats and recreation instructions.`;
for(const id of ['search','category','source','state'])q('#'+id).addEventListener(id==='search'?'input':'change',()=>{page=0;render()});q('#prev').onclick=()=>{page--;render()};q('#next').onclick=()=>{page++;render()};q('#top').onclick=()=>{window.scrollTo({top:0,behavior:'instant'});q('#search').focus()};render();
</script></body></html>'''.replace('__DATA__',payload)
    (lib/'index.html').write_text(html)


def render_design_pages(lib,catalog,designs):
    refs={a['id']:a for a in catalog['references']}
    css='body{margin:0;background:#e9eef2;color:#273b50;font:16px/1.6 Trebuchet MS,Arial,sans-serif}main{max-width:1300px;margin:auto;padding:32px}h1{font:32px Georgia,serif;overflow-wrap:anywhere}a{color:#225fa6}section{padding:22px;background:white;margin:24px 0;border:1px solid #cad3dc}.images{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}figure{margin:0;min-width:0}img{width:100%;height:270px;object-fit:contain;background:#d9e2e9}figcaption{font-size:14px;overflow-wrap:anywhere}li{overflow-wrap:anywhere}code{overflow-wrap:anywhere}nav{display:flex;gap:20px;flex-wrap:wrap}.state{padding:10px;background:#f2e7d7}details{margin:12px 0}summary{cursor:pointer}@media(max-width:500px){main{padding:16px}}'
    for d in designs:
        directory=lib/'designs'/d['id']
        approved=d['owner_final_signoff'] and d['owner_final_signoff']['revision']==d['current_revision']
        body=[f'<h1>{escape(d["id"])}</h1><nav><a href="../../index.html">Visual library</a><a href="DESIGN.md">Agent document</a><a href="design.json">Revision ledger</a><a href="../../WORKFLOW.md">Workflow</a></nav>',f'<p class="state">Current revision r{d["current_revision"]:03} · {escape(d["state"])} · Owner final sign-off: {"YES — exact coverage in ledger" if approved else "NO"}</p>',f'<p>{escape(d["mapping_status"])}</p>']
        body.append('<section><h2>Source appearances</h2><div class="images">')
        for key in d['reference_ids'][:12]:
            a=refs[key];body.append(f'<figure><a href="../../{a["crop_path"]}"><img src="../../{a["crop_path"]}" alt="{escape(a["name"],quote=True)}" loading="lazy"></a><figcaption><a href="../../{a["brief"]}">{escape(a["name"])}</a> · Exact source crop</figcaption></figure>')
        body.append('</div><details><summary>All appearances and individual briefs</summary><ul>')
        for key in d['reference_ids']:
            a=refs[key];body.append(f'<li><a href="../../{a["brief"]}">{escape(a["name"])}</a> — {escape(a["source"])}</li>')
        body.append('</ul></details></section>')
        for f in d['feedback']:
            if 'revision' not in f:
                body.append(f'<p><strong>{escape(f.get("source", "Unassigned review note"))}:</strong> {escape(f.get("notes", ""))}</p>')
        for r in reversed(d['revisions']):
            body.append(f'<section><h2>r{r["revision"]:03} · {escape(r["stage"])}</h2><p>{escape(r["change"])}</p><p>{escape(r["hypothesis"] or "No reconstruction yet.")}</p><div class="images">')
            for e in r['evidence']:
                if e['role'] not in ['concept','cutout','runtime-close','runtime-top','comparison']:continue
                path=Path(e['path']).relative_to(directory.relative_to(lib))
                if path.suffix.lower() not in ['.png','.jpg','.jpeg','.webp']:continue
                body.append(f'<figure><a href="{path}"><img src="{path}" alt="{escape(e["role"])}" loading="lazy"></a><figcaption>{escape(e["role"])} — {escape(e.get("notes", ""))}</figcaption></figure>')
            body.append('</div><ul>')
            for e in r['evidence']:
                path=Path(e['path']).relative_to(directory.relative_to(lib));body.append(f'<li><a href="{path}">{escape(e["role"])}</a> · {e["bytes"]:,} bytes · SHA-256 <code>{e["sha256"]}</code></li>')
            body.append('</ul>')
            if r['review']:body.append(f'<p><strong>Agent review: {escape(r["review"]["outcome"])}</strong> — {escape(r["review"]["notes"])}</p>')
            for f in d['feedback']:
                if f.get('revision')==r['revision']:body.append(f'<p><strong>{escape(f["author"])} feedback:</strong> {escape(f["text"])}</p>')
            body.append('</section>')
        title=escape(d['id']);(directory/'DESIGN.html').write_text(f'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>{title} · Sidereal art</title><style>{css}</style><main>'+''.join(body)+'</main></html>')
