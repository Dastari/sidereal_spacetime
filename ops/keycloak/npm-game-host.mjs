// Owner-authorized cutover of the existing Sidereal host; other hosts untouched.
import fs from 'node:fs';
import Database from 'better-sqlite3';
import Access from '/app/lib/access.js';
import Host from '/app/models/proxy_host.js';
import internal from '/app/internal/proxy-host.js';

const domain='sidereal.dastari.net';
const before=await Host.query().where('is_deleted',0);
const matches=before.filter(h=>h.domain_names.includes(domain));
if(matches.length!==1||matches[0].domain_names.length!==1)throw Error('Expected one dedicated existing Sidereal host');
const old=matches[0];
if(old.forward_host!=='10.0.1.200'||![3000,5183].includes(old.forward_port))throw Error('Unexpected existing upstream; review before cutover');
const backup='/data/backups/sidereal-game-before-'+Date.now()+'.sqlite';
const db=new Database('/data/database.sqlite');await db.backup(backup);db.close();fs.chmodSync(backup,0o600);
const access=new Access();await access.load(true);
const row=await internal.update(access,{id:old.id,forward_scheme:'http',forward_host:'10.0.1.200',forward_port:5183,allow_websocket_upgrade:true,ssl_forced:true,caching_enabled:false});
const after=await Host.query().where('is_deleted',0);
for(const previous of before.filter(h=>h.id!==old.id)){
 if(JSON.stringify(previous)!==JSON.stringify(after.find(h=>h.id===previous.id)))throw Error('Unrelated host changed: '+previous.id);
}
console.log(JSON.stringify({domain,hostId:row.id,certificateId:row.certificate_id,upstream:'10.0.1.200:5183',otherHostsUnchanged:true,backup}));
process.exit();
