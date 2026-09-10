# Native Wayfarer closure evidence

Status: local native contacts qualified; whole-main-hull closure remains unresolved. No live installation, pressure allocation, refit or final owner art approval. Updated 2026-09-10.

Exact editable sources and preserved attempts live under `assets/art-library/designs/shipyard.structure.roof-closure/revisions/r000/`. The design ledger pins each deliverable and its evidence. Original 262 placed records, R006 cockpit and floor/equipment sources are unchanged.

| Attempt | Authored work | Measured result |
| --- | --- | --- |
| a001 | 2 m seam rail, 160 mm corner junction, 62.5 mm datum step rail; three native GLBs and separate contact cores | 14 native gates pass. A real positive-area gap between four original roof corners closes with the junction; all four originals have positive contact overlap. Actual roof-height transition and standing clearance pass. |
| a002 | 2.5 m wall seam companion; editable native material surfaces and contact core | Positive overlap with both staggered rear wall panels. Corrected framed native-kit and rear-joint images preserved. Parent reviewed actual rear joint and authorized continued technical work. |
| a003 | 0.5 m shoulder companion, reused on each side of the existing doorway | 10 local native wall/shoulder gates pass, including overlap with original partitions/buttresses and preserved 1.25 m central opening. No final shoulder-context art review yet. |

The original rear **mid-wall** coupon was already sealed. Its initially selected negative control failed and is preserved as `a003/wall-qualification-a001.json`; the corrected report is `wall-qualification-a002.json`. Do not describe that midsection as a proven original open leak. Initial tall-part contact sheets in a002/a003 have incomplete framing and are retained as iteration evidence, not final acceptance.

Four native regression tests run through:

```sh
.runtime/construction-enclosure-python/bin/python -m unittest discover -s scripts/geometry_tests -p test_roof_closure.py
```

They cover actual roof gap negative/positive controls, actual main-floor corner gaps and under-floor native closure, zero-area-only component normalization with genuine positive-gap controls, and actual wall/shoulder contacts. Floor junctions stay below the walking datum; no native visual floor has been resized.

## Whole-hull inspection remains open

`scripts/inspect_wayfarer_native_enclosure.py` reads pinned original native sources, the three exact inlet replacements, attached native airlock parts and additive closure placements. Original pressure-capable geometry is distinct from decorative armor/equipment. Its preserved whole-ship reports include the closed airlock chamber at approximately 20.5981 m³, but do not establish a separate finite main interior.

Synthetic caps and section probes were used only to diagnose connectivity; they are not assets, published collision, or pressure evidence. The newest full-void positive-face path reaches the cockpit side/canopy region near X −3, Y 11, Z approximately 1.23 m. A connected surface path is not itself a free-air path. It needs a local positive-area geometric aperture witness before authoring a repair. Horizontal sections alone do not certify a three-dimensional enclosure.

`scripts/native_void_components.py` removes only exactly zero-area connecting faces and adds only exactly collinear topology ears. It never moves vertices or inserts a positive-area cap. Native gap negative controls remain open; the authored positive control closes. The full result remains open even with this normalization. Increasing tolerances, applying an offset shell or quietly capping positive gaps is not an acceptable qualification method.

## Owner correction changes the next structural work

The [authored interface audit](wayfarer_authored_interface_audit.md) finds that the older exterior wall groups consume nominal usable floor and intersect six lockers. Correct the wall family’s outward reservation and mixed partition roles at the source before treating any additive closure composition as a final kit. Existing companion artifacts are preserved local experiments; every wall-facing contact and new source envelope must be requalified against the corrected family. A local contact proof cannot override the owner's usable-floor requirement.

The next valid sequence is a corrected native wall/interface revision, exact floor/wall/roof/cockpit and equipment fit, continuous enclosure proof including real aperture negative controls, then an authoritative attached-instance candidate and actual browser cycle. Source-based pressure volumes, external airflow and gas conservation follow that qualified union; the already functional independent native airlock fixture does not seal the entire Wayfarer by association.
