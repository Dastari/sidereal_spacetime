# Ice r016 worker-ready composition

Uses exact ice-r016 source kit. Ten unequal globally distributed regions and bounded paired blue-wall groups retain all authored geometry throughLOD. Diagnostic flag true returns one camera-facing region at normalized[.452,.388,.794] and the cleared substrate. No extra snow cards are generated.

Native ground is radially depressed by up to.78×regionScale under each shaft, with smooth restoration beneath the snow lip. Highest authored ground is retained at alllevels to prevent coarse triangles bridging the openings. The actual NullEngine triangle-ray diagnostic verifies the dark shaft floor lies in front of the underlying substrate with >.015normalizedradius clearance.

Every exported corner normal is transformed with deformedNormalAt, preserving authored smooth snow versus hard blue faces. Every glTF UV is retained verbatim after Float32 conversion, including seams. Outputs have positions/normals/uvs/indices and complete triangle placement ranges. Missing authored normal/UV channels are rejected.

Three focused tests and TypeScript checks pass. The first NullEngine test omitted materials, causing Babylon to fall back to bounding-box hits; test fixtures now use PBR materials and require actual picked triangle/floor position. No source geometry was changed to compensate for that test harness issue. AllLOD byte parity, finite/unit normals, exact UVs, attribute upload and actual depth clearance pass.

Source/helper snapshots and hashes frozen. Actual two-angle region/wholeplanet appearance, suitable blue exposure and hardware Flight/Observe performance remain open.
