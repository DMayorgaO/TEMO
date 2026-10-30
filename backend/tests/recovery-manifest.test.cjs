const test = require('node:test');
const assert = require('node:assert/strict');

test('portable NOT NULL comparison still detects nullable columns and changed CHECK rules',
  { skip: !process.env.TEMO_TEST_PREVIEW }, async () => {
    const { Client } = require('pg');
    const { randomUUID } = require('node:crypto');
    const { captureRecoveryManifest, assertRecoveryManifest, quoteRecoveryIdentifier } = await import('../../scripts/lib/recovery-manifest.mjs');
    const c = new Client({ host: '127.0.0.1', port: 55433, database: 'temo_preview', user: 'temo_preview', ssl: false });
    const name = 'qa_not_null_' + randomUUID().replaceAll('-', '');
    const table = quoteRecoveryIdentifier(name);
    await c.connect(); await c.query('begin');
    try {
      await c.query(`create table temo.${table}(value integer not null constraint positive check(value>0))`);
      const strict = await captureRecoveryManifest(c);
      const portable = await captureRecoveryManifest(c, { portableNotNull: true });
      assert.ok(strict.structureEntries.some(row => row.kind === 'constraint' && row.name.startsWith(name + '.') && row.name.endsWith('_not_null')));
      assert.ok(!portable.structureEntries.some(row => row.kind === 'constraint' && row.name.startsWith(name + '.') && row.name.endsWith('_not_null')));
      await c.query(`alter table temo.${table} alter column value drop not null`);
      await assert.rejects(async () => assertRecoveryManifest(portable, await captureRecoveryManifest(c, { portableNotNull: true })), /RECOVERY_STRUCTURE_MISMATCH/);
      await c.query(`alter table temo.${table} alter column value set not null`);
      await c.query(`alter table temo.${table} drop constraint positive,add constraint positive check(value>=0)`);
      await assert.rejects(async () => assertRecoveryManifest(portable, await captureRecoveryManifest(c, { portableNotNull: true })), /RECOVERY_STRUCTURE_MISMATCH/);
    } finally { await c.query('rollback'); await c.end(); }
  });

test('recovery comparison rejects changed data, schema and manifest origin', async () => {
  const { assertRecoveryManifest } = await import('../../scripts/lib/recovery-manifest.mjs');
  const base = { format: 2, environment: 'preview-only', serverMajor: 18, structureDigest: 'a', sequences: [],
    structuralItems: 1, structureEntries: [{ kind: 'column', name: 'test.id', digest: 'a' }],
    tables: [{ name: 'test', rows: '1', digest: 'a' }] };
  assert.doesNotThrow(() => assertRecoveryManifest(base, structuredClone(base)));
  for (const changed of [{ ...base, tables: [] }, { ...base, structureDigest: 'b' },
    { ...base, serverMajor: 17 }, { ...base, environment: 'production' }, null]) {
    assert.throws(() => assertRecoveryManifest(changed, base), /RECOVERY_/);
  }
  for (const changed of [{ ...base, format: 1 }, { ...base, environment: 'production' }, null]) {
    assert.throws(() => assertRecoveryManifest(base, changed), /RECOVERY_FORMAT_MISMATCH/);
  }
});

test('recovery identifiers reject SQL and non-string values', async () => {
  const { quoteRecoveryIdentifier } = await import('../../scripts/lib/recovery-manifest.mjs');
  assert.equal(quoteRecoveryIdentifier('bitacora'), '"bitacora"');
  for (const value of ['a;drop table b', 'a.b', 'a"', '', 'a'.repeat(64), null, {}]) {
    assert.throws(() => quoteRecoveryIdentifier(value));
  }
});

