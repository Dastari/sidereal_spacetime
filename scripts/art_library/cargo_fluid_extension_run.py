"""Managed, append-only Blender authoring for five unsigned fluid review designs."""
from pathlib import Path
import argparse, hashlib, json, subprocess, sys, tomllib

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '.runtime/art-library/cargo/fluid-extension/r001'
FAMILIES = {
    'cryo': ('cryo-tank', [.68, .68, 1.36], 58, 150, 'Cryogenic-vessel visual proposal; insulation and relief hardware; temperature, pressure and holdover ratings unapproved.'),
    'fuel': ('fuel-barrel', [.56, .56, .88], 20, 110, 'Liquid-fuel container proposal; bonding lug and protected bungs. Fluid compatibility and vent/flammability behavior unimplemented.'),
    'chemical': ('chemical-drum', [.56, .56, .88], 24, 150, 'Chemical-liquid container proposal; material compatibility must be assigned per substance. No universal corrosion resistance claim.'),
    'gas': ('gas-bundle', [.88, .68, .92], 76, 90, 'Six-cylinder compressed-gas bundle proposal. Capacity is internal water volume, not gas volume at atmospheric pressure; no pressure rating approved.'),
    'water': ('water-container', [.88, .68, .92], 35, 300, 'Vented water tank proposal; cleaning and potable-water suitability unvalidated. No pressure-vessel claim.'),
}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--build-only', action='store_true', help='Build existing manifest without catalog edits')
    parser.add_argument('--variants', action='store_true', help='Render four preserved source finish variants per completed base')
    parser.add_argument('--repair-review', action='store_true', help='Preserve and rebuild gas rail joints and dark-fuel marking after independent review')
    parser.add_argument('--repair-support', action='store_true', help='Preserve and rebuild three vessel support/closure corrections after physical review')
    parser.add_argument('--repair-clearance', action='store_true', help='Preserve and rebuild shallow accessory wall clearance cleanup')
    parser.add_argument('--support-audit', action='store_true', help='Measure final source closure/support/cavity clearances')
    args = parser.parse_args()
    config = tomllib.loads((ROOT / 'dev.toml').read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = OUT / 'jobs.json'
    if args.support_audit:
        subprocess.run([config['art']['blender'],'--background','--threads','4','--python-exit-code','1','--python',str(Path(__file__).with_name('cargo_fluid_extension_support_audit.py')),'--',str(OUT)],cwd=ROOT,check=True)
        return
    if args.repair_support or args.repair_clearance:
        import shutil
        archive=OUT/('attempts/005-shallow-accessory-clearance' if args.repair_clearance else 'attempts/004-independent-support-and-closure-review')
        if archive.exists():raise ValueError('Preserve existing repair archive')
        archive.mkdir(parents=True)
        for name in ['jobs.json','variant-jobs.json']:shutil.copyfile(OUT/name,archive/name)
        for family in ['fuel','chemical','water']:
            shutil.move(str(OUT/family),str(archive/family));(OUT/family).mkdir()
        (archive/'review.md').write_text('Independent physical review: seat water cap; lower water support pads out of interior; connect lowest drum support rim to vessel and set bottom to Z=0; move fuel staves/clamps outside cavity. Additional author check moved intermediate ring inner radii outside the inner vessel surface. All old primaries and their four finishes are retained here. No owner approval.\n')
        if args.repair_clearance:(archive/'review.md').write_text('Preserved completed support-repair generation before shallow-accessory cleanup: drum marking backplates/batch labels and chemical head retainers are moved outside the cavity; water gauge backing and vertical bands are seated in the wall instead of protruding through its inner plane. Capacity and functional proposals unchanged.\n')
        full=json.loads(manifest.read_text());subset=[j for j in full if j['slug'] in ['fuel','chemical','water']]
        repair=OUT/'repair-support-primary-jobs.json';repair.write_text(json.dumps(subset,indent=2)+'\n')
        subprocess.run([config['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(Path(__file__).with_name('cargo_fluid_extension_build.py')),'--',str(repair)],cwd=ROOT,check=True)
        updated={j['slug']:j for j in json.loads(repair.read_text())};full=[updated.get(j['slug'],j) for j in full];manifest.write_text(json.dumps(full,indent=2)+'\n')
        full=json.loads((OUT/'variant-jobs.json').read_text());subset=[j for j in full if j['family'] in ['fuel','chemical','water']]
        for j in subset:Path(j['output']).mkdir(parents=True,exist_ok=True)
        repair=OUT/'repair-support-variant-jobs.json';repair.write_text(json.dumps(subset,indent=2)+'\n')
        subprocess.run([config['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(Path(__file__).with_name('cargo_fluid_extension_variants.py')),'--',str(repair)],cwd=ROOT,check=True)
        updated={j['id']:j for j in json.loads(repair.read_text())};full=[updated.get(j['id'],j) for j in full];(OUT/'variant-jobs.json').write_text(json.dumps(full,indent=2)+'\n')
        return
    if args.repair_review:
        import shutil
        archive=OUT/'attempts/003-independent-gas-joint-and-fuel-marking-review'
        if archive.exists():raise ValueError('Preserve existing repair archive')
        archive.mkdir(parents=True)
        shutil.copyfile(OUT/'variant-jobs.json',archive/'variant-jobs.json')
        shutil.copyfile(OUT/'jobs.json',archive/'jobs.json')
        shutil.move(str(OUT/'gas'),str(archive/'gas'));(OUT/'gas').mkdir()
        shutil.move(str(OUT/'fuel/variants/variant-4'),str(archive/'fuel-variant-4'));(OUT/'fuel/variants/variant-4').mkdir()
        for source in Path(__file__).parent.glob('cargo_fluid_extension*.py'):shutil.copyfile(source,archive/source.name)
        (archive/'review.md').write_text('Independent review passed cryo/fuel/chemical/water. Gas requires removal of black triangular coplanar wedges at retention-rail joints. Old complete gas + four finishes retained here. Old dark-fuel finish retained before relocating its warning to the clear span between added ribs. No owner approval. The archived scripts record the repair recipe; original recipes remain in each artifact recipe.zip.\n')
        gas=[j for j in json.loads(manifest.read_text()) if j['slug']=='gas']
        repair=OUT/'repair-primary-jobs.json';repair.write_text(json.dumps(gas,indent=2)+'\n')
        subprocess.run([config['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(Path(__file__).with_name('cargo_fluid_extension_build.py')),'--',str(repair)],cwd=ROOT,check=True)
        full=json.loads((OUT/'variant-jobs.json').read_text())
        subset=[j for j in full if j['family']=='gas' or (j['family']=='fuel' and j['number']==4)]
        for j in subset:Path(j['output']).mkdir(parents=True,exist_ok=True)
        repair=OUT/'repair-variant-jobs.json';repair.write_text(json.dumps(subset,indent=2)+'\n')
        subprocess.run([config['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(Path(__file__).with_name('cargo_fluid_extension_variants.py')),'--',str(repair)],cwd=ROOT,check=True)
        updated={j['id']:j for j in json.loads(repair.read_text())};full=[updated.get(j['id'],j) for j in full]
        (OUT/'variant-jobs.json').write_text(json.dumps(full,indent=2)+'\n')
        return
    if args.variants:
        if not manifest.exists():raise ValueError('Primary jobs required')
        jobs=json.loads(manifest.read_text()); variants=[]
        for job in jobs:
            for number in range(1,5):
                output=Path(job['output'])/'variants'/f'variant-{number}'
                if (output/'blender-source.blend').exists():raise ValueError('Preserve variant source: '+str(output))
                output.mkdir(parents=True,exist_ok=True)
                variants.append({'id':job['design_id']+f'.appearance-{number}', 'design_id':job['design_id'], 'family':job['slug'], 'number':number, 'base':job['output'], 'output':str(output), 'reference_ids':[job['specification']['reference_ids'][0]+f'-variant-{number}'], 'asset_id':job['asset_id']+f'-v{number}', 'publication':False})
        path=OUT/'variant-jobs.json';path.write_text(json.dumps(variants,indent=2)+'\n')
        subprocess.run([config['art']['blender'],'--background','--threads','8','--python-exit-code','1','--python',str(Path(__file__).with_name('cargo_fluid_extension_variants.py')),'--',str(path)],cwd=ROOT,check=True)
        return
    if not manifest.exists():
        jobs = []
        for family, (source, dims, mass, payload, operating) in FAMILIES.items():
            design = f'cargo.fluid-{family}.medium'
            output = OUT / family
            output.mkdir(exist_ok=True)
            spec = {
                'schema': 'sidereal.cargo-design-proposal.v1', 'design_id': design,
                'revision': 1, 'family': f'fluid-{family}', 'size': 'medium',
                'reference_ids': [f'cargo-pods-ore-etc--{source}'],
                'dimensions_m': dims,
                'size_basis': 'Proposed medium gameplay envelope; source miniature drawing scale does not imply physical size.',
                'axes': 'Blender X width/Y depth/Z up; bottom-centre origin. GLB Y up/-Z forward.',
                'empty_mass': {'value': mass, 'unit': 'kg', 'status': 'proposed', 'basis': 'Preliminary vessel/frame/hardware allocation, not density-integrated.'},
                'payload_limit': {'value': payload, 'unit': 'kg', 'status': 'proposed', 'basis': 'Separate handling target; capacity does not authorize arbitrary contents mass.'},
                'max_gross_mass': {'value': mass + payload, 'unit': 'kg', 'status': 'proposed'},
                'operating': {'status': 'proposed', 'basis': operating, 'values': {}},
                'handling': {'mode': 'Powered cart or purpose-built restraint carrier when filled; no manual-lift rating.', 'stack_count_target': 1, 'stack_basis': 'No stacking interface or loaded stacking rating authored.', 'opening': 'Removable service cap/bungs; source exploded closure pose only, no runtime opening controller.'},
                'mounting': {'bay_m': [2, 2], 'interface': 'Named restraint sockets on supported frame/rim; carrier adapter pending. No automatic snapping or docking claim.'},
                'unresolved': ['Dimensions, capacities, mass and operating values are unapproved proposals.', 'Back and underside inferred from functional design; only named primary reference is targeted.', 'Four source color/detail variants remain candidate coverage, not reconstructed or approved.', 'Pressure/thermal/chemical performance, closure seals and loaded transport require engineering and gameplay validation.', 'No inventory, pressure, thermal, damage, interaction or live authority implemented.', 'Runtime captures, crew-scale lineup and independent review remain separate evidence.'],
                'publication': False,
            }
            jobs.append({'slug': family, 'design_id': design, 'output': str(output), 'specification': spec,
                         'asset_id': 'part-' + hashlib.sha256(design.encode()).hexdigest()[:20]})
        manifest.write_text(json.dumps(jobs, indent=2) + '\n')
    jobs = json.loads(manifest.read_text())
    for job in jobs:
        output = Path(job['output']).resolve()
        if not output.is_relative_to(OUT) or (output / 'blender-source.blend').exists():
            raise ValueError('Preserve existing source / reject escaped path: ' + str(output))
    subprocess.run([config['art']['blender'], '--background', '--threads', '8', '--python-exit-code', '1', '--python', str(Path(__file__).with_name('cargo_fluid_extension_build.py')), '--', str(manifest)], cwd=ROOT, check=True)
    if not args.build_only:
        sys.path.insert(0, str(ROOT / 'scripts'))
        import art_catalog as ac
        refresh = ac.refresh
        ac.refresh = lambda: None
        try:
            with ac.locked():
                for job in jobs:
                    family = job['slug']; design = job['design_id']; refs = job['specification']['reference_ids']
                    if ac.design_path(design).exists():
                        raise ValueError('Preserve existing design: ' + design)
                    ac.split_design(argparse.Namespace(design=f'pale-studless.tank.{family}', new_design=design, references=refs, reason='Distinct fluid vessel geometry; primary source only. Four alternative appearances preserved as pending candidates.'))
                    ac.mutate(argparse.Namespace(command='start', design=design, covers=refs, agent='cargo-fluid-extension', change='Editable Blender vessel, supported protective hardware and measured hollow internal volume; five distinct fluid forms.', hypothesis='Match the source upright cryo/barrel/drum/bundle/cube silhouettes while keeping finite manufacturable wall thickness and visible fluid service paths.'))
                ac.refresh = refresh
                ac.refresh()
        finally:
            ac.refresh = refresh
    print('Five unsigned fluid drafts built; no publication or authority mutation.')

if __name__ == '__main__':
    main()
