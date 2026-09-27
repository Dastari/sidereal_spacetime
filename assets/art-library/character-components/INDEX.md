# Character components — living index

Current integration: **r009**. Owner final sign-offs are per component and exact revision.

Normal-game poses: **live; paired r003 equipment art owner-approved; new r009 heads/hair await final owner review**. Modular character r009 uses paired equipment/aim data r003 in the world and paper doll without a query gate. [Integration, exact assets, browser evidence and remaining fit/playback work](../../../docs/handoffs/character_f3_public_release_20260910.md). Publication does not confer owner final sign-off.

Head, hair and facial customization: **r009**, **live; awaiting owner final art review**; installed r009. Two heads and all eight existing hairstyles are covered. [Native sources, face atlases, browser evidence and remaining reference work](../../../docs/handoffs/character_faces_r009_live_release.md). New revision final art approval remains pending. The calibration entry below describes the earlier r008 work.

Focused reference calibration: **r008**, **awaiting-owner**, 14 existing components installed with owner authorization; final art sign-off remains pending. [Compare the reference, preserved r002 baseline and reviewed model](calibration/README.md). Two bases, three hairstyles and medic armor are covered; other sets retain r002. Open comms is a new proposed design with no inventory definition. Later calibration revisions retain unchanged body/armor geometry while correcting and revalidating the hair assembly.

[Authoring contract](../../../docs/character_component_authoring.md) · [Family revision and source references](../designs/crew.base-and-outfits/DESIGN.md) · [Machine-readable ledger](ledger.json)

All ten archetypes use the same male/female rig. Existing inventory equipment can be owned and equipped separately; staged designs without an inventory definition are explicitly labeled. Paired gloves, boots and shoulder guards contain distinct left/right skinned parts. Base modesty clothing cannot be removed.

Workflow: choose an unsigned component below; inspect its current source collection, standalone GLB, image and feedback. Start a new revision with `python3 scripts/character_components/catalog.py start ID --change "..."`. Keep all work in the new directory. Add source/model/images/validation using `evidence`, then record feedback and review in the ledger. Integration must rebuild the shared bundle using the current component revisions, retain weights/materials, and check both bodies and mixed sets. Do not rerun the original decomposition script over later authored revisions.

Only explicit owner feedback identifying the exact revision and deliverables permits `ownerFinalSignoff`. Agent review is recorded separately. An owner approval must include the original message reference and the approved evidence hashes; never infer it from silence, successful checks or implementation authorization.

