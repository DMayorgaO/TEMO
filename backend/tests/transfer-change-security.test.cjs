const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Client}=require('pg');
const {ShiftsService}=require('../dist/modules/shifts/shifts.service');
const {TransfersService}=require('../dist/modules/transfers/transfers.service');
const {transferSchema,voidTransferSchema}=require('../dist/modules/transfers/transfers.schema');
const {auditChanges}=require('../dist/modules/catalogs/audit-changes');
const counts=n=>({NIO:[{denomination:100,piles25:0,loose:n}],USD:[]});
const stale=error=>error.getStatus()===409&&error.getResponse().code==='TRF-VER-409';

test('transfer write contracts preserve exact version text and reject malformed request references',()=>{
  const input={type:'EFECTIVO',direction:'EGRESO',currency:'NIO',amount:100,cashLines:counts(1).NIO};
  for(const expectedVersion of ['1','9007199254740993','9223372036854775807']){
    assert.equal(transferSchema.parse({...input,expectedVersion}).expectedVersion,expectedVersion);
    assert.equal(voidTransferSchema.parse({reason:'QA reason',expectedVersion}).expectedVersion,expectedVersion);
  }
  for(const expectedVersion of [null,1,{},'','01','-1','1.1','1;select 1','9'.repeat(20)]){
    assert.equal(transferSchema.safeParse({...input,expectedVersion}).success,false);
    assert.equal(voidTransferSchema.safeParse({reason:'QA reason',expectedVersion}).success,false);
  }
  assert.equal(voidTransferSchema.safeParse({reason:'QA reason',requestId:'bad'}).success,false);
});

