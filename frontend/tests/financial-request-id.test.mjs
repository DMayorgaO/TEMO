import assert from 'node:assert/strict';
import test from 'node:test';
import {createFinancialRequestId} from '../src/utils/financial-request-id.ts';

test('financial references are independent random UUIDv4 identifiers',()=>{
  const ids=new Set(Array.from({length:512},createFinancialRequestId));
  assert.equal(ids.size,512);
  for(const id of ids)assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});

test('local HTTP without randomUUID still uses secure randomness; no weak fallback',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
  try{
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:array=>array.fill(0)}});
    assert.equal(createFinancialRequestId(),'00000000-0000-4000-8000-000000000000');
    Object.defineProperty(globalThis,'crypto',{configurable:true,value:{getRandomValues:()=>{throw new Error('secure random unavailable');}}});
    assert.throws(createFinancialRequestId,/secure random unavailable/);
  }finally{Object.defineProperty(globalThis,'crypto',descriptor);}
});
