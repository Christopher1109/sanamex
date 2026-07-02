-- audit_log: INSERT was TO public
DROP POLICY IF EXISTS "Autenticados crean logs" ON public.audit_log;
CREATE POLICY "Autenticados crean logs" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- bolsas_valores
DROP POLICY IF EXISTS "Autenticados crean bolsas" ON public.bolsas_valores;
DROP POLICY IF EXISTS "Todos ven bolsas" ON public.bolsas_valores;
DROP POLICY IF EXISTS "Autenticados actualizan bolsas" ON public.bolsas_valores;
CREATE POLICY "Autenticados ven bolsas" ON public.bolsas_valores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados crean bolsas" ON public.bolsas_valores FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
              OR has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role)
              OR has_role(auth.uid(),'cajero'::app_role));
CREATE POLICY "Autenticados actualizan bolsas" ON public.bolsas_valores FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
         OR has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role));

-- clientes
DROP POLICY IF EXISTS "Autenticados crean clientes" ON public.clientes;
DROP POLICY IF EXISTS "Todos ven clientes" ON public.clientes;
DROP POLICY IF EXISTS "Autenticados actualizan clientes" ON public.clientes;
CREATE POLICY "Autenticados ven clientes" ON public.clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados crean clientes" ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Autenticados actualizan clientes" ON public.clientes FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- compra_lineas
DROP POLICY IF EXISTS "Operativos crean compra lineas" ON public.compra_lineas;
DROP POLICY IF EXISTS "Todos ven compra lineas" ON public.compra_lineas;
DROP POLICY IF EXISTS "Operativos actualizan compra lineas" ON public.compra_lineas;
CREATE POLICY "Autenticados ven compra lineas" ON public.compra_lineas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operativos crean compra lineas" ON public.compra_lineas FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
              OR has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role)
              OR has_role(auth.uid(),'almacen'::app_role));
CREATE POLICY "Operativos actualizan compra lineas" ON public.compra_lineas FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
         OR has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role)
         OR has_role(auth.uid(),'almacen'::app_role));

-- compras SELECT
DROP POLICY IF EXISTS "Todos ven compras" ON public.compras;
CREATE POLICY "Autenticados ven compras" ON public.compras FOR SELECT TO authenticated USING (true);

-- cortes_caja SELECT
DROP POLICY IF EXISTS "Todos ven cortes" ON public.cortes_caja;
CREATE POLICY "Autenticados ven cortes" ON public.cortes_caja FOR SELECT TO authenticated USING (true);

-- devolucion_proveedor_lineas SELECT
DROP POLICY IF EXISTS "Todos ven lineas devolucion" ON public.devolucion_proveedor_lineas;
CREATE POLICY "Autenticados ven lineas devolucion" ON public.devolucion_proveedor_lineas FOR SELECT TO authenticated USING (true);

-- devoluciones_proveedor SELECT
DROP POLICY IF EXISTS "Operativos ven devoluciones" ON public.devoluciones_proveedor;
CREATE POLICY "Autenticados ven devoluciones" ON public.devoluciones_proveedor FOR SELECT TO authenticated USING (true);

-- inventario SELECT
DROP POLICY IF EXISTS "Todos ven inventario" ON public.inventario;
CREATE POLICY "Autenticados ven inventario" ON public.inventario FOR SELECT TO authenticated USING (true);

-- lotes SELECT
DROP POLICY IF EXISTS "Todos ven lotes" ON public.lotes;
CREATE POLICY "Autenticados ven lotes" ON public.lotes FOR SELECT TO authenticated USING (true);

-- movimientos_inventario
DROP POLICY IF EXISTS "Autenticados crean movimientos" ON public.movimientos_inventario;
DROP POLICY IF EXISTS "Todos ven movimientos" ON public.movimientos_inventario;
CREATE POLICY "Autenticados ven movimientos" ON public.movimientos_inventario FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados crean movimientos" ON public.movimientos_inventario FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- password_resets_log: remove plaintext password column
ALTER TABLE public.password_resets_log DROP COLUMN IF EXISTS password_assigned;

-- pedido_lineas
DROP POLICY IF EXISTS "Operativos crean pedido lineas" ON public.pedido_lineas;
DROP POLICY IF EXISTS "Todos ven pedido lineas" ON public.pedido_lineas;
CREATE POLICY "Autenticados ven pedido lineas" ON public.pedido_lineas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operativos crean pedido lineas" ON public.pedido_lineas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- pedidos
DROP POLICY IF EXISTS "Operativos crean pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Todos ven pedidos" ON public.pedidos;
DROP POLICY IF EXISTS "Operativos actualizan pedidos" ON public.pedidos;
CREATE POLICY "Autenticados ven pedidos" ON public.pedidos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operativos crean pedidos" ON public.pedidos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Operativos actualizan pedidos" ON public.pedidos FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- producto_precios_escalonados SELECT
DROP POLICY IF EXISTS "Todos ven precios escalonados" ON public.producto_precios_escalonados;
CREATE POLICY "Autenticados ven precios escalonados" ON public.producto_precios_escalonados FOR SELECT TO authenticated USING (true);

