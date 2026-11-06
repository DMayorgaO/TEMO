const test=require('node:test'),assert=require('node:assert/strict');
const {TransactionsService}=require('../dist/modules/transactions/transactions.service');
const service=new TransactionsService({});const rates={buy:36.4,sell:37};
const empty={NIO:[],USD:[]};
const cash=(nio=0,usd=0)=>({NIO:nio?[{denomination:1,piles25:0,loose:nio}]:[],USD:usd?[{denomination:1,piles25:0,loose:usd}]:[]});
const settlement=(primary=empty,change=empty,kind='COMPRA',expected=0)=>({primaryRateKind:kind,changeRateKind:kind,primaryCounts:primary,changeCounts:change,expectedChange:{NIO:expected,USD:0}});
const fixture=(withdrawal=34.31)=>({rates,transactions:[{amount:withdrawal,currencyCode:'USD',pendingName:'',settlement:settlement()},
 {amount:40,currencyCode:'USD',pendingName:'',settlement:settlement(cash(23,32),empty,'VENTA',withdrawal===34.31?.43:1.54)}],settlement:settlement()});
for(const withdrawal of [34.31,34.34])test(`USD pending and mixed cash group accepts withdrawal ${withdrawal} at sale rate`,()=>{
 assert.doesNotThrow(()=>service.validateCompensatedGroup(fixture(withdrawal),['SALE','ENTRA'],{NIO:0,USD:26.92}));
 const bad=fixture(withdrawal);bad.transactions[1].settlement.changeRateKind='COMPRA';
 assert.throws(()=>service.validateCompensatedGroup(bad,['SALE','ENTRA'],{NIO:0,USD:26.92}),/tasa del vuelto debe ser Venta/);
});
test('missing cash and excessive change still reject compensated groups',()=>{
 for(const mutate of [x=>x.transactions[1].settlement.primaryCounts=cash(20,32),x=>x.transactions[1].settlement.changeCounts=cash(1,0)]){
  const input=fixture();mutate(input);assert.throws(()=>service.validateCompensatedGroup(input,['SALE','ENTRA'],{NIO:0,USD:26.92}),/no cubre/);
 }
});
test('cross-currency pending settlement uses sale rate and only the needed NIO',()=>{
 const input=fixture();input.transactions[0].currencyCode='NIO';input.transactions[0].amount=5000;input.transactions[1].settlement=settlement(cash(23),empty,'VENTA');
 const conversions=service.validateCompensatedGroup(input,['SALE','ENTRA'],{NIO:0,USD:26.92});
 assert.equal(conversions.length,1);assert.equal(conversions[0].kind,'VENTA');assert.ok(Math.abs(conversions[0].amount-66.92*37)<1e-8);
});
test('new credit is not money available to pay a different pending',()=>{
 const input=fixture();input.transactions[0].pendingName='NEW CREDIT';input.transactions[1].settlement=settlement(empty,empty,'VENTA');
 assert.throws(()=>service.validateCompensatedGroup(input,['SALE','ENTRA'],{NIO:0,USD:26.92}),/no cubre/);
});

for(const [currency,amount,debt,kind,used,converted] of [
 ['NIO',500,{NIO:0,USD:10},'VENTA',370,10],
 ['USD',15,{NIO:364,USD:0},'COMPRA',10,364],
 ['NIO',500,{NIO:130,USD:10},'VENTA',370,10],
 ['USD',15,{NIO:364,USD:5},'COMPRA',10,364],
])test(`cross-currency withdrawal ${currency} pays ${JSON.stringify(debt)} once`,()=>{
 const input={rates,transactions:[{currencyCode:currency,amount,settlement:settlement(empty,empty,kind)}],settlement:settlement()};
 const result=service.validateCompensatedGroup(input,['SALE'],debt);assert.equal(result.length,1);
 assert.equal(result[0].kind,kind);assert.ok(Math.abs(result[0].amount-used)<1e-8);assert.ok(Math.abs(result[0].converted-converted)<1e-8);
 const invalid=structuredClone(input);invalid.transactions[0].amount=1;
 assert.throws(()=>service.validateCompensatedGroup(invalid,['SALE'],debt),/no cubre/);
});

test('already delivered withdrawal and excess cross-currency change cannot pay debt again',()=>{
 const input={rates,transactions:[{currencyCode:'NIO',amount:500,settlement:settlement(cash(500),empty,'VENTA')}],settlement:settlement()};
 assert.throws(()=>service.validateCompensatedGroup(input,['SALE'],{NIO:0,USD:10}),/no cubre/);
 input.transactions[0].settlement=settlement(empty,cash(131), 'VENTA');
 assert.throws(()=>service.validateCompensatedGroup(input,['SALE'],{NIO:0,USD:10}),/no cubre/);
 input.transactions[0].settlement.changeCounts=cash(130);
 assert.doesNotThrow(()=>service.validateCompensatedGroup(input,['SALE'],{NIO:0,USD:10}));
});
test('legacy shared settlement is counted once and rate rules without pending remain enforced',()=>{
 const input={rates,transactions:[{currencyCode:'NIO',amount:380},{currencyCode:'NIO',amount:200}],settlement:settlement()};
 assert.doesNotThrow(()=>service.validateCompensatedGroup(input,['SALE','ENTRA'],{NIO:180,USD:0}));
 assert.throws(()=>service.assertChangeRateRule({rates},{currencyCode:'USD',amount:40,settlement:settlement(cash(1500),empty,'COMPRA',20)},'ENTRA'),/tasa del vuelto debe ser Venta/);
});

test('compensated groups keep preferential buy conversion and never spend the same balance twice',()=>{
 const input={rates,specialExchangeRate:36.55,transactions:[{currencyCode:'USD',amount:100,pendingName:'',settlement:settlement()},
  {currencyCode:'NIO',amount:3000,pendingName:'',settlement:settlement(empty,empty,'COMPRA',289.5)}],settlement:settlement()};
 assert.doesNotThrow(()=>service.validateCompensatedGroup(input,['SALE','ENTRA'],{NIO:0,USD:10}));
 assert.throws(()=>service.validateCompensatedGroup(input,['SALE','ENTRA'],{NIO:0,USD:20}),/no cubre/);
 const mixed=fixture();assert.doesNotThrow(()=>service.validateCompensatedGroup(mixed,['SALE','ENTRA'],{NIO:.25,USD:26.92}));
 assert.throws(()=>service.validateCompensatedGroup(mixed,['SALE','ENTRA'],{NIO:1,USD:26.92}),/no cubre/);
});
