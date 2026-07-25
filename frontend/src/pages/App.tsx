import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownAZ,
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  ArrowUpZA,
  Banknote,
  Ban,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Coins,
  Edit3,
  FileDown,
  FileSpreadsheet,
  FileText,
  Landmark,
  LockKeyhole,
  Menu,
  Plus,
  ReceiptText,
  RotateCcw,
  Save,
  Scale,
  Search,
  ShieldCheck,
  UserCog,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { MetricCard } from '../components/MetricCard';

type ScreenId =
  | 'login'
  | 'dashboard'
  | 'cashier'
  | 'shifts'
  | 'transactions'
  | 'cash-count'
  | 'approvals'
  | 'pending'
  | 'banks'
  | 'branches'
  | 'accounts'
  | 'catalogs'
  | 'commissions'
  | 'exchange-rate'
  | 'reports-hub'
  | 'reports'
  | 'commission-reports'
  | 'general-consolidation'
  | 'imports'
  | 'users'
  | 'role-permissions'
  | 'audit';

type InputKind = 'text' | 'select' | 'multiselect' | 'textarea' | 'password';
type SortDirection = 'asc' | 'desc' | null;
type StatusFilter = 'all' | 'active' | 'inactive';
type CrudRow = Record<string, string>;

type NavItem = {
  id: ScreenId;
  label: string;
  route: string;
  icon: LucideIcon;
};

type NavGroup = {
  item: NavItem;
  children?: NavItem[];
};

type CrudColumn = {
  key: string;
  label: string;
  inputKind?: InputKind;
  options?: string[];
  hiddenInTable?: boolean;
  hiddenInForm?: boolean;
  readOnly?: boolean;
};

type TableColumn = CrudColumn & {
  valueGetter?: (row: CrudRow) => string;
};

type CrudConfig = {
  storageKey: string;
  title: string;
  description: string;
  idPrefix: string;
  columns: CrudColumn[];
  rows: CrudRow[];
};

type ScreenHeader = {
  eyebrow: string;
  title: string;
};

type ModalMode = 'create' | 'edit';
type CashCurrency = 'NIO' | 'USD';

type ProcessField = {
  label: string;
  kind?: InputKind;
  placeholder?: string;
  options?: string[];
};

type CashDenomination = {
  id: string;
  value: number;
  label: string;
};

type CashPileDraft = {
  groups?: string;
  loose?: string;
};

type ExchangeRate = {
  buy: string;
  sell: string;
};

// El menu lateral se agrupa para que las pantallas hijas vivan bajo su proceso principal.
const navGroups: NavGroup[] = [
  { item: { id: 'dashboard', label: 'Panel General', route: '/dashboard', icon: ShieldCheck } },
  {
    item: { id: 'cashier', label: 'Mi caja', route: '/caja', icon: WalletCards },
    children: [
      { id: 'cash-count', label: 'Arqueo', route: '/arqueo', icon: Banknote },
      { id: 'approvals', label: 'Aprobaciones', route: '/aprobaciones', icon: CheckCircle2 },
      { id: 'pending', label: 'Pendientes', route: '/pendientes', icon: ClipboardList },
    ],
  },
  {
    item: { id: 'shifts', label: 'Turnos', route: '/turnos', icon: CalendarDays },
  },
  {
    item: { id: 'transactions', label: 'Transacciones', route: '/transacciones', icon: ReceiptText },
  },
  {
    item: { id: 'banks', label: 'Bancos', route: '/bancos', icon: Landmark },
    children: [
      { id: 'branches', label: 'Sucursales', route: '/sucursales', icon: Building2 },
      { id: 'accounts', label: 'Cuentas', route: '/cuentas', icon: Building2 },
      { id: 'catalogs', label: 'Movimientos', route: '/movimientos', icon: BookOpen },
      { id: 'commissions', label: 'Comisiones', route: '/comisiones', icon: Scale },
      { id: 'exchange-rate', label: 'Tasa de Cambio', route: '/tasa-cambio', icon: Coins },
    ],
  },
  {
    item: { id: 'reports-hub', label: 'Reportes', route: '/reportes', icon: FileDown },
    children: [
      { id: 'reports', label: 'Reportes operativos', route: '/reportes/operativos', icon: FileDown },
      { id: 'commission-reports', label: 'Reporte comisiones', route: '/reportes/comisiones', icon: Coins },
      { id: 'general-consolidation', label: 'Consolidado general', route: '/reportes/consolidado', icon: Scale },
    ],
  },
  {
    item: { id: 'users', label: 'Gestion usuarios', route: '/usuarios', icon: Users },
    children: [{ id: 'role-permissions', label: 'Roles y permisos', route: '/roles-permisos', icon: UserCog }],
  },
  { item: { id: 'audit', label: 'Auditoria', route: '/auditoria', icon: UserCog } },
  { item: { id: 'imports', label: 'Importaciones', route: '/importaciones', icon: FileSpreadsheet } },
  { item: { id: 'login', label: 'Login', route: '/login', icon: LockKeyhole } },
];

// Lista plana derivada del menu para resolver rutas, permisos y navegacion interna.
const navItems = navGroups.flatMap((group) => [group.item, ...(group.children ?? [])]);

// Los titulos cambian segun la pantalla activa para orientar al usuario.
const screenHeaders: Record<ScreenId, ScreenHeader> = {
  login: { eyebrow: 'Acceso', title: 'Inicio de sesion' },
  dashboard: { eyebrow: 'Panel', title: 'Panel General' },
  cashier: { eyebrow: 'Operacion', title: 'Mi caja activa' },
  shifts: { eyebrow: 'Jornadas', title: 'Turnos registrados' },
  transactions: { eyebrow: 'Movimientos', title: 'Transacciones registradas' },
  'cash-count': { eyebrow: 'Arqueo', title: 'Conteo fisico de caja' },
  approvals: { eyebrow: 'Revision', title: 'Aprobaciones pendientes' },
  pending: { eyebrow: 'Cobros y pagos', title: 'Pendientes' },
  banks: { eyebrow: 'Entidades', title: 'Bancos y servicios financieros' },
  branches: { eyebrow: 'Ubicaciones', title: 'Sucursales y tienda principal' },
  accounts: { eyebrow: 'Saldos', title: 'Cuentas financieras' },
  catalogs: { eyebrow: 'Configuracion', title: 'Movimientos por banco y moneda' },
  commissions: { eyebrow: 'Ganancias', title: 'Reglas de comision' },
  'exchange-rate': { eyebrow: 'Configuracion', title: 'Tasa de Cambio' },
  'reports-hub': { eyebrow: 'Consultas', title: 'Reportes' },
  reports: { eyebrow: 'Consultas', title: 'Reportes operativos' },
  'commission-reports': { eyebrow: 'Duena', title: 'Reporte de comisiones' },
  'general-consolidation': { eyebrow: 'Conciliacion', title: 'Consolidado general' },
  imports: { eyebrow: 'Historicos', title: 'Importacion desde Excel' },
  users: { eyebrow: 'Seguridad', title: 'Gestion de usuarios' },
  'role-permissions': { eyebrow: 'Seguridad', title: 'Roles y permisos' },
  audit: { eyebrow: 'Control', title: 'Auditoria del sistema' },
};

// Los permisos iniciales incluyen funciones actuales y accesos por pantalla.
const basePermissions: CrudRow[] = [
  { id: 'PER-001', code: 'GESTIONAR_USUARIOS', name: 'Gestionar usuarios', description: 'Crear, editar e inactivar usuarios.', status: 'Activo' },
  { id: 'PER-002', code: 'GESTIONAR_ROLES', name: 'Gestionar roles', description: 'Crear, editar e inactivar roles.', status: 'Activo' },
  { id: 'PER-003', code: 'GESTIONAR_PERMISOS', name: 'Gestionar permisos', description: 'Asignar permisos por rol, funcion y pantalla.', status: 'Activo' },
  { id: 'PER-004', code: 'REGISTRAR_TRANSACCIONES', name: 'Registrar transacciones', description: 'Crear transacciones durante un turno abierto.', status: 'Activo' },
  { id: 'PER-005', code: 'ANULAR_TRANSACCIONES', name: 'Anular transacciones', description: 'Inactivar o anular registros con motivo.', status: 'Activo' },
  { id: 'PER-006', code: 'EXPORTAR_REPORTES', name: 'Exportar reportes', description: 'Exportar informacion a Excel o PDF.', status: 'Activo' },
  { id: 'PER-007', code: 'VER_COMISIONES', name: 'Ver comisiones', description: 'Consultar comisiones y ganancias.', status: 'Activo' },
  { id: 'PER-008', code: 'ADMINISTRAR_COMISIONES', name: 'Administrar comisiones', description: 'Crear y editar reglas de comision.', status: 'Activo' },
  ...navItems
    .filter((item) => item.id !== 'login')
    .map((item, index) => ({
      id: `PER-${String(index + 101).padStart(3, '0')}`,
      code: `VER_${item.id.toUpperCase().replace(/-/g, '_')}`,
      name: `Ver ${item.label}`,
      description: `Permite abrir la pantalla ${item.label}.`,
      status: 'Activo',
    })),
];

