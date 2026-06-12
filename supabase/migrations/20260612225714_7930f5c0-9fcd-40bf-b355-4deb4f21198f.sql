
UPDATE public.inventario
SET cantidad = cantidad + 5, updated_at = now()
WHERE almacen_id = '5240d907-f575-4d12-ad9d-e2a72fc8da7d'
  AND lote_id = 'b62a703c-2ba3-42ea-a5aa-0449980ae7ef';

DELETE FROM public.inventario
WHERE almacen_id = 'f73e1373-306a-4e00-a367-d7eceab4a3b8'
  AND lote_id = 'b62a703c-2ba3-42ea-a5aa-0449980ae7ef';

DELETE FROM public.movimientos_inventario
WHERE referencia_id = '7cf2a390-b8ef-45c8-bbf2-191da3f37760';

DELETE FROM public.traspaso_lineas
WHERE traspaso_id = '7cf2a390-b8ef-45c8-bbf2-191da3f37760';

DELETE FROM public.traspasos
WHERE id = '7cf2a390-b8ef-45c8-bbf2-191da3f37760';
