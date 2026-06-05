-- =========================================================
-- BLOQUE 1 — Reescribir políticas RLS que referencian 'cajero' / 'auditor'
-- =========================================================

DROP POLICY IF EXISTS "Operativos actualizan inventario" ON public.inventario;
CREATE POLICY "Operativos actualizan inventario" ON public.inventario
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'gerente'::app_role)
    OR has_role(auth.uid(), 'subgerente'::app_role)
    OR has_role(auth.uid(), 'almacen'::app_role)
    OR has_role(auth.uid(), 'almacen_ventas'::app_role)
    OR has_role(auth.uid(), 'ventas'::app_role)
  );

DROP POLICY IF EXISTS "Operativos actualizan ventas" ON public.ventas;
CREATE POLICY "Operativos actualizan ventas" ON public.ventas
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'gerente'::app_role)
    OR has_role(auth.uid(), 'subgerente'::app_role)
    OR has_role(auth.uid(), 'almacen_ventas'::app_role)
    OR has_role(auth.uid(), 'ventas'::app_role)
  );

DROP POLICY IF EXISTS "Gerentes actualizan cortes" ON public.cortes_caja;
CREATE POLICY "Gerentes actualizan cortes" ON public.cortes_caja
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'gerente'::app_role)
    OR has_role(auth.uid(), 'ventas'::app_role)
  );

DROP POLICY IF EXISTS "Auditor ve conciliacion" ON public.conciliacion_bancaria;
CREATE POLICY "Auditoria ve conciliacion" ON public.conciliacion_bancaria
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'auditoria'::app_role)
    OR has_role(auth.uid(), 'gerente'::app_role)
  );

DROP POLICY IF EXISTS "Auditor actualiza conciliacion" ON public.conciliacion_bancaria;
CREATE POLICY "Auditoria actualiza conciliacion" ON public.conciliacion_bancaria
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'auditoria'::app_role)
  );

DROP POLICY IF EXISTS "Admin ve logs" ON public.audit_log;
CREATE POLICY "Admin ve logs" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'auditoria'::app_role)
    OR has_role(auth.uid(), 'gerente'::app_role)
  );

-- =========================================================
-- BLOQUE 2 — Limpiar permisos huérfanos
-- =========================================================
DELETE FROM public.role_permissions WHERE rol IN ('cajero', 'auditor');

-- =========================================================
-- BLOQUE 3 — Trigger de salvaguarda: prohíbe insertar
-- los roles deprecados 'cajero' y 'auditor' en user_roles.
-- (No se pueden eliminar del enum sin DROP FUNCTION has_role CASCADE,
--  que invalidaría 49 políticas RLS — riesgo no aceptable.)
-- =========================================================

CREATE OR REPLACE FUNCTION public.bloquear_roles_deprecados()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role::text IN ('cajero', 'auditor') THEN
    RAISE EXCEPTION
      'Rol "%": deprecado. Usa "ventas" (en lugar de cajero) o "auditoria" (en lugar de auditor).',
      NEW.role::text
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_roles_deprecados ON public.user_roles;
CREATE TRIGGER trg_bloquear_roles_deprecados
  BEFORE INSERT OR UPDATE OF role ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_roles_deprecados();

COMMENT ON TYPE public.app_role IS
  'Roles del sistema. DEPRECADOS (bloqueados por trigger): cajero -> usar ventas; auditor -> usar auditoria.';