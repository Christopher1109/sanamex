# Seguimiento — Junta de revisión SANAMEX (15-ago-2026)

Este documento traduce los puntos de acción de la junta del 15-ago-2026 a
estado de implementación real en el repositorio, para que el equipo pueda
dar seguimiento sin tener que volver a la transcripción cada vez.

Leyenda: ✅ implementado en esta rama · 🟡 implementable pero pendiente de
otra sesión · 🔴 bloqueado esperando información externa (ver tabla de
bloqueos al final).

## 1. Punto de venta — cliente obligatorio y RFC

- ✅ Candado de cliente obligatorio antes de cobrar (contado y crédito).
- ✅ Buscador por RFC/nombre en el selector de cliente (`ClienteSelector`).
- ✅ Alta de cliente sin salir de la venta (`QuickClienteDialog`), guardando
  en el catálogo general de `clientes`.
- Ver `src/components/pos/ClienteSelector.tsx` y
  `src/components/pos/QuickClienteDialog.tsx`, integrados en `POSPage.tsx`.

## 2. Facturación

- 🟡 Portal de autofacturación (sucursal + folio, validación contra SAT).
- 🟡 Bloqueo en tiempo real de tickets ya facturados.
- Requiere definir primero el flujo exacto de validación SAT (RFC, CP, razón
  social) y el punto de bloqueo transaccional del ticket — se recomienda
  como siguiente rama después de esta.

## 3. Corte de caja — mostrador vs. ruta

- 🟡 Separar cortes de mostrador y ruta, accesos de chofer restringidos a
  sus propias órdenes.
- 🔴 Pendiente sin resolver en la junta: quién concluye una venta en
  sucursal cuando el cliente recoge directo (llevarlo a la próxima llamada).

## 4. Clasificación de ventas (contado / ruta / crédito real)

- 🔴 Bloqueado: falta confirmar con Alejandro cómo se reflejan las tres
  categorías en reportes (la junta dejó la idea, no el diseño final).

## 5. Ajustes de inventario

- 🟡 Selección obligatoria de motivo + flujo especial de "confusión de
  producto" (ajuste automático de existencias en ambos productos).
- 🔴 Lista completa de motivos (4-5 casos) pendiente de confirmar con
  Alejandro — solo se identificaron merma, daño y confusión de producto.
- 🟡 Kardex: confirmar con Alejandro si el historial reciente actual ya
  cubre lo que pidió, o si falta algo.

## 6. Cuentas por pagar

- 🟡 Corregir que la orden de compra no aparece en CxP hasta que se le
  asigna folio de factura (bug detectado en vivo durante la demo).
- 🟡 Vista de calendario de vencimientos (CxP y CxC).
- 🔴 Layout de documentos de CxP — bloqueado, Alejandro debe compartirlo.

## 7. Cuentas por cobrar y notas de crédito

- 🟡 Cálculo de saldo pendiente: factura − pagos parciales − notas de
  crédito, con reflejo de saldo a favor cuando el pago excede lo debido.
- 🟡 Agregar días restantes para vencimiento a la vista de CxC.
- 🟡 Agregar el reporte de cuentas por cobrar a Reportes Administrativos.

## 8. Conciliación bancaria y asignación de pagos

- 🟡 Asignar/distribuir un pago conciliado contra varias facturas.
- 🟡 Generación automática de póliza al asignar un pago conciliado.
- Nota: Christopher se comprometió a tener esto listo para la próxima
  llamada — es de las fechas compromiso más cercanas, priorizar.

## 9. Reglas contables y catálogo de cuentas

- 🔴 Bloqueado por completo: Omar (vía Isaac) debe entregar las reglas de
  contabilización actualizadas y el nuevo catálogo de cuentas. No conviene
  avanzar pólizas/reglas hasta tener esto — es la dependencia más grande
  del proyecto en este momento.

## 10. Reportes fiscales, IVA/ISR y timbrado

- Sin cambios pedidos en esta junta (ya validado en llamada anterior).
  Timbrado real sigue pausado (venció el periodo de prueba del proveedor);
  no urge reactivarlo.

## 11. Nómina

- 🟡 Carga de asistencia vía plantilla de Excel (Contabilidad Sanamex
  recopila y carga).
- 🟡 Vinculación trabajador ↔ usuario del sistema.

## 12. Comisiones

- 🔴 Congelado hasta la llamada específica del lunes 17-ago con
  Contabilidad Sanamex — no avanzar el módulo antes de esa llamada.

## 13. Accesos y pruebas

- Pendiente administrativo (compartir usuario/contraseña/liga con
  Alejandro) — no es un cambio de código.

---

## 🔴 Bloqueos activos

| Qué falta | Quién lo manda | Bloquea |
|---|---|---|
| Reglas de contabilización actualizadas | Omar (vía Isaac) | Pólizas automáticas, catálogo contable |
| Nuevo catálogo de cuentas | Omar (vía Isaac) | Reglas contables, pólizas |
| Layouts de documentos de CxP | Alejandro | Formato final de documentos de CxP |
| Esquema de comisiones (archivo/explicación) | Contabilidad Sanamex | Módulo de comisiones — llamada lunes 17-ago |
| Definición de permisos (corte de caja / ajustes de inventario) | Llamada pendiente con Alejandro | Roles y permisos por perfil |
| Lista completa de motivos de ajuste de inventario | Alejandro | Diseño final del flujo de ajustes |
| Confirmación contado/ruta/crédito en reportes | Alejandro | Diseño de reportes de ventas |

## Orden sugerido para las siguientes ramas

1. ✅ Punto de venta: cliente obligatorio + RFC + alta rápida (esta rama).
2. Bloqueo de tickets facturados + portal de autofacturación.
3. Corte de caja mostrador/ruta + accesos de chofer.
4. Ajustes de inventario con motivo + flujo de confusión de producto.
5. CxP/CxC: cálculo de saldo con notas de crédito y pagos parciales.
6. Conciliación bancaria + pólizas automáticas (dejar para cuando lleguen
   las reglas contables y el catálogo nuevo).
7. Comisiones — congelado hasta la llamada del lunes.
8. Reglas contables / catálogo — en paralelo, dar seguimiento a Isaac/Omar.

Fuente: `Revisión SANAMEX contabilidad — Resumen.txt`,
`Revisión SANAMEX contabilidad — Transcripción.txt` y
`Sanamex_Plan_de_Ataque_15ago2026.md` (15-ago-2026).
