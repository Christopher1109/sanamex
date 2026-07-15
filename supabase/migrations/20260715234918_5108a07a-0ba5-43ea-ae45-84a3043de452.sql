
-- 1. empleados
DROP POLICY IF EXISTS emp_read ON public.empleados;
CREATE POLICY emp_read_admin ON public.empleados FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR
  has_role(auth.uid(),'contador') OR has_role(auth.uid(),'contabilidad') OR
  has_role(auth.uid(),'contraloria') OR has_role(auth.uid(),'direccion') OR
  has_role(auth.uid(),'tesoreria')
);

-- 2. profiles
DROP POLICY IF EXISTS "Autenticados ven perfiles" ON public.profiles;
CREATE POLICY profiles_self_or_admin ON public.profiles FOR SELECT TO authenticated
USING (
  auth.uid() = id OR has_role(auth.uid(),'super_admin') OR
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'direccion')
);

-- 3. clientes
DROP POLICY IF EXISTS "Autenticados ven clientes" ON public.clientes;
CREATE POLICY clientes_select_comercial ON public.clientes FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR
  has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'subgerente') OR
  has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'ventas') OR
  has_role(auth.uid(),'almacen_ventas') OR has_role(auth.uid(),'cajero') OR
  has_role(auth.uid(),'repartidor') OR has_role(auth.uid(),'contador') OR
  has_role(auth.uid(),'contabilidad') OR has_role(auth.uid(),'auditoria') OR
  has_role(auth.uid(),'direccion')
);

-- 4. proveedores
DROP POLICY IF EXISTS "Autenticados ven proveedores" ON public.proveedores;
CREATE POLICY proveedores_select_operativo ON public.proveedores FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR
  has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'subgerente') OR
  has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'compras') OR
  has_role(auth.uid(),'almacen') OR has_role(auth.uid(),'almacen_ventas') OR
  has_role(auth.uid(),'contador') OR has_role(auth.uid(),'contabilidad') OR
  has_role(auth.uid(),'tesoreria') OR has_role(auth.uid(),'auditoria') OR
  has_role(auth.uid(),'direccion')
);

-- 5. user_roles
DROP POLICY IF EXISTS "Autenticados ven roles" ON public.user_roles;
CREATE POLICY user_roles_self_or_admin ON public.user_roles FOR SELECT TO authenticated
USING (
  user_id = auth.uid() OR has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin')
);

-- 6. cfdi_emitidos
DROP POLICY IF EXISTS "Autenticados ven cfdi" ON public.cfdi_emitidos;
CREATE POLICY cfdi_select_fiscal ON public.cfdi_emitidos FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR
  has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'contador') OR
  has_role(auth.uid(),'contabilidad') OR has_role(auth.uid(),'contraloria') OR
  has_role(auth.uid(),'auditoria') OR has_role(auth.uid(),'direccion')
);

-- 7. pagos_recibidos
DROP POLICY IF EXISTS "Autenticados ven pagos recibidos" ON public.pagos_recibidos;
CREATE POLICY pagos_recibidos_select_tesoreria ON public.pagos_recibidos FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR
  has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'contador') OR
  has_role(auth.uid(),'contabilidad') OR has_role(auth.uid(),'tesoreria') OR
  has_role(auth.uid(),'auditoria') OR has_role(auth.uid(),'direccion')
);

-- 8. Storage cfdi
DROP POLICY IF EXISTS "cfdi authenticated read" ON storage.objects;
CREATE POLICY "cfdi fiscal read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'cfdi' AND (
    has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR
    has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'contador') OR
    has_role(auth.uid(),'contabilidad') OR has_role(auth.uid(),'contraloria') OR
    has_role(auth.uid(),'auditoria') OR has_role(auth.uid(),'direccion')
  )
);

-- 9. Storage comprobantes-pago
DROP POLICY IF EXISTS "Todos ven comprobantes" ON storage.objects;
CREATE POLICY "comprobantes tesoreria read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'comprobantes-pago' AND (
    has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR
    has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'compras') OR
    has_role(auth.uid(),'contador') OR has_role(auth.uid(),'contabilidad') OR
    has_role(auth.uid(),'tesoreria') OR has_role(auth.uid(),'auditoria') OR
    has_role(auth.uid(),'direccion')
  )
);

-- 10. notificaciones UPDATE: cerrar always-true → gerencia/admin
DROP POLICY IF EXISTS "Autenticados marcan leidas" ON public.notificaciones;
CREATE POLICY "Gerencia marca notificaciones leidas" ON public.notificaciones
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR
  has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'subgerente') OR
  has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'direccion')
)
WITH CHECK (
  has_role(auth.uid(),'super_admin') OR has_role(auth.uid(),'admin') OR
  has_role(auth.uid(),'gerente') OR has_role(auth.uid(),'subgerente') OR
  has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'direccion')
);

-- Reetiquetar 20 CxP seed
UPDATE public.cuentas_por_pagar
SET estado = 'cancelada', updated_at = now()
WHERE notas = 'CXP seed operativo' AND compra_id IS NULL;

-- B2 trigger
CREATE OR REPLACE FUNCTION public.tg_pago_cxp_to_movbanc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_corte DATE;
  v_ref TEXT;
  v_prov_nombre TEXT;
  v_numero_compra TEXT;
BEGIN
  IF NEW.banco_cuenta_id IS NULL THEN RETURN NEW; END IF;

  SELECT fecha_corte_automatico INTO v_corte
    FROM public.contabilidad_parametros WHERE id = 1;
  v_corte := COALESCE(v_corte, CURRENT_DATE);

  IF NEW.fecha < v_corte THEN RETURN NEW; END IF;

  v_ref := 'PAGO_CXP:' || NEW.id::text;

  IF EXISTS (SELECT 1 FROM public.movimientos_bancarios WHERE referencia = v_ref) THEN
    RETURN NEW;
  END IF;

  SELECT p.nombre, c.numero_compra INTO v_prov_nombre, v_numero_compra
  FROM public.compras c
  LEFT JOIN public.proveedores p ON p.id = c.proveedor_id
  WHERE c.id = NEW.compra_id;

  INSERT INTO public.movimientos_bancarios (
    cuenta_id, fecha, concepto, referencia,
    cargo, abono, contraparte_nombre, origen, notas
  ) VALUES (
    NEW.banco_cuenta_id, NEW.fecha,
    'Pago CxP ' || COALESCE(v_numero_compra,'') || ' - ' || COALESCE(v_prov_nombre,''),
    v_ref, NEW.monto, 0, v_prov_nombre, 'manual',
    COALESCE(NEW.notas,'') || ' | forma_pago=' || COALESCE(NEW.forma_pago,'')
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pagos_cxp_to_movbanc_trg ON public.pagos_cxp;
CREATE TRIGGER pagos_cxp_to_movbanc_trg
AFTER INSERT ON public.pagos_cxp
FOR EACH ROW EXECUTE FUNCTION public.tg_pago_cxp_to_movbanc();
