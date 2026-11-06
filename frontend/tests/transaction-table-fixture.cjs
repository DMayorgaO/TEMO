// Adapter for existing financial UI fixtures; pagination itself has separate browser tests.
exports.transactionTableFixture=(url,body)=>{
 const u=new URL(url);if(!u.pathname.endsWith('/transactions/table'))return body;
 const currency=u.searchParams.get('currency'),inactive=u.searchParams.get('inactive')==='true';
 const rows=body.filter(r=>(inactive||r.estado!=='ANULADA')&&(!currency||r.moneda===currency));
 const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||10);
 return {rows:rows.slice(offset,offset+limit),total:rows.length,totals:{}};
};
