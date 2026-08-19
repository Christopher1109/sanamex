// Catálogo unificado de módulos del sistema.
// Fuente única de verdad para: gestión de usuarios, sidebar y gating.

export type NivelAcceso =
  | 'sin_acceso'
  | 'consultar'
  | 'capturar'
  | 'autorizar'
  | 'administrar';

export const NIVELES_ORDER: Record<NivelAcceso, number> = {
  sin_acceso: 1,
  consultar: 2,
  capturar: 3,
  autorizar: 4,
  administrar: 5,
};

export const NIVEL_LABELS: Record<NivelAcceso, string> = {
  sin_acceso: 'Sin acceso',
  consultar: 'Consultar',
  capturar: 'Capturar',
  autorizar: 'Autorizar',
  administrar: 'Administrar',
};

export interface ModuloDef {
  key: string;
  label: string;
  categoria: string;
  path: string;
  niveles: NivelAcceso[]; // niveles válidos para este módulo
}

const OP: NivelAcceso[] = ['sin_acceso', 'consultar', 'capturar', 'administrar'];
const FULL: NivelAcceso[] = ['sin_acceso', 'consultar', 'capturar', 'autorizar', 'administrar'];
const SIMPLE: NivelAcceso[] = ['sin_acceso', 'consultar'];

export const MODULOS: ModuloDef[] = [
  // Catálogos
  { key: 'articulos', label: 'Artículos', categoria: 'Catálogos', path: '/productos', niveles: OP },
  { key: 'proveedores', label: 'Proveedores', categoria: 'Catálogos', path: '/proveedores', niveles: OP },
  { key: 'listas_precios', label: 'Listas de Precios', categoria: 'Catálogos', path: '/listas-precios', niveles: OP },
  { key: 'clientes', label: 'Clientes', categoria: 'Catálogos', path: '/clientes', niveles: OP },
  // Operaciones
  { key: 'compras', label: 'Compras', categoria: 'Operaciones', path: '/compras', niveles: OP },
  { key: 'ventas', label: 'Ventas', categoria: 'Operaciones', path: '/pedidos', niveles: OP },
  { key: 'pos', label: 'Punto de Venta', categoria: 'Operaciones', path: '/pos', niveles: OP },
  { key: 'traspasos', label: 'Traspasos', categoria: 'Operaciones', path: '/traspasos', niveles: OP },
  { key: 'corte_caja', label: 'Corte de Caja — Mostrador', categoria: 'Operaciones', path: '/corte-caja-mostrador', niveles: OP },
  { key: 'corte_caja_ruta', label: 'Corte de Caja — Ruta', categoria: 'Operaciones', path: '/corte-caja-ruta', niveles: OP },
  // Inventario
  { key: 'inventario', label: 'Inventario', categoria: 'Inventario', path: '/inventario', niveles: OP },
  { key: 'caducidades', label: 'Caducidades', categoria: 'Inventario', path: '/caducidades', niveles: OP },
  { key: 'ajustes_inventario', label: 'Ajustes de Inventario', categoria: 'Inventario', path: '/ajustes-inventario', niveles: OP },
  // Análisis
  { key: 'rentabilidad_lotes', label: 'Rentabilidad por Lote', categoria: 'Análisis', path: '/rentabilidad-lotes', niveles: SIMPLE },
  { key: 'reportes', label: 'Reportes', categoria: 'Análisis', path: '/reportes', niveles: SIMPLE },
  // Finanzas
  { key: 'cuentas_por_pagar', label: 'Cuentas por Pagar', categoria: 'Finanzas', path: '/cuentas-por-pagar', niveles: FULL },
  { key: 'cuentas_por_cobrar', label: 'Cuentas por Cobrar', categoria: 'Finanzas', path: '/cuentas-por-cobrar', niveles: FULL },
  { key: 'bancos', label: 'Bancos', categoria: 'Finanzas', path: '/bancos', niveles: FULL },
  { key: 'conciliacion', label: 'Conciliación', categoria: 'Finanzas', path: '/conciliacion', niveles: FULL },
  { key: 'contabilidad', label: 'Contabilidad', categoria: 'Finanzas', path: '/contabilidad', niveles: FULL },
  { key: 'reportes_admin', label: 'Reportes administrativos', categoria: 'Finanzas', path: '/reportes-admin', niveles: SIMPLE },
  // Fiscal
  { key: 'cfdi', label: 'Facturación (CFDI)', categoria: 'Fiscal', path: '/fiscal', niveles: FULL },
  { key: 'impuestos', label: 'Impuestos', categoria: 'Fiscal', path: '/impuestos', niveles: FULL },
  // Nómina
  { key: 'nomina', label: 'Nómina', categoria: 'Nómina', path: '/nomina', niveles: FULL },
  // Sistema
  { key: 'cargas_masivas', label: 'Cargas Masivas', categoria: 'Sistema', path: '/cargas-masivas', niveles: OP },
  { key: 'ventas_offline', label: 'Ventas Offline', categoria: 'Sistema', path: '/conflictos', niveles: SIMPLE },
  { key: 'actividad', label: 'Registro de Actividad', categoria: 'Sistema', path: '/actividad', niveles: SIMPLE },
  { key: 'super_admin', label: 'Super Admin', categoria: 'Sistema', path: '/super-admin', niveles: SIMPLE },
];

