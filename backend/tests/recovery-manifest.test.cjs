const test = require('node:test');
const assert = require('node:assert/strict');

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

test('only two exact equivalent PostgreSQL CHECK representations are normalized, altered rules remain different', async () => {
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
