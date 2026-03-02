
-- Actualizar la función recalcular_alerta_insumo para usar min_global_inventario de insumo_configuracion
CREATE OR REPLACE FUNCTION public.recalcular_alerta_insumo(p_hospital_id uuid, p_insumo_catalogo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_existencia_actual INTEGER;
    v_minimo INTEGER;
    v_inventario_id UUID;
    v_alerta_existente UUID;
BEGIN
    -- Obtener existencia actual sumando todos los lotes del hospital
    SELECT 
        ih.id,
        COALESCE(SUM(ih.cantidad_actual), 0)
    INTO v_inventario_id, v_existencia_actual
    FROM public.inventario_hospital ih
    WHERE ih.hospital_id = p_hospital_id 
    AND ih.insumo_catalogo_id = p_insumo_catalogo_id
    GROUP BY ih.id
    LIMIT 1;

    -- Si no hay inventario, salir
    IF v_inventario_id IS NULL THEN
        RETURN;
    END IF;

    -- Obtener el mínimo GLOBAL desde insumo_configuracion
    SELECT COALESCE(ic.min_global_inventario, 10)
    INTO v_minimo
    FROM public.insumo_configuracion ic
    WHERE ic.insumo_catalogo_id = p_insumo_catalogo_id
    LIMIT 1;

    -- Si no hay configuración, usar valor por defecto
    IF v_minimo IS NULL THEN
        v_minimo := 10;
    END IF;

    -- Buscar alerta activa existente
    SELECT id INTO v_alerta_existente
    FROM public.insumos_alertas
    WHERE hospital_id = p_hospital_id
    AND insumo_catalogo_id = p_insumo_catalogo_id
    AND estado = 'activa'
    LIMIT 1;

    IF v_existencia_actual <= v_minimo THEN
        -- Crear o actualizar alerta
        IF v_alerta_existente IS NULL THEN
            INSERT INTO public.insumos_alertas (
                hospital_id,
                insumo_catalogo_id,
                inventario_id,
                cantidad_actual,
                minimo_permitido,
                prioridad,
                estado
            ) VALUES (
                p_hospital_id,
                p_insumo_catalogo_id,
                v_inventario_id,
                v_existencia_actual,
                v_minimo,
                CASE 
                    WHEN v_existencia_actual = 0 THEN 'critica'
                    WHEN v_existencia_actual < (v_minimo * 0.5) THEN 'alta'
                    WHEN v_existencia_actual < (v_minimo * 0.75) THEN 'media'
                    ELSE 'baja'
                END,
                'activa'
            );
        ELSE
            UPDATE public.insumos_alertas
            SET cantidad_actual = v_existencia_actual,
                minimo_permitido = v_minimo,
                prioridad = CASE 
                    WHEN v_existencia_actual = 0 THEN 'critica'
                    WHEN v_existencia_actual < (v_minimo * 0.5) THEN 'alta'
                    WHEN v_existencia_actual < (v_minimo * 0.75) THEN 'media'
                    ELSE 'baja'
                END,
                updated_at = now()
            WHERE id = v_alerta_existente;
        END IF;
    ELSE
        -- Resolver alerta si existe
        IF v_alerta_existente IS NOT NULL THEN
            UPDATE public.insumos_alertas
            SET estado = 'resuelta',
                resuelto_at = now(),
                updated_at = now()
            WHERE id = v_alerta_existente;
        END IF;
    END IF;
END;
$function$;

-- Actualizar también check_inventario_minimo para usar min_global_inventario
CREATE OR REPLACE FUNCTION public.check_inventario_minimo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  alerta_existente UUID;
  v_minimo INTEGER;
BEGIN
  -- Obtener el mínimo GLOBAL desde insumo_configuracion
  SELECT COALESCE(ic.min_global_inventario, 10)
  INTO v_minimo
  FROM public.insumo_configuracion ic
  WHERE ic.insumo_catalogo_id = NEW.insumo_catalogo_id
  LIMIT 1;

  -- Si no hay configuración, usar valor por defecto
  IF v_minimo IS NULL THEN
    v_minimo := 10;
  END IF;

  -- Solo verificar si la cantidad bajó del mínimo
  IF NEW.cantidad_actual < v_minimo THEN
    -- Verificar si ya existe una alerta activa para este inventario
    SELECT id INTO alerta_existente
    FROM public.insumos_alertas
    WHERE inventario_id = NEW.id
      AND estado = 'activa'
    LIMIT 1;
    
    -- Si no existe alerta activa, crear una nueva
    IF alerta_existente IS NULL THEN
      INSERT INTO public.insumos_alertas (
        hospital_id,
        insumo_catalogo_id,
        inventario_id,
        cantidad_actual,
        minimo_permitido,
        prioridad
      ) VALUES (
        NEW.hospital_id,
        NEW.insumo_catalogo_id,
        NEW.id,
        NEW.cantidad_actual,
        v_minimo,
        CASE 
          WHEN NEW.cantidad_actual = 0 THEN 'critica'
          WHEN NEW.cantidad_actual < (v_minimo * 0.5) THEN 'alta'
          WHEN NEW.cantidad_actual < (v_minimo * 0.75) THEN 'media'
          ELSE 'baja'
        END
      );
    ELSE
      -- Actualizar la alerta existente con nueva cantidad
      UPDATE public.insumos_alertas
      SET cantidad_actual = NEW.cantidad_actual,
          minimo_permitido = v_minimo,
          prioridad = CASE 
            WHEN NEW.cantidad_actual = 0 THEN 'critica'
            WHEN NEW.cantidad_actual < (v_minimo * 0.5) THEN 'alta'
            WHEN NEW.cantidad_actual < (v_minimo * 0.75) THEN 'media'
            ELSE 'baja'
          END,
          updated_at = now()
      WHERE id = alerta_existente;
    END IF;
  ELSE
    -- Si la cantidad ya no está por debajo del mínimo, resolver alertas activas
    UPDATE public.insumos_alertas
    SET estado = 'resuelta',
        resuelto_at = now(),
        updated_at = now()
    WHERE inventario_id = NEW.id
      AND estado = 'activa';
  END IF;
  
  RETURN NEW;
END;
$function$;