export const MODULO_BY_KEY = Object.fromEntries(MODULOS.map(m => [m.key, m]));

// Defaults por rol — usados al crear un usuario nuevo.
// Los roles con bypass (super_admin / admin) reciben 'administrar' en todo.
export const DEFAULTS_POR_ROL: Record<string, Partial<Record<string, NivelAcceso>>> = {
  super_admin: Object.fromEntries(MODULOS.map(m => [m.key, 'administrar' as NivelAcceso])),
  admin: Object.fromEntries(MODULOS.map(m => [m.key, 'administrar' as NivelAcceso])),

  gerente: {
    articulos: 'administrar', proveedores: 'administrar', listas_precios: 'administrar',
    clientes: 'administrar', compras: 'administrar', ventas: 'administrar', pos: 'administrar',
    traspasos: 'administrar', devoluciones_proveedor: 'administrar', inventario: 'administrar',
    corte_caja: 'administrar', corte_caja_ruta: 'administrar',
    caducidades: 'administrar', rotacion: 'consultar', rentabilidad_lotes: 'consultar',
    reportes: 'consultar', cuentas_por_pagar: 'capturar', cuentas_por_cobrar: 'capturar', bancos: 'consultar',
    conciliacion: 'capturar', contabilidad: 'sin_acceso', reportes_admin: 'consultar',
    cfdi: 'capturar', impuestos: 'sin_acceso', nomina: 'sin_acceso',
    cargas_masivas: 'capturar', ventas_offline: 'consultar', actividad: 'consultar',
    super_admin: 'sin_acceso',
  },

  subgerente: {
    articulos: 'capturar', proveedores: 'consultar', listas_precios: 'consultar',
    clientes: 'capturar', compras: 'capturar', ventas: 'capturar', pos: 'capturar',
    traspasos: 'capturar', devoluciones_proveedor: 'capturar', inventario: 'capturar',
    corte_caja: 'capturar', corte_caja_ruta: 'capturar',
    caducidades: 'consultar', rotacion: 'consultar', reportes: 'consultar',
    cuentas_por_pagar: 'consultar', cuentas_por_cobrar: 'consultar', ventas_offline: 'consultar',
  },

  ventas: {
    articulos: 'consultar', clientes: 'capturar', ventas: 'capturar', pos: 'capturar',
    inventario: 'consultar', caducidades: 'consultar', ventas_offline: 'capturar', corte_caja: 'capturar',
    corte_caja_ruta: 'capturar',
  },

  almacen_ventas: {
    articulos: 'consultar', clientes: 'capturar', ventas: 'capturar', pos: 'capturar',
    inventario: 'consultar', caducidades: 'consultar', ventas_offline: 'capturar', corte_caja: 'capturar',
    corte_caja_ruta: 'capturar',
    compras: 'consultar',
  },

  almacen: {
    articulos: 'consultar', inventario: 'capturar', traspasos: 'capturar',
    caducidades: 'capturar', compras: 'consultar',
  },

  // Un chofer solo necesita concluir SUS entregas — no ve corte_caja (mostrador).
  repartidor: {
    ventas: 'consultar', clientes: 'consultar', corte_caja_ruta: 'capturar',
  },

  auditoria: {
    articulos: 'consultar', proveedores: 'consultar', clientes: 'consultar',
    compras: 'consultar', ventas: 'consultar', inventario: 'consultar',
    caducidades: 'consultar', rotacion: 'consultar', rentabilidad_lotes: 'consultar',
    reportes: 'consultar', cuentas_por_pagar: 'consultar', cuentas_por_cobrar: 'consultar', bancos: 'consultar',
    conciliacion: 'consultar', contabilidad: 'consultar', cfdi: 'consultar',
    actividad: 'consultar', reportes_admin: 'consultar', ajustes_inventario: 'administrar',
    corte_caja_ruta: 'consultar',
  },

  // Matriz confirmada por Alejandro para roles financieros
  direccion: Object.fromEntries(MODULOS.map(m => [m.key, 'administrar' as NivelAcceso])),

  contabilidad: {
    contabilidad: 'administrar', nomina: 'administrar', cfdi: 'administrar',
    impuestos: 'administrar', cuentas_por_pagar: 'administrar', cuentas_por_cobrar: 'administrar',
    bancos: 'autorizar', conciliacion: 'autorizar',
    reportes_admin: 'consultar', actividad: 'consultar',
    articulos: 'consultar', proveedores: 'consultar', clientes: 'consultar',
    inventario: 'consultar', corte_caja: 'consultar', corte_caja_ruta: 'consultar',
  },

  contraloria: {
    cuentas_por_pagar: 'capturar', cuentas_por_cobrar: 'capturar', bancos: 'capturar', conciliacion: 'capturar',
    contabilidad: 'capturar', cfdi: 'capturar', impuestos: 'capturar',
    nomina: 'consultar', reportes_admin: 'consultar', actividad: 'consultar',
    articulos: 'consultar', proveedores: 'consultar', clientes: 'consultar',
    compras: 'consultar', ventas: 'consultar', inventario: 'consultar', corte_caja: 'consultar',
    corte_caja_ruta: 'consultar',
  },

  tesoreria: {
    bancos: 'autorizar', cuentas_por_pagar: 'autorizar', cuentas_por_cobrar: 'autorizar', conciliacion: 'autorizar',
    contabilidad: 'capturar', reportes_admin: 'consultar',
  },

  contador: {
    contabilidad: 'administrar', nomina: 'administrar', cfdi: 'administrar',
    impuestos: 'administrar', bancos: 'autorizar', cuentas_por_pagar: 'autorizar', cuentas_por_cobrar: 'autorizar',
    conciliacion: 'autorizar', reportes_admin: 'consultar', actividad: 'consultar',
  },

  supervisor: {
    articulos: 'consultar', ventas: 'consultar', pos: 'consultar',
    inventario: 'consultar', reportes: 'consultar', actividad: 'consultar',
  },
};

export function defaultAccessForRole(role: string): Record<string, NivelAcceso> {
  const preset = DEFAULTS_POR_ROL[role] || {};
  const result: Record<string, NivelAcceso> = {};
  for (const m of MODULOS) {
    result[m.key] = (preset[m.key] as NivelAcceso) || 'sin_acceso';
  }
  return result;
}

export function nivelSuficiente(actual: NivelAcceso | undefined, minimo: NivelAcceso): boolean {
  if (!actual) return false;
  return NIVELES_ORDER[actual] >= NIVELES_ORDER[minimo];
}
