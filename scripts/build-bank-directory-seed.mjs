import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inputPath = path.join(root, 'logs', 'bank-directory-inspection.ndjson');
const jsonPath = path.join(root, 'database', 'seeds', 'frequent-recipients.initial.json');
const sqlPath = path.join(root, 'database', 'local-seeds', 'frequent-recipients.initial.sql');

const lines = fs.readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const rowsBySheet = new Map();
for (const item of lines.filter((item) => item.kind === 'row')) {
  if (!rowsBySheet.has(item.sheet)) rowsBySheet.set(item.sheet, []);
  rowsBySheet.get(item.sheet).push(item);
}

const ignoredSheets = new Set(['Menu', 'Buscador', 'Consolidado']);
const records = [];

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeKey(value) {
  return clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/gi, ' ').trim().toUpperCase();
}

function cleanName(value) {
  return clean(value)
    .replace(/\s+(CORDOBAS|CÓRDOBAS|DOLARES|DÓLARES|DOLAR|DÓLAR|C\$|\$\$)$/i, '')
    .replace(/[-–]\s*(CORDOBAS|CÓRDOBAS|DOLARES|DÓLARES)$/i, '')
    .trim();
}

function currencyFrom(...values) {
  const text = values.map(clean).join(' ');
  if (/D[ÓO]LAR|\$\$|(^|\s)USD(\s|$)|\/\s*\$\s*\d/i.test(text)) return 'USD';
  if (/C[ÓO]RDOBA|C\$|NIO/i.test(text)) return 'NIO';
  return null;
}

function formatIdentifier(value) {
  const raw = clean(value).replace(/\s+/g, '');
  if (!raw) return '';
  if (/^[*]?[A-Za-z0-9]+$/.test(raw) && raw.replace('*', '').length >= 7) {
    const prefix = raw.startsWith('*') ? '*' : '';
    const body = raw.replace('*', '');
    const groups = [];
    let cursor = body.length;
    while (cursor > 4) {
      groups.unshift(body.slice(Math.max(0, cursor - 4), cursor));
      cursor -= 4;
    }
    if (cursor > 0) groups.unshift(body.slice(0, cursor));
    return prefix + groups.join('-');
  }
  return raw.replace(/-{2,}/g, '-');
}

const identityPattern = /\b\d{3}[- ]?\d{6}[- ]?\d{4}[A-Za-zª]\b/gi;

function formatIdentity(value) {
  const compact = clean(value).replace(/[^0-9A-Za-zª]/g, '').toUpperCase().replace(/ª/g, 'A');
  if (!/^\d{13}[A-Z]$/.test(compact)) return '';
  return `${compact.slice(0, 3)}-${compact.slice(3, 9)}-${compact.slice(9)}`;
}

function extractIdentities(text) {
  return [...clean(text).matchAll(identityPattern)].map((match) => formatIdentity(match[0])).filter(Boolean);
}

function extractReferences(text) {
  const source = clean(text);
  const values = [];
  for (const match of source.matchAll(/\b(?:REF(?:ERENCIA)?|PIN)\s*[:\-]?\s*([A-Za-z0-9][A-Za-z0-9/-]*)/gi)) {
    if (match[1]) {
      values.push(...match[1].split('/').map((value) => value.trim().toUpperCase()).filter(Boolean));
    }
  }
  return values;
}

function remainingObservation(text, identities, references) {
  let result = clean(text);
  for (const identity of identities) {
    const compact = identity.replace(/-/g, '');
    result = result.replace(new RegExp(identity.replace(/-/g, '[- ]?'), 'ig'), '');
    result = result.replace(new RegExp(compact, 'ig'), '');
  }
  result = result.replace(/\b(?:REF(?:ERENCIA)?|PIN)\s*[:\-]?\s*[A-Za-z0-9][A-Za-z0-9/-]*/gi, '');
  return clean(result.replace(/^[\s/|,;:-]+|[\s/|,;:-]+$/g, ''));
}

function addRecord({ name, institution, type, number, currency, identityText = '', referenceText = '', observations = '', source }) {
  const normalizedName = cleanName(name);
  const normalizedNumber = formatIdentifier(number);
  const identities = [...new Set(extractIdentities(`${identityText} ${observations}`))];
  const references = [...new Set([...extractReferences(identityText), ...extractReferences(referenceText), ...extractReferences(observations)])];
  const residue = remainingObservation(`${identityText} ${referenceText} ${observations}`, identities, references);
  if (!normalizedName || (!normalizedNumber && identities.length === 0 && references.length === 0 && !residue)) return;
  records.push({
    name: normalizedName,
    institution: clean(institution),
    type: clean(type),
    number: normalizedNumber,
    currency: currency ?? currencyFrom(name, identityText, observations) ?? (normalizedNumber ? 'NIO' : null),
    identities,
    references,
    observations: residue,
    source,
  });
}

