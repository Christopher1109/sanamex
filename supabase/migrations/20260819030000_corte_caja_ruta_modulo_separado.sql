-- Corrección al PR #39: el usuario pidió que "Corte de Caja Mostrador" y
-- "Corte de Caja Ruta" sean MÓDULOS SEPARADOS (cada quien entra y ve solo
-- lo que le corresponde), no dos pestañas dentro de la misma pantalla como
-- se había hecho. Esta migración da de alta el módulo nuevo
-- `corte_caja_ruta` y le da a cada usuario que YA tenía acceso a
-- `corte_caja` (ahora "Corte de Caja Mostrador") el mismo nivel de acceso
-- en el módulo nuevo, para que nadie pierda visibilidad de golpe.
--
-- El módulo `corte_caja` (mismo key de siempre) se conserva tal cual para
-- no romper los permisos ya otorgados; solo cambia su etiqueta en el
-- sidebar a "Corte de Caja Mostrador" (eso vive en src/config/modulos.ts,
-- no en la base de datos).

INSERT INTO public.user_module_access (user_id, modulo, nivel_acceso, otorgado_por)
SELECT uma.user_id, 'corte_caja_ruta', uma.nivel_acceso, uma.otorgado_por
FROM public.user_module_access uma
WHERE uma.modulo = 'corte_caja'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_module_access x
    WHERE x.user_id = uma.user_id AND x.modulo = 'corte_caja_ruta'
  );

-- Los repartidores necesitan poder concluir sus entregas aunque nunca se
-- les haya otorgado explícitamente el módulo corte_caja (hoy no aparece en
-- DEFAULTS_POR_ROL para 'repartidor'). Se les da 'capturar' en
-- corte_caja_ruta directamente.
INSERT INTO public.user_module_access (user_id, modulo, nivel_acceso)
SELECT ur.user_id, 'corte_caja_ruta', 'capturar'
FROM public.user_roles ur
WHERE ur.role = 'repartidor'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_module_access x
    WHERE x.user_id = ur.user_id AND x.modulo = 'corte_caja_ruta'
  );