| Component | Kind / slot | Design revision | Installed revision | State | Owner signed off |
| --- | --- | --- | --- | --- | --- |
| [Captain utility belt](components/captain-belt/ASSET.md) | belt | r002 | r002 | awaiting-owner | NO |
| [Captain boots](components/captain-boots/ASSET.md) | boots | r002 | r002 | awaiting-owner | NO |
| [Captain helmet](components/captain-helmet/ASSET.md) | helmet | r002 | r002 | awaiting-owner | NO |
| [Captain chest garment](components/captain-chest/ASSET.md) | chest | r002 | r002 | awaiting-owner | NO |
| [Captain shoulder guards](components/captain-shoulders/ASSET.md) | shoulders | r002 | r002 | awaiting-owner | NO |
| [Captain gloves / gauntlets](components/captain-gloves/ASSET.md) | gloves | r002 | r002 | awaiting-owner | NO |
| [Captain backpack](components/captain-back/ASSET.md) | back | r002 | r002 | awaiting-owner | NO |
| [Captain legwear](components/captain-legs/ASSET.md) | legs | r002 | r002 | awaiting-owner | NO |
| [Engineer backpack](components/engineer-back/ASSET.md) | back | r002 | r002 | awaiting-owner | NO |
| [Engineer utility belt](components/engineer-belt/ASSET.md) | belt | r002 | r002 | awaiting-owner | NO |
| [Engineer boots](components/engineer-boots/ASSET.md) | boots | r002 | r002 | awaiting-owner | NO |
| [Engineer chest garment](components/engineer-chest/ASSET.md) | chest | r002 | r002 | awaiting-owner | NO |
| [Engineer helmet](components/engineer-helmet/ASSET.md) | helmet | r002 | r002 | awaiting-owner | NO |
| [Engineer visor / optics](components/engineer-visor/ASSET.md) | visor | r002 | r002 | awaiting-owner | NO |
| [Engineer gloves / gauntlets](components/engineer-gloves/ASSET.md) | gloves | r002 | r002 | awaiting-owner | NO |
| [Engineer legwear](components/engineer-legs/ASSET.md) | legs | r002 | r002 | awaiting-owner | NO |
| [Engineer shoulder guards](components/engineer-shoulders/ASSET.md) | shoulders | r002 | r002 | awaiting-owner | NO |
| [Medic backpack](components/medic-back/ASSET.md) | back | r008 | r008 | awaiting-owner | NO |
| [Medic utility belt](components/medic-belt/ASSET.md) | belt | r008 | r008 | awaiting-owner | NO |
| [Medic boots](components/medic-boots/ASSET.md) | boots | r008 | r008 | awaiting-owner | NO |
| [Medic chest garment](components/medic-chest/ASSET.md) | chest | r008 | r008 | awaiting-owner | NO |
| [Medic gloves / gauntlets](components/medic-gloves/ASSET.md) | gloves | r008 | r008 | awaiting-owner | NO |
| [Medic legwear](components/medic-legs/ASSET.md) | legs | r008 | r008 | awaiting-owner | NO |
| [Medic helmet](components/medic-helmet/ASSET.md) | helmet | r008 | r008 | awaiting-owner | NO |
| [Medic visor / optics](components/medic-visor/ASSET.md) | visor | r008 | r008 | awaiting-owner | NO |
| [Medic shoulder guards](components/medic-shoulders/ASSET.md) | shoulders | r008 | r008 | awaiting-owner | NO |
| [Pilot utility belt](components/pilot-belt/ASSET.md) | belt | r002 | r002 | awaiting-owner | NO |
| [Pilot boots](components/pilot-boots/ASSET.md) | boots | r002 | r002 | awaiting-owner | NO |
| [Pilot chest garment](components/pilot-chest/ASSET.md) | chest | r002 | r002 | awaiting-owner | NO |
| [Pilot backpack](components/pilot-back/ASSET.md) | back | r002 | r002 | awaiting-owner | NO |
| [Pilot gloves / gauntlets](components/pilot-gloves/ASSET.md) | gloves | r002 | r002 | awaiting-owner | NO |
| [Pilot legwear](components/pilot-legs/ASSET.md) | legs | r002 | r002 | awaiting-owner | NO |
| [Pilot helmet](components/pilot-helmet/ASSET.md) | helmet | r002 | r002 | awaiting-owner | NO |
| [Pilot visor / optics](components/pilot-visor/ASSET.md) | visor | r002 | r002 | awaiting-owner | NO |
| [Pilot shoulder guards](components/pilot-shoulders/ASSET.md) | shoulders | r002 | r002 | awaiting-owner | NO |
| [Security officer utility belt](components/security-belt/ASSET.md) | belt | r002 | r002 | awaiting-owner | NO |
| [Security officer boots](components/security-boots/ASSET.md) | boots | r002 | r002 | awaiting-owner | NO |
| [Security officer chest garment](components/security-chest/ASSET.md) | chest | r002 | r002 | awaiting-owner | NO |
| [Security officer backpack](components/security-back/ASSET.md) | back | r002 | r002 | awaiting-owner | NO |
| [Security officer gloves / gauntlets](components/security-gloves/ASSET.md) | gloves | r002 | r002 | awaiting-owner | NO |
| [Security officer legwear](components/security-legs/ASSET.md) | legs | r002 | r002 | awaiting-owner | NO |
| [Security officer helmet](components/security-helmet/ASSET.md) | helmet | r002 | r002 | awaiting-owner | NO |
| [Security officer shoulder guards](components/security-shoulders/ASSET.md) | shoulders | r002 | r002 | awaiting-owner | NO |
| [Heavy marine utility belt](components/marine-belt/ASSET.md) | belt | r002 | r002 | awaiting-owner | NO |
| [Heavy marine boots](components/marine-boots/ASSET.md) | boots | r002 | r002 | awaiting-owner | NO |
| [Heavy marine chest garment](components/marine-chest/ASSET.md) | chest | r002 | r002 | awaiting-owner | NO |
| [Heavy marine gloves / gauntlets](components/marine-gloves/ASSET.md) | gloves | r002 | r002 | awaiting-owner | NO |
| [Heavy marine legwear](components/marine-legs/ASSET.md) | legs | r002 | r002 | awaiting-owner | NO |
| [Heavy marine shoulder guards](components/marine-shoulders/ASSET.md) | shoulders | r002 | r002 | awaiting-owner | NO |
| [Heavy marine helmet](components/marine-helmet/ASSET.md) | helmet | r002 | r002 | awaiting-owner | NO |
| [Heavy marine visor / optics](components/marine-visor/ASSET.md) | visor | r002 | r002 | awaiting-owner | NO |
| [Heavy marine backpack](components/marine-back/ASSET.md) | back | r002 | r002 | awaiting-owner | NO |
| [Salvage tech backpack](components/salvage-back/ASSET.md) | back | r002 | r002 | awaiting-owner | NO |
| [Salvage tech utility belt](components/salvage-belt/ASSET.md) | belt | r002 | r002 | awaiting-owner | NO |
| [Salvage tech boots](components/salvage-boots/ASSET.md) | boots | r002 | r002 | awaiting-owner | NO |
| [Salvage tech chest garment](components/salvage-chest/ASSET.md) | chest | r002 | r002 | awaiting-owner | NO |
| [Salvage tech gloves / gauntlets](components/salvage-gloves/ASSET.md) | gloves | r002 | r002 | awaiting-owner | NO |
| [Salvage tech legwear](components/salvage-legs/ASSET.md) | legs | r002 | r002 | awaiting-owner | NO |
| [Salvage tech helmet](components/salvage-helmet/ASSET.md) | helmet | r002 | r002 | awaiting-owner | NO |
| [Salvage tech visor / optics](components/salvage-visor/ASSET.md) | visor | r002 | r002 | awaiting-owner | NO |
| [Salvage tech shoulder guards](components/salvage-shoulders/ASSET.md) | shoulders | r002 | r002 | awaiting-owner | NO |
| [Recon scout utility belt](components/recon-belt/ASSET.md) | belt | r002 | r002 | awaiting-owner | NO |
| [Recon scout boots](components/recon-boots/ASSET.md) | boots | r002 | r002 | awaiting-owner | NO |
| [Recon scout chest garment](components/recon-chest/ASSET.md) | chest | r002 | r002 | awaiting-owner | NO |
| [Recon scout backpack](components/recon-back/ASSET.md) | back | r002 | r002 | awaiting-owner | NO |
| [Recon scout gloves / gauntlets](components/recon-gloves/ASSET.md) | gloves | r002 | r002 | awaiting-owner | NO |
| [Recon scout legwear](components/recon-legs/ASSET.md) | legs | r002 | r002 | awaiting-owner | NO |
| [Recon scout helmet](components/recon-helmet/ASSET.md) | helmet | r002 | r002 | awaiting-owner | NO |
| [Recon scout visor / optics](components/recon-visor/ASSET.md) | visor | r002 | r002 | awaiting-owner | NO |
| [Recon scout shoulder guards](components/recon-shoulders/ASSET.md) | shoulders | r002 | r002 | awaiting-owner | NO |
| [Scientist utility belt](components/scientist-belt/ASSET.md) | belt | r002 | r002 | awaiting-owner | NO |
| [Scientist boots](components/scientist-boots/ASSET.md) | boots | r002 | r002 | awaiting-owner | NO |
| [Scientist chest garment](components/scientist-chest/ASSET.md) | chest | r002 | r002 | awaiting-owner | NO |
| [Scientist backpack](components/scientist-back/ASSET.md) | back | r002 | r002 | awaiting-owner | NO |
| [Scientist gloves / gauntlets](components/scientist-gloves/ASSET.md) | gloves | r002 | r002 | awaiting-owner | NO |
| [Scientist legwear](components/scientist-legs/ASSET.md) | legs | r002 | r002 | awaiting-owner | NO |
| [Scientist shoulder guards](components/scientist-shoulders/ASSET.md) | shoulders | r002 | r002 | awaiting-owner | NO |
| [Mechanic backpack](components/mechanic-back/ASSET.md) | back | r002 | r002 | awaiting-owner | NO |
| [Mechanic utility belt](components/mechanic-belt/ASSET.md) | belt | r002 | r002 | awaiting-owner | NO |
| [Mechanic boots](components/mechanic-boots/ASSET.md) | boots | r002 | r002 | awaiting-owner | NO |
| [Mechanic chest garment](components/mechanic-chest/ASSET.md) | chest | r002 | r002 | awaiting-owner | NO |
| [Mechanic gloves / gauntlets](components/mechanic-gloves/ASSET.md) | gloves | r002 | r002 | awaiting-owner | NO |
| [Mechanic legwear](components/mechanic-legs/ASSET.md) | legs | r002 | r002 | awaiting-owner | NO |
| [Mechanic helmet](components/mechanic-helmet/ASSET.md) | helmet | r002 | r002 | awaiting-owner | NO |
| [Mechanic shoulder guards](components/mechanic-shoulders/ASSET.md) | shoulders | r002 | r002 | awaiting-owner | NO |
| [Armor Expedition chest garment](components/legacy-armor-expedition-chest/ASSET.md) | chest | r002 | r002 | awaiting-owner | NO |
| [Helmet Explorer helmet](components/legacy-helmet-explorer-helmet/ASSET.md) | helmet | r002 | r002 | awaiting-owner | NO |
| [Helmet Explorer visor / optics](components/legacy-helmet-explorer-visor/ASSET.md) | visor | r002 | r002 | awaiting-owner | NO |
| [Helmet Standard helmet](components/legacy-helmet-standard-helmet/ASSET.md) | helmet | r002 | r002 | awaiting-owner | NO |
| [Visor Standard visor / optics](components/legacy-visor-standard-visor/ASSET.md) | visor | r002 | r002 | awaiting-owner | NO |
| [Male base](components/base-male/ASSET.md) | base | r009 | r009 | awaiting-owner | NO |
| [Female base](components/base-female/ASSET.md) | base | r009 | r009 | awaiting-owner | NO |
| [Swept hair](components/hair-swept/ASSET.md) | hair | r009 | r009 | awaiting-owner | NO |
| [Cropped hair](components/hair-cropped/ASSET.md) | hair | r009 | r009 | awaiting-owner | NO |
| [Crest hair](components/hair-crest/ASSET.md) | hair | r009 | r009 | awaiting-owner | NO |
| [Scientist hair](components/hair-scientist/ASSET.md) | hair | r009 | r009 | awaiting-owner | NO |
| [Bob hair](components/hair-bob/ASSET.md) | hair | r009 | r009 | awaiting-owner | NO |
| [Ponytail hair](components/hair-ponytail/ASSET.md) | hair | r009 | r009 | awaiting-owner | NO |
| [Bun hair](components/hair-bun/ASSET.md) | hair | r009 | r009 | awaiting-owner | NO |
| [Braids hair](components/hair-braids/ASSET.md) | hair | r009 | r009 | awaiting-owner | NO |
| [Medic open comms (staged design)](components/medic-open-comms/ASSET.md) | helmet | r008 | staged / unissued | awaiting-owner | NO |
