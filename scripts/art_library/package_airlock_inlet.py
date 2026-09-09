"""Record immutable local native candidate evidence; no catalog/live publication."""
import json,hashlib,uuid,datetime,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
DESIGN=ROOT/'assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet'
REV=DESIGN/'revisions/r000'
ATTEMPT=REV/'a003'
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
manifest=json.loads((ATTEMPT/'delivery-manifest.json').read_text())
qualification=json.loads((ATTEMPT/'native-qualification.json').read_text());assert qualification['pass']
source=json.loads((ROOT/'.runtime/wayfarer-semantic-candidate-r001/placements.json').read_text());byid={p['sourcePlacedId']:p for p in source}
attachment=json.loads((ROOT/'docs/handoffs/wayfarer_airlock_attachment_candidate.json').read_text())
extended=next(p for p in attachment['candidates'] if p['id']=='extended-new-vestibule')
replacement=[];additions=[]
for part in manifest['parts']:
 record={'candidatePartId':part['id'],'nativeVisual':{'path':str((ATTEMPT/part['file']).relative_to(ROOT)),'sha256':part['sha256'],'nodePrefix':part['nodePrefix']},'originalLocalAnchorCommonM':part['anchorCommonM'],'placement':{'position':part['worldPositionM'],'rotation':part['rotation'],'flipped':part['flipped']},'layer':'roof' if part['id']=='stepped-roof' else 'armor' if part['id']=='armor-collar' else 'structure','noGameplayStatsChange':True}
 if part['replacesSourcePlacedId']:
  record['sourcePlacedId']=part['replacesSourcePlacedId'];record['preservedOriginal']=byid[part['replacesSourcePlacedId']];replacement.append(record)
 else:
  record['sourcePlacedId']='candidate-wayfarer-airlock-inlet-'+part['id'];additions.append(record)
plan={'schema':'sidereal.wayfarer-native-inlet-replacement-candidate.v1','status':'local-qualified-awaiting-parent-review','ownerFinalSignoff':None,'runtimeInstalled':False,'sourceBlueprintSha256':attachment['sourceBlueprintSha256'],'sourceAttachmentStudySha256':digest(ROOT/'docs/handoffs/wayfarer_airlock_attachment_candidate.json'),'nativeQualificationSha256':digest(ATTEMPT/'native-qualification.json'),'preserveOriginalPlacements':source,'replacements':replacement,'additions':additions,'attachedNativeParts':[p for p in extended['nativePlacements'] if p['sourcePartIndex']!=26],'omittedNewPart':next(p for p in extended['nativePlacements'] if p['sourcePartIndex']==26),'resultingVisualPlacementCount':len(source)+len(additions)+69,'templateInstanceUuidPolicy':'Source placed IDs remain stable design identities; normal server compiler allocates independent instance UUIDs. Existing item/fitting/container UUID migration is separate and not performed.','physicsScope':{'penetrableStructuralRoles':['interior-frame','structural-aperture','stepped-roof'],'penetrableArmorRoles':['armor-collar'],'floorSupportRoles':['flush-threshold'],'damageStrengthRatings':'Unchanged or unqualified; no ratings inferred from appearance.','pressure':'Only bounded native airlock chamber qualified. Wayfarer interior is not declared sealed, no gas allocated and no powered pump capability supplied.'},'visibility':{'stepped-roof':'roof layer follows flight/cutaway','armor-collar':'exterior armor remains outside roof-only cutaway','originalFloorRoof':'preserved with original placed identity; no doubled semantic floor visual','attachedDoors':'existing actual hinge and gasket-morph visibility contract'},'remainingGates':['Parent actual-image review before any integration','New exact source-qualified collision provider and authoritative document/template mapping','Full combined moving-door hinge reservation/sweep proof with attached kit','Accepted inlet gas-neighbor boundary and no-free-gas rules','Isolated authority spawn/walk/exterior egress, actual browser review','Separate final owner artistic sign-off']}
(ATTEMPT/'replacement-mapping.json').write_text(json.dumps(plan,indent=2)+'\n')
# Preserve exact reference crop; no silent change to the side-armor design mapping.
reference=ROOT/'assets/art-library/assets/3d-rpg-after--wayfarer-exterior-red-service-panel/revisions/r000/reference.png'
if not (REV/'reference.png').exists():shutil.copy2(reference,REV/'reference.png')
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
evidence=[]
for path in sorted(ATTEMPT.iterdir()):
 if path.is_file():
  role='runtime-candidate' if path.suffix=='.glb' else 'editable-blender' if path.suffix=='.blend' else 'blender-render' if path.suffix=='.png' else 'validation'
  evidence.append({'role':role,'path':str(path.relative_to(ROOT/'assets/art-library')),'sha256':digest(path),'bytes':path.stat().st_size,'notes':'Isolated candidate only; native local qualification is not owner artistic approval or installed-game evidence.','capture_context':None,'recorded_at':now})
