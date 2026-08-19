INSERT INTO public.user_module_access (user_id, modulo, nivel_acceso, otorgado_por)
SELECT uma.user_id, 'corte_caja_ruta', uma.nivel_acceso, uma.otorgado_por
FROM public.user_module_access uma
WHERE uma.modulo = 'corte_caja'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_module_access x
    WHERE x.user_id = uma.user_id AND x.modulo = 'corte_caja_ruta'
  );

INSERT INTO public.user_module_access (user_id, modulo, nivel_acceso)
SELECT ur.user_id, 'corte_caja_ruta', 'capturar'
FROM public.user_roles ur
WHERE ur.role = 'repartidor'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_module_access x
    WHERE x.user_id = ur.user_id AND x.modulo = 'corte_caja_ruta'
  );

INSERT INTO public.role_module_defaults (rol, modulo, nivel_acceso)
SELECT d.rol, 'corte_caja_ruta', d.nivel_acceso
FROM public.role_module_defaults d
WHERE d.modulo = 'corte_caja'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_module_defaults x
    WHERE x.rol = d.rol AND x.modulo = 'corte_caja_ruta'
  );

INSERT INTO public.role_module_defaults (rol, modulo, nivel_acceso)
SELECT 'repartidor', 'corte_caja_ruta', 'capturar'
WHERE NOT EXISTS (
  SELECT 1 FROM public.role_module_defaults x
  WHERE x.rol = 'repartidor' AND x.modulo = 'corte_caja_ruta'
);