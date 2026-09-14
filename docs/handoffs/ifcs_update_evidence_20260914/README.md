# IFCS phase 5 browser evidence

Normal composed game client, isolated phase4-r0002 database, native owner character;
WebGL2/SwiftShader, 1200×780. These are gameplay integration checks, not new art
sign-off. No client-authored transforms, force or damage was used.

- [Forward burn](forward-burn-verified.png): three aft plumes; zero retro throttle
  across all 54 telemetry samples.
- [Turn](turn.png): actual heading change with achieved actuator output.
- [Removed port main](removed-port-main.png): two remaining aft plumes; no removed
  actuator in any of 75 samples. The validated removal reduced mass by
  203.917043184782 kg and left eight compiled actuators.
- [Compiled properties](compiled-properties.png): mass, centre of mass, inertia,
  directional acceleration and angular authority after removal.

[Sampled evidence](browser-evidence.json) preserves the actual actuator UUIDs,
compiled mounts and before/after mass. The progress ledger records full checks,
source/provenance preservation and the isolated browser setup.
