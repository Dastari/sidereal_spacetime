import React, {useState} from 'react';
import type {DbConnection} from '@sidereal/net';
import {createOperationId} from './operation-id';

export function AccountPanel({connection, characterId, name, oidc, onSignOut}: {
  connection:DbConnection|null;characterId?:string;name:string;oidc:boolean;onSignOut:()=>void;
}) {
  const [open,setOpen] = useState(false),[target,setTarget] = useState(''),[error,setError] = useState(''),[busy,setBusy] = useState(false);
  const links = connection ? [...connection.db.ownIdentityLinks.iter()] : [];
  const identity = connection?.identity?.toHexString();
  async function perform(action:()=>Promise<void>) {
    setBusy(true);setError('');try {await action();}catch(e){setError(String(e));}finally{setBusy(false);}
  }
  return <><button className="account-toggle" onClick={()=>setOpen(!open)}>Account</button>{open && <section className="account-panel" aria-label="Account">
    <h2>{name}</h2><button onClick={()=>setOpen(false)}>Close</button><button onClick={onSignOut}>Sign out</button>
    {error && <p role="alert" className="auth-error">{error}</p>}
    {oidc && !characterId && <><h3>Bring your existing character</h3><p>Keep this account open. In the browser with your development character, open Account and paste this account code. Then accept the request here.</p><code>{identity ?? 'Connecting…'}</code><p>To start fresh, close this panel and create a character instead. An account with a character cannot receive a transfer.</p></>}
    {!oidc && characterId && <><h3>Link to your Dastari account</h3><p>Sign in on the secure game address in another window, open Account and copy its account code. This transfers your existing character, inventory and appearance after you accept there.</p><a href={import.meta.env.VITE_AUTH_ORIGIN} target="_blank" rel="noreferrer">Open secure sign-in</a><label>Destination account code<input value={target} onChange={e=>setTarget(e.target.value)} autoComplete="off" spellCheck={false}/></label><button disabled={busy || !/^(0x)?[0-9a-f]{64}$/i.test(target.trim())} onClick={()=>void perform(async()=>{if(!connection)throw new Error('Reconnect first.');await connection.reducers.requestIdentityLink({targetIdentity:target.trim().replace(/^0x/i,''),expectedCharacterId:characterId,operationId:createOperationId()});})}>Request character transfer</button></>}
    {links.map(link=><div key={link.id}><p>{link.characterName}: {link.status}</p>{link.side==='target' && link.status==='pending' && !characterId && <button disabled={busy} onClick={()=>void perform(async()=>{if(!connection)throw new Error('Reconnect first.');await connection.reducers.acceptIdentityLink({requestId:link.id,operationId:createOperationId()});})}>Accept {link.characterName}</button>}</div>)}
    {oidc && characterId && <p>Your character is saved to this Dastari account.</p>}
  </section>}</>;
}