-- producto_precios_sucursal SELECT
DROP POLICY IF EXISTS "Todos ven precios" ON public.producto_precios_sucursal;
CREATE POLICY "Autenticados ven precios sucursal" ON public.producto_precios_sucursal FOR SELECT TO authenticated USING (true);

-- profiles
DROP POLICY IF EXISTS "Usuario inserta perfil" ON public.profiles;
DROP POLICY IF EXISTS "Todos ven perfiles" ON public.profiles;
DROP POLICY IF EXISTS "Usuario actualiza perfil" ON public.profiles;
CREATE POLICY "Autenticados ven perfiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Usuario inserta su perfil" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Usuario actualiza su perfil" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- proveedores SELECT
DROP POLICY IF EXISTS "Todos ven proveedores" ON public.proveedores;
CREATE POLICY "Autenticados ven proveedores" ON public.proveedores FOR SELECT TO authenticated USING (true);

-- ruta_entregas
DROP POLICY IF EXISTS "Autenticados crean entregas" ON public.ruta_entregas;
DROP POLICY IF EXISTS "Todos ven entregas" ON public.ruta_entregas;
DROP POLICY IF EXISTS "Autenticados actualizan entregas" ON public.ruta_entregas;
CREATE POLICY "Autenticados ven entregas" ON public.ruta_entregas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados crean entregas" ON public.ruta_entregas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Autenticados actualizan entregas" ON public.ruta_entregas FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

-- rutas
DROP POLICY IF EXISTS "Todos ven rutas" ON public.rutas;
DROP POLICY IF EXISTS "Operativos actualizan rutas" ON public.rutas;
CREATE POLICY "Autenticados ven rutas" ON public.rutas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Operativos actualizan rutas" ON public.rutas FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role)
         OR has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role)
         OR has_role(auth.uid(),'almacen'::app_role));

-- traspaso_lineas
DROP POLICY IF EXISTS "Autenticados crean lineas traspaso" ON public.traspaso_lineas;
DROP POLICY IF EXISTS "Todos ven lineas traspaso" ON public.traspaso_lineas;
CREATE POLICY "Autenticados ven lineas traspaso" ON public.traspaso_lineas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Autenticados crean lineas traspaso" ON public.traspaso_lineas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- traspasos SELECT
DROP POLICY IF EXISTS "Todos ven traspasos" ON public.traspasos;
CREATE POLICY "Autenticados ven traspasos" ON public.traspasos FOR SELECT TO authenticated USING (true);

-- user_roles SELECT
DROP POLICY IF EXISTS "Todos ven roles" ON public.user_roles;
CREATE POLICY "Autenticados ven roles" ON public.user_roles FOR SELECT TO authenticated USING (true);

-- venta_lineas
DROP POLICY IF EXISTS "Cajeros crean lineas" ON public.venta_lineas;
DROP POLICY IF EXISTS "Todos ven lineas" ON public.venta_lineas;
CREATE POLICY "Autenticados ven venta lineas" ON public.venta_lineas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Cajeros crean venta lineas" ON public.venta_lineas FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- venta_pagos
DROP POLICY IF EXISTS "Cajeros crean pagos" ON public.venta_pagos;
DROP POLICY IF EXISTS "Todos ven pagos" ON public.venta_pagos;
CREATE POLICY "Autenticados ven venta pagos" ON public.venta_pagos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Cajeros crean venta pagos" ON public.venta_pagos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ventas SELECT
DROP POLICY IF EXISTS "Todos ven ventas" ON public.ventas;
CREATE POLICY "Autenticados ven ventas" ON public.ventas FOR SELECT TO authenticated USING (true);

-- Revoke EXECUTE on SECURITY DEFINER functions from anon/public.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.sig || ' FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.sig || ' FROM anon';
  END LOOP;
END $$;

-- Also revoke from authenticated for trigger-only / internal helpers.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true
      AND p.proname IN (
        'update_updated_at_column','trg_recalc_oc','trg_recalc_cpp_from_movimiento',
        'recalc_compra_pagos','recalc_poliza_totales','check_poliza_balanceada',
        'bloquear_roles_deprecados','notify_stock_bajo','recalc_costo_promedio',
        'recalc_total_oc'
      )
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || r.sig || ' FROM authenticated';
  END LOOP;
END $$;

-- Rebuild view without SECURITY DEFINER semantics.
ALTER VIEW IF EXISTS public.vista_fill_rate_proveedores SET (security_invoker = true);