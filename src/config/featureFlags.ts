// Feature flags centrales del ERP.
// Flip único: cambiar FASE_2_VISIBLE a true restaura toda la Fase 2
// (sidebar, rutas, dashboard comercial) sin migraciones ni cambios de BD.
//
// Fase 1 (administrativa) — siempre visible:
//   Facturación CFDI, Cuentas por Pagar, Registro de Actividad,
//   Super Admin (usuarios/roles/sucursales), Dashboard administrativo.
//
// Fase 2 (operativa/comercial) — oculta por defecto:
//   Productos, Proveedores, Clientes, Listas de Precios, Compras, OC,
//   Devoluciones a Proveedor, Ventas, POS, Pedidos, Traspasos, Inventario,
//   Kardex, Mermas, Caducidades, Ajustes, Cotizador, Rotación,
//   Rentabilidad, reportes comerciales, módulo offline, cargas masivas,
//   dashboard comercial.
export const FASE_2_VISIBLE = false;