ledger={'schema':'sidereal.art-library.v1','id':'shipyard.structure.wayfarer-airlock-inlet','asset_uuid':str(uuid.uuid5(uuid.NAMESPACE_URL,'sidereal/shipyard.structure.wayfarer-airlock-inlet')),'reference_ids':[],'inspiration_reference_ids':['8d7c1228-3700-5659-9cb1-7a82781c7867'],'mapping_status':'Functional owner-requested aperture adaptation. Side-armor reference supplies material/theme inspiration, not an exact aperture shape.','current_revision':0,'state':'in-progress','owner_final_signoff':None,'priority':10,'profile':'native-wayfarer-starboard-airlock-inlet','assigned_to':'stair_document','blocker':'Parent review and actual shared document/collision/door/gas-neighbor integration pending. Whole ship not qualified airtight.','feedback':[{'source':'native CSG','recorded_at':now,'notes':'a001 preserved after exporter succeeded but local Blender denoiser unavailable. a002 material/context render passed; native audit found existing quarter-floor bevel seams in new vestibule. a003 adds authored flush seam strips;21 native checks pass.'}],'approvals':[],'revisions':[{'revision':0,'created_at':now,'stage':'in-progress','change':'Three original-transform structural/armor apertures plus roof transition and flush native seam kit. Existing262 source placements/cockpit/cargo/floor/roof untouched.','hypothesis':'An exact2m aperture and312.5mm roof transition can attach a qualified native external airlock without deleting unrelated geometry or falsifying pressure seals.','covered_reference_ids':[],'evidence':evidence}]}
(DESIGN/'design.json').write_text(json.dumps(ledger,indent=2)+'\n')
(REV/'spec.md').write_text('''# Wayfarer airlock inlet · r000/a003

This is an isolated Blender-authored candidate, not installed art or final owner approval.

- Bay: starboard world X=5, Y=-5..-3. Frame in metres: Blender XYZ, world origin [5,-5,0].
- Clear inlet: 1.25m wide, 2.25m above the0.1875m deck. The original inner airlock door remains at worldX=7.
- Roof underside: existing2.6875m → new3.0m. The312.5mm transition uses actual continuous native riser/laps; existing roof meshes are unchanged.
- Exact replacement IDs: wall-2--2, wall-3--2, superstructure-3--2. Their three original position/rotation/mirror transforms remain identical.
- New independent groups: stepped roof and flush threshold/seam strips. Existing new-airlock backwall sourcePartIndex26 is omitted; all other69 native parts retain their source hashes.
- Native materials are appended from the exact side-armor r003 editable source, including normal and packed material textures.
-50 editable visual components, five nativeGLBs,19 explicit contact cores. Separate contact proxies are not the exported visual representation or gameplay ratings.
- Existing262 source placements are preserved verbatim in replacement-mapping.json. A proposed visual substitution does not rewrite live item/container/crew state.
-21 new native checks pass. This proves local inlet support/contact and bounded closed chamber geometry, not a pressurized/sealed whole Wayfarer, free gas, powered pump or unrestricted vacuum travel.

## Evidence and reproduction

`python3 scripts/art_library/run_airlock_inlet.py --attempt N` creates a NEW attempt through the configured Blender binary. Never reuse a previous attempt.

`python3 scripts/art_library/run_airlock_inlet.py --attempt N --stage attachment` captures actual assembled native surfaces, with roof cutaway explicitly presentation-only.

`.runtime/construction-enclosure-python/bin/python scripts/qualify_wayfarer_airlock_inlet.py assets/art-library/designs/shipyard.structure.wayfarer-airlock-inlet/revisions/r000/a003` reproduces the qualified report.

The CSG audit reassembles GLB material primitives into actual source meshes; it does not synthesize missing triangles. Closed-volume checks use1µm source-coordinate rounding and the pre-existing10nm gasket-contact rounding. An exact native contact-core proof avoids an observed manifold3d3.2.1 crash when Boolean-testing decorative coplanar roof skins; native full visual geometry remains included in route and assembled-cavity checks.

Floor seam strips in a003 fix the failed actual supported-area test preserved undera002. Both native door leaves remain closed in attachment captures; no animation claim is made from these stills. Full combined hinge-envelope checks remain an integration gate.
''')
print(json.dumps({'design':str(DESIGN.relative_to(ROOT)),'parts':5,'replacements':len(replacement),'candidateVisualPlacements':plan['resultingVisualPlacementCount'],'qualificationChecks':21,'ownerFinalSignoff':None}))
