import pg from 'pg';

// Intentionally fixed local targets: this fixture must never accept a production URL.
const db = new pg.Client({ connectionString: 'postgresql://temo_preview@127.0.0.1:55433/temo_preview' });
const base = 'http://127.0.0.1:4187/api';
async function api(route, token, body) {
  const response = await fetch(base + route, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(`${route}: ${JSON.stringify(value)}`);
  return value;
}
const counts = (denomination, loose, currency = 'NIO') => ({ NIO: [], USD: [], [currency]: [{ denomination, piles25: 0, loose }] });
const empty = () => ({ NIO: [], USD: [] });
function settlement(kind = 'COMPRA', change = 0) {
  return { primaryRateKind: kind, changeRateKind: 'VENTA', expectedChange: { NIO: change, USD: 0 }, primaryCounts: empty(), changeCounts: change ? counts(100, 1) : empty() };
}
await db.connect();
try {
  if ((await db.query("select 1 from temo.transacciones where descripcion='DEMO: grupo de tres transacciones'")).rowCount) {
    console.log('El grupo de ejemplo ya existe; no se duplico.');
  } else {
    const admin = await api('/auth/login', null, { username: 'admin.pruebas', password: 'TemoPruebas2026!' });
    const cashier = await api('/auth/login', null, { username: 'cajero.pruebas', password: 'TemoPruebas2026!' });
    let shift = (await db.query("select id_turno from temo.turnos where id_cajero=$1 and estado='ABIERTO'", [cashier.user.id])).rows[0];
    if (!shift) {
      const branch = (await db.query('select id_sucursal,nombre from temo.sucursales order by fecha_creacion limit 1')).rows[0];
      await api('/shifts', admin.token, {
        branchId: branch.id_sucursal, branch: branch.nombre, register: 'Caja PRUEBAS', cashier: 'cajero.pruebas',
        notes: 'DATOS FICTICIOS: turno para validar desarrollo',
        counts: { NIO: [...counts(1000, 20).NIO, ...counts(100, 20).NIO], USD: counts(100, 20, 'USD').USD }, balances: [],
      });
      shift = (await db.query("select id_turno from temo.turnos where id_cajero=$1 and estado='ABIERTO'", [cashier.user.id])).rows[0];
    }
    const row = (movementCode, amount, cash) => ({ entityCode: 'BAC', movementCode, currencyCode: 'NIO', amount, description: 'DEMO: grupo de tres transacciones', settlement: cash });
    await api('/transactions/batch', cashier.token, {
      shiftId: shift.id_turno, rates: { buy: 36.4, sell: 37 },
      transactions: [row('RE', 1000, settlement('VENTA')), row('DC', 600, settlement()), row('DC', 300, settlement('COMPRA', 100))],
      settlement: settlement(),
    });
    console.log('Creado: retiro C$ 1,000; depositos C$ 600 y C$ 300; vuelto C$ 100.');
  }
  console.log((await db.query(`select concat('TRA-',lpad(g.codigo_operacion::text,6,'0'),'-',lpad(t.orden_grupo::text,2,'0')) as id
    from temo.transacciones t join temo.grupos_transacciones g using(id_grupo_transacciones)
    where t.descripcion='DEMO: grupo de tres transacciones' order by t.orden_grupo`)).rows);
} finally { await db.end(); }
