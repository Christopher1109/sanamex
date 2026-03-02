-- Insertar estados faltantes solo si no existen
INSERT INTO public.estados (codigo, nombre, empresa_id, id)
SELECT '10', 'Durango', '11111111-1111-1111-1111-111111111111'::uuid, '10000000-0000-0000-0000-000000000001'::uuid
WHERE NOT EXISTS (SELECT 1 FROM public.estados WHERE codigo = '10');

INSERT INTO public.estados (codigo, nombre, empresa_id, id)
SELECT '34', 'Zacatecas', '11111111-1111-1111-1111-111111111111'::uuid, '34000000-0000-0000-0000-000000000001'::uuid
WHERE NOT EXISTS (SELECT 1 FROM public.estados WHERE codigo = '34');

INSERT INTO public.estados (codigo, nombre, empresa_id, id)
SELECT 'LARAZA', 'UMAE CMN La Raza', '11111111-1111-1111-1111-111111111111'::uuid, '99000000-0000-0000-0000-000000000001'::uuid
WHERE NOT EXISTS (SELECT 1 FROM public.estados WHERE codigo = 'LARAZA');

INSERT INTO public.estados (codigo, nombre, empresa_id, id)
SELECT 'CMTRY', 'UMAE CMN Monterrey', '11111111-1111-1111-1111-111111111111'::uuid, '99000000-0000-0000-0000-000000000002'::uuid
WHERE NOT EXISTS (SELECT 1 FROM public.estados WHERE codigo = 'CMTRY');

INSERT INTO public.estados (codigo, nombre, empresa_id, id)
SELECT 'OBLATOS', 'UMAE CMN Oblatos', '11111111-1111-1111-1111-111111111111'::uuid, '99000000-0000-0000-0000-000000000003'::uuid
WHERE NOT EXISTS (SELECT 1 FROM public.estados WHERE codigo = 'OBLATOS');

INSERT INTO public.estados (codigo, nombre, empresa_id, id)
SELECT 'SXXI', 'UMAE CMN Siglo XXI', '11111111-1111-1111-1111-111111111111'::uuid, '99000000-0000-0000-0000-000000000004'::uuid
WHERE NOT EXISTS (SELECT 1 FROM public.estados WHERE codigo = 'SXXI');