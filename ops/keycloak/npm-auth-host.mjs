// Administrator maintenance inside the existing NPM container; exact new host only.
import fs from 'node:fs';
import Database from 'better-sqlite3';
import Access from '/app/lib/access.js';
import Host from '/app/models/proxy_host.js';
import internal from '/app/internal/proxy-host.js';
const domain='auth.dastari.net',upstream=process.env.DASTARI_AUTH_UPSTREAM;
if(!/^10\.0\.1\.\d+$/.test(upstream??''))throw Error('Invalid dedicated provider IP');
const before=await Host.query().where('is_deleted',0);const matches=before.filter(h=>h.domain_names.includes(domain));
if(matches.length>1)throw Error('Ambiguous existing auth host');
if(matches[0]&&matches[0].domain_names.length!==1)throw Error('Refusing to alter a shared-domain host');
const backup='/data/backups/dastari-auth-before-'+Date.now()+'.sqlite';const db=new Database('/data/database.sqlite');await db.backup(backup);db.close();fs.chmodSync(backup,0o600);
const access=new Access();await access.load(true);
const data={domain_names:[domain],forward_scheme:'http',forward_host:upstream,forward_port:8080,access_list_id:0,certificate_id:matches[0]?.certificate_id||'new',ssl_forced:true,caching_enabled:false,block_exploits:true,allow_websocket_upgrade:true,http2_support:true,hsts_enabled:true,hsts_subdomains:false,advanced_config:'proxy_buffer_size 128k;\nproxy_buffers 4 256k;\nproxy_busy_buffers_size 256k;',locations:[],meta:{letsencrypt_agree:true,dns_challenge:false},enabled:true};
const row=matches[0]?await internal.update(access,{...data,id:matches[0].id}):await internal.create(access,data);
const after=await Host.query().where('is_deleted',0);for(const old of before.filter(h=>!h.domain_names.includes(domain))){const current=after.find(h=>h.id===old.id);if(JSON.stringify(old)!==JSON.stringify(current))throw Error('Unrelated host changed during maintenance: '+old.id);}
console.log(JSON.stringify({domain,hostId:row.id,certificateId:row.certificate_id,upstream,otherHostsUnchanged:true,backup}));process.exit();
