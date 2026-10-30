const test=require('node:test');
const assert=require('node:assert/strict');
const {Subject,of,throwError,lastValueFrom}=require('rxjs');
const {ReadWorkloadInterceptor}=require('../dist/common/read-workload.interceptor');
const host=(id='actor',path='/api/transactions',method='GET')=>{
  const headers={};
  return {headers,switchToHttp:()=>({getRequest:()=>({method,user:id?{id}:undefined,route:{path}}),getResponse:()=>({setHeader:(key,value)=>{headers[key]=value;}})})};
};

test('heavy read slots isolate users and expose retry guidance without affecting writes or shift tools',async()=>{
  const limiter=new ReadWorkloadInterceptor(),source=new Subject(),subscriptions=[];
  try{
    for(let n=0;n<4;n++)subscriptions.push(limiter.intercept(host(),{handle:()=>source}).subscribe());
    const blocked=host();let handled=0;
    await assert.rejects(lastValueFrom(limiter.intercept(blocked,{handle:()=>{handled++;return of([]);}})),error=>error.getStatus()===429);
    assert.equal(blocked.headers['Retry-After'],'1');assert.equal(handled,0);
    await lastValueFrom(limiter.intercept(host('other'),{handle:()=>of([])}));
    for(const path of ['/api/transactions/batch','/api/transactions/pending/pay-batch','/api/shifts/id/close','/api/shifts/id/handovers']){
      await lastValueFrom(limiter.intercept(host('actor',path,'POST'),{handle:()=>of([])}));
    }
    for(const path of ['/api/shifts/current','/api/shifts/id','/api/shifts/notifications','/api/shifts/id/handover-preview','/api/transactions/id/detail']){
      await lastValueFrom(limiter.intercept(host('actor',path),{handle:()=>of([])}));
    }
  }finally{subscriptions.forEach(subscription=>subscription.unsubscribe());}
  assert.equal(limiter.activeActors.size,0);assert.equal(limiter.active,0);
});

test('global read ceiling remains bounded across identities and releases when a request ends',async()=>{
  const limiter=new ReadWorkloadInterceptor(),source=new Subject(),subscriptions=[];
  try{
    for(let n=0;n<16;n++)subscriptions.push(limiter.intercept(host('actor-'+n,'/api/shifts/dashboard'),{handle:()=>source}).subscribe());
    await assert.rejects(lastValueFrom(limiter.intercept(host('extra','/api/dollar-purchases'),{handle:()=>of([])})),error=>error.getStatus()===429);
    subscriptions.pop().unsubscribe();
    await lastValueFrom(limiter.intercept(host('extra','/api/dollar-purchases'),{handle:()=>of([])}));
  }finally{subscriptions.forEach(subscription=>subscription.unsubscribe());}
  assert.equal(limiter.activeActors.size,0);assert.equal(limiter.active,0);
});

test('errors, cancellation, synchronous failures and repeated subscriptions never leak read slots',async()=>{
  const limiter=new ReadWorkloadInterceptor(),context=host();
  await assert.rejects(lastValueFrom(limiter.intercept(context,{handle:()=>throwError(()=>new Error('async'))})),/async/);
  await assert.rejects(lastValueFrom(limiter.intercept(context,{handle:()=>{throw new Error('sync');}})),/sync/);
  const stream=limiter.intercept(context,{handle:()=>of([])});
  for(let n=0;n<50;n++)await lastValueFrom(stream);
  const subject=new Subject(),subscription=limiter.intercept(context,{handle:()=>subject}).subscribe();
  subscription.unsubscribe();
  assert.equal(limiter.activeActors.size,0);assert.equal(limiter.active,0);
});