test('recovery refuses changed sequence values, called flags, missing sequences and legacy manifests', async () => {
  const { assertRecoverySequences, assertRecoveryManifest } = await import('../../scripts/lib/recovery-manifest.mjs');
  const sequences = [{ name: 'probe_seq', lastValue: '9007199254740993', called: false }];
  assert.doesNotThrow(() => assertRecoverySequences(sequences, structuredClone(sequences)));
  for (const changed of [[], null, [{ ...sequences[0], lastValue: '9007199254740994' }],
    [{ ...sequences[0], called: true }], [{ ...sequences[0], name: 'other_seq' }]]) {
    assert.throws(() => assertRecoverySequences(sequences, changed), /RECOVERY_SEQUENCE_MISMATCH/);
  }
  const base = { format: 2, environment: 'preview-only', serverMajor: 18, structureDigest: 'a',
    structuralItems: 0, structureEntries: [], tables: [], sequences };
  assert.throws(() => assertRecoveryManifest(base, { ...base, sequences: [] }), /RECOVERY_SEQUENCE_MISMATCH/);
  assert.throws(() => assertRecoveryManifest({ ...base, format: 1 }, base), /RECOVERY_FORMAT_MISMATCH/);
});

test('preview manifest detects changed view definitions and sequence state without allocating existing counters',
  { skip: !process.env.TEMO_TEST_PREVIEW }, async () => {
    const { Client } = require('pg');
    const { randomUUID } = require('node:crypto');
    const { captureRecoveryManifest, assertRecoveryManifest, quoteRecoveryIdentifier } = await import('../../scripts/lib/recovery-manifest.mjs');
    const client = new Client({ host: '127.0.0.1', port: 55433, database: 'temo_preview', user: 'temo_preview', ssl: false });
    const suffix = randomUUID().replaceAll('-', '');
    const sequence = quoteRecoveryIdentifier(`recovery_seq_${suffix}`);
    const view = quoteRecoveryIdentifier(`recovery_view_${suffix}`);
    // Other regression workers legitimately advance demo counters (even on rollback).
    // Scope this test's state assertions to its own sequence; the backup verifier remains exhaustive.
    const fixtureState = manifest => ({ ...manifest,
      sequences: manifest.sequences.filter(row => row.name === `recovery_seq_${suffix}`) });
    await client.connect();
    try {
      await client.query('begin isolation level repeatable read');
      await client.query('set local search_path=temo,public,extensions');
      await client.query(`create sequence temo.${sequence} start 9007199254740993`);
      await client.query(`create view temo.${view} as select 1 as value`);
      const before = fixtureState(await captureRecoveryManifest(client));
      const again = fixtureState(await captureRecoveryManifest(client));
      assertRecoveryManifest(before, again);
      const state = before.sequences.find(row => row.name === `recovery_seq_${suffix}`);
      assert.deepEqual(state, { name: `recovery_seq_${suffix}`, lastValue: '9007199254740993', called: false });
      // Only the newly created fixture sequence advances; rollback removes the fixture itself.
      await client.query(`select nextval('temo.${sequence}')`);
      const advanced = fixtureState(await captureRecoveryManifest(client));
      assert.throws(() => assertRecoveryManifest(before, advanced), /RECOVERY_SEQUENCE_MISMATCH/);
      await client.query(`create or replace view temo.${view} as select 2 as value`);
      const changedView = fixtureState(await captureRecoveryManifest(client));
      assert.throws(() => assertRecoveryManifest(advanced, changedView), /RECOVERY_STRUCTURE_MISMATCH/);
    } finally {
      await client.query('rollback');
      await client.end();
    }
  });