// Configuracion base de tablas. Cada pantalla reutiliza el mismo CRUD visual.
const crudConfigs: Record<ScreenId, CrudConfig[]> = {
  login: [],
  dashboard: [
    {
      storageKey: 'dashboard-alerts',
      title: 'Alertas del dia',
      description: 'Indicadores que la duena debe revisar durante la jornada.',
      idPrefix: 'ALT',
      columns: [
        { key: 'id', label: 'Id', readOnly: true },
        { key: 'item', label: 'Indicador' },
        { key: 'value', label: 'Valor' },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo', 'En operacion', 'Requiere revision'] },
      ],
      rows: [
        { id: 'ALT-001', item: 'Turnos abiertos', value: '2', status: 'Activo' },
        { id: 'ALT-002', item: 'Diferencias pendientes', value: '1', status: 'Requiere revision' },
        { id: 'ALT-003', item: 'Pendientes vencidos', value: '3', status: 'Activo' },
      ],
    },
  ],
  cashier: [
    {
      storageKey: 'cashier-activity',
      title: 'Actividad del turno',
      description: 'Movimientos visibles para el cajero durante su turno.',
      idPrefix: 'ACT',
      columns: [
        { key: 'id', label: 'Id', readOnly: true },
        { key: 'time', label: 'Hora' },
        { key: 'movement', label: 'Movimiento' },
        { key: 'amount', label: 'Monto' },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo'] },
      ],
      rows: [
        { id: 'ACT-001', time: '08:10', movement: 'Apertura de caja', amount: 'C$ 8,000.00', status: 'Activo' },
        { id: 'ACT-002', time: '09:25', movement: 'Deposito BAC', amount: 'C$ 1,500.00', status: 'Activo' },
        { id: 'ACT-003', time: '10:15', movement: 'Pago remesa', amount: '$ 120.00', status: 'Activo' },
      ],
    },
  ],
  shifts: [
    {
      storageKey: 'shifts',
      title: 'Turnos',
      description: 'Aperturas y cierres de caja por sucursal.',
      idPrefix: 'TUR',
      columns: [
        { key: 'id', label: 'ID', readOnly: true },
        { key: 'branch', label: 'Sucursal', inputKind: 'select', options: ['Tienda principal', 'Sucursal 2'] },
        { key: 'register', label: 'Caja' },
        { key: 'cashier', label: 'Cajero' },
        { key: 'openedAt', label: 'Fecha y Hora Apertura' },
        { key: 'closedAt', label: 'Fecha y Hora Cierre' },
        { key: 'openingCash', label: 'Cantidad Apertura' },
        { key: 'closingCash', label: 'Cantidad Cierre' },
        { key: 'openingNio', label: 'Efectivo Inicial NIO', hiddenInTable: true },
        { key: 'openingUsd', label: 'Efectivo Inicial USD', hiddenInTable: true },
        { key: 'closingNio', label: 'Efectivo Final NIO', hiddenInTable: true },
        { key: 'closingUsd', label: 'Efectivo Final USD', hiddenInTable: true },
        { key: 'openingNotes', label: 'Observaciones apertura', inputKind: 'textarea', hiddenInTable: true },
        { key: 'closingNotes', label: 'Observaciones cierre', inputKind: 'textarea', hiddenInTable: true },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Abierto', 'Cerrado'], hiddenInTable: true },
      ],
      rows: [
        {
          id: 'TUR-001',
          branch: 'Tienda principal',
          register: 'Caja 1',
          cashier: 'Dueña',
          openedAt: '16/06/2026\n06:30 am',
          closedAt: '16/06/2026\n08:00 am',
          openingNio: '12000.00',
          openingUsd: '300.00',
          closingNio: '13540.00',
          closingUsd: '285.00',
          openingCash: 'NIO C$ 12,000.00\nUSD $ 300.00',
          closingCash: 'NIO C$ 13,540.00\nUSD $ 285.00',
          openingNotes: 'Apertura inicial de caja',
          closingNotes: 'Cierre sin diferencia',
          status: 'Cerrado',
        },
        {
          id: 'TUR-002',
          branch: 'Tienda principal',
          register: 'Caja 1',
          cashier: 'Cajera 1',
          openedAt: '16/06/2026\n08:00 am',
          closedAt: '',
          openingNio: '13540.00',
          openingUsd: '285.00',
          closingNio: '',
          closingUsd: '',
          openingCash: 'NIO C$ 13,540.00\nUSD $ 285.00',
          closingCash: '',
          openingNotes: '',
          closingNotes: '',
          status: 'Abierto',
        },
        {
          id: 'TUR-003',
          branch: 'Sucursal 2',
          register: 'Caja 3',
          cashier: 'Cajero 3',
          openedAt: '16/06/2026\n08:00 am',
          closedAt: '',
          openingNio: '8500.00',
          openingUsd: '150.00',
          closingNio: '',
          closingUsd: '',
          openingCash: 'NIO C$ 8,500.00\nUSD $ 150.00',
          closingCash: '',
          openingNotes: 'Sucursal 2',
          closingNotes: '',
          status: 'Abierto',
        },
      ],
    },
  ],
  transactions: [
    {
      storageKey: 'transactions',
      title: 'Transacciones',
      description: 'Registro concentrado de movimientos economicos.',
      idPrefix: 'TRA',
      columns: [
        { key: 'id', label: 'ID', readOnly: true },
        { key: 'registeredAt', label: 'FECHA' },
        { key: 'entity', label: 'BANCO', inputKind: 'select', options: ['BAC', 'BANPRO', 'LAFISE', 'BDF', 'PEX', 'TELEDOLAR'] },
        { key: 'movement', label: 'MOVIMIENTO', inputKind: 'select', options: ['Deposito a cuenta', 'Retiro de efectivo', 'Pago de remesa', 'Envio de remesa'] },
        { key: 'amount', label: 'MONTO' },
        { key: 'pendingName', label: 'PENDIENTE' },
        { key: 'direction', label: 'Direccion', inputKind: 'select', options: ['Ingreso', 'Salida'], hiddenInTable: true },
        { key: 'currency', label: 'Moneda', inputKind: 'select', options: ['NIO', 'USD'], hiddenInTable: true },
        { key: 'amountValue', label: 'Monto', hiddenInTable: true },
        { key: 'description', label: 'Descripcion', inputKind: 'textarea', hiddenInTable: true },
        { key: 'cashCountNio', label: 'Arqueo NIO', hiddenInTable: true, hiddenInForm: true },
        { key: 'cashCountUsd', label: 'Arqueo USD', hiddenInTable: true, hiddenInForm: true },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Registrada', 'Anulada'], hiddenInTable: true },
      ],
      rows: [
        {
          id: 'TRA-001',
          registeredAt: '10/07/2026 09:25',
          entity: 'BAC',
          movement: 'Deposito a cuenta',
          direction: 'Ingreso',
          currency: 'NIO',
          amountValue: '1500.00',
          amount: 'C$ 1,500.00',
          pendingName: '',
          paymentMethod: 'Efectivo',
          description: '',
          status: 'Registrada',
        },
        {
          id: 'TRA-002',
          registeredAt: '10/07/2026 10:15',
          entity: 'TELEDOLAR',
          movement: 'Pago de remesa',
          direction: 'Salida',
          currency: 'USD',
          amountValue: '120.00',
          amount: '$ 120.00',
          pendingName: 'Cliente frecuente',
          paymentMethod: 'Credito',
          description: 'Pendiente por cobrar',
          status: 'Registrada',
        },
        {
          id: 'TRA-003',
          registeredAt: '10/07/2026 11:40',
          entity: 'BANPRO',
          movement: 'Retiro de efectivo',
          direction: 'Salida',
          currency: 'NIO',
          amountValue: '900.00',
          amount: 'C$ 900.00',
          pendingName: '',
          paymentMethod: 'Efectivo',
          description: '',
          status: 'Anulada',
        },
      ],
    },
  ],
  'cash-count': [],
  'exchange-rate': [],
  approvals: [
    {
      storageKey: 'approvals',
      title: 'Aprobaciones',
      description: 'Solicitudes pendientes de revision por la duena.',
      idPrefix: 'APR',
      columns: [
        { key: 'id', label: 'IdAprobacion', readOnly: true },
        { key: 'type', label: 'Tipo' },
        { key: 'requestedBy', label: 'Solicitado por' },
        { key: 'detail', label: 'Detalle' },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo', 'Pendiente', 'Aprobada', 'Rechazada'] },
      ],
      rows: [
        { id: 'APR-001', type: 'Cierre de turno', requestedBy: 'Cajero 2', detail: 'Diferencia C$ 80.00', status: 'Pendiente' },
        { id: 'APR-002', type: 'Anulacion', requestedBy: 'Cajero 1', detail: 'Transaccion BANPRO', status: 'Pendiente' },
      ],
    },
  ],
  pending: [
    {
      storageKey: 'pending',
      title: 'Pendientes',
      description: 'Cuentas por cobrar y por pagar.',
      idPrefix: 'PEN',
      columns: [
        { key: 'id', label: 'IdPendiente', readOnly: true },
        { key: 'kind', label: 'Tipo', inputKind: 'select', options: ['Por cobrar', 'Por pagar'] },
        { key: 'person', label: 'Persona' },
        { key: 'amount', label: 'Saldo' },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo', 'Pendiente', 'Abonado', 'Pagado'] },
      ],
      rows: [
        { id: 'PEN-001', kind: 'Por cobrar', person: 'Cliente frecuente', amount: 'C$ 650.00', status: 'Pendiente' },
        { id: 'PEN-002', kind: 'Por pagar', person: 'Proveedor local', amount: '$ 40.00', status: 'Abonado' },
      ],
    },
  ],
  banks: [
    {
      storageKey: 'banks',
      title: 'Bancos',
      description: 'Entidades bancarias y servicios que la duena visualiza como bancos.',
      idPrefix: 'BAN',
      columns: [
        { key: 'id', label: 'ID', readOnly: true },
        { key: 'code', label: 'NOMBRE CORTO' },
        { key: 'name', label: 'NOMBRE LARGO' },
        { key: 'kind', label: 'TIPO', inputKind: 'select', options: ['Banco real', 'Servicio financiero', 'Servicio remesas', 'Otro'] },
        { key: 'status', label: 'ESTADO', inputKind: 'select', options: ['Activo', 'Inactivo'] },
      ],
      rows: [
        { id: 'BAN-001', code: 'BAC', name: 'Banco de America Central Credomatic S.A.', kind: 'Banco real', status: 'Activo' },
        { id: 'BAN-002', code: 'BANPRO', name: 'Banco de la Produccion S.A.', kind: 'Banco real', status: 'Activo' },
        { id: 'BAN-003', code: 'LAFISE', name: 'Banco Lafise Bancentro S.A.', kind: 'Banco real', status: 'Activo' },
        { id: 'BAN-004', code: 'BDF', name: 'Banco de Finanzas S.A.', kind: 'Banco real', status: 'Inactivo' },
        { id: 'BAN-005', code: 'PEX', name: 'PEX Servicios Financieros', kind: 'Servicio financiero', status: 'Activo' },
        { id: 'BAN-006', code: 'TELEDOLAR', name: 'Teledolar Servicios de Remesas', kind: 'Servicio remesas', status: 'Activo' },
      ],
    },
  ],
  branches: [
    {
      storageKey: 'branches',
      title: 'Sucursales',
      description: 'Tienda principal y sucursales operativas del negocio.',
      idPrefix: 'SUC',
      columns: [
        { key: 'id', label: 'ID', readOnly: true },
        { key: 'name', label: 'NOMBRE' },
        { key: 'cashiers', label: 'Cajeros asociados', inputKind: 'multiselect', options: ['Dueña', 'Cajera 1', 'Cajera 2', 'Cajero 3'], hiddenInTable: true },
        { key: 'accounts', label: 'Cuentas asociadas', inputKind: 'multiselect', options: ['BAC NIO 01', 'BAC USD 01', 'BANPRO NIO 01', 'BANPRO USD 01', 'LAFISE NIO 01', 'LAFISE USD 01', 'PEX NIO 01', 'TELEDOLAR USD 01'], hiddenInTable: true },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo'], hiddenInTable: true },
      ],
      rows: [
        { id: 'SUC-001', name: 'Tienda principal', cashiers: 'Dueña, Cajera 1, Cajera 2', accounts: 'BAC NIO 01, BAC USD 01, BANPRO NIO 01, BANPRO USD 01', status: 'Activo' },
        { id: 'SUC-002', name: 'Sucursal 2', cashiers: 'Cajero 3', accounts: 'LAFISE NIO 01, LAFISE USD 01, TELEDOLAR USD 01', status: 'Activo' },
      ],
    },
  ],
  accounts: [
    {
      storageKey: 'accounts',
      title: 'Cuentas financieras',
      description: 'Alias y saldos por entidad, moneda y alcance.',
      idPrefix: 'CTA',
      columns: [
        { key: 'id', label: 'ID', readOnly: true },
        { key: 'alias', label: 'ALIAS', readOnly: true },
        { key: 'entity', label: 'Entidad', inputKind: 'select', options: ['BAC', 'BANPRO', 'LAFISE', 'BDF', 'PEX', 'TELEDOLAR'], hiddenInTable: true },
        { key: 'currency', label: 'Moneda', inputKind: 'select', options: ['NIO', 'USD'], hiddenInTable: true },
        { key: 'scope', label: 'ALCANCE', inputKind: 'multiselect', options: ['Tienda principal', 'Sucursal 2'] },
        { key: 'accountNumber', label: 'N° CUENTA' },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo'], hiddenInTable: true },
      ],
      rows: [
        { id: 'CTA-001', alias: 'BAC NIO 01', entity: 'BAC', currency: 'NIO', scope: 'Tienda principal', accountNumber: '', status: 'Activo' },
        { id: 'CTA-002', alias: 'BAC USD 01', entity: 'BAC', currency: 'USD', scope: 'Tienda principal', accountNumber: '', status: 'Activo' },
        { id: 'CTA-003', alias: 'BANPRO NIO 01', entity: 'BANPRO', currency: 'NIO', scope: 'Tienda principal', accountNumber: '', status: 'Activo' },
        { id: 'CTA-004', alias: 'BANPRO USD 01', entity: 'BANPRO', currency: 'USD', scope: 'Tienda principal', accountNumber: '', status: 'Activo' },
        { id: 'CTA-005', alias: 'PEX NIO 01', entity: 'PEX', currency: 'NIO', scope: 'Global', accountNumber: '', status: 'Activo' },
      ],
    },
  ],
  catalogs: [
    {
      storageKey: 'movements',
      title: 'Movimientos',
      description: 'Movimientos asociados a una cuenta bancaria o saldo operativo.',
      idPrefix: 'MOV',
      columns: [
        { key: 'id', label: 'ID', readOnly: true },
        { key: 'code', label: 'CODIGO' },
        { key: 'name', label: 'NOMBRE' },
        { key: 'direction', label: 'DIRECCION', inputKind: 'select', options: ['Ingreso', 'Salida'] },
        { key: 'banks', label: 'BANCOS', inputKind: 'multiselect', options: ['BAC', 'BANPRO', 'LAFISE', 'BDF', 'PEX', 'TELEDOLAR'] },
        { key: 'currencies', label: 'MONEDAS', inputKind: 'multiselect', options: ['NIO', 'USD'] },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo'], hiddenInTable: true },
      ],
      rows: [
        { id: 'MOV-001', code: 'A', name: 'Avon', direction: 'Ingreso', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-002', code: 'CV', name: 'Casa Vision', direction: 'Ingreso', banks: 'BAC', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-003', code: 'DA', name: 'Deposito Avanz', direction: 'Ingreso', banks: 'PEX', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-004', code: 'DBDF', name: 'Deposito BDF', direction: 'Ingreso', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-005', code: 'DBM', name: 'Deposito de billetera movil', direction: 'Ingreso', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-006', code: 'DF', name: 'Deposito Ficohsa', direction: 'Ingreso', banks: 'PEX', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-007', code: 'DMF', name: 'Deposito Mi Familia', direction: 'Ingreso', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-008', code: 'DC', name: 'Depositos a cuenta', direction: 'Ingreso', banks: 'BAC, BANPRO, LAFISE', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-009', code: 'E', name: 'Envio AGB', direction: 'Ingreso', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-010', code: 'ER', name: 'Envio Remesas', direction: 'Ingreso', banks: 'TELEDOLAR', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-011', code: 'EV', name: 'Envio Veloz', direction: 'Ingreso', banks: 'LAFISE', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-012', code: 'FDL', name: 'FDL', direction: 'Ingreso', banks: 'PEX', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-013', code: 'FF', name: 'Financiera Fama', direction: 'Ingreso', banks: 'BANPRO, PEX', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-014', code: 'FDL', name: 'Financiera FDL', direction: 'Ingreso', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-015', code: 'GMG', name: 'Gallo Mas Gallo', direction: 'Ingreso', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-016', code: 'IC', name: 'Insta Credit', direction: 'Ingreso', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-017', code: 'L', name: 'Loto Nicaragua', direction: 'Ingreso', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-018', code: 'DGI', name: 'Pago de impuestos', direction: 'Ingreso', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-019', code: 'PP', name: 'Pago de prestamos', direction: 'Ingreso', banks: 'BAC, BANPRO, LAFISE', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-020', code: 'PSB', name: 'Pago de servicios basicos', direction: 'Ingreso', banks: 'BAC, BANPRO, LAFISE, PEX', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-021', code: 'PTC', name: 'Pago de tarjetas de credito', direction: 'Ingreso', banks: 'BAC, BANPRO, LAFISE', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-022', code: 'PPA', name: 'Pago prestamo Avanz', direction: 'Ingreso', banks: 'PEX', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-023', code: 'PPBDF', name: 'Pago prestamo BDF', direction: 'Ingreso', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-024', code: 'PPF', name: 'Pago prestamo Ficohsa', direction: 'Ingreso', banks: 'PEX', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-025', code: 'PR', name: 'Pago Remesas', direction: 'Salida', banks: 'TELEDOLAR', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-026', code: 'PTBDF', name: 'Pago Tarjeta BDF', direction: 'Ingreso', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-027', code: 'PTA', name: 'Pago Tarjetas Avanz', direction: 'Ingreso', banks: 'PEX', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-028', code: 'PTF', name: 'Pago Tarjetas Ficohsa', direction: 'Ingreso', banks: 'PEX', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-029', code: 'PN', name: 'Policia Nacional', direction: 'Ingreso', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-030', code: 'PRE', name: 'Recarga de tarjeta prepago de Joven Visa', direction: 'Ingreso', banks: 'LAFISE', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-031', code: 'RI', name: 'Remesa internacional', direction: 'Salida', banks: 'BANPRO, LAFISE', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-032', code: 'R', name: 'Retiro AGB', direction: 'Salida', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-033', code: 'RBM', name: 'Retiro de billetera movil', direction: 'Salida', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-034', code: 'RE', name: 'Retiro efectivo', direction: 'Salida', banks: 'BAC, BANPRO, LAFISE, PEX', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-035', code: 'RC', name: 'Retiro con codigo', direction: 'Salida', banks: 'BAC', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-036', code: 'RD', name: 'Retiro digital', direction: 'Salida', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-037', code: 'RMF', name: 'Retiro Mi Familia', direction: 'Salida', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-038', code: 'RV', name: 'Retiro Veloz', direction: 'Salida', banks: 'LAFISE', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-039', code: 'SF', name: 'Seguro facultativo', direction: 'Ingreso', banks: 'BAC, BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-040', code: 'SO', name: 'Seguro obligatorio', direction: 'Ingreso', banks: 'LAFISE', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-041', code: 'TGR', name: 'TGR Reposicion Cedula', direction: 'Ingreso', banks: 'BANPRO', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-042', code: 'TH', name: 'Tigo Hogar', direction: 'Ingreso', banks: 'BAC', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-043', code: 'TM', name: 'Tigo Movil', direction: 'Ingreso', banks: 'BAC', currencies: 'NIO, USD', status: 'Activo' },
        { id: 'MOV-044', code: 'YC', name: 'Yota Cordobas', direction: 'Ingreso', banks: 'BAC', currencies: 'NIO, USD', status: 'Activo' },
      ],
    },
  ],
  commissions: [
    {
      storageKey: 'commissions',
      title: 'Reglas de comision',
      description: 'Reglas por entidad, movimiento, calculo y vigencia.',
      idPrefix: 'COM',
      columns: [
        { key: 'id', label: 'ID', readOnly: true },
        { key: 'entity', label: 'ENTIDAD BANCARIA', inputKind: 'select', options: ['BAC', 'BANPRO', 'LAFISE', 'BDF', 'PEX', 'TELEDOLAR'] },
        { key: 'currency', label: 'MONEDA', inputKind: 'select', options: ['NIO', 'USD'] },
        { key: 'movement', label: 'MOVIMIENTO', inputKind: 'select', options: [] },
        { key: 'calculation', label: 'TIPO DE CALCULO', inputKind: 'select', options: ['Porcentaje', 'Fijo', 'Rango', 'Manual'] },
        { key: 'percentage', label: 'PORCENTAJE' },
        { key: 'commissionCurrency', label: 'MONEDA COMISION', inputKind: 'select', options: ['NIO', 'USD'] },
        { key: 'fixed', label: 'FIJO' },
        { key: 'rangeStart', label: 'RANGO INICIO' },
        { key: 'rangeEnd', label: 'RANGO FIN' },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo'], hiddenInTable: true },
      ],
      rows: [
        { id: 'COM-001', entity: 'BAC', currency: 'NIO', movement: 'Deposito a cuenta', calculation: 'Fijo', percentage: '', commissionCurrency: 'NIO', fixed: '5.00', rangeStart: '', rangeEnd: '', status: 'Activo' },
        { id: 'COM-002', entity: 'BAC', currency: 'USD', movement: 'Retiro de tarjeta', calculation: 'Porcentaje', percentage: '5%', commissionCurrency: '', fixed: '', rangeStart: '', rangeEnd: '', status: 'Activo' },
        { id: 'COM-003', entity: 'BANPRO', currency: 'NIO', movement: 'Retiro de efectivo', calculation: 'Porcentaje', percentage: '3%', commissionCurrency: '', fixed: '', rangeStart: '', rangeEnd: '', status: 'Activo' },
        { id: 'COM-004', entity: 'PEX', currency: 'NIO', movement: 'Retiro de efectivo', calculation: 'Fijo', percentage: '', commissionCurrency: 'NIO', fixed: '20.00', rangeStart: '', rangeEnd: '', status: 'Activo' },
        { id: 'COM-005', entity: 'LAFISE', currency: 'USD', movement: 'Retiro de efectivo', calculation: 'Fijo', percentage: '', commissionCurrency: 'NIO', fixed: '20.00', rangeStart: '', rangeEnd: '', status: 'Activo' },
        { id: 'COM-006', entity: 'LAFISE', currency: 'USD', movement: 'Deposito a cuenta', calculation: 'Rango', percentage: '5%', commissionCurrency: '', fixed: '', rangeStart: '1.00', rangeEnd: '100.00', status: 'Activo' },
        { id: 'COM-007', entity: 'LAFISE', currency: 'USD', movement: 'Deposito a cuenta', calculation: 'Rango', percentage: '1%', commissionCurrency: '', fixed: '', rangeStart: '1000.01', rangeEnd: 'En adelante', status: 'Activo' },
      ],
    },
  ],
  'reports-hub': [],
  reports: [
    {
      storageKey: 'reports',
      title: 'Reportes operativos',
      description: 'Reportes disponibles para consulta y exportacion.',
      idPrefix: 'REP',
      columns: [
        { key: 'id', label: 'IdReporte', readOnly: true },
        { key: 'report', label: 'Reporte' },
        { key: 'filters', label: 'Filtros' },
        { key: 'export', label: 'Exportacion' },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo'] },
      ],
      rows: [
        { id: 'REP-001', report: 'Transacciones', filters: 'Fecha, entidad, cajero', export: 'Excel/PDF', status: 'Activo' },
        { id: 'REP-002', report: 'Turnos', filters: 'Fecha, caja, estado', export: 'Excel/PDF', status: 'Activo' },
        { id: 'REP-003', report: 'Pendientes', filters: 'Estado, persona, vencimiento', export: 'Excel/PDF', status: 'Activo' },
      ],
    },
  ],
  'commission-reports': [
    {
      storageKey: 'commission-reports',
      title: 'Reporte de comisiones',
      description: 'Ganancias filtrables por periodo, entidad y moneda.',
      idPrefix: 'RCO',
      columns: [
        { key: 'id', label: 'IdRegistro', readOnly: true },
        { key: 'period', label: 'Periodo' },
        { key: 'entity', label: 'Entidad', inputKind: 'select', options: ['BAC', 'BANPRO', 'LAFISE', 'BDF', 'PEX', 'TELEDOLAR'] },
        { key: 'commission', label: 'Comision' },
        { key: 'currency', label: 'Moneda', inputKind: 'select', options: ['NIO', 'USD'] },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo'] },
      ],
      rows: [
        { id: 'RCO-001', period: 'Hoy', entity: 'BAC', commission: 'C$ 0.00', currency: 'NIO', status: 'Activo' },
        { id: 'RCO-002', period: 'Hoy', entity: 'TELEDOLAR', commission: '$ 0.00', currency: 'USD', status: 'Activo' },
      ],
    },
  ],
  'general-consolidation': [],
  imports: [
    {
      storageKey: 'imports',
      title: 'Importaciones',
      description: 'Archivos historicos cargados o pendientes de validar.',
      idPrefix: 'IMP',
      columns: [
        { key: 'id', label: 'IdImportacion', readOnly: true },
        { key: 'file', label: 'Archivo' },
        { key: 'date', label: 'Fecha detectada' },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo', 'Sin validar', 'Validado', 'Con errores'] },
      ],
      rows: [
        { id: 'IMP-001', file: 'Registro.xlsm', date: 'Pendiente', status: 'Sin validar' },
        { id: 'IMP-002', file: 'Historico abril.xlsx', date: '2026-04-30', status: 'Activo' },
      ],
    },
  ],
  users: [
    {
      storageKey: 'users',
      title: 'Usuarios',
      description: 'Usuarios con rol asignado y estado de acceso.',
      idPrefix: 'USR',
      columns: [
        { key: 'id', label: 'IdUsuario', readOnly: true },
        { key: 'firstName', label: 'Nombres' },
        { key: 'lastName', label: 'Apellidos' },
        { key: 'username', label: 'Usuario' },
        { key: 'temporaryPassword', label: 'Contrasena temporal', inputKind: 'password', hiddenInTable: true },
        { key: 'roleId', label: 'IdRol', inputKind: 'select', options: ['ROL-001', 'ROL-002'] },
        { key: 'role', label: 'Rol', inputKind: 'select', options: ['DUENA', 'CAJERO'] },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo', 'Bloqueado'] },
      ],
      rows: [
        { id: 'USR-001', firstName: 'Duena', lastName: 'Olivera', username: 'duena', roleId: 'ROL-001', role: 'DUENA', status: 'Activo' },
        { id: 'USR-002', firstName: 'Cajero', lastName: 'Principal', username: 'cajero1', roleId: 'ROL-002', role: 'CAJERO', status: 'Activo' },
        { id: 'USR-003', firstName: 'Cajero', lastName: 'Apoyo', username: 'cajero2', roleId: 'ROL-002', role: 'CAJERO', status: 'Activo' },
      ],
    },
  ],
  'role-permissions': [],
  audit: [
    {
      storageKey: 'audit',
      title: 'Auditoria',
      description: 'Historial de acciones sensibles del sistema.',
      idPrefix: 'AUD',
      columns: [
        { key: 'id', label: 'IdAuditoria', readOnly: true },
        { key: 'date', label: 'Fecha' },
        { key: 'user', label: 'Usuario' },
        { key: 'action', label: 'Accion' },
        { key: 'entity', label: 'Entidad' },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo'] },
      ],
      rows: [
        { id: 'AUD-001', date: 'Hoy 08:00', user: 'Duena', action: 'Iniciar sesion', entity: 'auth', status: 'Activo' },
        { id: 'AUD-002', date: 'Hoy 09:25', user: 'Cajero 1', action: 'Crear', entity: 'transacciones', status: 'Activo' },
      ],
    },
  ],
};

// Formularios operativos que aun no representan una tabla administrativa.
const processForms: Partial<Record<ScreenId, { title: string; fields: ProcessField[] }>> = {
  login: {
    title: 'Credenciales',
    fields: [
      { label: 'Usuario', placeholder: 'duena' },
      { label: 'Contrasena', kind: 'password', placeholder: '********' },
    ],
  },
  'cash-count': {
    title: 'Conteo por denominacion',
    fields: [
      { label: 'C$ 1000', placeholder: '0' },
      { label: 'C$ 500', placeholder: '0' },
      { label: 'C$ 200', placeholder: '0' },
      { label: 'C$ 100', placeholder: '0' },
      { label: '$ 100', placeholder: '0' },
      { label: '$ 50', placeholder: '0' },
      { label: 'Observaciones', kind: 'textarea', placeholder: 'Diferencias o billetes danados' },
    ],
  },
};

const cashDenominations: Record<CashCurrency, CashDenomination[]> = {
  NIO: [
    { id: 'nio-1000', value: 1000, label: 'C$ 1,000.00' },
    { id: 'nio-500', value: 500, label: 'C$ 500.00' },
    { id: 'nio-200', value: 200, label: 'C$ 200.00' },
    { id: 'nio-100', value: 100, label: 'C$ 100.00' },
    { id: 'nio-50', value: 50, label: 'C$ 50.00' },
    { id: 'nio-20', value: 20, label: 'C$ 20.00' },
    { id: 'nio-10', value: 10, label: 'C$ 10.00' },
    { id: 'nio-5', value: 5, label: 'C$ 5.00' },
    { id: 'nio-1', value: 1, label: 'C$ 1.00' },
  ],
  USD: [
    { id: 'usd-100', value: 100, label: '$ 100.00' },
    { id: 'usd-50', value: 50, label: '$ 50.00' },
    { id: 'usd-20', value: 20, label: '$ 20.00' },
    { id: 'usd-10', value: 10, label: '$ 10.00' },
    { id: 'usd-5', value: 5, label: '$ 5.00' },
    { id: 'usd-1', value: 1, label: '$ 1.00' },
  ],
};

const defaultExchangeRate: ExchangeRate = {
  buy: '36.40',
  sell: '37.00',
};

// Convierte el hash actual en una pantalla valida para simular rutas sin instalar un router.
function getScreenFromHash(): ScreenId {
  const currentRoute = window.location.hash.replace('#', '') || '/dashboard';
  return navItems.find((item) => item.route === currentRoute)?.id ?? 'dashboard';
}

// Ubica el grupo padre para desplegar solo el bloque relacionado con la pantalla activa.
function findParentGroupId(screenId: ScreenId): ScreenId | null {
  const parent = navGroups.find((group) => group.item.id === screenId || group.children?.some((child) => child.id === screenId));
  return parent?.children?.length ? parent.item.id : null;
}

function getCurrentRoleId() {
  const storedRoleId = window.localStorage.getItem('temo:active-role-id');
  if (storedRoleId) {
    return storedRoleId;
  }

  try {
    const storedUser = window.localStorage.getItem('temo:current-user');
    if (storedUser) {
      const currentUser = JSON.parse(storedUser) as { roleId?: string };
      return currentUser.roleId || 'ROL-001';
    }
  } catch {
    return 'ROL-001';
  }

  return 'ROL-001';
}

function hasDashboardAccess() {
  const dashboardPermission = basePermissions.find((permission) => permission.code === 'VER_DASHBOARD');
  if (!dashboardPermission) {
    return false;
  }

  const storedPermissions = window.localStorage.getItem(`temo:role-permissions:${getCurrentRoleId()}`);
  if (!storedPermissions) {
    return true;
  }

  try {
    const enabledPermissions = JSON.parse(storedPermissions) as Record<string, boolean>;
    return enabledPermissions[dashboardPermission.id] !== false;
  } catch {
    return true;
  }
}

// Detecta si el menu debe comportarse como drawer temporal.
function isCompactViewport() {
  return window.matchMedia('(max-width: 980px)').matches;
}

// Genera ids legibles para nuevos registros locales.
function nextReadableId(rows: CrudRow[], prefix: string) {
  const next = rows.length + 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

// Genera alias de cuenta con Entidad + Moneda + consecutivo por coincidencia.
function buildAccountAlias(rows: CrudRow[], entity = '', currency = '', currentId?: string) {
  const matches = rows.filter((row) => row.id !== currentId && row.entity === entity && row.currency === currency);
  const next = matches.length + 1;
  return `${entity} ${currency} ${String(next).padStart(2, '0')}`.trim();
}

// Convierte campos guardados como "A, B, C" a lista para selectores multiples.
function parseMultiValue(value?: string) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// Define el valor inicial real que debe guardarse para cada tipo de campo.
function getDefaultColumnValue(column: CrudColumn) {
  if (column.key === 'status') {
    return 'Activo';
  }
  if (column.inputKind === 'select') {
    return column.options?.[0] ?? '';
  }
  return '';
}

// Normaliza registros antes de mostrarlos o guardarlos para que los selects no persistan vacios.
function normalizeRowDefaults(row: CrudRow, columns: CrudColumn[]) {
  return columns.reduce<CrudRow>((acc, column) => {
    const currentValue = acc[column.key];
    if (!currentValue && (column.inputKind === 'select' || column.key === 'status')) {
      acc[column.key] = getDefaultColumnValue(column);
    }
    return acc;
  }, { ...row });
}

// Centraliza la deteccion de registros inactivos para filtros y botones de estado.
function isInactive(row: CrudRow) {
  const status = row.status?.toLowerCase();
  return status === 'inactivo' || status === 'anulada';
}

// Recupera catalogos persistidos para que pantallas relacionadas usen datos actualizados por el usuario.
function readStoredRows(storageKey: string, fallbackRows: CrudRow[]) {
  const stored = window.localStorage.getItem(`temo:${storageKey}`);
  if (!stored) {
    return fallbackRows;
  }
  const parsedRows = JSON.parse(stored) as CrudRow[];
  if (storageKey === 'movements' && (parsedRows.length < 20 || !parsedRows.every((row) => row.direction))) {
    return fallbackRows;
  }
  return parsedRows;
}

function normalizeLookupValue(value?: string) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getMovementRows() {
  const movementConfig = crudConfigs.catalogs[0];
  return readStoredRows(movementConfig.storageKey, movementConfig.rows);
}

function getMovementRowsForEntity(entity: string) {
  const normalizedEntity = normalizeLookupValue(entity);
  return getMovementRows().filter(
    (row) =>
      !isInactive(row) &&
      parseMultiValue(row.banks).some((bank) => normalizeLookupValue(bank) === normalizedEntity),
  );
}

function getTransactionMovementOptions(entity: string) {
  return getMovementRowsForEntity(entity).map((row) => row.name).filter(Boolean);
}

function getTransactionMovementDirection(entity: string, movement: string) {
  const normalizedMovement = normalizeLookupValue(normalizeTransactionMovement(movement));
  const movementRow = getMovementRowsForEntity(entity).find((row) => normalizeLookupValue(row.name) === normalizedMovement);
  return movementRow?.direction === 'Salida' ? 'Salida' : 'Ingreso';
}

// Obtiene movimientos activos que aun pueden asociarse a una regla de comision.
function getAvailableCommissionMovements(commissionRows: CrudRow[], currentRow?: CrudRow) {
  const movementConfig = crudConfigs.catalogs[0];
  const movementRows = readStoredRows(movementConfig.storageKey, movementConfig.rows);
  const usedMovements = new Set(
    commissionRows
      .filter((row) => row.id !== currentRow?.id)
      .map((row) => row.movement)
      .filter(Boolean),
  );
  const currentMovement = currentRow?.movement;

  return movementRows
    .filter((row) => !isInactive(row))
    .map((row) => row.name)
    .filter((movement) => movement && (!usedMovements.has(movement) || movement === currentMovement));
}

// Limpia el porcentaje para que el usuario escriba solo el numero y la tabla agregue el simbolo.
function normalizePercentage(value?: string) {
  return String(value ?? '')
    .replace('%', '')
    .replace(/[^\d.,]/g, '')
    .trim();
}

// Une entidad y moneda en una columna compacta sin tocar los campos originales.
function formatBankCurrency(row: CrudRow) {
  return [row.entity, row.currency].filter(Boolean).join(' ');
}

// Une porcentaje o monto fijo en una sola lectura de comision para reducir columnas.
function formatCommissionValue(row: CrudRow) {
  const percentage = normalizePercentage(row.percentage);
  if (percentage) {
    return `${percentage}%`;
  }
  if (row.fixed) {
    return [row.fixed, row.commissionCurrency].filter(Boolean).join(' ');
  }
  return '';
}

// Normaliza el fin de rango abierto para que la tabla lo lea como "A más".
function formatRangeEnd(row: CrudRow) {
  const rangeEnd = String(row.rangeEnd ?? '').trim();
  if (rangeEnd.toLowerCase() === 'en adelante') {
    return 'A más';
  }
  return rangeEnd || (row.rangeStart ? 'A más' : '');
}

function formatShiftDateTime(date: Date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const period = hours >= 12 ? 'pm' : 'am';
  const displayHours = String(hours % 12 || 12).padStart(2, '0');
  return `${day}/${month}/${year}\n${displayHours}:${minutes} ${period}`;
}

function parseMoneyValue(value?: string) {
  const cleanValue = String(value ?? '').replace(/[^\d,.-]/g, '');
  const normalized = cleanValue.includes(',') && cleanValue.includes('.')
    ? cleanValue.replace(/,/g, '')
    : cleanValue.replace(/,/g, '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeRateValue(value: string) {
  const normalized = value.replace(/[^\d.]/g, '');
  const [integerPart, decimalPart = ''] = normalized.split('.');
  return decimalPart ? `${integerPart}.${decimalPart.slice(0, 2)}` : integerPart;
}

function readExchangeRate(): ExchangeRate {
  const stored = window.localStorage.getItem('temo:exchange-rate');
  if (!stored) {
    return defaultExchangeRate;
  }
  try {
    return { ...defaultExchangeRate, ...(JSON.parse(stored) as Partial<ExchangeRate>) };
  } catch {
    return defaultExchangeRate;
  }
}

function parseExchangeRate(value?: string) {
  const parsed = parseMoneyValue(value);
  return parsed > 0 ? parsed : parseMoneyValue(defaultExchangeRate.buy);
}

function formatRateDisplay(value?: string) {
  return parseExchangeRate(value).toFixed(2);
}

function parseCashQuantity(value?: string) {
  const parsed = Number.parseInt(String(value ?? '').replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readCashCountDraft() {
  const stored = window.localStorage.getItem('temo:cash-count-draft');
  if (!stored) {
    return {};
  }
  try {
    return JSON.parse(stored) as Record<string, string>;
  } catch {
    return {};
  }
}

function readCashPileDraft() {
  const stored = window.localStorage.getItem('temo:cash-pile-draft');
  if (!stored) {
    return {};
  }
  try {
    return JSON.parse(stored) as Record<string, CashPileDraft>;
  } catch {
    return {};
  }
}

function calculatePileQuantity(pile?: CashPileDraft) {
  return parseCashQuantity(pile?.groups) * 25 + parseCashQuantity(pile?.loose);
}

function splitCashQuantity(value?: string): CashPileDraft {
  const quantity = parseCashQuantity(value);
  const groups = Math.floor(quantity / 25);
  const loose = quantity % 25;
  return {
    groups: groups ? String(groups) : '',
    loose: loose ? String(loose) : '',
  };
}

function getCashPileDraft(
  denominationId: string,
  quantities: Record<string, string>,
  pileDrafts: Record<string, CashPileDraft>,
) {
  const pile = pileDrafts[denominationId];
  if (pile?.groups || pile?.loose) {
    return pile;
  }
  return splitCashQuantity(quantities[denominationId]);
}

function calculateCashTotal(denominations: CashDenomination[], quantities: Record<string, string>) {
  return denominations.reduce((total, denomination) => total + parseCashQuantity(quantities[denomination.id]) * denomination.value, 0);
}

function calculateCashPileTotal(denominations: CashDenomination[], pileDrafts: Record<string, CashPileDraft>) {
  return denominations.reduce((total, denomination) => {
    return total + calculatePileQuantity(pileDrafts[denomination.id]) * denomination.value;
  }, 0);
}

function readTransactionCashCount(value?: string) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as Record<string, CashPileDraft>;
  } catch {
    return {};
  }
}

function serializeTransactionCashCount(value: Record<string, CashPileDraft>) {
  return JSON.stringify(value);
}

function formatCashCountMoney(value: number, currency: CashCurrency) {
  const symbol = currency === 'NIO' ? 'C$' : '$';
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${symbol} ${formatted}`;
}

function getCurrencySymbol(currency: CashCurrency) {
  return currency === 'NIO' ? 'C$' : '$';
}

function formatMoneyNumber(value: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function normalizeConsolidationRaw(value?: string) {
  const rawValue = String(value ?? '').trim();
  const decimalNormalized = rawValue.includes('.') ? rawValue.replace(/,/g, '') : rawValue.replace(',', '.');
  const normalized = decimalNormalized.replace(/[^\d.]/g, '');
  const [integerPart = '', ...decimalParts] = normalized.split('.');
  const integerDigits = integerPart.replace(/\D/g, '').slice(0, 10);
  if (!decimalParts.length) {
    return integerDigits;
  }
  const decimalDigits = decimalParts.join('').replace(/\D/g, '').slice(0, 2);
  return `${integerDigits || '0'}.${decimalDigits}`;
}

function formatConsolidationInput(value?: string) {
  const rawValue = normalizeConsolidationRaw(value);
  if (!rawValue) {
    return '';
  }
  const [integerPart = '0', decimalPart = ''] = rawValue.split('.');
  const decimalDigits = decimalPart.padEnd(2, '0').slice(0, 2);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(`${integerPart || '0'}.${decimalDigits}`));
}

function parseConsolidationValue(value?: string) {
  const rawValue = normalizeConsolidationRaw(value);
  return rawValue ? Number(rawValue) : 0;
}

function readConsolidationBalances() {
  const stored = window.localStorage.getItem('temo:general-consolidation-balances');
  if (!stored) {
    return {};
  }
  try {
    return JSON.parse(stored) as Record<string, { initial?: string; system?: string }>;
  } catch {
    return {};
  }
}

function getConsolidationKey(currency: CashCurrency, entity: string) {
  return `${currency}:${entity}`;
}

function getActiveEntities() {
  const bankConfig = crudConfigs.banks[0];
  return readStoredRows(bankConfig.storageKey, bankConfig.rows)
    .filter((row) => !isInactive(row))
    .map((row) => row.code || row.name)
    .filter(Boolean);
}

function summarizeTransactionsByEntity(currency: CashCurrency) {
  const transactionConfig = crudConfigs.transactions[0];
  const transactionRows = readStoredRows(transactionConfig.storageKey, transactionConfig.rows).map(normalizeTransactionRow);

  return transactionRows.reduce<Record<string, { income: number; expense: number }>>((summary, row) => {
    if (isInactive(row) || row.currency !== currency) {
      return summary;
    }
    const entity = row.entity || 'Sin entidad';
    const amount = parseMoneyValue(row.amountValue || row.amount);
    const current = summary[entity] ?? { income: 0, expense: 0 };
    if (row.direction === 'Salida') {
      current.expense += amount;
    } else {
      current.income += amount;
    }
    summary[entity] = current;
    return summary;
  }, {});
}

function formatCurrencyValue(value: string | undefined, currency: 'NIO' | 'USD') {
  const parsed = parseMoneyValue(value);
  const formatted = new Intl.NumberFormat('es-NI', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
  return currency === 'NIO' ? `NIO C$ ${formatted}` : `USD $ ${formatted}`;
}

function formatShiftCash(nio?: string, usd?: string) {
  return `${formatCurrencyValue(nio, 'NIO')}\n${formatCurrencyValue(usd, 'USD')}`;
}

function normalizeShiftRow(row: CrudRow): CrudRow {
  const openingNio = row.openingNio ?? '';
  const openingUsd = row.openingUsd ?? '';
  const closingNio = row.closingNio ?? '';
  const closingUsd = row.closingUsd ?? '';
  return {
    ...row,
    branch: row.branch || 'Tienda principal',
    register: row.register || 'Caja 1',
    cashier: row.cashier || 'DueÃ±a',
    openedAt: row.openedAt || row.date || '',
    closedAt: row.closedAt || '',
    openingNio,
    openingUsd,
    closingNio,
    closingUsd,
    openingCash: row.openingCash || formatShiftCash(openingNio, openingUsd),
    closingCash: row.closingCash || (closingNio || closingUsd ? formatShiftCash(closingNio, closingUsd) : ''),
    openingNotes: row.openingNotes || '',
    closingNotes: row.closingNotes || '',
    status: row.status === 'Cerrado' ? 'Cerrado' : 'Abierto',
  };
}

function formatTransactionDateTime(date: Date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function coerceTransactionDateTime(value?: string) {
  const rawValue = String(value ?? '').trim();
  if (/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  const relativeMatch = rawValue.match(/^(Hoy|Ayer)\s+(\d{1,2}:\d{2})$/i);
  if (relativeMatch) {
    const date = new Date();
    if (relativeMatch[1].toLowerCase() === 'ayer') {
      date.setDate(date.getDate() - 1);
    }
    const [hours, minutes] = relativeMatch[2].split(':').map(Number);
    date.setHours(hours, minutes, 0, 0);
    return formatTransactionDateTime(date);
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.getTime()) ? formatTransactionDateTime(new Date()) : formatTransactionDateTime(parsed);
}

function normalizeTransactionMovement(value?: string) {
  const movement = String(value ?? '').trim();
  const knownMovements: Record<string, string> = {
    'Pago remesa': 'Pago Remesas',
    'Pago de remesa': 'Pago Remesas',
    'Retiro efectivo': 'Retiro efectivo',
    'Retiro de efectivo': 'Retiro efectivo',
    'Deposito a cuenta': 'Depositos a cuenta',
    'Depositos a cuenta': 'Depositos a cuenta',
    'Envio de remesa': 'Envio Remesas',
    'Envio remesas': 'Envio Remesas',
  };
  return knownMovements[movement] ?? movement;
}

function formatTransactionMoney(row: CrudRow) {
  const symbol = row.currency === 'USD' ? '$' : 'C$';
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parseMoneyValue(row.amountValue || row.amount));
  return `${symbol} ${formatted}`;
}

function normalizeTransactionRow(row: CrudRow): CrudRow {
  const amountText = String(row.amount ?? '').trim();
  const currency = row.currency || (amountText.startsWith('$') ? 'USD' : 'NIO');
  const amountValue = row.amountValue || row.amount || '';
  const entity = row.entity || 'BAC';
  const movement = normalizeTransactionMovement(row.movement || 'Depositos a cuenta');
  const direction = row.direction || getTransactionMovementDirection(entity, movement);
  return {
    ...row,
    registeredAt: coerceTransactionDateTime(row.registeredAt || row.date),
    entity,
    movement,
    direction,
    currency,
    amountValue,
    amount: row.amount || formatTransactionMoney({ ...row, currency, amountValue }),
    pendingName: row.pendingName || '',
    paymentMethod: row.paymentMethod || 'Efectivo',
    description: row.description || '',
    cashCountNio: row.cashCountNio || '{}',
    cashCountUsd: row.cashCountUsd || '{}',
    status: row.status || 'Registrada',
  };
}

// Devuelve el valor visible de una celda, sea directo o calculado para tablas compactas.
function getCellValue(row: CrudRow, column: TableColumn) {
  return column.valueGetter?.(row) ?? row[column.key] ?? '';
}

// Define columnas visibles por tabla; Comisiones se compacta sin cambiar formulario ni datos.
function getVisibleColumns(config: CrudConfig): TableColumn[] {
  const baseColumns = config.columns.filter((column) => !column.hiddenInTable && column.key !== 'status');
  if (config.storageKey !== 'commissions') {
    return baseColumns;
  }

  const columnByKey = Object.fromEntries(baseColumns.map((column) => [column.key, column]));
  return [
    columnByKey.id,
    { key: 'bankCurrency', label: 'BANCO / MONEDA', valueGetter: formatBankCurrency },
    columnByKey.movement,
    columnByKey.calculation,
    { key: 'commissionValue', label: 'COMISION', valueGetter: formatCommissionValue },
    columnByKey.rangeStart,
    { ...columnByKey.rangeEnd, valueGetter: formatRangeEnd },
  ].filter(Boolean) as TableColumn[];
}

// Lee datos persistidos en localStorage y cae a datos iniciales cuando no existen.
function usePersistentRows(storageKey: string, initialRows: CrudRow[]) {
  const [rows, setRows] = useState<CrudRow[]>(() => {
    const stored = window.localStorage.getItem(`temo:${storageKey}`);
    if (!stored) {
      return initialRows;
    }
    const parsedRows = JSON.parse(stored) as CrudRow[];
    if (storageKey === 'movements' && (parsedRows.length < 20 || !parsedRows.every((row) => row.direction))) {
      return initialRows;
    }
    return parsedRows;
  });

  useEffect(() => {
    window.localStorage.setItem(`temo:${storageKey}`, JSON.stringify(rows));
  }, [rows, storageKey]);

  return [rows, setRows] as const;
}

function useAutoFocusFirstField<T extends HTMLElement>() {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    const firstField = containerRef.current?.querySelector<HTMLElement>(
      'input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
    );
    firstField?.focus();
  }, []);

  return containerRef;
}

export function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>(getScreenFromHash);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<ScreenId | null>(() => findParentGroupId(getScreenFromHash()));

  // Mantiene sincronizada la pantalla activa cuando cambia la URL del hash.
  useEffect(() => {
    const handleRouteChange = () => {
      const nextScreen = getScreenFromHash();
      setActiveScreen(nextScreen);
      setOpenGroupId(findParentGroupId(nextScreen));
      if (isCompactViewport()) {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('hashchange', handleRouteChange);
    return () => window.removeEventListener('hashchange', handleRouteChange);
  }, []);

  // Si la pantalla vuelve a ser ancha, el sidebar deja de depender del estado mobile.
  useEffect(() => {
    const handleResize = () => {
      if (isCompactViewport()) {
        setIsSidebarCollapsed(false);
      } else {
        setIsSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Memoiza el encabezado para evitar recalculos innecesarios.
  const activeHeader = useMemo(() => screenHeaders[activeScreen], [activeScreen]);

  // Cambia la ruta simulada y deja marcado el boton activo del menu.
  function navigateTo(item: NavItem) {
    window.location.hash = item.route;
    setActiveScreen(item.id);
    setOpenGroupId(findParentGroupId(item.id));
    if (isCompactViewport()) {
      setIsSidebarOpen(false);
    }
  }

  function navigateFromBrand() {
    const targetScreen = hasDashboardAccess() ? 'dashboard' : 'transactions';
    const targetItem = navItems.find((item) => item.id === targetScreen);
    if (targetItem) {
      navigateTo(targetItem);
    }
  }

  function toggleNavGroup(group: NavGroup) {
    setOpenGroupId((current) => (current === group.item.id ? null : group.item.id));
  }

  function toggleSidebar() {
    if (isCompactViewport()) {
      setIsSidebarOpen((current) => !current);
      return;
    }
    setIsSidebarCollapsed((current) => !current);
  }

  return (
    <main className={`app-shell ${isSidebarOpen ? 'app-shell--sidebar-open' : ''} ${isSidebarCollapsed ? 'app-shell--sidebar-collapsed' : ''}`}>
      {/* Fondo mobile para cerrar el menu al tocar fuera de la barra lateral. */}
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="Cerrar menu"
        onClick={() => setIsSidebarOpen(false)}
      />
      <aside className="sidebar">
        {/* Identidad fija del sistema en el menu lateral. */}
        <button type="button" className="brand" onClick={navigateFromBrand}>
          <img className="brand__logo" src="/LOGO_TEMO.png" alt="TEMO" />
          <div>
            <strong>TEMO</strong>
            <span>Transacciones Económicas Miscelánea Olivera</span>
          </div>
        </button>

        {/* Cada grupo navega a una pantalla principal y muestra sus pantallas hijas debajo. */}
        <nav className="nav-list" aria-label="Principal">
          {navGroups.map((group) => {
            const Icon = group.item.icon;
            const groupIsActive =
              activeScreen === group.item.id || Boolean(group.children?.some((child) => child.id === activeScreen));
            const groupIsOpen = openGroupId === group.item.id;
            return (
              <div key={group.item.id} className="nav-group">
                <div className={`nav-button nav-button--group ${groupIsActive ? 'nav-button--active' : ''}`}>
                  <button type="button" className="nav-main-action" onClick={() => navigateTo(group.item)}>
                    <Icon size={18} />
                    <span>{group.item.label}</span>
                  </button>
                  {group.children?.length && (
                    <button
                      type="button"
                      className="nav-chevron"
                      onClick={() => toggleNavGroup(group)}
                      aria-label={groupIsOpen ? `Contraer ${group.item.label}` : `Desplegar ${group.item.label}`}
                      aria-expanded={groupIsOpen}
                    >
                      {groupIsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                  )}
                </div>
                {group.children && (groupIsOpen || isSidebarCollapsed) && (
                  <div className="nav-sublist">
                    {group.children.map((child) => {
                      const ChildIcon = child.icon;
                      return (
                        <button
                          key={child.id}
                          type="button"
                          className={`nav-button nav-button--child ${activeScreen === child.id ? 'nav-button--active' : ''}`}
                          onClick={() => navigateTo(child)}
                        >
                          <ChildIcon size={16} />
                          <span>{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        {/* Barra superior con titulo contextual de la pantalla activa. */}
        <header className="topbar">
          <button
            type="button"
            className="icon-button"
            aria-label={isCompactViewport() ? 'Abrir menu' : isSidebarCollapsed ? 'Expandir menu' : 'Contraer menu'}
            onClick={(event) => {
              event.stopPropagation();
              toggleSidebar();
            }}
          >
            <Menu size={20} />
          </button>
          <div>
            <p>{activeHeader.eyebrow}</p>
            <h1>{activeHeader.title}</h1>
          </div>
          <button type="button" className="owner-button">
            <ShieldCheck size={18} />
            <span>Panel General</span>
          </button>
        </header>

        {/* Renderiza el contenido especializado o CRUD de cada pantalla. */}
        <div
          onClick={() => {
            if (isCompactViewport()) {
              setIsSidebarOpen(false);
            }
          }}
        >
          <ScreenContent screen={activeScreen} />
        </div>
      </section>
    </main>
  );
}

function ScreenContent({ screen }: { screen: ScreenId }) {
  const configs = crudConfigs[screen];
  const processForm = processForms[screen];

  if (screen === 'dashboard') {
    return <DashboardScreen configs={configs} />;
  }

  if (screen === 'role-permissions') {
    return <RolePermissionsScreen />;
  }

  if (screen === 'reports-hub') {
    return <ReportsHubScreen />;
  }

  if (screen === 'shifts') {
    return <ShiftTable config={configs[0]} />;
  }

  if (screen === 'transactions') {
    return <TransactionTable config={configs[0]} />;
  }

  if (screen === 'cash-count') {
    return <CashCountScreen />;
  }

  if (screen === 'exchange-rate') {
    return <ExchangeRateScreen />;
  }

  if (screen === 'general-consolidation') {
    return <GeneralConsolidationScreen />;
  }

  if (processForm) {
    return <ProcessFormPanel title={processForm.title} fields={processForm.fields} />;
  }

  return (
    <section className="screen-stack">
      {/* Cada configuracion se pinta como una tabla CRUD independiente. */}
      {configs.map((config) => (
        <CrudTable key={config.storageKey} config={config} />
      ))}
    </section>
  );
}

function ReportsHubScreen() {
  const reportCards = [
    {
      title: 'Reportes operativos',
      description: 'Transacciones, turnos, pendientes y arqueos filtrables.',
      route: '/reportes/operativos',
      icon: FileDown,
    },
    {
      title: 'Reporte comisiones',
      description: 'Ganancias por entidad, movimiento, sucursal, cajero y moneda.',
      route: '/reportes/comisiones',
      icon: Coins,
    },
    {
      title: 'Consolidado general',
      description: 'Saldos iniciales, ingresos, egresos, saldo final y diferencia por entidad.',
      route: '/reportes/consolidado',
      icon: Scale,
    },
  ];

  return (
    <section className="report-card-grid">
      {/* La pantalla de Reportes funciona como entrada hacia los dos reportes principales. */}
      {reportCards.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.route}
            type="button"
            className="report-card"
            onClick={() => {
              window.location.hash = card.route;
            }}
          >
            <Icon size={26} />
            <span>{card.title}</span>
            <small>{card.description}</small>
          </button>
        );
      })}
    </section>
  );
}

function DashboardScreen({ configs }: { configs: CrudConfig[] }) {
  return (
    <section className="screen-stack">
      {/* Indicadores de alto nivel para la vista de la duena. */}
      <section className="metrics-grid" aria-label="Resumen del dia">
        <MetricCard label="Efectivo NIO" value="C$ 0.00" helper="Pendiente de conexion a turnos" icon={<Coins size={22} />} />
        <MetricCard label="Efectivo USD" value="$ 0.00" helper="Conteo por denominaciones" icon={<Banknote size={22} />} />
        <MetricCard label="Entidades" value="6" helper="BAC, BANPRO, LAFISE, BDF, PEX, TELEDOLAR" icon={<Building2 size={22} />} />
        <MetricCard label="Comisiones" value="Restringido" helper="Visible solo para duena" icon={<LockKeyhole size={22} />} />
      </section>

      {/* Las alertas tambien usan el CRUD reutilizable para mantener controles uniformes. */}
      {configs.map((config) => (
        <CrudTable key={config.storageKey} config={config} />
      ))}
    </section>
  );
}

function ProcessFormPanel({ title, fields }: { title: string; fields: ProcessField[] }) {
  const panelRef = useAutoFocusFirstField<HTMLElement>();

  return (
    <article className="panel" ref={panelRef}>
      {/* Formulario operativo con acciones explicitas de guardar o cancelar. */}
      <div className="panel__header">
        <div>
          <p>Captura</p>
          <h2>{title}</h2>
        </div>
        <div className="action-row">
          <button type="button" className="secondary-button">
            <X size={17} />
            Cancelar
          </button>
          <button type="button" className="primary-button">
            <Save size={17} />
            Guardar
          </button>
        </div>
      </div>

      {/* Los campos de proceso quedan listos para conectarse al backend despues. */}
      <div className="form-grid">
        {fields.map((field) => (
          <FormFieldControl key={field.label} field={field} />
        ))}
      </div>
    </article>
  );
}

function ExchangeRateScreen() {
  const [rate, setRate] = useState<ExchangeRate>(() => readExchangeRate());
  const [savedAt, setSavedAt] = useState(() => window.localStorage.getItem('temo:exchange-rate-saved-at') ?? '');
  const panelRef = useAutoFocusFirstField<HTMLElement>();

  function updateRateField(field: keyof ExchangeRate, value: string) {
    setRate((current) => ({ ...current, [field]: sanitizeRateValue(value) }));
  }

  function saveRate() {
    const normalizedRate = {
      buy: formatRateDisplay(rate.buy),
      sell: formatRateDisplay(rate.sell),
    };
    const nextSavedAt = formatTransactionDateTime(new Date());
    setRate(normalizedRate);
    setSavedAt(nextSavedAt);
    window.localStorage.setItem('temo:exchange-rate', JSON.stringify(normalizedRate));
    window.localStorage.setItem('temo:exchange-rate-saved-at', nextSavedAt);
  }

  return (
    <section className="screen-stack">
      <article className="panel exchange-rate-panel" ref={panelRef}>
        <div className="panel__header table-panel-header">
          <div>
            <p>Dolares</p>
            <h2>Tasa de Cambio</h2>
          </div>
          <button type="button" className="primary-button" onClick={saveRate}>
            <Save size={17} />
            Guardar
          </button>
        </div>

        <div className="exchange-rate-form">
          <label className="form-field">
            Compra
            <div className="input-affix">
              <input value={rate.buy} inputMode="decimal" onChange={(event) => updateRateField('buy', event.target.value)} />
              <span>C$</span>
            </div>
          </label>
          <label className="form-field">
            Venta
            <div className="input-affix">
              <input value={rate.sell} inputMode="decimal" onChange={(event) => updateRateField('sell', event.target.value)} />
              <span>C$</span>
            </div>
          </label>
        </div>

        <div className="exchange-rate-note">
          <span>Compra: C$ {formatRateDisplay(rate.buy)}</span>
          <span>Venta: C$ {formatRateDisplay(rate.sell)}</span>
          <small>{savedAt ? `Ultima actualizacion: ${savedAt}` : 'Valores iniciales del sistema.'}</small>
        </div>
      </article>
    </section>
  );
}

function CashCountScreen() {
  const [quantities, setQuantities] = useState<Record<string, string>>(() => readCashCountDraft());
  const [pileDrafts, setPileDrafts] = useState<Record<string, CashPileDraft>>(() => readCashPileDraft());
  const [exchangeRate] = useState<ExchangeRate>(() => readExchangeRate());

  const totals = useMemo(
    () => ({
      NIO: calculateCashTotal(cashDenominations.NIO, quantities),
      USD: calculateCashTotal(cashDenominations.USD, quantities),
    }),
    [quantities],
  );
  const buyRate = parseExchangeRate(exchangeRate.buy);
  const generalTotals = {
    nio: totals.NIO + totals.USD * buyRate,
    usd: totals.USD + totals.NIO / buyRate,
  };

  useEffect(() => {
    window.localStorage.setItem('temo:cash-count-draft', JSON.stringify(quantities));
  }, [quantities]);

  useEffect(() => {
    window.localStorage.setItem('temo:cash-pile-draft', JSON.stringify(pileDrafts));
  }, [pileDrafts]);

  function updatePileField(denominationId: string, field: 'groups' | 'loose', value: string) {
    const cleanValue = value.replace(/\D/g, '');
    const nextPile = {
      ...pileDrafts[denominationId],
      [field]: cleanValue ? String(Number(cleanValue)) : '',
    };
    setPileDrafts((current) => ({ ...current, [denominationId]: nextPile }));
    setQuantities((current) => {
      const quantity = calculatePileQuantity(nextPile);
      return { ...current, [denominationId]: quantity ? String(quantity) : '' };
    });
  }

  function clearCount() {
    setQuantities({});
    setPileDrafts({});
    window.localStorage.removeItem('temo:cash-count-saved-at');
    window.localStorage.removeItem('temo:cash-pile-draft');
  }

  function saveCount() {
    const nextSavedAt = formatTransactionDateTime(new Date());
    window.localStorage.setItem('temo:cash-count-saved-at', nextSavedAt);
    window.localStorage.setItem('temo:cash-count-draft', JSON.stringify(quantities));
    window.localStorage.setItem('temo:cash-pile-draft', JSON.stringify(pileDrafts));
  }

  return (
    <section className="screen-stack">
      <article className="panel">
        <div className="panel__header table-panel-header">
          <div className="cash-count-title-row">
            <div>
              <p>Conteo fisico</p>
              <h2>Arqueo por denominacion</h2>
            </div>
            <div className="cash-rate-chip" aria-label="Tasa de cambio global">
              <span>Tasa global USD</span>
              <strong>Compra C$ {formatRateDisplay(exchangeRate.buy)}</strong>
              <strong>Venta C$ {formatRateDisplay(exchangeRate.sell)}</strong>
            </div>
          </div>
          <div className="action-row">
            <button type="button" className="secondary-button" onClick={clearCount}>
              <X size={17} />
              Limpiar
            </button>
            <button type="button" className="primary-button" onClick={saveCount}>
              <Save size={17} />
              Guardar
            </button>
          </div>
        </div>

        <div className="cash-count-grid">
          <CashDenominationTable
            currency="NIO"
            denominations={cashDenominations.NIO}
            pileDrafts={pileDrafts}
            quantities={quantities}
            title="Cordobas"
            total={totals.NIO}
            onPileFieldChange={updatePileField}
          />
          <CashDenominationTable
            currency="USD"
            denominations={cashDenominations.USD}
            pileDrafts={pileDrafts}
            quantities={quantities}
            generalTotals={generalTotals}
            title="Dolares"
            total={totals.USD}
            onPileFieldChange={updatePileField}
          />
        </div>
      </article>
    </section>
  );
}

function CashDenominationTable({
  currency,
  denominations,
  generalTotals,
  pileDrafts,
  quantities,
  title,
  total,
  onPileFieldChange,
}: {
  currency: CashCurrency;
  denominations: CashDenomination[];
  generalTotals?: { nio: number; usd: number };
  pileDrafts: Record<string, CashPileDraft>;
  quantities: Record<string, string>;
  title: string;
  total: number;
  onPileFieldChange: (denominationId: string, field: 'groups' | 'loose', value: string) => void;
}) {
  return (
    <section className={`cash-count-card cash-count-card--${currency.toLowerCase()}`}>
      <div className="cash-count-card__header">
        <div>
          <span>{currency}</span>
          <h3>{title}</h3>
        </div>
        <strong>{formatCashCountMoney(total, currency)}</strong>
      </div>

      <div className="table-wrap">
        <table className="cash-count-table">
          <thead>
            <tr>
              <th className="cash-count-table__pile">X25</th>
              <th className="cash-count-table__loose">Sueltos</th>
              <th className="cash-count-table__quantity">Cantidad</th>
              <th>Denominacion</th>
              <th>Monto</th>
            </tr>
          </thead>
          <tbody>
            {denominations.map((denomination) => {
              const pile = getCashPileDraft(denomination.id, quantities, pileDrafts);
              const quantity = calculatePileQuantity(pile);
              const amount = quantity * denomination.value;
              return (
                <tr key={denomination.id}>
                  <td className="cash-count-entry-cell">
                    <input
                      aria-label={`Montones de 25 para ${denomination.label}`}
                      className="cash-count-entry"
                      inputMode="numeric"
                      type="text"
                      value={pile.groups ?? ''}
                      onChange={(event) => onPileFieldChange(denomination.id, 'groups', event.target.value)}
                      placeholder="0"
                    />
                  </td>
                  <td className="cash-count-entry-cell">
                    <input
                      aria-label={`Billetes sueltos para ${denomination.label}`}
                      className="cash-count-entry"
                      inputMode="numeric"
                      type="text"
                      value={pile.loose ?? ''}
                      onChange={(event) => onPileFieldChange(denomination.id, 'loose', event.target.value)}
                      placeholder="0"
                    />
                  </td>
                  <td className="cash-total-quantity-cell">
                    <strong>{quantity}</strong>
                  </td>
                  <td className="cash-denomination-cell">{denomination.label}</td>
                  <td className="cash-amount-cell">{formatCashCountMoney(amount, currency)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Total</td>
              <td>{formatCashCountMoney(total, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {generalTotals && (
        <div className="cash-grand-total" aria-label="Totales generales convertidos">
          <table>
            <tbody>
              <tr>
                <td>C$</td>
                <td>{formatCashCountMoney(generalTotals.nio, 'NIO')}</td>
              </tr>
              <tr>
                <td>$</td>
                <td>{formatCashCountMoney(generalTotals.usd, 'USD')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function GeneralConsolidationScreen() {
  const [balances, setBalances] = useState<Record<string, { initial?: string; system?: string }>>(() => readConsolidationBalances());
  const entities = useMemo(() => getActiveEntities(), []);
  const nioSummary = useMemo(() => summarizeTransactionsByEntity('NIO'), []);
  const usdSummary = useMemo(() => summarizeTransactionsByEntity('USD'), []);

  useEffect(() => {
    window.localStorage.setItem('temo:general-consolidation-balances', JSON.stringify(balances));
  }, [balances]);

  function updateBalance(currency: CashCurrency, entity: string, field: 'initial' | 'system', value: string) {
    const cleanValue = normalizeConsolidationRaw(value);
    const key = getConsolidationKey(currency, entity);
    setBalances((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: cleanValue,
      },
    }));
  }

  function handleMoneyInputKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    currency: CashCurrency,
    entity: string,
    field: 'initial' | 'system',
    currentValue?: string,
  ) {
    const allowedControlKeys = ['Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (event.ctrlKey || event.metaKey || allowedControlKeys.includes(event.key)) {
      return;
    }

    const currentRaw = normalizeConsolidationRaw(currentValue);
    if (event.key === 'Backspace') {
      event.preventDefault();
      updateBalance(currency, entity, field, currentRaw.slice(0, -1));
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      updateBalance(currency, entity, field, '');
      return;
    }

    if (event.key === '.') {
      event.preventDefault();
      if (!currentRaw.includes('.')) {
        updateBalance(currency, entity, field, `${currentRaw || '0'}.`);
      }
      return;
    }

    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      const [integerPart = '', decimalPart] = currentRaw.split('.');
      if (currentRaw.includes('.')) {
        if ((decimalPart ?? '').length < 2) {
          updateBalance(currency, entity, field, `${integerPart || '0'}.${decimalPart ?? ''}${event.key}`);
        }
        return;
      }
      if (integerPart.length < 10) {
        updateBalance(currency, entity, field, `${integerPart}${event.key}`);
      }
      return;
    }

    event.preventDefault();
  }

  function handleMoneyInputPaste(
    event: ClipboardEvent<HTMLInputElement>,
    currency: CashCurrency,
    entity: string,
    field: 'initial' | 'system',
  ) {
    event.preventDefault();
    updateBalance(currency, entity, field, event.clipboardData.getData('text'));
  }

  return (
    <section className="screen-stack">
      <article className="panel">
        <div className="panel__header table-panel-header">
          <div>
            <p>Conciliacion por entidad</p>
            <h2>Consolidado de montos generales</h2>
          </div>
        </div>

        <div className="consolidation-stack">
          <ConsolidationTable
            balances={balances}
            currency="NIO"
            entities={entities}
            summary={nioSummary}
            title="Consolidado en Cordobas (NIO)"
            onMoneyInputKeyDown={handleMoneyInputKeyDown}
            onMoneyInputPaste={handleMoneyInputPaste}
            onBalanceChange={updateBalance}
          />
          <ConsolidationTable
            balances={balances}
            currency="USD"
            entities={entities}
            summary={usdSummary}
            title="Consolidado en Dolares (USD)"
            onMoneyInputKeyDown={handleMoneyInputKeyDown}
            onMoneyInputPaste={handleMoneyInputPaste}
            onBalanceChange={updateBalance}
          />
        </div>
      </article>
    </section>
  );
}

function ConsolidationTable({
  balances,
  currency,
  entities,
  summary,
  title,
  onBalanceChange,
  onMoneyInputKeyDown,
  onMoneyInputPaste,
}: {
  balances: Record<string, { initial?: string; system?: string }>;
  currency: CashCurrency;
  entities: string[];
  summary: Record<string, { income: number; expense: number }>;
  title: string;
  onBalanceChange: (currency: CashCurrency, entity: string, field: 'initial' | 'system', value: string) => void;
  onMoneyInputKeyDown: (
    event: KeyboardEvent<HTMLInputElement>,
    currency: CashCurrency,
    entity: string,
    field: 'initial' | 'system',
    currentValue?: string,
  ) => void;
  onMoneyInputPaste: (
    event: ClipboardEvent<HTMLInputElement>,
    currency: CashCurrency,
    entity: string,
    field: 'initial' | 'system',
  ) => void;
}) {
  const totals = entities.reduce(
    (acc, entity) => {
      const key = getConsolidationKey(currency, entity);
      const rowBalance = balances[key] ?? {};
      const movement = summary[entity] ?? { income: 0, expense: 0 };
      const initial = parseConsolidationValue(rowBalance.initial);
      const system = parseConsolidationValue(rowBalance.system);
      const finalBalance = initial + movement.income - movement.expense;
      acc.initial += initial;
      acc.income += movement.income;
      acc.expense += movement.expense;
      acc.finalBalance += finalBalance;
      acc.system += system;
      acc.difference += system - finalBalance;
      return acc;
    },
    { initial: 0, income: 0, expense: 0, finalBalance: 0, system: 0, difference: 0 },
  );

  return (
    <section className={`consolidation-card consolidation-card--${currency.toLowerCase()}`}>
      <div className="consolidation-card__header">
        <h3>{title}</h3>
      </div>

      <div className="table-wrap">
        <table className="consolidation-table">
          <colgroup>
            <col className="consolidation-col-bank" />
            <col className="consolidation-col-money" />
            <col className="consolidation-col-money" />
            <col className="consolidation-col-money" />
            <col className="consolidation-col-money" />
            <col className="consolidation-col-money" />
            <col className="consolidation-col-difference" />
          </colgroup>
          <thead>
            <tr>
              <th>Banco</th>
              <th>Saldo inicial</th>
              <th>Ingresos</th>
              <th>Egresos</th>
              <th>Saldo final</th>
              <th>Saldo sistema</th>
              <th>Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((entity) => {
              const key = getConsolidationKey(currency, entity);
              const rowBalance = balances[key] ?? {};
              const movement = summary[entity] ?? { income: 0, expense: 0 };
              const initial = parseConsolidationValue(rowBalance.initial);
              const system = parseConsolidationValue(rowBalance.system);
              const finalBalance = initial + movement.income - movement.expense;
              const difference = system - finalBalance;
              return (
                <tr key={key}>
                  <td className="consolidation-entity-cell">{entity}</td>
                  <td>
                    <div className="consolidation-input-wrap">
                      <span>{getCurrencySymbol(currency)}</span>
                      <input
                        className="consolidation-input"
                        inputMode="decimal"
                        value={formatConsolidationInput(rowBalance.initial)}
                        onChange={(event) => onBalanceChange(currency, entity, 'initial', event.target.value)}
                        onKeyDown={(event) => onMoneyInputKeyDown(event, currency, entity, 'initial', rowBalance.initial)}
                        onPaste={(event) => onMoneyInputPaste(event, currency, entity, 'initial')}
                        placeholder="0.00"
                      />
                    </div>
                  </td>
                  <td className="consolidation-money-cell">
                    <MoneyAmount currency={currency} value={movement.income} />
                  </td>
                  <td className="consolidation-money-cell">
                    <MoneyAmount currency={currency} value={movement.expense} />
                  </td>
                  <td className="consolidation-money-cell">
                    <MoneyAmount currency={currency} value={finalBalance} />
                  </td>
                  <td>
                    <div className="consolidation-input-wrap">
                      <span>{getCurrencySymbol(currency)}</span>
                      <input
                        className="consolidation-input"
                        inputMode="decimal"
                        value={formatConsolidationInput(rowBalance.system)}
                        onChange={(event) => onBalanceChange(currency, entity, 'system', event.target.value)}
                        onKeyDown={(event) => onMoneyInputKeyDown(event, currency, entity, 'system', rowBalance.system)}
                        onPaste={(event) => onMoneyInputPaste(event, currency, entity, 'system')}
                        placeholder="0.00"
                      />
                    </div>
                  </td>
                  <td>{renderDifference(difference, currency)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              <td><MoneyAmount currency={currency} value={totals.initial} /></td>
              <td><MoneyAmount currency={currency} value={totals.income} /></td>
              <td><MoneyAmount currency={currency} value={totals.expense} /></td>
              <td><MoneyAmount currency={currency} value={totals.finalBalance} /></td>
              <td><MoneyAmount currency={currency} value={totals.system} /></td>
              <td>{renderDifference(totals.difference, currency)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function MoneyAmount({ currency, value }: { currency: CashCurrency; value: number }) {
  return (
    <span className="money-split">
      <span>{getCurrencySymbol(currency)}</span>
      <strong>{formatMoneyNumber(value)}</strong>
    </span>
  );
}

function renderDifference(value: number, currency: CashCurrency) {
  if (Math.abs(value) < 0.005) {
    return <span className="difference-badge difference-badge--ok">---</span>;
  }

  const isSurplus = value > 0;
  return (
    <span className={`difference-badge ${isSurplus ? 'difference-badge--surplus' : 'difference-badge--shortage'}`}>
      {isSurplus ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
      {isSurplus ? 'Sobra' : 'Falta'} {formatCashCountMoney(Math.abs(value), currency)}
    </span>
  );
}

function ShiftTable({ config }: { config: CrudConfig }) {
  const [rows, setRows] = usePersistentRows(config.storageKey, config.rows);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'open' | 'edit' | 'close'; row: CrudRow } | null>(null);
  const [viewRow, setViewRow] = useState<CrudRow | null>(null);

  const columns = useMemo(() => getVisibleColumns(config), [config]);
  const normalizedRows = useMemo(() => rows.map(normalizeShiftRow), [rows]);

  const processedRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedRows.filter((row) => {
      const matchesInactive = showInactive || !isInactive(row);
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'open' && row.status === 'Abierto') ||
        (statusFilter === 'closed' && row.status === 'Cerrado');
      const matchesQuery =
        !normalizedQuery ||
        Object.values(row).some((value) => String(value).toLowerCase().includes(normalizedQuery));
      const matchesColumnFilters = Object.entries(filters).every(([key, value]) => {
        const column = columns.find((item) => item.key === key);
        const cellValue = column ? getCellValue(row, column) : row[key] ?? '';
        return !value || String(cellValue).toLowerCase().includes(value.toLowerCase());
      });
      return matchesInactive && matchesStatus && matchesQuery && matchesColumnFilters;
    });

    if (!sortKey || !sortDirection) {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      const column = columns.find((item) => item.key === sortKey);
      const first = String(column ? getCellValue(a, column) : a[sortKey] ?? '').toLowerCase();
      const second = String(column ? getCellValue(b, column) : b[sortKey] ?? '').toLowerCase();
      return sortDirection === 'asc' ? first.localeCompare(second) : second.localeCompare(first);
    });
  }, [columns, filters, normalizedRows, query, showInactive, sortDirection, sortKey, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(processedRows.length / pageSize));
  const pageRows = processedRows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [filters, pageSize, query, showInactive, statusFilter]);

  function openCreateModal() {
    setModal({
      mode: 'open',
      row: {
        id: nextReadableId(rows, config.idPrefix),
        branch: 'Tienda principal',
        register: 'Caja 1',
        cashier: 'Dueña',
        openingNio: '',
        openingUsd: '',
        openingNotes: '',
        status: 'Abierto',
      },
    });
  }

  function openEditModal(row: CrudRow) {
    setModal({ mode: 'edit', row: normalizeShiftRow(row) });
  }

  function openCloseModal(row: CrudRow) {
    setModal({ mode: 'close', row: normalizeShiftRow(row) });
  }

  function saveShift(row: CrudRow, mode: 'open' | 'edit' | 'close') {
    const normalizedRow = normalizeShiftRow(row);
    const now = formatShiftDateTime(new Date());
    const rowToSave: CrudRow =
      mode === 'close'
        ? {
            ...normalizedRow,
            closedAt: now,
            closingCash: formatShiftCash(normalizedRow.closingNio, normalizedRow.closingUsd),
            status: 'Cerrado',
          }
        : {
            ...normalizedRow,
            openedAt: normalizedRow.openedAt || now,
            closedAt: normalizedRow.closedAt || '',
            openingCash: formatShiftCash(normalizedRow.openingNio, normalizedRow.openingUsd),
            closingCash: normalizedRow.closingCash || '',
            status: normalizedRow.status || 'Abierto',
          };

    if (mode === 'open') {
      setRows((currentRows) => [...currentRows, rowToSave]);
    } else {
      setRows((currentRows) => currentRows.map((item) => (item.id === rowToSave.id ? rowToSave : item)));
    }
    setModal(null);
  }

  function cycleShiftStatusFilter() {
    setStatusFilter((current) => {
      if (current === 'all') {
        return 'open';
      }
      if (current === 'open') {
        return 'closed';
      }
      return 'all';
    });
  }

  function cycleSort(columnKey: string) {
    if (sortKey !== columnKey) {
      setSortKey(columnKey);
      setSortDirection('desc');
      return;
    }
    if (sortDirection === 'desc') {
      setSortDirection('asc');
      return;
    }
    setSortKey(columnKey);
    setSortDirection('desc');
  }

  const filterTitle =
    statusFilter === 'all' ? 'Todos los turnos' : statusFilter === 'open' ? 'Turnos abiertos' : 'Turnos cerrados';

  return (
    <section className="screen-stack">
      <article className="panel">
        <div className="panel__header table-panel-header">
          <div>
            <p>{config.description}</p>
            <h2>{config.title}</h2>
          </div>
          <div className="action-row">
            <button type="button" className="secondary-button" onClick={() => exportExcel(config.title, columns, processedRows)}>
              <FileSpreadsheet size={17} />
              Excel
            </button>
            <button type="button" className="secondary-button" onClick={() => exportPdf(config.title, columns, processedRows)}>
              <FileText size={17} />
              PDF
            </button>
            <button type="button" className="primary-button" onClick={openCreateModal}>
              <Plus size={17} />
              Agregar
            </button>
          </div>
        </div>

        <div className="table-toolbar">
          <label className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar turnos" />
          </label>
          <div className="table-toolbar-controls">
            <label className="switch-control switch-control--small">
              <input checked={showInactive} type="checkbox" onChange={(event) => setShowInactive(event.target.checked)} />
              <span />
              Mostrar inactivos
            </label>
            <label className="page-size-control">
              Registros
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                {[10, 20, 30, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="number-column">
                  <div className="th-stack">
                    <span>N°</span>
                  </div>
                </th>
                {columns.map((column) => {
                  const isColumnModified = Boolean(filters[column.key]) || sortKey === column.key;
                  return (
                    <th key={column.key} className={isColumnModified ? 'table-header--modified' : undefined}>
                      <div className="th-stack">
                        <button type="button" className="th-sort-button" onClick={() => cycleSort(column.key)}>
                          {column.label}
                          {sortKey === column.key && sortDirection === 'asc' && <ArrowDownAZ size={14} />}
                          {sortKey === column.key && sortDirection === 'desc' && <ArrowUpZA size={14} />}
                          {sortKey !== column.key && <ArrowUpDown size={14} />}
                        </button>
                        <input
                          value={filters[column.key] ?? ''}
                          onChange={(event) => setFilters((current) => ({ ...current, [column.key]: event.target.value }))}
                          placeholder="Filtrar"
                        />
                      </div>
                    </th>
                  );
                })}
                <th>
                  <div className="th-stack">
                    <span>Acciones</span>
                    <button
                      type="button"
                      className={`status-filter shift-status-filter shift-status-filter--${statusFilter}`}
                      onClick={cycleShiftStatusFilter}
                      title={filterTitle}
                    >
                      <CheckCircle2 size={15} />
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, index) => (
                <tr
                  key={row.id}
                  className={selectedRowId === row.id ? 'selected-row' : undefined}
                  onClick={() => setSelectedRowId(row.id)}
                  onDoubleClick={() => setViewRow(row)}
                >
                  <td className="number-column">{processedRows.length - ((page - 1) * pageSize + index)}</td>
                  {columns.map((column) => (
                    <td key={column.key} className="multi-line-cell">
                      {getCellValue(row, column) || 'Pendiente'}
                    </td>
                  ))}
                  <td>
                    <div className="row-actions">
                      <button type="button" className="icon-action" title="Editar" onClick={(event) => { event.stopPropagation(); openEditModal(row); }}>
                        <Edit3 size={16} />
                      </button>
                      <button
                        type="button"
                        className={`icon-action ${row.status === 'Cerrado' ? 'icon-action--inactive' : ''}`}
                        title={row.status === 'Cerrado' ? 'Turno cerrado' : 'Cerrar turno'}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (row.status !== 'Cerrado') {
                            openCloseModal(row);
                          }
                        }}
                      >
                        {row.status === 'Cerrado' ? <CheckCircle2 size={16} /> : <LockKeyhole size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination-bar">
          <span>
            Mostrando {pageRows.length} de {processedRows.length} registros
          </span>
          <div className="action-row">
            <button type="button" className="icon-button" onClick={() => setPage(1)} disabled={page === 1}>
              <ChevronsLeft size={17} />
            </button>
            <button type="button" className="icon-button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
              <ChevronLeft size={17} />
            </button>
            <span>
              Pagina {page} de {totalPages}
            </span>
            <button type="button" className="icon-button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>
              <ChevronRight size={17} />
            </button>
            <button type="button" className="icon-button" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
              <ChevronsRight size={17} />
            </button>
          </div>
        </div>
      </article>

      {modal && (
        <ShiftModal
          mode={modal.mode}
          row={modal.row}
          onCancel={() => setModal(null)}
          onSave={(row) => saveShift(row, modal.mode)}
        />
      )}

      {viewRow && (
        <RowDetailModal
          columns={config.columns}
          row={normalizeShiftRow(viewRow)}
          title="Turno"
          onClose={() => setViewRow(null)}
          onEdit={(row) => {
            setViewRow(null);
            openEditModal(row);
          }}
        />
      )}
    </section>
  );
}

function ShiftModal({
  mode,
  row,
  onCancel,
  onSave,
}: {
  mode: 'open' | 'edit' | 'close';
  row: CrudRow;
  onCancel: () => void;
  onSave: (row: CrudRow) => void;
}) {
  const [draft, setDraft] = useState(() => normalizeShiftRow(row));
  const modalRef = useAutoFocusFirstField<HTMLElement>();
  const branchRows = readStoredRows(crudConfigs.branches[0].storageKey, crudConfigs.branches[0].rows);
  const userRows = readStoredRows(crudConfigs.users[0].storageKey, crudConfigs.users[0].rows);
  const branchOptions = branchRows.map((item) => item.name).filter(Boolean);
  const cashierOptions = userRows.map((item) => [item.firstName, item.lastName].filter(Boolean).join(' ')).filter(Boolean);
  const isCloseMode = mode === 'close';
  const title = isCloseMode ? 'Cerrar turno' : mode === 'edit' ? 'Editar turno' : 'Apertura de turno';

  function updateField(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-panel transaction-modal-panel" ref={modalRef}>
        <div className="modal-header">
          <div>
            <p>{isCloseMode ? 'Cierre operativo' : 'Apertura operativa'}</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="form-grid">
          <label className="form-field">
            ID
            <input value={draft.id} disabled />
          </label>
          <label className="form-field">
            Sucursal
            <select value={draft.branch} onChange={(event) => updateField('branch', event.target.value)} disabled={isCloseMode}>
              {branchOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Caja
            <select value={draft.register} onChange={(event) => updateField('register', event.target.value)} disabled={isCloseMode}>
              {['Caja 1', 'Caja 2 Apoyo', 'Caja 3'].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Cajero
            <select value={draft.cashier} onChange={(event) => updateField('cashier', event.target.value)} disabled={isCloseMode}>
              {cashierOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            Efectivo Inicial NIO
            <input value={draft.openingNio} inputMode="decimal" onChange={(event) => updateField('openingNio', event.target.value)} disabled={isCloseMode} />
          </label>
          <label className="form-field">
            Efectivo Inicial USD
            <input value={draft.openingUsd} inputMode="decimal" onChange={(event) => updateField('openingUsd', event.target.value)} disabled={isCloseMode} />
          </label>
          {isCloseMode && (
            <>
              <label className="form-field">
                Efectivo Final NIO
                <input value={draft.closingNio} inputMode="decimal" onChange={(event) => updateField('closingNio', event.target.value)} />
              </label>
              <label className="form-field">
                Efectivo Final USD
                <input value={draft.closingUsd} inputMode="decimal" onChange={(event) => updateField('closingUsd', event.target.value)} />
              </label>
            </>
          )}
          {isCloseMode && draft.openingNotes && (
            <div className="form-field form-field--wide">
              Observaciones existentes
              <ul className="note-list">
                <li>{draft.openingNotes}</li>
                {draft.closingNotes && <li>{draft.closingNotes}</li>}
              </ul>
            </div>
          )}
          <label className="form-field form-field--wide">
            Observaciones
            <textarea
              value={isCloseMode ? draft.closingNotes : draft.openingNotes}
              rows={3}
              onChange={(event) => updateField(isCloseMode ? 'closingNotes' : 'openingNotes', event.target.value)}
            />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            <X size={17} />
            Cancelar
          </button>
          <button type="button" className="primary-button" onClick={() => onSave(draft)}>
            <Save size={17} />
            Guardar
          </button>
        </div>
      </section>
    </div>
  );
}

function TransactionTable({ config }: { config: CrudConfig }) {
  const [rows, setRows] = usePersistentRows(config.storageKey, config.rows);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [currencyFilter, setCurrencyFilter] = useState<'NIO' | 'USD' | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: ModalMode; row: CrudRow } | null>(null);
  const [viewRow, setViewRow] = useState<CrudRow | null>(null);
  const columns = useMemo(() => getVisibleColumns(config), [config]);
  const normalizedRows = useMemo(() => rows.map(normalizeTransactionRow), [rows]);

  const processedRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedRows.filter((row) => {
      const matchesInactive = showInactive || !isInactive(row);
      const matchesCurrency = !currencyFilter || row.currency === currencyFilter;
      const matchesQuery =
        !normalizedQuery ||
        Object.values(row).some((value) => String(value).toLowerCase().includes(normalizedQuery));
      const matchesColumnFilters = Object.entries(filters).every(([key, value]) => {
        const column = columns.find((item) => item.key === key);
        const cellValue = column ? getCellValue(row, column) : row[key] ?? '';
        return !value || String(cellValue).toLowerCase().includes(value.toLowerCase());
      });
      return matchesInactive && matchesCurrency && matchesQuery && matchesColumnFilters;
    });

    if (!sortKey || !sortDirection) {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      const column = columns.find((item) => item.key === sortKey);
      const first = String(column ? getCellValue(a, column) : a[sortKey] ?? '').toLowerCase();
      const second = String(column ? getCellValue(b, column) : b[sortKey] ?? '').toLowerCase();
      return sortDirection === 'asc' ? first.localeCompare(second) : second.localeCompare(first);
    });
  }, [columns, currencyFilter, filters, normalizedRows, query, showInactive, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(processedRows.length / pageSize));
  const pageRows = processedRows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [currencyFilter, filters, pageSize, query, showInactive]);

  function cycleSort(columnKey: string) {
    if (sortKey !== columnKey) {
      setSortKey(columnKey);
      setSortDirection('desc');
      return;
    }
    if (sortDirection === 'desc') {
      setSortDirection('asc');
      return;
    }
    setSortKey(columnKey);
    setSortDirection('desc');
  }

  function openCreateModal() {
    const entity = 'BAC';
    const movement = getTransactionMovementOptions(entity)[0] ?? '';
    setModal({
      mode: 'create',
      row: {
        id: nextReadableId(rows, config.idPrefix),
        registeredAt: '',
        entity,
        movement,
        direction: getTransactionMovementDirection(entity, movement),
        currency: 'NIO',
        amountValue: '',
        pendingName: '',
        description: '',
        cashCountNio: '{}',
        cashCountUsd: '{}',
        status: 'Registrada',
      },
    });
  }

  function openEditModal(row: CrudRow) {
    setModal({ mode: 'edit', row: normalizeTransactionRow(row) });
  }

  function saveTransaction(row: CrudRow) {
    const normalizedRow = normalizeTransactionRow(row);
    const direction = getTransactionMovementDirection(normalizedRow.entity, normalizedRow.movement);
    const rowToSave: CrudRow = {
      ...normalizedRow,
      direction,
      registeredAt: modal?.mode === 'create' ? formatTransactionDateTime(new Date()) : normalizedRow.registeredAt,
      amount: formatTransactionMoney({ ...normalizedRow, direction }),
      pendingName: normalizedRow.pendingName.trim(),
    };

    if (modal?.mode === 'create') {
      setRows((currentRows) => [...currentRows, rowToSave]);
    } else {
      setRows((currentRows) => currentRows.map((item) => (item.id === rowToSave.id ? rowToSave : item)));
    }
    setModal(null);
  }

  function toggleVoid(row: CrudRow) {
    setRows((currentRows) =>
      currentRows.map((item) =>
        item.id === row.id ? { ...item, status: item.status === 'Anulada' ? 'Registrada' : 'Anulada' } : item,
      ),
    );
  }

  return (
    <section className="screen-stack">
      <article className="panel">
        <div className="panel__header table-panel-header">
          <div>
            <p>{config.description}</p>
            <h2>{config.title}</h2>
          </div>
          <div className="action-row">
            <div className="currency-filter currency-filter--header" aria-label="Filtrar por moneda">
              <button
                type="button"
                className={`currency-filter__button ${currencyFilter === 'NIO' ? 'currency-filter__button--active' : ''}`}
                onClick={() => setCurrencyFilter((current) => (current === 'NIO' ? null : 'NIO'))}
                title="Filtrar transacciones en cordobas"
              >
                C$
              </button>
              <button
                type="button"
                className={`currency-filter__button ${currencyFilter === 'USD' ? 'currency-filter__button--active' : ''}`}
                onClick={() => setCurrencyFilter((current) => (current === 'USD' ? null : 'USD'))}
                title="Filtrar transacciones en dolares"
              >
                $
              </button>
            </div>
            <button type="button" className="secondary-button" onClick={() => exportExcel(config.title, columns, processedRows)}>
              <FileSpreadsheet size={17} />
              Excel
            </button>
            <button type="button" className="secondary-button" onClick={() => exportPdf(config.title, columns, processedRows)}>
              <FileText size={17} />
              PDF
            </button>
            <button type="button" className="primary-button" onClick={openCreateModal}>
              <Plus size={17} />
              Agregar
            </button>
          </div>
        </div>

        <div className="table-toolbar">
          <label className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar transacciones" />
          </label>
          <div className="table-toolbar-controls">
            <label className="switch-control switch-control--small">
              <input checked={showInactive} type="checkbox" onChange={(event) => setShowInactive(event.target.checked)} />
              <span />
              Mostrar inactivos
            </label>
            <label className="page-size-control">
              Registros
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                {[10, 20, 30, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="number-column">
                  <div className="th-stack">
                    <span>N°</span>
                  </div>
                </th>
                {columns.map((column) => {
                  const isColumnModified = Boolean(filters[column.key]) || sortKey === column.key;
                  return (
                    <th key={column.key} className={isColumnModified ? 'table-header--modified' : undefined}>
                      <div className="th-stack">
                        <button type="button" className="th-sort-button" onClick={() => cycleSort(column.key)}>
                          {column.label}
                          {sortKey === column.key && sortDirection === 'asc' && <ArrowDownAZ size={14} />}
                          {sortKey === column.key && sortDirection === 'desc' && <ArrowUpZA size={14} />}
                          {sortKey !== column.key && <ArrowUpDown size={14} />}
                        </button>
                        <input
                          value={filters[column.key] ?? ''}
                          onChange={(event) => setFilters((current) => ({ ...current, [column.key]: event.target.value }))}
                          placeholder="Filtrar"
                        />
                      </div>
                    </th>
                  );
                })}
                <th>
                  <div className="th-stack">
                    <span>Acciones</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, index) => (
                <tr
                  key={row.id}
                  className={`${row.status === 'Anulada' ? 'inactive-row' : ''} ${selectedRowId === row.id ? 'selected-row' : ''}`}
                  onClick={() => setSelectedRowId(row.id)}
                  onDoubleClick={() => setViewRow(row)}
                >
                  <td className="number-column">{processedRows.length - ((page - 1) * pageSize + index)}</td>
                  <td>{row.id}</td>
                  <td>{row.registeredAt}</td>
                  <td>{row.entity}</td>
                  <td>{row.movement}</td>
                  <td>
                    <span className={`transaction-amount transaction-amount--${row.direction === 'Salida' ? 'out' : 'in'}`}>
                      {row.direction === 'Salida' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                      <span>{formatTransactionMoney(row)}</span>
                    </span>
                  </td>
                  <td>{row.pendingName || '----'}</td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="icon-action" title="Editar" onClick={(event) => { event.stopPropagation(); openEditModal(row); }}>
                        <Edit3 size={16} />
                      </button>
                      <button
                        type="button"
                        className={`icon-action ${row.status === 'Anulada' ? 'icon-action--inactive' : ''}`}
                        title={row.status === 'Anulada' ? 'Reactivar' : 'Anular'}
                        onClick={(event) => { event.stopPropagation(); toggleVoid(row); }}
                      >
                        {row.status === 'Anulada' ? <RotateCcw size={16} /> : <Ban size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination-bar">
          <span>
            Mostrando {pageRows.length} de {processedRows.length} registros
          </span>
          <div className="action-row">
            <button type="button" className="icon-button" onClick={() => setPage(1)} disabled={page === 1}>
              <ChevronsLeft size={17} />
            </button>
            <button type="button" className="icon-button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
              <ChevronLeft size={17} />
            </button>
            <span>
              Pagina {page} de {totalPages}
            </span>
            <button type="button" className="icon-button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>
              <ChevronRight size={17} />
            </button>
            <button type="button" className="icon-button" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
              <ChevronsRight size={17} />
            </button>
          </div>
        </div>
      </article>

      {modal && (
        <TransactionModal
          mode={modal.mode}
          row={modal.row}
          onCancel={() => setModal(null)}
          onSave={saveTransaction}
        />
      )}

      {viewRow && (
        <RowDetailModal
          columns={config.columns}
          row={normalizeTransactionRow(viewRow)}
          title="Transaccion"
          onClose={() => setViewRow(null)}
          onEdit={(row) => {
            setViewRow(null);
            openEditModal(row);
          }}
        />
      )}
    </section>
  );
}

function TransactionModal({
  mode,
  row,
  onCancel,
  onSave,
}: {
  mode: ModalMode;
  row: CrudRow;
  onCancel: () => void;
  onSave: (row: CrudRow) => void;
}) {
  const [draft, setDraft] = useState(() => normalizeTransactionRow(row));
  const [cashCounts, setCashCounts] = useState<Record<CashCurrency, Record<string, CashPileDraft>>>(() => ({
    NIO: readTransactionCashCount(row.cashCountNio),
    USD: readTransactionCashCount(row.cashCountUsd),
  }));
  const modalRef = useAutoFocusFirstField<HTMLElement>();
  const movementOptions = getTransactionMovementOptions(draft.entity);
  const expectedAmount = parseMoneyValue(draft.amountValue);

  function updateField(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateEntity(value: string) {
    const nextMovement = getTransactionMovementOptions(value)[0] ?? '';
    setDraft((current) => ({
      ...current,
      entity: value,
      movement: nextMovement,
      direction: getTransactionMovementDirection(value, nextMovement),
    }));
  }

  function updateMovement(value: string) {
    setDraft((current) => ({
      ...current,
      movement: value,
      direction: getTransactionMovementDirection(current.entity, value),
    }));
  }

  function updateCashCount(currency: CashCurrency, denominationId: string, field: 'groups' | 'loose', value: string) {
    const cleanValue = value.replace(/\D/g, '');
    setCashCounts((current) => ({
      ...current,
      [currency]: {
        ...current[currency],
        [denominationId]: {
          ...current[currency][denominationId],
          [field]: cleanValue ? String(Number(cleanValue)) : '',
        },
      },
    }));
  }

  function saveWithCashCount() {
    onSave({
      ...draft,
      cashCountNio: serializeTransactionCashCount(cashCounts.NIO),
      cashCountUsd: serializeTransactionCashCount(cashCounts.USD),
    });
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-panel transaction-modal-panel" ref={modalRef}>
        <div className="modal-header">
          <div>
            <p>{mode === 'create' ? 'Nuevo registro' : 'Editar registro'}</p>
            <h2>Registro de transaccion</h2>
          </div>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="form-grid transaction-form-grid">
          <label className="form-field transaction-form-id">
            ID
            <input value={draft.id} disabled />
          </label>
          <label className="form-field transaction-form-bank">
            Banco
            <select value={draft.entity} onChange={(event) => updateEntity(event.target.value)}>
              {['BAC', 'BANPRO', 'LAFISE', 'BDF', 'PEX', 'TELEDOLAR'].map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="form-field transaction-form-movement">
            Movimiento
            <select value={draft.movement} onChange={(event) => updateMovement(event.target.value)} disabled={!movementOptions.length}>
              {!movementOptions.length && <option value="">Sin movimientos activos</option>}
              {movementOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <div className="transaction-form-meta">
            <div className="transaction-direction-field">
              <span>Direccion</span>
              <strong className={`transaction-direction-badge transaction-direction-badge--${draft.direction === 'Salida' ? 'out' : 'in'}`}>
                {draft.direction === 'Salida' ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}
                {draft.direction}
              </strong>
            </div>
            <div className="transaction-currency-field">
              <span>Moneda</span>
              <div className="currency-filter currency-filter--form" aria-label="Seleccionar moneda">
                <button
                  type="button"
                  className={`currency-filter__button ${draft.currency === 'NIO' ? 'currency-filter__button--active' : ''}`}
                  onClick={() => updateField('currency', 'NIO')}
                  title="Cordobas"
                >
                  C$
                </button>
                <button
                  type="button"
                  className={`currency-filter__button ${draft.currency === 'USD' ? 'currency-filter__button--active' : ''}`}
                  onClick={() => updateField('currency', 'USD')}
                  title="Dolares"
                >
                  $
                </button>
              </div>
            </div>
          </div>
          <label className="form-field transaction-form-amount">
            Monto
            <input value={draft.amountValue} inputMode="decimal" onChange={(event) => updateField('amountValue', event.target.value)} />
          </label>
          <label className="form-field transaction-form-pending">
            Pendiente
            <input value={draft.pendingName} placeholder="Nombre de quien queda pendiente" onChange={(event) => updateField('pendingName', event.target.value)} />
          </label>
          <label className="form-field transaction-form-description">
            Descripcion
            <textarea value={draft.description} rows={2} onChange={(event) => updateField('description', event.target.value)} />
          </label>
          <div className="transaction-cash-count-section">
            <div className="transaction-cash-count-heading">
              <div>
                <span>Arqueo de transaccion</span>
                <strong>Conteo fisico recibido o entregado</strong>
              </div>
              <small>Diferencia contra el monto digitado</small>
            </div>
            <div className="transaction-cash-count-grid">
              <TransactionCashCountTable
                currency="NIO"
                denominations={cashDenominations.NIO}
                expectedAmount={draft.currency === 'NIO' ? expectedAmount : 0}
                pileDrafts={cashCounts.NIO}
                onPileFieldChange={(denominationId, field, value) => updateCashCount('NIO', denominationId, field, value)}
              />
              <TransactionCashCountTable
                currency="USD"
                denominations={cashDenominations.USD}
                expectedAmount={draft.currency === 'USD' ? expectedAmount : 0}
                pileDrafts={cashCounts.USD}
                onPileFieldChange={(denominationId, field, value) => updateCashCount('USD', denominationId, field, value)}
              />
            </div>
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            <X size={17} />
            Cancelar
          </button>
          <button type="button" className="primary-button" onClick={saveWithCashCount}>
            <Save size={17} />
            Guardar
          </button>
        </div>
      </section>
    </div>
  );
}

function TransactionCashCountTable({
  currency,
  denominations,
  expectedAmount,
  pileDrafts,
  onPileFieldChange,
}: {
  currency: CashCurrency;
  denominations: CashDenomination[];
  expectedAmount: number;
  pileDrafts: Record<string, CashPileDraft>;
  onPileFieldChange: (denominationId: string, field: 'groups' | 'loose', value: string) => void;
}) {
  const total = calculateCashPileTotal(denominations, pileDrafts);
  const difference = total - expectedAmount;

  return (
    <section className={`transaction-cash-card transaction-cash-card--${currency.toLowerCase()}`}>
      <div className="transaction-cash-card__header">
        <div>
          <span>{currency}</span>
          <strong>{currency === 'NIO' ? 'Cordobas' : 'Dolares'}</strong>
        </div>
        <MoneyAmount currency={currency} value={total} />
      </div>
      <table className="transaction-cash-table">
        <thead>
          <tr>
            <th>X25</th>
            <th>Sueltos</th>
            <th>Cantidad</th>
            <th>Denominacion</th>
            <th>Monto</th>
          </tr>
        </thead>
        <tbody>
          {denominations.map((denomination) => {
            const pile = pileDrafts[denomination.id] ?? {};
            const quantity = calculatePileQuantity(pile);
            const amount = quantity * denomination.value;
            return (
              <tr key={denomination.id}>
                <td>
                  <input
                    aria-label={`Montones de 25 para ${denomination.label}`}
                    className="transaction-cash-entry"
                    inputMode="numeric"
                    type="text"
                    value={pile.groups ?? ''}
                    onChange={(event) => onPileFieldChange(denomination.id, 'groups', event.target.value)}
                    placeholder="0"
                  />
                </td>
                <td>
                  <input
                    aria-label={`Sueltos para ${denomination.label}`}
                    className="transaction-cash-entry"
                    inputMode="numeric"
                    type="text"
                    value={pile.loose ?? ''}
                    onChange={(event) => onPileFieldChange(denomination.id, 'loose', event.target.value)}
                    placeholder="0"
                  />
                </td>
                <td className="transaction-cash-quantity">{quantity}</td>
                <td className="transaction-cash-denomination">{denomination.label}</td>
                <td className="transaction-cash-amount">{formatCashCountMoney(amount, currency)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>Total contado</td>
            <td>{formatCashCountMoney(total, currency)}</td>
          </tr>
          <tr>
            <td colSpan={4}>Diferencia</td>
            <td>{renderDifference(difference, currency)}</td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}

function CrudTable({
  config,
  onRowClick,
  onRowsChange,
}: {
  config: CrudConfig;
  onRowClick?: (row: CrudRow) => void;
  onRowsChange?: (rows: CrudRow[]) => void;
}) {
  const [rows, setRows] = usePersistentRows(config.storageKey, config.rows);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [modal, setModal] = useState<{ mode: ModalMode; row: CrudRow; columns: CrudColumn[] } | null>(null);
  const [viewRow, setViewRow] = useState<CrudRow | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const visibleColumns = useMemo(() => getVisibleColumns(config), [config]);

  // Notifica cambios al padre cuando otra vista necesita reaccionar a la tabla.
  useEffect(() => {
    onRowsChange?.(rows);
  }, [onRowsChange, rows]);

  // Aplica busqueda global, filtros por columna, visibilidad de inactivos y ordenamiento.
  const processedRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      const matchesInactive = showInactive || !isInactive(row);
      const matchesStatusFilter =
        !showInactive ||
        statusFilter === 'all' ||
        (statusFilter === 'active' && !isInactive(row)) ||
        (statusFilter === 'inactive' && isInactive(row));
      const matchesQuery =
        !normalizedQuery ||
        Object.values(row).some((value) => String(value).toLowerCase().includes(normalizedQuery));
      const matchesColumnFilters = Object.entries(filters).every(([key, value]) => {
        const column = visibleColumns.find((item) => item.key === key);
        const cellValue = column ? getCellValue(row, column) : row[key] ?? '';
        return !value || String(cellValue).toLowerCase().includes(value.toLowerCase());
      });
      return matchesInactive && matchesStatusFilter && matchesQuery && matchesColumnFilters;
    });

    if (!sortKey || !sortDirection) {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      const column = visibleColumns.find((item) => item.key === sortKey);
      const first = String(column ? getCellValue(a, column) : a[sortKey] ?? '').toLowerCase();
      const second = String(column ? getCellValue(b, column) : b[sortKey] ?? '').toLowerCase();
      return sortDirection === 'asc' ? first.localeCompare(second) : second.localeCompare(first);
    });
  }, [filters, query, rows, showInactive, sortDirection, sortKey, statusFilter, visibleColumns]);

  const totalPages = Math.max(1, Math.ceil(processedRows.length / pageSize));
  const pageRows = processedRows.slice((page - 1) * pageSize, page * pageSize);

  // Reinicia la pagina cuando cambian filtros o cantidad de registros por pagina.
  useEffect(() => {
    setPage(1);
  }, [query, showInactive, pageSize, filters, statusFilter]);

  // Apaga el filtro de estado cuando se ocultan los inactivos.
  useEffect(() => {
    if (!showInactive) {
      setStatusFilter('all');
    }
  }, [showInactive]);

  // Ajusta columnas de formulario cuando una pantalla necesita opciones calculadas en tiempo real.
  function getFormColumns(currentRow?: CrudRow) {
    if (config.storageKey !== 'commissions') {
      return config.columns;
    }
    return config.columns.map((column) =>
      column.key === 'movement'
        ? { ...column, inputKind: 'select' as InputKind, options: getAvailableCommissionMovements(rows, currentRow) }
        : column,
    );
  }

  // Abre el modal con un registro vacio listo para guardar.
  function openCreateModal() {
    const formColumns = getFormColumns();
    const baseRow = formColumns.reduce<CrudRow>((acc, column) => {
      acc[column.key] = column.key === 'id' ? nextReadableId(rows, config.idPrefix) : getDefaultColumnValue(column);
      return acc;
    }, {});
    if (config.storageKey === 'accounts') {
      baseRow.alias = buildAccountAlias(rows, baseRow.entity, baseRow.currency);
    }
    setModal({ mode: 'create', row: normalizeRowDefaults(baseRow, formColumns), columns: formColumns });
  }

  // Abre el modal de edicion con una copia del registro seleccionado.
  function openEditModal(row: CrudRow) {
    const formColumns = getFormColumns(row);
    setModal({ mode: 'edit', row: normalizeRowDefaults(row, formColumns), columns: formColumns });
  }

  // Desde el detalle se puede pasar a editar sin buscar nuevamente el registro.
  function editFromDetail(row: CrudRow) {
    setViewRow(null);
    openEditModal(row);
  }

  // Guarda altas y ediciones en memoria local del navegador.
  function saveRow(row: CrudRow) {
    const normalizedRow = normalizeRowDefaults(row, modal?.columns ?? config.columns);
    const rowToSave =
      config.storageKey === 'accounts'
        ? {
            ...normalizedRow,
            alias: buildAccountAlias(
              rows,
              normalizedRow.entity,
              normalizedRow.currency,
              modal?.mode === 'edit' ? normalizedRow.id : undefined,
            ),
          }
        : normalizedRow;
    if (modal?.mode === 'create') {
      setRows((currentRows) => [...currentRows, rowToSave]);
    } else {
      setRows((currentRows) => currentRows.map((item) => (item.id === normalizedRow.id ? rowToSave : item)));
    }
    setModal(null);
  }

  // Inactiva o reactiva un registro sin eliminar historial.
  function toggleInactive(row: CrudRow) {
    setRows((currentRows) =>
      currentRows.map((item) =>
        item.id === row.id ? { ...item, status: isInactive(item) ? 'Activo' : 'Inactivo' } : item,
      ),
    );
  }

  // Cambia el ordenamiento en ciclo: sin orden, ascendente, descendente.
  function cycleSort(columnKey: string) {
    if (sortKey !== columnKey) {
      setSortKey(columnKey);
      setSortDirection('desc');
      return;
    }
    if (sortDirection === 'desc') {
      setSortDirection('asc');
      return;
    }
    setSortKey(columnKey);
    setSortDirection('desc');
  }

  // Cambia el filtro visual de estado: todos, activos o inactivos.
  function cycleStatusFilter() {
    setStatusFilter((current) => {
      if (current === 'all') {
        return 'inactive';
      }
      if (current === 'inactive') {
        return 'active';
      }
      return 'all';
    });
  }

  return (
    <article className="panel">
      {/* Encabezado de tabla con acciones principales e iconos intuitivos. */}
      <div className="panel__header table-panel-header">
        <div>
          <p>{config.description}</p>
          <h2>{config.title}</h2>
        </div>
        <div className="action-row">
          <button type="button" className="secondary-button" onClick={() => exportExcel(config.title, visibleColumns, processedRows)}>
            <FileSpreadsheet size={17} />
            Excel
          </button>
          <button type="button" className="secondary-button" onClick={() => exportPdf(config.title, visibleColumns, processedRows)}>
            <FileText size={17} />
            PDF
          </button>
          <button type="button" className="primary-button" onClick={openCreateModal}>
            <Plus size={17} />
            Agregar
          </button>
        </div>
      </div>

      {/* Barra de busqueda, visibilidad de inactivos y tamano de pagina. */}
      <div className="table-toolbar">
        <label className="search-box">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en toda la tabla" />
        </label>
        <div className="table-toolbar-controls">
          <label className="switch-control switch-control--small">
            <input checked={showInactive} type="checkbox" onChange={(event) => setShowInactive(event.target.checked)} />
            <span />
            Mostrar inactivos
          </label>
          <label className="page-size-control">
            Registros
            <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              {[10, 20, 30, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Tabla con filtros por encabezado, ordenamiento y acciones por fila. */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="number-column">
                <div className="th-stack">
                  <span>N°</span>
                </div>
              </th>
              {visibleColumns.map((column) => {
                const isColumnModified = Boolean(filters[column.key]) || sortKey === column.key;
                return (
                <th key={column.key} className={isColumnModified ? 'table-header--modified' : undefined}>
                  <div className="th-stack">
                    <button type="button" className="th-sort-button" onClick={() => cycleSort(column.key)}>
                      {column.label}
                      {sortKey === column.key && sortDirection === 'asc' && <ArrowDownAZ size={14} />}
                      {sortKey === column.key && sortDirection === 'desc' && <ArrowUpZA size={14} />}
                      {sortKey !== column.key && <ArrowUpDown size={14} />}
                    </button>
                    <input
                      value={filters[column.key] ?? ''}
                      onChange={(event) => setFilters((current) => ({ ...current, [column.key]: event.target.value }))}
                      placeholder="Filtrar"
                    />
                  </div>
                </th>
                );
              })}
              <th>
                <div className="th-stack">
                  <span>Acciones</span>
                  {showInactive && (
                    <button
                      type="button"
                      className={`status-filter status-filter--${statusFilter}`}
                      onClick={cycleStatusFilter}
                      title="Filtrar por estado"
                    >
                      <Ban size={15} />
                    </button>
                  )}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, index) => (
              <tr
                key={row.id}
                className={`${onRowClick ? 'clickable-row' : ''} ${isInactive(row) ? 'inactive-row' : ''} ${selectedRowId === row.id ? 'selected-row' : ''}`}
                onClick={() => {
                  setSelectedRowId(row.id);
                  onRowClick?.(row);
                }}
                onDoubleClick={() => setViewRow(row)}
              >
                <td className="number-column">{processedRows.length - ((page - 1) * pageSize + index)}</td>
                {visibleColumns.map((column) => (
                  <td key={column.key}>{getCellValue(row, column)}</td>
                ))}
                <td>
                  <div className="row-actions">
                    <button type="button" className="icon-action" title="Editar" onClick={(event) => { event.stopPropagation(); openEditModal(row); }}>
                      <Edit3 size={16} />
                    </button>
                    <button
                      type="button"
                      className={`icon-action ${isInactive(row) ? 'icon-action--inactive' : ''}`}
                      title={isInactive(row) ? 'Reactivar' : 'Inactivar'}
                      onClick={(event) => { event.stopPropagation(); toggleInactive(row); }}
                    >
                      {isInactive(row) ? <RotateCcw size={16} /> : <Ban size={16} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Controles de paginacion para ir pagina a pagina o hasta los extremos. */}
      <div className="pagination-bar">
        <span>
          Mostrando {pageRows.length} de {processedRows.length} registros
        </span>
        <div className="action-row">
          <button type="button" className="icon-button" onClick={() => setPage(1)} disabled={page === 1}>
            <ChevronsLeft size={17} />
          </button>
          <button type="button" className="icon-button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
            <ChevronLeft size={17} />
          </button>
          <span>
            Pagina {page} de {totalPages}
          </span>
          <button type="button" className="icon-button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>
            <ChevronRight size={17} />
          </button>
          <button type="button" className="icon-button" onClick={() => setPage(totalPages)} disabled={page === totalPages}>
            <ChevronsRight size={17} />
          </button>
        </div>
      </div>

      {/* Modal superpuesto para agregar o editar registros. */}
      {modal && (
        <CrudModal
          columns={modal.columns}
          mode={modal.mode}
          row={modal.row}
          rows={rows}
          storageKey={config.storageKey}
          title={config.title}
          onCancel={() => setModal(null)}
          onSave={saveRow}
        />
      )}

      {/* Modal de solo lectura que aparece con doble click sobre una fila. */}
      {viewRow && (
        <RowDetailModal
          columns={config.columns}
          row={viewRow}
          title={config.title}
          onClose={() => setViewRow(null)}
          onEdit={editFromDetail}
        />
      )}
    </article>
  );
}

function CrudModal({
  columns,
  mode,
  row,
  rows,
  storageKey,
  title,
  onCancel,
  onSave,
}: {
  columns: CrudColumn[];
  mode: ModalMode;
  row: CrudRow;
  rows: CrudRow[];
  storageKey: string;
  title: string;
  onCancel: () => void;
  onSave: (row: CrudRow) => void;
}) {
  const [draft, setDraft] = useState(() => normalizeRowDefaults(row, columns));
  const modalRef = useAutoFocusFirstField<HTMLElement>();
  const fields = columns.filter((column) => !column.hiddenInForm);
  const hasPercentage = Boolean(normalizePercentage(draft.percentage));
  const hasFixedAmount = Boolean(String(draft.fixed ?? '').trim());

  // Actualiza un campo del formulario sin mutar el registro original.
  function updateField(key: string, value: string) {
    setDraft((current) => {
      const cleanValue = storageKey === 'commissions' && key === 'percentage' ? normalizePercentage(value) : value;
      const next = { ...current, [key]: cleanValue };
      if (storageKey === 'accounts' && (key === 'entity' || key === 'currency')) {
        next.alias = buildAccountAlias(rows, next.entity, next.currency, mode === 'edit' ? next.id : undefined);
      }
      return next;
    });
  }

  function toggleMultiValue(key: string, option: string) {
    setDraft((current) => {
      const values = parseMultiValue(current[key]);
      const nextValues = values.includes(option) ? values.filter((value) => value !== option) : [...values, option];
      return { ...current, [key]: nextValues.join(', ') };
    });
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-panel" ref={modalRef}>
        {/* Encabezado del modal con cierre explicito. */}
        <div className="modal-header">
          <div>
            <p>{mode === 'create' ? 'Nuevo registro' : 'Editar registro'}</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onCancel} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {/* Campos dinamicos segun la configuracion de la tabla. */}
        <div className="form-grid">
          {fields.map((column) => {
            const isCommissionPercentage = storageKey === 'commissions' && column.key === 'percentage';
            const isCommissionCurrency = storageKey === 'commissions' && column.key === 'commissionCurrency';
            const isCommissionFixed = storageKey === 'commissions' && column.key === 'fixed';
            const disabledByCommissionRule =
              (isCommissionPercentage && hasFixedAmount) || ((isCommissionCurrency || isCommissionFixed) && hasPercentage);
            const fieldDisabled = column.readOnly || disabledByCommissionRule;

            return (
              <label key={column.key} className={column.inputKind === 'textarea' ? 'form-field form-field--wide' : 'form-field'}>
                {column.label}
                {column.inputKind === 'textarea' ? (
                  <textarea value={draft[column.key] ?? ''} rows={3} onChange={(event) => updateField(column.key, event.target.value)} />
                ) : column.inputKind === 'select' ? (
                  <select value={draft[column.key] || column.options?.[0] || ''} onChange={(event) => updateField(column.key, event.target.value)} disabled={fieldDisabled || !column.options?.length}>
                    {!column.options?.length && <option value="">Sin opciones disponibles</option>}
                    {column.options?.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : column.inputKind === 'multiselect' ? (
                  <div className="multi-select-list">
                    {column.options?.map((option) => {
                      const checked = parseMultiValue(draft[column.key]).includes(option);
                      return (
                        <label key={option} className="multi-select-option">
                          <input
                            checked={checked}
                            type="checkbox"
                            onChange={() => toggleMultiValue(column.key, option)}
                          />
                          <span>{option}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : isCommissionPercentage ? (
                  <div className="input-affix">
                    <input
                      value={normalizePercentage(draft[column.key])}
                      inputMode="decimal"
                      type="text"
                      onChange={(event) => updateField(column.key, event.target.value)}
                      disabled={fieldDisabled}
                    />
                    <span>%</span>
                  </div>
                ) : (
                  <input
                    value={draft[column.key] ?? ''}
                    type={column.inputKind === 'password' ? 'password' : 'text'}
                    onChange={(event) => updateField(column.key, event.target.value)}
                    disabled={fieldDisabled}
                  />
                )}
              </label>
            );
          })}
        </div>

        {/* Acciones del modal: cancelar descarta, guardar confirma el cambio. */}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onCancel}>
            <X size={17} />
            Cancelar
          </button>
          <button type="button" className="primary-button" onClick={() => onSave(draft)}>
            <Save size={17} />
            Guardar
          </button>
        </div>
      </section>
    </div>
  );
}

function RowDetailModal({
  columns,
  row,
  title,
  onClose,
  onEdit,
}: {
  columns: CrudColumn[];
  row: CrudRow;
  title: string;
  onClose: () => void;
  onEdit: (row: CrudRow) => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-panel">
        {/* Encabezado del detalle de fila abierto con doble click. */}
        <div className="modal-header">
          <div>
            <p>Vista de registro</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {/* Todos los campos se muestran en lectura, incluso los ocultos en tabla. */}
        <div className="detail-grid">
          {columns.map((column) => (
            <div key={column.key} className="detail-item">
              <span>{column.label}</span>
              <strong>{row[column.key] || 'Sin dato'}</strong>
            </div>
          ))}
        </div>

        {/* Acciones del detalle: cerrar o saltar al formulario de edicion. */}
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            <X size={17} />
            Cerrar
          </button>
          <button type="button" className="primary-button" onClick={() => onEdit(row)}>
            <Edit3 size={17} />
            Editar
          </button>
        </div>
      </section>
    </div>
  );
}

function RolePermissionsScreen() {
  const roleConfig: CrudConfig = {
    storageKey: 'roles',
    title: 'Roles',
    description: 'Seleccione un rol para administrar sus permisos.',
    idPrefix: 'ROL',
    columns: [
      { key: 'id', label: 'IdRol', readOnly: true },
      { key: 'code', label: 'Detalle nombre clave' },
      { key: 'name', label: 'Nombre visible' },
      { key: 'description', label: 'Descripcion', inputKind: 'textarea' },
      { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo'] },
    ],
    rows: [
      { id: 'ROL-001', code: 'DUENA', name: 'Duena', description: 'Acceso completo al sistema', status: 'Activo' },
      { id: 'ROL-002', code: 'CAJERO', name: 'Cajero', description: 'Operacion diaria sin comisiones', status: 'Activo' },
    ],
  };

  const permissionConfig: CrudConfig = {
    storageKey: 'permissions',
    title: 'Permisos',
    description: 'Catalogo de permisos por funcion y pantalla.',
    idPrefix: 'PER',
    columns: [
      { key: 'id', label: 'IdPermiso', readOnly: true },
      { key: 'code', label: 'Detalle nombre clave' },
      { key: 'name', label: 'Nombre visible' },
      { key: 'description', label: 'Descripcion', inputKind: 'textarea' },
      { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo'] },
    ],
    rows: basePermissions,
  };

  const [permissionRows, setPermissionRows] = useState<CrudRow[]>(() => {
    const stored = window.localStorage.getItem(`temo:${permissionConfig.storageKey}`);
    return stored ? (JSON.parse(stored) as CrudRow[]) : permissionConfig.rows;
  });
  const [selectedRole, setSelectedRole] = useState<CrudRow | null>(null);

  return (
    <section className="screen-stack">
      {/* La tabla de roles abre el modal de permisos al hacer click sobre una fila. */}
      <CrudTable config={roleConfig} onRowClick={setSelectedRole} />

      {/* Los permisos tambien son un catalogo CRUD para registrar nuevas funciones del sistema. */}
      <CrudTable config={permissionConfig} onRowsChange={setPermissionRows} />

      {/* Modal especializado para activar o desactivar permisos por rol. */}
      {selectedRole && <RolePermissionModal role={selectedRole} permissions={permissionRows} onClose={() => setSelectedRole(null)} />}
    </section>
  );
}

function RolePermissionModal({
  role,
  permissions,
  onClose,
}: {
  role: CrudRow;
  permissions: CrudRow[];
  onClose: () => void;
}) {
  const storageKey = `temo:role-permissions:${role.id}`;
  const [enabledPermissions, setEnabledPermissions] = useState<Record<string, boolean>>(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      return JSON.parse(stored) as Record<string, boolean>;
    }
    return permissions.reduce<Record<string, boolean>>((acc, permission) => {
      acc[permission.id] = role.code === 'DUENA' || ['REGISTRAR_TRANSACCIONES', 'ANULAR_TRANSACCIONES', 'EXPORTAR_REPORTES'].includes(permission.code);
      return acc;
    }, {});
  });

  // Persiste los switches de permisos del rol seleccionado.
  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(enabledPermissions));
  }, [enabledPermissions, storageKey]);

  // Cambia el permiso individual sin cerrar el modal.
  function togglePermission(permissionId: string) {
    setEnabledPermissions((current) => ({ ...current, [permissionId]: !current[permissionId] }));
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal-panel modal-panel--wide">
        {/* Encabezado del modal de permisos por rol. */}
        <div className="modal-header">
          <div>
            <p>Permisos asignados</p>
            <h2>{role.code}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {/* Lista todos los permisos con interruptor de activacion para el rol. */}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>N°</th>
                <th>Nombre clave</th>
                <th>Descripcion</th>
                <th>Activo para este rol</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((permission, index) => (
                <tr key={permission.id}>
                  <td>{index + 1}</td>
                  <td>{permission.code}</td>
                  <td>{permission.description}</td>
                  <td>
                    <label className="switch-control switch-control--compact">
                      <input
                        checked={Boolean(enabledPermissions[permission.id])}
                        type="checkbox"
                        onChange={() => togglePermission(permission.id)}
                      />
                      <span />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Boton de cierre porque cada switch queda guardado de inmediato en esta maqueta. */}
        <div className="modal-actions">
          <button type="button" className="primary-button" onClick={onClose}>
            <Save size={17} />
            Guardar
          </button>
        </div>
      </section>
    </div>
  );
}

function FormFieldControl({ field }: { field: ProcessField }) {
  if (field.kind === 'textarea') {
    return (
      <label className="form-field form-field--wide">
        {field.label}
        {/* Textarea para observaciones largas o detalles del proceso. */}
        <textarea placeholder={field.placeholder} rows={3} />
      </label>
    );
  }

  if (field.kind === 'select') {
    return (
      <label className="form-field">
        {field.label}
        {/* Select temporal con opciones base mientras se conecta a catalogos. */}
        <select defaultValue={field.options?.[0]}>
          {field.options?.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="form-field">
      {field.label}
      {/* Input generico para montos, fechas, nombres, usuarios y codigos. */}
      <input placeholder={field.placeholder} type={field.kind === 'password' ? 'password' : 'text'} />
    </label>
  );
}

// Exporta la tabla filtrada como archivo compatible con Excel.
function exportExcel(title: string, columns: TableColumn[], rows: CrudRow[]) {
  const tableHtml = buildExportTable(title, columns, rows);
  const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.toLowerCase().replace(/\s+/g, '-')}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

// Abre una vista imprimible para que el usuario guarde el resultado como PDF.
function exportPdf(title: string, columns: TableColumn[], rows: CrudRow[]) {
  const printable = window.open('', '_blank', 'width=1000,height=720');
  if (!printable) {
    return;
  }
  printable.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 24px; color: #17212b; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #dce4e2; padding: 8px; text-align: left; }
          th { background: #f4f7f6; }
        </style>
      </head>
      <body>${buildExportTable(title, columns, rows)}</body>
    </html>
  `);
  printable.document.close();
  printable.print();
}

// Construye una tabla HTML reutilizada por las exportaciones a Excel y PDF.
function buildExportTable(title: string, columns: TableColumn[], rows: CrudRow[]) {
  const headers = columns.map((column) => `<th>${column.label}</th>`).join('');
  const body = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${getCellValue(row, column)}</td>`).join('')}</tr>`)
    .join('');
  return `<h1>${title}</h1><table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table>`;
}
