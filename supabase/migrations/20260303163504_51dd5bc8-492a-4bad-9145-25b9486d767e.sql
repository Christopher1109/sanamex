
-- Pedidos table
CREATE TABLE public.pedidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_pedido text NOT NULL,
  cliente_id uuid REFERENCES public.clientes(id),
  sucursal_id uuid NOT NULL REFERENCES public.sucursales(id),
  estado text NOT NULL DEFAULT 'pendiente',
  notas text,
  creado_por uuid,
  ruta_id uuid REFERENCES public.rutas(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Pedido lineas
CREATE TABLE public.pedido_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id),
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  lote_id uuid NOT NULL REFERENCES public.lotes(id),
  cantidad integer NOT NULL,
  precio_unitario numeric NOT NULL DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Compras table
CREATE TABLE public.compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_compra text NOT NULL,
  proveedor_id uuid NOT NULL REFERENCES public.proveedores(id),
  sucursal_id uuid NOT NULL REFERENCES public.sucursales(id),
  almacen_id uuid REFERENCES public.almacenes(id),
  estado text NOT NULL DEFAULT 'ordenada',
  subtotal numeric NOT NULL DEFAULT 0,
  impuestos numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notas text,
  creado_por uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Compra lineas
CREATE TABLE public.compra_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id uuid NOT NULL REFERENCES public.compras(id),
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  cantidad_ordenada integer NOT NULL,
  cantidad_recibida integer DEFAULT 0,
  precio_unitario_estimado numeric NOT NULL DEFAULT 0,
  precio_unitario_real numeric DEFAULT 0,
  lote_asignado text,
  fecha_caducidad date,
  merma_recepcion integer DEFAULT 0,
  notas text,
  created_at timestamptz DEFAULT now()
);

-- RLS for pedidos
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos ven pedidos" ON public.pedidos FOR SELECT USING (true);
CREATE POLICY "Operativos crean pedidos" ON public.pedidos FOR INSERT WITH CHECK (true);
CREATE POLICY "Operativos actualizan pedidos" ON public.pedidos FOR UPDATE USING (true);

-- RLS for pedido_lineas
ALTER TABLE public.pedido_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos ven pedido lineas" ON public.pedido_lineas FOR SELECT USING (true);
CREATE POLICY "Operativos crean pedido lineas" ON public.pedido_lineas FOR INSERT WITH CHECK (true);

-- RLS for compras
ALTER TABLE public.compras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos ven compras" ON public.compras FOR SELECT USING (true);
CREATE POLICY "Admin/gerente crean compras" ON public.compras FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente') OR has_role(auth.uid(), 'almacen'));
CREATE POLICY "Admin/gerente actualizan compras" ON public.compras FOR UPDATE USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'gerente') OR has_role(auth.uid(), 'almacen'));

-- RLS for compra_lineas
ALTER TABLE public.compra_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Todos ven compra lineas" ON public.compra_lineas FOR SELECT USING (true);
CREATE POLICY "Operativos crean compra lineas" ON public.compra_lineas FOR INSERT WITH CHECK (true);
CREATE POLICY "Operativos actualizan compra lineas" ON public.compra_lineas FOR UPDATE USING (true);
