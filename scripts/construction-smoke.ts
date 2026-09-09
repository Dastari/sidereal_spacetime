import assert from 'node:assert/strict';
import {DbConnection,tables} from '../packages/net/src/generated';
/** Called against the isolated smoke module. Provider-admin happy path is separate. */
export async function constructionDenialSmoke(a:DbConnection,b:DbConnection){
 const subscribe=(c:DbConnection)=>new Promise<void>((resolve,reject)=>c.subscriptionBuilder().onApplied(()=>resolve()).onError(e=>reject(e)).subscribe([tables.ownConstructionGrants,tables.ownConstructionDrafts,tables.ownConstructionBlueprints,tables.ownConstructionInstances,tables.ownConstructionDecks,tables.ownConstructionLocation]));
 await Promise.all([subscribe(a),subscribe(b)]);
 for(const c of [a,b]){assert.equal([...c.db.ownConstructionGrants.iter()].length,0);assert.equal([...c.db.ownConstructionDrafts.iter()].length,0);assert.equal([...c.db.ownConstructionBlueprints.iter()].length,0);
  assert.equal([...c.db.ownConstructionInstances.iter()].length,0);assert.equal([...c.db.ownConstructionDecks.iter()].length,0);assert.equal([...c.db.ownConstructionLocation.iter()].length,0);
  await assert.rejects(c.reducers.spawnConstructionBlueprint({blueprintId:"missing",expectedSha256:"0".repeat(64),sourceDeckId:"missing",operationId:crypto.randomUUID()}));
  await assert.rejects(c.reducers.setConstructionGrant({principal:c.identity!.toHexString(),workspaceId:'construction-test',capability:'grant.manage',expiresMicros:18446744073709551615n,revoked:false,expectedRevision:0n,operationId:crypto.randomUUID()}));
  await assert.rejects(c.reducers.saveConstructionDraft({workspaceId:'construction-test',draftId:'test',documentJson:'{}',expectedRevision:0n,operationId:crypto.randomUUID()}));
  await assert.rejects(c.reducers.publishConstructionBlueprint({workspaceId:'construction-test',draftId:'test',expectedRevision:0n,operationId:crypto.randomUUID()}));
 }
 return {ungrantedPublishDenied:true,selfGrantDenied:true,privateProjectionsEmpty:true,providerAdminHappyPath:'separate actual browser evidence; not part of this denial run'};
}
