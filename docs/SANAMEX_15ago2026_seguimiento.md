# Seguimiento — Junta de revisión SANAMEX (15-ago-2026)

Actualizado: 19-ago-2026. Estado real de cada punto del Plan de Ataque
contra lo que ya existe en el sistema.

Leyenda: ✅ hecho · 🟡 parcial · ⬜ pendiente · 🔴 bloqueado por información externa

## 1. Punto de venta — cliente obligatorio y RFC
- ✅ Cliente obligatorio antes de cobrar.
- ✅ Búsqueda por RFC/nombre contra la base completa (server-side, +11k clientes).
- ✅ Alta rápida de cliente desde la venta, guardada en el catálogo general.

## 2. Facturación
- ✅ Etiqueta "pidió factura" en POS y timbrado desde el historial de ventas.
- ✅ Bloqueo de tickets ya facturados (el historial marca "Facturada" y no permite retimbrar).
- ✅ Múltiples folios de venta en una sola factura (cfdi_ventas_agrupadas).
- ⬜ Portal de autofacturación para el cliente (sucursal + folio + validación SAT).
- 🟡 Timbrado real pausado: venció el periodo de prueba del proveedor.

## 3. Corte de caja — mostrador vs. ruta
- ✅ Dos módulos separados: Corte de Caja Mostrador y Corte de Caja Ruta.
- ✅ Venta a domicilio marcada en POS (sale a ruta) y concluida por el chofer con el método de cobro real.
- ✅ Chofer restringido por RLS a sus propias entregas; no ve el corte de mostrador.
- ✅ Desglose de artículos (SKU, descripción, cantidad, importe) por entrega.
- 🟡 Segmentar qué orden se asigna a cada chofer cuando hay varios en la sucursal.
- 🟡 Candado de "no modificar método de pago después" con log de excepción del gerente.
- 🔴 Quién concluye la venta cuando el cliente recoge en sucursal (definir con Alejandro).

## 4. Clasificación de ventas (contado / ruta / crédito real)
- ✅ `tipo_venta` (contado/crédito) capturado en POS y pedidos; estatus "en ruta".
- 🔴 Diseño final de los tres cortes en reportes — falta confirmación de Alejandro.

## 5. Ajustes de inventario
- ✅ Motivo obligatorio como primer paso.
- ✅ Flujo especial "confusión de producto" con ajuste automático de ambas existencias.
- ✅ Kardex con historial completo de entradas/salidas.
- 🟡 Permisos restringidos a gerente/subgerente (revisar matriz).
- 🔴 Lista completa de motivos (faltan 1-2 por confirmar).

## 6. Cuentas por pagar
- ✅ Ciclo OC → factura(s) → nota de crédito ligado; múltiples facturas por OC.
- ✅ Forma de pago, días de crédito del proveedor y fecha límite automática.
- ✅ Pago por factura completa: fecha, método, cuenta bancaria, referencia y comprobante PDF obligatorio.
- ✅ Corregido el bug de la demo: la OC entra a CxP al registrar la factura (trigger `tg_compras_to_cxp`).
- ✅ Orden por vencimiento próximo + semáforo.
- ✅ Vista de calendario de vencimientos (CxP y CxC).
- 🔴 Layout del documento de CxP — Alejandro debe compartirlo.

## 7. Cuentas por cobrar y notas de crédito
- ✅ Módulo de Cobranza con saldo = factura − abonos − notas de crédito.
- ✅ Abonos con fecha, método, cuenta y comprobante obligatorio.
- ✅ Notas de crédito de cliente (`crear_nota_credito_cliente`) diferenciadas del abono.
- ✅ Reporte de antigüedad de CxC en Reportes Administrativos.
- ✅ Calendario de vencimientos compartido con CxP.
- 🟡 Saldo a favor cuando el pago excede lo debido tras una nota de crédito.
- 🟡 Columna de días restantes al vencimiento en la vista de CxC.

## 8. Conciliación bancaria y asignación de pagos
- ✅ Movimiento del banco ligado a cliente/proveedor (`conciliacion_enviar_a_cuenta`).
- ⬜ Distribuir un mismo pago conciliado contra varias facturas.
- ⬜ Descontar automáticamente del historial de crédito al aplicar.
- ⬜ Póliza automática precargada (origen/destino) al asignar el pago.
- Es el compromiso con fecha más cercana: priorizar.

## 9. Reglas contables y catálogo de cuentas
- ✅ Catálogo real cargado, saldos de apertura corregidos, 21 reglas registradas (inactivas).
- ✅ Enlace banco ↔ cuenta contable (BBVA → 102-01-001).
- 🔴 Reglas de contabilización actualizadas y catálogo nuevo definitivo — Omar vía Isaac.

## 10. Reportes fiscales, IVA/ISR
- ✅ Sin cambios pedidos; módulos operando. IEPS eliminado por indicación posterior.
- 🟡 Timbrado real pausado (proveedor).

## 11. Nómina
- ✅ Vinculación trabajador ↔ usuario del sistema.
- ✅ Carga de asistencia por plantilla de Excel con la nomenclatura de "Lista de Raya" y plantilla descargable.
- ✅ Recibos con desglose, PDF/XML y dispersión bancaria (`dispersar_nomina`).
- ✅ Confirmado: Contabilidad Sanamex recaba y carga la asistencia.
- ⬜ Checador de huella (a futuro, no urgente).

## 12. Comisiones y metas
- 🟡 Motor con escalones por utilidad de sucursal + comisión por vendedor ya construido.
- 🔴 Validar rangos reales con Contabilidad Sanamex (llamada pendiente).

## 13. Accesos y pruebas
- ✅ Panel de Gestión de Usuarios y Permisos (Super Admin) como única fuente de verdad.
- Pendiente administrativo: compartir accesos con Alejandro.

---

## Lo que sigue (orden sugerido)
1. Conciliación: reparto de un pago entre varias facturas + póliza automática (compromiso más cercano).
2. Portal de autofacturación del cliente.
3. Saldo a favor + días restantes en CxC.
4. Asignación de entregas por chofer y candado del método de pago en mostrador.
5. Reglas contables definitivas y comisiones — al recibir la información de Sanamex.

## 🔴 Bloqueos activos
| Qué falta | Quién lo manda | Bloquea |
|---|---|---|
| Reglas de contabilización + catálogo nuevo | Omar (vía Isaac) | Pólizas automáticas |
| Layout de documentos de CxP | Alejandro | Formato del documento |
| Esquema real de comisiones | Contabilidad Sanamex | Cierre del módulo |
| Lista completa de motivos de ajuste | Alejandro | Cierre de ajustes |
| Diseño de reportes contado/ruta/crédito | Alejandro | Reportes de ventas |
| Quién concluye la venta de mostrador recogida en sucursal | Alejandro | Candado de corte |
