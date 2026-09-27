# F3 rendering diagnostics

Press **F3**, then choose **Visuals / debug**. These local controls do not change saved graphics preferences or world state. Closing F3 keeps the overrides active; **Reset** restores defaults. Smaller windows scroll.

| Control | What it shows or changes |
| --- | --- |
| Rig skeleton | Mint joint markers and bone links from the visible character's actual rig, after animation and equipment IK. Lines remain visible through the character. |
| Light volumes | Gold source markers, finite point-light range spheres and bounds, spot outer/inner cones and bounds. Disabled sources are gray. Directional/hemispheric and unbounded sources use direction markers rather than invented finite volumes. |
| Collision | Blue walkable floor outlines and pink blocking footprints at the current deck's elevation, visible through the rendered floors in top-down view. Accepted door poses update the overlay. |
| Global illumination | Switches environment illumination, ambient color and hemispheric fill off/on. Direct lights, emissive surfaces and baked texture lighting retain their own controls. |

The collision overlay uses the same pure geometry compilers as walking authority, qualified against the admitted construction document. It includes qualified native Wayfarer static collision, its admitted fuel mount, supported boundary/stair/ladder/pressure/airlock fixtures, and the original ship's actual legacy walk inputs. Unknown or changed geometry reports unavailable instead of substituting visual model bounds. Source identifiers are diagnostic labels and grant no access.

The panel reports coverage explicitly. Moving cargo/carrier collision and full 3D traversal support are not currently projected to this overlay. The standalone egress preview has no admitted collision source. Floor outlines are not a claim that every outlined point is reachable; actor clearance and additional traversal constraints still apply on the server.

Debug lines are non-pickable and do not create lights or colliders. Scene shutdown removes their observers and geometry, and illumination reset restores the current underlying values. This is a diagnostic view, not final art approval or an additional global-illumination renderer.

Lighting and Shadows controls preserve geometry visibility. Native assembly materials are registered with the scene so both switches update their shader settings; they must not hide walls or furniture. The fresh-load hardware regression and focused native-GLB tests are recorded in [the material registration handoff](handoffs/debug_native_material_registration.md).