test('only allowlisted exact equivalent PostgreSQL CHECK representations are normalized, altered rules remain different', async () => {
  const { normalizeRecoveryDefinition } = await import('../../scripts/lib/recovery-manifest.mjs');
  const reparsed = { kind: 'constraint', name: 'notificaciones_usuarios.ck_notificaciones_tipo',
    definition: "CHECK (((tipo)::text = ANY (ARRAY[('PENDIENTE_PAGADO'::character varying)::text, ('TRANSFERENCIA_REGISTRADA'::character varying)::text])))" };
  const normalized = normalizeRecoveryDefinition(reparsed);
  assert.notEqual(normalized.definition, reparsed.definition);
  for (const entry of [{ ...reparsed, definition: reparsed.definition.replace('PENDIENTE_PAGADO', 'OTHER') },
    { ...reparsed, name: 'other.ck_notificaciones_tipo' }, { ...reparsed, kind: 'function' },
    { ...reparsed, definition: 'CHECK (true)' }, { ...reparsed, name: '__proto__' }]) {
    assert.deepEqual(normalizeRecoveryDefinition(entry), entry);
  }
  assert.deepEqual(normalizeRecoveryDefinition(normalized), normalized);
  const state = { kind: 'constraint', name: 'solicitudes_cierre_turno.solicitudes_cierre_turno_estado_check',
    definition: "CHECK (((estado)::text = ANY (ARRAY[('PENDIENTE'::character varying)::text, ('ATENDIDA'::character varying)::text, ('CANCELADA'::character varying)::text])))" };
  assert.equal(normalizeRecoveryDefinition(state).definition,
    "CHECK (((estado)::text = ANY ((ARRAY['PENDIENTE'::character varying, 'ATENDIDA'::character varying, 'CANCELADA'::character varying])::text[])))");
  const changedState = { ...state, definition: state.definition.replace('CANCELADA', 'OTHER') };
  assert.deepEqual(normalizeRecoveryDefinition(changedState), changedState);
});

test('handover and receipt CHECK normalization preserves every allowed value and rejects drift', async () => {
  const { normalizeRecoveryDefinition } = await import('../../scripts/lib/recovery-manifest.mjs');
  for (const [name,column,values] of [
    ['notificaciones_usuarios.ck_notificaciones_tipo','tipo',['PENDIENTE_PAGADO','TRANSFERENCIA_REGISTRADA','TRASPASO_TURNO']],
    ['solicitudes_financieras.solicitudes_financieras_operacion_check','operacion',[
      'CREAR_TRANSACCIONES','CREAR_TRANSFERENCIA','LIQUIDAR_PENDIENTE','LIQUIDAR_PENDIENTES','EDITAR_TRANSACCION','ANULAR_TRANSACCION','EDITAR_GRUPO']],
    ['solicitudes_financieras.solicitudes_financieras_operacion_check','operacion',[
      'CREAR_TRANSACCIONES','CREAR_TRANSFERENCIA','LIQUIDAR_PENDIENTE','LIQUIDAR_PENDIENTES','EDITAR_TRANSACCION','ANULAR_TRANSACCION','EDITAR_GRUPO','EDITAR_TRANSFERENCIA','ANULAR_TRANSFERENCIA']],
    ['traspasos_turno.traspasos_turno_estado_check','estado',['PENDIENTE','ACEPTADO','RECHAZADO','CANCELADO','VENCIDO']],
    ['traspasos_turno.traspasos_turno_modo_check','modo',['CON_CIERRE','EN_REVISION']],
  ]) {
    const entry={kind:'constraint',name,definition:`CHECK (((${column})::text = ANY (ARRAY[${values.map(v=>`('${v}'::character varying)::text`).join(', ')}])))`};
    const expected=`CHECK (((${column})::text = ANY ((ARRAY[${values.map(v=>`'${v}'::character varying`).join(', ')}])::text[])))`;
    assert.equal(normalizeRecoveryDefinition(entry).definition,expected);
    for(const value of values){
      const changed={...entry,definition:entry.definition.replace(`'${value}'`,`'INVALID'`)};
      assert.deepEqual(normalizeRecoveryDefinition(changed),changed);
    }
    assert.deepEqual(normalizeRecoveryDefinition({...entry,name:'other.check'}),{...entry,name:'other.check'});
    assert.deepEqual(normalizeRecoveryDefinition({...entry,definition:expected}),{...entry,definition:expected});
  }
});
