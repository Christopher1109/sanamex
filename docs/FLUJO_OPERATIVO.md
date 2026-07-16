# Flujo operativo — Sanamex ERP

Documento en español plano para explicar al cliente cómo fluye una operación
típica de punta a punta. No es documentación técnica.

---

## A. Flujo de una VENTA (POS → Contabilidad)

1. **Cajero captura la venta en POS.**
   - Escanea productos, cobra, imprime ticket.
   - El sistema descuenta el inventario automáticamente (FEFO) y registra
     la venta como `completada`.
2. **(Opcional) Timbrado fiscal (CFDI).**
   - Si el cliente pide factura, en la pantalla **Ventas → Historial**
     aparece el botón **"Timbrar"** en cada venta completada.
   - El cajero/fiscal aprieta el botón, captura los datos del receptor y
     confirma. El CFDI se genera con Facturapi y queda ligado a la venta.
   - Si la venta no requiere factura, este paso se salta — la operación
     igual queda contabilizada por el paso siguiente como ingreso interno.
3. **Generar pólizas contables (una vez al día).**
   - En **Contabilidad**, un usuario con perfil contable aprieta
     **"Generar pólizas del día"**.
   - El sistema crea, en modo BORRADOR, las pólizas necesarias:
     - Ingreso por CFDI (una póliza por cada CFDI timbrado).
     - Costo de ventas (una póliza agrupada por día, con la suma de todas
       las salidas de inventario tipo venta).
   - El contador revisa y autoriza las pólizas borrador desde el mismo módulo.
4. **Cobro (si la venta fue a crédito).**
   - Cuando el cliente paga, se registra el pago en **Pagos recibidos**.
   - El pago dispara automáticamente un movimiento bancario de entrada
     en la cuenta seleccionada; después la siguiente corrida de
     "Generar pólizas del día" contabiliza ese movimiento.

**Acciones manuales que el usuario tiene que hacer:**
- Cobrar en POS.
- Apretar "Timbrar" si el cliente pide factura.
- Apretar "Generar pólizas del día" una vez por día (o cuando el contador lo pida).
- Autorizar/aprobar las pólizas borrador.

**Todo lo demás es automático.**

---

## B. Flujo de una COMPRA (OC → Recepción → Factura → Pago → Contabilidad)

1. **Orden de compra (OC).**
   - En **Compras → Órdenes de compra**, el responsable crea una OC con
     el proveedor y las cantidades solicitadas.
   - Esta OC **NO** genera Cuentas por Pagar todavía — es solo un pedido.
2. **Recepción de la mercancía.**
   - Cuando llega el producto, en la misma OC se aprieta **"Recibir"**.
   - El sistema:
     - Crea el lote con costo y caducidad.
     - Suma la mercancía al inventario.
     - Marca la OC como `parcial` o `recibida`.
   - Todavía no hay CxP.
3. **Registro de la factura del proveedor.**
   - Cuando el proveedor manda la factura (XML/PDF), se captura en
     **Compras → Facturas de proveedor**. Ahí sí se crea un registro en la
     tabla `compras` con el total, IVA, saldo, condiciones de pago, etc.
   - **En este momento se dispara automáticamente la CxP** — el sistema
     crea la Cuenta por Pagar ligada a esa compra (trigger B1).
4. **Pago al proveedor.**
   - En **Cuentas por Pagar** el tesorero selecciona la CxP y registra el
     pago (cuenta bancaria, monto, fecha).
   - El pago:
     - Actualiza `monto_pagado` y estado de la CxP (parcial/pagada).
     - Dispara automáticamente un **movimiento bancario de salida** en la
       cuenta usada (trigger B2).
5. **Devolución al proveedor (si aplica).**
   - Si hay que devolver mercancía, en **Devoluciones a proveedor** se
     captura la devolución.
   - El sistema:
     - Descuenta el inventario del lote devuelto.
     - Crea automáticamente una **nota de crédito en CxP** del proveedor
       (para que el tesorero la aplique contra la siguiente CxP o pago).
6. **Generar pólizas contables (una vez al día).**
   - "Generar pólizas del día" contabiliza en BORRADOR:
     - Cada pago a proveedor (Proveedores → Bancos).
     - Cada movimiento bancario conciliado.
     - Cada devolución a proveedor (Proveedores → Inventario).

**Acciones manuales que el usuario tiene que hacer:**
- Crear la OC.
- Apretar "Recibir" cuando llega la mercancía.
- Capturar la factura del proveedor cuando llega.
- Registrar los pagos.
- Capturar devoluciones si hay.
- Correr "Generar pólizas del día".
- Autorizar pólizas borrador.

**Todo lo demás es automático (CxP, movimientos bancarios, pólizas).**

---

## Regla clave: nada anterior a la fecha de corte

Todas las automatizaciones respetan la **fecha de corte contable**
(hoy: 2026-07-15). Documentos anteriores a esa fecha viven como histórico
y no generan CxP ni pólizas automáticas. Ese blindaje evita ensuciar la
contabilidad con datos pre-Go-Live.

---

## Reglas contables pendientes de confirmar con el contador

Estas quedan inactivas hasta que el contador defina las cuentas:

- IMSS patronal (nomina_imss_patronal)
- ISN estatal (nomina_isn)
- Retención de IVA (retencion_iva)
- Devolución a proveedor (devolucion_proveedor) — cuentas pendientes
- Costo de ventas (costo_venta) — cuentas pendientes

El generador de pólizas automáticamente SALTA cualquier regla marcada
"PENDIENTE DE CONFIRMAR" y lo reporta en el detalle de la ejecución.