for (const [sheet, sheetRows] of rowsBySheet) {
  if (ignoredSheets.has(sheet)) continue;
  let previousName = '';
  for (const item of sheetRows) {
    const v = item.values.map(clean);
    if (item.row <= 3 && sheet !== 'Billetera' && sheet !== 'INNSS') continue;
    const source = { sheet, row: item.row, raw: v };
    if (sheet === 'Cédulas') {
      addRecord({ name: v[2], institution: '', type: 'Cédula', identityText: v[3], source });
      continue;
    }
    if (/^Cuentas (Bancarias )?Bac/i.test(sheet)) {
      const name = cleanName(v[2]) || previousName;
      if (cleanName(v[2])) previousName = cleanName(v[2]);
      addRecord({ name, institution: 'BAC', type: 'Cuenta bancaria', number: v[3], currency: currencyFrom(v[2]), identityText: v[4], observations: [v[5], v[6]].filter(Boolean).join(' '), source });
      continue;
    }
    if (/^Cuentas (Bancarias )?Banpro/i.test(sheet)) {
      const name = cleanName(v[2]) || previousName;
      if (cleanName(v[2])) previousName = cleanName(v[2]);
      addRecord({ name, institution: 'BANPRO', type: 'Cuenta bancaria', number: v[3], currency: currencyFrom(v[2]), identityText: v[4], source });
      continue;
    }
    if (/^Cuentas (Bancarias )?LaFise/i.test(sheet)) {
      const offset = sheet.startsWith('Cuentas Bancarias') ? 1 : 0;
      const name = cleanName(v[1 + offset]) || previousName;
      if (cleanName(v[1 + offset])) previousName = cleanName(v[1 + offset]);
      addRecord({ name, institution: 'LAFISE', type: 'Cuenta bancaria', number: v[2 + offset], currency: currencyFrom(v[1 + offset]), identityText: v[3 + offset], observations: v[4 + offset], source });
      continue;
    }
    if (sheet === 'Claro') {
      addRecord({ name: v[2], institution: 'CLARO', type: v[3] || 'Contrato Claro', number: v[4], source });
      continue;
    }
    if (sheet === 'Tigo') {
      addRecord({ name: v[1], institution: 'TIGO', type: v[2] || 'Servicio Tigo', number: v[3].replace(/^CLIENTE\s*/i, ''), identityText: v[3], source });
      continue;
    }
    if (sheet === 'Agua y Luz') {
      addRecord({ name: v[2], institution: /AGUA/i.test(v[3]) ? 'ENACAL' : 'DISSUR', type: v[3] || 'Contrato de servicio', number: v[4], source });
      continue;
    }
    if (sheet === 'Casa Visión') {
      addRecord({ name: v[1], institution: 'CASA VISIÓN', type: 'Código de contrato', number: v[2], source });
      continue;
    }
    if (sheet === 'Mi Familia') {
      addRecord({ name: v[1], institution: 'MI FAMILIA', type: 'Código de préstamo', number: v[2], identityText: v[3], observations: `${v[4] ? `Teléfono ${v[4]}` : ''} ${v[5] ? `Monto ${v[5]}` : ''}`, source });
      continue;
    }
    if (sheet === 'Loto') {
      addRecord({ name: v[2], institution: 'LOTO NICARAGUA', type: 'Código Loto', number: v[3], identityText: `${v[4]} ${v[5]}`, source });
      continue;
    }
    if (sheet === 'Instacredit') {
      addRecord({ name: v[1], institution: 'INSTACREDIT', type: 'Préstamo', identityText: v[2], source });
      continue;
    }
    if (sheet === 'YOTA') {
      addRecord({ name: v[2], institution: 'YOTA', type: 'Número Yota', number: v[3], currency: currencyFrom(v[4]), identityText: v[4], source });
      continue;
    }
    if (sheet === 'Billetera' && item.row > 1) {
      const identities = extractIdentities(v[0]);
      const name = clean(v[0].replace(identityPattern, '').replace(/\b(?:PIN|CEDULA)\b.*$/i, '').replace(/[-–]+$/g, ''));
      const number = /^\d{3}[- ]?\d{6}/.test(v[1]) ? '' : v[1];
      addRecord({ name: name || previousName, institution: 'BILLETERA MÓVIL', type: 'Número telefónico', number, identityText: `${v[0]} ${v[1]}`, referenceText: v[0], observations: identities.length ? '' : v[0], source });
      if (name) previousName = name;
      continue;
    }
    if (sheet === 'INNSS') {
      const text = v[0];
      const name = clean(text.replace(/^inss/i, '').replace(/\d[\d-]+.*$/i, '')) || `INSS ${item.row}`;
      const number = text.match(/\b\d{6,8}(?:-\d)?\b/)?.[0] ?? '';
      addRecord({ name, institution: 'INSS', type: 'Número de asegurado', number, identityText: text, source });
    }
  }
}

