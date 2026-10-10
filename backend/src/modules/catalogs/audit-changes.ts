const fields: Record<string, Record<string, string>> = {
  seguridad: { evento: 'Evento', metodo: 'Metodo', ruta: 'Operacion solicitada', registro: 'Registro consultado', formato: 'Formato solicitado', apartado: 'Apartado', filas_declaradas: 'Filas declaradas por el navegador', filas_verificadas: 'Filas verificadas por la API' },
  usuarios: { evento: 'Evento', usuario: 'Usuario', nombres: 'Nombres', apellidos: 'Apellidos', correo: 'Correo',
    rol: 'Rol', estado: 'Estado', debe_cambiar_contrasena: 'Cambio de contrasena requerido', version_sesion: 'Version de acceso' },
  roles: { codigo: 'Codigo del rol', nombre: 'Nombre del rol', descripcion: 'Descripcion', estado: 'Estado' },
  entidades_bancarias: { codigo: 'Codigo del banco', nombre_corto: 'Nombre corto', nombre_largo: 'Nombre del banco', tipo: 'Tipo de entidad', estado: 'Estado' },
  sucursales: { codigo: 'Codigo', nombre: 'Sucursal', estado: 'Estado' },
  cuentas_bancarias: { alias: 'Cuenta', banco: 'Banco', moneda: 'Moneda', estado: 'Estado', id_entidad: 'ID del banco', id_moneda: 'ID de moneda',
    numero_cuenta_enmascarado: 'Numero de cuenta (oculto)', numero_cuenta_modificado: 'Numero de cuenta cambiado' },
  movimientos: { codigo: 'Codigo', nombre: 'Movimiento', estado: 'Estado' },
  catalog_link: { nombre: 'Asignacion' },
  catalog_mapping: { cuenta: 'Cuenta', movimiento: 'Movimiento', codigo: 'Codigo operativo', nombre: 'Nombre operativo', prioridad: 'Prioridad', estado: 'Estado',
    afecta_efectivo: 'Afecta efectivo', direccion_efectivo: 'Direccion de efectivo', afecta_cuenta: 'Afecta cuenta', direccion_cuenta: 'Direccion de cuenta',
    genera_pendiente: 'Genera pendiente', tipo_pendiente: 'Tipo de pendiente', requiere_contraparte: 'Requiere contraparte',
    permite_conversion: 'Permite conversion', permite_credito: 'Permite credito' },
  reglas_comisiones: { banco: 'Banco', moneda: 'Moneda', movimiento: 'Movimiento', moneda_comision: 'Moneda de comision',
    tipo_calculo: 'Tipo de calculo', porcentaje: 'Porcentaje', monto_fijo: 'Monto fijo', rango_inicio: 'Inicio del rango', rango_fin: 'Fin del rango', estado: 'Estado',
    id_entidad: 'ID del banco', id_moneda: 'ID de moneda', id_movimiento: 'ID del movimiento', id_moneda_comision: 'ID de moneda de comision' },
  transacciones: { estado: 'Estado', amount: 'Monto', currencyCode: 'Moneda', entityCode: 'Banco', movementCode: 'Movimiento', 'rates.buy': 'Tasa de compra', 'rates.sell': 'Tasa de venta' },
  pagos_pendientes: { estado: 'Estado', saldo_pendiente: 'Saldo pendiente', monto_original: 'Monto original' },
  abonos_pendientes: { monto: 'Monto', amount: 'Monto solicitado', estado: 'Estado', currencyCode: 'Moneda', entityCode: 'Banco', movementCode: 'Movimiento' },
  grupos_transacciones: { codigoOperacion: 'Operacion', cantidadTransacciones: 'Cantidad de transacciones', preferential: 'Tasa preferencial' },
  turnos: { estado: 'Estado' },
};