test('transfer edits/voids: stale forms, confirmed receipts, permissions and rollback in local preview',{skip:!process.env.TEMO_TEST_PREVIEW},async t=>{
  const c=new Client({connectionString:'postgresql://temo_preview@127.0.0.1:55433/temo_preview',options:'-c search_path=temo,public,extensions',statement_timeout:15000});
  await c.connect();await c.query('begin');let sequence=0,failure='';
  const query=async(sql,args)=>{
    if(failure==='audit'&&sql.includes('insert into temo.bitacora'))throw new Error('audit unavailable');
    if(failure==='receipt'&&sql.includes('insert into temo.solicitudes_financieras'))throw new Error('receipt unavailable');
    return c.query(sql,args);
  };
  const db={query,transaction:async work=>{
    const save='transfer_security_'+(++sequence);await c.query('savepoint '+save);
    try{const result=await work({query});await c.query('release savepoint '+save);return result;}
    catch(error){await c.query('rollback to savepoint '+save);await c.query('release savepoint '+save);throw error;}
  }};
  try{
    const admin=(await c.query(`select u.id_usuario as id,u.version_sesion as "sessionVersion",'JEFA' as "roleCode" from temo.usuarios u join temo.roles r using(id_rol)
      where u.estado='ACTIVO' and r.estado='ACTIVO' and r.codigo='JEFA' and not u.debe_cambiar_contrasena limit 1`)).rows[0];
    const branch=(await c.query("select id_sucursal as id,nombre from temo.sucursales where estado='ACTIVO' limit 1")).rows[0];
    const shifts=new ShiftsService(db),transfers=new TransfersService(db);
    async function cashier(){
      const username='transfer_security_'+randomUUID().replaceAll('-','');
      const actor=(await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
        select id_rol,'Transfer','QA',$1,'not-a-login-credential','ACTIVO',false from temo.roles where codigo='CAJERO'
        returning id_usuario as id,version_sesion as "sessionVersion"`,[username])).rows[0];actor.roleCode='CAJERO';
      await c.query('insert into temo.usuarios_sucursales(id_usuario,id_sucursal) values($1,$2)',[actor.id,branch.id]);
      const shift=await shifts.create({branchId:branch.id,branch:branch.nombre,register:username,cashier:username,counts:counts(20),balances:[],notes:'isolated transfer security',prepared:false},admin);
      return {actor,shift};
    }
    const a=await cashier(),b=await cashier();
    const input=amount=>transferSchema.parse({shiftId:a.shift.database_id,type:'EFECTIVO',direction:'EGRESO',currency:'NIO',amount,cashLines:counts(amount/100).NIO,description:'Transfer QA'});
    const create=()=>transfers.create(input(100),a.actor);
    const version=async id=>(await transfers.detail(id,a.actor)).edit_version;
    const state=async id=>{
      const row=await shifts.detail(a.shift.database_id,a.actor);
      return {cash:row.cashCounts,expected:row.expectedCash,version:await version(id),
        movements:(await c.query('select count(*)::int as n from temo.movimientos_efectivo where id_transferencia=$1',[id])).rows[0].n,
        audit:(await c.query("select count(*)::int as n from temo.bitacora where tabla='transferencias' and id_registro=$1",[id])).rows[0].n};
    };
    await t.test('migration is repeatable and never resets counters or existing receipt types',async()=>{
      const id=(await create()).database_id,before=await version(id);
      const sql=require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../../database/init/055_transfer_change_security.sql'),'utf8');
      // Execute inside an enclosing test savepoint, without committing the fixture transaction.
      await c.query(sql.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
      await c.query(sql.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,''));
      assert.equal(await version(id),before);
    });
    if(process.env.TEMO_TEST_RESTRICTED_ROLE==='1')await require('./helpers/restricted-role.cjs').useRestrictedPreviewRole(c);
    await t.test('old edit/void versions cannot overwrite newer state; confirmed edit retries apply once',async()=>{
      const id=(await create()).database_id,old=await version(id),requestId=randomUUID();
      const edit={...input(200),expectedVersion:old,requestId};
      const result=await transfers.update(id,edit,a.actor),after=await state(id);
      assert.notEqual(after.version,old);
      assert.deepEqual(await transfers.update(id,edit,a.actor),JSON.parse(JSON.stringify(result)));assert.deepEqual(await state(id),after);
      await assert.rejects(transfers.update(id,{...input(300),expectedVersion:old,requestId:randomUUID()},a.actor),stale);
      await assert.rejects(transfers.void(id,'stale QA',a.actor,{requestId:randomUUID(),expectedVersion:old}),stale);
      await assert.rejects(transfers.update(id,{...edit,amount:300,cashLines:counts(3).NIO},a.actor),error=>error.getStatus()===409);
      assert.deepEqual(await state(id),after);
    });
    await t.test('confirmed receipt identity includes the record and cannot be reused for another transfer',async()=>{
      const first=(await create()).database_id,second=(await create()).database_id;
      const requestId=randomUUID(),payload={...input(200),requestId};
      await transfers.update(first,payload,a.actor);const before=await state(second);
      await assert.rejects(transfers.update(second,payload,a.actor),error=>error.getStatus()===409);
      assert.deepEqual(await state(second),before);
    });
    await t.test('confirmed replies still revalidate the actor and current transfer access',async()=>{
      const id=(await create()).database_id,edit={...input(200),requestId:randomUUID(),expectedVersion:await version(id)};
      await transfers.update(id,edit,a.actor);const before=await state(id);
      await c.query('update temo.usuarios set version_sesion=version_sesion+1 where id_usuario=$1',[a.actor.id]);
      await assert.rejects(transfers.update(id,edit,a.actor),error=>error.getStatus()===403);
      await c.query('update temo.usuarios set version_sesion=$2 where id_usuario=$1',[a.actor.id,a.actor.sessionVersion]);
      await c.query('update temo.usuarios set debe_cambiar_contrasena=true where id_usuario=$1',[a.actor.id]);
      await assert.rejects(transfers.update(id,edit,a.actor),error=>error.getStatus()===403);
      await c.query('update temo.usuarios set debe_cambiar_contrasena=false where id_usuario=$1',[a.actor.id]);
      assert.deepEqual(await state(id),before);
    });
    await t.test('a confirmed void returns its receipt without restoring cash or duplicating audit a second time',async()=>{
      const id=(await create()).database_id,request={requestId:randomUUID(),expectedVersion:await version(id)};
      const result=await transfers.void(id,'QA reason',a.actor,request),after=await state(id);
      assert.deepEqual(await transfers.void(id,'QA reason',a.actor,request),result);assert.deepEqual(await state(id),after);
      await assert.rejects(transfers.void(id,'changed reason',a.actor,request),error=>error.getStatus()===409);
      assert.deepEqual(await state(id),after);
    });
    await t.test('linked denominations invalidate an open editor; ordinary reads and another transfer do not',async()=>{
      const id=(await create()).database_id,v=await version(id);
      await transfers.detail(id,a.actor);await transfers.list(a.actor);await create();assert.equal(await version(id),v);
      await c.query('update temo.transferencias_denominaciones set sueltos=sueltos where id_transferencia=$1',[id]);
      assert.notEqual(await version(id),v);
      const detail=await transfers.detail(id,a.actor);assert.equal(detail.cashLines[0].loose,1);assert.equal(typeof detail.edit_version,'string');
      await assert.rejects(transfers.update(id,{...input(200),expectedVersion:v},a.actor),stale);
    });
    await t.test('actor revocation, other owner, submitted shift and moving the transfer are rejected without effects',async()=>{
      const id=(await create()).database_id,v=await version(id),before=await state(id);
      await assert.rejects(transfers.update(id,{...input(200),expectedVersion:v},b.actor),error=>error.getStatus()===403);
      await assert.rejects(transfers.update(id,{...input(200),shiftId:b.shift.database_id,expectedVersion:v},admin),error=>error.getStatus()===403);
      await c.query('update temo.usuarios set version_sesion=version_sesion+1 where id_usuario=$1',[a.actor.id]);
      await assert.rejects(transfers.update(id,{...input(200),requestId:randomUUID()},a.actor),error=>error.getStatus()===403);
      await c.query('update temo.usuarios set version_sesion=$2 where id_usuario=$1',[a.actor.id,a.actor.sessionVersion]);
      await shifts.requestClose(a.shift.database_id,a.actor);
      await assert.rejects(transfers.update(id,input(200),a.actor),error=>error.getStatus()===409);
      await shifts.cancelClose(a.shift.database_id,a.actor);
      assert.deepEqual(await state(id),before);
    });
    await t.test('audit and receipt errors roll back both edits and voids, including version and funds',async()=>{
      for(const fault of ['audit','receipt'])for(const operation of ['edit','void']){
        const id=(await create()).database_id,before=await state(id);failure=fault;
        try{await assert.rejects(operation==='edit'?transfers.update(id,{...input(200),requestId:randomUUID(),expectedVersion:before.version},a.actor)
          :transfers.void(id,'QA reason',a.actor,{requestId:randomUUID(),expectedVersion:before.version}));}finally{failure='';}
        assert.deepEqual(await state(id),before);
      }
    });
    await t.test('administrator and transfer operator preserve digital permissions without touching cash',async()=>{
      const account=(await c.query(`select cb.id_cuenta as id from temo.cuentas_bancarias cb join temo.monedas m using(id_moneda)
        where cb.estado='ACTIVO' and m.codigo='NIO' and (not exists(select 1 from temo.cuentas_sucursales cs where cs.id_cuenta=cb.id_cuenta)
        or exists(select 1 from temo.cuentas_sucursales cs where cs.id_cuenta=cb.id_cuenta and cs.id_sucursal=$1)) limit 1`,[branch.id])).rows[0];
      assert.ok(account);
      const operator=(await c.query(`insert into temo.usuarios(id_rol,nombres,apellidos,usuario,contrasena_hash,estado,debe_cambiar_contrasena)
        select id_rol,'Operator','QA',$1,'not-a-login-credential','ACTIVO',false from temo.roles where codigo='TRANSFERISTA'
        returning id_usuario as id,version_sesion as "sessionVersion"`,['operator_'+randomUUID().replaceAll('-','')])).rows[0];operator.roleCode='TRANSFERISTA';
      for(const actor of [admin,operator]){
        const before=(await shifts.detail(a.shift.database_id,a.actor)).cashCounts;
        const payload=transferSchema.parse({...input(100),type:'DIGITAL',direction:'INGRESO',accountId:account.id,cashLines:[]});
        const created=await transfers.create(payload,actor),expectedVersion=created.edit_version;
        await transfers.update(created.database_id,{...payload,amount:200,expectedVersion,requestId:randomUUID()},actor);
        const row=await transfers.detail(created.database_id,actor);
        await transfers.void(row.database_id,'digital QA',actor,{requestId:randomUUID(),expectedVersion:row.edit_version});
        assert.deepEqual((await shifts.detail(a.shift.database_id,a.actor)).cashCounts,before);
      }
    });
    await t.test('transfer audit is readable and whitelisted, including amount, reason and cash quantities',async()=>{
      const id=(await create()).database_id;await transfers.update(id,input(200),a.actor);await transfers.void(id,'QA reason',a.actor);
      const rows=(await c.query("select accion,datos_anteriores,datos_nuevos from temo.bitacora where tabla='transferencias' and id_registro=$1 order by numero_auditoria",[id])).rows;
      assert.deepEqual(rows.map(row=>row.accion),['CREAR','ACTUALIZAR','ANULAR']);
      const changes=auditChanges('transferencias',rows[1].datos_anteriores,rows[1].datos_nuevos).changes;
      assert.ok(changes.some(row=>row.field==='Monto'&&row.before==='100'&&row.after==='200'));
      assert.ok(changes.some(row=>row.field.includes('C$ 100')&&row.before==='1 unidades'&&row.after==='2 unidades'));
      assert.ok(!JSON.stringify(rows).includes('not-a-login-credential'));
    });
  }finally{await c.query('rollback');await c.end();}
});
