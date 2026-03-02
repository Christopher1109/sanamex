-- 1. Habilitar los triggers que están deshabilitados (cambiar de A a O)
ALTER TABLE inventario_hospital ENABLE TRIGGER check_inventario_trigger;
ALTER TABLE inventario_hospital ENABLE TRIGGER check_inventario_minimo_trigger;

-- 2. Modificar el trigger de inventario_consolidado para que también se dispare cuando cambia cantidad_minima
DROP TRIGGER IF EXISTS check_inventario_consolidado_trigger ON inventario_consolidado;

CREATE TRIGGER check_inventario_consolidado_trigger
AFTER INSERT OR UPDATE OF cantidad_total, cantidad_minima ON inventario_consolidado
FOR EACH ROW
EXECUTE FUNCTION trigger_check_consolidado();

-- 3. Crear un nuevo trigger en insumo_configuracion para recalcular alertas cuando cambia el mínimo global
CREATE OR REPLACE FUNCTION trigger_check_configuracion_minimo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Cuando cambia min_global_inventario, recalcular alertas para todos los inventarios consolidados con ese insumo
  IF (OLD.min_global_inventario IS DISTINCT FROM NEW.min_global_inventario) THEN
    -- Recalcular todas las alertas para este insumo en todos los hospitales
    PERFORM recalcular_alerta_consolidado(ic.id)
    FROM inventario_consolidado ic
    WHERE ic.insumo_catalogo_id = NEW.insumo_catalogo_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Crear el trigger en insumo_configuracion
DROP TRIGGER IF EXISTS check_configuracion_minimo_trigger ON insumo_configuracion;

CREATE TRIGGER check_configuracion_minimo_trigger
AFTER UPDATE OF min_global_inventario ON insumo_configuracion
FOR EACH ROW
EXECUTE FUNCTION trigger_check_configuracion_minimo();

-- 4. También crear trigger para INSERT en insumo_configuracion (cuando se crea nueva configuración)
CREATE OR REPLACE FUNCTION trigger_check_configuracion_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Recalcular alertas para este insumo cuando se crea configuración con mínimo
  IF NEW.min_global_inventario IS NOT NULL THEN
    PERFORM recalcular_alerta_consolidado(ic.id)
    FROM inventario_consolidado ic
    WHERE ic.insumo_catalogo_id = NEW.insumo_catalogo_id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_configuracion_insert_trigger ON insumo_configuracion;

CREATE TRIGGER check_configuracion_insert_trigger
AFTER INSERT ON insumo_configuracion
FOR EACH ROW
EXECUTE FUNCTION trigger_check_configuracion_insert();