export function auditChanges(entity: string, before: unknown, after: unknown) {
  const object = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const previous = object(before);
  const next = object(after);
  const scalar = (value: unknown) => value === null || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'string';
  const display = (value: unknown) => value === null ? 'Sin valor' : String(value).slice(0, 300);
  const changes: { field: string; before: string; after: string }[] = [];
  const read = (root: Record<string, unknown>, path: string) => {
    let current: unknown = root;
    for (const key of path.split('.')) {
      if (current === null || typeof current !== 'object' || Array.isArray(current)
        || !Object.prototype.hasOwnProperty.call(current, key)) return { present: false, value: undefined };
      current = (current as Record<string, unknown>)[key];
    }
    return { present: scalar(current), value: current };
  };
  for (const [key, label] of Object.entries(fields[entity] ?? {})) {
    const old = read(previous, key);
    const updated = read(next, key);
    const hasBefore = old.present;
    const hasAfter = updated.present;
    if (!hasBefore && !hasAfter) continue;
    if (hasBefore && hasAfter && old.value === updated.value) continue;
    changes.push({ field: label, before: hasBefore ? display(old.value) : 'No registrado', after: hasAfter ? display(updated.value) : 'No registrado' });
  }
  if (entity === 'transacciones') {
    const shared = object(previous.settlement).independent === false || object(next.settlement).independent === false;
    for (const [section, label] of [['primaryCounts', 'Efectivo principal'], ['changeCounts', 'Vuelto']] as const) {
      for (const currency of ['NIO', 'USD']) {
        const old = cashDenominations(object(previous.settlement), section, currency);
        const updated = cashDenominations(object(next.settlement), section, currency);
        const denominations = [...new Set([...old.values.keys(), ...updated.values.keys()])].sort((a, b) => b - a);
        for (const denomination of denominations) {
          const oldCount = old.available ? old.values.get(denomination) ?? 0 : null;
          const newCount = updated.available ? updated.values.get(denomination) ?? 0 : null;
          if (oldCount === newCount) continue;
          changes.push({ field: `${label} ${currency === 'NIO' ? 'C$' : '$'} ${denomination}${shared ? ' (conteo compartido del grupo)' : ''}`,
            before: oldCount === null ? 'No registrado' : `${oldCount} unidades`,
            after: newCount === null ? 'No registrado' : `${newCount} unidades` });
        }
      }
    }
  }
  const catalogCollections: Record<string, [string, string, string][]> = {
    sucursales: [['cajeros', 'Usuario asignado', 'catalog_link'], ['cuentas', 'Cuenta asignada', 'catalog_link']],
    cuentas_bancarias: [['sucursales', 'Sucursal asignada', 'catalog_link'], ['vinculos', 'Vinculo operativo', 'catalog_mapping']],
    movimientos: [['vinculos', 'Vinculo operativo', 'catalog_mapping']],
  };
  for (const [key, label, childEntity] of catalogCollections[entity] ?? []) {
    const members = (value: unknown) => {
      if (!Array.isArray(value) || value.length > 1000) return null;
      const result = new Map<string, Record<string, unknown>>();
      for (const row of value) {
        if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string'
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id)
          || result.has(row.id)) return null;
        result.set(row.id, row);
      }
      return result;
    };
    const old = members(previous[key]), updated = members(next[key]);
    if (!old && !updated) continue;
    if ((!old && before != null) || (!updated && after != null)) {
      changes.push({ field: label, before: old ? `${old.size} registros` : 'No registrado o no comparable',
        after: updated ? `${updated.size} registros` : 'No registrado o no comparable' });
      continue;
    }
    for (const id of new Set([...(old?.keys() ?? []), ...(updated?.keys() ?? [])])) {
      const previousRow = old?.get(id), nextRow = updated?.get(id);
      if (!previousRow || !nextRow) {
        changes.push({ field: `${label} (${id})`, before: previousRow ? 'Asignado' : 'Sin asignacion', after: nextRow ? 'Asignado' : 'Sin asignacion' });
      }
      for (const change of auditChanges(childEntity, previousRow, nextRow).changes) {
        changes.push({ ...change, field: `${label} (${id}) - ${change.field}` });
      }
    }
  }
  if (entity === 'grupos_transacciones') {
    const members = (value: unknown) => {
      const result = new Map<string, Record<string, unknown>>();
      if (!Array.isArray(value) || value.length > 20) return result;
      for (const item of value) {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string'
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)
          || result.has(item.id)) return new Map<string, Record<string, unknown>>();
        result.set(item.id, item);
      }
      return result;
    };
    const old = members(previous.auditTransactions);
    const updated = members(next.auditTransactions);
    for (const id of new Set([...old.keys(), ...updated.keys()])) {
      const member = updated.get(id) ?? old.get(id)!;
      const order = Number.isSafeInteger(member.order) && Number(member.order) > 0 ? member.order : '?';
      for (const change of auditChanges('transacciones', old.get(id), updated.get(id)).changes) {
        changes.push({ ...change, field: `Pestana ${order} (${id}) - ${change.field}` });
      }
    }
  }
  if (entity === 'correcciones_transacciones_cerradas') {
    changes.push(...auditChanges('transacciones', previous.auditTransaction, next.auditTransaction).changes);
    changes.push({ field: 'Efecto sobre el cierre original', before: 'Conservado', after: 'Conservado (solo correccion del registro)' });
  }
  return { hasBefore: before !== null && before !== undefined, hasAfter: after !== null && after !== undefined, changes };
}

function cashDenominations(settlement: Record<string, unknown>, section: string, currency: string) {
  const counts = settlement[section];
  const rows = counts && typeof counts === 'object' && !Array.isArray(counts)
    ? (counts as Record<string, unknown>)[currency] : undefined;
  const values = new Map<number, number>();
  if (!Array.isArray(rows) || rows.length > 100) return { available: false, values };
  for (const row of rows) {
    if (!row || typeof row !== 'object' || typeof row.denomination !== 'number'
      || !Number.isFinite(row.denomination) || row.denomination <= 0
      || !Number.isSafeInteger(row.piles25) || row.piles25 < 0
      || !Number.isSafeInteger(row.loose) || row.loose < 0) return { available: false, values: new Map<number, number>() };
    const total = (values.get(row.denomination) ?? 0) + row.piles25 * 25 + row.loose;
    if (!Number.isSafeInteger(total)) return { available: false, values: new Map<number, number>() };
    values.set(row.denomination, total);
  }
  return { available: true, values };
}
