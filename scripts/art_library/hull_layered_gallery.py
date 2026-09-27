"""Review boards from original Blender renders and exact pressure traces."""
from pathlib import Path
import argparse
import json
import shutil

p=argparse.ArgumentParser();p.add_argument('--revision',type=int,default=3);a=p.parse_args()
root=Path(__file__).resolve().parents[2]
out=root/'assets/art-library/hull-voxel-study'/f'review-r{a.revision:03}'
specs=json.loads((out/'specimens.json').read_text())
traces=json.loads((out/'pressure-traces.json').read_text())['records']
css='''*{box-sizing:border-box}body{margin:0;padding:34px;background:#0b141e;color:#e9f1f8;font:15px system-ui}h1{font-size:32px;letter-spacing:-.8px;margin:9px 0}h2{font-size:19px;margin:0 0 6px}p{color:#aebed0;line-height:1.6;margin:0 0 18px}.eyebrow{color:#71dbe4;font-size:12px;letter-spacing:2px;font-weight:700}.grid{display:grid;gap:14px}.three{grid-template-columns:repeat(3,1fr)}.four{grid-template-columns:repeat(4,1fr)}.five{grid-template-columns:repeat(5,1fr)}.card{background:#152331;border:1px solid #2c4053;border-radius:7px;overflow:hidden}.head{padding:16px 16px 0}.head p{font-size:12px;margin-bottom:0}.card img{width:100%;display:block}.stat{padding:8px 16px 16px;font-size:12px;color:#7adbe2}.row{margin:25px 0 13px}.anatomy{display:grid;grid-template-columns:1fr 1fr;gap:26px;align-items:center;margin-top:25px}.anatomy img{max-height:640px;width:100%;object-fit:contain}.layers div{border-left:3px solid #74d9dd;padding:10px 15px;margin:16px 0;background:#152331}.layers strong{display:block;margin-bottom:4px}footer{margin-top:24px;border-top:1px solid #334759;padding-top:14px;color:#acbbcd;font-size:13px;line-height:1.6}table{width:100%;border-collapse:collapse;margin-top:18px}td,th{text-align:left;padding:12px;border-bottom:1px solid #334759}th{color:#78dce2}input{width:100%;accent-color:#75dce3}.pressure{padding:20px;background:#152331;margin-top:20px}.pressure svg{width:100%;height:170px}.strip{padding:16px;margin-top:20px;background:#152331;color:#7adbe2}a{color:#80dae9}'''

