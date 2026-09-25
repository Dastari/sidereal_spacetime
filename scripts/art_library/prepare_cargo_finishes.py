"""Explicit appearances reuse existing canonical geometry; no crop changes."""
from pathlib import Path
import json,hashlib
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'.runtime/art-library/cargo/r002';jobs={j['design_id']:j for j in json.loads((BASE/'jobs.json').read_text())};out=BASE/'finishes';out.mkdir(exist_ok=True)
if any(out.glob('*/blender-source.blend')):raise ValueError('Preserve existing authored revision; prepare a fresh revision path.')
rows=[]
plans=[('standard.oversized','standard-cargo-crate',[(1,'pale'),(2,'amber'),(3,'blue'),(4,'red')]),('reinforced.large','reinforced-cargo-crate',[(3,'blue'),(4,'red')]),('refrigerated.medium','refrigerated-pod',[(2,'green'),(3,'pale'),(4,'red')]),('vacuum.medium','vacuum-pod',[(2,'pale'),(3,'dark'),(4,'amber')]),('salvage.large','salvage-pod',[(2,'red'),(3,'pale'),(4,'amber')]),('medical.small','medical-supply-container',[(2,'red'),(3,'green'),(4,'blue')]),('high-value.small','high-value-tech-crate',[(2,'amber'),(3,'red'),(4,'blue')]),('fluid.medium','liquid-tank',[(2,'covered'),(3,'amber'),(4,'glass-gauge')])]
for design,prefix,variants in plans:
 for n,finish in variants:
  j=jobs['cargo.'+design];slug=design.replace('.','-')+'-'+finish;refs=['cargo-pods-ore-etc--'+prefix+'-variant-'+str(n)]
  if design=='medical.small' and finish=='red':refs.append('modular-spaceship-design-2--medical-supply-case')
  row={'slug':slug,'design_id':j['design_id'],'base':j['output'],'output':str(out/slug),'finish':finish,'reference_ids':refs,'asset_id':'part-'+hashlib.sha256(('cargo-finish:'+slug).encode()).hexdigest()[:20],'specification':{**j['specification'],'finish':finish,'reference_ids':refs,'appearance_scope':'Explicit alternative finish/accessory treatment on shared canonical geometry. Source thumbnail scale is not physical scale.'}};Path(row['output']).mkdir(exist_ok=True);(Path(row['output'])/'specification.json').write_text(json.dumps(row['specification'],indent=2));rows.append(row)
for design,finish,ref in [('standard.small','red','storage-red-loose-crate'),('standard.medium','blue','storage-blue-loose-crate')]:
 j=jobs['cargo.'+design];slug=design.replace('.','-')+'-'+finish;refs=['modular-spaceship-design-2--'+ref];r={'slug':slug,'design_id':j['design_id'],'base':j['output'],'output':str(out/slug),'finish':finish,'reference_ids':refs,'asset_id':'part-'+hashlib.sha256(('cargo-finish:'+slug).encode()).hexdigest()[:20],'specification':{**j['specification'],'finish':finish,'reference_ids':refs}};Path(r['output']).mkdir(exist_ok=True);(Path(r['output'])/'specification.json').write_text(json.dumps(r['specification'],indent=2));rows.append(r)
(out/'jobs.json').write_text(json.dumps(rows,indent=2));print('Prepared',len(rows),'finish/accessory appearances')
