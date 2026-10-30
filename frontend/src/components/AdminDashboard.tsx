import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { CalendarDays, CalendarRange, Download, RefreshCw, SquareCheckBig, X } from 'lucide-react';
import { bankBalances, calendarMonth, cashierCounts, filterCounts, reconciliationRows, reconciliationTotal, selectDayRange, weekdayLabel } from './admin-dashboard-data';
import type { Currency, DashboardData, ReconciliationRow } from './admin-dashboard-data';
import './admin-dashboard.css';
import { downloadExport, exportFilename } from '../utils/export-download';

type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Cell = string | number | { text: string; content: ReactNode };
type TableRow = { id: string; values: Cell[] };
const money = (value: number, currency: Currency) => `${currency === 'NIO' ? 'C$' : '$'} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('es-NI', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const cellText = (value: Cell) => typeof value === 'object' ? value.text : String(value);
const cellContent = (value: Cell) => typeof value === 'object' ? value.content : value;
const currencies: Currency[] = ['NIO', 'USD'];

function ReportTable<T extends TableRow>({ headers, rows, onSelect, selected, footer, hiddenColumns=[] }: {
  headers: string[]; rows: T[]; onSelect?: (id: string, column: number) => void; selected?: string;
  footer?: (visible: T[]) => ReactNode;
  hiddenColumns?: number[];
}) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<number, string>>({});
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const matches = (value: string, query: string) => normalize(value).includes(normalize(query));
  const indices=headers.map((_,index)=>index).filter(index=>!hiddenColumns.includes(index));
  const visible = rows.filter(row => matches(indices.map(index=>cellText(row.values[index])).join(' '), search) && indices.every(index => matches(cellText(row.values[index]), filters[index] || '')));
  return <>
    <input className="report-search" aria-label={`Buscar en ${headers.join(', ')}`} placeholder="Buscar" value={search} onChange={e => setSearch(e.target.value)} />
    <div className="report-table-scroll"><table>
      <thead><tr>{indices.map(index => <th key={headers[index]}>{headers[index]}</th>)}</tr><tr>{indices.map(index => <th key={headers[index]}><input aria-label={`Filtrar ${headers[index]}`} placeholder="Filtrar" value={filters[index] || ''} onChange={e => setFilters({ ...filters, [index]: e.target.value })} /></th>)}</tr></thead>
      <tbody>{visible.map(row => <tr key={row.id} className={selected === row.id ? 'is-selected' : undefined}>{indices.map(index => <td key={index}>{onSelect && index < 2 ? <button onClick={() => onSelect(row.id, index)} title={`Filtrar gráfica por ${cellText(row.values[index])}`}>{cellContent(row.values[index])}</button> : cellContent(row.values[index])}</td>)}</tr>)}
        {!visible.length && <tr><td colSpan={indices.length} className="report-empty">Sin registros</td></tr>}
      </tbody>{footer && <tfoot>{footer(visible)}</tfoot>}
    </table></div>
  </>;
}

function CurrencyAmount({ amount, currency }: { amount: number | null | undefined; currency: Currency }) {
  return <span className={`report-money report-money--${currency.toLowerCase()}`} title={amount == null ? 'Sin saldo registrado para esta cuenta y moneda' : undefined}>{amount == null ? '—' : money(amount, currency)}</span>;
}

function ReconciliationAmounts({ row, field, visibleCurrencies=currencies }: { row: ReconciliationRow; field: 'income' | 'expense' | 'difference'; visibleCurrencies?:Currency[] }) {
  return <div className="report-money-pair">{visibleCurrencies.filter(currency => row.amounts[currency]).map(currency => {
    const amount = row.amounts[currency]![field];
    const state = amount > 0 ? 'receive' : amount < 0 ? 'deposit' : 'balanced';
    return <div key={currency} className={field === 'difference' ? `report-result report-result--${state}` : undefined}>
      <CurrencyAmount amount={amount} currency={currency} />
      {field === 'difference' && amount !== 0 && <small>{amount > 0 ? 'Depósito' : 'Reembolso'}</small>}
    </div>;
  })}</div>;
}

function settlementCell(row: ReconciliationRow, field: 'income' | 'expense' | 'difference', visibleCurrencies=currencies): Cell {
  return { text: visibleCurrencies.filter(currency => row.amounts[currency]).map(currency => {
    const amount = row.amounts[currency]![field];
    return `${money(amount, currency)}${field === 'difference' && amount !== 0 ? ` ${amount > 0 ? 'Depósito' : 'Reembolso'}` : ''}`;
  }).join(' '), content: <ReconciliationAmounts row={row} field={field} visibleCurrencies={visibleCurrencies} /> };
}

export function AdminDashboard({ request }: { request: Request }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [range, setRange] = useState({ from: '', to: '' });
  const [day, setDay] = useState('');
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [hoveredDay, setHoveredDay] = useState<{ day: string; count: number; x: number } | null>(null);
  const drag = useRef<{ start: number; base: string[] } | null>(null);
  const keyboardIndex = useRef(0);
  const [banks, setBanks] = useState<string[]>([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState<Currency[]>([]);
  const [filter, setFilter] = useState<{ branch: string; cashier?: string; label: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const pendingPng = useRef<{ token: string; generation: number } | null>(null);
  const pngBusy = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const exportChart = useRef<(() => HTMLCanvasElement) | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++generation.current;
    setLoading(true);
    const query = new URLSearchParams();
    if (range.from && range.to) { query.set('from', range.from); query.set('to', range.to); }
    if (day) query.set('day', day);
    try {
      const result = await request<DashboardData>(`/shifts/dashboard${query.size ? `?${query}` : ''}`);
      if (id === generation.current) { setData(result); setError(''); }
    } catch (cause) { if (id === generation.current) setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el resumen.'); }
    finally { if (id === generation.current) setLoading(false); }
  }, [request, range, day]);
  useEffect(() => {
    void refresh();
    const update = () => { if (document.visibilityState === 'visible') void refresh(); };
    const interval = window.setInterval(update, 60000);
    window.addEventListener('temo:operational-data-changed', update);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      generation.current++; clearInterval(interval);
      window.removeEventListener('focus', update); window.removeEventListener('temo:operational-data-changed', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [refresh]);

  const filteredCounts = data ? filterCounts(data.counts, banks, selectedCurrencies) : [];
  const visibleCurrencies=selectedCurrencies.length?selectedCurrencies:currencies;
  const hiddenMoneyColumns=(nio:number,usd:number)=>[...(!visibleCurrencies.includes('NIO')?[nio]:[]),...(!visibleCurrencies.includes('USD')?[usd]:[])];
  const visibleSelection = selectedDays.filter(value => data && value >= data.from && value <= data.to);
  const tableDays = visibleSelection.length ? visibleSelection : data ? [day || data.tableDay] : [];
  const selectionKey = JSON.stringify(tableDays);
  const daily = data ? cashierCounts(data, filteredCounts, tableDays) : [];
  const points: { day: string; count: number }[] = [];
  if (data) {
    for (let date = data.from; date <= data.to;) {
      points.push({ day: date, count: filteredCounts.filter(row => row.day === date && (!filter || (row.branch_id === filter.branch && (!filter.cashier || row.cashier_id === filter.cashier)))).reduce((sum, row) => sum + row.total, 0) });
      date = new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
    }
  }
  const chartKey = JSON.stringify(points);
  const chartFilter = [banks.length ? banks.join(', ') : 'Todos los bancos', selectedCurrencies.length ? selectedCurrencies.map(currency => currency === 'NIO' ? 'C$' : '$').join(' + ') : 'C$ + $'].join(' · ');
  useEffect(() => {
    const element = canvas.current; if (!element || !data) return;
    const draw = (target = element, outputWidth = element.clientWidth) => {
      const width = Math.max(280, outputWidth), height = Math.max(250, element.clientHeight), scale = 2;
      target.width = width * scale; target.height = height * scale;
      const ctx = target.getContext('2d'); if (!ctx) return;
      ctx.scale(scale, scale); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
      const fitText = (value: string, y: number) => {
        while (ctx.measureText(value).width > width - 24 && value.length > 1) value = value.slice(0, -2) + '…';
        ctx.fillText(value, 12, y);
      };
      ctx.font = '11px sans-serif'; ctx.fillStyle = '#223b40';
      fitText(`${filter?.label || 'Todas las sucursales'} · ${dateLabel(data.from)} - ${dateLabel(data.to)}`, 16);
      ctx.font = '10px sans-serif'; fitText(chartFilter, 30);
      const values = JSON.parse(chartKey) as typeof points;
      const selection = new Set(JSON.parse(selectionKey) as string[]);
      const top = Math.ceil(Math.max(4, ...values.map(p => p.count)) / 4) * 4;
      const left = 38, right = width - 12, bottom = height - 30;
      const step = (right - left) / Math.max(1, values.length);
      const verticalCounts = step < 24;
      ctx.font = '10px sans-serif';
      const labelRoom = verticalCounts ? Math.ceil(ctx.measureText(String(top)).width) + 10 : 20;
      const chartHeight = bottom - 40 - labelRoom;
      ctx.textAlign = 'right'; ctx.font = '11px sans-serif';
      for (let tick = 0; tick <= 4; tick++) {
        const y = bottom - chartHeight * tick / 4; ctx.strokeStyle = '#e1e9e9'; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
        ctx.fillStyle = '#52676a'; ctx.fillText(String(top * tick / 4), left - 6, y + 4);
      }
      values.forEach((point, index) => {
        const x = left + step * index + step * .2, h = point.count / top * chartHeight;
        if (selection.has(point.day)) {
          ctx.fillStyle = '#e3eff9'; ctx.fillRect(left + step * index, bottom + 3, step, 24);
          ctx.fillStyle = '#1875a1'; ctx.fillRect(left + step * index + 2, bottom + 27, Math.max(1, step - 4), 2);
        }
        if (point.count > 0) {
          ctx.fillStyle = selection.has(point.day) ? '#1875a1' : '#138477'; ctx.fillRect(x, bottom - h, step * .6, h);
        }
        ctx.textAlign = 'center'; ctx.fillStyle = '#203c3c';
        ctx.save(); ctx.font = '10px sans-serif';
        if(verticalCounts){ctx.translate(x + step * .3,bottom - h - 6);ctx.rotate(-Math.PI/2);ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(String(point.count),0,0);}
        else ctx.fillText(String(point.count), x + step * .3, bottom - h - 6);
        ctx.restore();
        ctx.font = '9px sans-serif'; ctx.fillText(weekdayLabel(point.day), x + step * .3, bottom + 13);
        ctx.fillText(point.day.slice(8), x + step * .3, bottom + 25); ctx.font = '11px sans-serif';
      });
    };
    exportChart.current = () => { const target = document.createElement('canvas'); draw(target, Math.max(900, JSON.parse(chartKey).length * 44)); return target; };
    draw(); const observer = new ResizeObserver(() => draw()); observer.observe(element);
    return () => { observer.disconnect(); exportChart.current = null; };
  }, [chartKey, chartFilter, data, filter, selectionKey]);

  const chartIndex = (event: PointerEvent<HTMLCanvasElement>, clamp = false) => {
    const rectangle = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rectangle.left;
    if (!points.length || (!clamp && (x < 38 || x >= rectangle.width - 12 || event.clientY < rectangle.top + 42 || event.clientY > rectangle.bottom))) return -1;
    const index = Math.floor((x - 38) / ((rectangle.width - 50) / points.length));
    return Math.max(0, Math.min(points.length - 1, index));
  };
  const selectRange = (start: number, end: number, base: string[] = []) => {
    setSelectedDays([...new Set([...base, ...selectDayRange(points.map(point => point.day), start, end)])].sort());
  };
  const selectSingleDay = (value: string) => { setSelectedDays([]); setDay(value); };
  useEffect(() => {
    const pending = pendingPng.current;
    if (!pending) return;
    pendingPng.current = null;
    const chart = exportChart.current?.();
    if (!chart) { pngBusy.current = false; setExporting(false); setError('No se pudo preparar la imagen.'); return; }
    chart.toBlob(blob => {
      try {
        if (!blob) throw new Error('No se pudo generar la imagen.');
        if (pending.token !== window.sessionStorage.getItem('temo:auth-token') || pending.generation !== generation.current) {
          throw new Error('La sesion o el rango cambio. Vuelva a exportar la grafica.');
        }
        downloadExport(blob, exportFilename(`transacciones-${data?.from}-${data?.to}`, 'png'));
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo descargar la imagen.'); }
      finally { pngBusy.current = false; setExporting(false); }
    }, 'image/png');
  }, [data]);

  const download = async () => {
    if (pngBusy.current) return;
    pngBusy.current = true; setExporting(true); setError('');
    const token = window.sessionStorage.getItem('temo:auth-token');
    const id = generation.current;
    try {
      if (!token) throw new Error('Inicie sesion nuevamente antes de exportar.');
      const result = await request<DashboardData>('/shifts/dashboard/export', { method: 'POST', body: JSON.stringify({
        ...(range.from && range.to ? { from: range.from, to: range.to } : {}), ...(day ? { day } : {}),
      }) });
      if (token !== window.sessionStorage.getItem('temo:auth-token') || id !== generation.current) throw new Error('La sesion o el rango cambio. Vuelva a exportar.');
      pendingPng.current = { token, generation: id };
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo autorizar la exportacion.');
      pngBusy.current = false; setExporting(false);
    }
  };
  const groupedBalances = data ? bankBalances(data) : [];
  const branchBalances = new Map<string, { name: string; rows: typeof groupedBalances }>();
  groupedBalances.forEach(row => { const group = branchBalances.get(row.branch_id) ?? { name: row.branch, rows: [] }; group.rows.push(row); branchBalances.set(row.branch_id, group); });
  const lafise = new Map<string, { branch: string; cashier: string; nio: number; usd: number }>();
  data?.lafise.forEach(row => {
    const key = `${row.branch_id}:${row.cashier_id}`; const value = lafise.get(key) ?? { branch: row.branch, cashier: row.cashier, nio: 0, usd: 0 };
    value[row.currency === 'NIO' ? 'nio' : 'usd'] += Number(row.difference); lafise.set(key, value);
  });
  const settlements = data ? reconciliationRows(data.reconciliation) : [];
  const toggleBank = (bank: string) => setBanks(previous => previous.includes(bank) ? previous.filter(value => value !== bank) : [...previous, bank]);
  const toggleCurrency = (currency: Currency) => setSelectedCurrencies(previous => previous.includes(currency) ? previous.filter(value => value !== currency) : [...previous, currency]);

  return <section className="admin-report" aria-label="Inicio del Administrador">
    <header className="report-heading"><span>{data ? `Hoy · ${dateLabel(data.today)}` : 'Resumen del día'}</span><button className="icon-button" onClick={() => void refresh()} title="Actualizar" aria-label="Actualizar" disabled={loading}><RefreshCw size={16} /></button></header>
    {error && <p role="alert" className="login-error">{error} {data ? 'Se conservan los últimos datos cargados.' : ''}</p>}
    {!data ? <p role="status">{loading ? 'Cargando resumen…' : 'Resumen no disponible'}</p> : <>
      <div className="report-transaction-filters" aria-label="Filtros de transacciones">
        <div className="report-bank-filters" role="group" aria-label="Bancos">{data.banks.map(bank => <button key={bank} className="report-filter-button" aria-pressed={banks.includes(bank)} onClick={() => toggleBank(bank)}>{bank}</button>)}</div>
        <div className="report-currency-filters" role="group" aria-label="Monedas">{currencies.map(currency => <button key={currency} className={`report-filter-button report-filter-button--${currency.toLowerCase()}`} aria-pressed={selectedCurrencies.includes(currency)} onClick={() => toggleCurrency(currency)}>{currency === 'NIO' ? 'C$' : '$'}</button>)}</div>
        {(banks.length > 0 || selectedCurrencies.length > 0) && <button className="icon-button" title="Limpiar filtros de banco y moneda" aria-label="Limpiar filtros de banco y moneda" onClick={() => { setBanks([]); setSelectedCurrencies([]); }}><X size={16} /></button>}
      </div>
      <div className="report-top">
        <section className="report-section"><header><h2>{tableDays.length > 1 ? `Transacciones de ${tableDays.length} días` : 'Transacciones del día'} <span>{daily.reduce((sum, row) => sum + row.total, 0)}</span></h2></header>
          <div className="report-day-filter"><label>Día<input type="date" aria-label="Día de transacciones" value={tableDays.length === 1 ? tableDays[0] : ''} onChange={e => selectSingleDay(e.target.value)} /></label><button className="report-today-button" aria-pressed={tableDays.length === 1 && tableDays[0] === data.today} onClick={() => selectSingleDay('')}><CalendarDays size={14} />Hoy</button>{tableDays.length > 1 && <span className="report-selection-summary" role="status">{dateLabel(tableDays[0])} - {dateLabel(tableDays[tableDays.length - 1])}</span>}</div>
          <ReportTable hiddenColumns={hiddenMoneyColumns(2,3)} headers={['Sucursal', 'Cajero', 'C$', '$', 'Total']} rows={daily.map(row => ({ id: `${row.branch_id}:${row.cashier_id}`, values: [row.branch, row.cashier, row.nio, row.usd, row.total] }))} selected={filter?.cashier ? `${filter.branch}:${filter.cashier}` : undefined} onSelect={(id, column) => {
            const row = daily.find(row => `${row.branch_id}:${row.cashier_id}` === id)!;
            setFilter({ branch: row.branch_id, cashier: column === 1 ? row.cashier_id : undefined, label: column === 1 ? `${row.branch} · ${row.cashier}` : row.branch });
          }} />
        </section>
        <section className="report-section report-chart"><header><h2>Transacciones por día</h2><div className="report-chart-actions"><button className="icon-button" title="Mes completo" aria-label="Mes completo" aria-pressed={data.from===calendarMonth(data.from).from&&data.to===calendarMonth(data.from).to} disabled={loading} onClick={()=>{setSelectedDays([]);setHoveredDay(null);setRange(calendarMonth(range.from||data.from));}}><CalendarRange size={17}/></button><button className="icon-button" title="Seleccionar todos los días mostrados" aria-label="Seleccionar todos los días mostrados" aria-pressed={points.length > 0 && points.every(point => tableDays.includes(point.day))} disabled={loading || !points.length} onClick={() => setSelectedDays(points.map(point => point.day))}><SquareCheckBig size={17} /></button><button className="icon-button" title="Exportar en PNG" aria-label="Exportar en PNG" disabled={exporting || loading} onClick={() => void download()}><Download size={17} /></button></div></header>
          <div className="report-range"><label>Desde<input type="date" aria-label="Gráfica desde" value={range.from || data.from} onChange={e => { setSelectedDays([]); setHoveredDay(null); setRange({ from: e.target.value, to: range.to || data.to }); }} /></label><label>Hasta<input type="date" aria-label="Gráfica hasta" value={range.to || data.to} onChange={e => { setSelectedDays([]); setHoveredDay(null); setRange({ from: range.from || data.from, to: e.target.value }); }} /></label><button className="icon-button" title="Semana actual" aria-label="Semana actual" onClick={() => { setSelectedDays([]); setHoveredDay(null); setRange({ from: '', to: '' }); }}><CalendarDays size={17} /></button>{filter && <button className="icon-button" title="Quitar filtro de cajero o sucursal" aria-label="Quitar filtro" onClick={() => setFilter(null)}><X size={17} /></button>}</div>
          <div className="report-chart-scroll"><div className="report-chart-surface" style={{ minWidth: Math.max(280, points.length * 14 + 50) }}>
          <canvas ref={canvas} className="report-selectable-chart" tabIndex={0}
            onPointerDown={event => {
              if (loading || event.button !== 0) return;
              const index = chartIndex(event); if (index < 0) return;
              const base = event.ctrlKey || event.metaKey ? tableDays : [];
              drag.current = { start: index, base }; keyboardIndex.current = index;
              event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); event.currentTarget.focus();
              selectRange(index, index, base);
            }}
            onPointerMove={event => {
              const index = chartIndex(event, !!drag.current);
              if (index < 0) { setHoveredDay(null); return; }
              const rectangle = event.currentTarget.getBoundingClientRect();
              setHoveredDay({ ...points[index], x: Math.max(75, Math.min(rectangle.width - 75, event.clientX - rectangle.left)) });
              if (drag.current) selectRange(drag.current.start, index, drag.current.base);
            }}
            onPointerUp={event => { if (drag.current) { const index = chartIndex(event, true); if (index >= 0) selectRange(drag.current.start, index, drag.current.base); } drag.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
            onPointerCancel={() => { drag.current = null; setHoveredDay(null); }} onLostPointerCapture={() => { drag.current = null; }}
            onPointerLeave={() => { if (!drag.current) setHoveredDay(null); }}
            onKeyDown={event => {
              if (loading || !points.length) return;
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault(); const previous = keyboardIndex.current;
                const index = Math.max(0, Math.min(points.length - 1, previous + (event.key === 'ArrowRight' ? 1 : -1)));
                keyboardIndex.current = index; selectRange(index, index, event.shiftKey ? tableDays : []);
              } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const index = Math.min(keyboardIndex.current, points.length - 1); selectRange(index, index); }
              else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); setSelectedDays(points.map(point => point.day)); }
            }}
            aria-label={`Transacciones: ${points.map(p => `${weekdayLabel(p.day)} ${p.day}: ${p.count}${tableDays.includes(p.day) ? ', seleccionado' : ''}`).join('; ')}`} role="img" />
          {hoveredDay && <div className="report-chart-tooltip" role="tooltip" style={{ left: hoveredDay.x }}>{weekdayLabel(hoveredDay.day)} · {hoveredDay.day.split('-').reverse().join('/')}<strong>{hoveredDay.count} transacciones</strong></div>}
          </div></div>
        </section>
      </div>
      <div className="report-bottom">
        <section className="report-section report-bank-balances"><h2>Saldos bancarios</h2><div className="report-branch-tables">{[...branchBalances].map(([id, branch]) => <div key={id} className="report-branch-table"><h3>{branch.name}</h3><ReportTable hiddenColumns={hiddenMoneyColumns(1,2)} headers={['Banco', 'C$', '$']} rows={branch.rows.map(row => ({ id: row.id, values: [row.entity, ...currencies.map(currency => ({ text: row.amounts[currency] == null ? '—' : money(row.amounts[currency]!, currency), content: <CurrencyAmount amount={row.amounts[currency]} currency={currency} /> }))] }))} /></div>)}{!branchBalances.size && <p className="report-empty">Sin cuentas activas</p>}</div></section>
        <section className="report-section"><h2>Diferencias LAFISE</h2><ReportTable hiddenColumns={hiddenMoneyColumns(2,3)} headers={['Sucursal', 'Cajero', 'C$', '$']} rows={[...lafise].map(([id, row]) => ({ id, values: [row.branch, row.cashier, money(row.nio, 'NIO'), money(row.usd, 'USD')] }))} /><footer>Total {visibleCurrencies.map(currency=><strong key={currency}>{money([...lafise.values()].reduce((sum,row)=>sum+(currency==='NIO'?row.nio:row.usd),0),currency)}</strong>)}</footer></section>
        <section className="report-section report-reconciliation"><h2>Teledolar + PEX</h2><ReportTable headers={['Banco / Sucursal', 'Envíos e ingresos', 'Pagos y egresos', 'Total']} rows={settlements.map(row => ({ id: row.id, settlement: row, values: [{ text: `${row.entity} ${row.branch}`, content: <div className="report-bank-label"><strong>{row.entity}</strong><small>{row.branch}</small></div> }, settlementCell(row, 'income',visibleCurrencies), settlementCell(row, 'expense',visibleCurrencies), settlementCell(row, 'difference',visibleCurrencies)] }))} footer={visible => {
          const total = reconciliationTotal(visible.map(row => row.settlement));
          return <tr><td>TOTAL</td>{(['income', 'expense', 'difference'] as const).map(field => <td key={field}><ReconciliationAmounts row={total} field={field} visibleCurrencies={visibleCurrencies} /></td>)}</tr>;
        }} /></section>
      </div>
    </>}
  </section>;
}
