# Plan: Cotizador Sanamex — cierre de gaps

Gran parte del motor ya está construido en turnos previos. Este plan cubre **solo los deltas** para cumplir 100% con la spec. Confirma antes de que ejecute.

## Estado actual (ya en producción)

- Reglas a–f: `cotizador_snapshot` RPC devuelve `ult30`, `necesidad`, `DIF`, `sugerido_sistema`, `DDI`, `transito_global`, `transito_sucursal`, `venta_dia_anterior`, `tendencia_abs/pct`.
- Motor de cotización con ganador ponderado precio + días de entrega, 2.º y 3.er postor, semántica "-" (fila ausente) vs "0" (existencia_proveedor=0), variación $/%, `alerta_oferta`.
- Tabla tipo Excel `CotizadorSanamex.tsx` con las columnas del listado, sugerido editable en sesión, diálogo de detalle con histórico 12m y OC abiertas.
- Uploaders: plantilla estándar + "archivo tal cual" con mapeo guardado por proveedor.
- `cotizador_generar_oc` genera 1 OC por sucursal o consolidada según `entrega_por_sucursal`, y llena `ordenes_compra_transito`.
- Proveedores con `entrega_por_sucursal`, `dias_entrega`, `frecuencia_listas`, `tiene_lista_regular`, `pago_contra_entrega`, `notas_credito`. Productos con `sin_lista_regular`.

## Deltas a implementar

### A. Backend (1 migración)

1. **`cotizador_sugerido_override`** — persistir el sugerido editado.
   ```
   (producto_id, sucursal_id, cantidad, motivo, usuario_id, updated_at)
   PK compuesta (producto_id, sucursal_id)
   ```
   GRANT, RLS por rol compras/gerente. `cotizador_snapshot` hace LEFT JOIN y devuelve `sugerido_editado` cuando existe → el frontend prioriza ese valor.

2. **`cotizador_upsert_override(producto_id, sucursal_id, cantidad, motivo)`** RPC que registra al usuario.

3. **Ampliar `cotizador_snapshot`**: incluir `historico_12m` (JSONB compacto: `[{mes, unidades}]` últimos 13 meses, con el mes anterior aparte para calcular tendencia mes-vs-mes) por sucursal, **precomputado** en la RPC para 2 000 productos (una sola pasada agregada, sin N+1). Si el costo sube más de 800 ms, cambiar a `mv_cotizador_snapshot` refrescable por botón.

4. **`v_transito_oc_abierto_detalle`** — vista con `producto_id`, `sucursal_id`, `piezas`, `proveedor`, `folio`, `estado` para pintar el indicador inline en la tabla (no requiere abrir el diálogo).

### B. Frontend — `CotizadorSanamex.tsx`

1. **Sugerido editable persistente**: el `onBlur` de la celda editable llama `cotizador_upsert_override`; badge 💾 cuando hay override guardado; botón "restaurar propuesta del sistema" por celda.
2. **Mini-histórico inline por sucursal**: sparkline de 12m + tendencia (Δ piezas vs mes anterior, % con flecha ↑/↓) en cada celda de sucursal, colapsable con toggle global "mostrar histórico".
3. **Columnas por proveedor colapsables**: nuevo grupo de columnas al final con existencia + precio de cada uno de los ~30 proveedores. Toggle "mostrar todos los proveedores"; ocultas por defecto para no saturar.
4. **Indicador de tránsito inline**: chip 🚚 en la celda de sucursal cuando hay OC abierta a esa sucursal para ese SKU (tooltip: folio + proveedor + piezas + estado).
5. **Búsqueda/orden/filtro por columna estilo hoja**: usar TanStack Table con columnFilters y sorting habilitados en todas las columnas (incluidas las por sucursal). Filtros ya activos (proveedor ganador, estatus, sin lista, oferta, variación) se conservan.
6. **Selección múltiple + ocultar filas**: checkbox por fila; botón "Ocultar seleccionadas" (persistido en localStorage por usuario). Botón "Mostrar todo".
7. **Alerta visual de variación**: fondo ambar suave si Δ% > 5, rojo si > 15.

### C. Órdenes de compra — `OrdenesCompraPage.tsx` + `NuevaOrdenCompraDialog`

1. **Vista de OC generada** con: folio interno consecutivo (ya existe), fecha, proveedor + sus condiciones (días crédito, pago contra entrega, notas de crédito, días de entrega), sucursal destino, folio de cotización origen, y renglones con: código de barras, descripción, piezas, precio unitario con impuestos, unitario bruto (aplicando flags `iva_exento` / `ieps_pct` del producto), subtotal, impuestos, total.
2. **Botones de exportación**: descarga Excel (SheetJS) e imprimible (React-to-print) con el layout de OC.
3. **Cierre por recepción**: ya existe el trigger que libera `ordenes_compra_transito` al pasar a `recibida`. Se agrega badge visual "🚚 en tránsito" al listado hasta cerrarse.

### D. Reporte de sugeridos — `ReporteSugeridos.tsx`

- Alinear las columnas con las del cotizador (ult30, necesidad, DIF, sugerido con override, tránsito) para que el reporte impreso coincida con lo que ve compras.
- Filtro "solo con faltante" y export a Excel.

### E. CotizadorHubPage

- Reemplazar cualquier tarjeta que aún apunte a la versión vieja del cotizador. Enlazar a `CotizadorSanamex`, al histórico de OC, y a "Cargas de listas".

## Fuera de alcance (para confirmar si lo quieres)

- Reparto automático entre 2.º y 3.er postor cuando el ganador no cubre → spec dice explícito "el sistema no reparte solo". No lo automatizo.
- Materialización del snapshot como MV con refresh manual: solo si medimos > 800 ms en producción.
- Módulo de ofertas nuevas del proveedor: ya existe `ofertas_proveedor` y se usa para la alerta; no toco su UI.

## Detalles técnicos

- Todos los cálculos siguen en backend (`cotizador_snapshot`, RPCs). El frontend solo pinta y edita.
- Índices ya existentes cubren el volumen (2 000×30). Si el histórico 12m infla la respuesta > 2 MB, lo movemos a RPC separada bajo demanda por sucursal visible.
- Types de Supabase se regeneran al aplicar la migración.

## Entregables al finalizar

- Migración nueva (tabla override + RPC + vista tránsito).
- Cambios en 4 archivos: `CotizadorSanamex.tsx`, `OrdenesCompraPage.tsx`, `ReporteSugeridos.tsx`, `CotizadorHubPage.tsx`.
- Resumen de qué se agregó a la BD y a cada pantalla.

Confirma y arranco. Si quieres que empiece por una sub-parte (por ejemplo A+B primero, C+D después) dímelo.
