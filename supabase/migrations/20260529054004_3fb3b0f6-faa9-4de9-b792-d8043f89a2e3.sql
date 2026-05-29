
-- Helper macro: replace policies that only allow admin/gerente to also allow super_admin

-- COMPRAS
DROP POLICY IF EXISTS "Admin/gerente actualizan compras" ON public.compras;
DROP POLICY IF EXISTS "Admin/gerente crean compras" ON public.compras;
CREATE POLICY "Operativos crean compras" ON public.compras FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gerente'::app_role) OR has_role(auth.uid(), 'subgerente'::app_role) OR
    has_role(auth.uid(), 'almacen'::app_role)
  );
CREATE POLICY "Operativos actualizan compras" ON public.compras FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gerente'::app_role) OR has_role(auth.uid(), 'subgerente'::app_role) OR
    has_role(auth.uid(), 'almacen'::app_role)
  );

-- LOTES
DROP POLICY IF EXISTS "Almacen actualiza lotes" ON public.lotes;
DROP POLICY IF EXISTS "Almacen crea lotes" ON public.lotes;
CREATE POLICY "Operativos crean lotes" ON public.lotes FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gerente'::app_role) OR has_role(auth.uid(), 'subgerente'::app_role) OR
    has_role(auth.uid(), 'almacen'::app_role)
  );
CREATE POLICY "Operativos actualizan lotes" ON public.lotes FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gerente'::app_role) OR has_role(auth.uid(), 'subgerente'::app_role) OR
    has_role(auth.uid(), 'almacen'::app_role)
  );

-- INVENTARIO
DROP POLICY IF EXISTS "Operativos actualizan inventario" ON public.inventario;
DROP POLICY IF EXISTS "Operativos crean inventario" ON public.inventario;
CREATE POLICY "Operativos crean inventario" ON public.inventario FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gerente'::app_role) OR has_role(auth.uid(), 'subgerente'::app_role) OR
    has_role(auth.uid(), 'almacen'::app_role) OR has_role(auth.uid(), 'cajero'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role)
  );
CREATE POLICY "Operativos actualizan inventario" ON public.inventario FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gerente'::app_role) OR has_role(auth.uid(), 'subgerente'::app_role) OR
    has_role(auth.uid(), 'almacen'::app_role) OR has_role(auth.uid(), 'cajero'::app_role) OR
    has_role(auth.uid(), 'ventas'::app_role)
  );

-- TRASPASOS
DROP POLICY IF EXISTS "Almacen actualiza traspasos" ON public.traspasos;
DROP POLICY IF EXISTS "Almacen crea traspasos" ON public.traspasos;
CREATE POLICY "Operativos crean traspasos" ON public.traspasos FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gerente'::app_role) OR has_role(auth.uid(), 'subgerente'::app_role) OR
    has_role(auth.uid(), 'almacen'::app_role)
  );
CREATE POLICY "Operativos actualizan traspasos" ON public.traspasos FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'gerente'::app_role) OR has_role(auth.uid(), 'subgerente'::app_role) OR
    has_role(auth.uid(), 'almacen'::app_role)
  );

-- SUCURSALES / ALMACENES / METODOS / MOTIVOS (admin-only -> añadir super_admin)
DROP POLICY IF EXISTS "Admin actualiza sucursales" ON public.sucursales;
DROP POLICY IF EXISTS "Admin inserta sucursales" ON public.sucursales;
CREATE POLICY "Admin actualiza sucursales" ON public.sucursales FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "Admin inserta sucursales" ON public.sucursales FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));

DROP POLICY IF EXISTS "Admin actualiza almacenes" ON public.almacenes;
DROP POLICY IF EXISTS "Admin inserta almacenes" ON public.almacenes;
CREATE POLICY "Admin actualiza almacenes" ON public.almacenes FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "Admin inserta almacenes" ON public.almacenes FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));

DROP POLICY IF EXISTS "Admin actualiza metodos" ON public.metodos_pago;
DROP POLICY IF EXISTS "Admin inserta metodos" ON public.metodos_pago;
CREATE POLICY "Admin actualiza metodos" ON public.metodos_pago FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "Admin inserta metodos" ON public.metodos_pago FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));

DROP POLICY IF EXISTS "Admin actualiza motivos" ON public.motivos_ajuste;
DROP POLICY IF EXISTS "Admin inserta motivos" ON public.motivos_ajuste;
CREATE POLICY "Admin actualiza motivos" ON public.motivos_ajuste FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "Admin inserta motivos" ON public.motivos_ajuste FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));

