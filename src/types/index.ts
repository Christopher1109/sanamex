export type UserRole =
  | 'super_admin'
  | 'admin'
  | 'gerente'
  | 'subgerente'
  | 'supervisor'
  | 'almacen'          // almacenista puro: recepción, traspasos, mermas, kardex; NO opera POS
  | 'almacen_ventas'   // almacenista que ALSO opera POS para cobertura en caja
  | 'ventas'           // operador POS (anteriormente 'cajero', consolidado)
  | 'repartidor'
  | 'auditoria'        // auditoría operativa (anteriormente 'auditor', consolidado)
  | 'contador'        // contador / finanzas (CxP, bancos, conciliación, fiscal)
  | 'contraloria'     // contraloría: solo lectura financiera / contable
  | 'tesoreria';      // tesorería: bancos, conciliación, CxP con autorización

export interface Sucursal {
  id: string;
  nombre: string;
  codigo: string;
  direccion?: string;
  telefono?: string;
  activo: boolean;
}

export interface Almacen {
  id: string;
  sucursal_id: string;
  nombre: string;
  activo: boolean;
}

export interface Producto {
  id: string;
  sku: string;
  nombre: string;
  descripcion?: string;
  codigo_barras?: string;
  requiere_lote: boolean;
  categoria?: string;
  unidad: string;
  precio_base: number;
  costo_promedio?: number;
  iva_incluido: boolean;
  activo: boolean;
}

export interface Lote {
  id: string;
  producto_id: string;
  numero_lote: string;
  fecha_caducidad?: string;
  proveedor_id?: string;
  costo_unitario: number;
}

export interface Inventario {
  id: string;
  almacen_id: string;
  lote_id: string;
  cantidad: number;
}

export interface MovimientoInventario {
  id: string;
  almacen_id: string;
  lote_id: string;
  tipo: string;
  cantidad: number;
  costo_unitario?: number;
  referencia_tipo?: string;
  referencia_id?: string;
  motivo_id?: string;
  usuario_id?: string;
  sucursal_id?: string;
  notas?: string;
  created_at: string;
}

export interface Venta {
  id: string;
  sucursal_id: string;
  cajero_id: string;
  cliente_id?: string;
  numero_venta: string;
  fecha: string;
  subtotal: number;
  impuestos: number;
  total: number;
  estado: 'completada' | 'cancelada';
  corte_id?: string;
  notas?: string;
}

export interface VentaLinea {
  id: string;
  venta_id: string;
  producto_id: string;
  lote_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface CorteCaja {
  id: string;
  sucursal_id: string;
  cajero_id: string;
  fecha: string;
  efectivo_esperado: number;
  efectivo_recibido: number;
  diferencia: number;
  estado: 'abierto' | 'revision' | 'cerrado';
  notas?: string;
}

export interface Notificacion {
  id: string;
  sucursal_id?: string;
  tipo: 'stock_bajo' | 'caducidad' | 'sistema';
  severidad: 'info' | 'warning' | 'critical';
  titulo: string;
  mensaje: string;
  leida: boolean;
  created_at: string;
}
