# Plan de implementación — Sanamex Fase 1

Trabajaré en 9 bloques. Después de cada bloque te aviso para que valides antes de pasar al siguiente, así no acumulamos cambios sin revisión.

## Bloque 1 — Sucursales (15 min)
- Limpiar sucursales actuales y crear exactamente 4:
  - Sanamex San Vicente (SMX-SV)
  - Sanamex Iztapalapa F36 (SMX-F36)
  - Sanamex Iztapalapa H (SMX-H)
  - Sanamex Ecatepec (SMX-ECA)
- Crear 1 almacén principal por sucursal.

## Bloque 2 — Roles y permisos según Matriz SICAR
- Agregar al enum `app_role`: `super_admin`, `supervisor`, `subgerente`, `auditoria`, `almacen_ventas`, `ventas`. Mantener `admin`, `gerente`.
- Crear tabla `role_permissions` (rol, modulo, submodulo, permitido).
- Sembrar los permisos del Excel **ignorando módulos de restaurante** (Comandero, Cocina, Platillos, Combos, Membresías, Producción, Checador, Asistencia, Vacaciones).
- Crear función `has_permission(user_id, modulo, submodulo)` SECURITY DEFINER.
- Actualizar Sidebar y guards de página para usar `has_permission`.

## Bloque 3 — Usuarios genéricos por sucursal
Edge function `seed-sanamex-users` que crea (contraseña genérica `Sanamex2026!`):

| Usuario | Rol | Sucursal |
|---|---|---|
| superadmin | super_admin | global |
| admin_general | admin | global |
| gerente_sv, gerente_f36, gerente_h, gerente_eca | gerente | c/u |
| subgerente_sv, subgerente_f36, subgerente_h, subgerente_eca | subgerente | c/u |
| ventas1_sv, ventas2_sv … (8) | ventas | c/u |
| almacen_sv, almacen_f36, almacen_h, almacen_eca | almacen_ventas | c/u |
| chofer_sv, chofer_f36, chofer_h, chofer_eca | repartidor | c/u |

Total: 24 usuarios. Tabla `user_sucursal_asignacion` para vincular usuario↔sucursal.

## Bloque 4 — Panel del Super Admin
Nueva página `/super-admin` visible solo para `super_admin`:
- Lista usuarios con: rol, username, sucursal, estado activo, última contraseña asignada por admin.
- Acciones: **Resetear contraseña** (asigna nueva visible una sola vez), **Habilitar/Deshabilitar**, **Renombrar usuario**.
- Tabla `password_resets_log` registra cada reset (auditoría).
- **No guardamos contraseñas en texto plano** (decisión aprobada: opción segura). Mostramos solo la última asignada por el admin; si el usuario la cambia luego, el panel indica "modificada por el usuario" y permite forzar nuevo reset.

## Bloque 5 — Centro de notificaciones (umbral 30)
- Tabla `notificaciones` (user_id|sucursal_id, tipo, severidad, titulo, mensaje, entidad_id, leida_at).
- Trigger en `inventario`: cuando stock total de un producto en una sucursal queda ≤ 30, genera notificación "stock bajo".
- Trigger en `lotes`: notificación cuando un lote está a 30/15/7 días de caducar.
- Campana en Header con badge de no leídas + dropdown de últimas 20 + página `/notificaciones`.
- Realtime suscripción para push instantáneo.

## Bloque 6 — Costo real + Costo promedio ponderado (CPP)
- `productos.costo_promedio` (numeric).
- Función `recalc_costo_promedio(producto_id)` = Σ(cantidad × costo) / Σ(cantidad) de inventario activo.
- Trigger en `movimientos_inventario` (entradas) que recalcula CPP del producto.
- En `InventarioPage`: columnas Costo último, Costo promedio, Valor total (cantidad × CPP) y total valorizado por sucursal.

## Bloque 7 — Módulo fiscal (estructura, sin PAC)
- Tabla `cfdi_emitidos` (venta_id, uuid_sat, serie, folio, xml_url, pdf_url, estado [pendiente, timbrado, cancelado, error], pac_response, timbrado_at).
- Tabla `configuracion_fiscal` (rfc_emisor, razon_social, regimen_fiscal, lugar_expedicion, certificado_url, llave_url, pac_proveedor placeholder).
- Página `/fiscal` con: configuración del emisor, lista de CFDI emitidos, botón "Timbrar" deshabilitado con leyenda "Integración PAC pendiente". Solo `admin`/`super_admin`.

## Bloque 8 — Módulo de recomendaciones (con IA)
- Edge function `recomendaciones-compra` que:
  1. Consulta histórico (ventas últimos 90 días, compras, lotes, mermas).
  2. Calcula consumo diario promedio, días de cobertura, mejor proveedor histórico por producto.
  3. Manda contexto resumido a Lovable AI (`google/gemini-2.5-flash`) para que genere recomendaciones en lenguaje natural con: producto, fecha sugerida, proveedor sugerido, cantidad, justificación.
- Tabla `recomendaciones` para cachear resultados (refresca cada 24h).
- Página `/recomendaciones` con tarjetas por producto + acción "Crear orden de compra".

## Bloque 9 — Cargas masivas
- Página `/cargas-masivas` (solo `gerente`, `admin`, `super_admin`).
- 3 plantillas Excel descargables: Productos, Proveedores, Clientes.
- Parser cliente con `xlsx`, valida y muestra preview antes de insertar.
- Tabla `cargas_masivas_historico` (tipo, archivo_nombre, filas_ok, filas_error, errores_json, usuario_id, fecha) → alimenta a `recomendaciones-compra`.
- Sección "Históricos" lista todas las cargas previas con detalle de errores.

---

## Detalle técnico relevante
- Todas las nuevas tablas: `GRANT` correcto + RLS por rol usando `has_role`/`has_permission`.
- Notificaciones y permisos cacheados en `useAuth` para evitar consultas en cada render.
- Edge functions nuevas: `seed-sanamex-users`, `super-admin-reset-password`, `super-admin-toggle-user`, `recomendaciones-compra`.
- El módulo fiscal queda con todo el esqueleto de BD listo para enchufar Facturama/cualquier PAC después con solo crear `timbrar-venta`.

## Ejecución
Empiezo por los Bloques 1 + 2 + 3 juntos (son la base de todo lo demás), te aviso, y continúo. ¿Le damos?