-- PRODUCTOS / PRECIOS / PROVEEDORES
DROP POLICY IF EXISTS "Admin/gerente actualizan productos" ON public.productos;
DROP POLICY IF EXISTS "Admin/gerente crean productos" ON public.productos;
CREATE POLICY "Admin/gerente actualizan productos" ON public.productos FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));
CREATE POLICY "Admin/gerente crean productos" ON public.productos FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));

DROP POLICY IF EXISTS "Admin/gerente actualizan precios" ON public.producto_precios_sucursal;
DROP POLICY IF EXISTS "Admin/gerente crean precios" ON public.producto_precios_sucursal;
CREATE POLICY "Admin/gerente actualizan precios" ON public.producto_precios_sucursal FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));
CREATE POLICY "Admin/gerente crean precios" ON public.producto_precios_sucursal FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));

DROP POLICY IF EXISTS "Admin/gerente actualizan proveedores" ON public.proveedores;
DROP POLICY IF EXISTS "Admin/gerente crean proveedores" ON public.proveedores;
CREATE POLICY "Admin/gerente actualizan proveedores" ON public.proveedores FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));
CREATE POLICY "Admin/gerente crean proveedores" ON public.proveedores FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'gerente'::app_role));

-- VENTAS
DROP POLICY IF EXISTS "Admin actualiza ventas" ON public.ventas;
DROP POLICY IF EXISTS "Cajeros crean ventas" ON public.ventas;
CREATE POLICY "Operativos actualizan ventas" ON public.ventas FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR
    has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role) OR
    has_role(auth.uid(),'cajero'::app_role) OR has_role(auth.uid(),'ventas'::app_role)
  );
CREATE POLICY "Cajeros crean ventas" ON public.ventas FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR
    has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role) OR
    has_role(auth.uid(),'cajero'::app_role) OR has_role(auth.uid(),'ventas'::app_role)
  );

-- CORTES
DROP POLICY IF EXISTS "Cajeros crean cortes" ON public.cortes_caja;
DROP POLICY IF EXISTS "Gerentes actualizan cortes" ON public.cortes_caja;
CREATE POLICY "Cajeros crean cortes" ON public.cortes_caja FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR
    has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'cajero'::app_role)
  );
CREATE POLICY "Gerentes actualizan cortes" ON public.cortes_caja FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR
    has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'cajero'::app_role)
  );

-- CONCILIACION
DROP POLICY IF EXISTS "Auditor actualiza conciliacion" ON public.conciliacion_bancaria;
DROP POLICY IF EXISTS "Auditor crea conciliacion" ON public.conciliacion_bancaria;
DROP POLICY IF EXISTS "Auditor ve conciliacion" ON public.conciliacion_bancaria;
CREATE POLICY "Auditor ve conciliacion" ON public.conciliacion_bancaria FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR
    has_role(auth.uid(),'auditor'::app_role) OR has_role(auth.uid(),'gerente'::app_role)
  );
CREATE POLICY "Auditor crea conciliacion" ON public.conciliacion_bancaria FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR
    has_role(auth.uid(),'auditor'::app_role)
  );
CREATE POLICY "Auditor actualiza conciliacion" ON public.conciliacion_bancaria FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR
    has_role(auth.uid(),'auditor'::app_role)
  );

-- USER_ROLES
DROP POLICY IF EXISTS "Admin actualiza roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admin elimina roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admin inserta roles" ON public.user_roles;
CREATE POLICY "Admin actualiza roles" ON public.user_roles FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "Admin elimina roles" ON public.user_roles FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));
CREATE POLICY "Admin inserta roles" ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'super_admin'::app_role));

-- AUDIT LOG ver
DROP POLICY IF EXISTS "Admin ve logs" ON public.audit_log;
CREATE POLICY "Admin ve logs" ON public.audit_log FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR
    has_role(auth.uid(),'auditor'::app_role) OR has_role(auth.uid(),'gerente'::app_role)
  );

-- RUTAS crear
DROP POLICY IF EXISTS "Operativos crean rutas" ON public.rutas;
CREATE POLICY "Operativos crean rutas" ON public.rutas FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(),'super_admin'::app_role) OR has_role(auth.uid(),'admin'::app_role) OR
    has_role(auth.uid(),'gerente'::app_role) OR has_role(auth.uid(),'subgerente'::app_role) OR
    has_role(auth.uid(),'almacen'::app_role) OR has_role(auth.uid(),'repartidor'::app_role)
  );
