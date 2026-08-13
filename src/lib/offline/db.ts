import Dexie, { type Table } from 'dexie';

// Cached snapshots of server data (read-only mirrors)
export interface CachedProducto {
  id: string;
  sku: string;
  nombre: string;
  descripcion: string | null;
  codigo_barras: string | null;
  categoria: string | null;
  unidad: string | null;
  precio_base: number;
  iva_incluido: boolean;
  activo: boolean;
  stock_minimo: number;
  requiere_lote: boolean;
}

export interface CachedLote {
  id: string;
  producto_id: string;
  numero_lote: string;
  fecha_caducidad: string | null;
  costo_unitario: number;
  proveedor_id: string | null;
}

export interface CachedInventario {
  id: string;
  almacen_id: string;
  lote_id: string;
  cantidad: number; // local cantidad, decremented on offline sales (Opción B reserva)
  cantidad_servidor: number; // last known server value (audit)
  sucursal_id: string;
}

export interface CachedAlmacen {
  id: string;
  sucursal_id: string;
  nombre: string;
  activo: boolean;
}

export interface CachedMetodoPago {
  id: string;
  nombre: string;
  activo: boolean;
}

export interface CachedCliente {
  id: string;
  nombre: string;
  rfc: string | null;
  tipo: string | null;
  activo: boolean;
}

export interface CachedSucursal {
  id: string;
  nombre: string;
  codigo: string;
  activo: boolean;
}

export interface CachedPrecioSucursal {
  id: string;
  producto_id: string;
  sucursal_id: string;
  precio: number;
  activo: boolean;
}

// Pending offline sale waiting to be synced
export interface PendingVenta {
  cliente_uuid_local: string; // primary key (uuid)
  sucursal_id: string;
  cajero_id: string;
  cliente_id: string | null;
  metodo_pago: string;
  efectivo_recibido: number | null;
  notas: string | null;
  requiere_factura?: boolean;
  items: Array<{
    producto_id: string;
    sku: string;
    nombre: string;
    cantidad: number;
    precio_unitario: number;
  }>;
  total: number;
  created_at: string; // ISO local timestamp
  status: 'pending' | 'syncing' | 'synced' | 'error' | 'requires_review';
  error_message: string | null;
  numero_venta_servidor: string | null;
  synced_at: string | null;
  retry_count: number;
}

export interface SyncMetadata {
  key: string;
  value: any;
  updated_at: string;
}

class OfflineDB extends Dexie {
  productos!: Table<CachedProducto, string>;
  lotes!: Table<CachedLote, string>;
  inventario!: Table<CachedInventario, string>;
  almacenes!: Table<CachedAlmacen, string>;
  metodos_pago!: Table<CachedMetodoPago, string>;
  clientes!: Table<CachedCliente, string>;
  sucursales!: Table<CachedSucursal, string>;
  precios_sucursal!: Table<CachedPrecioSucursal, string>;
  pending_ventas!: Table<PendingVenta, string>;
  metadata!: Table<SyncMetadata, string>;

  constructor() {
    super('distribuidora_offline_v1');
    this.version(1).stores({
      productos: 'id, sku, codigo_barras, nombre, activo',
      lotes: 'id, producto_id, fecha_caducidad',
      inventario: 'id, almacen_id, lote_id, sucursal_id, [almacen_id+lote_id]',
      almacenes: 'id, sucursal_id',
      metodos_pago: 'id, nombre',
      clientes: 'id, nombre',
      sucursales: 'id, codigo',
      precios_sucursal: 'id, producto_id, sucursal_id, [producto_id+sucursal_id]',
      pending_ventas: 'cliente_uuid_local, status, sucursal_id, created_at',
      metadata: 'key',
    });
  }
}

export const offlineDB = new OfflineDB();

// Metadata helpers
export const META_KEYS = {
  LAST_SYNC: 'last_sync_at',
  LAST_SUCURSAL_ID: 'last_sucursal_id',
  CACHE_VERSION: 'cache_version',
} as const;

export async function setMeta(key: string, value: any) {
  await offlineDB.metadata.put({ key, value, updated_at: new Date().toISOString() });
}

export async function getMeta<T = any>(key: string): Promise<T | null> {
  const row = await offlineDB.metadata.get(key);
  return row ? (row.value as T) : null;
}