def write(name,title,note,body,foot):
    (out/(name+'.html')).write_text('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+title+'</title><style>'+css+'</style></head><body><div class="eyebrow">SIDEREAL / LAYERED PANEL STUDY / R003</div><h1>'+title+'</h1><p>'+note+'</p>'+body+'<footer>'+foot+'</footer></body></html>')

def get(f='explorer',s='intact',w=2,h=3,interior=False):
    return next(x for x in specs if x['finish']==f and x['state']==s and x['width_m']==w and x['height_m']==h and x['interior']==interior)

def card(x,title,note):
    t=next(t for t in traces if t['proxyId']==x['slug'])
    state='Through path' if t['analysis']['state']=='breached' else 'Back skin remains sealed'
    return f'<article class="card"><div class="head"><h2>{title}</h2><p>{note}</p></div><img src="renders/{x["slug"]}.png"><div class="stat">{state} · {x["removed_cells"]:,} cells removed</div></article>'

names={'explorer':('Explorer','Pale enamel · red service covers'),'raider':('Salvaged','Dark patchwork · repair straps'),'industrial':('Mining','Orange cladding · hazard bands')}
body=''
for state,title in [('intact','Interchangeable finishes'),('through','The same penetration across every finish')]:
    body+=f'<h2 class="row">{title}</h2><div class="grid three">'+''.join(card(get(f,state),*v) for f,v in names.items())+'</div>'
write('finishes','Three ship references, one panel interface','Freshly authored PBR finishes · identical layer geometry, dimensions and mounting sockets',body,'Inspired by Orion Crest, Riftjack salvaged armor and Helix mining cladding. Source pixels and logos are not used as textures. 2 m wide × 3 m high × 250 mm deep; 31.25 mm physical damage cells. This is an unapproved native study, not a live installation.')

states=[('intact','Intact','Outer armor + cavity + back skin'),('crater','Shallow crater','62.5 mm maximum cut depth'),('armor_open','Armor opened','Cavity exposed; back skin preserved'),('through','Full penetration','Wide crater with a narrower through-hole')]
body='<div class="grid four">'+''.join(card(get(s=s),title,note) for s,title,note in states)+'</div>'
body+='''<div class="anatomy"><img src="renders/layer-anatomy.png"><div class="layers"><h2>Solid where needed, hollow between ribs</h2><p>Exploded view of the same authored stack. Parts are separated here only to reveal the construction.</p><div><strong>31.25 mm inner skin</strong>Continuous back barrier in this review assembly.</div><div><strong>93.75 mm rib / cavity zone</strong>Fixed-pitch ribs and closed perimeter; empty space is real.</div><div><strong>125 mm outer armor</strong>Depth supports shallow craters before the cavity is exposed.</div></div></div>'''
write('damage','A crater does not have to become a leak','Actual depth-dependent material removal · exterior impact enters from +X',body,'Damage follows the same 1/32 m lattice as the physical panel. Pressure connectivity is checked through empty cells, including paths that turn inside a cavity. Existing structural walls remain separate from this proposed hull assembly. Dents, bending and displaced material are not implemented by these subtraction examples.')

body='<h2 class="row">Fixed width; variable height</h2><div class="grid five">'
for h in (.75,1.5,1.84375,2.25,3):body+=card(get(h=h),f'{h:g} m','2 m width · fixed material scale')
body+='</div><h2 class="row">Fixed height; modular widths</h2><div class="grid three">'
for w in (.5,1,2):body+=card(get(w=w),f'{w:g} m width','3 m height · same depth and sockets')
body+='</div><div class="strip">HULL_ATTACH (0,0,0) · HULL_EDGE_START / END (0, ±width/2, 0) · HULL_TOP (0,0,height)</div>'
write('modules','Change dimensions without stretching the material','Same camera scale and baseline · exact 1/32 m dimensions · outward depth remains 250 mm',body,'Fixed cap zones terminate the repeating material. Width/height changes extend or trim the skins and add ribs at fixed pitch. The 1.84375 m specimen proves an odd 1/32 m height. Odd-width sockets use exact half-span offsets; any placement must align the explicit cell origin as well as the attachment points. Native corner, diagonal, opening and deck-joint qualification remains separate.')

body='<div class="grid four">'+''.join(card(get(s=s,interior=True),title,note) for s,title,note in [('intact','Intact','Two skins and a ribbed cavity'),('crater','Front skin damaged','Room B stays isolated'),('armor_open','Cavity exposed','Back skin still isolates Room B'),('through','Both skins breached','Room A and B exchange gas')])+'</div>'
samples=next(t for t in traces if t['proxyId']=='interior-w064-h096-through')['samples']
body+='''<div class="pressure"><h2>Interior breach: room-to-room flow</h2><p>Two equal 10 m³ rooms; A starts with 100 mol, B starts empty. Exact exported wall proxy; illustrative flow rate.</p><svg viewBox="0 0 1000 170" aria-label="Room pressure over ten seconds"><path d="M35 10V140H980" fill="none" stroke="#566a80"/>'''
for index,color in [(0,'#73dce5'),(1,'#ffb765')]:
    points=' '.join(f'{35+s["second"]*94},{140-s["rooms"][index]["pressurePa"]/25000*125}' for s in samples)
    body+=f'<polyline points="{points}" fill="none" stroke="{color}" stroke-width="3"/>'
body+='''<text x="40" y="165" fill="#afc2d6">0 s</text><text x="940" y="165" fill="#afc2d6">10 s</text></svg><label>Time <output id="time">10 s</output><input id="time-slider" type="range" min="0" max="10" value="10"></label><div id="reading"></div></div>'''
body+='<script>const samples='+json.dumps(samples)+';const slider=document.querySelector("input");function show(){const s=samples[+slider.value];document.querySelector("#time").textContent=s.second+" s";document.querySelector("#reading").textContent="Room A: "+(s.rooms[0].pressurePa/1000).toFixed(2)+" kPa · Room B: "+(s.rooms[1].pressurePa/1000).toFixed(2)+" kPa · Lost to space: "+s.ventedMoles.toFixed(3)+" mol"}slider.addEventListener("input",show);show();</script>'
write('interior','Interior damage must respect the pressure barrier','250 mm internal partition · two 31.25 mm skins around a 187.5 mm rib/cavity zone',body,'The existing gas solver conserves gas during room-to-room flow. Shallow damage leaves the rooms isolated. Native damage proxy analysis and world atmosphere helper tests pass; a live hit reducer, wall-to-compartment binding, persistence of damage and game rendering are still required. No claim of live combat or qualified flow rates.')

(out/'runtime.html').write_text('<!doctype html><meta charset="utf-8"><title>Layered native review</title><style>body{margin:0;background:#0c151f;color:#dbe7f4;font:14px system-ui}h1{height:40px;font-size:17px;padding:8px 14px;margin:0}canvas{display:block;width:100vw;height:calc(100vh - 40px)}</style><h1>Layered panel native review</h1><canvas></canvas><script type="module" src="runtime.mjs"></script>')
shutil.copyfile(root/'scripts/art_library/hull_layered_runtime.mjs',out/'runtime.mjs')
print(out)
