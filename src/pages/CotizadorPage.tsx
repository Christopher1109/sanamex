import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Calculator, Plus, Trash2, ShoppingCart, Send, Search, Sparkles, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

type Reco = {
  proveedor_id: string; proveedor_codigo: string; proveedor_nombre: string;
  precio_unitario: number; precio_con_iva: number; existencia_proveedor: number;
  dias_credito: number; lead_time_dias: number; acepta_devoluciones: boolean;
  pago_contra_entrega: boolean; piezas_corrugado: number; cantidad_sugerida: number;
  cantidad_disponible: number; monto_total: number; con_oferta: boolean;
  score: number; ranking: number;
};

type Producto = { id: string; clave: string; descripcion: string };
type CarritoItem = {
  id: string; producto_id: string; proveedor_id: string;
  cantidad: number; precio_unitario: number;
  producto?: { nombre: string; sku: string };
  proveedor?: { nombre: string; codigo: string; monto_minimo_pedido: number; sucursal_id?: string };
};
type MasivoRow = { clave: string; cantidad: number; producto?: Producto; recos: Reco[]; sin_proveedor: boolean };

export default function CotizadorPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Modo 1
  const [busqueda, setBusqueda] = useState('');
  const [productosEncontrados, setProductosEncontrados] = useState<Producto[]>([]);
  const [productoSel, setProductoSel] = useState<Producto | null>(null);
  const [cantidad, setCantidad] = useState<number>(1);
  const [recos, setRecos] = useState<Reco[]>([]);
  const [loadingRecos, setLoadingRecos] = useState(false);

  // Modo 2
  const [pegado, setPegado] = useState('');
  const [masivoRows, setMasivoRows] = useState<MasivoRow[]>([]);
  const [procesandoMasivo, setProcesandoMasivo] = useState(false);
  const [detalleMasivo, setDetalleMasivo] = useState<MasivoRow | null>(null);

  // Carrito
  const [carrito, setCarrito] = useState<CarritoItem[]>([]);
  const [carritoOpen, setCarritoOpen] = useState(false);

  // Modo 3: sugeridos vía sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem('cotizador_sugeridos');
    if (raw) {
      try {
        const arr = JSON.parse(raw) as { clave: string; cantidad: number }[];
        sessionStorage.removeItem('cotizador_sugeridos');
        setPegado(arr.map(r => `${r.clave}\t${r.cantidad}`).join('\n'));
        toast.success(`${arr.length} productos cargados desde Sugeridos. Ve a la pestaña "Masivo".`);
      } catch {}
    }
  }, []);

  useEffect(() => { loadCarrito(); }, []);

  async function loadCarrito() {
    if (!user) return;
    const { data } = await supabase
      .from('cotizaciones_carrito')
      .select(`id, producto_id, proveedor_id, cantidad, precio_unitario,
               producto:productos(nombre, sku),
               proveedor:proveedores(nombre, codigo, monto_minimo_pedido)`)
      .eq('usuario_id', user.id);
    setCarrito((data || []) as any);
  }

  // ========== MODO 1 ==========
  async function searchProductos() {
    const q = busqueda.trim();
    if (q.length < 2) return;
    const { data } = await supabase
      .from('productos')
      .select('id, sku, codigo_barras, nombre, descripcion')
      .or(`sku.ilike.%${q}%,codigo_barras.ilike.%${q}%,nombre.ilike.%${q}%,descripcion.ilike.%${q}%`)
      .eq('activo', true)
      .neq('estatus', 'K').neq('estatus', 'C')
      .limit(20);
    setProductosEncontrados((data || []).map((p: any) => ({
      id: p.id, clave: p.codigo_barras || p.sku,
      descripcion: p.descripcion || p.nombre,
    })));
  }

  async function recomendar() {
    if (!productoSel || cantidad <= 0) return;
    setLoadingRecos(true); setRecos([]);
    const { data, error } = await (supabase as any).rpc('recomendar_proveedor', {
      p_producto_id: productoSel.id, p_cantidad_requerida: cantidad,
    });
    setLoadingRecos(false);
    if (error) { toast.error(error.message); return; }
    setRecos((data || []) as Reco[]);
    if (!data?.length) toast.warning('Sin proveedores con lista de precios vigente para este producto.');
  }

  // ========== MODO 2 ==========
  async function procesarMasivo() {
    setProcesandoMasivo(true);
    const lineas = pegado.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const parts = l.split(/[\t,;]+/).map(s => s.trim());
      return { clave: parts[0], cantidad: parseInt(parts[1] || '1') || 1 };
    });
    if (!lineas.length) { setProcesandoMasivo(false); return; }
    const claves = lineas.map(l => l.clave);
    const { data: prods } = await supabase
      .from('productos').select('id, sku, codigo_barras, nombre, descripcion')
      .or(`sku.in.(${claves.map(c => `"${c}"`).join(',')}),codigo_barras.in.(${claves.map(c => `"${c}"`).join(',')})`)
      .eq('activo', true);
    const map: Record<string, Producto> = {};
    (prods || []).forEach((p: any) => {
      const prod = { id: p.id, clave: p.codigo_barras || p.sku, descripcion: p.descripcion || p.nombre };
      if (p.sku) map[p.sku] = prod;
      if (p.codigo_barras) map[p.codigo_barras] = prod;
    });

    const rows: MasivoRow[] = [];
    for (const l of lineas) {
      const prod = map[l.clave];
      if (!prod) { rows.push({ clave: l.clave, cantidad: l.cantidad, recos: [], sin_proveedor: true }); continue; }
      const { data: r } = await (supabase as any).rpc('recomendar_proveedor', {
        p_producto_id: prod.id, p_cantidad_requerida: l.cantidad,
      });
      rows.push({
        clave: l.clave, cantidad: l.cantidad, producto: prod,
        recos: (r || []) as Reco[], sin_proveedor: !r?.length,
      });
    }
    setMasivoRows(rows);
    setProcesandoMasivo(false);
    toast.success(`${rows.length} productos procesados.`);
  }

  // ========== CARRITO ==========
  async function agregarAlCarrito(producto_id: string, r: Reco, cantidad_final: number) {
    if (!user) return;
    const { error } = await supabase.from('cotizaciones_carrito').upsert({
      usuario_id: user.id, producto_id, proveedor_id: r.proveedor_id,
      cantidad: cantidad_final, precio_unitario: r.precio_unitario,
    }, { onConflict: 'usuario_id,producto_id,proveedor_id' });
    if (error) { toast.error(error.message); return; }
    toast.success('Agregado al carrito');
    loadCarrito();
  }

  async function eliminarItem(id: string) {
    await supabase.from('cotizaciones_carrito').delete().eq('id', id);
    loadCarrito();
  }

  async function actualizarCantidadCarrito(id: string, cant: number) {
    if (cant <= 0) return eliminarItem(id);
    await supabase.from('cotizaciones_carrito').update({ cantidad: cant }).eq('id', id);
    loadCarrito();
  }

  // Agrupar por proveedor
  const carritoAgrupado = useMemo(() => {
    const g: Record<string, { proveedor: any; items: CarritoItem[]; subtotal: number }> = {};
    carrito.forEach(it => {
      const k = it.proveedor_id;
      if (!g[k]) g[k] = { proveedor: it.proveedor, items: [], subtotal: 0 };
      g[k].items.push(it);
      g[k].subtotal += it.cantidad * Number(it.precio_unitario);
    });
    return g;
  }, [carrito]);

  async function generarOCs() {
    if (!user || !carrito.length) return;
    const { data: cedis } = await supabase
      .from('sucursales').select('id').eq('tipo', 'cedis').eq('activo', true).maybeSingle();
    const sucursal_destino = (cedis as any)?.id ?? null;

    let creadas = 0;
    for (const [proveedor_id, grupo] of Object.entries(carritoAgrupado)) {
      const { data: oc, error } = await supabase.from('ordenes_compra').insert({
        proveedor_id, sucursal_destino_id: sucursal_destino,
        estado: 'borrador', creada_por: user.id,
        notas: 'Generada desde el Cotizador',
      }).select('id').single();
      if (error || !oc) { toast.error(`Error en ${grupo.proveedor?.nombre}: ${error?.message}`); continue; }
      const lineas = grupo.items.map(it => ({
        orden_id: (oc as any).id, producto_id: it.producto_id,
        cantidad_solicitada: it.cantidad, precio_unitario: it.precio_unitario,
        precio_con_iva: Number(it.precio_unitario) * 1.16,
      }));
      const { error: e2 } = await supabase.from('orden_compra_lineas').insert(lineas);
      if (e2) { toast.error(`Líneas OC: ${e2.message}`); continue; }
      creadas++;
    }
    if (creadas) {
      await supabase.from('cotizaciones_carrito').delete().eq('usuario_id', user.id);
      toast.success(`${creadas} órdenes de compra creadas en borrador.`);
      loadCarrito();
      setCarritoOpen(false);
      navigate('/ordenes-compra');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calculator className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Cotizador</h1>
            <p className="text-sm text-muted-foreground">Recomendación de proveedor por SKU según precio, existencia, crédito, lead time y devoluciones.</p>
          </div>
        </div>
        <Sheet open={carritoOpen} onOpenChange={setCarritoOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              Carrito ({carrito.length})
            </Button>
          </SheetTrigger>
          <SheetContent className="w-[480px] sm:w-[560px] overflow-y-auto">
            <SheetHeader><SheetTitle>Carrito de cotización</SheetTitle></SheetHeader>
            <div className="mt-4 space-y-4">
              {!carrito.length && <p className="text-sm text-muted-foreground">Carrito vacío.</p>}
              {Object.entries(carritoAgrupado).map(([pid, g]) => {
                const min = Number(g.proveedor?.monto_minimo_pedido || 0);
                const cumpleMin = g.subtotal >= min || min === 0;
                return (
                  <Card key={pid} className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-sm">{g.proveedor?.nombre}</p>
                        <p className="text-xs text-muted-foreground">{g.proveedor?.codigo}</p>
                      </div>
                      <p className="font-bold">${g.subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                    </div>
                    {!cumpleMin && (
                      <div className="flex items-center gap-2 rounded bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-900 dark:text-amber-200">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        Aviso: por debajo del monto mínimo (${min.toLocaleString()}).
                      </div>
                    )}
                    {g.items.map(it => (
                      <div key={it.id} className="flex items-center gap-2 text-xs border-t pt-2">
                        <div className="flex-1 truncate">
                          <p className="font-medium truncate">{it.producto?.nombre}</p>
                          <p className="text-muted-foreground">{it.producto?.sku} · ${Number(it.precio_unitario).toFixed(2)}</p>
                        </div>
                        <Input type="number" className="h-7 w-20 text-xs" value={it.cantidad}
                          onChange={e => actualizarCantidadCarrito(it.id, parseInt(e.target.value || '0'))} />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => eliminarItem(it.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </Card>
                );
              })}
              {carrito.length > 0 && (
                <Button className="w-full gap-2" onClick={generarOCs}>
                  <Send className="h-4 w-4" /> Generar Órdenes de Compra
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <Tabs defaultValue="uno">
        <TabsList>
          <TabsTrigger value="uno">1 producto</TabsTrigger>
          <TabsTrigger value="masivo">Masivo / Sugeridos</TabsTrigger>
        </TabsList>

        <TabsContent value="uno" className="space-y-4 mt-4">
          <Card className="p-4 space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Buscar por clave, descripción o SKU…" value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') searchProductos(); }} />
              <Button onClick={searchProductos} className="gap-2"><Search className="h-4 w-4" /> Buscar</Button>
            </div>
            {productosEncontrados.length > 0 && !productoSel && (
              <div className="max-h-48 overflow-auto border rounded">
                {productosEncontrados.map(p => (
                  <button key={p.id} className="w-full text-left p-2 hover:bg-accent border-b last:border-0"
                    onClick={() => { setProductoSel(p); setProductosEncontrados([]); setBusqueda(''); }}>
                    <span className="font-mono text-xs">{p.clave}</span> — <span className="text-sm">{p.descripcion}</span>
                  </button>
                ))}
              </div>
            )}
            {productoSel && (
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label className="text-xs">Producto</Label>
                  <p className="font-medium text-sm">{productoSel.clave} — {productoSel.descripcion}</p>
                </div>
                <div className="w-32">
                  <Label className="text-xs">Cantidad</Label>
                  <Input type="number" value={cantidad} onChange={e => setCantidad(parseInt(e.target.value || '0'))} />
                </div>
                <Button onClick={recomendar} disabled={loadingRecos} className="gap-2">
                  <Sparkles className="h-4 w-4" /> Recomendar
                </Button>
                <Button variant="ghost" onClick={() => setProductoSel(null)}>Cambiar</Button>
              </div>
            )}
          </Card>

          {recos.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Existencia</TableHead>
                    <TableHead className="text-right">Crédito</TableHead>
                    <TableHead className="text-right">Lead</TableHead>
                    <TableHead className="text-right">Corrugado</TableHead>
                    <TableHead className="text-right">Sugerido</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recos.map(r => (
                    <TableRow key={r.proveedor_id} className={r.ranking === 1 ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''}>
                      <TableCell>
                        {r.ranking === 1 ? <Badge className="bg-emerald-600">★ #1</Badge> : `#${r.ranking}`}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{r.proveedor_nombre}</div>
                        <div className="text-xs text-muted-foreground">{r.proveedor_codigo}
                          {r.con_oferta && <Badge variant="secondary" className="ml-1">Oferta</Badge>}
                          {r.acepta_devoluciones && <Badge variant="outline" className="ml-1">Dev</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">${Number(r.precio_unitario).toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.existencia_proveedor}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.dias_credito}d</TableCell>
                      <TableCell className="text-right tabular-nums">{r.lead_time_dias}d</TableCell>
                      <TableCell className="text-right tabular-nums">{r.piezas_corrugado}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{r.cantidad_sugerida}</TableCell>
                      <TableCell className="text-right tabular-nums">${Number(r.monto_total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(r.score).toFixed(1)}</TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => productoSel && agregarAlCarrito(productoSel.id, r, r.cantidad_sugerida)}>
                          <Plus className="h-3.5 w-3.5 mr-1" />Agregar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="masivo" className="space-y-4 mt-4">
          <Card className="p-4 space-y-3">
            <Label className="text-xs">Pega lista (clave + cantidad, separados por tabulación, coma o punto y coma)</Label>
            <Textarea rows={8} value={pegado} onChange={e => setPegado(e.target.value)}
              placeholder={'7502208894557\t100\n7501234567890,50'} className="font-mono text-xs" />
            <Button onClick={procesarMasivo} disabled={procesandoMasivo} className="gap-2">
              <Sparkles className="h-4 w-4" /> {procesandoMasivo ? 'Procesando…' : 'Procesar y recomendar'}
            </Button>
          </Card>

          {masivoRows.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Clave</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead>Mejor proveedor</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {masivoRows.map((row, i) => {
                    const top = row.recos[0];
                    return (
                      <TableRow key={i} className={row.sin_proveedor ? 'bg-rose-50 dark:bg-rose-950/30' : ''}>
                        <TableCell className="font-mono text-xs">{row.clave}</TableCell>
                        <TableCell className="text-xs max-w-[260px] truncate">
                          {row.producto?.descripcion || <span className="text-rose-600">Producto no encontrado</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{row.cantidad}</TableCell>
                        <TableCell>
                          {row.sin_proveedor
                            ? <Badge variant="destructive">Sin proveedor</Badge>
                            : <span className="text-sm">{top?.proveedor_nombre}</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{top ? `$${Number(top.precio_unitario).toFixed(2)}` : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{top ? `$${Number(top.monto_total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{top ? Number(top.score).toFixed(1) : '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {top && row.producto && (
                              <Button size="sm" onClick={() => agregarAlCarrito(row.producto!.id, top, top.cantidad_sugerida)}>
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {row.recos.length > 1 && (
                              <Button size="sm" variant="outline" onClick={() => setDetalleMasivo(row)}>Detalles</Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          )}

          <Dialog open={!!detalleMasivo} onOpenChange={() => setDetalleMasivo(null)}>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>{detalleMasivo?.clave} — alternativas</DialogTitle>
              </DialogHeader>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead><TableHead>Proveedor</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">Existencia</TableHead>
                    <TableHead className="text-right">Crédito</TableHead>
                    <TableHead className="text-right">Lead</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detalleMasivo?.recos.map(r => (
                    <TableRow key={r.proveedor_id}>
                      <TableCell>#{r.ranking}</TableCell>
                      <TableCell>{r.proveedor_nombre}</TableCell>
                      <TableCell className="text-right">${Number(r.precio_unitario).toFixed(2)}</TableCell>
                      <TableCell className="text-right">{r.existencia_proveedor}</TableCell>
                      <TableCell className="text-right">{r.dias_credito}d</TableCell>
                      <TableCell className="text-right">{r.lead_time_dias}d</TableCell>
                      <TableCell className="text-right">{Number(r.score).toFixed(1)}</TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => detalleMasivo?.producto && agregarAlCarrito(detalleMasivo.producto.id, r, r.cantidad_sugerida)}>
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
