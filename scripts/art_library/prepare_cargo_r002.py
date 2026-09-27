"""Revised measured design proposals from r001 physical/visual review."""
from pathlib import Path
import json,math
root=Path(__file__).resolve().parents[2];old=root/'.runtime/art-library/cargo/r001';out=root/'.runtime/art-library/cargo/r002';out.mkdir(exist_ok=True)
if any(out.glob('*/blender-source.blend')):raise ValueError('Preserve existing authored revision; prepare a fresh revision path.')
jobs=json.loads((old/'jobs.json').read_text())
for j in jobs:
 s=j['specification'];family=s['family'];size=s['size'];pod=family in ['refrigerated','vacuum','salvage','fluid'];hand=size in ['small','medium']
 if pod:s['dimensions_m']={'medium':[.68,1.16,.68],'large':[1.16,1.76,1.16],'oversized':[1.76,3.76,1.76]}[size]
 if family=='medical':s['dimensions_m']={'small':[.48,.40,.36],'medium':[.88,.68,.60]}[size]
 if family=='high-value':s['dimensions_m']={'small':[.48,.48,.44],'medium':[.88,.88,.76]}[size]
 w,d,h=s['dimensions_m'];base=.07 if size=='small' else .14 if size=='medium' else .20
 wall=s['wall_assembly_depth_m'];post=.06 if size=='small' else .09 if size=='medium' else .14
 c=min(w,h-base)*.18 if pod else 0;reserve=.16 if family=='refrigerated' else 0
 iw=w-2*wall-2*c-.04 if pod else w-2*post-.03
 ih=h-base-2*wall-.06 if pod else h-base-.150
 il=d-2*wall-.10-reserve if pod else d-2*post-.03
 inner=[round(iw,5),round(il,5),round(ih,5)]
 if family=='fluid':
  radius=min(w/2-.09,(h-base)/2-.04);length=d-.22;inner_r=radius-.008;inner_len=length-.024
  liters=math.floor(math.pi*inner_r**2*inner_len*.90*1000);s['interior_clear_dimensions_m']=None;s['vessel_interior']={'radius_m':inner_r,'length_m':inner_len,'fill_fraction':.90,'axis':'Y','wall_m':.008,'cap_m':.012}
 else:liters=math.floor(math.prod(inner)*1000);s['interior_clear_dimensions_m']=inner
 s['usable_capacity']['value']=liters;s['usable_capacity']['basis']='Conservative unobstructed authored rectangular cargo envelope (clipped pod corners excluded), with modeled refrigeration divider; fluid uses actual cylindrical inner radius and inner cap-to-cap length at 90% fill. Packing inefficiency is additional.'
 s['revision']=2;s['size_basis']='r002 responds to Astra visual/physical review; pod envelopes are explicitly horizontal, medical/security shallow chests; no source measurement asserted.'
 s['handling'].update({'grip_clear_width_m':.18,'grip_clear_depth_m':.05,'grip_bar_diameter_m':.022,'opening':'fill/vent/drain; bolted service end cap, not a cargo door' if family=='fluid' else 'single side-hinged end hatch' if pod else 'rear hinged lid' if hand else 'two front side-hinged doors','minimum_hatch_clear_width_m':math.ceil((w+.40)*20)/20,'minimum_hatch_clear_height_m':math.ceil((h+.20)*20)/20,'opening_clearance_m':0 if family=='fluid' else w+.12 if pod else d+.12 if hand else w/2+.12,'fork_pocket_clearance_m':None if size=='small' else [.20,.085],'stack_count_target':2 if h*2<=2.35 and family!='salvage' else 1,'stack_basis':'2.5 m room: two-high only where measured stack envelope + 0.15 m handling headroom fits. Structural filled-stack rating not established.'})
 s['mounting'].update({'pitch_m':None,'mount_x_m':w-post,'mount_y_m':d-post,'interface':'Four matched 40 mm locating feet / 44 mm clear receivers at authored corner-column centres. Size-specific carrier translates these to a 2 m construction bay; no claim of direct 0.5 m socket pitch.','foot_width_m':.04,'receiver_clear_width_m':.044,'foot_insertion_m':.016,'stack_pitch_m':h-.016})
 s['unresolved']=['All dimensions, mass, payload and operating targets are unapproved proposals.','Mass is allocated from shell/frame/hardware targets, not structural simulation; pressure/refrigeration/security authority remains unimplemented.','Back/underside inferred; only named reference silhouette is covered, other color candidates pending.','Open poses demonstrate source assembly and clearance; no runtime opening interaction/animation controller.','Carrier is a dimensioned review fixture; production rack, latch/collision/damage adapters and fleet LOD work remain pending.','Filled stacking, tow loads, pressure seals and powered thermal behavior need engineering/gameplay validation.']
 j['output']=str(out/j['slug']);Path(j['output']).mkdir(exist_ok=True);(Path(j['output'])/'specification.json').write_text(json.dumps(s,indent=2)+'\n')
(out/'jobs.json').write_text(json.dumps(jobs,indent=2)+'\n')
print('Prepared 19 r002 specifications; no ledger signoff')
