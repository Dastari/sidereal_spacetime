"""Present unretouched Blender renders on labeled review sheets for browser capture."""
from pathlib import Path
import argparse
import json

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--revision', type=int, default=2)
a = p.parse_args()
root = Path(__file__).resolve().parents[2]
out = root/'assets/art-library/hull-voxel-study'/f'review-r{a.revision:03}'
specimens = json.loads((out/'specimens.json').read_text())
style_names = {'mapped':'Mapped solid', 'stepped':'Stepped + mapped', 'voxel':'Voxel derivative'}
style_notes = {'mapped':'Flat solid · normal-mapped finish', 'stepped':'Stepped borders · fine mapped finish', 'voxel':'Sampled shoulders · finish on the cell grid'}
css = '''*{box-sizing:border-box}body{margin:0;padding:38px;background:#0b131d;color:#edf3fa;font:16px system-ui,sans-serif}h1{font-size:33px;letter-spacing:-1px;margin:0 0 9px}p{color:#9fb1c5;margin:0 0 22px;line-height:1.5}.eyebrow{color:#67d6e7;font-size:12px;letter-spacing:2px;font-weight:700;margin-bottom:10px}.grid{display:grid;gap:14px}.three{grid-template-columns:repeat(3,1fr)}.five{grid-template-columns:repeat(5,1fr)}.card{background:#152130;border:1px solid #2a3b50;border-radius:8px;overflow:hidden}.card h2{font-size:19px;padding:17px 19px 3px;margin:0}.card p{font-size:12px;padding:0 19px;margin:0;color:#aebed0}.card img{display:block;width:100%;height:auto}.badge{font-size:12px;color:#75dce5;padding:4px 19px 14px}.rowtitle{display:flex;align-items:center;gap:15px;margin:22px 0 10px;font-size:17px}.rowtitle small{font-weight:400;font-size:12px;color:#9fb1c5}footer{border-top:1px solid #304052;margin-top:24px;padding-top:14px;color:#b2bfd0;font-size:13px;line-height:1.6}.five h2{font-size:22px}.five .card p{height:38px}.five .badge{font-size:11px}.legend{display:flex;gap:24px;margin:20px 0;padding:18px;border:1px solid #2a3b50;background:#152130}.legend strong{color:#75dce5}.hero .card img{width:100%}'''

def write(name,title,subtitle,body,footer):
 html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+title+'</title><style>'+css+'</style></head><body><div class="eyebrow">SIDEREAL / HULL MATERIAL & DAMAGE STUDY / R002</div><h1>'+title+'</h1><p>'+subtitle+'</p>'+body+'<footer>'+footer+'</footer></body></html>'
 (out/name).write_text(html)

def card(s, title=None, note=None):
 title = title or style_names[s['style']]
 note = note or style_notes[s['style']]
 return f'<article class="card"><h2>{title}</h2><p>{note}</p><img src="renders/{s["slug"]}.png"><div class="badge">{s["triangles"]:,} triangles · {s["removed_cells"]:,} removed cells</div></article>'

body=''
for state,label,note in [('intact','Intact','Same 2 m span and 3 m height'),('breach','Through-breach','One shared cell mask; visible solid edges inside the hole'),('explosive','Large blast aftermath','Larger shared mask; no smooth painted hole')]:
 body+=f'<h2 class="rowtitle">{label}<small>{note}</small></h2><div class="grid three">'
 for style in style_names:
  body+=card(next(s for s in specimens if s['style']==style and s['height_m']==3 and s['state']==state))
 body+='</div>'
write('comparison.html','Three ways to build the surface','Actual Blender renders of exported GLBs · 62.5 mm shared geometry/damage cells · fixed material scale',body,'Mapped details are cosmetic; cut surfaces are real geometry. The voxel derivative also samples its finish at 62.5 mm. These are offline visual studies, not live damage integration or approved production assets.')

body='<div class="grid five">'
for height in (.75,1.5,1.8125,2.25,3):
 s=next(s for s in specimens if s['style']=='stepped' and s['height_m']==height and s['state']=='intact')
 body+=card(s,f'{height:g} m',f'{round(height/.0625)} cells high · 2 m wide')
body+='</div><div class="legend"><span><strong>125 mm</strong> fixed end caps</span><span><strong>250 mm</strong> repeated middle courses</span><span><strong>62.5 mm</strong> exact residual fill</span><span><strong>1:1</strong> detail scale</span></div>'
write('heights.html','Change height without stretching the panel','Same camera and baseline · fixed thickness and mounting origin · 1.8125 m demonstrates an intermediate height',body,'Height is generated from whole courses and an exact filler, then capped. Texture and damage-cell sizes stay fixed. A 1/32 m height between these cells requires an explicitly finer common grid; it is never silently rounded. The 250 mm core and 500 mm maximum decorated depth are study dimensions, not a new production hull specification.')

intact=next(s for s in specimens if s['style']=='stepped' and s['height_m']==3 and s['state']=='intact')
after=next(s for s in specimens if s['style']=='stepped' and s['height_m']==3 and s['state']=='explosive')
body='<div class="grid three hero">'+card(intact,'Before','Fixed intact panel')+'<article class="card"><h2>Staged explosion</h2><p>Block-shaped flash and removed-cell fragments</p><img src="renders/stepped-blast-debris.png"><div class="badge">64 actual removed cells shown as debris</div></article>'+card(after,'After','The remaining solid, with effects removed')+'</div>'
write('blast.html','The breach stays when the flash is gone','Actual geometry · debris is drawn from the removed material cells · staged visual effect',body,'The bright burst is a staged cosmetic effect, not a physics or weapons simulation. Solid fragments retain their original 62.5 mm size; their source cells are recorded. Collision, pressure, damage authority and network replication are not demonstrated by these renders.')
print(out)
