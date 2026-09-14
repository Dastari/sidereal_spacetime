"""Resolve cargo size targets without changing any original crop or live content."""
from pathlib import Path
import sys,json,math,argparse
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts'))
import art_catalog as ac
OUT=ROOT/'.runtime/art-library/cargo/r001';OUT.mkdir(parents=True,exist_ok=True)
if any(OUT.glob('*/blender-source.blend')):raise ValueError('Preserve existing authored revision; prepare a fresh revision path.')
SIZES={'small':(.48,.40,.48,.018,8,32),'medium':(.88,.68,.92,.026,28,220),'large':(1.76,1.16,1.72,.04,105,1200),'oversized':(1.76,3.76,1.92,.05,280,4000)}
FAMILIES={'standard':['small','medium','large','oversized'],'reinforced':['medium','large','oversized'],'refrigerated':['medium','large'],'vacuum':['medium','large'],'salvage':['large','oversized'],'medical':['small','medium'],'high-value':['small','medium'],'fluid':['medium','large']}
SOURCE={'reinforced':('pale-studless.crate.reinforced','reinforced-cargo-crate'),'refrigerated':('pale-studless.crate.refrigerated','refrigerated-pod'),'vacuum':('pale-studless.crate.vacuum','vacuum-pod'),'salvage':('pale-studless.crate.salvage','salvage-pod'),'medical':('pale-studless.crate.medical','medical-supply-container'),'high-value':('pale-studless.crate.tech','high-value-tech-crate'),'fluid':('pale-studless.tank.liquid','liquid-tank')}
def stat(value,unit,basis):return {'value':value,'unit':unit,'status':'proposed','basis':basis}
def main():
 jobs=[];refresh=ac.refresh;ac.refresh=lambda:None
 with ac.locked():
  for family,sizes in FAMILIES.items():
   for k,size in enumerate(sizes):
    slug=family+'-'+size;design='cargo.'+family+'.'+size
    if family=='standard':
     old='pale-studless.crate.cargo' if size=='oversized' else 'pale-studless.crate.standard'
     refs=['cargo-pods-ore-etc--standard-cargo-crate'] if size=='oversized' else ['modular-spaceship-design-2--storage-'+size+'-crate']
    else:
     old,prefix=SOURCE[family];refs=['cargo-pods-ore-etc--'+prefix+('' if k==len(sizes)-1 else '-variant-'+str(k+1))]
    if ac.design_path(design).exists():raise ValueError('Preserve existing revision: '+design)
    ac.split_design(argparse.Namespace(design=old,new_design=design,references=refs,reason=f'Explicit {size} {family} geometry; source has no measured scale. Other appearances remain color/context candidates, not silently covered.'))
    ac.mutate(argparse.Namespace(command='start',design=design,covers=refs,agent='cargo-authoring',change=f'Native Blender {size} {family} cargo design, dimensioned hollow shell and size-specific handling hardware.',hypothesis='Shared pale corner armor and indigo recessed structure unify the family; fixed glove grips and discrete hinge/mount sizes preserve crew-scale usability across different envelopes.'))
    w,d,h,t,mass,payload=SIZES[size];extra={'reinforced':.02,'refrigerated':.065,'vacuum':.025,'salvage':.01,'medical':.035,'high-value':.04,'fluid':0}.get(family,0);wall=t+extra
    base=.065 if size=='small' else .14 if size=='medium' else .20
    inner=[round(w-2*wall-.08,3),round(d-2*wall-.08,3),round(h-base-wall-.06,3)]
    if family=='refrigerated':inner[1]=round(inner[1]-.12,3)
    capacity=round(math.prod(inner)*1000)
    if family=='fluid':
     radius=min(w,d)/2-.085;length=h-base-.16
     capacity=round(math.pi*(radius-.008)**2*length*.90*1000)
    mass=round(mass*{'reinforced':1.65,'refrigerated':1.7,'vacuum':1.5,'salvage':1.25,'medical':1.3,'high-value':1.8,'fluid':1.45}.get(family,1))
    payload=round(payload*{'reinforced':1.3,'medical':.65,'high-value':.65}.get(family,1))
    ops={'standard':{'environment':'dry interior; splash-resistant; no pressure claim'},'reinforced':{'environment':'dry interior; extra sacrificial armor; no armor/health authority implemented'},'refrigerated':{'temperature_target_C':[2,8],'power_continuous_W':70 if size=='medium' else 220,'power_peak_W':150 if size=='medium' else 500,'environment':'powered indoor cold storage; no holdover claim'},'vacuum':{'differential_pressure_target_kPa':100,'environment':'sealed freight target; flat pressure panels require engineering review, no certification'},'salvage':{'tow_limit_N':20000 if size=='large' else 60000,'environment':'recover loose debris; no containment of hot/reactive debris assumed'},'medical':{'temperature_C':[15,25],'environment':'clean dry supplies; no sterile or pharmaceutical cold-chain claim'},'high-value':{'idle_power_W':2,'environment':'dry interior; tamper module and lock are visual proposals, no security grant'},'fluid':{'fill_fraction':.9,'pressure_target_kPa_gauge':0,'environment':'vented water-like liquid only; not fuel, cryogenic, corrosive or compressed gas'}}[family]
    spec={'schema':'sidereal.cargo-design-proposal.v1','design_id':design,'revision':1,'family':family,'size':size,'reference_ids':refs,'related_reference_source':'cargo-pods-ore-etc.png and modular-spaceship-design-2.png','dimensions_m':[w,d,h],'axes':'Blender X width/Y depth/Z up; origin bottom centre; door faces -Y; GLB Y up / -Z forward','wall_assembly_depth_m':wall,'skin_thickness_m':.002 if size in ['small','medium'] else .003,'interior_clear_dimensions_m':inner,'usable_capacity':stat(capacity,'L','Clear rectangular envelope excluding wall/corner/hinge/base; refrigerator removes service bay; fluid uses cylindrical interior at 90% fill. Packing inefficiency is additional.'),'empty_mass':stat(mass,'kg','Initial sandwich shell/frame/hardware allocation; not density-integrated or tested.'),'payload_limit':stat(payload,'kg','Gameplay handling target; not a certified structural rating.'),'max_gross_mass':stat(mass+payload,'kg','Empty mass plus independently limited contents.'),'operating':{'status':'proposed','basis':'Functional design targets; simulation/thermal/pressure/load testing outstanding','values':ops},'handling':{'grip_clear_width_m':.18,'grip_clear_depth_m':.045,'grip_bar_diameter_m':.022,'mode':'hand case at modest gross mass; powered cart at payload limit' if size=='small' else 'cart/forks; do not infer safe crew lifting from handle presence','fork_pocket_clearance_m':None if size=='small' else [.20,.08],'minimum_hatch_clear_width_m':.60 if size=='small' else .98 if size=='medium' else 1.90,'minimum_hatch_clear_height_m':h+.18,'aisle_m':.8 if size=='small' else 1.1 if size=='medium' else 2.1,'opening':'rear hinged lid' if size in ['small','medium'] else 'two front side-hinged doors','opening_clearance_m':d if size in ['small','medium'] else w/2,'stack_count_target':3 if size=='small' else 2 if size in ['medium','large'] else 1,'stack_basis':'floor rack height 2.5m and corner-load path; filled-stack rating unvalidated; large two-high only in freight hold >3.7m'},'mounting':{'bay_m':[2,4] if size=='oversized' else [2,2],'pitch_m':.5,'interface':'underside named lock sockets; separate 2 m bay carrier needed for sub-bay cases; no live snap adapter','mount_x_m':.3 if size=='small' else .5 if size=='medium' else 1.5,'mount_y_m':.25 if size=='small' else .5 if size=='medium' else 3.5 if size=='oversized' else 1.0},'unresolved':['All scale and stats require owner design approval.','Unseen rear/underside inferred; not observed reference geometry.','Lid/door pivots authored; no gameplay open animation or interaction implemented.','No live inventory, damage, pressure, refrigeration or locks implemented by this art.','LOD optimization and fleet performance remain unmeasured.','Reference color alternatives not yet reconstructed; see coverage ledger.','Actual loaded handling, rack adapter and crew glove collision need dedicated acceptance.'],'publication':False}
    out=OUT/slug;out.mkdir();(out/'specification.json').write_text(json.dumps(spec,indent=2)+'\n')
    jobs.append({'slug':slug,'design_id':design,'output':str(out),'specification':spec,'asset_id':'part-'+ac.digest(out/'specification.json')[:20]})
  ac.refresh=refresh;ac.refresh()
 (OUT/'jobs.json').write_text(json.dumps(jobs,indent=2)+'\n')
 print('Prepared',len(jobs),'unsigned cargo designs')
if __name__=='__main__':main()
