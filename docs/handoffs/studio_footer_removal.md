# Studio footer removal — 2026-09-21

GrayLotus removed the shared `Sidereal Studio / Shipyard · System map · Genesis /
Independent dashboard` footer at the owner's request. Map and Genesis reclaim
its30px reserved height on desktop/mobile. Removed unused footer CSS and the
old Shipyard-specific hide rule. Dashboard patch version:0.10.1.

Validation: full build, edited-file lint/format and diff checks pass. Full check
passes typechecking and300 suites/1505 tests (2 existing skips), then fails the
inherited missing-document links. Real PKCE review using the retained account
against the isolated database verifies the authenticated shell at1440px and640px
widths: Workspaces, Map and Genesis have no footer and fill the900px viewport.
This layout check does not grant the reviewer authoring rights or mutate world
state. Existing isolated connection/access limitations are not save acceptance.

Publication uses only the four changed UI files and dashboard version/lock entry
on `/root/sidereal-studio-dashboard-release`, preserving its independent released
features. No world module, public game client, assets or account changes.
The prior release inventory remains the immutable record of0.10.0; this scoped
0.10.1 source patch supersedes its four UI file hashes and dashboard version.
Prior merge/publication authorization applies. Public activation follows PR merge.
