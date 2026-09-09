"""Record the exact additive construction walking checkpoint, never art approval."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[1]
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def tree(path):
 files=[p for p in path.rglob('*') if p.is_file()];digest=hashlib.sha256()
 for p in sorted(files):digest.update((str(p.relative_to(path))+'\0'+sha(p)+'\n').encode())
 return {'path':str(path.relative_to(ROOT)),'files':len(files),'treeSha256':digest.hexdigest()}
record={'schema':'sidereal.release-checkpoint.v1','date':'2026-09-09','status':'intermediate construction walking; full rebuild incomplete',
 'world':{'path':'packages/world/dist/bundle.js','sha256':sha(ROOT/'packages/world/dist/bundle.js'),'publication':'managed normal development database, delete-data=never'},
 'client':tree(ROOT/'apps/client/dist'),'dashboard':tree(ROOT/'apps/dashboard/dist'),
 'checks':{'aggregate':'94 files / 415 tests, typecheck and71 documents pass','build':'pass; expected chunk-size warnings','art':'pass','authoritySmoke':'isolated full smoke pass'},
 'browser':['output/playwright/shipyard-two-deck-publication.png','output/playwright/construction-authored-floor-walking.png'],
 'scope':['dedicated authoring PKCE and explicit workspace grants','recoverable drafts and immutable SHA-pinned blueprint publication','independent server instance/deck/placement IDs','native selected-deck floors and authoritative swept walking','explicit review transit/reconnect/return preserving original character inventory'],
 'normalData':'zero construction instances and grants seeded; existing21 characters/21 ships/117 inventory items retained after additive publication',
 'compatibility':['construction game review is opt-in ?constructionReview=1','normal game continues existing Wayfarer path','authoring requires explicitly assigned workspace capabilities','source identity linking with construction state requires further migration support'],
 'limitations':['second spawned instance not entered before temporary grant expiry','page reload persistence proven; construction process-restart proof pending','native walls/roofs/doors, live pressure, deck transitions, cargo/services and damage integration pending','full Wayfarer template and complete independent playable spawns pending'],
 'recovery':['leave review through return reducer before disabling its UI','retain additive private tables and UUIDs; no reset or schema rollback that discards state','rebuild client/dashboard independently; return to prior artifact only with compatible retained views'],
 'authorization':'owner requested full construction implementation and authorized coordinated integrations; this checkpoint grants no final art approval'}
for item in record['browser']:
 assert (ROOT/item).is_file(),item
path=ROOT/'docs/releases/construction-walking-2026-09-09.json';path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({k:record[k] for k in ['world','client','dashboard']},indent=2))
