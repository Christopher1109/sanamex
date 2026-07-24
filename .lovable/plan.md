# Plan: Cotizador Sanamex — paridad con Excel real

Un proyecto grande. Lo entrego en **5 fases** que puedes aprobar/pausar entre cada una. Nada rompe POS, inventario ni módulos ya conectados.

## Alcance del negocio (recordatorio)
- 4 sucursales: F37, GH, SV, ECA + CEDIS.
- Sugeridos = **cuánto**. Cotizador = **con quién**.
- Cálculos y elección de postor **corren en backend** (RPC/vistas). El cliente solo pinta y edita.

---

## Fase 1 — Modelo de datos (migración)

**Extender `proveedores`** (nuevos campos, sin romper lo existente):
- `entrega_por_sucursal boolean default false`
- `dias_entrega int` (peso alto en ranking)
- `acepta_notas_credito boolean` (ya existe `notas_credito` → alias)
- `frecuencia_listas text` (ej. "lunes y jueves")
- `tiene_lista_regular boolean default true`
- Confirmar/aprovechar: `dias_credito`, `pago_contra_entrega`.

**Nuevas tablas:**
- `cotizador_mapeo_columnas` — mapeo por proveedor de columnas del Excel entrante (codigo_barras_col, precio_col, cantidad_col, hoja, fila_inicio). Guardado y reutilizable.
- `ordenes_compra_transito` — vista/tabla derivada: por (producto_id, sucursal_id) → piezas en tránsito según OC abiertas.
- `productos_sin_lista_flag` — usar `productos.sin_lista_regular boolean` (columna nueva) para exclusión del análisis.

**Extender `ordenes_compra`:**
- `sucursal_destino_id` (para OC por sucursal cuando `entrega_por_sucursal`).
- `folio_cotizacion_ref text` (folio interno de la corrida del cotizador que la originó).

**Vistas materializadas / RPC (motor de cálculo):**
- `v_producto_ventas_30d` (por producto × sucursal, ventana móvil 30 días).
- `v_producto_historico_mensual` (últimos 12 meses × sucursal, con tendencia).
- `v_producto_transito` (piezas abiertas por producto × sucursal).
- **RPC `cotizador_snapshot(filtros)`** → devuelve la tabla principal ya calculada: existencias, ult30, necesidad, DIF, sugerido, DDI, tránsito, ganador, 2º/3º postor, variación de precio. Paginada y filtrable server-side.
- **RPC `cotizador_generar_oc(payload)`** → recibe líneas editadas + proveedor; si `entrega_por_sucursal` genera N órdenes, si no una sola; marca tránsito; regresa folios.

**Fórmulas exactas:**
```
NECESIDAD = clasif ∈ {A,B,C} ? ult30 × 1.3 : ult30 / 1.25
DIF       = NECESIDAD − existencia_sucursal
SUGERIDO  = ceil_a_corrugado(max(0, DIF))  // solo si ganador exige caja
TRANSITO  = existencia_total − Σ existencias_sucursal
DDI       = existencia_total / ult30_total × 30
```

**Ranking de postor** (solo con existencia > 0; `-` y `0` fuera):
```
score = w_precio · z(precio) + w_entrega · z(dias_entrega)
```
Con `w_entrega` > `w_precio` (mayor peso al tiempo de entrega). Empate → menor precio.

---

## Fase 2 — Motor de cotización (backend)

- Implementar las RPCs y vistas anteriores.
- Alimentar `venta_dia_anterior` y `ult30` desde `venta_lineas` filtrado por sucursal (últimos 30 días corridos).
- Histórico mensual desde `venta_lineas` + `ventas_historicas` (12 meses, agrupado).
- Variación precio = `mejor_precio_actual − ultimo_precio_compra` en $ y %.
- Alerta oferta: si `mejor_precio > oferta_vigente.precio_venta` → flag `alerta_oferta`.
- Índices sobre `venta_lineas(fecha, sucursal_id, producto_id)`, `lista_precio_proveedor(producto_id, proveedor_id)` para ~2k productos × 30 proveedores.

---

## Fase 3 — Uploaders y proveedores

- **ProveedoresPage**: campos nuevos (entrega_por_sucursal, dias_entrega, frecuencia_listas, tiene_lista_regular, sin lista → toggle).
- **ListaPreciosUploader**:
  - Modo A: archivo del proveedor + editor de mapeo (columnas). Se guarda en `cotizador_mapeo_columnas` la primera vez y se reutiliza.
  - Modo B: plantilla descargable.
  - Preview: nuevos productos, cambios de precio (Δ$, Δ%), errores. Confirmación antes de commit.
- Al importar, actualizar `ofertas_proveedor` cuando el archivo lo indique.

---

## Fase 4 — UI CotizadorPage (la hoja de cálculo)

Rebuild de la tabla usando **TanStack Table** (ya en el stack o se agrega):
- Columnas fijas a la izquierda: clave, SKU, descripción, clasif, estatus.
- Bloques: CEDIS, totales, tránsito, DDI, venta día anterior, venta 30d.
- Por sucursal (F37/GH/SV/ECA): histórico mensual con tendencia ↑/↓, ult30, necesidad, existencia, DIF, estatus, **SUGERIDO editable**.
- Post-sucursales: último precio compra, mejor precio, Δ$, Δ%, ganador+existencia, 2º, 3º, piezas/corrugado, "sin lista".
- Columnas por proveedor **colapsables** (existencia y precio).
- Filtros/orden/búsqueda en toda columna. Filtros rápidos: por ganador, por estatus (excluir "E"), por sin-lista, por variación.
- Selección múltiple, ocultar filas (soft-hide en estado local), export a Excel.
- Sugerido editable persiste en estado de corrida (localStorage + tabla `cotizaciones_carrito` ya existente).

---

## Fase 5 — Generación de OC + tránsito

- Botón **"Generar orden de compra"** por proveedor ganador (agrupa filas seleccionadas):
  - `entrega_por_sucursal=true` → N órdenes (una por sucursal con piezas > 0).
  - `false` → 1 orden consolidada.
- OC incluye: folio consecutivo, fecha, proveedor+condiciones, sucursal destino, folio cotización ref, renglones (código barras, descripción, piezas, precio con imp., unitario bruto desglosando IVA/IEPS según flags), totales.
- Descarga PDF/Excel; guardada en histórico (OrdenesCompraPage).
- Al generar: `INSERT` en `ordenes_compra_transito`. Al recibir/cerrar → liberar. En cotizador se muestra tránsito para no duplicar.

---

## Pantallas modificadas
- `CotizadorPage.tsx` (rebuild de tabla)
- `CotizadorHubPage.tsx` (tabs sin cambios, solo integración)
- `ReporteSugeridos.tsx` (mantiene fórmula nueva)
- `OrdenesCompraPage.tsx` (mostrar tránsito y origen cotización)
- `ProveedoresPage.tsx` (campos nuevos)
- `ListaPreciosUploader.tsx` + nuevo `MapeoColumnasEditor.tsx`

## Consideraciones técnicas
- Cálculos en RPC Postgres (mejor rendimiento que edge functions para joins).
- `.returns<T>()` en selects grandes para no matar el typecheck (2k×30).
- Paginación server-side (100 filas) con filtros aplicados en el RPC.
- RLS: RPCs `SECURITY DEFINER` con validación de rol Compras/Gerente/Admin.

## Confirmación
Es mucho trabajo. Sugiero aprobar **Fase 1 (migración) primero**; una vez corriendo, avanzo Fase 2 en el mismo turno y las UI en turnos siguientes. ¿Empiezo por Fase 1?
