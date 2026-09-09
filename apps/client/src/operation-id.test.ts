import {it,expect} from 'vitest';
import {createOperationId} from './operation-id';
it('creates valid distinct operation IDs without the secure-context randomUUID API',()=>{
  const httpCrypto={getRandomValues:globalThis.crypto.getRandomValues.bind(globalThis.crypto)};
  const a=createOperationId(httpCrypto),b=createOperationId(httpCrypto);
  expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(a).not.toBe(b);
});
