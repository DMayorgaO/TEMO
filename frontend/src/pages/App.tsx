import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ClipboardEvent, FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownAZ,
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  ArrowUpZA,
  ArrowRightLeft,
  Banknote,
  Ban,
  BookOpen,
  BookUser,
  Building2,
  Calculator,
  Camera,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Coins,
  Copy,
  Edit3,
  FileDown,
  FileSpreadsheet,
  FileText,
  GripHorizontal,
  Landmark,
  KeyRound,
  LockKeyhole,
  LogIn,
  LogOut,
  Menu,
  Plus,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  Save,
  Scale,
  Search,
  ShieldCheck,
  UserRound,
  UserCog,
  Users,
  Trash2,
  X,
} from 'lucide-react';
import { MetricCard } from '../components/MetricCard';

type ScreenId =
  | 'login'
  | 'dashboard'
  | 'shifts'
  | 'transactions'
  | 'transfers'
  | 'directory'
  | 'cash-count'
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
type CatalogApiRow = Record<string, string | number | null>;

type AuthUser = {
  id: string;
  fullName: string;
  username: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  permissions: string[];
  mustChangePassword: boolean;
  sessionVersion: number;
  profilePhoto: string | null;
};

type LoginResponse = {
  token: string;
  expiresIn: number;
  user: AuthUser;
};

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

type ModalMode = 'create' | 'edit' | 'view';
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

type ShiftBankBalanceDraft = Record<string, string>;

type ExchangeRate = {
  buy: string;
  sell: string;
};

type ExchangeRateKind = 'Compra' | 'Venta';

type OpenShiftApiRow = {
  id: string;
  efectivo_inicial_nio: string;
  efectivo_inicial_usd: string;
  sucursal: string;
  caja: string;
  cajero: string;
};

type OpeningCashSummary = {
  nio: number;
  usd: number;
  context: string;
};

type ShiftCashLine = { denomination: number; piles25: number; loose: number };
type ShiftCashCount = { total: number; lines: ShiftCashLine[] };
type ShiftDetail = {
  database_id: string;
  id: string;
  id_sucursal: string;
  estado: string;
  sucursal: string;
  caja: string;
  cajero: string;
  efectivo_inicial_nio: string;
  efectivo_inicial_usd: string;
  efectivo_final_nio: string | null;
  efectivo_final_usd: string | null;
  cambio_nio: string;
  solicitud_estado: string | null;
  observaciones_apertura?: string;
  observaciones_cierre?: string;
  cashCounts: Record<string, Partial<Record<CashCurrency, ShiftCashCount>>>;
  expectedCash: Record<CashCurrency, number>;
  pendingCash: Record<CashCurrency, number>;
  balances: Array<{
    account_id: string;
    account: string;
    entity: string;
    currency: CashCurrency;
    initial: string;
    income: string;
    expense: string;
    calculated: string;
    system: string | null;
    difference: string | null;
  }>;
  availableAccounts: Array<{
    account_id: string;
    account: string;
    entity: string;
    currency: CashCurrency;
  }>;
  availableMovements: Array<{
    entity: string;
    code: string;
    name: string;
    direction: 'Ingreso' | 'Salida';
    accountDirection: 'Ingreso' | 'Salida' | null;
    affectsAccount: boolean;
    currencies: CashCurrency[];
  }>;
};

type BranchCatalogRow = {
  id: string;
  nombre: string;
  cajeros: string;
  estado: string;
};

type ShiftNotification = {
  id: string;
  kind: 'CLOSE_REQUEST' | 'SHIFT_CLOSED' | 'PENDING_PAID';
  shift_id: string;
  shift_code: string;
  cashier: string;
  branch: string;
  register: string;
  observations: string;
  amount: string | null;
  currency: CashCurrency | null;
};

type TransactionApiRow = {
  database_id: string;
  id: string;
  id_grupo_transacciones: string;
  codigo_operacion: string;
  orden_grupo: number;
  fecha_transaccion: string;
  monto: string;
  moneda: CashCurrency;
  direccion: 'ENTRA' | 'SALE';
  estado: 'REGISTRADA' | 'ANULADA' | 'CORREGIDA';
  entidad: string;
  codigo_movimiento: string;
  movimiento: string;
  cajero: string;
  sucursal: string;
  pendiente: string | null;
  pending_database_id: string | null;
  pending_type: 'POR_COBRAR' | 'POR_PAGAR' | null;
  pending_status: 'PENDIENTE' | 'ABONADO' | 'VENCIDO' | null;
  pending_balance: string | null;
  descripcion: string;
};

type TransactionCashCountApiLine = {
  denomination: number;
  piles25: number;
  loose: number;
};

type TransactionDetailApi = {
  transaction: TransactionApiRow;
  rates: { buy: number; sell: number };
  settlement: {
    primaryRateKind: 'COMPRA' | 'VENTA';
    changeRateKind: 'COMPRA' | 'VENTA';
    expectedChange: Record<CashCurrency, number>;
    primaryCounts: Record<CashCurrency, TransactionCashCountApiLine[]>;
    changeCounts: Record<CashCurrency, TransactionCashCountApiLine[]>;
  };
};

type PendingApiRow = {
  database_id: string;
  id: string;
  transaction_database_id: string;
  shift_database_id: string;
  transaction_id: string;
  tipo: 'POR_COBRAR' | 'POR_PAGAR';
  estado: 'PENDIENTE' | 'ABONADO' | 'PAGADO' | 'VENCIDO' | 'CANCELADO';
  monto_original: string;
  saldo_pendiente: string;
  fecha_creacion: string;
  fecha_modificacion: string;
  contraparte: string;
  moneda: CashCurrency;
  entidad: string;
  codigo_movimiento: string;
  movimiento: string;
  cajero: string;
  sucursal: string;
  estado_turno: string;
};

type CreatedTransactionBatch = {
  groupId: string;
  operationCode: number;
  createdAt: string;
  transactions: Array<{
    id: string;
    order: number;
    entityCode: string;
    movementCode: string;
    movement: string;
    currencyCode: CashCurrency;
    amount: number;
    direction: 'ENTRA' | 'SALE';
    pendingName: string;
    description: string;
  }>;
};

type TransferApiRow = {
  database_id: string; id: string; id_turno: string; fecha_transferencia: string;
  tipo: 'EFECTIVO' | 'CUENTA_BANCARIA'; direccion: 'ENTRA' | 'SALE'; moneda: CashCurrency;
  monto: string; descripcion: string; estado: 'ACTIVO' | 'INACTIVO'; id_cuenta: string | null; cuenta: string | null;
  cajero: string; sucursal: string; caja: string; cashLines?: TransactionCashCountApiLine[];
};
type TransferContext = {
  shifts: Array<{ id: string; branch_id: string; code: string; cashier: string; branch: string; register: string }>;
  accounts: Array<{ id: string; alias: string; currency: CashCurrency; entity: string; branch_id: string | null }>;
};

type DirectoryIdentifier = { institution: string; type: string; number: string; currency: CashCurrency | null };
type DirectoryIdentity = { number: string; holder: string };
type DirectoryEntry = {
  database_id: string;
  id: string;
  name: string;
  observations: string;
  status: 'ACTIVO' | 'INACTIVO';
  identifiers: DirectoryIdentifier[];
  identities: DirectoryIdentity[];
  references: string[];
  sources: Array<{ sheet: string; row: number }>;
};

const configuredApiUrl = (
  import.meta as ImportMeta & { env?: Record<string, string | undefined> }
).env?.VITE_API_URL?.trim();
const apiBaseUrl =
  configuredApiUrl ||
  `${window.location.protocol}//${window.location.hostname}:4000/api`;

const authTokenStorageKey = 'temo:auth-token';
const authUserStorageKey = 'temo:auth-user';
const rememberedUsernameStorageKey = 'temo:remembered-username';

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = window.sessionStorage.getItem(authTokenStorageKey);
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as
    | { message?: string | string[] }
    | T
    | null;
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? payload.message
        : null;
    if (response.status === 401 && path !== '/auth/login') {
      window.dispatchEvent(new Event('temo:session-expired'));
    }
    throw new Error(
      Array.isArray(message)
        ? message.join(' ')
        : message || 'No fue posible completar la operacion.',
    );
  }
  return payload as T;
}

// Reduce y recorta la fotografia antes de enviarla para mantener pequeno el perfil almacenado.
function prepareProfilePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      reject(new Error('Seleccione una imagen JPG, PNG o WEBP.'));
      return;
    }
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('No fue posible procesar la fotografia.'));
        return;
      }
      context.drawImage(
        image,
        (image.naturalWidth - side) / 2,
        (image.naturalHeight - side) / 2,
        side,
        side,
        0,
        0,
        256,
        256,
      );
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.78));
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No fue posible leer la fotografia seleccionada.'));
    };
    image.src = objectUrl;
  });
}

// El menu lateral se agrupa para que las pantallas hijas vivan bajo su proceso principal.
const navGroups: NavGroup[] = [
  { item: { id: 'dashboard', label: 'Panel General', route: '/dashboard', icon: ShieldCheck } },
  {
    item: { id: 'shifts', label: 'Turnos', route: '/turnos', icon: CalendarDays },
  },
  {
    item: { id: 'cash-count', label: 'Arqueo', route: '/arqueo', icon: Banknote },
  },
  {
    item: { id: 'transactions', label: 'Transacciones', route: '/transacciones', icon: ReceiptText },
  },
  {
    item: { id: 'general-consolidation', label: 'Saldos', route: '/saldos', icon: Scale },
  },
  {
    item: { id: 'pending', label: 'Pendientes', route: '/pendientes', icon: CheckCircle2 },
  },
  {
    item: { id: 'transfers', label: 'Transferencias', route: '/transferencias', icon: ArrowRightLeft },
  },
  {
    item: { id: 'directory', label: 'Directorio', route: '/directorio', icon: BookUser },
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
    ],
  },
  {
    item: { id: 'users', label: 'Gestion usuarios', route: '/usuarios', icon: Users },
    children: [{ id: 'role-permissions', label: 'Roles y permisos', route: '/roles-permisos', icon: UserCog }],
  },
  { item: { id: 'audit', label: 'Auditoria', route: '/auditoria', icon: UserCog } },
  { item: { id: 'imports', label: 'Importaciones', route: '/importaciones', icon: FileSpreadsheet } },
];

// Lista plana derivada del menu para resolver rutas, permisos y navegacion interna.
const navItems = navGroups.flatMap((group) => [group.item, ...(group.children ?? [])]);

// Los titulos cambian segun la pantalla activa para orientar al usuario.
const screenHeaders: Record<ScreenId, ScreenHeader> = {
  login: { eyebrow: 'Acceso', title: 'Inicio de sesion' },
  dashboard: { eyebrow: 'Panel', title: 'Panel General' },
  shifts: { eyebrow: 'Jornadas', title: 'Turnos registrados' },
  transactions: { eyebrow: 'Movimientos', title: 'Transacciones registradas' },
  transfers: { eyebrow: 'Movimientos internos', title: 'Transferencias' },
  directory: { eyebrow: 'Consulta frecuente', title: 'Directorio de destinatarios' },
  'cash-count': { eyebrow: 'Arqueo', title: 'Conteo fisico de caja' },
  banks: { eyebrow: 'Entidades', title: 'Bancos y servicios financieros' },
  branches: { eyebrow: 'Ubicaciones', title: 'Sucursales y tienda principal' },
  accounts: { eyebrow: 'Saldos', title: 'Cuentas financieras' },
  catalogs: { eyebrow: 'Configuracion', title: 'Movimientos por banco y moneda' },
  commissions: { eyebrow: 'Ganancias', title: 'Reglas de comision' },
  'exchange-rate': { eyebrow: 'Configuracion', title: 'Tasa de Cambio' },
  'reports-hub': { eyebrow: 'Consultas', title: 'Reportes' },
  reports: { eyebrow: 'Consultas', title: 'Reportes operativos' },
  'commission-reports': { eyebrow: 'Jefa', title: 'Reporte de comisiones' },
  'general-consolidation': { eyebrow: 'Conciliacion', title: 'Saldos' },
  pending: { eyebrow: 'Cobros y pagos', title: 'Pendientes' },
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

const roleCatalogConfig: CrudConfig = {
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
    { id: 'ROL-001', code: 'JEFA', name: 'Jefa', description: 'Acceso completo al sistema', status: 'Activo' },
    { id: 'ROL-002', code: 'CAJERO', name: 'Cajero', description: 'Operacion diaria sin comisiones', status: 'Activo' },
  ],
};

// Configuracion base de tablas. Cada pantalla reutiliza el mismo CRUD visual.
const crudConfigs: Record<ScreenId, CrudConfig[]> = {
  login: [],
  dashboard: [
    {
      storageKey: 'dashboard-alerts',
      title: 'Alertas del dia',
      description: 'Indicadores que la jefa debe revisar durante la jornada.',
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
          cashier: 'Jefa',
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
        { key: 'movementCode', label: 'CODIGO', hiddenInTable: true, hiddenInForm: true },
        { key: 'movement', label: 'MOVIMIENTO', inputKind: 'select', options: ['Deposito a cuenta', 'Retiro de efectivo', 'Pago de remesa', 'Envio de remesa'] },
        { key: 'amount', label: 'MONTO' },
        { key: 'pendingName', label: 'PENDIENTE' },
        { key: 'operatorBranch', label: 'CAJERO / SUCURSAL', hiddenInForm: true },
        { key: 'direction', label: 'Direccion', inputKind: 'select', options: ['Ingreso', 'Salida'], hiddenInTable: true },
        { key: 'currency', label: 'Moneda', inputKind: 'select', options: ['NIO', 'USD'], hiddenInTable: true },
        { key: 'amountValue', label: 'Monto', hiddenInTable: true },
        { key: 'description', label: 'Descripcion', inputKind: 'textarea', hiddenInTable: true },
        { key: 'cashCountNio', label: 'Arqueo NIO', hiddenInTable: true, hiddenInForm: true },
        { key: 'cashCountUsd', label: 'Arqueo USD', hiddenInTable: true, hiddenInForm: true },
        { key: 'changeCashCountNio', label: 'Vuelto NIO', hiddenInTable: true, hiddenInForm: true },
        { key: 'changeCashCountUsd', label: 'Vuelto USD', hiddenInTable: true, hiddenInForm: true },
        { key: 'exchangeRateType', label: 'Tasa aplicada', hiddenInTable: true, hiddenInForm: true },
        { key: 'exchangeRateValue', label: 'Valor tasa', hiddenInTable: true, hiddenInForm: true },
        { key: 'changeExchangeRateType', label: 'Tasa de vuelto', hiddenInTable: true, hiddenInForm: true },
        { key: 'changeExchangeRateValue', label: 'Valor tasa de vuelto', hiddenInTable: true, hiddenInForm: true },
        { key: 'transactionGroupId', label: 'Grupo de transacciones', hiddenInTable: true, hiddenInForm: true },
        { key: 'transactionGroupOrder', label: 'Orden en grupo', hiddenInTable: true, hiddenInForm: true },
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
  transfers: [],
  directory: [],
  'cash-count': [],
  'exchange-rate': [],
  banks: [
    {
      storageKey: 'banks',
      title: 'Bancos',
      description: 'Entidades bancarias y servicios que la jefa visualiza como bancos.',
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
        { key: 'cashiers', label: 'Cajeros asociados', inputKind: 'multiselect', options: ['Jefa', 'Cajera 1', 'Cajera 2', 'Cajero 3'], hiddenInTable: true },
        { key: 'accounts', label: 'Cuentas asociadas', inputKind: 'multiselect', options: ['BAC NIO 01', 'BAC USD 01', 'BANPRO NIO 01', 'BANPRO USD 01', 'LAFISE NIO 01', 'LAFISE USD 01', 'PEX NIO 01', 'TELEDOLAR USD 01'], hiddenInTable: true },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo'], hiddenInTable: true },
      ],
      rows: [
        { id: 'SUC-001', name: 'MISCELÁNEA OLIVERA', cashiers: 'ROXANA OLIVERA, KIMBERLY MOLINA, CRISTINA', accounts: 'BAC NIO 01, BAC USD 01, BANPRO NIO 01, BANPRO USD 01', status: 'Activo' },
        { id: 'SUC-002', name: 'METROCENTRO', cashiers: 'DIEGO MAYORGA', accounts: 'LAFISE NIO 01, LAFISE USD 01, TELEDOLAR USD 01', status: 'Activo' },
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
        { id: 'CTA-006', alias: 'PEX USD 01', entity: 'PEX', currency: 'USD', scope: 'Global', accountNumber: '', status: 'Activo' },
        { id: 'CTA-007', alias: 'LAFISE NIO 01', entity: 'LAFISE', currency: 'NIO', scope: 'Sucursal 2', accountNumber: '', status: 'Activo' },
        { id: 'CTA-008', alias: 'LAFISE USD 01', entity: 'LAFISE', currency: 'USD', scope: 'Sucursal 2', accountNumber: '', status: 'Activo' },
        { id: 'CTA-009', alias: 'BDF NIO 01', entity: 'BDF', currency: 'NIO', scope: 'Global', accountNumber: '', status: 'Inactivo' },
        { id: 'CTA-010', alias: 'BDF USD 01', entity: 'BDF', currency: 'USD', scope: 'Global', accountNumber: '', status: 'Inactivo' },
        { id: 'CTA-011', alias: 'TELEDOLAR NIO 01', entity: 'TELEDOLAR', currency: 'NIO', scope: 'Global', accountNumber: '', status: 'Activo' },
        { id: 'CTA-012', alias: 'TELEDOLAR USD 01', entity: 'TELEDOLAR', currency: 'USD', scope: 'Sucursal 2', accountNumber: '', status: 'Activo' },
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
        { id: 'MOV-035', code: 'RC', name: 'Retiro con codigo', direction: 'Salida', banks: 'BAC', currencies: 'NIO', status: 'Activo' },
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
  pending: [],
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
        { key: 'email', label: 'Correo' },
        { key: 'role', label: 'Rol', inputKind: 'select', options: [] },
        { key: 'status', label: 'Estado', inputKind: 'select', options: ['Activo', 'Inactivo', 'Bloqueado'] },
      ],
      rows: [
        { id: 'USR-001', firstName: 'ROXANA', lastName: 'OLIVERA', username: 'ROXANA', roleId: 'ROL-001', role: 'Jefa', status: 'Activo' },
        { id: 'USR-002', firstName: 'KIMBERLY', lastName: 'MOLINA', username: 'KIMBERLYM', roleId: 'ROL-002', role: 'Cajero', status: 'Activo' },
        { id: 'USR-003', firstName: 'CRISTINA', lastName: '', username: 'CRISTINA', roleId: 'ROL-002', role: 'Cajero', status: 'Activo' },
        { id: 'USR-004', firstName: 'DIEGO', lastName: 'MAYORGA', username: 'DIEGOM', roleId: 'ROL-002', role: 'Cajero', status: 'Activo' },
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
        { id: 'AUD-001', date: 'Hoy 08:00', user: 'Jefa', action: 'Iniciar sesion', entity: 'auth', status: 'Activo' },
        { id: 'AUD-002', date: 'Hoy 09:25', user: 'Cajero 1', action: 'Crear', entity: 'transacciones', status: 'Activo' },
      ],
    },
  ],
};

const catalogEndpointByStorageKey: Record<string, string> = {
  roles: '/catalogs/roles',
  users: '/catalogs/usuarios',
  banks: '/catalogs/entidades-bancarias',
  branches: '/catalogs/sucursales',
  accounts: '/catalogs/cuentas-bancarias',
  movements: '/catalogs/movimientos-bancarios',
  commissions: '/catalogs/reglas-comisiones',
};

const writableCatalogStorageKeys = new Set(Object.keys(catalogEndpointByStorageKey));

function displayCatalogStatus(value: unknown) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'INACTIVO') return 'Inactivo';
  if (normalized === 'BLOQUEADO') return 'Bloqueado';
  return 'Activo';
}

function displayEntityKind(value: unknown) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'SERVICIO_FINANCIERO') return 'Servicio financiero';
  if (normalized === 'SERVICIO_REMESAS') return 'Servicio remesas';
  if (normalized === 'OTRO') return 'Otro';
  return 'Banco real';
}

function displayCalculation(value: unknown) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'PORCENTAJE') return 'Porcentaje';
  if (normalized === 'RANGO') return 'Rango';
  if (normalized === 'MANUAL') return 'Manual';
  return 'Fijo';
}

function findFallbackCatalogRow(storageKey: string, apiRow: CatalogApiRow, fallbackRows: CrudRow[]) {
  const candidates: Record<string, string> = {
    roles: String(apiRow.codigo ?? ''),
    users: String(apiRow.usuario ?? ''),
    banks: String(apiRow.codigo ?? ''),
    branches: String(apiRow.nombre ?? ''),
    accounts: String(apiRow.alias ?? ''),
    movements: `${String(apiRow.codigo ?? '')}|${String(apiRow.nombre ?? '')}`,
  };
  const value = normalizeLookupValue(candidates[storageKey]);
  return fallbackRows.find((row) => {
    const rowValue =
      storageKey === 'roles' || storageKey === 'banks'
        ? row.code
        : storageKey === 'users'
          ? row.username
        : storageKey === 'branches'
            ? row.name
            : storageKey === 'movements'
              ? `${row.code}|${row.name}`
            : storageKey === 'accounts'
              ? row.alias
              : '';
    return normalizeLookupValue(rowValue) === value;
  });
}

function buildAccountVisibleIds(apiRows: CatalogApiRow[], config: CrudConfig) {
  const idsByDatabaseId = new Map<string, string>();
  const usedIds = new Set<string>();

  apiRows.forEach((apiRow) => {
    const databaseId = String(apiRow.id ?? '');
    const fallback = findFallbackCatalogRow('accounts', apiRow, config.rows);
    if (databaseId && fallback?.id && !usedIds.has(fallback.id)) {
      idsByDatabaseId.set(databaseId, fallback.id);
      usedIds.add(fallback.id);
    }
  });

  let nextNumber =
    config.rows.reduce((maximum, row) => {
      const match = String(row.id ?? '').match(/^CTA-(\d+)$/i);
      return Math.max(maximum, Number(match?.[1] ?? 0));
    }, 0) + 1;

  [...apiRows]
    .sort((first, second) => {
      const firstCreatedAt = String(first.fecha_creacion ?? '');
      const secondCreatedAt = String(second.fecha_creacion ?? '');
      return firstCreatedAt.localeCompare(secondCreatedAt) || String(first.id ?? '').localeCompare(String(second.id ?? ''));
    })
    .forEach((apiRow) => {
      const databaseId = String(apiRow.id ?? '');
      if (!databaseId || idsByDatabaseId.has(databaseId)) return;
      let visibleId = `CTA-${String(nextNumber).padStart(3, '0')}`;
      while (usedIds.has(visibleId)) {
        nextNumber += 1;
        visibleId = `CTA-${String(nextNumber).padStart(3, '0')}`;
      }
      idsByDatabaseId.set(databaseId, visibleId);
      usedIds.add(visibleId);
      nextNumber += 1;
    });

  return idsByDatabaseId;
}

function mapCatalogApiRows(storageKey: string, apiRows: CatalogApiRow[], config: CrudConfig) {
  const accountVisibleIds = storageKey === 'accounts' ? buildAccountVisibleIds(apiRows, config) : null;
  return apiRows.map((apiRow, index): CrudRow => {
    const fallback = findFallbackCatalogRow(storageKey, apiRow, config.rows);
    const databaseId = String(apiRow.id ?? '');
    const visibleId =
      accountVisibleIds?.get(databaseId) ||
      fallback?.id ||
      `${config.idPrefix}-${String(index + 1).padStart(3, '0')}`;
    if (storageKey === 'roles') {
      return {
        id: visibleId,
        databaseId,
        code: String(apiRow.codigo ?? ''),
        name: String(apiRow.nombre ?? ''),
        description: String(apiRow.descripcion ?? ''),
        status: displayCatalogStatus(apiRow.estado),
      };
    }
    if (storageKey === 'users') {
      return {
        id: visibleId,
        databaseId,
        firstName: String(apiRow.nombres ?? ''),
        lastName: String(apiRow.apellidos ?? ''),
        username: String(apiRow.usuario ?? ''),
        email: String(apiRow.correo ?? ''),
        roleId: String(apiRow.id_rol ?? ''),
        role: String(apiRow.rol ?? ''),
        status: displayCatalogStatus(apiRow.estado),
      };
    }
    if (storageKey === 'banks') {
      return {
        id: visibleId,
        databaseId,
        code: String(apiRow.codigo ?? ''),
        shortName: String(apiRow.nombre_corto ?? ''),
        name: String(apiRow.nombre_largo ?? ''),
        kind: displayEntityKind(apiRow.tipo),
        status: displayCatalogStatus(apiRow.estado),
      };
    }
    if (storageKey === 'branches') {
      return {
        id: visibleId,
        databaseId,
        code: String(apiRow.codigo ?? ''),
        name: String(apiRow.nombre ?? ''),
        cashiers: String(apiRow.cajeros ?? ''),
        cashierIds: String(apiRow.cajero_ids ?? ''),
        accounts: String(apiRow.cuentas ?? ''),
        accountIds: String(apiRow.cuenta_ids ?? ''),
        status: displayCatalogStatus(apiRow.estado),
      };
    }
    if (storageKey === 'accounts') {
      return {
        id: visibleId,
        databaseId,
        alias: String(apiRow.alias ?? ''),
        entity: String(apiRow.entidad ?? ''),
        currency: String(apiRow.moneda ?? ''),
        scope: String(apiRow.alcance ?? 'Global'),
        branchIds: String(apiRow.sucursal_ids ?? ''),
        accountNumber: String(apiRow.numero_cuenta ?? ''),
        status: displayCatalogStatus(apiRow.estado),
      };
    }
    if (storageKey === 'movements') {
      return {
        id: visibleId,
        databaseId,
        code: String(apiRow.codigo ?? '').trim(),
        name: String(apiRow.nombre ?? ''),
        direction: String(apiRow.direccion ?? 'Ingreso'),
        banks: String(apiRow.bancos ?? ''),
        currencies: String(apiRow.monedas ?? ''),
        mappingIds: String(apiRow.mapeo_ids ?? ''),
        status: displayCatalogStatus(apiRow.estado),
      };
    }
    return {
      id: visibleId,
      databaseId,
      entity: String(apiRow.entidad_bancaria ?? ''),
      currency: String(apiRow.moneda ?? ''),
      movement: String(apiRow.movimiento ?? ''),
      calculation: displayCalculation(apiRow.tipo_calculo),
      percentage: String(apiRow.porcentaje ?? ''),
      commissionCurrency: String(apiRow.moneda_comision ?? ''),
      fixed: String(apiRow.monto_fijo ?? ''),
      rangeStart: String(apiRow.rango_inicio ?? ''),
      rangeEnd: String(apiRow.rango_fin ?? ''),
      status: displayCatalogStatus(apiRow.estado),
    };
  });
}

async function loadCatalogRows(storageKey: string, config: CrudConfig) {
  const endpoint = catalogEndpointByStorageKey[storageKey];
  if (!endpoint) return config.rows;
  const apiRows = await apiRequest<CatalogApiRow[]>(endpoint);
  const rows = mapCatalogApiRows(storageKey, apiRows, config);
  window.localStorage.setItem(`temo:${storageKey}`, JSON.stringify(rows));
  return rows;
}

async function hydrateRelationalCatalogs(includeAdministrativeCatalogs: boolean) {
  await Promise.all(
    Object.entries(catalogEndpointByStorageKey)
      .filter(([storageKey]) => includeAdministrativeCatalogs || !['commissions', 'users', 'roles'].includes(storageKey))
      .map(async ([storageKey]) => {
      const config =
        storageKey === 'roles'
          ? roleCatalogConfig
          : Object.values(crudConfigs).flat().find((candidate) => candidate.storageKey === storageKey);
      if (config) await loadCatalogRows(storageKey, config);
      }),
  );
  const currencies = await apiRequest<CatalogApiRow[]>('/catalogs/monedas');
  window.localStorage.setItem('temo:currencies', JSON.stringify(currencies));
}

