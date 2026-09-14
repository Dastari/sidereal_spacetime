# Ice r018 — local angular volume correction

Native Blender source replaces snowball-topped octagons with closed unequal 4/5/6-sided ice prisms and thin angular snow cornices. Three selected stepped snow lobes, an overhang and shorter angular cut-wall buttresses introduce structure. The broad cut floor remains recessed; the central shaft floor remains Z −.62. Materials retain exact r017 PBR values, IOR and clearcoat; native UV/corner-normal fields are transported through the existing single-region spherical mapping.

Native kit-preview.png and kit-sideview.png have been inspected. The side view demonstrates actual vertical volume and thin caps. Blender validation proves each hero volume exceeds .07, height exceeds twice each horizontal dimension, and vertical wall area exceeds .6 source units. Compositor test proves high blue vertices extend beyond normalized radius1.25 and preserve near-tangential wall normals. Five tests pass, including unchanged regional geometry across LODs, native UV preservation, deep shaft and open-cut NullEngine ray clearance. TypeScript checking passes. Total retained unit plus ground:10,696 triangles at all LODs.

Candidate remains single-region-only. Actual game two-angle review is pending; no population, owner sign-off or hardware acceptance is claimed. Fine cornice edge irregularity and broader snow appearance remain visual-review questions.
