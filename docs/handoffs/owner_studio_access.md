# Owner Studio access restored — 2026-09-22

The owner reported that the authenticated `/map` page displayed “Universe-map
read access is required to open a live system.” Provider authentication was
working; the live database had zero construction grants. The live-editor release
required explicit workspace permission but had not provisioned the owner.

A read-only provider lookup resolved the unique enabled `dastari` account to
subject `388f569b-c81e-4acb-9b03-f84c259bf195`. Its previously verified SpacetimeDB
principal still owns the existing Dastari character:

- Principal: `c200bb5ccbff022a55bb86ff9e616c2a29dd6c06ace405ed68d4f4dacf7ccd41`.
- Character: `eb9eeb1d-adac-4c78-aff7-7a176f13d650`.
- Database: `sidereal-spacetime-dev`, live3100.

The normal `setConstructionGrant` reducer issued exactly two durable,
non-expiring grants on workspace `universe-map`, both at revision1:

| Capability | Operation ID |
| --- | --- |
| `draft.read` | `af7b04f3-c847-44a0-922e-f0843088cca5` |
| `draft.write` | `b6758e6a-14b8-483b-941c-c304045359f2` |

These grant map and native Genesis instance read/edit access. They do not grant
workspace administration, ship refit/spawn or blueprint publication. Reducer
revision, operation, safety and other validators remain active.

The retained reviewer used genuine PKCE and a temporary construction-admin
provider role to execute the grant reducer for the owner's principal. No owner
impersonation, password reset, raw database mutation, world-module publication
or new game character was used. The owner's provider roles were unchanged.
The reviewer received no workspace grants; its temporary role was removed and
its browser session signed out. The reviewer account itself is retained.

Verification read back both exact active principal/workspace/capability rows from
the authoritative database. Owner credentials were not used; an owner-browser
render/save check is not claimed. Refreshing the owner's editor reloads the
updated projection. Existing auth/session/subscription expiry behavior is retained.
Private before/after and operation evidence:
`.runtime/releases/owner-map-access-20260922/` in the canonical workspace.

This is an operational permissions correction, with no runtime code, schema,
asset or deployment change. It intentionally preserves all other accounts'
access rules. Agent Mail: GrayLotus.