// Formularios operativos que aun no representan una tabla administrativa.
const processForms: Partial<Record<ScreenId, { title: string; fields: ProcessField[] }>> = {
  login: {
    title: 'Credenciales',
    fields: [
      { label: 'Usuario', placeholder: 'jefa' },
      { label: 'Contrasena', kind: 'password', placeholder: '********' },
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
  const currentRoute = window.location.hash.replace('#', '') || '/login';
  if (currentRoute === '/login') {
    return 'login';
  }
  return navItems.find((item) => item.route === currentRoute)?.id ?? 'dashboard';
}

// Ubica el grupo padre para desplegar solo el bloque relacionado con la pantalla activa.
function findParentGroupId(screenId: ScreenId): ScreenId | null {
  const parent = navGroups.find((group) => group.item.id === screenId || group.children?.some((child) => child.id === screenId));
  return parent?.children?.length ? parent.item.id : null;
}

function readAuthenticatedUser() {
  try {
    const storedUser = window.sessionStorage.getItem(authUserStorageKey);
    return storedUser ? (JSON.parse(storedUser) as AuthUser) : null;
  } catch {
    return null;
  }
}

function screenPermissionCode(screen: ScreenId) {
  return `VER_${screen.toUpperCase().replace(/-/g, '_')}`;
}

function canAccessScreen(user: AuthUser, screen: ScreenId) {
  return screen === 'login' || user.permissions.includes(screenPermissionCode(screen));
}

function getDefaultScreen(user: AuthUser): ScreenId {
  if (canAccessScreen(user, 'dashboard')) {
    return 'dashboard';
  }
  if (canAccessScreen(user, 'transactions')) {
    return 'transactions';
  }
  return navItems.find((item) => canAccessScreen(user, item.id))?.id ?? 'login';
}

// Detecta si el menu debe comportarse como drawer temporal.
function isCompactViewport() {
  return window.matchMedia('(max-width: 980px)').matches;
}

// Genera ids legibles sin reutilizar un numero aunque el arreglo cambie de orden.
function nextReadableId(rows: CrudRow[], prefix: string) {
  const greatest = rows.reduce((maximum, row) => {
    const match = String(row.id ?? '').match(new RegExp(`^${prefix}-(\\d+)$`, 'i'));
    return Math.max(maximum, Number(match?.[1] ?? 0));
  }, 0);
  const next = greatest + 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

function offsetReadableId(id: string, offset: number) {
  const match = id.match(/^(.*?)(\d+)$/);
  if (!match) {
    return `${id}-${offset + 1}`;
  }
  const [, prefix, numericPart] = match;
  return `${prefix}${String(Number(numericPart) + offset).padStart(numericPart.length, '0')}`;
}

// Genera alias de cuenta con Entidad + Moneda + consecutivo independiente.
function buildAccountAlias(rows: CrudRow[], entity = '', currency = '', currentId?: string) {
  const normalizedEntity = normalizeLookupValue(entity);
  const normalizedCurrency = normalizeLookupValue(currency);
  if (!normalizedEntity || !normalizedCurrency) {
    return '';
  }

  const currentRow = currentId ? rows.find((row) => row.id === currentId) : undefined;
  const keepsCombination =
    currentRow &&
    normalizeLookupValue(currentRow.entity) === normalizedEntity &&
    normalizeLookupValue(currentRow.currency) === normalizedCurrency;
  if (keepsCombination) {
    return currentRow.alias;
  }

  const greatestConsecutive = rows.reduce((maximum, row) => {
    const matchesCombination =
      row.id !== currentId &&
      normalizeLookupValue(row.entity) === normalizedEntity &&
      normalizeLookupValue(row.currency) === normalizedCurrency;
    if (!matchesCombination) {
      return maximum;
    }

    const aliasConsecutive = Number(row.alias.match(/(\d+)\s*$/)?.[1] ?? 0);
    return Math.max(maximum, Number.isFinite(aliasConsecutive) ? aliasConsecutive : 0);
  }, 0);
  const nextConsecutive = greatestConsecutive + 1;
  return `${entity.trim()} ${currency.trim()} ${String(nextConsecutive).padStart(2, '0')}`;
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
function mergeInitialCatalogRows(storageKey: string, rows: CrudRow[], fallbackRows: CrudRow[]) {
  const legacyPrefix = storageKey === 'users' ? 'USR-' : storageKey === 'accounts' ? 'CTA-' : '';
  if (!legacyPrefix || !rows.length || !rows.every((row) => row.id.startsWith(legacyPrefix))) {
    return rows;
  }
  const existingIds = new Set(rows.map((row) => row.id));
  return [...rows, ...fallbackRows.filter((row) => !existingIds.has(row.id))];
}

function readStoredRows(storageKey: string, fallbackRows: CrudRow[]) {
  const stored = window.localStorage.getItem(`temo:${storageKey}`);
  if (!stored) {
    return catalogEndpointByStorageKey[storageKey] ? [] : fallbackRows;
  }
  let parsedRows = JSON.parse(stored) as CrudRow[];
  if (storageKey === 'users' && parsedRows.some((row) => 'temporaryPassword' in row)) {
    parsedRows = parsedRows.map((row) => {
      const sanitizedRow = { ...row };
      delete sanitizedRow.temporaryPassword;
      return sanitizedRow;
    });
    window.localStorage.setItem(`temo:${storageKey}`, JSON.stringify(parsedRows));
  }
  if (storageKey === 'movements') {
    parsedRows = normalizeMovementCurrencyRules(parsedRows);
  }
  return catalogEndpointByStorageKey[storageKey]
    ? parsedRows
    : mergeInitialCatalogRows(storageKey, parsedRows, fallbackRows);
}

function normalizeMovementCurrencyRules(rows: CrudRow[]) {
  return rows.map((row) => {
    const isBacRc =
      normalizeLookupValue(row.code) === 'rc' &&
      parseMultiValue(row.banks).some((bank) => normalizeLookupValue(bank) === 'bac');
    return isBacRc ? { ...row, currencies: 'NIO' } : row;
  });
}

function getRoleRows() {
  return readStoredRows(roleCatalogConfig.storageKey, roleCatalogConfig.rows);
}

function normalizeUserRow(row: CrudRow): CrudRow {
  const normalizedRole = normalizeLookupValue(row.role);
  const role = getRoleRows().find(
    (candidate) =>
      candidate.id === row.roleId ||
      normalizeLookupValue(candidate.name) === normalizedRole ||
      normalizeLookupValue(candidate.code) === normalizedRole,
  );
  return {
    ...row,
    roleId: role?.databaseId || role?.id || row.roleId || '',
    role: role?.name || row.role || '',
  };
}

function getUserDisplayName(row: CrudRow) {
  return [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || row.username || row.id;
}

function normalizeBranchRow(row: CrudRow): CrudRow {
  const userConfig = crudConfigs.users[0];
  const accountConfig = crudConfigs.accounts[0];
  const users = readStoredRows(userConfig.storageKey, userConfig.rows).map(normalizeUserRow);
  const accounts = readStoredRows(accountConfig.storageKey, accountConfig.rows);
  const selectedUserIds = new Set(parseMultiValue(row.cashierIds));
  const selectedCashierNames = parseMultiValue(row.cashiers);
  const legacyUsers: Record<string, string> = {
    jefa: 'jefa',
    'cajera 1': 'cajero1',
    'cajera 2': 'cajero2',
    'cajero 3': 'cajero3',
  };
  const selectedUsers = users.filter((user) => {
    if (selectedUserIds.has(user.databaseId || user.id) || selectedUserIds.has(user.id)) {
      return true;
    }
    return selectedCashierNames.some((name) => {
      const normalizedName = normalizeLookupValue(name);
      return (
        normalizedName === normalizeLookupValue(getUserDisplayName(user)) ||
        legacyUsers[normalizedName] === normalizeLookupValue(user.username)
      );
    });
  });
  const selectedAccountIds = new Set(parseMultiValue(row.accountIds));
  const selectedAccountNames = new Set(parseMultiValue(row.accounts).map(normalizeLookupValue));
  const selectedAccounts = accounts.filter(
    (account) =>
      selectedAccountIds.has(account.databaseId || account.id) ||
      selectedAccountIds.has(account.id) ||
      selectedAccountNames.has(normalizeLookupValue(account.alias)),
  );
  return {
    ...row,
    cashiers: selectedUsers.map(getUserDisplayName).join(', '),
    cashierIds: selectedUsers.map((user) => user.id).join(', '),
    accounts: selectedAccounts.map((account) => account.alias).join(', '),
    accountIds: selectedAccounts.map((account) => account.id).join(', '),
  };
}

function includeCurrentOptions(options: string[], currentValue?: string) {
  return [...new Set([...options, ...parseMultiValue(currentValue)])].filter(Boolean);
}

function getAvailableRoleNames(currentValue?: string) {
  const available = getRoleRows()
    .filter((row) => !isInactive(row))
    .map((row) => row.name)
    .filter(Boolean);
  return includeCurrentOptions(available, currentValue);
}

function getAvailableUserNames() {
  const userConfig = crudConfigs.users[0];
  const available = readStoredRows(userConfig.storageKey, userConfig.rows)
    .map(normalizeUserRow)
    .filter((row) => !isInactive(row) && normalizeLookupValue(row.status) !== 'bloqueado')
    .map(getUserDisplayName)
    .filter(Boolean);
  return available;
}

function getAvailableAccountAliases() {
  const accountConfig = crudConfigs.accounts[0];
  const available = readStoredRows(accountConfig.storageKey, accountConfig.rows)
    .filter((row) => !isInactive(row))
    .map((row) => row.alias)
    .filter(Boolean);
  return available;
}

function getAvailableBranchNames() {
  const branchConfig = crudConfigs.branches[0];
  const available = readStoredRows(branchConfig.storageKey, branchConfig.rows)
    .filter((row) => !isInactive(row))
    .map((row) => row.name)
    .filter(Boolean);
  return available;
}

function attachInternalCatalogIds(storageKey: string, row: CrudRow): CrudRow {
  if (storageKey === 'users') {
    const role = getRoleRows().find(
      (candidate) => normalizeLookupValue(candidate.name) === normalizeLookupValue(row.role),
    );
    return { ...row, roleId: role?.databaseId || role?.id || row.roleId || '' };
  }

  if (storageKey === 'branches') {
    const userConfig = crudConfigs.users[0];
    const accountConfig = crudConfigs.accounts[0];
    const selectedUsers = new Set(parseMultiValue(row.cashiers).map(normalizeLookupValue));
    const selectedAccounts = new Set(parseMultiValue(row.accounts).map(normalizeLookupValue));
    const cashierIds = readStoredRows(userConfig.storageKey, userConfig.rows)
      .map(normalizeUserRow)
      .filter((user) => selectedUsers.has(normalizeLookupValue(getUserDisplayName(user))))
      .map((user) => user.databaseId || user.id);
    const accountIds = readStoredRows(accountConfig.storageKey, accountConfig.rows)
      .filter((account) => selectedAccounts.has(normalizeLookupValue(account.alias)))
      .map((account) => account.databaseId || account.id);
    return {
      ...row,
      cashierIds: cashierIds.join(', '),
      accountIds: accountIds.join(', '),
    };
  }

  if (storageKey === 'accounts') {
    const branchConfig = crudConfigs.branches[0];
    const selectedBranches = new Set(
      parseMultiValue(row.scope)
        .filter((branch) => normalizeLookupValue(branch) !== 'global')
        .map(normalizeLookupValue),
    );
    const branchIds = readStoredRows(branchConfig.storageKey, branchConfig.rows)
      .filter((branch) => selectedBranches.has(normalizeLookupValue(branch.name)))
      .map((branch) => branch.databaseId || branch.id);
    return {
      ...row,
      scope: selectedBranches.size ? row.scope : 'Global',
      branchIds: branchIds.join(', '),
    };
  }

  return row;
}

function syncAccountsFromBranch(previousBranch: CrudRow | undefined, branch: CrudRow) {
  const accountConfig = crudConfigs.accounts[0];
  const selectedAliases = new Set(parseMultiValue(branch.accounts).map(normalizeLookupValue));
  const previousName = previousBranch?.name;
  const nextAccounts = readStoredRows(accountConfig.storageKey, accountConfig.rows).map((account) => {
    const scope = parseMultiValue(account.scope).filter(
      (name) =>
        normalizeLookupValue(name) !== 'global' &&
        normalizeLookupValue(name) !== normalizeLookupValue(previousName) &&
        normalizeLookupValue(name) !== normalizeLookupValue(branch.name),
    );
    if (selectedAliases.has(normalizeLookupValue(account.alias))) {
      scope.push(branch.name);
    }
    const uniqueScope = [...new Set(scope)].filter(Boolean);
    const branchConfig = crudConfigs.branches[0];
    const branchIds = readStoredRows(branchConfig.storageKey, branchConfig.rows)
      .filter((candidate) =>
        uniqueScope.some((name) => normalizeLookupValue(name) === normalizeLookupValue(candidate.name)),
      )
      .map((candidate) => candidate.id);
    if (
      uniqueScope.some((name) => normalizeLookupValue(name) === normalizeLookupValue(branch.name)) &&
      !branchIds.includes(branch.id)
    ) {
      branchIds.push(branch.id);
    }
    return {
      ...account,
      scope: uniqueScope.length ? uniqueScope.join(', ') : 'Global',
      branchIds: branchIds.join(', '),
    };
  });
  window.localStorage.setItem(`temo:${accountConfig.storageKey}`, JSON.stringify(nextAccounts));
}

function syncBranchesFromAccount(previousAccount: CrudRow | undefined, account: CrudRow) {
  const branchConfig = crudConfigs.branches[0];
  const selectedBranches = new Set(
    parseMultiValue(account.scope)
      .filter((name) => normalizeLookupValue(name) !== 'global')
      .map(normalizeLookupValue),
  );
  const nextBranches = readStoredRows(branchConfig.storageKey, branchConfig.rows).map((branch) => {
    const accounts = parseMultiValue(branch.accounts).filter(
      (alias) =>
        normalizeLookupValue(alias) !== normalizeLookupValue(previousAccount?.alias) &&
        normalizeLookupValue(alias) !== normalizeLookupValue(account.alias),
    );
    if (selectedBranches.has(normalizeLookupValue(branch.name))) {
      accounts.push(account.alias);
    }
    const uniqueAccounts = [...new Set(accounts)].filter(Boolean);
    const accountConfig = crudConfigs.accounts[0];
    const accountIds = readStoredRows(accountConfig.storageKey, accountConfig.rows)
      .filter((candidate) =>
        uniqueAccounts.some((alias) => normalizeLookupValue(alias) === normalizeLookupValue(candidate.alias)),
      )
      .map((candidate) => candidate.id);
    if (
      uniqueAccounts.some((alias) => normalizeLookupValue(alias) === normalizeLookupValue(account.alias)) &&
      !accountIds.includes(account.id)
    ) {
      accountIds.push(account.id);
    }
    return {
      ...branch,
      accounts: uniqueAccounts.join(', '),
      accountIds: accountIds.join(', '),
    };
  });
  window.localStorage.setItem(`temo:${branchConfig.storageKey}`, JSON.stringify(nextBranches));
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

function getTransactionMovementByName(entity: string, movement: string) {
  const normalizedMovement = normalizeLookupValue(normalizeTransactionMovement(movement));
  return getMovementRowsForEntity(entity).find((row) => normalizeLookupValue(row.name) === normalizedMovement);
}

function getTransactionMovementByCode(entity: string, code: string) {
  const normalizedCode = normalizeLookupValue(code);
  return getMovementRowsForEntity(entity).find((row) => normalizeLookupValue(row.code) === normalizedCode);
}

function getMovementCurrencies(movement?: CrudRow): CashCurrency[] {
  return parseMultiValue(movement?.currencies)
    .map((currency) => currency.toUpperCase())
    .filter((currency): currency is CashCurrency => currency === 'NIO' || currency === 'USD');
}

function getDefaultMovementCurrency(movement?: CrudRow): CashCurrency {
  const currencies = getMovementCurrencies(movement);
  if (currencies.includes('NIO')) {
    return 'NIO';
  }
  return currencies[0] ?? 'NIO';
}

function getTransactionMovementDirection(entity: string, movement: string) {
  const movementRow = getTransactionMovementByName(entity, movement);
  return movementRow?.direction === 'Salida' ? 'Salida' : 'Ingreso';
}

// Obtiene movimientos activos que aun pueden asociarse a una regla de comision.
function getAvailableCommissionMovements(commissionRows: CrudRow[], currentRow?: CrudRow) {
  const movementConfig = crudConfigs.catalogs[0];
  const movementRows = readStoredRows(movementConfig.storageKey, movementConfig.rows);
  void commissionRows;
  return includeCurrentOptions(
    movementRows
    .filter((row) => !isInactive(row))
    .map((row) => row.name)
    .filter(Boolean),
    currentRow?.movement,
  );
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

function cashCountLines(value: string | undefined, currency: CashCurrency) {
  const counts = readTransactionCashCount(value);
  return cashDenominations[currency].map((denomination) => ({
    denomination: denomination.value,
    piles25: parseCashQuantity(counts[denomination.id]?.groups),
    loose: parseCashQuantity(counts[denomination.id]?.loose),
  }));
}

function toApiRateKind(value?: string): 'COMPRA' | 'VENTA' {
  return value === 'Venta' ? 'VENTA' : 'COMPRA';
}

// Traduce el arqueo propio de una pestaña al contrato de la API.
function transactionSettlementPayload(row: CrudRow) {
  return {
    primaryRateKind: toApiRateKind(row.settlementExchangeRateType || row.exchangeRateType),
    changeRateKind: toApiRateKind(row.changeExchangeRateType),
    expectedChange: {
      NIO: parseMoneyValue(row.expectedChangeNio),
      USD: parseMoneyValue(row.expectedChangeUsd),
    },
    primaryCounts: {
      NIO: cashCountLines(row.cashCountNio, 'NIO'),
      USD: cashCountLines(row.cashCountUsd, 'USD'),
    },
    changeCounts: {
      NIO: cashCountLines(row.changeCashCountNio, 'NIO'),
      USD: cashCountLines(row.changeCashCountUsd, 'USD'),
    },
  };
}

function buildTransactionBatchPayload(rows: CrudRow[]) {
  const settlementRow = rows[0];
  const rate = readExchangeRate();
  return {
    rates: {
      buy: parseExchangeRate(rate.buy),
      sell: parseExchangeRate(rate.sell),
    },
    transactions: rows.map((row) => ({
      entityCode: row.entity,
      movementCode: row.movementCode,
      currencyCode: row.currency === 'USD' ? 'USD' as const : 'NIO' as const,
      amount: parseMoneyValue(row.amountValue),
      pendingName: row.pendingName.trim(),
      description: row.description.trim(),
      settlement: transactionSettlementPayload(row),
    })),
    settlement: transactionSettlementPayload(settlementRow),
  };
}

function mapApiTransactionRow(row: TransactionApiRow): CrudRow {
  return normalizeTransactionRow({
    id: row.id,
    databaseId: row.database_id,
    transactionGroupId: row.id_grupo_transacciones,
    transactionGroupOrder: String(row.orden_grupo),
    registeredAt: coerceTransactionDateTime(row.fecha_transaccion),
    entity: row.entidad,
    movementCode: row.codigo_movimiento,
    movement: row.movimiento,
    direction: row.direccion === 'SALE' ? 'Salida' : 'Ingreso',
    currency: row.moneda,
    amountValue: String(row.monto),
    pendingName: row.pendiente || '',
    pendingDatabaseId: row.pending_database_id || '',
    pendingType: row.pending_type || '',
    pendingStatus: row.pending_status || '',
    pendingBalance: row.pending_balance || '',
    operatorBranch: `${row.cajero}\n${row.sucursal}`,
    description: row.descripcion || '',
    status: row.estado === 'ANULADA' ? 'Anulada' : 'Registrada',
  });
}

function isPayableTransaction(row: CrudRow) {
  return Boolean(row.pendingDatabaseId) && ['PENDIENTE', 'ABONADO', 'VENCIDO'].includes(row.pendingStatus);
}

function preparePendingPaymentRow(row: CrudRow) {
  return normalizeTransactionRow({
    ...row,
    direction: row.pendingType === 'POR_PAGAR' ? 'Salida' : 'Ingreso',
    amountValue: row.pendingBalance || row.amountValue,
    cashCountNio: '{}',
    cashCountUsd: '{}',
    changeCashCountNio: '{}',
    changeCashCountUsd: '{}',
    expectedChangeNio: '0',
    expectedChangeUsd: '0',
  });
}

function cashCountApiLinesToDraft(
  lines: TransactionCashCountApiLine[],
  currency: CashCurrency,
) {
  return serializeTransactionCashCount(
    lines.reduce<Record<string, CashPileDraft>>((result, line) => {
      const denomination = cashDenominations[currency].find(
        (item) => Math.abs(item.value - Number(line.denomination)) < 0.001,
      );
      if (denomination) {
        result[denomination.id] = {
          groups: line.piles25 ? String(line.piles25) : '',
          loose: line.loose ? String(line.loose) : '',
        };
      }
      return result;
    }, {}),
  );
}

function mapApiTransactionDetail(detail: TransactionDetailApi): CrudRow {
  const row = mapApiTransactionRow(detail.transaction);
  return normalizeTransactionRow({
    ...row,
    cashCountNio: cashCountApiLinesToDraft(detail.settlement.primaryCounts.NIO, 'NIO'),
    cashCountUsd: cashCountApiLinesToDraft(detail.settlement.primaryCounts.USD, 'USD'),
    changeCashCountNio: cashCountApiLinesToDraft(detail.settlement.changeCounts.NIO, 'NIO'),
    changeCashCountUsd: cashCountApiLinesToDraft(detail.settlement.changeCounts.USD, 'USD'),
    exchangeRateBuy: String(detail.rates.buy),
    exchangeRateSell: String(detail.rates.sell),
    settlementExchangeRateType: detail.settlement.primaryRateKind === 'VENTA' ? 'Venta' : 'Compra',
    changeExchangeRateType: detail.settlement.changeRateKind === 'VENTA' ? 'Venta' : 'Compra',
    expectedChangeNio: String(detail.settlement.expectedChange.NIO || 0),
    expectedChangeUsd: String(detail.settlement.expectedChange.USD || 0),
  });
}

function getTransactionExchangeRateKind(direction: string, currency: string): ExchangeRateKind {
  if ((direction === 'Ingreso' && currency === 'NIO') || (direction === 'Salida' && currency === 'USD')) {
    return 'Compra';
  }
  return 'Venta';
}

function getTransactionRateValue(rate: ExchangeRate, kind: ExchangeRateKind) {
  return parseExchangeRate(kind === 'Compra' ? rate.buy : rate.sell);
}

function invertExchangeRateKind(kind: ExchangeRateKind): ExchangeRateKind {
  return kind === 'Compra' ? 'Venta' : 'Compra';
}

function calculateTransactionCashDifference({
  cashTotals,
  currency,
  direction,
  expectedAmount,
  rate,
}: {
  cashTotals: Record<CashCurrency, number>;
  currency: CashCurrency;
  direction: string;
  expectedAmount: number;
  rate: ExchangeRate;
}) {
  const rateKind = getTransactionExchangeRateKind(direction, currency);
  const rateValue = getTransactionRateValue(rate, rateKind);

  if (currency === 'NIO') {
    const differenceNio = cashTotals.NIO + cashTotals.USD * rateValue - expectedAmount;
    return {
      differenceNio,
      differenceUsd: differenceNio / rateValue,
      rateKind,
      rateValue,
    };
  }

  const differenceUsd = cashTotals.USD + cashTotals.NIO / rateValue - expectedAmount;
  return {
    differenceNio: differenceUsd * rateValue,
    differenceUsd,
    rateKind,
    rateValue,
  };
}

function calculateMultiTransactionCashDifference({
  cashTotals,
  transactions,
  settlementTransaction,
  rate,
}: {
  cashTotals: Record<CashCurrency, number>;
  transactions: CrudRow[];
  settlementTransaction: CrudRow;
  rate: ExchangeRate;
}) {
  let balanceNio = cashTotals.NIO;
  let balanceUsd = cashTotals.USD;

  transactions.forEach((transaction) => {
    if (!transaction.direction || !transaction.movement) {
      return;
    }
    const currency: CashCurrency = transaction.currency === 'USD' ? 'USD' : 'NIO';
    const amount = parseMoneyValue(transaction.amountValue);
    const rateKind = getTransactionExchangeRateKind(transaction.direction, currency);
    const rateValue = getTransactionRateValue(rate, rateKind);
    const signedAmount = transaction.direction === 'Salida' ? amount : -amount;

    if (currency === 'NIO') {
      balanceNio += signedAmount;
    } else {
      balanceUsd += signedAmount;
    }

    if (balanceNio < 0 && balanceUsd > 0) {
      const usdUsed = Math.min(balanceUsd, -balanceNio / rateValue);
      balanceUsd -= usdUsed;
      balanceNio += usdUsed * rateValue;
    } else if (balanceUsd < 0 && balanceNio > 0) {
      const nioUsed = Math.min(balanceNio, -balanceUsd * rateValue);
      balanceNio -= nioUsed;
      balanceUsd += nioUsed / rateValue;
    }
  });

  const settlementCurrency: CashCurrency = settlementTransaction.currency === 'USD' ? 'USD' : 'NIO';
  const settlementDirection = settlementTransaction.direction || 'Ingreso';
  const rateKind = getTransactionExchangeRateKind(settlementDirection, settlementCurrency);
  const rateValue = getTransactionRateValue(rate, rateKind);
  const differenceNio = balanceNio + balanceUsd * rateValue;

  return {
    differenceNio,
    differenceUsd: differenceNio / rateValue,
    rateKind,
    rateValue,
  };
}

type TransactionCustomerBalanceStep = {
  balanceBeforeChangeNio: number;
  balanceNio: number;
  rateKind: ExchangeRateKind;
  rateValue: number;
  changeRateKind: ExchangeRateKind;
  changeRateValue: number;
};

// Tolera residuos menores a la moneda fisica minima sin bloquear el registro.
const transactionRoundingToleranceNio = 0.05;

function normalizeTransactionRounding(value: number) {
  return Math.abs(value) <= transactionRoundingToleranceNio ? 0 : value;
}

// Calcula en secuencia cuánto efectivo se debe entregar o recibir del cliente en todo el grupo.
function calculateTransactionCustomerBalanceSteps(rows: CrudRow[], rate: ExchangeRate) {
  let balanceNio = 0;

  return rows.map<TransactionCustomerBalanceStep>((row) => {
    const currency: CashCurrency = row.currency === 'USD' ? 'USD' : 'NIO';
    const direction = row.direction === 'Salida' ? 'Salida' : 'Ingreso';
    const rateKind = getTransactionExchangeRateKind(direction, currency);
    const rateValue = getTransactionRateValue(rate, rateKind) || 1;
    const changeRateKind = row.changeExchangeRateType === 'Venta'
      ? 'Venta'
      : row.changeExchangeRateType === 'Compra'
        ? 'Compra'
        : invertExchangeRateKind(rateKind);
    const changeRateValue = getTransactionRateValue(rate, changeRateKind) || 1;

    // Los pendientes totales no alteran el efectivo hasta que sean cancelados.
    if (!row.direction || !row.movement || row.pendingName.trim()) {
      return {
        balanceBeforeChangeNio: balanceNio,
        balanceNio,
        rateKind,
        rateValue,
        changeRateKind,
        changeRateValue,
      };
    }

    const amount = parseMoneyValue(row.amountValue);
    const amountNio = currency === 'USD' ? amount * rateValue : amount;
    const primaryNio = calculateCashPileTotal(
      cashDenominations.NIO,
      readTransactionCashCount(row.cashCountNio),
    ) + calculateCashPileTotal(
      cashDenominations.USD,
      readTransactionCashCount(row.cashCountUsd),
    ) * rateValue;

    // Un retiro y el efectivo recibido favorecen al cliente; un depósito y el efectivo entregado lo consumen.
    balanceNio += direction === 'Salida' ? amountNio - primaryNio : primaryNio - amountNio;
    const balanceBeforeChangeNio = balanceNio;
    const changeNio = calculateCashPileTotal(
      cashDenominations.NIO,
      readTransactionCashCount(row.changeCashCountNio),
    ) + calculateCashPileTotal(
      cashDenominations.USD,
      readTransactionCashCount(row.changeCashCountUsd),
    ) * changeRateValue;
    balanceNio -= changeNio;

    return {
      balanceBeforeChangeNio,
      balanceNio,
      rateKind,
      rateValue,
      changeRateKind,
      changeRateValue,
    };
  });
}

function calculateChangeCashDifference({
  cashTotals,
  currency,
  expectedChange,
  rateValue,
}: {
  cashTotals: Record<CashCurrency, number>;
  currency: CashCurrency;
  expectedChange: Record<CashCurrency, number>;
  rateValue: number;
}) {
  if (currency === 'NIO') {
    const differenceNio = cashTotals.NIO + cashTotals.USD * rateValue - expectedChange.NIO;
    return {
      differenceNio,
      differenceUsd: differenceNio / rateValue,
    };
  }

  const differenceUsd = cashTotals.USD + cashTotals.NIO / rateValue - expectedChange.USD;
  return {
    differenceNio: differenceUsd * rateValue,
    differenceUsd,
  };
}

function calculateShiftCashDifference({
  actual,
  expected,
  registeredDifferenceNio,
  buyRate,
}: {
  actual: Record<CashCurrency, number>;
  expected: Record<CashCurrency, number>;
  registeredDifferenceNio: number;
  buyRate: number;
}) {
  const safeRate = buyRate > 0 ? buyRate : 1;
  const actualEquivalentNio = actual.NIO + actual.USD * safeRate;
  const expectedEquivalentNio = expected.NIO + expected.USD * safeRate;
  // La diferencia pendiente descuenta el sobrante o faltante que el cajero ya reconocio.
  const differenceNio = actualEquivalentNio - expectedEquivalentNio - registeredDifferenceNio;
  return {
    differenceNio,
    differenceUsd: differenceNio / safeRate,
  };
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

function normalizeAccountingMoneyRaw(value?: string) {
  return normalizeConsolidationRaw(value);
}

function formatAccountingMoneyInput(value?: string) {
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

function formatAccountingMoneyRaw(value?: string | number | null) {
  const numericValue = Number(String(value ?? 0).replace(/,/g, '')) || 0;
  return numericValue.toFixed(2);
}

function normalizeSignedAccountingMoneyRaw(value?: string) {
  const source = String(value ?? '').trim();
  const negative = source.startsWith('-');
  const normalized = normalizeAccountingMoneyRaw(source.replace(/-/g, ''));
  return negative && normalized !== '0' ? `-${normalized}` : normalized;
}

function cashDraftFromShiftCounts(counts?: Partial<Record<CashCurrency, ShiftCashCount>>) {
  const draft: Record<string, CashPileDraft> = {};
  for (const currency of ['NIO', 'USD'] as CashCurrency[]) {
    for (const denomination of cashDenominations[currency]) {
      const line = counts?.[currency]?.lines.find((item) => Number(item.denomination) === denomination.value);
      if (line && (line.piles25 || line.loose)) {
        draft[denomination.id] = {
          groups: line.piles25 ? String(line.piles25) : '',
          loose: line.loose ? String(line.loose) : '',
        };
      }
    }
  }
  return draft;
}

function cashCountPayload(draft: Record<string, CashPileDraft>) {
  return (['NIO', 'USD'] as CashCurrency[]).reduce<Record<CashCurrency, ShiftCashLine[]>>(
    (output, currency) => ({
      ...output,
      [currency]: cashDenominations[currency].map((denomination) => ({
        denomination: denomination.value,
        piles25: Number(draft[denomination.id]?.groups || 0),
        loose: Number(draft[denomination.id]?.loose || 0),
      })),
    }),
    { NIO: [], USD: [] },
  );
}

function formatConsolidationInput(value?: string) {
  return formatAccountingMoneyInput(value);
}

function parseConsolidationValue(value?: string) {
  const rawValue = normalizeConsolidationRaw(value);
  return rawValue ? Number(rawValue) : 0;
}

function getAccountingMoneyKeyValue(event: KeyboardEvent<HTMLInputElement>, currentValue?: string) {
  // Deja pasar las teclas de navegacion para que las tablas administren el cambio de campo.
  const allowedControlKeys = [
    'Tab',
    'Enter',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Home',
    'End',
  ];
  if (event.ctrlKey || event.metaKey || allowedControlKeys.includes(event.key)) {
    return undefined;
  }

  const currentRaw = normalizeAccountingMoneyRaw(currentValue);
  const displayedValue = event.currentTarget.value;
  const selectionStart = event.currentTarget.selectionStart ?? 0;
  const selectionEnd = event.currentTarget.selectionEnd ?? selectionStart;
  const hasSelection = selectionEnd > selectionStart;
  const displayedDecimalIndex = displayedValue.indexOf('.');
  const editingDecimals = !hasSelection && displayedDecimalIndex >= 0 && selectionStart > displayedDecimalIndex;

  if (hasSelection && (/^\d$/.test(event.key) || event.key === '.' || event.key === 'Backspace' || event.key === 'Delete')) {
    const replacement = event.key === 'Backspace' || event.key === 'Delete' ? '' : event.key;
    const replacedValue =
      displayedValue.slice(0, selectionStart) +
      replacement +
      displayedValue.slice(selectionEnd);
    return normalizeAccountingMoneyRaw(replacedValue);
  }

  if (event.key === 'Backspace') {
    const [integerPart = '', decimalPart = ''] = currentRaw.split('.');
    if (editingDecimals) {
      const decimalOffset = Math.min(2, selectionStart - displayedDecimalIndex - 1);
      if (decimalOffset <= 0) {
        return currentRaw;
      }
      const decimalDigits = decimalPart.padEnd(2, '0').split('');
      decimalDigits[decimalOffset - 1] = '0';
      return `${integerPart || '0'}.${decimalDigits.join('')}`;
    }
    return `${integerPart.slice(0, -1)}${currentRaw.includes('.') ? `.${decimalPart}` : ''}`;
  }

  if (event.key === 'Delete') {
    return '';
  }

  if (event.key === '.') {
    const [integerPart = '0', decimalPart = ''] = currentRaw.split('.');
    return `${integerPart || '0'}.${decimalPart}`;
  }

  if (/^\d$/.test(event.key)) {
    const [integerPart = '', decimalPart = ''] = currentRaw.split('.');
    const normalizedIntegerPart = integerPart.replace(/^0+(?=\d)/, '');
    if (editingDecimals) {
      const decimalOffset = Math.min(1, selectionStart - displayedDecimalIndex - 1);
      const decimalDigits = decimalPart.padEnd(2, '0').split('');
      decimalDigits[decimalOffset] = event.key;
      return `${normalizedIntegerPart || '0'}.${decimalDigits.join('')}`;
    }
    if (normalizedIntegerPart.length < 10) {
      return `${normalizedIntegerPart}${event.key}${currentRaw.includes('.') ? `.${decimalPart}` : ''}`;
    }
    return null;
  }

  return null;
}

function queueAccountingMoneyCaret(event: KeyboardEvent<HTMLInputElement>, nextValue: string) {
  const input = event.currentTarget;
  const displayedDecimalIndex = input.value.indexOf('.');
  const selectionStart = input.selectionStart ?? 0;
  const selectionEnd = input.selectionEnd ?? selectionStart;
  const hadSelection = selectionEnd > selectionStart;
  const wasEditingDecimals = !hadSelection && displayedDecimalIndex >= 0 && selectionStart > displayedDecimalIndex;
  const crossesDecimalSeparator = event.key === 'Backspace'
    && wasEditingDecimals
    && selectionStart === displayedDecimalIndex + 1;
  const decimalOffset = event.key === '.'
    ? 0
    : wasEditingDecimals && /^\d$/.test(event.key)
      ? Math.min(2, selectionStart - displayedDecimalIndex)
      : wasEditingDecimals && event.key === 'Backspace'
        ? Math.max(0, selectionStart - displayedDecimalIndex - 2)
        : 0;

  window.setTimeout(() => {
    const formattedValue = formatAccountingMoneyInput(nextValue);
    const decimalIndex = formattedValue.indexOf('.');
    const caretPosition = crossesDecimalSeparator
      ? decimalIndex
      : event.key === '.' || wasEditingDecimals
        ? Math.min(formattedValue.length, decimalIndex + 1 + decimalOffset)
      : decimalIndex >= 0
        ? decimalIndex
        : formattedValue.length;
    input.setSelectionRange(caretPosition, caretPosition);
  }, 0);
}

function placeAccountingMoneyCaretBeforeDecimals(input: HTMLInputElement) {
  const numericValue = Number(input.value.replace(/,/g, '')) || 0;
  if (numericValue !== 0) {
    return;
  }
  window.setTimeout(() => {
    const decimalIndex = input.value.indexOf('.');
    const caretPosition = decimalIndex >= 0 ? decimalIndex : input.value.length;
    input.setSelectionRange(caretPosition, caretPosition);
  }, 0);
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

function getAvailableCurrencyCodes(currentValue?: string) {
  try {
    const rows = JSON.parse(window.localStorage.getItem('temo:currencies') ?? '[]') as CatalogApiRow[];
    const currencies = rows
      .filter((row) => String(row.estado ?? '').toUpperCase() === 'ACTIVO')
      .map((row) => String(row.codigo ?? '').toUpperCase())
      .filter(Boolean);
    return includeCurrentOptions(currencies.length ? currencies : ['NIO', 'USD'], currentValue);
  } catch {
    return includeCurrentOptions(['NIO', 'USD'], currentValue);
  }
}

function getShiftAccountsForBranch(branch: string) {
  const accountConfig = crudConfigs.accounts[0];
  return readStoredRows(accountConfig.storageKey, accountConfig.rows).filter((account) => {
    if (isInactive(account)) {
      return false;
    }
    const scope = parseMultiValue(account.scope);
    return (
      scope.length === 0 ||
      scope.some((value) => normalizeLookupValue(value) === 'global') ||
      scope.some((value) => normalizeLookupValue(value) === normalizeLookupValue(branch))
    );
  });
}

function readShiftBankBalances(row: CrudRow, phase: 'opening' | 'closing'): ShiftBankBalanceDraft {
  const key = phase === 'opening' ? 'openingBankBalances' : 'closingBankBalances';
  try {
    return row[key] ? JSON.parse(row[key]) as ShiftBankBalanceDraft : {};
  } catch {
    return {};
  }
}

function serializeShiftBankBalances(value: ShiftBankBalanceDraft) {
  return JSON.stringify(value);
}

function getShiftBalanceAccount(accounts: CrudRow[], currency: CashCurrency, entity: string) {
  return accounts.find(
    (account) =>
      account.currency === currency &&
      normalizeLookupValue(account.entity) === normalizeLookupValue(entity),
  );
}

function mapShiftBalancesToConsolidation(
  accounts: CrudRow[],
  openingBalances: ShiftBankBalanceDraft,
  closingBalances: ShiftBankBalanceDraft,
) {
  return accounts.reduce<Record<string, { initial?: string; system?: string }>>((balances, account) => {
    const currency: CashCurrency = account.currency === 'USD' ? 'USD' : 'NIO';
    const key = getConsolidationKey(currency, account.entity);
    balances[key] = {
      initial: openingBalances[account.id] || '',
      system: closingBalances[account.id] || '',
    };
    return balances;
  }, {});
}

function mapApiShiftBalancesToConsolidation(balances: ShiftDetail['balances']) {
  return balances.reduce<Record<string, { initial?: string; system?: string }>>((result, balance) => {
    const key = getConsolidationKey(balance.currency, balance.entity);
    const current = result[key] ?? {};
    result[key] = {
      initial: String(parseMoneyValue(current.initial) + Number(balance.initial ?? 0)),
      system: String(
        parseMoneyValue(current.system) +
        Number(balance.system ?? balance.calculated ?? balance.initial ?? 0),
      ),
    };
    return result;
  }, {});
}

function mapApiShiftBalanceAccounts(balances: ShiftDetail['balances']) {
  return balances.reduce<Record<string, string>>((result, balance) => {
    const key = getConsolidationKey(balance.currency, balance.entity);
    result[key] ??= balance.account;
    return result;
  }, {});
}

function summarizeShiftBalancesByEntity(
  balances: ShiftDetail['balances'],
  currency: CashCurrency,
) {
  return balances.reduce<Record<string, { income: number; expense: number }>>((summary, balance) => {
    if (balance.currency !== currency) {
      return summary;
    }
    const current = summary[balance.entity] ?? { income: 0, expense: 0 };
    current.income += Number(balance.income ?? 0);
    current.expense += Number(balance.expense ?? 0);
    summary[balance.entity] = current;
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

function shiftDetailToCrudRow(shift: ShiftDetail): CrudRow {
  const openingNio = String(shift.efectivo_inicial_nio ?? '0');
  const openingUsd = String(shift.efectivo_inicial_usd ?? '0');
  const closingNio = String(shift.efectivo_final_nio ?? '');
  const closingUsd = String(shift.efectivo_final_usd ?? '');
  const openedAt = (shift as unknown as { fecha_apertura?: string }).fecha_apertura;
  const closedAt = (shift as unknown as { fecha_cierre?: string | null }).fecha_cierre;
  return normalizeShiftRow({
    databaseId: shift.database_id,
    id: shift.id,
    branchId: shift.id_sucursal,
    branch: shift.sucursal,
    register: shift.caja,
    cashier: shift.cajero,
    openedAt: openedAt ? formatShiftDateTime(new Date(openedAt)) : '',
    closedAt: closedAt ? formatShiftDateTime(new Date(closedAt)) : '',
    openingNio,
    openingUsd,
    closingNio,
    closingUsd,
    changeNio: String(shift.cambio_nio ?? '0'),
    openingCash: formatShiftCash(openingNio, openingUsd),
    closingCash: closingNio || closingUsd ? formatShiftCash(closingNio, closingUsd) : '',
    status: shift.estado === 'CERRADO' ? 'Cerrado' : 'Abierto',
  });
}

function shiftDetailToEditableRow(shift: ShiftDetail): CrudRow {
  const baseRow = shiftDetailToCrudRow(shift);
  const openingDraft = cashDraftFromShiftCounts(shift.cashCounts.APERTURA);
  const closingDraft = cashDraftFromShiftCounts(shift.cashCounts.CIERRE_CONTADO ?? shift.cashCounts.ACTUAL);
  const accountRows = getShiftAccountsForBranch(shift.sucursal);
  const openingBalances: ShiftBankBalanceDraft = {};
  const closingBalances: ShiftBankBalanceDraft = {};
  for (const balance of shift.balances) {
    const account = accountRows.find((item) => normalizeLookupValue(item.alias) === normalizeLookupValue(balance.account));
    if (account) {
      openingBalances[account.id] = String(balance.initial ?? '0');
      closingBalances[account.id] = String(balance.system ?? balance.calculated ?? balance.initial ?? '0');
    }
  }
  return {
    ...baseRow,
    openingCashCountNio: serializeTransactionCashCount(openingDraft),
    openingCashCountUsd: serializeTransactionCashCount(openingDraft),
    closingCashCountNio: serializeTransactionCashCount(closingDraft),
    closingCashCountUsd: serializeTransactionCashCount(closingDraft),
    openingBankBalances: serializeShiftBankBalances(openingBalances),
    closingBankBalances: serializeShiftBankBalances(closingBalances),
    openingNotes: shift.observaciones_apertura ?? '',
    closingNotes: shift.observaciones_cierre ?? '',
  };
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
    cashier: row.cashier || 'Jefa',
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

function getNextShiftRegister(branch: string, shifts: CrudRow[], excludedShiftId?: string) {
  const usedRegisters = new Set(
    shifts
      .map(normalizeShiftRow)
      .filter(
        (shift) =>
          shift.id !== excludedShiftId &&
          shift.status === 'Abierto' &&
          normalizeLookupValue(shift.branch) === normalizeLookupValue(branch),
      )
      .map((shift) => Number.parseInt(shift.register.match(/\d+/)?.[0] ?? '', 10))
      .filter((value) => Number.isFinite(value) && value > 0),
  );

  let registerNumber = 1;
  while (usedRegisters.has(registerNumber)) {
    registerNumber += 1;
  }
  return `Caja ${registerNumber}`;
}

function buildCashPileDraftFromTotal(totalValue: string | undefined, currency: CashCurrency) {
  let remaining = Math.max(0, Number.parseFloat(totalValue || '0') || 0);
  return cashDenominations[currency].reduce<Record<string, CashPileDraft>>((counts, denomination) => {
    const quantity = Math.floor((remaining + 0.0001) / denomination.value);
    if (quantity > 0) {
      counts[denomination.id] = {
        groups: Math.floor(quantity / 25) ? String(Math.floor(quantity / 25)) : '',
        loose: quantity % 25 ? String(quantity % 25) : '',
      };
      remaining -= quantity * denomination.value;
    }
    return counts;
  }, {});
}

function readShiftCashCount(row: CrudRow, currency: CashCurrency, phase: 'opening' | 'closing') {
  const countKey = `${phase}CashCount${currency === 'NIO' ? 'Nio' : 'Usd'}`;
  const totalKey = `${phase}${currency === 'NIO' ? 'Nio' : 'Usd'}`;
  const storedCount = readTransactionCashCount(row[countKey]);
  return Object.keys(storedCount).length ? storedCount : buildCashPileDraftFromTotal(row[totalKey], currency);
}

function getShiftCashierIdentity(name: string) {
  const normalizedName = normalizeLookupValue(name);
  const legacyUsernames: Record<string, string> = {
    jefa: 'jefa',
    'cajera 1': 'cajero1',
    'cajera 2': 'cajero2',
    'cajero 3': 'cajero3',
  };
  const userConfig = crudConfigs.users[0];
  const user = readStoredRows(userConfig.storageKey, userConfig.rows)
    .map(normalizeUserRow)
    .find(
      (candidate) =>
        normalizeLookupValue(getUserDisplayName(candidate)) === normalizedName ||
        normalizeLookupValue(candidate.username) === normalizedName ||
        normalizeLookupValue(candidate.username) === legacyUsernames[normalizedName],
    );
  return user?.id || normalizedName;
}

function getShiftCashiersForBranch(branch: string, currentCashier?: string) {
  const branchConfig = crudConfigs.branches[0];
  const branchRow = readStoredRows(branchConfig.storageKey, branchConfig.rows)
    .map(normalizeBranchRow)
    .find((candidate) => normalizeLookupValue(candidate.name) === normalizeLookupValue(branch));
  const assignedCashiers = parseMultiValue(branchRow?.cashiers);
  const availableCashiers = getAvailableUserNames();
  const availableIdentities = new Set(availableCashiers.map(getShiftCashierIdentity));
  const scopedCashiers = assignedCashiers.filter((cashier) => availableIdentities.has(getShiftCashierIdentity(cashier)));
  return includeCurrentOptions(scopedCashiers.length ? scopedCashiers : availableCashiers, currentCashier);
}

function getDatabaseCashiersForBranch(
  branches: BranchCatalogRow[],
  branch: string,
  currentCashier?: string,
) {
  const databaseBranch = branches.find(
    (candidate) => normalizeLookupValue(candidate.nombre) === normalizeLookupValue(branch),
  );
  const assignedCashiers = parseMultiValue(databaseBranch?.cajeros);
  if (databaseBranch) {
    return includeCurrentOptions(assignedCashiers, currentCashier);
  }
  return includeCurrentOptions(
    getShiftCashiersForBranch(branch),
    currentCashier,
  );
}

function readLocalOpeningCash(): OpeningCashSummary {
  const shiftConfig = crudConfigs.shifts[0];
  const openShift = readStoredRows(shiftConfig.storageKey, shiftConfig.rows)
    .map(normalizeShiftRow)
    .find((shift) => shift.status === 'Abierto');

  if (!openShift) {
    return { nio: 0, usd: 0, context: 'Sin turno abierto' };
  }

  return {
    nio: parseMoneyValue(openShift.openingNio),
    usd: parseMoneyValue(openShift.openingUsd),
    context: [openShift.branch, openShift.register].filter(Boolean).join(' - '),
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
  // Conserva el nombre oficial recibido del catalogo para que coincida con el selector.
  return String(value ?? '').trim();
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
  const amountValue = row.amountValue || row.amount || '';
  const entity = row.entity || 'BAC';
  const hasMovement = Object.prototype.hasOwnProperty.call(row, 'movement');
  const movement = normalizeTransactionMovement(hasMovement ? row.movement : 'Depositos a cuenta');
  const movementRow = getTransactionMovementByName(entity, movement);
  const requestedCurrency: CashCurrency =
    row.currency === 'USD' || (!row.currency && amountText.startsWith('$')) ? 'USD' : 'NIO';
  const movementCurrencies = getMovementCurrencies(movementRow);
  const currency =
    movementRow && !movementCurrencies.includes(requestedCurrency)
      ? getDefaultMovementCurrency(movementRow)
      : requestedCurrency;
  const movementCode = row.movementCode || movementRow?.code || '';
  const hasDirection = Object.prototype.hasOwnProperty.call(row, 'direction');
  const direction = hasDirection ? row.direction : getTransactionMovementDirection(entity, movement);
  const exchangeRate = readExchangeRate();
  const exchangeRateType: ExchangeRateKind =
    row.exchangeRateType === 'Compra' || row.exchangeRateType === 'Venta'
      ? row.exchangeRateType
      : getTransactionExchangeRateKind(direction || 'Ingreso', currency);
  const defaultChangeExchangeRateType = invertExchangeRateKind(exchangeRateType);
  const changeExchangeRateType: ExchangeRateKind =
    row.changeExchangeRateType === 'Compra' || row.changeExchangeRateType === 'Venta'
      ? row.changeExchangeRateType
      : defaultChangeExchangeRateType;
  return {
    ...row,
    registeredAt: coerceTransactionDateTime(row.registeredAt || row.date),
    entity,
    movementCode,
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
    changeCashCountNio: row.changeCashCountNio || '{}',
    changeCashCountUsd: row.changeCashCountUsd || '{}',
    exchangeRateType,
    exchangeRateValue:
      row.exchangeRateValue ||
      formatRateDisplay(exchangeRateType === 'Compra' ? exchangeRate.buy : exchangeRate.sell),
    changeExchangeRateType,
    changeExchangeRateValue:
      row.changeExchangeRateValue ||
      formatRateDisplay(changeExchangeRateType === 'Compra' ? exchangeRate.buy : exchangeRate.sell),
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
    const storedRows = stored ? (JSON.parse(stored) as CrudRow[]) : initialRows;
    let parsedRows = mergeInitialCatalogRows(storageKey, storedRows, initialRows);
    if (storageKey === 'movements' && (parsedRows.length < 20 || !parsedRows.every((row) => row.direction))) {
      return initialRows;
    }
    if (storageKey === 'movements') {
      parsedRows = normalizeMovementCurrencyRules(parsedRows);
    }
    if (storageKey === 'users') {
      return parsedRows.map(normalizeUserRow);
    }
    if (storageKey === 'branches') {
      return parsedRows.map(normalizeBranchRow);
    }
    return parsedRows;
  });

  useEffect(() => {
    window.localStorage.setItem(`temo:${storageKey}`, JSON.stringify(rows));
  }, [rows, storageKey]);

  useEffect(() => {
    const endpoint = catalogEndpointByStorageKey[storageKey];
    if (!endpoint) return;
    const config =
      storageKey === 'roles'
        ? roleCatalogConfig
        : Object.values(crudConfigs).flat().find((candidate) => candidate.storageKey === storageKey);
    if (!config) return;
    let cancelled = false;
    void loadCatalogRows(storageKey, config)
      .then((databaseRows) => {
        if (!cancelled) setRows(databaseRows);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  useOperationalRefresh(async () => {
    const endpoint = catalogEndpointByStorageKey[storageKey];
    if (!endpoint) return;
    const config =
      storageKey === 'roles'
        ? roleCatalogConfig
        : Object.values(crudConfigs).flat().find((candidate) => candidate.storageKey === storageKey);
    if (config) setRows(await loadCatalogRows(storageKey, config));
  }, Boolean(catalogEndpointByStorageKey[storageKey]), 5000);

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

const operationalDataChangedEvent = 'temo:operational-data-changed';
const systemConfirmEvent = 'temo:system-confirm';

type SystemConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  alertOnly?: boolean;
};

type SystemConfirmRequest = Required<SystemConfirmOptions> & {
  message: string;
  resolve: (accepted: boolean) => void;
};

function requestSystemConfirm(message: string, options: SystemConfirmOptions = {}) {
  return new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent<SystemConfirmRequest>(systemConfirmEvent, {
      detail: {
        message,
        title: options.title ?? 'Confirmar accion',
        confirmLabel: options.confirmLabel ?? 'Confirmar',
        cancelLabel: options.cancelLabel ?? 'Cancelar',
        tone: options.tone ?? 'primary',
        alertOnly: options.alertOnly ?? false,
        resolve,
      },
    }));
  });
}

// Presenta avisos informativos con la misma ventana visual de TEMO.
function requestSystemAlert(message: string, title = 'Aviso') {
  return requestSystemConfirm(message, {
    title,
    confirmLabel: 'Entendido',
    alertOnly: true,
  });
}

function announceOperationalDataChange() {
  window.dispatchEvent(new Event(operationalDataChangedEvent));
  try {
    window.localStorage.setItem('temo:operational-data-revision', String(Date.now()));
  } catch {
    // La sincronizacion periodica sigue funcionando si el almacenamiento no esta disponible.
  }
}

function useOperationalRefresh(
  refresh: () => void | Promise<void>,
  enabled = true,
  intervalMs = 3000,
) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let running = false;
    const run = async () => {
      if (!active || running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        await refreshRef.current();
      } catch {
        // Un fallo transitorio no debe interrumpir los siguientes intentos.
      } finally {
        running = false;
      }
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'temo:operational-data-revision') void run();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void run();
    };
    const timer = window.setInterval(() => void run(), intervalMs);
    window.addEventListener('focus', run);
    window.addEventListener('storage', handleStorage);
    window.addEventListener(operationalDataChangedEvent, run);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', run);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(operationalDataChangedEvent, run);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [enabled, intervalMs]);
}

export function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => readAuthenticatedUser());
  const [activeScreen, setActiveScreen] = useState<ScreenId>(getScreenFromHash);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [openGroupId, setOpenGroupId] = useState<ScreenId | null>(() => findParentGroupId(getScreenFromHash()));
  const [notifications, setNotifications] = useState<ShiftNotification[]>([]);
  const [dismissedNotifications, setDismissedNotifications] = useState<string[]>([]);
  const [closingShift, setClosingShift] = useState<ShiftDetail | null>(null);
  const [systemConfirm, setSystemConfirm] = useState<SystemConfirmRequest | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [profilePhotoError, setProfilePhotoError] = useState('');
  const [isUploadingProfilePhoto, setIsUploadingProfilePhoto] = useState(false);
  const [, setCatalogRevision] = useState(0);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);

  // Cierra el menu de usuario al hacer clic fuera o presionar Escape.
  useEffect(() => {
    if (!isProfileMenuOpen) return;
    const closeFromPointer = (event: MouseEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setIsProfileMenuOpen(false);
    };
    const closeFromKeyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setIsProfileMenuOpen(false);
    };
    document.addEventListener('mousedown', closeFromPointer);
    window.addEventListener('keydown', closeFromKeyboard);
    return () => {
      document.removeEventListener('mousedown', closeFromPointer);
      window.removeEventListener('keydown', closeFromKeyboard);
    };
  }, [isProfileMenuOpen]);

  // Cierra sesiones abandonadas sin guardar contrasenas ni informacion sensible.
  useEffect(() => {
    if (!currentUser) return;
    const idleMinutes = Number(
      (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
        ?.VITE_SESSION_IDLE_MINUTES || '30',
    );
    const idleMs = Math.max(5, Number.isFinite(idleMinutes) ? idleMinutes : 30) * 60_000;
    let timer = window.setTimeout(() => window.dispatchEvent(new Event('temo:session-expired')), idleMs);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => window.dispatchEvent(new Event('temo:session-expired')), idleMs);
    };
    const events: Array<keyof WindowEventMap> = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [currentUser?.id]);

  // Restaura una sesion valida y descarta tokens vencidos o usuarios inactivos.
  useEffect(() => {
    const handleSystemConfirm = (event: Event) => setSystemConfirm((event as CustomEvent<SystemConfirmRequest>).detail);
    window.addEventListener(systemConfirmEvent, handleSystemConfirm);
    return () => window.removeEventListener(systemConfirmEvent, handleSystemConfirm);
  }, []);

  useEffect(() => {
    if (!systemConfirm) return;
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        systemConfirm.resolve(false);
        setSystemConfirm(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [systemConfirm]);

  useEffect(() => {
    const token = window.sessionStorage.getItem(authTokenStorageKey);
    if (!token || !currentUser) {
      return;
    }
    void apiRequest<{ user: AuthUser }>('/auth/me')
      .then(({ user }) => {
        window.sessionStorage.setItem(authUserStorageKey, JSON.stringify(user));
        setCurrentUser(user);
      })
      .catch(() => {
        window.sessionStorage.removeItem(authTokenStorageKey);
        window.sessionStorage.removeItem(authUserStorageKey);
        setCurrentUser(null);
        window.location.hash = '/login';
      });
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      return;
    }
    let active = true;
    const loadNotifications = () => {
      void apiRequest<ShiftNotification[]>('/shifts/notifications')
        .then((items) => active && setNotifications(items))
        .catch(() => undefined);
    };
    loadNotifications();
    const refreshNotifications = () => loadNotifications();
    window.addEventListener(operationalDataChangedEvent, refreshNotifications);
    const timer = window.setInterval(loadNotifications, 5000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener(operationalDataChangedEvent, refreshNotifications);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    void hydrateRelationalCatalogs(currentUser.roleCode === 'JEFA')
      .then(() => {
        if (!cancelled) setCatalogRevision((current) => current + 1);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  // Cierra la interfaz cuando cualquier llamada detecta que la sesion vencio.
  useEffect(() => {
    const handleExpiredSession = () => {
      window.sessionStorage.removeItem(authTokenStorageKey);
      window.sessionStorage.removeItem(authUserStorageKey);
      setCurrentUser(null);
      setActiveScreen('login');
      window.location.hash = '/login';
    };
    window.addEventListener('temo:session-expired', handleExpiredSession);
    return () => window.removeEventListener('temo:session-expired', handleExpiredSession);
  }, []);

  // Mantiene sincronizada la ruta y bloquea pantallas fuera del perfil autenticado.
  useEffect(() => {
    const handleRouteChange = () => {
      if (!currentUser) {
        setActiveScreen('login');
        if (window.location.hash !== '#/login') {
          window.location.hash = '/login';
        }
        return;
      }
      const nextScreen = getScreenFromHash();
      const permittedScreen =
        nextScreen !== 'login' && canAccessScreen(currentUser, nextScreen)
          ? nextScreen
          : getDefaultScreen(currentUser);
      const permittedItem = navItems.find((item) => item.id === permittedScreen);
      if (permittedItem && window.location.hash !== `#${permittedItem.route}`) {
        window.location.hash = permittedItem.route;
      }
      setActiveScreen(permittedScreen);
      setOpenGroupId(findParentGroupId(permittedScreen));
      if (isCompactViewport()) {
        setIsSidebarOpen(false);
      }
    };
    handleRouteChange();
    window.addEventListener('hashchange', handleRouteChange);
    return () => window.removeEventListener('hashchange', handleRouteChange);
  }, [currentUser]);

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
  const visibleNavGroups = useMemo(() => {
    if (!currentUser) {
      return [];
    }
    return navGroups
      .map((group) => ({
        ...group,
        children: group.children?.filter((child) => canAccessScreen(currentUser, child.id)),
      }))
      .filter(
        (group) =>
          canAccessScreen(currentUser, group.item.id) || Boolean(group.children?.length),
      );
  }, [currentUser]);

  // Cambia la ruta simulada y deja marcado el boton activo del menu.
  function navigateTo(item: NavItem) {
    if (!currentUser || !canAccessScreen(currentUser, item.id)) {
      return;
    }
    window.location.hash = item.route;
    setActiveScreen(item.id);
    setOpenGroupId(findParentGroupId(item.id));
    if (isCompactViewport()) {
      setIsSidebarOpen(false);
    }
  }

  function navigateFromBrand() {
    if (!currentUser) {
      return;
    }
    const targetScreen = getDefaultScreen(currentUser);
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

  function completeLogin(response: LoginResponse) {
    window.sessionStorage.setItem(authTokenStorageKey, response.token);
    window.sessionStorage.setItem(authUserStorageKey, JSON.stringify(response.user));
    setCurrentUser(response.user);
    const target = getDefaultScreen(response.user);
    setActiveScreen(target);
    const targetItem = navItems.find((item) => item.id === target);
    window.location.hash = targetItem?.route ?? '/login';
  }

  function closeSession() {
    void apiRequest('/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.sessionStorage.removeItem(authTokenStorageKey);
    window.sessionStorage.removeItem(authUserStorageKey);
    setCurrentUser(null);
    setActiveScreen('login');
    window.location.hash = '/login';
  }

  // Sustituye el usuario autenticado y conserva la sesion emitida al cambiar contrasena.
  function completeProfilePasswordChange(response: LoginResponse) {
    completeLogin(response);
    setIsPasswordDialogOpen(false);
    setIsProfileMenuOpen(false);
  }

  // Procesa y guarda la fotografia seleccionada en el perfil del usuario actual.
  async function changeProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || isUploadingProfilePhoto) return;
    setIsUploadingProfilePhoto(true);
    setProfilePhotoError('');
    try {
      const photoDataUrl = await prepareProfilePhoto(file);
      const response = await apiRequest<{ user: AuthUser }>('/auth/profile-photo', {
        method: 'POST',
        body: JSON.stringify({ photoDataUrl }),
      });
      window.sessionStorage.setItem(authUserStorageKey, JSON.stringify(response.user));
      setCurrentUser(response.user);
      setIsProfileMenuOpen(false);
    } catch (photoError) {
      setProfilePhotoError(photoError instanceof Error ? photoError.message : 'No fue posible cambiar la fotografia.');
    } finally {
      setIsUploadingProfilePhoto(false);
    }
  }

  const visibleNotification = notifications.find((item) => !dismissedNotifications.includes(item.id));

  async function openShiftClosure(shiftId: string) {
    const detail = await apiRequest<ShiftDetail>(`/shifts/${shiftId}`);
    setClosingShift(detail);
  }

  async function acceptCloseRequest(notification: ShiftNotification) {
    setDismissedNotifications((current) => [...current, notification.id]);
    const shiftsItem = navItems.find((item) => item.id === 'shifts');
    if (shiftsItem) {
      navigateTo(shiftsItem);
    }
    await openShiftClosure(notification.shift_id);
  }

  async function acknowledgeClosedShift(notification: ShiftNotification) {
    await apiRequest(`/shifts/notifications/${notification.id}/acknowledge`, { method: 'POST' });
    setNotifications((current) => current.filter((item) => item.id !== notification.id));
  }

  if (!currentUser) {
    return <LoginScreen onLogin={completeLogin} />;
  }

  if (currentUser.mustChangePassword) {
    return <ChangePasswordScreen user={currentUser} onChanged={completeLogin} onCancel={closeSession} />;
  }

  return (
    <>
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
          {visibleNavGroups.map((group) => {
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
                  {Boolean(group.children?.length) && (
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
          {/* Identidad del usuario y acciones personales disponibles desde un menu contextual. */}
          <div className="session-controls" ref={profileMenuRef}>
            <button
              type="button"
              className="profile-menu-trigger"
              aria-expanded={isProfileMenuOpen}
              aria-haspopup="menu"
              onClick={() => {
                setProfilePhotoError('');
                setIsProfileMenuOpen((current) => !current);
              }}
            >
              <span className="profile-avatar">
                {currentUser.profilePhoto
                  ? <img src={currentUser.profilePhoto} alt="Foto de perfil" />
                  : <UserRound size={21} />}
              </span>
              <span className="session-user">
                <strong>{currentUser.fullName}</strong>
                <span>{currentUser.roleName}</span>
              </span>
              <ChevronDown size={16} className={isProfileMenuOpen ? 'profile-menu-chevron--open' : ''} />
            </button>
            {isProfileMenuOpen && (
              <div className="profile-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => setIsPasswordDialogOpen(true)}>
                  <KeyRound size={18} /><span>Cambiar contraseña</span>
                </button>
                <button type="button" role="menuitem" disabled={isUploadingProfilePhoto} onClick={() => profilePhotoInputRef.current?.click()}>
                  <Camera size={18} /><span>{isUploadingProfilePhoto ? 'Procesando foto...' : 'Cambiar foto de perfil'}</span>
                </button>
                <button type="button" role="menuitem" className="profile-menu__logout" onClick={closeSession}>
                  <LogOut size={18} /><span>Cerrar sesión</span>
                </button>
                {profilePhotoError && <p role="alert">{profilePhotoError}</p>}
              </div>
            )}
            <input ref={profilePhotoInputRef} className="profile-photo-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void changeProfilePhoto(event)} />
          </div>
        </header>

        {/* Renderiza el contenido especializado o CRUD de cada pantalla. */}
        <div
          onClick={() => {
            if (isCompactViewport()) {
              setIsSidebarOpen(false);
            }
          }}
        >
          <ScreenContent screen={activeScreen} currentUser={currentUser} onOpenShiftClose={openShiftClosure} />
        </div>
      </section>
    </main>
    {visibleNotification && (
      <div className="modal-backdrop shift-notification-backdrop" role="dialog" aria-modal="true">
        <section className="shift-notification-modal">
          <div className="shift-notification-icon"><Banknote size={24} /></div>
          <div>
            <p>{
              visibleNotification.kind === 'CLOSE_REQUEST'
                ? 'Solicitud de cierre de caja'
                : visibleNotification.kind === 'PENDING_PAID'
                  ? 'Pendiente marcado como pagado'
                  : 'Caja cerrada exitosamente'
            }</p>
            <h2>{visibleNotification.cashier}</h2>
            <span>
              {visibleNotification.kind === 'PENDING_PAID' && visibleNotification.currency
                ? formatCashCountMoney(Number(visibleNotification.amount || 0), visibleNotification.currency)
                : `${visibleNotification.branch} · ${visibleNotification.register}`}
            </span>
            {visibleNotification.observations && <blockquote>{visibleNotification.observations}</blockquote>}
          </div>
          <div className="modal-footer">
            {visibleNotification.kind === 'CLOSE_REQUEST' ? (
              <>
                <button type="button" className="secondary-button danger-button" onClick={() => setDismissedNotifications((current) => [...current, visibleNotification.id])}>Cancelar</button>
                <button type="button" className="primary-button" onClick={() => void acceptCloseRequest(visibleNotification)}>Aceptar</button>
              </>
            ) : (
              <button type="button" className="primary-button" onClick={() => void acknowledgeClosedShift(visibleNotification)}>Aceptar</button>
            )}
          </div>
        </section>
      </div>
    )}
    {systemConfirm && (
      <div className="system-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="system-confirm-title">
        <section className={`system-dialog system-dialog--${systemConfirm.tone}`}>
          <div className="system-dialog__icon">{systemConfirm.tone === 'danger' ? <Ban size={24}/> : <ShieldCheck size={24}/>}</div>
          <div className="system-dialog__content"><p>{systemConfirm.alertOnly ? 'Notificacion' : 'Confirmacion'}</p><h2 id="system-confirm-title">{systemConfirm.title}</h2><span>{systemConfirm.message}</span></div>
          <div className="system-dialog__actions">{!systemConfirm.alertOnly && <button type="button" className="secondary-button danger-button" onClick={() => { systemConfirm.resolve(false); setSystemConfirm(null); }}><X size={17}/>{systemConfirm.cancelLabel}</button>}<button type="button" autoFocus className={systemConfirm.tone === 'danger' ? 'primary-button system-dialog__danger-action' : 'primary-button'} onClick={() => { systemConfirm.resolve(true); setSystemConfirm(null); }}><CheckCircle2 size={17}/>{systemConfirm.confirmLabel}</button></div>
        </section>
      </div>
    )}
    {/* Formulario modal para cambiar la contrasena sin abandonar la pantalla actual. */}
    {isPasswordDialogOpen && (
      <ChangePasswordDialog
        username={currentUser.username}
        onChanged={completeProfilePasswordChange}
        onCancel={() => setIsPasswordDialogOpen(false)}
      />
    )}
    {closingShift && (
      <ShiftClosureModal
        shift={closingShift}
        onCancel={() => setClosingShift(null)}
        onClosed={() => {
          setClosingShift(null);
          setNotifications((current) => current.filter((item) => item.shift_id !== closingShift.database_id));
        }}
      />
    )}
    </>
  );
}

function ShiftClosureModal({
  shift,
  onCancel,
  onClosed,
}: {
  shift: ShiftDetail;
  onCancel: () => void;
  onClosed: () => void;
}) {
  const [cashDraft, setCashDraft] = useState<Record<string, CashPileDraft>>(() => cashDraftFromShiftCounts(shift.cashCounts.ACTUAL));
  const [balances, setBalances] = useState<Record<string, string>>(() => Object.fromEntries(
    shift.balances.map((balance) => [balance.account, formatAccountingMoneyRaw(balance.system || balance.calculated || balance.initial)]),
  ));
  const [observations, setObservations] = useState('');
  const [changeNio, setChangeNio] = useState(() => formatAccountingMoneyRaw(shift.cambio_nio));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const rate = parseExchangeRate(readExchangeRate().buy);
  const finalNio = calculateCashPileTotal(cashDenominations.NIO, cashDraft);
  const finalUsd = calculateCashPileTotal(cashDenominations.USD, cashDraft);
  const { differenceNio, differenceUsd } = calculateShiftCashDifference({
    actual: { NIO: finalNio, USD: finalUsd },
    expected: shift.expectedCash,
    registeredDifferenceNio: parseMoneyValue(changeNio),
    buyRate: rate,
  });

  function updateCash(denominationId: string, field: 'groups' | 'loose', value: string) {
    const clean = value.replace(/\D/g, '');
    setCashDraft((current) => ({
      ...current,
      [denominationId]: { ...current[denominationId], [field]: clean ? String(Number(clean)) : '' },
    }));
  }

  function handleClosingBalanceKeyDown(event: KeyboardEvent<HTMLInputElement>, account: string, currency: CashCurrency, rowIndex: number, rowCount: number) {
    const nextValue = getAccountingMoneyKeyValue(event, balances[account]);
    if (nextValue !== undefined) {
      event.preventDefault();
      if (nextValue !== null) {
        setBalances((current) => ({ ...current, [account]: nextValue }));
        queueAccountingMoneyCaret(event, nextValue);
      }
      return;
    }

    const focusSelector = (selector: string) => window.setTimeout(() => {
      const input = document.querySelector<HTMLElement>(selector);
      input?.focus();
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) input.select();
    }, 0);
    const next = () => {
      if (rowIndex < rowCount - 1) {
        focusSelector(`[data-shift-close-balance-currency="${currency}"][data-shift-close-balance-row="${rowIndex + 1}"]`);
        return true;
      }
      if (currency === 'NIO') {
        focusSelector('[data-shift-close-balance-currency="USD"][data-shift-close-balance-row="0"]');
        return true;
      }
      focusSelector('[data-shift-close-observations]');
      return true;
    };
    if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      next();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      if (rowIndex > 0) {
        focusSelector(`[data-shift-close-balance-currency="${currency}"][data-shift-close-balance-row="${rowIndex - 1}"]`);
      }
    } else if (event.key === 'Tab') {
      if (event.shiftKey && rowIndex > 0) {
        event.preventDefault();
        focusSelector(`[data-shift-close-balance-currency="${currency}"][data-shift-close-balance-row="${rowIndex - 1}"]`);
      } else if (!event.shiftKey) {
        event.preventDefault();
        next();
      }
    }
  }

  async function closeShift() {
    setSaving(true);
    setError('');
    try {
      // Envía arqueo, cambio, saldos y cierre en una única transacción del servidor.
      await apiRequest(`/shifts/${shift.database_id}/close`, {
        method: 'POST',
        body: JSON.stringify({
          counts: cashCountPayload(cashDraft),
          balances: shift.balances.map((balance) => ({ account: balance.account, amount: parseMoneyValue(balances[balance.account]) })),
          changeNio: parseMoneyValue(changeNio),
          observations,
        }),
      });
      announceOperationalDataChange();
      onClosed();
    } catch (closeError) {
      setError(closeError instanceof Error ? closeError.message : 'No fue posible cerrar el turno.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="close-shift-title">
      <section className="shift-close-modal">
        <header className="modal-header">
          <div><p>Cierre solicitado</p><h2 id="close-shift-title">Cerrar turno</h2></div>
          <button type="button" className="icon-button close-button" onClick={onCancel} aria-label="Cerrar"><X size={18} /></button>
        </header>
        <div className="shift-close-body">
          <div className="shift-close-summary shift-close-summary--identity">
            <label>ID<strong>{shift.id}</strong></label><label>Sucursal<strong>{shift.sucursal}</strong></label><label>Caja<strong>{shift.caja}</strong></label><label>Cajero<strong>{shift.cajero}</strong></label>
          </div>
          <div className="transaction-cash-count-grid shift-close-cash-grid">
            <TransactionCashCountTable currency="NIO" denominations={cashDenominations.NIO} focusScope="shift-close" pileDrafts={cashDraft} conversionRate={rate} nextFocusSelector={'[data-cash-scope="shift-close"][data-cash-currency="USD"][data-cash-row="0"][data-cash-column="0"]'} onPileFieldChange={updateCash} />
            <div className="cash-count-right-column">
              <TransactionCashCountTable currency="USD" denominations={cashDenominations.USD} focusScope="shift-close" pileDrafts={cashDraft} conversionRate={rate} onPileFieldChange={updateCash} />
              <div className="cash-count-adjustments shift-close-adjustments">
                <div><strong>Diferencia NIO</strong>{renderDifference(differenceNio, 'NIO', { positiveLabel: '' })}</div>
                <div><strong>Diferencia USD</strong>{renderDifference(differenceUsd, 'USD', { positiveLabel: '' })}</div>
                <label>
                  <strong>Diferencia registrada</strong>
                  <span className="cash-change-entry"><span>C$</span><input value={changeNio} inputMode="decimal" onChange={(event) => setChangeNio(normalizeSignedAccountingMoneyRaw(event.target.value))} /></span>
                  <button type="button" className="secondary-button" onClick={() => setChangeNio(formatAccountingMoneyRaw(parseMoneyValue(changeNio) + differenceNio))}>Registrar diferencia</button>
                </label>
              </div>
            </div>
          </div>
          <section className="shift-close-balances">
            <h3>Saldos de cuentas de la sucursal</h3>
            <div className="shift-close-balance-tables">
              {(['NIO', 'USD'] as CashCurrency[]).map((currency) => (
                <section className={`shift-close-balance-card shift-close-balance-card--${currency.toLowerCase()}`} key={currency}>
                  <header>{currency === 'NIO' ? 'Saldos en Cordobas (NIO)' : 'Saldos en Dolares (USD)'}</header>
                  <table>
                    <thead><tr><th>Banco / Cuenta</th><th>Saldo del sistema</th><th>Diferencia</th></tr></thead>
                    <tbody>
                      {shift.balances.filter((balance) => balance.currency === currency).map((balance, rowIndex, currencyBalances) => {
                        const systemAmount = parseMoneyValue(balances[balance.account]);
                        const calculatedAmount = parseMoneyValue(balance.calculated);
                        return (
                          <tr key={balance.account}>
                            <td><strong>{balance.entity}</strong><small>{balance.account}</small></td>
                            <td><div className="consolidation-input-wrap"><span>{getCurrencySymbol(currency)}</span><input data-shift-close-balance-currency={currency} data-shift-close-balance-row={rowIndex} value={formatAccountingMoneyInput(balances[balance.account])} inputMode="decimal" onChange={(event) => setBalances((current) => ({ ...current, [balance.account]: normalizeAccountingMoneyRaw(event.target.value) }))} onKeyDown={(event) => handleClosingBalanceKeyDown(event, balance.account, currency, rowIndex, currencyBalances.length)} onFocus={(event) => placeAccountingMoneyCaretBeforeDecimals(event.currentTarget)} onClick={(event) => placeAccountingMoneyCaretBeforeDecimals(event.currentTarget)} /></div></td>
                            <td>{renderDifference(systemAmount - calculatedAmount, currency, { positiveLabel: '' })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </section>
              ))}
            </div>
          </section>
          <label className="form-field">Observaciones de cierre<textarea data-shift-close-observations value={observations} onChange={(event) => setObservations(event.target.value)} /></label>
          {error && <p className="login-error">{error}</p>}
        </div>
        <footer className="modal-footer">
          <button type="button" className="secondary-button danger-button" onClick={onCancel}><X size={17} />Cancelar</button>
          <button type="button" className="primary-button" onClick={() => void closeShift()} disabled={saving}><Save size={17} />{saving ? 'Guardando...' : 'Guardar'}</button>
        </footer>
      </section>
    </div>
  );
}

function ChangePasswordScreen({
  user,
  onChanged,
  onCancel,
}: {
  user: AuthUser;
  onChanged: (response: LoginResponse) => void;
  onCancel: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const formRef = useAutoFocusFirstField<HTMLFormElement>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (newPassword !== confirmation) {
      setError('La confirmacion no coincide con la nueva contrasena.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await apiRequest<LoginResponse>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      onChanged(response);
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'No fue posible cambiar la contrasena.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="change-password-title">
        <div className="login-brand">
          <img src="/LOGO_TEMO.png" alt="TEMO" />
          <span>Transacciones Económicas Miscelánea Olivera</span>
        </div>
        <div className="login-heading">
          <small>Primer ingreso de {user.username}</small>
          <h1 id="change-password-title">Cambiar contraseña</h1>
          <p>Utilice al menos 10 caracteres, una mayúscula, una minúscula y un número.</p>
        </div>
        <form className="login-form" onSubmit={submit} ref={formRef}>
          <label className="form-field">Contraseña actual<input autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
          <label className="form-field">Nueva contraseña<input autoComplete="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} required /></label>
          <label className="form-field">Confirmar contraseña<input autoComplete="new-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={10} required /></label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <button type="submit" className="primary-button login-submit" disabled={saving}><ShieldCheck size={19} />{saving ? 'Actualizando...' : 'Cambiar contraseña'}</button>
          <button type="button" className="secondary-button danger-button login-submit" onClick={onCancel}><X size={18} />Cancelar</button>
        </form>
      </section>
    </main>
  );
}

function ChangePasswordDialog({
  username,
  onChanged,
  onCancel,
}: {
  username: string;
  onChanged: (response: LoginResponse) => void;
  onCancel: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const formRef = useAutoFocusFirstField<HTMLFormElement>();

  // Valida la confirmacion y solicita una nueva sesion con la contrasena actualizada.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (newPassword !== confirmation) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await apiRequest<LoginResponse>('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      onChanged(response);
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : 'No fue posible cambiar la contraseña.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop profile-password-backdrop" role="dialog" aria-modal="true" aria-labelledby="profile-password-title">
      <section className="modal-panel profile-password-modal">
        {/* Encabezado compacto que mantiene visible la accion de cancelar. */}
        <header className="modal-header">
          <div><p>Seguridad de {username}</p><h2 id="profile-password-title">Cambiar contraseña</h2></div>
          <button type="button" className="icon-button danger-button" onClick={onCancel} aria-label="Cancelar"><X size={19} /></button>
        </header>
        {/* Campos requeridos para verificar la identidad y definir la nueva clave. */}
        <form className="profile-password-form" onSubmit={submit} ref={formRef}>
          <p className="muted-copy">Utilice al menos 10 caracteres, una mayúscula, una minúscula y un número.</p>
          <label className="form-field">Contraseña actual<input autoComplete="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label>
          <label className="form-field">Nueva contraseña<input autoComplete="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} required /></label>
          <label className="form-field">Confirmar contraseña<input autoComplete="new-password" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={10} required /></label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <footer className="modal-actions">
            <button type="button" className="secondary-button danger-button" onClick={onCancel}><X size={17} />Cancelar</button>
            <button type="submit" className="primary-button" disabled={saving}><ShieldCheck size={18} />{saving ? 'Actualizando...' : 'Cambiar contraseña'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function LoginScreen({ onLogin }: { onLogin: (response: LoginResponse) => void }) {
  const rememberedUsername = window.localStorage.getItem(rememberedUsernameStorageKey) ?? '';
  const [username, setUsername] = useState(rememberedUsername);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(Boolean(rememberedUsername));
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRecoveryOpen, setIsRecoveryOpen] = useState(false);
  const [isApiReady, setIsApiReady] = useState(false);
  const loginRef = useAutoFocusFirstField<HTMLFormElement>();

  useEffect(() => {
    let active = true;
    // Despierta anticipadamente la instancia gratuita mientras el usuario completa sus credenciales.
    void apiRequest<{ status: string }>('/health')
      .then(() => active && setIsApiReady(true))
      .catch(() => active && setIsApiReady(false));
    return () => {
      active = false;
    };
  }, []);

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      const response = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (rememberMe) {
        window.localStorage.setItem(rememberedUsernameStorageKey, response.user.username);
      } else {
        window.localStorage.removeItem(rememberedUsernameStorageKey);
      }
      setPassword('');
      onLogin(response);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'No fue posible iniciar sesion.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <img src="/LOGO_TEMO.png" alt="TEMO" />
          <span>Transacciones Económicas Miscelánea Olivera</span>
        </div>

        <div className="login-heading">
          <h1 id="login-title">Iniciar sesión</h1>
        </div>

        <form className="login-form" onSubmit={submitLogin} ref={loginRef}>
          <label className="form-field">
            Usuario
            <input
              autoComplete="username"
              name="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label className="form-field">
            Contraseña
            <input
              autoComplete="current-password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <label className="remember-control">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span>Recordarme</span>
          </label>

          {/* Acceso al flujo seguro de recuperación para cuentas con rol Jefa. */}
          <button type="button" className="login-recovery-link" onClick={() => { setError(''); setSuccess(''); setIsRecoveryOpen(true); }}>
            <KeyRound size={16} />Olvidé mi contraseña
          </button>

          {error && <p className="login-error" role="alert">{error}</p>}
          {success && <p className="login-success" role="status">{success}</p>}
          {!isApiReady && <p className="login-preparation-status" role="status">Preparando conexión segura...</p>}

          <button type="submit" className="primary-button login-submit" disabled={isSubmitting}>
            <LogIn size={19} strokeWidth={2.25} />
            {isSubmitting ? (isApiReady ? 'Ingresando...' : 'Iniciando sistema...') : 'Ingresar'}
          </button>
        </form>
      </section>
      {/* El diálogo conserva el diseño del sistema y devuelve al inicio al completar el cambio. */}
      {isRecoveryOpen && (
        <PasswordRecoveryDialog
          initialIdentifier={username}
          onCancel={() => setIsRecoveryOpen(false)}
          onRecovered={(message) => {
            setIsRecoveryOpen(false);
            setSuccess(message);
            setPassword('');
          }}
        />
      )}
    </main>
  );
}

function PasswordRecoveryDialog({
  initialIdentifier,
  onCancel,
  onRecovered,
}: {
  initialIdentifier: string;
  onCancel: () => void;
  onRecovered: (message: string) => void;
}) {
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Solicita el correo sin informar si el usuario introducido existe.
  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const response = await apiRequest<{ message: string }>('/auth/password-recovery/request', {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });
      setMessage(response.message);
      setStep('confirm');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible solicitar la recuperación.');
    } finally {
      setSaving(false);
    }
  }

  // Comprueba el código y reemplaza la contraseña cuando ambas entradas coinciden.
  async function confirmCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (newPassword !== confirmation) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const response = await apiRequest<{ message: string }>('/auth/password-recovery/confirm', {
        method: 'POST',
        body: JSON.stringify({ identifier, code, newPassword }),
      });
      onRecovered(response.message);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : 'No fue posible cambiar la contraseña.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop profile-password-backdrop" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
      <section className="modal-panel profile-password-modal">
        {/* Encabezado compartido por las dos etapas del proceso. */}
        <header className="modal-header">
          <div><p>Acceso seguro</p><h2 id="recovery-title">Recuperar contraseña</h2></div>
          <button type="button" className="icon-button danger-button" onClick={onCancel} aria-label="Cancelar"><X size={19} /></button>
        </header>
        {step === 'request' ? (
          <form className="profile-password-form" onSubmit={requestCode}>
            {/* La cuenta se localiza por usuario o por su correo previamente registrado. */}
            <p className="muted-copy">Disponible para usuarios con rol Jefa y correo registrado.</p>
            <label className="form-field">Usuario o correo<input autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required /></label>
            {error && <p className="login-error" role="alert">{error}</p>}
            <footer className="modal-actions">
              <button type="button" className="secondary-button danger-button" onClick={onCancel}><X size={17} />Cancelar</button>
              <button type="submit" className="primary-button" disabled={saving}><KeyRound size={18} />{saving ? 'Enviando...' : 'Enviar código'}</button>
            </footer>
          </form>
        ) : (
          <form className="profile-password-form" onSubmit={confirmCode}>
            {/* El código tiene seis dígitos, vence en diez minutos y sólo admite cinco intentos. */}
            <p className="login-success" role="status">{message}</p>
            <label className="form-field">Código de seis dígitos<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} minLength={6} maxLength={6} required /></label>
            <label className="form-field">Nueva contraseña<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={10} required /></label>
            <label className="form-field">Confirmar contraseña<input type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={10} required /></label>
            {error && <p className="login-error" role="alert">{error}</p>}
            <button type="button" className="login-recovery-link" onClick={() => { setStep('request'); setCode(''); setError(''); }}>Solicitar otro código</button>
            <footer className="modal-actions">
              <button type="button" className="secondary-button danger-button" onClick={onCancel}><X size={17} />Cancelar</button>
              <button type="submit" className="primary-button" disabled={saving}><ShieldCheck size={18} />{saving ? 'Actualizando...' : 'Cambiar contraseña'}</button>
            </footer>
          </form>
        )}
      </section>
    </div>
  );
}

function ScreenContent({
  screen,
  currentUser,
  onOpenShiftClose,
}: {
  screen: ScreenId;
  currentUser: AuthUser;
  onOpenShiftClose: (shiftId: string) => Promise<void>;
}) {
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
    return <ShiftTable config={configs[0]} onOpenShiftClose={onOpenShiftClose} />;
  }

  if (screen === 'transactions') {
    return <TransactionTable config={configs[0]} currentUser={currentUser} />;
  }

  if (screen === 'transfers') {
    return <TransfersScreen currentUser={currentUser} />;
  }

  if (screen === 'directory') {
    return <DirectoryScreen currentUser={currentUser} />;
  }

  if (screen === 'cash-count') {
    return <CashCountScreen currentUser={currentUser} />;
  }

  if (screen === 'exchange-rate') {
    return <ExchangeRateScreen />;
  }

  if (screen === 'general-consolidation') {
    return <GeneralConsolidationScreen />;
  }

  if (screen === 'pending') {
    return <PendingScreen currentUser={currentUser} />;
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
      {/* Indicadores de alto nivel para la vista de la jefa. */}
      <section className="metrics-grid" aria-label="Resumen del dia">
        <MetricCard label="Efectivo NIO" value="C$ 0.00" helper="Pendiente de conexion a turnos" icon={<Coins size={22} />} />
        <MetricCard label="Efectivo USD" value="$ 0.00" helper="Conteo por denominaciones" icon={<Banknote size={22} />} />
        <MetricCard label="Entidades" value="6" helper="BAC, BANPRO, LAFISE, BDF, PEX, TELEDOLAR" icon={<Building2 size={22} />} />
        <MetricCard label="Comisiones" value="Restringido" helper="Visible solo para jefa" icon={<LockKeyhole size={22} />} />
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
          <button type="button" className="secondary-button danger-button">
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

function CashCountScreen({ currentUser }: { currentUser: AuthUser }) {
  const [pileDrafts, setPileDrafts] = useState<Record<string, CashPileDraft>>({});
  const [exchangeRate] = useState<ExchangeRate>(() => readExchangeRate());
  const [shift, setShift] = useState<ShiftDetail | null>(null);
  const [changeNio, setChangeNio] = useState('0.00');
  const [isLoaded, setIsLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [activeShifts, setActiveShifts] = useState<ShiftDetail[]>([]);
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const isBoss = currentUser.roleCode === 'JEFA';

  const totals = useMemo(
    () => ({
      NIO: calculateCashPileTotal(cashDenominations.NIO, pileDrafts),
      USD: calculateCashPileTotal(cashDenominations.USD, pileDrafts),
    }),
    [pileDrafts],
  );
  const buyRate = parseExchangeRate(exchangeRate.buy);
  const expected = shift?.expectedCash ?? { NIO: 0, USD: 0 };
  const { differenceNio, differenceUsd } = calculateShiftCashDifference({
    actual: totals,
    expected,
    registeredDifferenceNio: parseMoneyValue(changeNio),
    buyRate,
  });

  useEffect(() => {
    let isMounted = true;
    const request = isBoss
      ? apiRequest<ShiftDetail[]>('/shifts').then((shifts) => {
          const openShifts = shifts.filter((item) => ['ABIERTO', 'PENDIENTE_APROBACION'].includes(item.estado));
          setActiveShifts(openShifts);
          const targetId = selectedShiftId || openShifts[0]?.database_id || '';
          setSelectedShiftId(targetId);
          return targetId ? apiRequest<ShiftDetail>(`/shifts/${targetId}`) : null;
        })
      : apiRequest<ShiftDetail | null>('/shifts/current');
    request.then((currentShift) => {
        if (!isMounted) {
          return;
        }
        setShift(currentShift);
        setChangeNio(currentShift ? formatAccountingMoneyRaw(currentShift.cambio_nio) : '0.00');
        setPileDrafts(currentShift ? cashDraftFromShiftCounts(currentShift.cashCounts.ACTUAL) : {});
        setIsLoaded(true);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'No fue posible cargar el arqueo.'));
    return () => {
      isMounted = false;
    };
  }, [currentUser.id, isBoss]);

  useEffect(() => {
    if (!isBoss || !selectedShiftId) return;
    setIsLoaded(false);
    apiRequest<ShiftDetail>(`/shifts/${selectedShiftId}`)
      .then((selectedShift) => {
        setShift(selectedShift);
        setChangeNio(formatAccountingMoneyRaw(selectedShift.cambio_nio));
        setPileDrafts(cashDraftFromShiftCounts(selectedShift.cashCounts.ACTUAL));
        setIsLoaded(true);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'No fue posible cargar el arqueo seleccionado.'));
  }, [isBoss, selectedShiftId]);

  useEffect(() => {
    if (isBoss || !isLoaded || !shift || shift.estado === 'CERRADO') {
      return;
    }
    const timer = window.setTimeout(() => {
      void apiRequest<ShiftDetail>(`/shifts/${shift.database_id}/cash-count`, {
        method: 'PUT',
        body: JSON.stringify({ counts: cashCountPayload(pileDrafts), changeNio: parseMoneyValue(changeNio) }),
      }).then(setShift).catch((error) => setMessage(error instanceof Error ? error.message : 'No fue posible guardar el arqueo.'));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [pileDrafts, changeNio, isBoss, isLoaded, shift?.database_id]);

  function updatePileField(denominationId: string, field: 'groups' | 'loose', value: string) {
    const cleanValue = value.replace(/\D/g, '');
    const nextPile = {
      ...pileDrafts[denominationId],
      [field]: cleanValue ? String(Number(cleanValue)) : '',
    };
    setPileDrafts((current) => ({ ...current, [denominationId]: nextPile }));
  }

  async function clearCount() {
    if (!shift || !await requestSystemConfirm('Se colocaran en cero todas las cantidades del arqueo actual.', { title:'Limpiar arqueo', confirmLabel:'Limpiar', tone:'danger' })) {
      return;
    }
    setPileDrafts({});
    setChangeNio('0.00');
    await apiRequest(`/shifts/${shift.database_id}/cash-count`, {
      method: 'PUT',
      body: JSON.stringify({ counts: cashCountPayload({}), changeNio: 0 }),
    });
  }

  async function requestClose() {
    if (!shift || !await requestSystemConfirm('La Jefa recibira una solicitud para revisar y cerrar esta caja.', { title:'Solicitar cierre de caja', confirmLabel:'Enviar solicitud' })) {
      return;
    }
    await apiRequest(`/shifts/${shift.database_id}/close-request`, { method: 'POST' });
    announceOperationalDataChange();
    setShift((current) => current ? { ...current, estado: 'PENDIENTE_APROBACION', solicitud_estado: 'PENDIENTE' } : current);
    setMessage('Solicitud enviada a la Jefa.');
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
            <div className="cash-opening-chip" aria-label="Montos iniciales del turno">
              <div>
                <span>Montos iniciales</span>
                <small>{shift ? `${shift.sucursal} - ${shift.caja}` : 'Sin turno abierto'}</small>
              </div>
              <strong>{formatCashCountMoney(parseMoneyValue(shift?.efectivo_inicial_nio), 'NIO')}</strong>
              <strong>{formatCashCountMoney(parseMoneyValue(shift?.efectivo_inicial_usd), 'USD')}</strong>
            </div>
            <div className="cash-opening-chip cash-summary-chip cash-summary-chip--pending" aria-label="Pendientes del turno">
              <div><span>Pendientes</span><small>No afectan efectivo hasta pagarse</small></div>
              <strong>{formatCashCountMoney(shift?.pendingCash?.NIO ?? 0, 'NIO')}</strong>
              <strong>{formatCashCountMoney(shift?.pendingCash?.USD ?? 0, 'USD')}</strong>
            </div>
            <div className="cash-opening-chip cash-summary-chip cash-summary-chip--expected" aria-label="Efectivo esperado del turno">
              <div><span>Efectivo esperado</span><small>Inicial más movimientos aplicables</small></div>
              <strong>{formatCashCountMoney(expected.NIO, 'NIO')}</strong>
              <strong>{formatCashCountMoney(expected.USD, 'USD')}</strong>
            </div>
          </div>
          <div className="action-row">
            {isBoss && (
              <label className="cash-shift-selector">Turno activo
                <select value={selectedShiftId} onChange={(event) => setSelectedShiftId(event.target.value)}>
                  {activeShifts.map((item) => <option key={item.database_id} value={item.database_id}>{item.cajero} - {item.caja}</option>)}
                </select>
              </label>
            )}
            {!isBoss && <button type="button" className="secondary-button" onClick={clearCount}>
              <X size={17} />
              Limpiar
            </button>}
            {!isBoss && <button type="button" className="primary-button" onClick={requestClose} disabled={!shift || shift.solicitud_estado === 'PENDIENTE'}>
              <LockKeyhole size={17} />
              {shift?.solicitud_estado === 'PENDIENTE' ? 'Cierre solicitado' : 'Cierre'}
            </button>}
          </div>
        </div>

        {!shift && isLoaded && <p className="cash-count-status">No tiene un turno abierto. El arqueo se habilitará al abrir su siguiente turno.</p>}
        {message && <p className="cash-count-status" role="status">{message}</p>}

        <div className="transaction-cash-count-grid cash-count-live-grid">
          <TransactionCashCountTable
            currency="NIO"
            denominations={cashDenominations.NIO}
            focusScope="general-cash-count"
            pileDrafts={pileDrafts}
            conversionRate={buyRate}
            readOnly={isBoss}
            nextFocusSelector={'[data-cash-scope="general-cash-count"][data-cash-currency="USD"][data-cash-row="0"][data-cash-column="0"]'}
            onPileFieldChange={updatePileField}
          />
          <div className="cash-count-right-column">
          <TransactionCashCountTable
            currency="USD"
            denominations={cashDenominations.USD}
            focusScope="general-cash-count"
            pileDrafts={pileDrafts}
            conversionRate={buyRate}
            readOnly={isBoss}
            nextFocusSelector='[data-general-cash-change]'
            onPileFieldChange={updatePileField}
          />
          <div className="cash-count-adjustments">
            <div><strong>Diferencia NIO</strong>{renderDifference(differenceNio, 'NIO', { positiveLabel: '' })}</div>
            <div><strong>Diferencia USD</strong>{renderDifference(differenceUsd, 'USD', { positiveLabel: '' })}</div>
            <label>
              <strong>Diferencia registrada</strong>
              <span className="cash-change-entry"><span>C$</span><input data-general-cash-change value={changeNio} inputMode="decimal" readOnly={isBoss} onChange={(event) => setChangeNio(normalizeSignedAccountingMoneyRaw(event.target.value))} /></span>
              {!isBoss && <button type="button" className="secondary-button" onClick={() => setChangeNio(formatAccountingMoneyRaw(parseMoneyValue(changeNio) + differenceNio))}>Registrar diferencia</button>}
            </label>
          </div>
          </div>
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

function TransfersScreen({ currentUser }: { currentUser: AuthUser }) {
  const isBoss = currentUser.roleCode === 'JEFA';
  const [rows, setRows] = useState<TransferApiRow[]>([]);
  const [context, setContext] = useState<TransferContext>({ shifts: [], accounts: [] });
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<'id' | 'fecha' | 'tipo' | 'monto'>('fecha');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showInactive, setShowInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: ModalMode; row?: TransferApiRow } | null>(null);
  const [error, setError] = useState('');

  async function reload() {
    const [loadedRows, loadedContext] = await Promise.all([
      apiRequest<TransferApiRow[]>('/transfers'), apiRequest<TransferContext>('/transfers/context'),
    ]);
    setRows(loadedRows);
    setContext(loadedContext);
  }

  useEffect(() => { void reload().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar las transferencias.')); }, [currentUser.id]);
  useOperationalRefresh(reload, !modal);

  const filtered = useMemo(() => {
    const result = rows.filter((row) => {
      if (!showInactive && row.estado !== 'ACTIVO') return false;
      const value = query.trim().toLowerCase();
      const matchesGeneral = !value || [row.id, row.tipo, row.direccion, row.moneda, row.monto, row.cuenta, row.cajero, row.sucursal].some((item) => String(item ?? '').toLowerCase().includes(value));
      const matchesColumns = Object.entries(filters).every(([key, filter]) =>
        !filter || getTransferColumnValue(row, key).toLowerCase().includes(filter.toLowerCase()),
      );
      return matchesGeneral && matchesColumns;
    });
    return [...result].sort((first, second) => {
      const firstValue = sortKey === 'fecha' ? new Date(first.fecha_transferencia).getTime() : sortKey === 'monto' ? Number(first.monto) : getTransferColumnValue(first, sortKey).toLowerCase();
      const secondValue = sortKey === 'fecha' ? new Date(second.fecha_transferencia).getTime() : sortKey === 'monto' ? Number(second.monto) : getTransferColumnValue(second, sortKey).toLowerCase();
      const comparison = firstValue < secondValue ? -1 : firstValue > secondValue ? 1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filters, query, rows, showInactive, sortDirection, sortKey]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [filters, query, showInactive, pageSize]);

  function toggleSort(key: 'id' | 'fecha' | 'tipo' | 'monto') {
    if (sortKey === key) setSortDirection((current) => current === 'desc' ? 'asc' : 'desc');
    else { setSortKey(key); setSortDirection('desc'); }
  }

  function transferHeader(key: 'id' | 'fecha' | 'tipo' | 'monto', label: string) {
    return <th className={sortKey === key || filters[key] ? 'table-header--modified' : undefined}><div className="th-stack">
      <button type="button" className="th-sort-button" onClick={() => toggleSort(key)}>{label}{sortKey === key ? (sortDirection === 'desc' ? <ArrowUpZA size={14}/> : <ArrowDownAZ size={14}/>) : <ArrowUpDown size={14}/>}</button>
      <input value={filters[key] ?? ''} onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))} placeholder="Filtrar" />
    </div></th>;
  }

  async function openDetail(row: TransferApiRow, mode: ModalMode) {
    try { setModal({ mode, row: await apiRequest<TransferApiRow>(`/transfers/${row.database_id}`) }); }
    catch (detailError) { setError(detailError instanceof Error ? detailError.message : 'No fue posible abrir el registro.'); }
  }

  async function voidTransfer(row: TransferApiRow) {
    const reason = window.prompt(`Motivo para anular ${row.id}:`);
    if (!reason) return;
    try {
      await apiRequest(`/transfers/${row.database_id}/void`, { method: 'POST', body: JSON.stringify({ reason }) });
      await reload();
      announceOperationalDataChange();
    } catch (voidError) { setError(voidError instanceof Error ? voidError.message : 'No fue posible anular la transferencia.'); }
  }

  return (
    <section className="screen-stack"><article className="panel">
      <div className="panel__header table-panel-header"><div><p>Movimientos de efectivo y saldos bancarios por turno</p><h2>Transferencias registradas</h2></div>
        <div className="action-row"><button type="button" className="primary-button" disabled={!context.shifts.length} onClick={() => setModal({ mode: 'create' })}><Plus size={17}/>Agregar</button></div>
      </div>
      <div className="table-toolbar"><label className="search-box"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar transferencias"/></label>
        <div className="table-toolbar-controls"><label className="switch-control switch-control--small"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)}/><span/>Mostrar inactivos</label>
          <label className="page-size-control">Registros<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{[10,20,30,50].map((size)=><option key={size}>{size}</option>)}</select></label></div>
      </div>
      {error && <p className="pending-screen-message transfer-error" role="alert">{error}</p>}
      <div className="table-wrap"><table className="transfer-table"><thead><tr><th className="number-column"><div className="th-stack"><span>N°</span></div></th>{transferHeader('id','ID')}{isBoss && transferHeader('fecha','FECHA')}{transferHeader('tipo','TIPO')}{transferHeader('monto','MONTO')}<th><div className="th-stack"><span>ACCIONES</span></div></th></tr></thead>
        <tbody>{pageRows.map((row,index)=><tr key={row.database_id} className={`${row.estado !== 'ACTIVO' ? 'inactive-row' : ''} ${selected === row.database_id ? 'selected-row' : ''}`} onClick={()=>setSelected(row.database_id)} onDoubleClick={()=>void openDetail(row,'view')}>
          <td>{filtered.length - ((page-1)*pageSize+index)}</td><td>{row.id}</td>{isBoss && <td className="multi-line-cell">{formatTransferDate(row.fecha_transferencia)}</td>}
          <td><strong>{row.tipo === 'EFECTIVO' ? 'Efectivo' : 'Digital'}</strong><small>{row.direccion === 'ENTRA' ? 'Ingreso' : 'Egreso'}{isBoss ? ` · ${row.cajero} / ${row.sucursal}` : ''}</small></td>
          <td><span className={`transaction-amount transaction-amount--${row.direccion === 'SALE' ? 'out' : 'in'}`}>{row.direccion === 'SALE' ? <ArrowUpRight size={16}/> : <ArrowDownLeft size={16}/>} {formatCashCountMoney(Number(row.monto), row.moneda)}</span></td>
          <td><div className="row-actions"><button className="icon-action" type="button" title="Editar" disabled={!isBoss && !(row.tipo==='EFECTIVO'&&row.direccion==='SALE'&&row.estado==='ACTIVO')} onClick={(event)=>{event.stopPropagation();void openDetail(row,'edit')}}><Edit3 size={16}/></button><button className="icon-action" type="button" title="Anular" disabled={row.estado !== 'ACTIVO'||(!isBoss&&!(row.tipo==='EFECTIVO'&&row.direccion==='SALE'))} onClick={(event)=>{event.stopPropagation();void voidTransfer(row)}}><Ban size={16}/></button></div></td>
        </tr>)}</tbody></table></div>
      <div className="pagination-bar"><span>Mostrando {pageRows.length} de {filtered.length} registros</span><div className="action-row"><button className="icon-button" type="button" disabled={page===1} onClick={()=>setPage(1)}><ChevronsLeft size={17}/></button><button className="icon-button" type="button" disabled={page===1} onClick={()=>setPage((value)=>Math.max(1,value-1))}><ChevronLeft size={17}/></button><span>Pagina {page} de {pages}</span><button className="icon-button" type="button" disabled={page===pages} onClick={()=>setPage((value)=>Math.min(pages,value+1))}><ChevronRight size={17}/></button><button className="icon-button" type="button" disabled={page===pages} onClick={()=>setPage(pages)}><ChevronsRight size={17}/></button></div></div>
    </article>
    {modal && <TransferModal mode={modal.mode} row={modal.row} context={context} isBoss={isBoss} onClose={()=>setModal(null)} onSaved={async()=>{setModal(null);await reload();announceOperationalDataChange()}} onEdit={modal.mode==='view'?()=>setModal({mode:'edit',row:modal.row}):undefined}/>} </section>
  );
}

function getTransferColumnValue(row: TransferApiRow, key: string) {
  if (key === 'fecha') {
    const date = new Date(row.fecha_transferencia);
    return Number.isNaN(date.getTime()) ? row.fecha_transferencia : `${date.toLocaleDateString('es-NI')} ${date.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', hour12: false })}`;
  }
  if (key === 'tipo') return `${row.tipo === 'EFECTIVO' ? 'Efectivo' : 'Digital'} ${row.direccion === 'ENTRA' ? 'Ingreso' : 'Egreso'} ${row.cajero} ${row.sucursal}`;
  if (key === 'monto') return `${row.moneda} ${row.monto} ${formatCashCountMoney(Number(row.monto), row.moneda)}`;
  return String(row[key as keyof TransferApiRow] ?? '');
}

function formatTransferDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return <><span>{new Intl.DateTimeFormat('es-NI',{day:'2-digit',month:'2-digit',year:'numeric'}).format(date)}</span><small>{new Intl.DateTimeFormat('es-NI',{hour:'2-digit',minute:'2-digit',hour12:false}).format(date)}</small></>;
}

function TransferModal({ mode, row, context, isBoss, onClose, onSaved, onEdit }: { mode: ModalMode; row?: TransferApiRow; context: TransferContext; isBoss:boolean; onClose:()=>void; onSaved:()=>Promise<void>; onEdit?:()=>void }) {
  const readOnly = mode === 'view';
  const [shiftId,setShiftId]=useState(row?.id_turno ?? context.shifts[0]?.id ?? '');
  const [type,setType]=useState<'EFECTIVO'|'DIGITAL'>(row?.tipo === 'CUENTA_BANCARIA' ? 'DIGITAL' : 'EFECTIVO');
  const [direction,setDirection]=useState<'INGRESO'|'EGRESO'>(row ? (row.direccion === 'ENTRA' ? 'INGRESO' : 'EGRESO') : 'INGRESO');
  const [currency,setCurrency]=useState<CashCurrency>(row?.moneda ?? 'NIO');
  const [accountId,setAccountId]=useState(row?.id_cuenta ?? '');
  const [amount,setAmount]=useState(row?.monto ?? '');
  const [description,setDescription]=useState(row?.descripcion ?? '');
  const [piles,setPiles]=useState<Record<string,CashPileDraft>>(()=>{
    const next:Record<string,CashPileDraft>={}; for(const line of row?.cashLines ?? []) { const d=cashDenominations[row?.moneda ?? 'NIO'].find((item)=>item.value===Number(line.denomination)); if(d) next[d.id]={groups:String(line.piles25||''),loose:String(line.loose||'')}; } return next;
  });
  const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  const selectedShift=context.shifts.find((item)=>item.id===shiftId);
  const accounts=context.accounts.filter((item)=>item.currency===currency && (!item.branch_id || item.branch_id===selectedShift?.branch_id));
  const cashTotal=calculateCashPileTotal(cashDenominations[currency],piles);
  useEffect(()=>{if(type==='EFECTIVO')setAmount(String(cashTotal));},[cashTotal,type]);
  useEffect(()=>{if(!isBoss){setType('EFECTIVO');setDirection('EGRESO');}},[isBoss]);
  function updatePile(id:string,field:'groups'|'loose',value:string){if(readOnly)return;setPiles((current)=>({...current,[id]:{...current[id],[field]:value.replace(/\D/g,'')}}));}
  function handleAmountKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const nextValue = getAccountingMoneyKeyValue(event, amount);
    if (nextValue === undefined) return;
    event.preventDefault();
    if (nextValue !== null) {
      setAmount(nextValue);
      queueAccountingMoneyCaret(event, nextValue);
    }
  }
  async function save(event:FormEvent){event.preventDefault();setSaving(true);setError('');try{const payload={shiftId,type,direction,currency,accountId:type==='DIGITAL'?accountId:null,amount:type==='EFECTIVO'?cashTotal:parseMoneyValue(amount),description,cashLines:type==='EFECTIVO'?cashDenominations[currency].map((item)=>({denomination:item.value,piles25:Number(piles[item.id]?.groups)||0,loose:Number(piles[item.id]?.loose)||0})):[]};await apiRequest(row?`/transfers/${row.database_id}`:'/transfers',{method:row?'PUT':'POST',body:JSON.stringify(payload)});await onSaved();}catch(saveError){setError(saveError instanceof Error?saveError.message:'No fue posible guardar.');}finally{setSaving(false)}}
  return <div className="modal-backdrop"><form className="modal-panel transfer-modal" onSubmit={save}><div className="modal-header"><div><p>{mode==='create'?'Nuevo registro':'Transferencia'}</p><h2>{mode==='view'?'Detalle de transferencia':mode==='edit'?'Editar transferencia':'Registro de transferencia'}</h2></div><button type="button" className="icon-button icon-button--danger" onClick={onClose}><X size={19}/></button></div>
    <div className="transfer-form-grid"><label className="form-field">ID<input readOnly value={row?.id ?? 'Automatico'}/></label>{isBoss&&<label className="form-field transfer-form-shift">Turno<select disabled={readOnly} value={shiftId} onChange={(event)=>setShiftId(event.target.value)}>{context.shifts.map((shift)=><option key={shift.id} value={shift.id}>{shift.code} · {shift.cashier} · {shift.branch}</option>)}</select></label>}
      <fieldset className="transfer-segment"><legend>Tipo</legend><button type="button" disabled={readOnly||!isBoss} className={type==='EFECTIVO'?'active':''} onClick={()=>setType('EFECTIVO')}><Banknote size={16}/>Efectivo</button><button type="button" disabled={readOnly||!isBoss} className={type==='DIGITAL'?'active':''} onClick={()=>setType('DIGITAL')}><Landmark size={16}/>Digital</button></fieldset>
      <fieldset className="transfer-segment"><legend>Direccion</legend><button type="button" disabled={readOnly||!isBoss} className={direction==='INGRESO'?'active':''} onClick={()=>setDirection('INGRESO')}>Ingreso</button><button type="button" disabled={readOnly||!isBoss} className={direction==='EGRESO'?'active':''} onClick={()=>setDirection('EGRESO')}>Egreso</button></fieldset>
      <fieldset className="transfer-segment"><legend>Moneda</legend><button type="button" disabled={readOnly} className={currency==='NIO'?'active nio':''} onClick={()=>{setCurrency('NIO');setPiles({});setAccountId('')}}>C$</button><button type="button" disabled={readOnly} className={currency==='USD'?'active usd':''} onClick={()=>{setCurrency('USD');setPiles({});setAccountId('')}}>$</button></fieldset>
      {type==='DIGITAL'&&<label className="form-field transfer-form-account">Cuenta<select disabled={readOnly} required value={accountId} onChange={(event)=>setAccountId(event.target.value)}><option value="">Seleccione una cuenta</option>{accounts.map((account)=><option key={account.id} value={account.id}>{account.alias}</option>)}</select></label>}
      <label className="form-field">Monto<input readOnly={readOnly||type==='EFECTIVO'} inputMode="decimal" value={formatAccountingMoneyInput(amount)} onChange={(event)=>setAmount(normalizeSignedAccountingMoneyRaw(event.target.value))} onKeyDown={handleAmountKeyDown} onFocus={(event)=>placeAccountingMoneyCaretBeforeDecimals(event.currentTarget)} onClick={(event)=>placeAccountingMoneyCaretBeforeDecimals(event.currentTarget)}/></label>
      <label className="form-field transfer-form-description">Descripcion<input readOnly={readOnly} value={description} onChange={(event)=>setDescription(event.target.value)}/></label>
    </div>
    {type==='EFECTIVO'&&<div className="transfer-cash"><TransactionCashCountTable currency={currency} denominations={cashDenominations[currency]} focusScope="transfer-cash" pileDrafts={piles} conversionRate={parseExchangeRate(readExchangeRate().buy)} readOnly={readOnly} showConvertedTotal={false} onPileFieldChange={updatePile}/></div>}
    {error&&<p className="login-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button danger-button" onClick={onClose}><X size={17}/>Cancelar</button>{onEdit&&<button type="button" className="secondary-button" onClick={onEdit}><Edit3 size={17}/>Editar</button>}{!readOnly&&<button type="submit" className="primary-button" disabled={saving||!shiftId||!parseMoneyValue(amount)}><Save size={17}/>{saving?'Guardando...':'Guardar'}</button>}</div>
  </form></div>;
}

function directorySearchText(row: DirectoryEntry) {
  return normalizeLookupValue([
    row.id,
    row.name,
    row.observations,
    ...row.identifiers.flatMap((item) => [item.institution, item.type, item.number, item.currency ?? '']),
    ...row.identities.flatMap((item) => [item.number, item.holder]),
    ...row.references,
  ].join(' '));
}

function DirectoryScreen({ currentUser }: { currentUser: AuthUser }) {
  const isBoss = currentUser.roleCode === 'JEFA';
  const [rows, setRows] = useState<DirectoryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showInactive, setShowInactive] = useState(false);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState('');
  const [sortKey, setSortKey] = useState<'id'|'name'|'type'|'number'|'currency'|'identity'|'reference'>('id');
  const [sortDirection, setSortDirection] = useState<'asc'|'desc'>('desc');
  const [modal, setModal] = useState<{ mode: ModalMode; row?: DirectoryEntry } | null>(null);
  const [error, setError] = useState('');

  async function reload() {
    setRows(await apiRequest<DirectoryEntry[]>('/directory'));
  }

  useEffect(() => { void reload().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar el directorio.')); }, [currentUser.id]);
  useOperationalRefresh(reload, !modal, 5000);

  const processed = useMemo(() => {
    const general = normalizeLookupValue(query);
    const valueFor = (row: DirectoryEntry, key: string) => {
      if (key === 'type') return row.identifiers.map((item) => `${item.institution} ${item.type}`).join(' ');
      if (key === 'number') return row.identifiers.map((item) => item.number).join(' ');
      if (key === 'currency') return row.identifiers.map((item) => item.currency ?? '').join(' ');
      if (key === 'identity') return row.identities.map((item) => `${item.number} ${item.holder}`).join(' ');
      if (key === 'reference') return row.references.join(' ');
      return String(row[key as keyof DirectoryEntry] ?? '');
    };
    const filtered = rows
      .filter((row) => showInactive || row.status === 'ACTIVO')
      .filter((row) => !general || directorySearchText(row).includes(general))
      .filter((row) => Object.entries(filters).every(([key, filter]) => !filter || normalizeLookupValue(valueFor(row, key)).includes(normalizeLookupValue(filter))));
    return filtered.sort((first, second) => {
      const firstValue = sortKey === 'id' ? Number(first.id.replace(/\D/g, '')) : normalizeLookupValue(valueFor(first, sortKey));
      const secondValue = sortKey === 'id' ? Number(second.id.replace(/\D/g, '')) : normalizeLookupValue(valueFor(second, sortKey));
      const comparison = typeof firstValue === 'number' && typeof secondValue === 'number'
        ? firstValue - secondValue
        : String(firstValue).localeCompare(String(secondValue), 'es', { numeric: true });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filters, query, rows, showInactive, sortDirection, sortKey]);
  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const pageRows = processed.slice((page - 1) * pageSize, page * pageSize);
  useEffect(() => setPage(1), [filters, pageSize, query, showInactive]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  function header(key: typeof sortKey, label: string) {
    return <th className={filters[key] || sortKey === key ? 'table-header--modified' : undefined}><div className="th-stack"><button type="button" className="th-sort-button" onClick={() => { if (sortKey === key) setSortDirection((current) => current === 'desc' ? 'asc' : 'desc'); else { setSortKey(key); setSortDirection('desc'); } }}>{label}{sortKey === key ? (sortDirection === 'desc' ? <ArrowUpZA size={14}/> : <ArrowDownAZ size={14}/>) : <ArrowUpDown size={14}/>}</button><input value={filters[key] ?? ''} onChange={(event) => setFilters((current) => ({ ...current, [key]: event.target.value }))} placeholder="Filtrar" /></div></th>;
  }

  async function annul(row: DirectoryEntry) {
    if (!await requestSystemConfirm(`El destinatario "${row.name}" se conservara en el sistema con estado inactivo.`, { title:'Anular destinatario', confirmLabel:'Anular', tone:'danger' })) return;
    try {
      setError('');
      await apiRequest(`/directory/${row.database_id}`, { method:'PUT', body:JSON.stringify({ name:row.name, status:'INACTIVO', observations:row.observations, identifiers:row.identifiers, identities:row.identities, references:row.references }) });
      await reload();
      announceOperationalDataChange();
    } catch (annulError) {
      setError(annulError instanceof Error ? annulError.message : 'No fue posible anular el registro.');
    }
  }

  async function openDetail(row: DirectoryEntry, mode: ModalMode) {
    try { setModal({ mode, row: await apiRequest<DirectoryEntry>(`/directory/${row.database_id}`) }); }
    catch (detailError) { setError(detailError instanceof Error ? detailError.message : 'No fue posible abrir el registro.'); }
  }

  return <section className="screen-stack"><article className="panel">
    <div className="panel__header table-panel-header"><div><p>Cuentas, contratos, cedulas y referencias frecuentes</p><h2>Directorio</h2></div>{isBoss && <button type="button" className="primary-button" onClick={() => setModal({ mode: 'create' })}><Plus size={17}/>Agregar</button>}</div>
    <div className="table-toolbar"><label className="search-box"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre, numero, cedula o referencia"/></label><div className="table-toolbar-controls"><label className="switch-control switch-control--small"><input type="checkbox" checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)}/><span/>Mostrar inactivos</label><label className="page-size-control">Registros<select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>{[10,20,30,50,100].map((size)=><option key={size}>{size}</option>)}</select></label></div></div>
    {error && <p className="transaction-save-error" role="alert">{error}</p>}
    <div className="table-wrap"><table className="directory-table"><thead><tr><th className="number-column"><div className="th-stack"><span>N°</span></div></th>{header('id','ID')}{header('name','NOMBRE')}{header('type','TIPO')}{header('number','NUMERO')}{header('currency','MONEDA')}{header('identity','CEDULA')}{header('reference','REFERENCIA')}<th><div className="th-stack"><span>ACCIONES</span></div></th></tr></thead><tbody>
      {pageRows.map((row,index)=><tr key={row.database_id} className={`${row.status === 'INACTIVO' ? 'inactive-row' : ''} ${selected === row.database_id ? 'selected-row' : ''}`} onClick={()=>setSelected(row.database_id)} onDoubleClick={()=>void openDetail(row,'view')}>
        <td>{processed.length - ((page-1)*pageSize+index)}</td><td>{row.id}</td><td><strong>{row.name}</strong>{row.observations && <small>{row.observations}</small>}</td>
        <td className="directory-lines">{row.identifiers.map((item,index)=><span key={`${item.type}-${index}`}>{item.institution ? `${item.institution} · ` : ''}{item.type}</span>)}</td>
        <td className="directory-lines directory-number">{row.identifiers.map((item,index)=><span key={`${item.number}-${index}`}>{item.number}</span>)}</td>
        <td className="directory-lines">{row.identifiers.map((item,index)=><span key={`${item.currency}-${index}`}>{item.currency ?? '---'}</span>)}</td>
        <td className="directory-lines">{row.identities.length ? row.identities.map((item,index)=><span key={`${item.number}-${index}`}>{item.number}{item.holder ? <small>{item.holder}</small> : null}</span>) : '---'}</td>
        <td className="directory-lines">{row.references.length ? row.references.map((item,index)=><span key={`${item}-${index}`}>{item}</span>) : '---'}</td>
        <td>{isBoss && <div className="directory-row-actions"><button type="button" className="icon-action" title="Editar" onClick={(event)=>{event.stopPropagation();void openDetail(row,'edit')}}><Edit3 size={16}/></button>{row.status === 'ACTIVO' && <button type="button" className="icon-action icon-action--danger" title="Anular" onClick={(event)=>{event.stopPropagation();void annul(row)}}><Ban size={16}/></button>}</div>}</td>
      </tr>)}
      {!pageRows.length && <tr><td colSpan={9} className="empty-table-cell">No hay registros que coincidan con la busqueda.</td></tr>}
    </tbody></table></div>
    <div className="pagination-bar"><span>Mostrando {pageRows.length} de {processed.length} registros</span><div className="action-row"><button type="button" className="icon-button" disabled={page===1} onClick={()=>setPage(1)}><ChevronsLeft size={17}/></button><button type="button" className="icon-button" disabled={page===1} onClick={()=>setPage((value)=>Math.max(1,value-1))}><ChevronLeft size={17}/></button><span>Pagina {page} de {totalPages}</span><button type="button" className="icon-button" disabled={page===totalPages} onClick={()=>setPage((value)=>Math.min(totalPages,value+1))}><ChevronRight size={17}/></button><button type="button" className="icon-button" disabled={page===totalPages} onClick={()=>setPage(totalPages)}><ChevronsRight size={17}/></button></div></div>
  </article>{modal && <DirectoryModal mode={modal.mode} row={modal.row} onClose={()=>setModal(null)} onEdit={modal.mode==='view'&&isBoss?()=>setModal({...modal,mode:'edit'}):undefined} onSaved={async()=>{setModal(null);await reload();announceOperationalDataChange()}}/>}</section>;
}

function blankDirectoryIdentifier(): DirectoryIdentifier {
  return { institution: '', type: 'Cuenta bancaria', number: '', currency: null };
}

function DirectoryModal({ mode, row, onClose, onEdit, onSaved }: { mode: ModalMode; row?: DirectoryEntry; onClose:()=>void; onEdit?:()=>void; onSaved:()=>Promise<void> }) {
  const readOnly = mode === 'view';
  const [name,setName]=useState(row?.name ?? '');
  const [status,setStatus]=useState<'ACTIVO'|'INACTIVO'>(row?.status ?? 'ACTIVO');
  const [observations,setObservations]=useState(row?.observations ?? '');
  const [identifiers,setIdentifiers]=useState<DirectoryIdentifier[]>(row?.identifiers.length ? row.identifiers : [blankDirectoryIdentifier()]);
  const [identities,setIdentities]=useState<DirectoryIdentity[]>(row?.identities ?? []);
  const [references,setReferences]=useState<string[]>(row?.references ?? []);
  const [saving,setSaving]=useState(false); const [error,setError]=useState('');
  const modalRef=useAutoFocusFirstField<HTMLFormElement>();

  function updateIdentifier(index:number, patch:Partial<DirectoryIdentifier>){setIdentifiers((current)=>current.map((item,itemIndex)=>itemIndex===index?{...item,...patch}:item));}
  function normalizeIdentityInput(value:string){const compact=value.replace(/[^0-9A-Za-z]/g,'').toUpperCase().slice(0,14);return [compact.slice(0,3),compact.slice(3,9),compact.slice(9)].filter(Boolean).join('-');}
  async function save(event:FormEvent){event.preventDefault();setSaving(true);setError('');try{const payload={name,status,observations,identifiers:identifiers.filter((item)=>item.number.trim()&&item.type.trim()),identities:identities.filter((item)=>item.number.trim()),references:references.filter((item)=>item.trim())};await apiRequest(row?`/directory/${row.database_id}`:'/directory',{method:row?'PUT':'POST',body:JSON.stringify(payload)});await onSaved();}catch(saveError){setError(saveError instanceof Error?saveError.message:'No fue posible guardar el registro.');}finally{setSaving(false)}}

  return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal-panel directory-modal" onSubmit={save} ref={modalRef}>
    <div className="modal-header"><div><p>{mode==='create'?'Nuevo registro':readOnly?'Vista de registro':'Editar registro'}</p><h2>Destinatario frecuente</h2></div><button type="button" className="icon-button icon-button--danger" onClick={onClose}><X size={18}/></button></div>
    <div className="directory-main-fields"><label className="form-field directory-id">ID<input readOnly value={row?.id ?? 'Automatico'}/></label><label className="form-field">Nombre<input readOnly={readOnly} value={name} onChange={(event)=>setName(event.target.value)} required/></label><label className="form-field directory-status">Estado<select disabled={readOnly} value={status} onChange={(event)=>setStatus(event.target.value as 'ACTIVO'|'INACTIVO')}><option value="ACTIVO">Activo</option><option value="INACTIVO">Inactivo</option></select></label></div>
    <section className="directory-editor-section"><div className="directory-editor-heading"><strong>Numeros y servicios</strong>{!readOnly&&<button type="button" className="icon-button" title="Agregar numero" onClick={()=>setIdentifiers((current)=>[...current,blankDirectoryIdentifier()])}><Plus size={16}/></button>}</div><div className="directory-identifier-grid directory-identifier-grid--header"><span>Institucion</span><span>Tipo</span><span>Numero</span><span>Moneda</span><span/></div>{identifiers.map((item,index)=><div className="directory-identifier-grid" key={index}><input readOnly={readOnly} value={item.institution} onChange={(event)=>updateIdentifier(index,{institution:event.target.value})} placeholder="BAC, Claro..."/><input readOnly={readOnly} value={item.type} onChange={(event)=>updateIdentifier(index,{type:event.target.value})} placeholder="Cuenta, contrato..."/><input readOnly={readOnly} value={item.number} onChange={(event)=>updateIdentifier(index,{number:event.target.value})} placeholder="Numero"/><select disabled={readOnly} value={item.currency ?? ''} onChange={(event)=>updateIdentifier(index,{currency:(event.target.value||null) as CashCurrency|null})}><option value="">---</option><option value="NIO">NIO</option><option value="USD">USD</option></select>{!readOnly&&<button type="button" className="icon-button icon-button--danger" title="Quitar" onClick={()=>setIdentifiers((current)=>current.filter((_,itemIndex)=>itemIndex!==index))}><Trash2 size={15}/></button>}</div>)}</section>
    <div className="directory-secondary-grid"><section className="directory-editor-section"><div className="directory-editor-heading"><strong>Cedulas</strong>{!readOnly&&<button type="button" className="icon-button" onClick={()=>setIdentities((current)=>[...current,{number:'',holder:''}])}><Plus size={16}/></button>}</div>{identities.map((item,index)=><div className="directory-paired-row" key={index}><input readOnly={readOnly} value={item.number} onChange={(event)=>setIdentities((current)=>current.map((entry,itemIndex)=>itemIndex===index?{...entry,number:normalizeIdentityInput(event.target.value)}:entry))} placeholder="000-000000-0000A"/><input readOnly={readOnly} value={item.holder} onChange={(event)=>setIdentities((current)=>current.map((entry,itemIndex)=>itemIndex===index?{...entry,holder:event.target.value}:entry))} placeholder="Titular (opcional)"/>{!readOnly&&<button type="button" className="icon-button icon-button--danger" onClick={()=>setIdentities((current)=>current.filter((_,itemIndex)=>itemIndex!==index))}><Trash2 size={15}/></button>}</div>)}</section><section className="directory-editor-section"><div className="directory-editor-heading"><strong>Referencias</strong>{!readOnly&&<button type="button" className="icon-button" onClick={()=>setReferences((current)=>[...current,''])}><Plus size={16}/></button>}</div>{references.map((item,index)=><div className="directory-single-row" key={index}><input readOnly={readOnly} value={item} onChange={(event)=>setReferences((current)=>current.map((entry,itemIndex)=>itemIndex===index?event.target.value:entry))} placeholder="Referencia"/>{!readOnly&&<button type="button" className="icon-button icon-button--danger" onClick={()=>setReferences((current)=>current.filter((_,itemIndex)=>itemIndex!==index))}><Trash2 size={15}/></button>}</div>)}</section></div>
    <label className="form-field">Observaciones<textarea readOnly={readOnly} value={observations} onChange={(event)=>setObservations(event.target.value)} rows={2}/></label>
    {row?.sources.length ? <p className="directory-source-note">Origen: {row.sources.map((source)=>`${source.sheet}, fila ${source.row}`).join(' · ')}</p> : null}
    {error&&<p className="login-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button danger-button" onClick={onClose}><X size={17}/>Cancelar</button>{onEdit&&<button type="button" className="secondary-button" onClick={onEdit}><Edit3 size={17}/>Editar</button>}{!readOnly&&<button type="submit" className="primary-button" disabled={saving||!name.trim()}><Save size={17}/>{saving?'Guardando...':'Guardar'}</button>}</div>
  </form></div>;
}

function DirectoryLookup({ onClose }: { onClose:()=>void }) {
  const [rows,setRows]=useState<DirectoryEntry[]>([]); const [query,setQuery]=useState(''); const [error,setError]=useState('');
  const [position,setPosition]=useState({x:Math.max(16,window.innerWidth-760),y:120}); const drag=useRef<{x:number;y:number;left:number;top:number}|null>(null);
  useEffect(()=>{void apiRequest<DirectoryEntry[]>('/directory').then(setRows).catch((loadError)=>setError(loadError instanceof Error?loadError.message:'No fue posible cargar el directorio.'));},[]);
  const matches=useMemo(()=>{const term=normalizeLookupValue(query);return rows.filter((row)=>row.status==='ACTIVO'&&(!term||directorySearchText(row).includes(term))).slice(0,30);},[query,rows]);
  function startDrag(event:ReactPointerEvent<HTMLElement>){if((event.target as HTMLElement).closest('button,input'))return;drag.current={x:event.clientX,y:event.clientY,left:position.x,top:position.y};event.currentTarget.setPointerCapture(event.pointerId);}
  function moveDrag(event:ReactPointerEvent<HTMLElement>){if(!drag.current)return;setPosition({x:Math.max(8,Math.min(window.innerWidth-320,drag.current.left+event.clientX-drag.current.x)),y:Math.max(8,Math.min(window.innerHeight-120,drag.current.top+event.clientY-drag.current.y))});}
  return <section className="directory-lookup" style={{left:position.x,top:position.y}} role="dialog" aria-label="Directorio de destinatarios"><header onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={()=>{drag.current=null}}><div><BookUser size={18}/><strong>Directorio</strong></div><button type="button" className="icon-button icon-button--danger" onClick={onClose}><X size={16}/></button></header><label className="search-box"><Search size={16}/><input autoFocus value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Nombre, cuenta, cedula o referencia"/></label>{error&&<p className="login-error">{error}</p>}<div className="directory-lookup__table"><table><thead><tr><th>Nombre</th><th>Tipo</th><th>Numero</th><th>Cedula / Ref.</th></tr></thead><tbody>{matches.map((row)=><tr key={row.database_id}><td><strong>{row.name}</strong></td><td className="directory-lines">{row.identifiers.map((item,index)=><span key={index}>{item.institution ? `${item.institution} · `:''}{item.type}</span>)}</td><td className="directory-lines directory-number">{row.identifiers.map((item,index)=><span key={index}>{item.number}{item.currency ? ` · ${item.currency}`:''}</span>)}</td><td className="directory-lines">{row.identities.map((item,index)=><span key={`i-${index}`}>{item.number}</span>)}{row.references.map((item,index)=><span key={`r-${index}`}>Ref. {item}</span>)}</td></tr>)}{!matches.length&&<tr><td colSpan={4} className="empty-table-cell">Sin coincidencias.</td></tr>}</tbody></table></div><footer>Mostrando {matches.length} de {rows.filter((row)=>row.status==='ACTIVO').length}</footer></section>;
}

function PendingScreen({ currentUser }: { currentUser: AuthUser }) {
  const [rows, setRows] = useState<PendingApiRow[]>([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showPaid, setShowPaid] = useState(true);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<keyof PendingApiRow>('fecha_creacion');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ pending: PendingApiRow; row: CrudRow } | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [paymentModal, setPaymentModal] = useState<{
    pending: PendingApiRow;
    row: CrudRow;
  } | null>(null);
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [batchCashModal, setBatchCashModal] = useState<{ pendings: PendingApiRow[]; row: CrudRow } | null>(null);
  const [batchDigitalModal, setBatchDigitalModal] = useState<{
    pendings: PendingApiRow[];
    shift: ShiftDetail;
    entity: string;
    movementCode: string;
  } | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const isBoss = currentUser.roleCode === 'JEFA';

  const columns = useMemo(() => [
    { key: 'id' as const, label: 'ID' },
    { key: 'fecha_creacion' as const, label: 'FECHA' },
    { key: 'tipo' as const, label: 'TIPO' },
    { key: 'contraparte' as const, label: 'PENDIENTE' },
    { key: 'entidad' as const, label: 'BANCO' },
    { key: 'movimiento' as const, label: 'MOVIMIENTO' },
    { key: 'monto_original' as const, label: 'MONTO' },
    { key: 'saldo_pendiente' as const, label: 'SALDO' },
    { key: 'estado' as const, label: 'ESTADO' },
    ...(isBoss ? [{ key: 'cajero' as const, label: 'CAJERO / SUCURSAL' }] : []),
  ], [isBoss]);

  useEffect(() => {
    let cancelled = false;
    setRows([]);
    apiRequest<PendingApiRow[]>('/transactions/pending')
      .then((databaseRows) => {
        if (!cancelled) {
          setRows(databaseRows);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar los pendientes.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser.id]);

  useOperationalRefresh(async () => {
    setRows(await apiRequest<PendingApiRow[]>('/transactions/pending'));
  }, !detail && !paymentModal && !payingId);

  const processedRows = useMemo(() => {
    const normalizedQuery = normalizeLookupValue(query);
    const filtered = rows.filter((row) => {
      if (!showPaid && ['PAGADO', 'CANCELADO'].includes(row.estado)) {
        return false;
      }
      if (normalizedQuery && !Object.values(row).some((value) => normalizeLookupValue(String(value)).includes(normalizedQuery))) {
        return false;
      }
      return columns.every((column) => {
        const filter = normalizeLookupValue(filters[column.key] ?? '');
        if (!filter) {
          return true;
        }
        const value = column.key === 'cajero'
          ? `${row.cajero} ${row.sucursal}`
          : String(row[column.key] ?? '');
        return normalizeLookupValue(value).includes(filter);
      });
    });
    return [...filtered].sort((first, second) => {
      const firstValue = String(first[sortKey] ?? '');
      const secondValue = String(second[sortKey] ?? '');
      const comparison = firstValue.localeCompare(secondValue, 'es', { numeric: true });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [columns, filters, query, rows, showPaid, sortDirection, sortKey]);

  const totalPages = Math.max(1, Math.ceil(processedRows.length / pageSize));
  const pageRows = processedRows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [filters, pageSize, query, showPaid]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function cycleSort(key: keyof PendingApiRow) {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection('desc');
      return;
    }
    setSortDirection((current) => current === 'desc' ? 'asc' : 'desc');
  }

  async function loadPendingPaymentRow(row: PendingApiRow) {
    const transaction = await apiRequest<TransactionDetailApi>(
      `/transactions/${row.transaction_database_id}/detail`,
    );
    return normalizeTransactionRow({
      ...mapApiTransactionDetail(transaction),
      direction: row.tipo === 'POR_COBRAR' ? 'Ingreso' : 'Salida',
      currency: row.moneda,
      amountValue: row.saldo_pendiente,
      pendingName: row.contraparte,
      cashCountNio: '{}',
      cashCountUsd: '{}',
      changeCashCountNio: '{}',
      changeCashCountUsd: '{}',
      expectedChangeNio: '0',
      expectedChangeUsd: '0',
    });
  }

  async function openPendingDetail(row: PendingApiRow) {
    setError('');
    try {
      setDetail({ pending: row, row: await loadPendingPaymentRow(row) });
    } catch (detailError) {
      setError(detailError instanceof Error ? detailError.message : 'No fue posible abrir el pendiente.');
    }
  }

  function navigatePendingDetail(offset: -1 | 1) {
    if (!detail) return;
    const index = processedRows.findIndex((pending) => pending.database_id === detail.pending.database_id);
    const target = processedRows[index + offset];
    if (target) void openPendingDetail(target);
  }

  async function openPayment(row: PendingApiRow) {
    if (row.estado === 'PAGADO' || payingId) {
      return;
    }
    setPayingId(row.database_id);
    setError('');
    setMessage('');
    try {
      setPaymentModal({ pending: row, row: await loadPendingPaymentRow(row) });
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : 'No fue posible abrir el pago pendiente.');
    } finally {
      setPayingId(null);
    }
  }

  async function payPending(transactionRows: CrudRow[]) {
    if (!paymentModal) return;
    setPayingId(paymentModal.pending.database_id);
    setError('');
    setMessage('');
    try {
      const payload = buildTransactionBatchPayload(transactionRows);
      await apiRequest(`/transactions/pending/${paymentModal.pending.database_id}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          rates: payload.rates,
          settlement: payload.settlement,
        }),
      });
      setRows((current) => current.map((item) => item.database_id === paymentModal.pending.database_id ? {
        ...item,
        estado: 'PAGADO',
        saldo_pendiente: '0',
        fecha_modificacion: new Date().toISOString(),
      } : item));
      setShowPaid(true);
      setMessage(`El pendiente de ${paymentModal.pending.contraparte} fue marcado como pagado.`);
      setPaymentModal(null);
    } catch (payError) {
      setError(payError instanceof Error ? payError.message : 'No fue posible marcar el pendiente como pagado.');
    } finally {
      setPayingId(null);
    }
  }

  function selectedPayablePendings() {
    return rows.filter((row) => selectedPendingIds.includes(row.database_id) && !['PAGADO', 'CANCELADO'].includes(row.estado));
  }

  // Comprueba que un lote pueda liquidarse con una sola moneda, direccion y turno.
  async function validateBatchSelection() {
    const selected = selectedPayablePendings();
    if (!selected.length) {
      await requestSystemAlert('Seleccione al menos un pendiente disponible.', 'Seleccionar pendientes');
      return null;
    }
    const reference = selected[0];
    if (selected.some((row) => row.tipo !== reference.tipo || row.moneda !== reference.moneda || row.shift_database_id !== reference.shift_database_id)) {
      await requestSystemAlert('Los pendientes deben pertenecer al mismo turno y tener el mismo tipo y moneda.', 'Seleccion incompatible');
      return null;
    }
    return selected;
  }

  async function openBatchCashPayment() {
    const selected = await validateBatchSelection();
    if (!selected) return;
    setPayingId('batch');
    try {
      const baseRow = await loadPendingPaymentRow(selected[0]);
      const total = selected.reduce((sum, row) => sum + Number(row.saldo_pendiente), 0);
      setBatchCashModal({
        pendings: selected,
        row: normalizeTransactionRow({
          ...baseRow,
          amountValue: String(total),
          pendingName: `${selected.length} pendientes seleccionados`,
          direction: selected[0].tipo === 'POR_COBRAR' ? 'Ingreso' : 'Salida',
        }),
      });
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : 'No fue posible preparar la liquidacion multiple.');
    } finally {
      setPayingId(null);
    }
  }

  async function openBatchDigitalPayment() {
    const selected = await validateBatchSelection();
    if (!selected) return;
    setPayingId('batch');
    try {
      const shift = await apiRequest<ShiftDetail>(`/shifts/${selected[0].shift_database_id}`);
      const expectedDirection = selected[0].tipo === 'POR_COBRAR' ? 'Ingreso' : 'Salida';
      const movements = shift.availableMovements.filter((movement) => movement.affectsAccount && movement.accountDirection === expectedDirection && movement.currencies.includes(selected[0].moneda));
      const first = movements[0];
      if (!first) {
        await requestSystemAlert(`No hay movimientos digitales de ${expectedDirection.toLowerCase()} configurados para ${selected[0].moneda}.`, 'Movimiento no disponible');
        return;
      }
      setBatchDigitalModal({ pendings: selected, shift, entity: first.entity, movementCode: first.code });
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : 'No fue posible preparar el pago digital.');
    } finally {
      setPayingId(null);
    }
  }

  async function submitBatchCash(transactionRows: CrudRow[]) {
    if (!batchCashModal) return;
    setPayingId('batch');
    try {
      const payload = buildTransactionBatchPayload(transactionRows);
      await apiRequest('/transactions/pending/pay-batch', {
        method: 'POST',
        body: JSON.stringify({
          pendingIds: batchCashModal.pendings.map((row) => row.database_id),
          method: 'EFECTIVO',
          rates: payload.rates,
          settlement: payload.settlement,
        }),
      });
      setBatchCashModal(null);
      await finishBatchPayment(batchCashModal.pendings, 'efectivo');
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : 'No fue posible liquidar los pendientes.');
    } finally {
      setPayingId(null);
    }
  }

  async function submitBatchDigital() {
    if (!batchDigitalModal) return;
    setPayingId('batch');
    try {
      const rate = readExchangeRate();
      await apiRequest('/transactions/pending/pay-batch', {
        method: 'POST',
        body: JSON.stringify({
          pendingIds: batchDigitalModal.pendings.map((row) => row.database_id),
          method: 'DIGITAL',
          rates: { buy: parseExchangeRate(rate.buy), sell: parseExchangeRate(rate.sell) },
          digital: { entityCode: batchDigitalModal.entity, movementCode: batchDigitalModal.movementCode },
        }),
      });
      setBatchDigitalModal(null);
      await finishBatchPayment(batchDigitalModal.pendings, 'digital');
    } catch (batchError) {
      setError(batchError instanceof Error ? batchError.message : 'No fue posible liquidar los pendientes.');
    } finally {
      setPayingId(null);
    }
  }

  async function finishBatchPayment(pendings: PendingApiRow[], method: string) {
    const paidIds = new Set(pendings.map((row) => row.database_id));
    setRows((current) => current.map((row) => paidIds.has(row.database_id) ? { ...row, estado: 'PAGADO', saldo_pendiente: '0' } : row));
    setSelectedPendingIds([]);
    setShowPaid(true);
    setMessage(`${pendings.length} pendientes fueron liquidados completamente en ${method}.`);
    announceOperationalDataChange();
  }

  return (
    <section className="screen-stack">
      <article className="panel">
        <div className="panel__header table-panel-header">
          <div>
            <p>Cuentas por cobrar y por pagar</p>
            <h2>Pendientes</h2>
          </div>
        </div>

        <div className="table-toolbar">
          <label className="search-box">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar pendientes" />
          </label>
          <div className="table-toolbar-controls">
            <button type="button" className="secondary-button" disabled={!selectedPendingIds.length || Boolean(payingId)} onClick={() => void openBatchCashPayment()}>
              <Banknote size={17} /> Liquidar en efectivo
            </button>
            <button type="button" className="primary-button" disabled={!selectedPendingIds.length || Boolean(payingId)} onClick={() => void openBatchDigitalPayment()}>
              <Landmark size={17} /> Liquidar digital
            </button>
            <label className="switch-control switch-control--small">
              <input checked={showPaid} type="checkbox" onChange={(event) => setShowPaid(event.target.checked)} />
              <span />
              Mostrar pagados
            </label>
            <label className="page-size-control">
              Registros
              <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
                {[10, 20, 30, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
          </div>
        </div>

        {message && <p className="pending-screen-message" role="status">{message}</p>}
        {error && <p className="transaction-save-error" role="alert">{error}</p>}

        <div className="table-wrap">
          <table className="pending-table">
            <thead>
              <tr>
                <th className="selection-column">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar pendientes visibles"
                    checked={pageRows.some((row) => !['PAGADO', 'CANCELADO'].includes(row.estado)) && pageRows.filter((row) => !['PAGADO', 'CANCELADO'].includes(row.estado)).every((row) => selectedPendingIds.includes(row.database_id))}
                    onChange={(event) => {
                      const visibleIds = pageRows.filter((row) => !['PAGADO', 'CANCELADO'].includes(row.estado)).map((row) => row.database_id);
                      setSelectedPendingIds((current) => event.target.checked ? [...new Set([...current, ...visibleIds])] : current.filter((id) => !visibleIds.includes(id)));
                    }}
                  />
                </th>
                <th className="number-column"><div className="th-stack"><span>N°</span></div></th>
                {columns.map((column) => (
                  <th key={column.key} className={filters[column.key] || sortKey === column.key ? 'table-header--modified' : undefined}>
                    <div className="th-stack">
                      <button type="button" className="th-sort-button" onClick={() => cycleSort(column.key)}>
                        {column.label}
                        {sortKey === column.key
                          ? sortDirection === 'asc' ? <ArrowDownAZ size={14} /> : <ArrowUpZA size={14} />
                          : <ArrowUpDown size={14} />}
                      </button>
                      <input value={filters[column.key] ?? ''} onChange={(event) => setFilters((current) => ({ ...current, [column.key]: event.target.value }))} placeholder="Filtrar" />
                    </div>
                  </th>
                ))}
                <th><div className="th-stack"><span>Acciones</span></div></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, index) => (
                <tr
                  key={row.database_id}
                  className={`${row.estado === 'PAGADO' ? 'inactive-row' : ''} ${selectedId === row.database_id ? 'selected-row' : ''}`}
                  onClick={() => setSelectedId(row.database_id)}
                  onDoubleClick={() => void openPendingDetail(row)}
                >
                  <td className="selection-column" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Seleccionar ${row.id}`}
                      disabled={['PAGADO', 'CANCELADO'].includes(row.estado)}
                      checked={selectedPendingIds.includes(row.database_id)}
                      onChange={(event) => setSelectedPendingIds((current) => event.target.checked ? [...current, row.database_id] : current.filter((id) => id !== row.database_id))}
                    />
                  </td>
                  <td className="number-column">{processedRows.length - ((page - 1) * pageSize + index)}</td>
                  <td>{row.id}</td>
                  <td className="multi-line-cell">{coerceTransactionDateTime(row.fecha_creacion)}</td>
                  <td>{row.tipo === 'POR_COBRAR' ? 'Por cobrar' : 'Por pagar'}</td>
                  <td>{row.contraparte}</td>
                  <td>{row.entidad}</td>
                  <td><strong>{row.movimiento}</strong><small className="pending-movement-code">{row.codigo_movimiento}</small></td>
                  <td className="pending-money-cell">{formatCashCountMoney(Number(row.monto_original), row.moneda)}</td>
                  <td className="pending-money-cell">{formatCashCountMoney(Number(row.saldo_pendiente), row.moneda)}</td>
                  <td><span className={`pending-status pending-status--${row.estado.toLowerCase()}`}>{row.estado}</span></td>
                  {isBoss && <td className="multi-line-cell transaction-operator-cell">{`${row.cajero}\n${row.sucursal}`}</td>}
                  <td>
                    <button
                      type="button"
                      className="icon-action pending-pay-button"
                      title={row.estado === 'PAGADO' ? 'Pendiente pagado' : 'Marcar como pagado'}
                      disabled={row.estado === 'PAGADO' || row.estado === 'CANCELADO' || payingId === row.database_id}
                      onClick={(event) => { event.stopPropagation(); void openPayment(row); }}
                    >
                      <CheckCircle2 size={17} />
                    </button>
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && <tr><td colSpan={columns.length + 3} className="empty-table-cell">No hay pendientes para mostrar.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="pagination-bar">
          <span>Mostrando {pageRows.length} de {processedRows.length} registros</span>
          <div className="action-row">
            <button type="button" className="icon-button" onClick={() => setPage(1)} disabled={page === 1}><ChevronsLeft size={17} /></button>
            <button type="button" className="icon-button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}><ChevronLeft size={17} /></button>
            <span>Pagina {page} de {totalPages}</span>
            <button type="button" className="icon-button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}><ChevronRight size={17} /></button>
            <button type="button" className="icon-button" onClick={() => setPage(totalPages)} disabled={page === totalPages}><ChevronsRight size={17} /></button>
          </div>
        </div>
      </article>

      {detail && (
        <TransactionModal
          key={`pending-detail-${detail.pending.database_id}`}
          mode="view"
          row={detail.row}
          isSaving={false}
          saveError={error}
          onCancel={() => setDetail(null)}
          onSave={async () => undefined}
          onEdit={detail.pending.estado === 'PENDIENTE'
            ? () => {
                setPaymentModal(detail);
                setDetail(null);
              }
            : undefined}
          navigation={{
            currentIndex: processedRows.findIndex((pending) => pending.database_id === detail.pending.database_id),
            total: processedRows.length,
            onPrevious: () => navigatePendingDetail(-1),
            onNext: () => navigatePendingDetail(1),
          }}
        />
      )}
      {paymentModal && (
        <TransactionModal
          key={`pending-payment-${paymentModal.pending.database_id}`}
          mode="pay"
          row={paymentModal.row}
          isSaving={payingId === paymentModal.pending.database_id}
          saveError={error}
          onCancel={() => {
            if (!payingId) setPaymentModal(null);
          }}
          onSave={payPending}
        />
      )}
      {batchCashModal && (
        <TransactionModal
          key={`pending-batch-cash-${batchCashModal.pendings.map((row) => row.database_id).join('-')}`}
          mode="pay"
          row={batchCashModal.row}
          isSaving={payingId === 'batch'}
          saveError={error}
          onCancel={() => { if (!payingId) setBatchCashModal(null); }}
          onSave={submitBatchCash}
        />
      )}
      {batchDigitalModal && (() => {
        const expectedDirection = batchDigitalModal.pendings[0].tipo === 'POR_COBRAR' ? 'Ingreso' : 'Salida';
        const movements = batchDigitalModal.shift.availableMovements.filter((movement) => movement.affectsAccount && movement.accountDirection === expectedDirection && movement.currencies.includes(batchDigitalModal.pendings[0].moneda));
        const entities = [...new Set(movements.map((movement) => movement.entity))];
        const entityMovements = movements.filter((movement) => movement.entity === batchDigitalModal.entity);
        const total = batchDigitalModal.pendings.reduce((sum, row) => sum + Number(row.saldo_pendiente), 0);
        return (
          <div className="modal-backdrop" role="dialog" aria-modal="true">
            <section className="system-dialog pending-batch-dialog">
              <div className="system-dialog__icon"><Landmark size={24} /></div>
              <div className="system-dialog__content">
                <p>Liquidacion multiple</p>
                <h2>Pago digital</h2>
                <span>{batchDigitalModal.pendings.length} pendientes por {formatCashCountMoney(total, batchDigitalModal.pendings[0].moneda)}</span>
                <label className="form-field">Cuenta bancaria
                  <select value={batchDigitalModal.entity} onChange={(event) => {
                    const entity = event.target.value;
                    const firstMovement = movements.find((movement) => movement.entity === entity);
                    setBatchDigitalModal((current) => current ? { ...current, entity, movementCode: firstMovement?.code ?? '' } : current);
                  }}>{entities.map((entity) => <option key={entity}>{entity}</option>)}</select>
                </label>
                <label className="form-field">Movimiento de {expectedDirection.toLowerCase()}
                  <select value={batchDigitalModal.movementCode} onChange={(event) => setBatchDigitalModal((current) => current ? { ...current, movementCode: event.target.value } : current)}>
                    {entityMovements.map((movement) => <option key={movement.code} value={movement.code}>{movement.code} - {movement.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="system-dialog__actions">
                <button type="button" className="secondary-button danger-button" disabled={payingId === 'batch'} onClick={() => setBatchDigitalModal(null)}><X size={17} />Cancelar</button>
                <button type="button" className="primary-button" disabled={payingId === 'batch' || !batchDigitalModal.movementCode} onClick={() => void submitBatchDigital()}><CheckCircle2 size={17} />{payingId === 'batch' ? 'Procesando...' : 'Liquidar'}</button>
              </div>
            </section>
          </div>
        );
      })()}
    </section>
  );
}

function GeneralConsolidationScreen() {
  const authenticatedUser = readAuthenticatedUser();
  const isCashier = authenticatedUser?.roleCode === 'CAJERO';
  const [currentShiftLoaded, setCurrentShiftLoaded] = useState(!isCashier);
  const [movementSummary, setMovementSummary] = useState<Record<CashCurrency, Record<string, { income: number; expense: number }>>>(() => ({
    NIO: {},
    USD: {},
  }));
  const [apiBalances, setApiBalances] = useState<Record<string, { initial?: string; system?: string }>>({});
  const [apiBalanceAccounts, setApiBalanceAccounts] = useState<Record<string, string>>({});
  const shiftConfig = crudConfigs.shifts[0];
  const [shiftRows, setShiftRows] = usePersistentRows(shiftConfig.storageKey, shiftConfig.rows);
  const normalizedShifts = useMemo(() => shiftRows.map(normalizeShiftRow), [shiftRows]);
  const [selectedShiftId, setSelectedShiftId] = useState(
    () => normalizedShifts.find((shift) => shift.status === 'Abierto')?.id || normalizedShifts[0]?.id || '',
  );
  const selectedShift = isCashier && !currentShiftLoaded
    ? undefined
    : normalizedShifts.find((shift) => shift.id === selectedShiftId) ||
      normalizedShifts.find((shift) => shift.status === 'Abierto') ||
      normalizedShifts[0];
  const accounts = useMemo(
    () => getShiftAccountsForBranch(selectedShift?.branch || ''),
    [selectedShift?.branch],
  );
  const nioEntities = useMemo(
    () => [...new Set([
      ...accounts.filter((account) => account.currency === 'NIO').map((account) => account.entity),
      ...Object.keys(movementSummary.NIO),
    ])],
    [accounts, movementSummary.NIO],
  );
  const usdEntities = useMemo(
    () => [...new Set([
      ...accounts.filter((account) => account.currency === 'USD').map((account) => account.entity),
      ...Object.keys(movementSummary.USD),
    ])],
    [accounts, movementSummary.USD],
  );
  const balances = useMemo(
    () => {
      if (Object.keys(apiBalances).length > 0) {
        return apiBalances;
      }
      return selectedShift
        ? mapShiftBalancesToConsolidation(
            accounts,
            readShiftBankBalances(selectedShift, 'opening'),
            readShiftBankBalances(selectedShift, 'closing'),
          )
        : {};
    },
    [accounts, apiBalances, selectedShift],
  );
  const nioSummary = movementSummary.NIO;
  const usdSummary = movementSummary.USD;

  useEffect(() => {
    if (!isCashier) {
      return;
    }
    void apiRequest<ShiftDetail | null>('/shifts/current').then((detail) => {
      if (!detail) {
        setShiftRows([]);
        return;
      }
      const scopedAccounts = getShiftAccountsForBranch(detail.sucursal);
      const openingBalances: ShiftBankBalanceDraft = {};
      const closingBalances: ShiftBankBalanceDraft = {};
      for (const balance of detail.balances) {
        const account = scopedAccounts.find((item) => normalizeLookupValue(item.alias) === normalizeLookupValue(balance.account));
        if (account) {
          openingBalances[account.id] = String(balance.initial ?? '0');
          closingBalances[account.id] = String(balance.system ?? balance.calculated ?? balance.initial ?? '0');
        }
      }
      setMovementSummary({
        NIO: summarizeShiftBalancesByEntity(detail.balances, 'NIO'),
        USD: summarizeShiftBalancesByEntity(detail.balances, 'USD'),
      });
      setApiBalances(mapApiShiftBalancesToConsolidation(detail.balances));
      setApiBalanceAccounts(mapApiShiftBalanceAccounts(detail.balances));
      const row: CrudRow = {
        ...shiftDetailToCrudRow(detail),
        openingBankBalances: serializeShiftBankBalances(openingBalances),
        closingBankBalances: serializeShiftBankBalances(closingBalances),
      };
      setShiftRows([row]);
      setSelectedShiftId(row.id);
    }).catch(() => setShiftRows([])).finally(() => setCurrentShiftLoaded(true));
  }, []);

  useEffect(() => {
    if (isCashier || !selectedShift?.databaseId) {
      return;
    }
    void apiRequest<ShiftDetail>(`/shifts/${selectedShift.databaseId}`).then((detail) => {
      const scopedAccounts = getShiftAccountsForBranch(detail.sucursal);
      const openingBalances: ShiftBankBalanceDraft = {};
      const closingBalances: ShiftBankBalanceDraft = {};
      for (const balance of detail.balances) {
        const account = scopedAccounts.find((item) => normalizeLookupValue(item.alias) === normalizeLookupValue(balance.account));
        if (account) {
          openingBalances[account.id] = String(balance.initial ?? '0');
          closingBalances[account.id] = String(balance.system ?? balance.calculated ?? balance.initial ?? '0');
        }
      }
      setMovementSummary({
        NIO: summarizeShiftBalancesByEntity(detail.balances, 'NIO'),
        USD: summarizeShiftBalancesByEntity(detail.balances, 'USD'),
      });
      setApiBalances(mapApiShiftBalancesToConsolidation(detail.balances));
      setApiBalanceAccounts(mapApiShiftBalanceAccounts(detail.balances));
      setShiftRows((current) => current.map((row) => row.id === selectedShift.id ? {
        ...row,
        openingBankBalances: serializeShiftBankBalances(openingBalances),
        closingBankBalances: serializeShiftBankBalances(closingBalances),
      } : row));
    }).catch(() => setMovementSummary({ NIO: {}, USD: {} }));
  }, [isCashier, selectedShift?.databaseId]);

  useEffect(() => {
    if (selectedShift && selectedShift.id !== selectedShiftId) {
      setSelectedShiftId(selectedShift.id);
    }
  }, [selectedShift, selectedShiftId]);

  useOperationalRefresh(async () => {
    const detail = isCashier
      ? await apiRequest<ShiftDetail | null>('/shifts/current')
      : selectedShift?.databaseId
        ? await apiRequest<ShiftDetail>(`/shifts/${selectedShift.databaseId}`)
        : null;
    if (!detail) {
      setMovementSummary({ NIO: {}, USD: {} });
      setApiBalances({});
      setApiBalanceAccounts({});
      return;
    }
    setMovementSummary({
      NIO: summarizeShiftBalancesByEntity(detail.balances, 'NIO'),
      USD: summarizeShiftBalancesByEntity(detail.balances, 'USD'),
    });
    setApiBalances(mapApiShiftBalancesToConsolidation(detail.balances));
    setApiBalanceAccounts(mapApiShiftBalanceAccounts(detail.balances));
  }, Boolean(isCashier || selectedShift?.databaseId));

  function updateBalance(currency: CashCurrency, entity: string, field: 'initial' | 'system', value: string) {
    if (!selectedShift || selectedShift.status === 'Cerrado' || field === 'initial') {
      return;
    }
    const cleanValue = normalizeConsolidationRaw(value);
    const key = getConsolidationKey(currency, entity);
    const account = getShiftBalanceAccount(accounts, currency, entity);
    const accountAlias = apiBalanceAccounts[key] || account?.alias;
    if (!accountAlias) {
      return;
    }
    setApiBalances((current) => ({
      ...current,
      [key]: {
        ...current[key],
        system: cleanValue,
      },
    }));
    setShiftRows((currentRows) =>
      currentRows.map((shift) => {
        if (shift.id !== selectedShift.id) {
          return shift;
        }
        const closingBalances = readShiftBankBalances(shift, 'closing');
        return {
          ...shift,
          closingBankBalances: serializeShiftBankBalances({
            ...closingBalances,
            ...(account ? { [account.id]: cleanValue } : {}),
          }),
        };
      }),
    );
    if (selectedShift.databaseId) {
      void apiRequest(`/shifts/${selectedShift.databaseId}/account-balances`, {
        method: 'PUT',
        body: JSON.stringify({ balances: [{ account: accountAlias, amount: parseMoneyValue(cleanValue) }] }),
      }).catch(() => undefined);
    }
  }

  function handleMoneyInputKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    currency: CashCurrency,
    entity: string,
    field: 'initial' | 'system',
    currentValue?: string,
  ) {
    const nextValue = getAccountingMoneyKeyValue(event, currentValue);
    if (nextValue === undefined) {
      return;
    }
    event.preventDefault();
    if (nextValue !== null) {
      updateBalance(currency, entity, field, nextValue);
      queueAccountingMoneyCaret(event, nextValue);
    }
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
          {!isCashier && <label className="consolidation-shift-selector">
            Turno
            <select value={selectedShift?.id || ''} onChange={(event) => setSelectedShiftId(event.target.value)}>
              {normalizedShifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.id} · {shift.cashier} · {shift.branch} · {shift.status}
                </option>
              ))}
            </select>
          </label>}
        </div>

        {selectedShift ? (
          <div className="consolidation-stack">
            <ConsolidationTable
              balances={balances}
              currency="NIO"
              entities={nioEntities}
              summary={nioSummary}
              title="Consolidado en Cordobas (NIO)"
              readOnly={selectedShift.status === 'Cerrado'}
              onMoneyInputKeyDown={handleMoneyInputKeyDown}
              onMoneyInputPaste={handleMoneyInputPaste}
              onBalanceChange={updateBalance}
            />
            <ConsolidationTable
              balances={balances}
              currency="USD"
              entities={usdEntities}
              summary={usdSummary}
              title="Consolidado en Dolares (USD)"
              readOnly={selectedShift.status === 'Cerrado'}
              onMoneyInputKeyDown={handleMoneyInputKeyDown}
              onMoneyInputPaste={handleMoneyInputPaste}
              onBalanceChange={updateBalance}
            />
          </div>
        ) : (
          <div className="empty-state">No hay turnos disponibles para mostrar saldos.</div>
        )}
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
  readOnly,
  onBalanceChange,
  onMoneyInputKeyDown,
  onMoneyInputPaste,
}: {
  balances: Record<string, { initial?: string; system?: string }>;
  currency: CashCurrency;
  entities: string[];
  summary: Record<string, { income: number; expense: number }>;
  title: string;
  readOnly?: boolean;
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
                  <td className="consolidation-money-cell">
                    <MoneyAmount currency={currency} value={initial} />
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
                        readOnly={readOnly}
                        onChange={(event) => onBalanceChange(currency, entity, 'system', event.target.value)}
                        onKeyDown={(event) => onMoneyInputKeyDown(event, currency, entity, 'system', rowBalance.system)}
                        onPaste={(event) => onMoneyInputPaste(event, currency, entity, 'system')}
                        onFocus={(event) => placeAccountingMoneyCaretBeforeDecimals(event.currentTarget)}
                        onClick={(event) => placeAccountingMoneyCaretBeforeDecimals(event.currentTarget)}
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

function ExchangeCalculator({ onClose }: { onClose: () => void }) {
  const [rate] = useState<ExchangeRate>(() => readExchangeRate());
  const [rateKind, setRateKind] = useState<ExchangeRateKind>('Compra');
  const [inputCurrency, setInputCurrency] = useState<CashCurrency>('USD');
  const [amount, setAmount] = useState('');
  const panelRef = useRef<HTMLElement>(null);
  const dragOffsetRef = useRef<{ x: number; y: number; pointerId: number } | null>(null);
  const [position, setPosition] = useState(() => ({
    x: Math.max(12, window.innerWidth - 356),
    y: 92,
  }));
  const rateValue = getTransactionRateValue(rate, rateKind);
  const amountValue = parseMoneyValue(amount);
  const resultCurrency: CashCurrency = inputCurrency === 'USD' ? 'NIO' : 'USD';
  const resultValue = inputCurrency === 'USD' ? amountValue * rateValue : amountValue / rateValue;

  function handleAmountKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const nextValue = getAccountingMoneyKeyValue(event, amount);
    if (nextValue === undefined) {
      return;
    }
    event.preventDefault();
    if (nextValue !== null) {
      setAmount(nextValue);
      queueAccountingMoneyCaret(event, nextValue);
    }
  }

  function handleAmountPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    setAmount(normalizeAccountingMoneyRaw(event.clipboardData.getData('text')));
  }

  function handleDragStart(event: ReactPointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('button')) {
      return;
    }
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    dragOffsetRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      pointerId: event.pointerId,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragOffset = dragOffsetRef.current;
    const panel = panelRef.current;
    if (!dragOffset || dragOffset.pointerId !== event.pointerId || !panel) {
      return;
    }
    const rect = panel.getBoundingClientRect();
    const maxX = Math.max(8, window.innerWidth - rect.width - 8);
    const maxY = Math.max(8, window.innerHeight - rect.height - 8);
    setPosition({
      x: Math.min(maxX, Math.max(8, event.clientX - dragOffset.x)),
      y: Math.min(maxY, Math.max(8, event.clientY - dragOffset.y)),
    });
  }

  function handleDragEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragOffsetRef.current?.pointerId !== event.pointerId) {
      return;
    }
    dragOffsetRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <section
      className="exchange-calculator"
      ref={panelRef}
      role="dialog"
      aria-label="Calculadora de compra y venta de dolares"
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="exchange-calculator__header"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <div>
          <GripHorizontal size={16} />
          <strong>Consulta de cambio</strong>
        </div>
        <button type="button" className="icon-button close-button" onClick={onClose} aria-label="Cerrar calculadora">
          <X size={16} />
        </button>
      </div>

      <div className="exchange-calculator__body">
        <div className="exchange-calculator__rate">
          <div>
            <span>Tasa utilizada</span>
            <strong>{rateKind} C$ {formatRateDisplay(String(rateValue))}</strong>
          </div>
          <button
            type="button"
            className="transaction-rate-toggle"
            onClick={() => setRateKind((current) => (current === 'Compra' ? 'Venta' : 'Compra'))}
            aria-label={`Cambiar a tasa de ${rateKind === 'Compra' ? 'Venta' : 'Compra'}`}
            title={`Usar tasa de ${rateKind === 'Compra' ? 'Venta' : 'Compra'}`}
          >
            <RefreshCw size={15} />
          </button>
        </div>

        <div className="currency-filter exchange-calculator__currency" aria-label="Moneda que se digitara">
          <button
            type="button"
            className={`currency-filter__button currency-filter__button--nio ${inputCurrency === 'NIO' ? 'currency-filter__button--active' : ''}`}
            onClick={() => setInputCurrency('NIO')}
          >
            C$
          </button>
          <button
            type="button"
            className={`currency-filter__button currency-filter__button--usd ${inputCurrency === 'USD' ? 'currency-filter__button--active' : ''}`}
            onClick={() => setInputCurrency('USD')}
          >
            $
          </button>
        </div>

        <label className="form-field">
          Cantidad a convertir
          <div className="exchange-calculator__money-field">
            <span>{getCurrencySymbol(inputCurrency)}</span>
            <input
              autoFocus
              inputMode="decimal"
              value={formatAccountingMoneyInput(amount)}
              onChange={(event) => setAmount(normalizeAccountingMoneyRaw(event.target.value))}
              onKeyDown={handleAmountKeyDown}
              onPaste={handleAmountPaste}
              onFocus={(event) => placeAccountingMoneyCaretBeforeDecimals(event.currentTarget)}
              onClick={(event) => placeAccountingMoneyCaretBeforeDecimals(event.currentTarget)}
              placeholder="0.00"
            />
          </div>
        </label>

        <label className="form-field">
          Resultado
          <div className="exchange-calculator__money-field exchange-calculator__money-field--result">
            <span>{getCurrencySymbol(resultCurrency)}</span>
            <input
              value={formatMoneyNumber(Number.isFinite(resultValue) ? resultValue : 0)}
              readOnly
              aria-label={`Resultado en ${resultCurrency}`}
            />
          </div>
        </label>
      </div>
    </section>
  );
}

function renderDifference(
  value: number,
  currency: CashCurrency,
  {
    positiveLabel = 'Sobra',
    negativeLabel = 'Falta',
    positiveTone = 'surplus',
    negativeTone = 'shortage',
  }: {
    positiveLabel?: string;
    negativeLabel?: string;
    positiveTone?: 'surplus' | 'shortage';
    negativeTone?: 'surplus' | 'shortage';
  } = {},
) {
  if (Math.abs(value) < 0.005) {
    return <span className="difference-badge difference-badge--ok">---</span>;
  }

  const isSurplus = value > 0;
  const label = isSurplus ? positiveLabel : negativeLabel;
  const tone = isSurplus ? positiveTone : negativeTone;
  return (
    <span className={`difference-badge difference-badge--${tone}`}>
      {isSurplus ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
      {label ? `${label} ` : ''}
      {formatCashCountMoney(Math.abs(value), currency)}
    </span>
  );
}

function ShiftTable({
  config,
  onOpenShiftClose,
}: {
  config: CrudConfig;
  onOpenShiftClose: (shiftId: string) => Promise<void>;
}) {
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
  const [modal, setModal] = useState<{ mode: 'open' | 'edit' | 'close' | 'view'; row: CrudRow } | null>(null);
  const [branchCatalog, setBranchCatalog] = useState<BranchCatalogRow[]>([]);

  async function reloadShifts() {
    const databaseRows = await apiRequest<ShiftDetail[]>('/shifts');
    setRows(databaseRows.map(shiftDetailToCrudRow));
  }

  useEffect(() => {
    void Promise.all([
      reloadShifts(),
      apiRequest<BranchCatalogRow[]>('/catalogs/sucursales').then(setBranchCatalog),
    ]).catch(() => undefined);
  }, []);

  useOperationalRefresh(reloadShifts, !modal);

  const activeBranchNames = useMemo(
    () => {
      const activeBranches = branchCatalog.filter((branch) => branch.estado === 'ACTIVO');
      const configuredNames = getAvailableBranchNames();
      const configuredActiveNames = configuredNames
        .map((name) =>
          activeBranches.find(
            (branch) => normalizeLookupValue(branch.nombre) === normalizeLookupValue(name),
          )?.nombre,
        )
        .filter((name): name is string => Boolean(name));
      const remainingNames = activeBranches
        .map((branch) => branch.nombre)
        .filter(
          (name) =>
            !configuredActiveNames.some(
              (configuredName) => normalizeLookupValue(configuredName) === normalizeLookupValue(name),
            ),
        );
      return [...configuredActiveNames, ...remainingNames];
    },
    [branchCatalog],
  );

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
    const branch = activeBranchNames[0] || getAvailableBranchNames()[0] || 'Tienda principal';
    const branchId = branchCatalog.find(
      (candidate) => normalizeLookupValue(candidate.nombre) === normalizeLookupValue(branch),
    )?.id ?? '';
    const cashier = getDatabaseCashiersForBranch(branchCatalog, branch)[0] || '';
    setModal({
      mode: 'open',
      row: {
        id: nextReadableId(rows, config.idPrefix),
        branchId,
        branch,
        register: getNextShiftRegister(branch, rows),
        cashier,
        openingNio: '',
        openingUsd: '',
        openingCashCountNio: '{}',
        openingCashCountUsd: '{}',
        openingNotes: '',
        status: 'Abierto',
      },
    });
  }

  async function openEditModal(row: CrudRow) {
    if (!row.databaseId) {
      return;
    }
    const detail = await apiRequest<ShiftDetail>(`/shifts/${row.databaseId}`);
    setModal({ mode: 'edit', row: shiftDetailToEditableRow(detail) });
  }

  async function openShiftViewModal(row: CrudRow) {
    if (!row.databaseId) return;
    const detail = await apiRequest<ShiftDetail>(`/shifts/${row.databaseId}`);
    setModal({ mode: 'view', row: shiftDetailToEditableRow(detail) });
  }

  function openCloseModal(row: CrudRow) {
    if (row.databaseId) {
      void onOpenShiftClose(row.databaseId);
    }
  }

  async function saveShift(row: CrudRow, mode: 'open' | 'edit' | 'close') {
    const normalizedRow = normalizeShiftRow(row);
    if (mode === 'open' || mode === 'edit') {
      const openingCounts = {
        NIO: readShiftCashCount(normalizedRow, 'NIO', 'opening'),
        USD: readShiftCashCount(normalizedRow, 'USD', 'opening'),
      };
      const balanceDraft = readShiftBankBalances(normalizedRow, 'opening');
      const accounts = getShiftAccountsForBranch(normalizedRow.branch);
      const selectedBranch = branchCatalog.find(
        (branch) => normalizeLookupValue(branch.nombre) === normalizeLookupValue(normalizedRow.branch),
      );
      if (mode === 'edit' && !normalizedRow.databaseId) {
        throw new Error('El turno no tiene un identificador de base de datos valido.');
      }
      if (mode === 'edit' && normalizedRow.status === 'Cerrado') {
        const closingCounts = {
          NIO: readShiftCashCount(normalizedRow, 'NIO', 'closing'),
          USD: readShiftCashCount(normalizedRow, 'USD', 'closing'),
        };
        const closingBalanceDraft = readShiftBankBalances(normalizedRow, 'closing');
        await apiRequest(`/shifts/${normalizedRow.databaseId}/closed`, {
          method: 'PUT',
          body: JSON.stringify({
            opening: {
              notes: normalizedRow.openingNotes || '',
              counts: {
                NIO: cashCountPayload(openingCounts.NIO).NIO,
                USD: cashCountPayload(openingCounts.USD).USD,
              },
              balances: accounts.map((account) => ({ account: account.alias, amount: parseMoneyValue(balanceDraft[account.id]) })),
            },
            closing: {
              notes: normalizedRow.closingNotes || '',
              changeNio: parseMoneyValue(normalizedRow.changeNio),
              counts: {
                NIO: cashCountPayload(closingCounts.NIO).NIO,
                USD: cashCountPayload(closingCounts.USD).USD,
              },
              balances: accounts.map((account) => ({ account: account.alias, amount: parseMoneyValue(closingBalanceDraft[account.id]) })),
            },
          }),
        });
        await reloadShifts();
        setModal(null);
        announceOperationalDataChange();
        return;
      }
      await apiRequest(mode === 'open' ? '/shifts' : `/shifts/${normalizedRow.databaseId}`, {
        method: mode === 'open' ? 'POST' : 'PUT',
        body: JSON.stringify({
          branchId: selectedBranch?.id || normalizedRow.branchId || undefined,
          branch: normalizedRow.branch,
          register: normalizedRow.register,
          cashier: normalizedRow.cashier,
          notes: normalizedRow.openingNotes || '',
          counts: {
            NIO: cashCountPayload(openingCounts.NIO).NIO,
            USD: cashCountPayload(openingCounts.USD).USD,
          },
          balances: accounts.map((account) => ({ account: account.alias, amount: parseMoneyValue(balanceDraft[account.id]) })),
        }),
      });
      await reloadShifts();
      setModal(null);
      announceOperationalDataChange();
      return;
    }
    throw new Error('El cierre debe realizarse desde el formulario unificado.');
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
            <button type="button" className="secondary-button export-button export-button--excel" onClick={() => exportExcel(config.title, columns, processedRows)}>
              <FileSpreadsheet size={17} />
              Excel
            </button>
            <button type="button" className="secondary-button export-button export-button--pdf" onClick={() => exportPdf(config.title, columns, processedRows)}>
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
                  onDoubleClick={() => void openShiftViewModal(row)}
                >
                  <td className="number-column">{processedRows.length - ((page - 1) * pageSize + index)}</td>
                  {columns.map((column) => (
                    <td key={column.key} className="multi-line-cell">
                      {getCellValue(row, column) || 'Pendiente'}
                    </td>
                  ))}
                  <td>
                    <div className="row-actions">
                      <button type="button" className="icon-action" title="Editar" onClick={(event) => { event.stopPropagation(); void openEditModal(row); }}>
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
          key={`shift-${modal.mode}-${modal.row.databaseId || modal.row.id}`}
          mode={modal.mode}
          row={modal.row}
          shifts={normalizedRows}
          branchCatalog={branchCatalog}
          branchOptions={activeBranchNames.length > 0 ? activeBranchNames : getAvailableBranchNames()}
          onCancel={() => setModal(null)}
          onSave={(row) => saveShift(row, modal.mode === 'view' ? 'edit' : modal.mode)}
          onEdit={modal.mode === 'view' ? () => setModal({ ...modal, mode: 'edit' }) : undefined}
          navigation={modal.mode === 'view' ? {
            currentIndex: normalizedRows.findIndex((shift) => shift.databaseId === modal.row.databaseId),
            total: normalizedRows.length,
            onPrevious: () => {
              const index = normalizedRows.findIndex((shift) => shift.databaseId === modal.row.databaseId);
              if (index > 0) void openShiftViewModal(normalizedRows[index - 1]);
            },
            onNext: () => {
              const index = normalizedRows.findIndex((shift) => shift.databaseId === modal.row.databaseId);
              if (index >= 0 && index < normalizedRows.length - 1) void openShiftViewModal(normalizedRows[index + 1]);
            },
          } : undefined}
        />
      )}
    </section>
  );
}

function ShiftModal({
  mode,
  row,
  shifts,
  branchCatalog,
  branchOptions: availableBranchOptions,
  onCancel,
  onSave,
  onEdit,
  navigation,
}: {
  mode: 'open' | 'edit' | 'close' | 'view';
  row: CrudRow;
  shifts: CrudRow[];
  branchCatalog: BranchCatalogRow[];
  branchOptions: string[];
  onCancel: () => void;
  onSave: (row: CrudRow) => Promise<void>;
  onEdit?: () => void;
  navigation?: ModalRecordNavigation;
}) {
  const [draft, setDraft] = useState(() => normalizeShiftRow(row));
  const [openingCashCounts, setOpeningCashCounts] = useState<Record<CashCurrency, Record<string, CashPileDraft>>>(() => ({
    NIO: readShiftCashCount(row, 'NIO', 'opening'),
    USD: readShiftCashCount(row, 'USD', 'opening'),
  }));
  const [closingCashCounts, setClosingCashCounts] = useState<Record<CashCurrency, Record<string, CashPileDraft>>>(() => ({
    NIO: readShiftCashCount(row, 'NIO', 'closing'),
    USD: readShiftCashCount(row, 'USD', 'closing'),
  }));
  const [openingBankBalances, setOpeningBankBalances] = useState<ShiftBankBalanceDraft>(
    () => readShiftBankBalances(row, 'opening'),
  );
  const [closingBankBalances, setClosingBankBalances] = useState<ShiftBankBalanceDraft>(
    () => readShiftBankBalances(row, 'closing'),
  );
  const [copyShiftId, setCopyShiftId] = useState('');
  const [isCopyingShift, setIsCopyingShift] = useState(false);
  const [copyShiftError, setCopyShiftError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [viewPhase, setViewPhase] = useState<'opening' | 'closing'>('opening');
  const modalRef = useAutoFocusFirstField<HTMLElement>();
  const branchOptions = includeCurrentOptions(availableBranchOptions, draft.branch);
  const cashierOptions = getDatabaseCashiersForBranch(branchCatalog, draft.branch, draft.cashier);
  const isCloseMode = mode === 'close';
  const isReadOnly = mode === 'view';
  const isClosedShift = draft.status === 'Cerrado';
  const showsClosedShiftCarousel = isClosedShift && (isReadOnly || mode === 'edit');
  const title = isCloseMode ? 'Cerrar turno' : isReadOnly ? 'Detalle de turno' : mode === 'edit' ? 'Editar turno' : 'Apertura de turno';
  const openingTotals = {
    NIO: calculateCashPileTotal(cashDenominations.NIO, openingCashCounts.NIO),
    USD: calculateCashPileTotal(cashDenominations.USD, openingCashCounts.USD),
  };
  const shiftAccounts = useMemo(() => getShiftAccountsForBranch(draft.branch), [draft.branch]);
  const copyCandidates = useMemo(
    () =>
      [...shifts]
        .map(normalizeShiftRow)
        .filter(
          (shift) =>
            shift.id !== draft.id &&
            shift.status === 'Cerrado' &&
            getShiftCashierIdentity(shift.cashier) !== getShiftCashierIdentity(draft.cashier),
        )
        .sort((first, second) => second.id.localeCompare(first.id, undefined, { numeric: true })),
    [draft.cashier, draft.id, shifts],
  );
  const selectedCopyShift = copyCandidates.find((shift) => shift.id === copyShiftId);

  function updateField(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateBranch(branch: string) {
    const nextCashiers = getDatabaseCashiersForBranch(branchCatalog, branch);
    const nextAccountIds = new Set(getShiftAccountsForBranch(branch).map((account) => account.id));
    setOpeningBankBalances((current) =>
      Object.fromEntries(Object.entries(current).filter(([accountId]) => nextAccountIds.has(accountId))),
    );
    setDraft((current) => ({
      ...current,
      branch,
      register: mode === 'open' ? getNextShiftRegister(branch, shifts, current.id) : current.register,
      cashier: nextCashiers.includes(current.cashier) ? current.cashier : nextCashiers[0] || '',
    }));
  }

  function updateOpeningCashCount(
    currency: CashCurrency,
    denominationId: string,
    field: 'groups' | 'loose',
    value: string,
  ) {
    const cleanValue = value.replace(/\D/g, '');
    setOpeningCashCounts((current) => ({
      ...current,
      [currency]: {
        ...current[currency],
        [denominationId]: {
          ...current[currency][denominationId],
          [field]: cleanValue,
        },
      },
    }));
  }

  function updateClosingCashCount(
    currency: CashCurrency,
    denominationId: string,
    field: 'groups' | 'loose',
    value: string,
  ) {
    const cleanValue = value.replace(/\D/g, '');
    setClosingCashCounts((current) => ({
      ...current,
      [currency]: {
        ...current[currency],
        [denominationId]: {
          ...current[currency][denominationId],
          [field]: cleanValue,
        },
      },
    }));
  }

  async function copyClosingCashCount() {
    if (!selectedCopyShift) {
      return;
    }
    if (!selectedCopyShift.databaseId) {
      setCopyShiftError('El turno seleccionado no tiene un identificador valido.');
      return;
    }
    setIsCopyingShift(true);
    setCopyShiftError('');
    try {
      const detail = await apiRequest<ShiftDetail>(`/shifts/${selectedCopyShift.databaseId}`);
      const closingCounts = detail.cashCounts.CIERRE_CONTADO ?? detail.cashCounts.ACTUAL;
      const closingDraft = cashDraftFromShiftCounts(closingCounts);
      setOpeningCashCounts({ NIO: closingDraft, USD: closingDraft });

      const copiedBalances: ShiftBankBalanceDraft = {};
      for (const balance of detail.balances) {
        const exactAccount = shiftAccounts.find(
          (account) => normalizeLookupValue(account.alias) === normalizeLookupValue(balance.account),
        );
        const compatibleAccounts = shiftAccounts.filter(
          (account) =>
            normalizeLookupValue(account.entity) === normalizeLookupValue(balance.entity) &&
            normalizeLookupValue(account.currency) === normalizeLookupValue(balance.currency),
        );
        const targetAccount = exactAccount ?? (compatibleAccounts.length === 1 ? compatibleAccounts[0] : undefined);
        if (targetAccount) {
          copiedBalances[targetAccount.id] = String(balance.system ?? balance.calculated ?? balance.initial ?? '0');
        }
      }
      setOpeningBankBalances(copiedBalances);
    } catch (error) {
      setCopyShiftError(error instanceof Error ? error.message : 'No fue posible copiar el cierre seleccionado.');
    } finally {
      setIsCopyingShift(false);
    }
  }

  function updateBankBalance(accountId: string, value: string) {
    const cleanValue = normalizeConsolidationRaw(value);
    if (isCloseMode) {
      setClosingBankBalances((current) => ({ ...current, [accountId]: cleanValue }));
      return;
    }
    setOpeningBankBalances((current) => ({ ...current, [accountId]: cleanValue }));
  }

  function updateClosingBankBalance(accountId: string, value: string) {
    setClosingBankBalances((current) => ({ ...current, [accountId]: normalizeConsolidationRaw(value) }));
  }

  async function saveDraft() {
    setSaveError('');
    setIsSaving(true);
    try {
      await onSave({
        ...draft,
        openingNio: openingTotals.NIO.toFixed(2),
        openingUsd: openingTotals.USD.toFixed(2),
        openingCashCountNio: serializeTransactionCashCount(openingCashCounts.NIO),
        openingCashCountUsd: serializeTransactionCashCount(openingCashCounts.USD),
        closingCashCountNio: serializeTransactionCashCount(closingCashCounts.NIO),
        closingCashCountUsd: serializeTransactionCashCount(closingCashCounts.USD),
        openingBankBalances: serializeShiftBankBalances(openingBankBalances),
        closingBankBalances: serializeShiftBankBalances(closingBankBalances),
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'No fue posible guardar el turno.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      {navigation && <ModalRecordNavigator {...navigation} />}
      <section className="modal-panel transaction-modal-panel" ref={modalRef}>
        <div className="modal-header">
          <div>
            <p>{isCloseMode ? 'Cierre operativo' : isReadOnly ? 'Vista operativa' : 'Apertura operativa'}</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button close-button" onClick={onCancel} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="form-grid shift-form-grid">
          <label className="form-field shift-form-id">
            ID
            <input value={draft.id} disabled />
          </label>
          <label className="form-field shift-form-branch">
            Sucursal
            <select value={draft.branch} onChange={(event) => updateBranch(event.target.value)} disabled={isCloseMode || isReadOnly || isClosedShift}>
              {branchOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="form-field shift-form-register">
            Caja
            <input value={draft.register} disabled aria-label="Caja asignada automaticamente" />
          </label>
          <label className="form-field shift-form-cashier">
            Cajero
            <select value={draft.cashier} onChange={(event) => updateField('cashier', event.target.value)} disabled={isCloseMode || isReadOnly || isClosedShift}>
              {cashierOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          {!isCloseMode && !showsClosedShiftCarousel && (
            <section className="shift-opening-cash-section">
              <div className="shift-opening-cash-heading">
                <div>
                  <span>Saldo inicial</span>
                  <h3>Arqueo de apertura</h3>
                </div>
                {mode === 'open' && (
                  <div className="shift-copy-cash">
                    <label>
                      Copiar desde un turno cerrado
                      <select value={copyShiftId} onChange={(event) => setCopyShiftId(event.target.value)}>
                        <option value="">Seleccione un turno</option>
                        {copyCandidates.map((shift) => (
                          <option key={shift.id} value={shift.id}>
                            {shift.id} · {shift.cashier} · {shift.branch} · {shift.closedAt.split('\n')[0]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="secondary-button shift-copy-cash__button"
                      disabled={!selectedCopyShift || isCopyingShift}
                      onClick={() => void copyClosingCashCount()}
                    >
                      <Copy size={16} />
                      {isCopyingShift ? 'Copiando...' : 'Copiar cierre'}
                    </button>
                  </div>
                )}
              </div>
              {copyShiftError && <p className="form-submit-error" role="alert">{copyShiftError}</p>}
              {mode === 'open' && copyCandidates.length === 0 && (
                <p className="shift-copy-cash__empty">No hay turnos cerrados de otro cajero disponibles.</p>
              )}
              <div className="shift-opening-cash-grid">
                <TransactionCashCountTable
                  currency="NIO"
                  denominations={cashDenominations.NIO}
                  focusScope="shift-opening"
                  pileDrafts={openingCashCounts.NIO}
                  conversionRate={parseExchangeRate(readExchangeRate().buy)}
                  readOnly={isReadOnly}
                  showConvertedTotal={false}
                  nextFocusSelector={'[data-cash-scope="shift-opening"][data-cash-currency="USD"][data-cash-row="0"][data-cash-column="0"]'}
                  onPileFieldChange={(denominationId, field, value) =>
                    updateOpeningCashCount('NIO', denominationId, field, value)}
                />
                <div className="shift-cash-view-side">
                  <TransactionCashCountTable
                    currency="USD"
                    denominations={cashDenominations.USD}
                    focusScope="shift-opening"
                    pileDrafts={openingCashCounts.USD}
                    conversionRate={parseExchangeRate(readExchangeRate().buy)}
                    readOnly={isReadOnly}
                    showConvertedTotal={false}
                    nextFocusSelector='[data-shift-balance-phase="opening"][data-shift-balance-currency="NIO"][data-shift-balance-row="0"]'
                    onPileFieldChange={(denominationId, field, value) =>
                      updateOpeningCashCount('USD', denominationId, field, value)}
                  />
                </div>
              </div>
              <ShiftBankBalanceTables
                accounts={shiftAccounts}
                balances={openingBankBalances}
                phase="opening"
                readOnly={isReadOnly}
                nextFocusSelectors={{
                  NIO: '[data-shift-balance-phase="opening"][data-shift-balance-currency="USD"][data-shift-balance-row="0"]',
                  USD: '[data-shift-observations="opening"]',
                }}
                onBalanceChange={updateBankBalance}
              />
            </section>
          )}
          {showsClosedShiftCarousel && (
            <section className="shift-view-carousel-section">
              <div className={`shift-view-carousel__track ${viewPhase === 'closing' ? 'shift-view-carousel__track--closing' : ''}`}>
                <div
                  className="shift-view-carousel__slide"
                  aria-hidden={viewPhase !== 'opening'}
                  ref={(element) => {
                    if (!element) return;
                    if (viewPhase !== 'opening') element.setAttribute('inert', '');
                    else element.removeAttribute('inert');
                  }}
                >
                  <div className="shift-opening-cash-heading">
                    <div>
                      <span>Saldo inicial</span>
                      <h3>Arqueo de apertura</h3>
                    </div>
                  </div>
                  <div className="shift-opening-cash-grid">
                    <TransactionCashCountTable
                      currency="NIO"
                      denominations={cashDenominations.NIO}
                      focusScope="shift-view-opening"
                      pileDrafts={openingCashCounts.NIO}
                      conversionRate={parseExchangeRate(readExchangeRate().buy)}
                      readOnly={isReadOnly}
                      showConvertedTotal={false}
                      nextFocusSelector={'[data-cash-scope="shift-view-opening"][data-cash-currency="USD"][data-cash-row="0"][data-cash-column="0"]'}
                      onPileFieldChange={(denominationId, field, value) => updateOpeningCashCount('NIO', denominationId, field, value)}
                    />
                    <div className="shift-cash-view-side">
                      <TransactionCashCountTable
                        currency="USD"
                        denominations={cashDenominations.USD}
                        focusScope="shift-view-opening"
                        pileDrafts={openingCashCounts.USD}
                        conversionRate={parseExchangeRate(readExchangeRate().buy)}
                        readOnly={isReadOnly}
                        showConvertedTotal={false}
                        nextFocusSelector='[data-shift-balance-phase="opening"][data-shift-balance-currency="NIO"][data-shift-balance-row="0"]'
                        onPileFieldChange={(denominationId, field, value) => updateOpeningCashCount('USD', denominationId, field, value)}
                      />
                      <button type="button" className="secondary-button shift-phase-toggle" onClick={() => setViewPhase('closing')}>
                        Cierre
                        <ChevronRight size={18} />
                      </button>
                    </div>
                  </div>
                  <ShiftBankBalanceTables
                    accounts={shiftAccounts}
                    balances={openingBankBalances}
                    phase="opening"
                    readOnly={isReadOnly}
                    nextFocusSelectors={{
                      NIO: '[data-shift-balance-phase="opening"][data-shift-balance-currency="USD"][data-shift-balance-row="0"]',
                      USD: '[data-shift-observations="opening"]',
                    }}
                    onBalanceChange={updateBankBalance}
                  />
                  {isReadOnly ? draft.openingNotes && <p className="shift-view-note">{draft.openingNotes}</p> : (
                    <label className="form-field shift-form-notes">Observaciones de apertura<textarea data-shift-observations="opening" value={draft.openingNotes} rows={2} onChange={(event) => updateField('openingNotes', event.target.value)} /></label>
                  )}
                </div>

                <div
                  className="shift-view-carousel__slide"
                  aria-hidden={viewPhase !== 'closing'}
                  ref={(element) => {
                    if (!element) return;
                    if (viewPhase !== 'closing') element.setAttribute('inert', '');
                    else element.removeAttribute('inert');
                  }}
                >
                  <div className="shift-opening-cash-heading">
                    <div>
                      <span>Saldo final</span>
                      <h3>Arqueo de cierre</h3>
                    </div>
                  </div>
                  <div className="shift-opening-cash-grid">
                    <TransactionCashCountTable
                      currency="NIO"
                      denominations={cashDenominations.NIO}
                      focusScope="shift-view-closing"
                      pileDrafts={closingCashCounts.NIO}
                      conversionRate={parseExchangeRate(readExchangeRate().buy)}
                      readOnly={isReadOnly}
                      showConvertedTotal={false}
                      nextFocusSelector={'[data-cash-scope="shift-view-closing"][data-cash-currency="USD"][data-cash-row="0"][data-cash-column="0"]'}
                      onPileFieldChange={(denominationId, field, value) => updateClosingCashCount('NIO', denominationId, field, value)}
                    />
                    <div className="shift-cash-view-side">
                      <TransactionCashCountTable
                        currency="USD"
                        denominations={cashDenominations.USD}
                        focusScope="shift-view-closing"
                        pileDrafts={closingCashCounts.USD}
                        conversionRate={parseExchangeRate(readExchangeRate().buy)}
                        readOnly={isReadOnly}
                        showConvertedTotal={false}
                        nextFocusSelector='[data-shift-balance-phase="closing"][data-shift-balance-currency="NIO"][data-shift-balance-row="0"]'
                        onPileFieldChange={(denominationId, field, value) => updateClosingCashCount('USD', denominationId, field, value)}
                      />
                      <div className="shift-closing-change">
                        <span>Cambio al cierre</span>
                        {isReadOnly ? (
                          <strong>{formatCashCountMoney(Number.parseFloat(draft.changeNio) || 0, 'NIO')}</strong>
                        ) : (
                          <span className="cash-change-entry"><span>C$</span><input value={formatAccountingMoneyInput(draft.changeNio)} inputMode="decimal" onChange={(event) => updateField('changeNio', normalizeSignedAccountingMoneyRaw(event.target.value))} onFocus={(event) => placeAccountingMoneyCaretBeforeDecimals(event.currentTarget)} onClick={(event) => placeAccountingMoneyCaretBeforeDecimals(event.currentTarget)} /></span>
                        )}
                      </div>
                      <button type="button" className="secondary-button shift-phase-toggle shift-phase-toggle--opening" onClick={() => setViewPhase('opening')}>
                        <ChevronLeft size={18} />
                        Apertura
                      </button>
                    </div>
                  </div>
                  <ShiftBankBalanceTables
                    accounts={shiftAccounts}
                    balances={closingBankBalances}
                    openingBalances={openingBankBalances}
                    phase="closing"
                    readOnly={isReadOnly}
                    nextFocusSelectors={{
                      NIO: '[data-shift-balance-phase="closing"][data-shift-balance-currency="USD"][data-shift-balance-row="0"]',
                      USD: '[data-shift-observations="closing"]',
                    }}
                    onBalanceChange={updateClosingBankBalance}
                  />
                  {isReadOnly ? draft.closingNotes && <p className="shift-view-note">{draft.closingNotes}</p> : (
                    <label className="form-field shift-form-notes">Observaciones de cierre<textarea data-shift-observations="closing" value={draft.closingNotes} rows={2} onChange={(event) => updateField('closingNotes', event.target.value)} /></label>
                  )}
                </div>
              </div>
            </section>
          )}
          {isCloseMode && (
            <div className="shift-opening-summary">
              <span>Saldo inicial del turno</span>
              <strong>{formatCashCountMoney(Number.parseFloat(draft.openingNio) || 0, 'NIO')}</strong>
              <strong>{formatCashCountMoney(Number.parseFloat(draft.openingUsd) || 0, 'USD')}</strong>
            </div>
          )}
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
          {isCloseMode && (
            <section className="shift-bank-balance-section">
              <div>
                <span>Saldos por banco</span>
                <h3>Cierre del turno</h3>
              </div>
              <ShiftBankBalanceTables
                accounts={shiftAccounts}
                balances={closingBankBalances}
                openingBalances={openingBankBalances}
                phase="closing"
                onBalanceChange={updateBankBalance}
              />
            </section>
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
          {!showsClosedShiftCarousel && <label className="form-field form-field--wide shift-form-notes">
            Observaciones
            <textarea
              data-shift-observations={isCloseMode ? 'closing' : 'opening'}
              value={isCloseMode ? draft.closingNotes : draft.openingNotes}
              rows={3}
              onChange={(event) => updateField(isCloseMode ? 'closingNotes' : 'openingNotes', event.target.value)}
              disabled={isReadOnly}
            />
          </label>}
        </div>

        <div className="modal-actions">
          {saveError && <p className="form-submit-error" role="alert">{saveError}</p>}
          <button type="button" className="secondary-button danger-button" onClick={onCancel}>
            <X size={17} />
            {isReadOnly ? 'Cerrar' : 'Cancelar'}
          </button>
          {isReadOnly && onEdit && (
            <button type="button" className="primary-button" onClick={onEdit}>
              <Edit3 size={17} />
              Editar
            </button>
          )}
          {!isReadOnly && (
            <button type="button" className="primary-button" onClick={() => void saveDraft()} disabled={isSaving}>
              <Save size={17} />
              {isSaving ? 'Guardando...' : 'Guardar'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function ShiftBankBalanceTables({
  accounts,
  balances,
  openingBalances = {},
  phase,
  readOnly = false,
  nextFocusSelectors = {},
  onBalanceChange,
}: {
  accounts: CrudRow[];
  balances: ShiftBankBalanceDraft;
  openingBalances?: ShiftBankBalanceDraft;
  phase: 'opening' | 'closing';
  readOnly?: boolean;
  nextFocusSelectors?: Partial<Record<CashCurrency, string>>;
  onBalanceChange: (accountId: string, value: string) => void;
}) {
  function focusBalanceInput(phaseValue: 'opening' | 'closing', currency: CashCurrency, rowIndex: number) {
    window.setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(
        `[data-shift-balance-phase="${phaseValue}"][data-shift-balance-currency="${currency}"][data-shift-balance-row="${rowIndex}"]`,
      );
      input?.focus();
      input?.select();
    }, 0);
  }

  function focusNextBalanceSection(currency: CashCurrency) {
    const selector = nextFocusSelectors[currency];
    if (!selector) return false;
    window.setTimeout(() => {
      const input = document.querySelector<HTMLElement>(selector);
      input?.focus();
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) input.select();
    }, 0);
    return true;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, accountId: string, currency: CashCurrency, rowIndex: number, rowCount: number) {
    const nextValue = getAccountingMoneyKeyValue(event, balances[accountId]);
    if (nextValue !== undefined) {
      event.preventDefault();
      if (nextValue !== null) {
        onBalanceChange(accountId, nextValue);
        queueAccountingMoneyCaret(event, nextValue);
      }
      return;
    }

    const goNext = () => rowIndex < rowCount - 1
      ? (focusBalanceInput(phase, currency, rowIndex + 1), true)
      : focusNextBalanceSection(currency);
    const goPrevious = () => rowIndex > 0 && (focusBalanceInput(phase, currency, rowIndex - 1), true);

    if (event.key === 'Enter' || event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      goNext();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      goPrevious();
    } else if (event.key === 'Tab') {
      const moved = event.shiftKey ? goPrevious() : goNext();
      if (moved) event.preventDefault();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>, accountId: string) {
    event.preventDefault();
    onBalanceChange(accountId, event.clipboardData.getData('text'));
  }

  return (
    <div className="shift-bank-balance-grid">
      {(['NIO', 'USD'] as CashCurrency[]).map((currency) => {
        const currencyAccounts = accounts.filter((account) => account.currency === currency);
        const total = currencyAccounts.reduce(
          (sum, account) => sum + parseConsolidationValue(balances[account.id]),
          0,
        );
        return (
          <section
            className={`shift-bank-balance-card shift-bank-balance-card--${currency.toLowerCase()}`}
            key={currency}
          >
            <div className="shift-bank-balance-card__header">
              <strong>{currency === 'NIO' ? 'Saldos en Cordobas (NIO)' : 'Saldos en Dolares (USD)'}</strong>
              <span>{formatCashCountMoney(total, currency)}</span>
            </div>
            <table className={`shift-bank-balance-table shift-bank-balance-table--${phase}`}>
              <colgroup>
                <col className="shift-bank-balance-col-account" />
                {phase === 'closing' && <col className="shift-bank-balance-col-opening" />}
                <col className="shift-bank-balance-col-value" />
              </colgroup>
              <thead>
                <tr>
                  <th>Banco / Cuenta</th>
                  {phase === 'closing' && <th>Inicial</th>}
                  <th>{phase === 'opening' ? 'Saldo inicial' : 'Saldo cierre'}</th>
                </tr>
              </thead>
              <tbody>
                {currencyAccounts.map((account, rowIndex) => (
                  <tr key={account.id}>
                    <td>
                      <strong>{account.entity}</strong>
                      <small>{account.alias}</small>
                    </td>
                    {phase === 'closing' && (
                      <td className="shift-bank-balance-table__readonly">
                        {formatCashCountMoney(parseConsolidationValue(openingBalances[account.id]), currency)}
                      </td>
                    )}
                    <td>
                      <div className="consolidation-input-wrap">
                        <span>{getCurrencySymbol(currency)}</span>
                        <input
                          aria-label={`${phase === 'opening' ? 'Saldo inicial' : 'Saldo cierre'} ${account.alias}`}
                          className="consolidation-input"
                          data-shift-balance-currency={currency}
                          data-shift-balance-phase={phase}
                          data-shift-balance-row={rowIndex}
                          inputMode="decimal"
                          value={formatConsolidationInput(balances[account.id])}
                          readOnly={readOnly}
                          onChange={(event) => onBalanceChange(account.id, event.target.value)}
                          onKeyDown={(event) => handleKeyDown(event, account.id, currency, rowIndex, currencyAccounts.length)}
                          onPaste={(event) => handlePaste(event, account.id)}
                          onFocus={(event) => placeAccountingMoneyCaretBeforeDecimals(event.currentTarget)}
                          onClick={(event) => placeAccountingMoneyCaretBeforeDecimals(event.currentTarget)}
                          placeholder="0.00"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {currencyAccounts.length === 0 && (
                  <tr>
                    <td colSpan={phase === 'closing' ? 3 : 2} className="shift-bank-balance-table__empty">
                      Sin cuentas asociadas
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={phase === 'closing' ? 2 : 1}>Total</td>
                  <td>{formatCashCountMoney(total, currency)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function TransactionTable({ config, currentUser }: { config: CrudConfig; currentUser: AuthUser }) {
  const [rows, setRows] = useState<CrudRow[]>([]);
  const [currentShift, setCurrentShift] = useState<ShiftDetail | null>(null);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [currencyFilter, setCurrencyFilter] = useState<'NIO' | 'USD' | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>('id');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: ModalMode | 'view' | 'pay'; row: CrudRow } | null>(null);
  const [showExchangeCalculator, setShowExchangeCalculator] = useState(false);
  const [showDirectoryLookup, setShowDirectoryLookup] = useState(false);
  const [isSavingTransactions, setIsSavingTransactions] = useState(false);
  const [transactionSaveError, setTransactionSaveError] = useState('');
  const isBoss = currentUser.roleCode === 'JEFA';
  const columns = useMemo(
    () => getVisibleColumns(config).filter((column) => isBoss || column.key !== 'operatorBranch'),
    [config, isBoss],
  );
  const normalizedRows = useMemo(() => rows.map(normalizeTransactionRow), [rows]);

  async function reloadTransactions() {
    const databaseRows = await apiRequest<TransactionApiRow[]>('/transactions?limit=200');
    setRows(databaseRows.map(mapApiTransactionRow));
  }

  useEffect(() => {
    let cancelled = false;
    setRows([]);
    Promise.all([
      apiRequest<TransactionApiRow[]>('/transactions?limit=200'),
      apiRequest<ShiftDetail | null>('/shifts/current'),
    ])
      .then(([databaseRows, shift]) => {
        if (!cancelled) {
          setRows(databaseRows.map(mapApiTransactionRow));
          setCurrentShift(shift);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRows([]);
          setCurrentShift(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser.id]);

  useOperationalRefresh(async () => {
    const [databaseRows, shift] = await Promise.all([
      apiRequest<TransactionApiRow[]>('/transactions?limit=200'),
      apiRequest<ShiftDetail | null>('/shifts/current'),
    ]);
    setRows(databaseRows.map(mapApiTransactionRow));
    setCurrentShift(shift);
  }, !modal && !isSavingTransactions);

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
    const entity = [...new Set(currentShift?.availableAccounts.map((account) => account.entity) ?? [])][0] || '';
    setShowExchangeCalculator(false);
    setTransactionSaveError('');
    setModal({
      mode: 'create',
      row: {
        id: nextReadableId(rows, config.idPrefix),
        registeredAt: '',
        entity,
        movementCode: '',
        movement: '',
        direction: '',
        currency: 'NIO',
        amountValue: '',
        pendingName: '',
        description: '',
        cashCountNio: '{}',
        cashCountUsd: '{}',
        changeCashCountNio: '{}',
        changeCashCountUsd: '{}',
        exchangeRateType: 'Compra',
        exchangeRateValue: formatRateDisplay(readExchangeRate().buy),
        changeExchangeRateType: 'Venta',
        changeExchangeRateValue: formatRateDisplay(readExchangeRate().sell),
        status: 'Registrada',
      },
    });
  }

  async function openTransactionModal(row: CrudRow, mode: 'edit' | 'view') {
    setTransactionSaveError('');
    try {
      const detail = await apiRequest<TransactionDetailApi>(`/transactions/${row.databaseId}/detail`);
      setModal({ mode, row: mapApiTransactionDetail(detail) });
    } catch (error) {
      setTransactionSaveError(
        error instanceof Error ? error.message : 'No fue posible cargar la transaccion.',
      );
    }
  }

  async function openPendingPayment(row: CrudRow) {
    setTransactionSaveError('');
    try {
      const detail = await apiRequest<TransactionDetailApi>(`/transactions/${row.databaseId}/detail`);
      const paymentRow = mapApiTransactionDetail(detail);
      if (!isPayableTransaction(paymentRow)) {
        setTransactionSaveError('La transaccion no tiene un pendiente disponible para liquidar.');
        return;
      }
      setModal({ mode: 'pay', row: preparePendingPaymentRow(paymentRow) });
    } catch (error) {
      setTransactionSaveError(
        error instanceof Error ? error.message : 'No fue posible abrir la liquidacion del pendiente.',
      );
    }
  }

  async function saveTransactions(transactionRows: CrudRow[]) {
    const registeredAt = formatTransactionDateTime(new Date());
    const rowsToSave: CrudRow[] = transactionRows.map((row): CrudRow => {
      const normalizedRow = normalizeTransactionRow(row);
      const direction = getTransactionMovementDirection(normalizedRow.entity, normalizedRow.movement);
      return {
        ...normalizedRow,
        direction,
        registeredAt: modal?.mode === 'create' ? registeredAt : normalizedRow.registeredAt,
        amount: formatTransactionMoney({ ...normalizedRow, direction }),
        pendingName: normalizedRow.pendingName.trim(),
      };
    });

    if (modal?.mode === 'pay') {
      const paymentRow = rowsToSave[0];
      if (!paymentRow.pendingDatabaseId) {
        setTransactionSaveError('La transaccion no tiene un pendiente valido para liquidar.');
        return;
      }
      setIsSavingTransactions(true);
      setTransactionSaveError('');
      try {
        const payload = buildTransactionBatchPayload(rowsToSave);
        await apiRequest(`/transactions/pending/${paymentRow.pendingDatabaseId}/pay`, {
          method: 'POST',
          body: JSON.stringify({ rates: payload.rates, settlement: payload.settlement }),
        });
        await reloadTransactions();
        setModal(null);
        announceOperationalDataChange();
      } catch (error) {
        setTransactionSaveError(
          error instanceof Error ? error.message : 'No fue posible liquidar el pendiente.',
        );
      } finally {
        setIsSavingTransactions(false);
      }
      return;
    }

    if (modal?.mode !== 'create') {
      const rowToSave = rowsToSave[0];
      if (!rowToSave.databaseId) {
        setTransactionSaveError('La transaccion no tiene un identificador valido para guardar los cambios.');
        return;
      }
      setIsSavingTransactions(true);
      setTransactionSaveError('');
      try {
        const batchPayload = buildTransactionBatchPayload(rowsToSave);
        await apiRequest(`/transactions/${rowToSave.databaseId}`, {
          method: 'PUT',
          body: JSON.stringify({
            entityCode: rowToSave.entity,
            movementCode: rowToSave.movementCode,
            currencyCode: rowToSave.currency === 'USD' ? 'USD' : 'NIO',
            amount: parseMoneyValue(rowToSave.amountValue),
            pendingName: rowToSave.pendingName,
            description: rowToSave.description,
            rates: batchPayload.rates,
            settlement: batchPayload.settlement,
          }),
        });
        await reloadTransactions();
        setModal(null);
        announceOperationalDataChange();
      } catch (error) {
        setTransactionSaveError(
          error instanceof Error
            ? error.message
            : 'No fue posible actualizar la transaccion.',
        );
      } finally {
        setIsSavingTransactions(false);
      }
      return;
    }

    setIsSavingTransactions(true);
    setTransactionSaveError('');
    try {
      const created = await apiRequest<CreatedTransactionBatch>('/transactions/batch', {
        method: 'POST',
        body: JSON.stringify(buildTransactionBatchPayload(rowsToSave)),
      });
      const databaseRows = created.transactions.map((transaction, index) => {
        const source = rowsToSave[index];
        const readableId = `TRA-${String(created.operationCode).padStart(6, '0')}-${String(transaction.order).padStart(2, '0')}`;
        return normalizeTransactionRow({
          ...source,
          id: readableId,
          databaseId: transaction.id,
          transactionGroupId: created.groupId,
          transactionGroupOrder: String(transaction.order),
          registeredAt: coerceTransactionDateTime(created.createdAt),
          entity: transaction.entityCode,
          movementCode: transaction.movementCode,
          movement: transaction.movement,
          direction: transaction.direction === 'SALE' ? 'Salida' : 'Ingreso',
          currency: transaction.currencyCode,
          amountValue: String(transaction.amount),
          pendingName: transaction.pendingName,
          description: transaction.description,
          status: 'Registrada',
        });
      });
      setRows((currentRows) => [...currentRows, ...databaseRows]);
      setModal(null);
      announceOperationalDataChange();
    } catch (error) {
      setTransactionSaveError(
        error instanceof Error
          ? error.message
          : 'No fue posible guardar las transacciones.',
      );
    } finally {
      setIsSavingTransactions(false);
    }
  }

  async function toggleVoid(row: CrudRow) {
    if (row.status !== 'Anulada' && !await requestSystemConfirm(`La transaccion ${row.id} quedara anulada y sus movimientos seran revertidos.`, { title:'Anular transaccion', confirmLabel:'Anular', tone:'danger' })) {
      return;
    }
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
                className={`currency-filter__button currency-filter__button--nio ${currencyFilter === 'NIO' ? 'currency-filter__button--active' : ''}`}
                onClick={() => setCurrencyFilter((current) => (current === 'NIO' ? null : 'NIO'))}
                title="Filtrar transacciones en cordobas"
              >
                C$
              </button>
              <button
                type="button"
                className={`currency-filter__button currency-filter__button--usd ${currencyFilter === 'USD' ? 'currency-filter__button--active' : ''}`}
                onClick={() => setCurrencyFilter((current) => (current === 'USD' ? null : 'USD'))}
                title="Filtrar transacciones en dolares"
              >
                $
              </button>
            </div>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowExchangeCalculator((current) => !current)}
            >
              <Calculator size={17} />
              Cambio
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowDirectoryLookup((current) => !current)}
            >
              <BookUser size={17} />
              Directorio
            </button>
            <button type="button" className="secondary-button export-button export-button--excel" onClick={() => exportExcel(config.title, columns, processedRows)}>
              <FileSpreadsheet size={17} />
              Excel
            </button>
            <button type="button" className="secondary-button export-button export-button--pdf" onClick={() => exportPdf(config.title, columns, processedRows)}>
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
                  onDoubleClick={() => void openTransactionModal(row, 'view')}
                >
                  <td className="number-column">{processedRows.length - ((page - 1) * pageSize + index)}</td>
                  <td>{row.id}</td>
                  <td>{row.registeredAt}</td>
                  <td>{row.entity}</td>
                  <td className="multi-line-cell transaction-movement-cell">
                    <strong>{row.movement || 'Movimiento no disponible'}</strong>
                    <small>{row.movementCode || '---'}</small>
                  </td>
                  <td>
                    <span className={`transaction-amount transaction-amount--${row.direction === 'Salida' ? 'out' : 'in'}`}>
                      {row.direction === 'Salida' ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                      <span>{formatTransactionMoney(row)}</span>
                    </span>
                  </td>
                  <td>{row.pendingName || '----'}</td>
                  {isBoss && <td className="multi-line-cell transaction-operator-cell">{row.operatorBranch}</td>}
                  <td>
                    <div className="row-actions">
                      <button type="button" className="icon-action" title="Editar" onClick={(event) => { event.stopPropagation(); void openTransactionModal(row, 'edit'); }}>
                        <Edit3 size={16} />
                      </button>
                      {isPayableTransaction(row) && (
                        <button
                          type="button"
                          className="icon-action pending-pay-button"
                          title="Liquidar pendiente"
                          onClick={(event) => { event.stopPropagation(); void openPendingPayment(row); }}
                        >
                          <CheckCircle2 size={16} />
                        </button>
                      )}
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
          key={`transaction-${modal.mode}-${modal.row.databaseId || modal.row.id}`}
          mode={modal.mode}
          row={modal.row}
          availableAccounts={currentShift?.availableAccounts ?? []}
          availableMovements={currentShift?.availableMovements ?? []}
          isSaving={isSavingTransactions}
          saveError={transactionSaveError}
          onCancel={() => {
            if (!isSavingTransactions) {
              setModal(null);
            }
          }}
          onSave={saveTransactions}
          onEdit={modal.mode === 'view' ? () => setModal({ mode: 'edit', row: modal.row }) : undefined}
          onPay={modal.mode === 'view' && isPayableTransaction(modal.row)
            ? () => void openPendingPayment(modal.row)
            : undefined}
          navigation={modal.mode === 'view' ? {
            currentIndex: processedRows.findIndex((transaction) => transaction.databaseId === modal.row.databaseId),
            total: processedRows.length,
            onPrevious: () => {
              const index = processedRows.findIndex((transaction) => transaction.databaseId === modal.row.databaseId);
              if (index > 0) void openTransactionModal(processedRows[index - 1], 'view');
            },
            onNext: () => {
              const index = processedRows.findIndex((transaction) => transaction.databaseId === modal.row.databaseId);
              if (index >= 0 && index < processedRows.length - 1) void openTransactionModal(processedRows[index + 1], 'view');
            },
          } : undefined}
        />
      )}

      {showExchangeCalculator && <ExchangeCalculator onClose={() => setShowExchangeCalculator(false)} />}
      {showDirectoryLookup && <DirectoryLookup onClose={() => setShowDirectoryLookup(false)} />}

    </section>
  );
}

function TransactionModal({
  mode,
  row,
  availableAccounts = [],
  availableMovements = [],
  isSaving,
  saveError,
  onCancel,
  onSave,
  onEdit,
  onPay,
  navigation,
}: {
  mode: ModalMode | 'view' | 'pay';
  row: CrudRow;
  availableAccounts?: ShiftDetail['availableAccounts'];
  availableMovements?: ShiftDetail['availableMovements'];
  isSaving: boolean;
  saveError: string;
  onCancel: () => void;
  onSave: (rows: CrudRow[]) => Promise<void>;
  onEdit?: () => void;
  onPay?: () => void;
  navigation?: ModalRecordNavigation;
}) {
  const isReadOnly = mode === 'view';
  const isPayment = mode === 'pay';
  const isTransactionLocked = isReadOnly || isPayment;
  const initialDraft = useMemo(() => normalizeTransactionRow(row), [row]);
  const [drafts, setDrafts] = useState<CrudRow[]>(() => [initialDraft]);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const draft = drafts[activeTabIndex] ?? drafts[0];
  const transactionGroupIdRef = useRef(
    row.transactionGroupId || `GRP-${Date.now().toString(36).toUpperCase()}`,
  );
  // Cada borrador conserva sus propios arqueos al cambiar entre pestañas.
  const cashCounts: Record<CashCurrency, Record<string, CashPileDraft>> = {
    NIO: readTransactionCashCount(draft.cashCountNio),
    USD: readTransactionCashCount(draft.cashCountUsd),
  };
  const changeCashCounts: Record<CashCurrency, Record<string, CashPileDraft>> = {
    NIO: readTransactionCashCount(draft.changeCashCountNio),
    USD: readTransactionCashCount(draft.changeCashCountUsd),
  };
  const [cashView, setCashView] = useState<'received' | 'change'>('received');
  const [showExchangeCalculator, setShowExchangeCalculator] = useState(false);
  const [showDirectoryLookup, setShowDirectoryLookup] = useState(false);
  const modalRef = useAutoFocusFirstField<HTMLElement>();
  const restrictToShiftAccounts = mode === 'create';
  const entityOptions = restrictToShiftAccounts
    ? [...new Set(availableAccounts.map((account) => account.entity))]
    : includeCurrentOptions(getActiveEntities(), draft.entity);
  const entityCurrencies = new Set(
    availableAccounts
      .filter((account) => normalizeLookupValue(account.entity) === normalizeLookupValue(draft.entity))
      .map((account) => account.currency),
  );
  const movementRows = (restrictToShiftAccounts
    ? availableMovements
        .filter((movement) => normalizeLookupValue(movement.entity) === normalizeLookupValue(draft.entity))
        .map((movement) => ({
          id: `${movement.entity}-${movement.code}`,
          code: movement.code,
          name: movement.name,
          direction: movement.direction,
          banks: movement.entity,
          currencies: movement.currencies.join(', '),
          status: 'Activo',
        }))
    : getMovementRowsForEntity(draft.entity)
  ).filter((movement) =>
    !restrictToShiftAccounts ||
    getMovementCurrencies(movement).some((currency) => entityCurrencies.has(currency)),
  );
  const movementOptions = movementRows.map((movement) => movement.name).filter(Boolean);
  const movementCodeQuery = draft.movementCode.trim().toUpperCase();
  const movementCodeSuggestions = movementRows.filter((movement) =>
    !movementCodeQuery || movement.code.toUpperCase().includes(movementCodeQuery),
  );
  // El codigo es la referencia estable; el nombre se usa como respaldo para registros antiguos.
  const selectedMovement = movementRows.find(
    (movement) => normalizeLookupValue(movement.code) === normalizeLookupValue(draft.movementCode),
  ) ?? movementRows.find(
    (movement) => normalizeLookupValue(movement.name) === normalizeLookupValue(draft.movement),
  );
  const allowedCurrencies = getMovementCurrencies(selectedMovement).filter(
    (currency) => !restrictToShiftAccounts || entityCurrencies.has(currency),
  );
  const expectedAmount = parseMoneyValue(draft.amountValue);
  const hasIncompleteTransactions = drafts.some(
    (transactionDraft) =>
      !transactionDraft.movement ||
      !transactionDraft.direction ||
      parseMoneyValue(transactionDraft.amountValue) <= 0,
  );
  const [exchangeRate] = useState<ExchangeRate>(() => {
    const current = readExchangeRate();
    return {
      buy: row.exchangeRateBuy || current.buy,
      sell: row.exchangeRateSell || current.sell,
    };
  });
  const cashTotals = {
    NIO: calculateCashPileTotal(cashDenominations.NIO, cashCounts.NIO),
    USD: calculateCashPileTotal(cashDenominations.USD, cashCounts.USD),
  };
  const customerBalanceSteps = calculateTransactionCustomerBalanceSteps(drafts, exchangeRate);
  const activeBalanceStep = customerBalanceSteps[activeTabIndex];
  const activeRate = activeBalanceStep?.rateValue || 1;
  const activeBalanceBeforeChangeNio = normalizeTransactionRounding(
    activeBalanceStep?.balanceBeforeChangeNio || 0,
  );
  const transactionDifference = {
    differenceNio: activeBalanceBeforeChangeNio,
    differenceUsd: activeBalanceBeforeChangeNio / activeRate,
    rateKind: activeBalanceStep?.rateKind || 'Compra' as ExchangeRateKind,
    rateValue: activeRate,
  };
  const [changeRateKind, setChangeRateKind] = useState<ExchangeRateKind>(() =>
    draft.changeExchangeRateType === 'Compra' || draft.changeExchangeRateType === 'Venta'
      ? draft.changeExchangeRateType
      : invertExchangeRateKind(transactionDifference.rateKind),
  );
  const changeRateValue = getTransactionRateValue(exchangeRate, changeRateKind);
  const hasPositiveChange = transactionDifference.differenceNio > 0.005;
  const expectedChange = {
    NIO: Math.max(0, transactionDifference.differenceNio),
    USD: Math.max(0, transactionDifference.differenceNio / (changeRateValue || 1)),
  };
  const rawTotalGroupBalanceNio = customerBalanceSteps[customerBalanceSteps.length - 1]?.balanceNio || 0;
  const totalGroupBalanceNio = normalizeTransactionRounding(rawTotalGroupBalanceNio);
  const totalGroupBalanceUsd = totalGroupBalanceNio / (parseExchangeRate(exchangeRate.buy) || 1);
  const customerBalanceTone = totalGroupBalanceNio > 0.005
    ? 'deliver'
    : totalGroupBalanceNio < -0.005
      ? 'receive'
      : 'settled';
  const customerBalanceLabel = customerBalanceTone === 'deliver'
    ? 'Pendiente por entregar al cliente'
    : customerBalanceTone === 'receive'
      ? 'Pendiente por recibir del cliente'
      : 'Cuenta del cliente equilibrada';
  const changeCashTotals = {
    NIO: calculateCashPileTotal(cashDenominations.NIO, changeCashCounts.NIO),
    USD: calculateCashPileTotal(cashDenominations.USD, changeCashCounts.USD),
  };
  const changeDifference = calculateChangeCashDifference({
    cashTotals: changeCashTotals,
    currency: draft.currency === 'USD' ? 'USD' : 'NIO',
    expectedChange,
    rateValue: changeRateValue,
  });

  useEffect(() => {
    if (!hasPositiveChange && cashView === 'change') {
      setCashView('received');
    }
  }, [cashView, hasPositiveChange]);

  useEffect(() => {
    const rowRateKind = draft.changeExchangeRateType === 'Venta' ? 'Venta' : 'Compra';
    setChangeRateKind(rowRateKind);
  }, [activeTabIndex, draft.changeExchangeRateType]);

  function setDraft(updater: (current: CrudRow) => CrudRow) {
    setDrafts((currentDrafts) =>
      currentDrafts.map((currentDraft, index) =>
        index === activeTabIndex ? updater(currentDraft) : currentDraft,
      ),
    );
  }

  function addTransactionTab() {
    const nextIndex = drafts.length;
    let idOffset = 1;
    while (drafts.some((transactionDraft) => transactionDraft.id === offsetReadableId(initialDraft.id, idOffset))) {
      idOffset += 1;
    }
    const currentRate = readExchangeRate();
    const nextDraft = normalizeTransactionRow({
      id: offsetReadableId(initialDraft.id, idOffset),
      registeredAt: '',
      entity: entityOptions[0] || '',
      movementCode: '',
      movement: '',
      direction: '',
      currency: 'NIO',
      amountValue: '',
      pendingName: draft.pendingName || '',
      description: '',
      cashCountNio: '{}',
      cashCountUsd: '{}',
      changeCashCountNio: '{}',
      changeCashCountUsd: '{}',
      exchangeRateType: getTransactionExchangeRateKind('Ingreso', draft.currency),
      exchangeRateValue: formatRateDisplay(
        getTransactionRateValue(currentRate, getTransactionExchangeRateKind('Ingreso', draft.currency)).toString(),
      ),
      changeExchangeRateType: invertExchangeRateKind(
        getTransactionExchangeRateKind('Ingreso', draft.currency),
      ),
      changeExchangeRateValue: formatRateDisplay(
        getTransactionRateValue(
          currentRate,
          invertExchangeRateKind(getTransactionExchangeRateKind('Ingreso', draft.currency)),
        ).toString(),
      ),
      status: 'Registrada',
    });
    setDrafts((currentDrafts) => [...currentDrafts, nextDraft]);
    setActiveTabIndex(nextIndex);
    setCashView('received');
    window.setTimeout(() => {
      document.querySelector<HTMLSelectElement>('.transaction-form-bank select')?.focus();
    }, 0);
  }

  function removeTransactionTab(indexToRemove: number) {
    if (drafts.length === 1) {
      return;
    }
    setDrafts((currentDrafts) => currentDrafts.filter((_, index) => index !== indexToRemove));
    setActiveTabIndex((currentIndex) => {
      if (currentIndex > indexToRemove) {
        return currentIndex - 1;
      }
      if (currentIndex === indexToRemove) {
        return Math.max(0, currentIndex - 1);
      }
      return currentIndex;
    });
    setCashView('received');
  }

  function updateField(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateEntity(value: string) {
    const availableEntityCurrencies = availableAccounts
      .filter((account) => normalizeLookupValue(account.entity) === normalizeLookupValue(value))
      .map((account) => account.currency);
    const defaultCurrency: CashCurrency = availableEntityCurrencies.includes('NIO') ? 'NIO' : availableEntityCurrencies[0] ?? 'NIO';
    const nextChangeRateKind = invertExchangeRateKind(getTransactionExchangeRateKind('Ingreso', defaultCurrency));
    setChangeRateKind(nextChangeRateKind);
    setDraft((current) => ({
      ...current,
      entity: value,
      movementCode: '',
      movement: '',
      direction: '',
      currency: defaultCurrency,
      changeExchangeRateType: nextChangeRateKind,
    }));
  }

  function updateMovement(value: string) {
    const movementRow = movementRows.find(
      (movement) => normalizeLookupValue(movement.name) === normalizeLookupValue(value),
    );
    const direction = movementRow?.direction === 'Salida' ? 'Salida' : movementRow ? 'Ingreso' : '';
    const movementCurrencies = getMovementCurrencies(movementRow).filter(
      (currency) => !restrictToShiftAccounts || entityCurrencies.has(currency),
    );
    const currency: CashCurrency = movementCurrencies.includes('NIO') ? 'NIO' : movementCurrencies[0] ?? 'NIO';
    const nextChangeRateKind = invertExchangeRateKind(getTransactionExchangeRateKind(direction || 'Ingreso', currency));
    setChangeRateKind(nextChangeRateKind);
    setDraft((current) => ({
      ...current,
      movement: value,
      movementCode: movementRow?.code || '',
      direction,
      currency,
      changeExchangeRateType: nextChangeRateKind,
    }));
  }

  function updateMovementCode(value: string) {
    const movementCode = value.trim().toUpperCase();
    const movementRow = movementRows.find(
      (movement) => normalizeLookupValue(movement.code) === normalizeLookupValue(movementCode),
    );
    const direction = movementRow?.direction === 'Salida' ? 'Salida' : movementRow ? 'Ingreso' : '';
    const movementCurrencies = getMovementCurrencies(movementRow).filter(
      (currency) => !restrictToShiftAccounts || entityCurrencies.has(currency),
    );
    const currency: CashCurrency = movementCurrencies.includes('NIO') ? 'NIO' : movementCurrencies[0] ?? 'NIO';
    const nextChangeRateKind = invertExchangeRateKind(getTransactionExchangeRateKind(direction || 'Ingreso', currency));
    setChangeRateKind(nextChangeRateKind);
    setDraft((current) => ({
      ...current,
      movementCode,
      movement: movementRow?.name || '',
      direction,
      currency,
      changeExchangeRateType: nextChangeRateKind,
    }));
  }

  function updateCurrency(currency: CashCurrency) {
    if (!selectedMovement || !allowedCurrencies.includes(currency)) {
      return;
    }
    const nextChangeRateKind = invertExchangeRateKind(getTransactionExchangeRateKind(draft.direction || 'Ingreso', currency));
    setChangeRateKind(nextChangeRateKind);
    setDraft((current) => ({ ...current, currency, changeExchangeRateType: nextChangeRateKind }));
  }

  function handleCurrencyKeyDown(event: KeyboardEvent<HTMLButtonElement>, currency: CashCurrency) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const availableCurrencies = (['NIO', 'USD'] as CashCurrency[]).filter((item) => allowedCurrencies.includes(item));
    if (availableCurrencies.length < 2) return;
    event.preventDefault();
    // Las flechas recorren únicamente las monedas habilitadas para el movimiento seleccionado.
    const currentIndex = availableCurrencies.indexOf(currency);
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const nextCurrency = availableCurrencies[(currentIndex + direction + availableCurrencies.length) % availableCurrencies.length];
    updateCurrency(nextCurrency);
    window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>(`[data-transaction-currency="${nextCurrency}"]`)?.focus();
    }, 0);
  }

  function toggleChangeRateKind() {
    const nextKind = changeRateKind === 'Compra' ? 'Venta' : 'Compra';
    setChangeRateKind(nextKind);
    updateField('changeExchangeRateType', nextKind);
  }

  function updateCashCount(currency: CashCurrency, denominationId: string, field: 'groups' | 'loose', value: string) {
    const cleanValue = value.replace(/\D/g, '');
    setDraft((current) => {
      const key = currency === 'NIO' ? 'cashCountNio' : 'cashCountUsd';
      const currentCounts = readTransactionCashCount(current[key]);
      currentCounts[denominationId] = {
        ...currentCounts[denominationId],
        [field]: cleanValue ? String(Number(cleanValue)) : '',
      };
      return { ...current, [key]: serializeTransactionCashCount(currentCounts) };
    });
  }

  function updateChangeCashCount(currency: CashCurrency, denominationId: string, field: 'groups' | 'loose', value: string) {
    const cleanValue = value.replace(/\D/g, '');
    setDraft((current) => {
      const key = currency === 'NIO' ? 'changeCashCountNio' : 'changeCashCountUsd';
      const currentCounts = readTransactionCashCount(current[key]);
      currentCounts[denominationId] = {
        ...currentCounts[denominationId],
        [field]: cleanValue ? String(Number(cleanValue)) : '',
      };
      return { ...current, [key]: serializeTransactionCashCount(currentCounts) };
    });
  }

  function handleTransactionAmountKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const nextValue = getAccountingMoneyKeyValue(event, draft.amountValue);
    if (nextValue === undefined) {
      return;
    }
    event.preventDefault();
    if (nextValue !== null) {
      updateField('amountValue', nextValue);
      queueAccountingMoneyCaret(event, nextValue);
    }
  }

  function handleTransactionAmountPaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    updateField('amountValue', normalizeAccountingMoneyRaw(event.clipboardData.getData('text')));
  }

  async function saveWithCashCount() {
    if (isReadOnly) return;
    const hasPending = drafts.some((transactionDraft) => transactionDraft.pendingName.trim());
    const hasEnteredCash = cashTotals.NIO > 0 || cashTotals.USD > 0 || changeCashTotals.NIO > 0 || changeCashTotals.USD > 0;
    if (!isPayment && hasPending && hasEnteredCash) {
      await requestSystemAlert(
        'Un pendiente se registra por el monto total y no debe incluir billetes recibidos, entregados ni vuelto. Limpie el arqueo antes de guardar.',
        'Pendiente sin efectivo',
      );
      return;
    }
    const customerBalanceSteps = calculateTransactionCustomerBalanceSteps(drafts, exchangeRate);
    const finalBalanceNio = customerBalanceSteps[customerBalanceSteps.length - 1]?.balanceNio || 0;
    const hasMinorRoundingDifference = Math.abs(finalBalanceNio) > 0.005
      && Math.abs(finalBalanceNio) <= transactionRoundingToleranceNio;
    if (hasMinorRoundingDifference) {
      await requestSystemAlert(
        `Existe una diferencia de redondeo de ${formatCashCountMoney(Math.abs(finalBalanceNio), 'NIO')}. Se registrara como C$ 0.00 porque no puede representarse con una denominacion fisica.`,
        'Diferencia minima permitida',
      );
    }
    onSave(
      drafts.map((transactionDraft, index) => {
        const currency: CashCurrency = transactionDraft.currency === 'USD' ? 'USD' : 'NIO';
        const exchangeRateType = getTransactionExchangeRateKind(
          transactionDraft.direction || 'Ingreso',
          currency,
        );
        const exchangeRateValue = getTransactionRateValue(exchangeRate, exchangeRateType);
        const rowBalanceStep = customerBalanceSteps[index];
        const rowDifferenceNio = normalizeTransactionRounding(
          rowBalanceStep?.balanceBeforeChangeNio || 0,
        );
        const rowChangeKind = rowBalanceStep?.changeRateKind || 'Compra';
        const rowChangeRate = rowBalanceStep?.changeRateValue || 1;
        return {
          ...transactionDraft,
          cashCountNio: transactionDraft.cashCountNio,
          cashCountUsd: transactionDraft.cashCountUsd,
          changeCashCountNio: transactionDraft.changeCashCountNio,
          changeCashCountUsd: transactionDraft.changeCashCountUsd,
          exchangeRateType,
          exchangeRateValue: formatRateDisplay(String(exchangeRateValue)),
          changeExchangeRateType: rowChangeKind,
          changeExchangeRateValue: formatRateDisplay(String(rowChangeRate)),
          settlementExchangeRateType: rowBalanceStep?.rateKind || exchangeRateType,
          settlementExchangeRateValue: formatRateDisplay(
            String(rowBalanceStep?.rateValue || exchangeRateValue),
          ),
          expectedChangeNio: String(Math.max(0, rowDifferenceNio)),
          expectedChangeUsd: String(Math.max(0, rowDifferenceNio / rowChangeRate)),
          transactionGroupId: transactionGroupIdRef.current,
          transactionGroupOrder: String(index + 1),
        };
      }),
    );
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      {navigation && <ModalRecordNavigator {...navigation} />}
      <section className={`modal-panel transaction-modal-panel ${isReadOnly ? 'transaction-modal-panel--readonly' : ''}`} ref={modalRef}>
        <div className="modal-header">
          <div>
            <p>{mode === 'create' ? 'Nuevo registro' : mode === 'edit' ? 'Editar registro' : mode === 'pay' ? 'Pago de pendiente' : 'Consulta de registro'}</p>
            <h2>{isReadOnly ? 'Detalle de transaccion' : isPayment ? 'Liquidar pendiente' : 'Registro de transaccion'}</h2>
          </div>
          <div className="modal-header__actions">
            {!isReadOnly && (
              <>
                <button
                  type="button"
                  className="secondary-button secondary-button--compact"
                  onClick={() => setShowExchangeCalculator((current) => !current)}
                >
                  <Calculator size={16} />
                  Cambio
                </button>
                <button
                  type="button"
                  className="secondary-button secondary-button--compact"
                  onClick={() => setShowDirectoryLookup((current) => !current)}
                >
                  <BookUser size={16} />
                  Directorio
                </button>
              </>
            )}
            <button type="button" className="icon-button close-button" onClick={onCancel} aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="transaction-tabs" role="tablist" aria-label="Transacciones del cliente">
          {drafts.map((transactionDraft, index) => (
            <div
              className={`transaction-tab ${activeTabIndex === index ? 'transaction-tab--active' : ''} ${
                !transactionDraft.movement || parseMoneyValue(transactionDraft.amountValue) <= 0
                  ? 'transaction-tab--incomplete'
                  : ''
              }`}
              key={transactionDraft.id}
            >
              <button
                type="button"
                className="transaction-tab__select"
                role="tab"
                aria-selected={activeTabIndex === index}
                onClick={() => {
                  setActiveTabIndex(index);
                  setCashView('received');
                }}
              >
                <span>Transaccion {index + 1}</span>
                <small>{transactionDraft.movement || 'Sin movimiento'}{transactionDraft.movementCode ? ` · ${transactionDraft.movementCode}` : ''}</small>
              </button>
              {mode === 'create' && drafts.length > 1 && (
                <button
                  type="button"
                  className="transaction-tab__close"
                  onClick={() => removeTransactionTab(index)}
                  aria-label={`Cerrar transaccion ${index + 1}`}
                  title="Quitar transaccion"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
          {mode === 'create' && (
            <button
              type="button"
              className="transaction-tabs__add"
              onClick={addTransactionTab}
              aria-label="Agregar otra transaccion"
              title="Agregar otra transaccion"
            >
              <Plus size={17} />
            </button>
          )}
        </div>

        <div className="form-grid transaction-form-grid">
          <label className="form-field transaction-form-id">
            ID
            <input value={draft.id} disabled />
          </label>
          <label className="form-field transaction-form-bank">
            Banco
            <select value={draft.entity} onChange={(event) => updateEntity(event.target.value)} disabled={isTransactionLocked || !entityOptions.length}>
              {!entityOptions.length && <option value="">Sin cuentas disponibles</option>}
              {entityOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="form-field transaction-form-code">
            Codigo
            <input
              list="transaction-movement-codes"
              value={draft.movementCode}
              onChange={(event) => updateMovementCode(event.target.value)}
              placeholder="---"
              autoComplete="off"
              disabled={isTransactionLocked || !movementRows.length}
            />
            <datalist id="transaction-movement-codes">
              {movementCodeSuggestions.map((movement) => (
                <option key={`${movement.id}-${movement.code}`} value={movement.code}>
                  {movement.name}
                </option>
              ))}
            </datalist>
          </label>
          <label className="form-field transaction-form-movement">
            Movimiento
            <select value={selectedMovement?.name ?? draft.movement} onChange={(event) => updateMovement(event.target.value)} disabled={isTransactionLocked || !movementOptions.length}>
              <option value="">{movementOptions.length ? '---' : 'Sin movimientos activos'}</option>
              {movementOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <div className="transaction-form-meta">
            <div className="transaction-direction-field">
              <span>Direccion</span>
              <strong
                className={`transaction-direction-badge ${
                  draft.direction === 'Salida'
                    ? 'transaction-direction-badge--out'
                    : draft.direction === 'Ingreso'
                      ? 'transaction-direction-badge--in'
                      : 'transaction-direction-badge--neutral'
                }`}
              >
                {draft.direction === 'Salida' && <ArrowUpRight size={15} />}
                {draft.direction === 'Ingreso' && <ArrowDownLeft size={15} />}
                {draft.direction || '---'}
              </strong>
            </div>
            <div className="transaction-currency-field">
              <span>Moneda</span>
              <div className="currency-filter currency-filter--form" aria-label="Seleccionar moneda">
                <button
                  type="button"
                  data-transaction-currency="NIO"
                  className={`currency-filter__button currency-filter__button--nio ${draft.currency === 'NIO' ? 'currency-filter__button--active' : ''}`}
                  onClick={() => updateCurrency('NIO')}
                  onKeyDown={(event) => handleCurrencyKeyDown(event, 'NIO')}
                  disabled={isTransactionLocked || !selectedMovement || !allowedCurrencies.includes('NIO')}
                  title={selectedMovement && !allowedCurrencies.includes('NIO') ? 'No disponible para este movimiento' : 'Cordobas'}
                >
                  C$
                </button>
                <button
                  type="button"
                  data-transaction-currency="USD"
                  className={`currency-filter__button currency-filter__button--usd ${draft.currency === 'USD' ? 'currency-filter__button--active' : ''}`}
                  onClick={() => updateCurrency('USD')}
                  onKeyDown={(event) => handleCurrencyKeyDown(event, 'USD')}
                  disabled={isTransactionLocked || !selectedMovement || !allowedCurrencies.includes('USD')}
                  title={selectedMovement && !allowedCurrencies.includes('USD') ? 'No disponible para este movimiento' : 'Dolares'}
                >
                  $
                </button>
              </div>
            </div>
          </div>
          <label className="form-field transaction-form-amount">
            Monto
            <input
              value={formatAccountingMoneyInput(draft.amountValue)}
              inputMode="decimal"
              onChange={(event) => updateField('amountValue', normalizeAccountingMoneyRaw(event.target.value))}
              onKeyDown={handleTransactionAmountKeyDown}
              onPaste={handleTransactionAmountPaste}
              onFocus={(event) => placeAccountingMoneyCaretBeforeDecimals(event.currentTarget)}
              onClick={(event) => placeAccountingMoneyCaretBeforeDecimals(event.currentTarget)}
              placeholder="0.00"
              readOnly={isTransactionLocked}
            />
          </label>
          <label className="form-field transaction-form-pending">
            Pendiente
            <input value={draft.pendingName} placeholder="Nombre Pendiente" onChange={(event) => updateField('pendingName', event.target.value)} readOnly={isTransactionLocked} />
          </label>
          <label className="form-field transaction-form-description">
            Descripcion
            <textarea value={draft.description} rows={1} onChange={(event) => updateField('description', event.target.value)} readOnly={isTransactionLocked} />
          </label>
          <div className="transaction-cash-count-section">
            <div
              className={`transaction-group-change-summary transaction-group-change-summary--${customerBalanceTone}`}
              aria-label={customerBalanceLabel}
            >
              <span>{customerBalanceLabel}</span>
              <strong>{formatCashCountMoney(Math.abs(totalGroupBalanceNio), 'NIO')}</strong>
              <strong>{formatCashCountMoney(Math.abs(totalGroupBalanceUsd), 'USD')}</strong>
            </div>
            <div className="transaction-cash-carousel">
              <div className={`transaction-cash-carousel__track ${cashView === 'change' ? 'transaction-cash-carousel__track--change' : ''}`}>
                <div
                  className="transaction-cash-slide transaction-cash-slide--received"
                  aria-hidden={cashView !== 'received'}
                  ref={(element) => {
                    if (!element) return;
                    if (cashView !== 'received') element.setAttribute('inert', '');
                    else element.removeAttribute('inert');
                  }}
                >
                  <div className="transaction-cash-count-heading">
                    <div>
                      <span>{drafts.length > 1 ? `Arqueo de transaccion ${activeTabIndex + 1}` : 'Arqueo de transaccion'}</span>
                      <strong>Conteo fisico {draft.direction === 'Salida' ? 'entregado' : 'recibido'}</strong>
                    </div>
                    <div className="transaction-rate-chip" aria-label="Tasa de cambio utilizada">
                      <span>Tasa de cambio utilizada</span>
                      <strong>{transactionDifference.rateKind} C$ {formatRateDisplay(String(transactionDifference.rateValue))}</strong>
                    </div>
                  </div>
                  <div className="transaction-cash-count-grid">
                <TransactionCashCountTable
                  currency="NIO"
                  denominations={cashDenominations.NIO}
                  focusScope="received"
                  pileDrafts={cashCounts.NIO}
                  conversionRate={transactionDifference.rateValue}
                  readOnly={isReadOnly}
                  nextFocusSelector={'[data-cash-scope="received"][data-cash-currency="USD"][data-cash-row="0"][data-cash-column="0"]'}
                  onPileFieldChange={(denominationId, field, value) => updateCashCount('NIO', denominationId, field, value)}
                />
              <div className="transaction-cash-right-stack">
                <TransactionCashCountTable
                  currency="USD"
                  denominations={cashDenominations.USD}
                  focusScope="received"
                  pileDrafts={cashCounts.USD}
                  conversionRate={transactionDifference.rateValue}
                  readOnly={isReadOnly}
                  onPileFieldChange={(denominationId, field, value) => updateCashCount('USD', denominationId, field, value)}
                />
                <div className="transaction-difference-row">
                  <div className="transaction-difference-row__arrow-slot">
                    {hasPositiveChange && (
                      <TransactionArrowButton
                        ariaLabel="Ir al arqueo de vuelto"
                        direction="right"
                        label="Vuelto"
                        onClick={() => setCashView('change')}
                      />
                    )}
                  </div>
                  <TransactionCashDifferenceSummary
                    differenceNio={transactionDifference.differenceNio}
                    differenceUsd={transactionDifference.differenceUsd}
                    mode="balance"
                    title="Saldo global hasta esta transaccion"
                  />
                </div>
              </div>
                  </div>
                </div>

                <div
                  className="transaction-cash-slide transaction-cash-slide--change"
                  aria-hidden={cashView !== 'change'}
                  ref={(element) => {
                    if (!element) return;
                    if (cashView !== 'change') element.setAttribute('inert', '');
                    else element.removeAttribute('inert');
                  }}
                >
                  <div className="transaction-cash-count-heading transaction-cash-count-heading--change">
                    <div>
                      <span>Arqueo de Vuelto</span>
                      <strong>Conteo fisico a entregar</strong>
                    </div>
                    <div className="transaction-change-target" aria-label="Arqueo de Vuelto">
                      <span>Arqueo de Vuelto</span>
                      <MoneyAmount currency="NIO" value={expectedChange.NIO} />
                      <MoneyAmount currency="USD" value={expectedChange.USD} />
                    </div>
                    <div className="transaction-rate-chip transaction-rate-chip--switchable" aria-label="Tasa de cambio utilizada para vuelto">
                      <div>
                        <span>Tasa de cambio utilizada</span>
                        <strong>{changeRateKind} C$ {formatRateDisplay(String(changeRateValue))}</strong>
                      </div>
                      <button
                        type="button"
                        className="transaction-rate-toggle"
                        onClick={toggleChangeRateKind}
                        disabled={isReadOnly}
                        aria-label={`Cambiar a tasa de ${changeRateKind === 'Compra' ? 'Venta' : 'Compra'}`}
                        title={`Usar tasa de ${changeRateKind === 'Compra' ? 'Venta' : 'Compra'}`}
                      >
                        <RefreshCw size={15} />
                      </button>
                    </div>
                  </div>
                  <div className="transaction-cash-count-grid">
                    <TransactionCashCountTable
                      currency="NIO"
                      denominations={cashDenominations.NIO}
                      focusScope="change"
                      pileDrafts={changeCashCounts.NIO}
                      conversionRate={changeRateValue}
                      readOnly={isReadOnly}
                      nextFocusSelector={'[data-cash-scope="change"][data-cash-currency="USD"][data-cash-row="0"][data-cash-column="0"]'}
                      onPileFieldChange={(denominationId, field, value) => updateChangeCashCount('NIO', denominationId, field, value)}
                    />
                    <div className="transaction-cash-right-stack">
                      <TransactionCashCountTable
                        currency="USD"
                        denominations={cashDenominations.USD}
                        focusScope="change"
                        pileDrafts={changeCashCounts.USD}
                        conversionRate={changeRateValue}
                        readOnly={isReadOnly}
                        onPileFieldChange={(denominationId, field, value) => updateChangeCashCount('USD', denominationId, field, value)}
                      />
                      <div className="transaction-difference-row">
                        <div className="transaction-difference-row__arrow-slot">
                          <TransactionArrowButton
                            ariaLabel="Regresar al arqueo recibido"
                            direction="left"
                            label="Recibido"
                            onClick={() => setCashView('received')}
                          />
                        </div>
                        <TransactionCashDifferenceSummary
                          differenceNio={changeDifference.differenceNio}
                          differenceUsd={changeDifference.differenceUsd}
                          mode="change"
                          title="Diferencia Contra Vuelto"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          {saveError && (
            <p className="transaction-save-error" role="alert">
              {saveError}
            </p>
          )}
          <button type="button" className="secondary-button danger-button" onClick={onCancel} disabled={isSaving}>
            <X size={17} />
            {isReadOnly ? 'Cerrar' : 'Cancelar'}
          </button>
          {isReadOnly && onEdit && (
            <button type="button" className="secondary-button" onClick={onEdit}>
              <Edit3 size={17} />
              Editar
            </button>
          )}
          {isReadOnly && onPay && (
            <button type="button" className="primary-button" onClick={onPay}>
              <CheckCircle2 size={17} />
              Pagar transaccion
            </button>
          )}
          {!isReadOnly && (
            <button
              type="button"
              className="primary-button"
              onClick={saveWithCashCount}
              disabled={hasIncompleteTransactions || (isPayment && cashTotals.NIO <= 0 && cashTotals.USD <= 0) || isSaving}
              title={
                hasIncompleteTransactions
                  ? 'Complete movimiento y monto en todas las transacciones'
                  : isPayment && cashTotals.NIO <= 0 && cashTotals.USD <= 0
                    ? 'Complete el conteo fisico del pago'
                    : isPayment
                      ? 'Registrar pago pendiente'
                      : 'Guardar transacciones'
              }
            >
              <Save size={17} />
              {isSaving
                ? 'Guardando...'
                : drafts.length > 1
                  ? `Guardar ${drafts.length} transacciones`
                  : isPayment
                    ? 'Marcar como pagado'
                    : 'Guardar'}
            </button>
          )}
        </div>
        {showExchangeCalculator && <ExchangeCalculator onClose={() => setShowExchangeCalculator(false)} />}
        {showDirectoryLookup && <DirectoryLookup onClose={() => setShowDirectoryLookup(false)} />}
      </section>
    </div>
  );
}

function TransactionArrowButton({
  ariaLabel,
  direction,
  label,
  onClick,
}: {
  ariaLabel: string;
  direction: 'left' | 'right';
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`transaction-arrow-button transaction-arrow-button--${direction}`}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <svg className="transaction-arrow-button__shape" viewBox="0 0 132 88" aria-hidden="true" focusable="false">
        <g className="transaction-arrow-button__direction">
          <path
            d="M11 76 C18 44 50 25 84 25 L85 13 C86 5 95 2 101 8 L124 32 C131 39 131 48 124 56 L101 80 C95 86 86 83 85 74 L84 62 C53 62 30 71 12 85 C8 88 9 80 11 76 Z"
          />
        </g>
        <text x="61" y="50">{label}</text>
      </svg>
    </button>
  );
}

function TransactionCashCountTable({
  currency,
  denominations,
  focusScope,
  pileDrafts,
  conversionRate,
  readOnly = false,
  showConvertedTotal = true,
  nextFocusSelector,
  onPileFieldChange,
}: {
  currency: CashCurrency;
  denominations: CashDenomination[];
  focusScope: string;
  pileDrafts: Record<string, CashPileDraft>;
  conversionRate: number;
  readOnly?: boolean;
  showConvertedTotal?: boolean;
  nextFocusSelector?: string;
  onPileFieldChange: (denominationId: string, field: 'groups' | 'loose', value: string) => void;
}) {
  const total = calculateCashPileTotal(denominations, pileDrafts);
  const convertedCurrency: CashCurrency = currency === 'NIO' ? 'USD' : 'NIO';
  const convertedTotal = currency === 'NIO' ? total / conversionRate : total * conversionRate;

  function focusCashEntry(rowIndex: number, columnIndex: number) {
    window.setTimeout(() => {
      const nextInput = document.querySelector<HTMLInputElement>(
        `[data-cash-scope="${focusScope}"][data-cash-currency="${currency}"][data-cash-row="${rowIndex}"][data-cash-column="${columnIndex}"]`,
      );
      nextInput?.focus();
      nextInput?.select();
    }, 0);
  }

  function focusNextSection() {
    if (!nextFocusSelector) return false;
    window.setTimeout(() => {
      const nextInput = document.querySelector<HTMLElement>(nextFocusSelector);
      nextInput?.focus();
      if (nextInput instanceof HTMLInputElement) nextInput.select();
    }, 0);
    return true;
  }

  function moveCashEntry(rowIndex: number, columnIndex: number, rowStep: number, columnStep = 0) {
    const lastRow = denominations.length - 1;
    const lastColumn = 1;
    const nextRow = rowIndex + rowStep;
    const nextColumn = columnIndex + columnStep;

    if (nextRow >= 0 && nextRow <= lastRow && nextColumn >= 0 && nextColumn <= lastColumn) {
      focusCashEntry(nextRow, nextColumn);
    }
  }

  function moveToNextCashEntry(rowIndex: number, columnIndex: number) {
    if (columnIndex < 1) {
      focusCashEntry(rowIndex, columnIndex + 1);
      return true;
    }

    if (rowIndex < denominations.length - 1) {
      focusCashEntry(rowIndex + 1, 0);
      return true;
    }

    return focusNextSection();
  }

  function moveToPreviousCashEntry(rowIndex: number, columnIndex: number) {
    if (columnIndex > 0) {
      focusCashEntry(rowIndex, columnIndex - 1);
      return true;
    }

    if (rowIndex > 0) {
      focusCashEntry(rowIndex - 1, 1);
      return true;
    }

    focusCashEntry(denominations.length - 1, 1);
    return true;
  }

  function moveDownOrNext(rowIndex: number, columnIndex: number) {
    if (rowIndex < denominations.length - 1) {
      focusCashEntry(rowIndex + 1, columnIndex);
      return true;
    }
    return focusNextSection();
  }

  function handleCashEntryKeyDown(event: KeyboardEvent<HTMLInputElement>, rowIndex: number, columnIndex: number) {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) moveCashEntry(rowIndex, columnIndex, -1);
      else moveDownOrNext(rowIndex, columnIndex);
      return;
    }

    if (event.key === 'Tab') {
      const moved = event.shiftKey
        ? moveToPreviousCashEntry(rowIndex, columnIndex)
        : moveToNextCashEntry(rowIndex, columnIndex);
      if (moved) event.preventDefault();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveDownOrNext(rowIndex, columnIndex);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveCashEntry(rowIndex, columnIndex, -1);
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (columnIndex === 1 && rowIndex === denominations.length - 1) focusNextSection();
      else moveCashEntry(rowIndex, columnIndex, 0, 1);
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveCashEntry(rowIndex, columnIndex, 0, -1);
    }
  }

  return (
    <section className={`transaction-cash-card transaction-cash-card--${currency.toLowerCase()}`}>
      <div className="transaction-cash-card__header">
        <strong>{currency === 'NIO' ? 'Cordobas (NIO)' : 'Dolares (USD)'}</strong>
        <span className="transaction-cash-card__total">{formatCashCountMoney(total, currency)}</span>
      </div>
      <div className="transaction-cash-table" role="table">
        <div className="transaction-cash-table__header-row" role="row">
          <span role="columnheader">X25</span>
          <span role="columnheader">Sueltos</span>
          <span role="columnheader">Cantidad</span>
          <span role="columnheader">Denominacion</span>
          <span role="columnheader">Monto</span>
        </div>
        <div className="transaction-cash-table__body" role="rowgroup">
          {denominations.map((denomination, rowIndex) => {
            const pile = pileDrafts[denomination.id] ?? {};
            const quantity = calculatePileQuantity(pile);
            const amount = quantity * denomination.value;
            return (
              <div
                className={`transaction-cash-table__row ${
                  quantity > 0 ? 'transaction-cash-table__row--filled' : 'transaction-cash-table__row--empty'
                }`}
                role="row"
                key={denomination.id}
              >
                <div role="cell">
                  <input
                    aria-label={`Montones de 25 para ${denomination.label}`}
                    className="transaction-cash-entry"
                    data-cash-column="0"
                    data-cash-currency={currency}
                    data-cash-row={rowIndex}
                    data-cash-scope={focusScope}
                    inputMode="numeric"
                    type="text"
                    value={pile.groups ?? ''}
                    readOnly={readOnly}
                    onKeyDown={(event) => handleCashEntryKeyDown(event, rowIndex, 0)}
                    onChange={(event) => onPileFieldChange(denomination.id, 'groups', event.target.value)}
                    placeholder="0"
                  />
                </div>
                <div role="cell">
                  <input
                    aria-label={`Sueltos para ${denomination.label}`}
                    className="transaction-cash-entry"
                    data-cash-column="1"
                    data-cash-currency={currency}
                    data-cash-row={rowIndex}
                    data-cash-scope={focusScope}
                    inputMode="numeric"
                    type="text"
                    value={pile.loose ?? ''}
                    readOnly={readOnly}
                    onKeyDown={(event) => handleCashEntryKeyDown(event, rowIndex, 1)}
                    onChange={(event) => onPileFieldChange(denomination.id, 'loose', event.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="transaction-cash-quantity" role="cell">{quantity}</div>
                <div className="transaction-cash-denomination" role="cell">{denomination.label}</div>
                <div className="transaction-cash-amount" role="cell">{formatCashCountMoney(amount, currency)}</div>
              </div>
            );
          })}
        </div>
        <div className="transaction-cash-table__footer" role="rowgroup">
          <div className="transaction-cash-table__footer-row transaction-cash-table__footer-row--total" role="row">
            <span role="cell">Total contado</span>
            <strong role="cell">{formatCashCountMoney(total, currency)}</strong>
          </div>
          {showConvertedTotal && (
            <div className="transaction-cash-table__footer-row" role="row">
              <span role="cell">Equivalente {convertedCurrency}</span>
              <strong role="cell">{formatCashCountMoney(convertedTotal, convertedCurrency)}</strong>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TransactionCashDifferenceSummary({
  differenceNio,
  differenceUsd,
  mode,
  direction = 'Ingreso',
  title,
}: {
  differenceNio: number;
  differenceUsd: number;
  mode: 'transaction' | 'change' | 'balance';
  direction?: 'Ingreso' | 'Salida';
  title: string;
}) {
  const differenceOptions =
    mode === 'balance'
      ? {
          positiveLabel: 'Por entregar',
          negativeLabel: 'Por recibir',
          positiveTone: 'surplus' as const,
          negativeTone: 'shortage' as const,
        }
      : mode === 'change'
      ? {
          positiveLabel: 'De más',
          negativeLabel: 'Vuelto',
          positiveTone: 'shortage' as const,
          negativeTone: 'surplus' as const,
        }
      : direction === 'Salida'
        ? {
            positiveLabel: 'De más',
            negativeLabel: '',
            positiveTone: 'shortage' as const,
            negativeTone: 'surplus' as const,
          }
        : {
            positiveLabel: '',
            negativeLabel: 'Falta',
            positiveTone: 'surplus' as const,
            negativeTone: 'shortage' as const,
          };

  return (
    <section className="transaction-cash-difference-summary" aria-label="Diferencia agrupada de arqueo">
      <div className="transaction-cash-difference-summary__header">
        <strong>{title}</strong>
      </div>
      <table>
        <tbody>
          <tr>
            <td>C$</td>
            <td>{renderDifference(differenceNio, 'NIO', differenceOptions)}</td>
          </tr>
          <tr>
            <td>$</td>
            <td>{renderDifference(differenceUsd, 'USD', differenceOptions)}</td>
          </tr>
        </tbody>
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
  const [passwordResetRow, setPasswordResetRow] = useState<CrudRow | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [catalogSaveError, setCatalogSaveError] = useState('');
  const [catalogSuccess, setCatalogSuccess] = useState('');

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
    return config.columns.map((column) => {
      if (config.storageKey === 'commissions' && column.key === 'movement') {
        return {
          ...column,
          inputKind: 'select' as InputKind,
          options: getAvailableCommissionMovements(rows, currentRow),
        };
      }
      if (config.storageKey === 'users' && column.key === 'role') {
        return { ...column, options: getAvailableRoleNames(currentRow?.role) };
      }
      if (config.storageKey === 'branches' && column.key === 'cashiers') {
        return { ...column, options: getAvailableUserNames() };
      }
      if (config.storageKey === 'branches' && column.key === 'accounts') {
        return { ...column, options: getAvailableAccountAliases() };
      }
      if (config.storageKey === 'accounts' && column.key === 'scope') {
        return { ...column, options: getAvailableBranchNames() };
      }
      if (config.storageKey === 'accounts' && column.key === 'entity') {
        return { ...column, options: includeCurrentOptions(getActiveEntities(), currentRow?.entity) };
      }
      if (config.storageKey === 'accounts' && column.key === 'currency') {
        return { ...column, options: getAvailableCurrencyCodes(currentRow?.currency) };
      }
      if (config.storageKey === 'movements' && column.key === 'banks') {
        return { ...column, options: includeCurrentOptions(getActiveEntities(), currentRow?.banks) };
      }
      if (config.storageKey === 'movements' && column.key === 'currencies') {
        return { ...column, options: getAvailableCurrencyCodes(currentRow?.currencies) };
      }
      if ((config.storageKey === 'commissions' || config.storageKey === 'commission-reports') && column.key === 'entity') {
        return { ...column, options: includeCurrentOptions(getActiveEntities(), currentRow?.entity) };
      }
      if (
        (config.storageKey === 'commissions' || config.storageKey === 'commission-reports') &&
        (column.key === 'currency' || column.key === 'commissionCurrency')
      ) {
        return { ...column, options: getAvailableCurrencyCodes(currentRow?.[column.key]) };
      }
      return column;
    });
  }

  // Abre el modal con un registro vacio listo para guardar.
  function openCreateModal() {
    setCatalogSaveError('');
    setCatalogSuccess('');
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
    setCatalogSaveError('');
    setCatalogSuccess('');
    const editableRow = config.storageKey === 'users' ? normalizeUserRow(row) : row;
    const formColumns = getFormColumns(editableRow);
    setModal({ mode: 'edit', row: normalizeRowDefaults(editableRow, formColumns), columns: formColumns });
  }

  // El doble clic usa el mismo formulario de edicion, inicialmente bloqueado.
  function openViewModal(row: CrudRow) {
    setCatalogSaveError('');
    setCatalogSuccess('');
    const viewableRow = config.storageKey === 'users' ? normalizeUserRow(row) : row;
    const formColumns = getFormColumns(viewableRow);
    setModal({ mode: 'view', row: normalizeRowDefaults(viewableRow, formColumns), columns: formColumns });
  }

  // Guarda altas y ediciones en memoria local del navegador.
  async function saveRow(row: CrudRow) {
    const normalizedRow = normalizeRowDefaults(row, modal?.columns ?? config.columns);
    const previousRow = rows.find((item) => item.id === normalizedRow.id);
    const visibleRow =
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
    const rowToSave = attachInternalCatalogIds(config.storageKey, visibleRow);
    if (writableCatalogStorageKeys.has(config.storageKey)) {
      setCatalogSaveError('');
      try {
        const databaseId = rowToSave.databaseId || previousRow?.databaseId;
        await apiRequest(`/catalogs/${config.storageKey}${databaseId ? `/${databaseId}` : ''}`, {
          method: databaseId ? 'PUT' : 'POST',
          body: JSON.stringify(rowToSave),
        });
        const databaseRows = await loadCatalogRows(config.storageKey, config);
        setRows(databaseRows);
        if (config.storageKey === 'branches') {
          await loadCatalogRows('accounts', crudConfigs.accounts[0]);
        } else if (config.storageKey === 'accounts') {
          await loadCatalogRows('branches', crudConfigs.branches[0]);
        }
        announceOperationalDataChange();
        setModal(null);
      } catch (error) {
        setCatalogSaveError(error instanceof Error ? error.message : 'No fue posible guardar el catalogo.');
      }
      return;
    }
    if (modal?.mode === 'create') {
      setRows((currentRows) => [...currentRows, rowToSave]);
    } else {
      setRows((currentRows) => currentRows.map((item) => (item.id === normalizedRow.id ? rowToSave : item)));
    }
    if (config.storageKey === 'branches') {
      syncAccountsFromBranch(previousRow, rowToSave);
    }
    if (config.storageKey === 'accounts') {
      syncBranchesFromAccount(previousRow, rowToSave);
    }
    setModal(null);
  }

  // Inactiva o reactiva un registro sin eliminar historial.
  function toggleInactive(row: CrudRow) {
    if (writableCatalogStorageKeys.has(config.storageKey)) {
      const nextRow: CrudRow = { ...row, status: isInactive(row) ? 'Activo' : 'Inactivo' };
      const databaseId = nextRow.databaseId;
      if (!databaseId) return;
      void apiRequest(`/catalogs/${config.storageKey}/${databaseId}`, {
        method: 'PUT',
        body: JSON.stringify(attachInternalCatalogIds(config.storageKey, nextRow)),
      })
        .then(() => loadCatalogRows(config.storageKey, config))
        .then(setRows)
        .catch((error) => setCatalogSaveError(error instanceof Error ? error.message : 'No fue posible cambiar el estado.'));
      return;
    }
    setRows((currentRows) =>
      currentRows.map((item) =>
        item.id === row.id ? { ...item, status: isInactive(item) ? 'Activo' : 'Inactivo' } : item,
      ),
    );
  }

  // Envía la clave temporal elegida por la Jefa y actualiza el estado visible de la tabla.
  async function resetCashierPassword(temporaryPassword: string) {
    if (!passwordResetRow?.databaseId) return;
    setCatalogSaveError('');
    setCatalogSuccess('');
    await apiRequest(`/catalogs/usuarios/${passwordResetRow.databaseId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ temporaryPassword }),
    });
    setPasswordResetRow(null);
    setCatalogSuccess(`Contraseña temporal asignada a ${passwordResetRow.username}. Deberá cambiarla al ingresar.`);
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
          <button type="button" className="secondary-button export-button export-button--excel" onClick={() => exportExcel(config.title, visibleColumns, processedRows)}>
            <FileSpreadsheet size={17} />
            Excel
          </button>
          <button type="button" className="secondary-button export-button export-button--pdf" onClick={() => exportPdf(config.title, visibleColumns, processedRows)}>
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

      {/* Mensajes propios de la tabla para confirmar o reportar acciones administrativas. */}
      {catalogSuccess && <p className="catalog-feedback catalog-feedback--success" role="status">{catalogSuccess}</p>}
      {catalogSaveError && !modal && <p className="catalog-feedback catalog-feedback--error" role="alert">{catalogSaveError}</p>}

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
            {pageRows.map((row, index) => {
              const rowIdentity = row.databaseId || row.id;
              return (
                <tr
                  key={rowIdentity}
                  className={`${onRowClick ? 'clickable-row' : ''} ${isInactive(row) ? 'inactive-row' : ''} ${selectedRowId === rowIdentity ? 'selected-row' : ''}`}
                  onClick={() => {
                    setSelectedRowId(rowIdentity);
                    onRowClick?.(row);
                  }}
                  onDoubleClick={() => openViewModal(row)}
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
                      {config.storageKey === 'users' && normalizeLookupValue(row.role) === 'cajero' && !isInactive(row) && (
                        <button
                          type="button"
                          className="icon-action"
                          title="Restablecer contraseña"
                          aria-label={`Restablecer contraseña de ${row.username}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setCatalogSaveError('');
                            setCatalogSuccess('');
                            setPasswordResetRow(row);
                          }}
                        >
                          <KeyRound size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
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
          key={`catalog-${modal.mode}-${modal.row.databaseId || modal.row.id}`}
          columns={modal.columns}
          mode={modal.mode}
          row={modal.row}
          rows={rows}
          storageKey={config.storageKey}
          title={config.title}
          onCancel={() => setModal(null)}
          onSave={saveRow}
          onEdit={modal.mode === 'view' ? () => setModal({ ...modal, mode: 'edit' }) : undefined}
          navigation={modal.mode === 'view' ? {
            currentIndex: processedRows.findIndex((catalogRow) => (catalogRow.databaseId || catalogRow.id) === (modal.row.databaseId || modal.row.id)),
            total: processedRows.length,
            onPrevious: () => {
              const index = processedRows.findIndex((catalogRow) => (catalogRow.databaseId || catalogRow.id) === (modal.row.databaseId || modal.row.id));
              if (index > 0) openViewModal(processedRows[index - 1]);
            },
            onNext: () => {
              const index = processedRows.findIndex((catalogRow) => (catalogRow.databaseId || catalogRow.id) === (modal.row.databaseId || modal.row.id));
              if (index >= 0 && index < processedRows.length - 1) openViewModal(processedRows[index + 1]);
            },
          } : undefined}
          saveError={catalogSaveError}
        />
      )}
      {/* Ventana administrativa separada para no mezclar credenciales con datos personales. */}
      {passwordResetRow && (
        <ResetCashierPasswordDialog
          cashierName={`${passwordResetRow.firstName} ${passwordResetRow.lastName}`.trim()}
          username={passwordResetRow.username}
          onCancel={() => setPasswordResetRow(null)}
          onReset={resetCashierPassword}
        />
      )}
    </article>
  );
}

type ModalRecordNavigation = {
  currentIndex: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
};

function createEasyTemporaryPassword() {
  // Genera una clave pronunciable, temporal y compatible con la politica de seguridad.
  const digits = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10_000).padStart(4, '0');
  return `Temo-${digits}-Aa`;
}

function ResetCashierPasswordDialog({
  cashierName,
  username,
  onCancel,
  onReset,
}: {
  cashierName: string;
  username: string;
  onCancel: () => void;
  onReset: (temporaryPassword: string) => Promise<void>;
}) {
  const [temporaryPassword, setTemporaryPassword] = useState(createEasyTemporaryPassword);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Confirma que la Jefa transcribió correctamente la clave antes de invalidar sesiones.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (temporaryPassword !== confirmation) {
      setError('La confirmación no coincide con la contraseña temporal.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onReset(temporaryPassword);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'No fue posible restablecer la contraseña.');
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop profile-password-backdrop" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
      <section className="modal-panel profile-password-modal">
        {/* Encabezado que identifica al cajero antes de aplicar una acción sensible. */}
        <header className="modal-header">
          <div><p>{cashierName} · {username}</p><h2 id="reset-password-title">Restablecer contraseña</h2></div>
          <button type="button" className="icon-button danger-button" onClick={onCancel} aria-label="Cancelar"><X size={19} /></button>
        </header>
        {/* La contraseña se muestra para que la Jefa pueda entregársela temporalmente al cajero. */}
        <form className="profile-password-form" onSubmit={submit}>
          <p className="muted-copy">El cajero deberá cambiar esta contraseña inmediatamente después de ingresar.</p>
          <label className="form-field">Contraseña temporal<input value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} minLength={10} required /></label>
          <button type="button" className="secondary-button reset-password-generate" onClick={() => { setTemporaryPassword(createEasyTemporaryPassword()); setConfirmation(''); }}><RefreshCw size={17} />Generar otra contraseña</button>
          <label className="form-field">Confirmar contraseña<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={10} required /></label>
          {error && <p className="login-error" role="alert">{error}</p>}
          <footer className="modal-actions">
            <button type="button" className="secondary-button danger-button" onClick={onCancel}><X size={17} />Cancelar</button>
            <button type="submit" className="primary-button" disabled={saving}><KeyRound size={18} />{saving ? 'Restableciendo...' : 'Restablecer'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function ModalRecordNavigator({ currentIndex, total, onPrevious, onNext }: ModalRecordNavigation) {
  const canMovePrevious = currentIndex > 0;
  const canMoveNext = currentIndex >= 0 && currentIndex < total - 1;

  return (
    <div className="modal-record-navigator" aria-label="Navegacion entre registros">
      <button
        type="button"
        className="modal-record-navigator__button modal-record-navigator__button--previous"
        onClick={onPrevious}
        disabled={!canMovePrevious}
        aria-label="Registro anterior"
        title="Registro anterior"
      >
        <ChevronLeft size={24} />
      </button>
      <button
        type="button"
        className="modal-record-navigator__button modal-record-navigator__button--next"
        onClick={onNext}
        disabled={!canMoveNext}
        aria-label="Registro siguiente"
        title="Registro siguiente"
      >
        <ChevronRight size={24} />
      </button>
    </div>
  );
}

function getCrudModalFieldClass(column: CrudColumn) {
  if (column.inputKind === 'textarea' || column.inputKind === 'multiselect') {
    return 'form-field form-field--wide';
  }
  if (column.key === 'id' || /^id[A-Z]/.test(column.key)) {
    return 'form-field crud-modal-field--id';
  }
  if (['code', 'movementCode'].includes(column.key)) {
    return 'form-field crud-modal-field--code';
  }
  if (['direction', 'currency', 'status', 'commissionCurrency'].includes(column.key)) {
    return 'form-field crud-modal-field--compact';
  }
  if (['name', 'alias', 'movement', 'entity'].includes(column.key)) {
    return 'form-field crud-modal-field--name';
  }
  return 'form-field crud-modal-field--standard';
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
  onEdit,
  navigation,
  saveError,
}: {
  columns: CrudColumn[];
  mode: ModalMode;
  row: CrudRow;
  rows: CrudRow[];
  storageKey: string;
  title: string;
  onCancel: () => void;
  onSave: (row: CrudRow) => void | Promise<void>;
  onEdit?: () => void;
  navigation?: ModalRecordNavigation;
  saveError: string;
}) {
  const [draft, setDraft] = useState(() => normalizeRowDefaults(row, columns));
  const modalRef = useAutoFocusFirstField<HTMLElement>();
  const fields = columns.filter((column) => !column.hiddenInForm);
  const hasPercentage = Boolean(normalizePercentage(draft.percentage));
  const hasFixedAmount = Boolean(String(draft.fixed ?? '').trim());
  const isReadOnly = mode === 'view';

  // Actualiza un campo del formulario sin mutar el registro original.
  function updateField(key: string, value: string) {
    setDraft((current) => {
      const cleanValue = storageKey === 'commissions' && key === 'percentage' ? normalizePercentage(value) : value;
      const next = { ...current, [key]: cleanValue };
      if (storageKey === 'accounts' && (key === 'entity' || key === 'currency')) {
        next.alias = buildAccountAlias(rows, next.entity, next.currency, mode === 'edit' ? next.id : undefined);
      }
      if (storageKey === 'commissions' && (key === 'entity' || key === 'currency')) {
        next.movement = '';
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
      {navigation && <ModalRecordNavigator {...navigation} />}
      <section className="modal-panel modal-panel--compact" ref={modalRef}>
        {/* Encabezado del modal con cierre explicito. */}
        <div className="modal-header">
          <div>
            <p>{mode === 'create' ? 'Nuevo registro' : isReadOnly ? 'Vista de registro' : 'Editar registro'}</p>
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button close-button" onClick={onCancel} aria-label="Cerrar">
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
            const fieldDisabled = isReadOnly || column.readOnly || disabledByCommissionRule;
            const fieldOptions =
              storageKey === 'commissions' && column.key === 'movement'
                ? includeCurrentOptions(
                    getMovementRows()
                      .filter(
                        (movement) =>
                          !isInactive(movement) &&
                          parseMultiValue(movement.banks).some(
                            (bank) => normalizeLookupValue(bank) === normalizeLookupValue(draft.entity),
                          ) &&
                          parseMultiValue(movement.currencies).some(
                            (currency) => normalizeLookupValue(currency) === normalizeLookupValue(draft.currency),
                          ),
                      )
                      .map((movement) => movement.name)
                      .filter(Boolean),
                    draft.movement,
                  )
                : column.options;

            return (
              <label key={column.key} className={getCrudModalFieldClass(column)}>
                {column.label}
                {column.inputKind === 'textarea' ? (
                  <textarea value={draft[column.key] ?? ''} rows={3} onChange={(event) => updateField(column.key, event.target.value)} disabled={fieldDisabled} />
                ) : column.inputKind === 'select' ? (
                  <select value={draft[column.key] || ''} onChange={(event) => updateField(column.key, event.target.value)} disabled={fieldDisabled || !fieldOptions?.length}>
                    {!draft[column.key] && <option value="">{fieldOptions?.length ? '---' : 'Sin opciones disponibles'}</option>}
                    {fieldOptions?.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : column.inputKind === 'multiselect' ? (
                  <div className="multi-select-list">
                    {fieldOptions?.map((option) => {
                      const checked = parseMultiValue(draft[column.key]).includes(option);
                      return (
                        <label key={option} className="multi-select-option">
                          <input
                            checked={checked}
                            type="checkbox"
                            onChange={() => toggleMultiValue(column.key, option)}
                            disabled={fieldDisabled}
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
          {saveError && <p className="transaction-save-error" role="alert">{saveError}</p>}
          <button type="button" className="secondary-button danger-button" onClick={onCancel}>
            <X size={17} />
            {isReadOnly ? 'Cerrar' : 'Cancelar'}
          </button>
          {isReadOnly && onEdit && (
            <button type="button" className="primary-button" onClick={onEdit}>
              <Edit3 size={17} />
              Editar
            </button>
          )}
          {!isReadOnly && (
            <button type="button" className="primary-button" onClick={() => void onSave(draft)}>
              <Save size={17} />
              Guardar
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function RolePermissionsScreen() {
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
      <CrudTable config={roleCatalogConfig} onRowClick={setSelectedRole} />

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
      acc[permission.id] = role.code === 'JEFA' || ['REGISTRAR_TRANSACCIONES', 'ANULAR_TRANSACCIONES', 'EXPORTAR_REPORTES'].includes(permission.code);
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
          <button type="button" className="icon-button close-button" onClick={onClose} aria-label="Cerrar">
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