const recipients = new Map();
for (const record of records) {
  const key = normalizeKey(record.name);
  if (!key) continue;
  if (!recipients.has(key)) recipients.set(key, { name: record.name, observations: [], identifiers: [], identities: [], references: [], sources: [] });
  const target = recipients.get(key);
  const identifierKey = normalizeKey(`${record.institution}|${record.type}|${record.number}|${record.currency ?? ''}`);
  if (record.number && !target.identifiers.some((entry) => normalizeKey(`${entry.institution}|${entry.type}|${entry.number}|${entry.currency ?? ''}`) === identifierKey)) {
    target.identifiers.push({ institution: record.institution, type: record.type, number: record.number, currency: record.currency });
  }
  for (const identity of record.identities) if (!target.identities.some((entry) => entry.number === identity)) target.identities.push({ number: identity, holder: '' });
  for (const reference of record.references) if (!target.references.includes(reference)) target.references.push(reference);
  if (record.observations && !target.observations.includes(record.observations)) target.observations.push(record.observations);
  target.sources.push(record.source);
}

const output = [...recipients.values()]
  .filter((recipient) => recipient.identifiers.length || recipient.identities.length || recipient.references.length)
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));

fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
fs.writeFileSync(jsonPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

const compactJson = JSON.stringify(output).replaceAll('$directory$', '$ directory $');
const seedSql = `-- TEMO - Carga inicial del directorio de destinatarios frecuentes.
-- Generado desde DOUMENTO Cuentas Bancarias 2026.xlsb por scripts/build-bank-directory-seed.mjs.
SET search_path TO temo, public;

DO $seed$
DECLARE
  recipient jsonb;
  identifier jsonb;
  identity_item jsonb;
  reference_item jsonb;
  source_item jsonb;
  recipient_id uuid;
  currency_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM migraciones_sistema WHERE codigo = 'LOCAL_FREQUENT_RECIPIENTS_SEED') THEN
    RETURN;
  END IF;

  FOR recipient IN SELECT value FROM jsonb_array_elements($directory$${compactJson}$directory$::jsonb)
  LOOP
    INSERT INTO directorio_destinatarios (nombre, observaciones, estado)
    VALUES (
      recipient->>'name',
      nullif(array_to_string(ARRAY(SELECT jsonb_array_elements_text(recipient->'observations')), E'\\n'), ''),
      'ACTIVO'
    )
    RETURNING id_destinatario INTO recipient_id;

    FOR identifier IN SELECT value FROM jsonb_array_elements(recipient->'identifiers')
    LOOP
      SELECT id_moneda INTO currency_id FROM monedas WHERE codigo = identifier->>'currency';
      INSERT INTO directorio_identificadores (
        id_destinatario, institucion, tipo, numero, id_moneda, orden
      ) VALUES (
        recipient_id, identifier->>'institution', identifier->>'type', identifier->>'number',
        currency_id,
        (SELECT count(*) + 1 FROM directorio_identificadores WHERE id_destinatario = recipient_id)
      );
    END LOOP;

    FOR identity_item IN SELECT value FROM jsonb_array_elements(recipient->'identities')
    LOOP
      INSERT INTO directorio_cedulas (id_destinatario, numero, titular, orden)
      VALUES (
        recipient_id, identity_item->>'number', nullif(identity_item->>'holder', ''),
        (SELECT count(*) + 1 FROM directorio_cedulas WHERE id_destinatario = recipient_id)
      );
    END LOOP;

    FOR reference_item IN SELECT value FROM jsonb_array_elements(recipient->'references')
    LOOP
      INSERT INTO directorio_referencias (id_destinatario, referencia, orden)
      VALUES (
        recipient_id, trim(both '"' from reference_item::text),
        (SELECT count(*) + 1 FROM directorio_referencias WHERE id_destinatario = recipient_id)
      );
    END LOOP;

    FOR source_item IN SELECT value FROM jsonb_array_elements(recipient->'sources')
    LOOP
      INSERT INTO directorio_fuentes_importacion (id_destinatario, hoja, fila, datos_originales)
      VALUES (recipient_id, source_item->>'sheet', (source_item->>'row')::integer, source_item->'raw');
    END LOOP;
  END LOOP;

  INSERT INTO migraciones_sistema (codigo)
  VALUES ('LOCAL_FREQUENT_RECIPIENTS_SEED')
  ON CONFLICT (codigo) DO NOTHING;
END
$seed$;
`;
fs.mkdirSync(path.dirname(sqlPath), { recursive: true });
fs.writeFileSync(sqlPath, seedSql, 'utf8');

const totals = output.reduce((summary, recipient) => ({
  recipients: summary.recipients + 1,
  identifiers: summary.identifiers + recipient.identifiers.length,
  identities: summary.identities + recipient.identities.length,
  references: summary.references + recipient.references.length,
  sources: summary.sources + recipient.sources.length,
}), { recipients: 0, identifiers: 0, identities: 0, references: 0, sources: 0 });

console.log(JSON.stringify({ output: path.relative(root, jsonPath), sql: path.relative(root, sqlPath), ...totals }, null, 2));
