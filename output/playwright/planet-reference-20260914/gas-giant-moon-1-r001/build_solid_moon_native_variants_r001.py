"""Six explicit native solid-moon material/source recipes, sharing proven Rocky10 solids.
Blender --python THIS -- NEW_OUTPUT EXACT_REFERENCE_ID. No publication.
"""
import sys,json,hashlib
from pathlib import Path
output=Path(sys.argv[sys.argv.index('--')+1]).resolve();reference_id=sys.argv[sys.argv.index('--')+2]
recipes={
 'planets--rocky-moon-2':dict(seed=203,scales=[.40,.38,.42,.37,.41,.39,.43,.38,.40,.37,.42,.39],palette=[(.30,.27,.38),(.50,.44,.58),(.028,.023,.045),(.105,.08,.15),(.19,.16,.25),(.61,.55,.69)],cue='Quieter compact grey/lilac pitted crust; cool fault, no orange seam'),
 'planets--desert-moon-1':dict(seed=307,scales=[.42,.39,.43,.40,.38,.41,.44,.39,.42,.40,.38,.43],palette=[(.66,.49,.48),(.86,.72,.66),(.050,.016,.020),(.23,.11,.13),(.40,.28,.29),(.90,.79,.73)],cue='Pale cream/pink cratered desert moon, dark rose-brown cavities; no mesas'),
 'planets--desert-moon-2':dict(seed=419,scales=[.39,.42,.38,.43,.40,.41,.39,.44,.38,.42,.40,.41],palette=[(.58,.15,.06),(.79,.28,.11),(.055,.008,.004),(.25,.055,.020),(.38,.09,.04),(.85,.35,.16)],cue='Terracotta/orange cratered moon, dark holes; no mesa hierarchy'),
 'planets--gas-giant-moon-1':dict(seed=523,scales=[.43,.38,.41,.40,.44,.39,.42,.37,.43,.40,.39,.41],palette=[(.30,.22,.38),(.54,.41,.62),(.024,.015,.038),(.10,.06,.15),(.23,.15,.30),(.65,.44,.65)],cue='Deep pitted lilac solid companion; pink near-ring illumination is separate, not painted emission'),
 'planets--gas-giant-moon-2':dict(seed=631,scales=[.38,.40,.42,.37,.39,.41,.38,.43,.40,.37,.42,.39],palette=[(.34,.30,.39),(.55,.49,.61),(.030,.025,.041),(.13,.105,.17),(.23,.20,.29),(.64,.56,.68)],cue='Quiet grey/lilac solid crater companion; no gas bands or own rings'),
 'planets--gas-giant-moon-3':dict(seed=743,scales=[.44,.41,.39,.43,.40,.42,.38,.44,.41,.40,.43,.39],palette=[(.45,.35,.51),(.66,.53,.73),(.034,.021,.047),(.17,.11,.23),(.31,.23,.38),(.76,.61,.78)],cue='Broader pale broken-shelf/crater companion with restrained lilac pigment; no own rings'),
}
assert reference_id in recipes,reference_id
recipe=recipes[reference_id];source_path=Path('/root/sidereal_spacetime/scripts/art_library/build_rocky_native_kit_r010.py');source=source_path.read_text()
output.mkdir(parents=True,exist_ok=True);assert not(output/'kit.blend').exists(),'Preserve prior candidate'
names=['crust','rim','cavity','fracture-wall','cool-fault','pale-fracture'];roughness=[.91,.87,.97,.92,.91,.85]
a=source.index('palette=[');b=source.index('\nmaterials=[]',a)
source=source[:a]+'palette='+repr([(reference_id+'-'+n,c,r)for n,c,r in zip(names,recipe['palette'],roughness)])+'\n'+source[b:]
source=source.replace("'native-rocky-r010'",repr('native-'+reference_id+'-r001'))
source=source.replace("'layout':'rocky-crater-geology'","'layout':'solid-moon-craters','coveredReferenceIds':"+repr([reference_id])+",'compositionRecipe':"+repr(dict(referenceId=reference_id,layoutSeed=recipe['seed'],scales=recipe['scales'],variantOffset=recipe['seed']%2)))
(output/'generator.py').write_text(source);(output/'foundation-source.py').write_bytes(source_path.read_bytes())
(output/'variant-recipe.json').write_text(json.dumps(dict(referenceId=reference_id,sourceFoundation='rocky-r010',foundationSha256=hashlib.sha256(source_path.read_bytes()).hexdigest(),candidateRevision='r001',sourceCoordinates='Native Blender Z-up; unit radius, no authority dimensions',**recipe,publication='isolated source candidate; no automatic acceptance from rocky-moon-1 pass'),indent=2))
exec(compile(source,str(output/'generator.py'),'exec'))
