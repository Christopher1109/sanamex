import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, FileSpreadsheet, TrendingUp, History, Undo2, Loader2 } from 'lucide-react';
import ListaPreciosUploader from '@/components/cargas/ListaPreciosUploader';
import MapeoProveedorUploader from '@/components/cargas/MapeoProveedorUploader';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type Item = {
  id: string;
  producto_id: string;
  proveedor_id: string;
  precio: number;
  precio_con_iva: number | null;
  existencia_proveedor: number;
  fecha_vigencia_desde: string;
  fecha_vigencia_hasta: string | null;
  cantidad_min: number;
  producto: { sku: string | null; codigo_barras: string | null; nombre: string } | null;
  proveedor: { codigo: string | null; nombre: string } | null;
};

type Carga = {
  id: string;
  archivo_nombre: string;
  created_at: string;
  productos_cargados: number;
  productos_actualizados: number;
  productos_autocreados: number;
  cargado_por: string | null;
  proveedor: { codigo: string | null; nombre: string } | null;
  cargado_por_profile?: { nombre: string | null } | null;
};

export default function ListasPreciosPage() {
  const { userRole } = useAuth();
  const isAdmin = userRole === 'admin' || userRole === 'super_admin';
  const [tab, setTab] = useState<'ver' | 'cargar' | 'historial'>('ver');
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [proveedores, setProveedores] = useState<{ id: string; codigo: string | null; nombre: string }[]>([]);
  const [filtroProv, setFiltroProv] = useState<string>('__all__');
  const [search, setSearch] = useState('');
  const [compareClave, setCompareClave] = useState<string | null>(null);
  const [compareRows, setCompareRows] = useState<Item[]>([]);
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [loadingCargas, setLoadingCargas] = useState(false);
  const [reverting, setReverting] = useState<string | null>(null);

  async function loadCargas() {
    setLoadingCargas(true);
    const { data } = await supabase
      .from('lista_precio_cargas')
      .select('id, archivo_nombre, created_at, productos_cargados, productos_actualizados, productos_autocreados, cargado_por, proveedor:proveedores(codigo, nombre)')
      .order('created_at', { ascending: false })
      .limit(200);
    setCargas((data as any[]) || []);
    setLoadingCargas(false);
  }

  useEffect(() => { if (tab === 'historial') loadCargas(); }, [tab]);

  async function revertir(cargaId: string) {
    if (!confirm('¿Revertir esta carga? Se reactivará la lista anterior del proveedor.')) return;
    setReverting(cargaId);
    try {
      const { data, error } = await supabase.rpc('revertir_carga_lista_precios', { p_carga_id: cargaId });
      if (error) throw error;
      const r = data as any;
      toast.success(`Reversión completa: ${r.desactivados} desactivados, ${r.reactivados} reactivados`);
      loadCargas(); load();
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setReverting(null);
    }
  }

  async function load() {
    setLoading(true);
    let q = supabase
      .from('lista_precio_proveedor')
      .select('id, producto_id, proveedor_id, precio, precio_con_iva, existencia_proveedor, fecha_vigencia_desde, fecha_vigencia_hasta, cantidad_min, producto:productos(sku, codigo_barras, nombre), proveedor:proveedores(codigo, nombre)')
      .eq('activo', true)
      .order('created_at', { ascending: false })
      .limit(500);
    if (filtroProv !== '__all__') q = q.eq('proveedor_id', filtroProv);
    const { data } = await q;
    setItems((data as any[]) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [filtroProv]);
  useEffect(() => {
    supabase.from('proveedores').select('id, codigo, nombre').eq('activo', true).order('nombre').then(({ data }) => setProveedores((data as any[]) || []));
  }, []);

  const filtered = items.filter(i => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return (i.producto?.nombre || '').toLowerCase().includes(s) ||
      (i.producto?.sku || '').includes(s) ||
      (i.producto?.codigo_barras || '').includes(s);
  });

  async function compare(productoId: string, clave: string) {
    setCompareClave(clave);
    const { data } = await supabase
      .from('lista_precio_proveedor')
      .select('id, producto_id, proveedor_id, precio, precio_con_iva, existencia_proveedor, fecha_vigencia_desde, fecha_vigencia_hasta, cantidad_min, producto:productos(sku, codigo_barras, nombre), proveedor:proveedores(codigo, nombre)')
      .eq('producto_id', productoId)
      .eq('activo', true)
      .order('precio');
    setCompareRows((data as any[]) || []);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileSpreadsheet className="h-6 w-6" />Listas de Precios de Proveedores</h1>
        <p className="text-muted-foreground">Carga universal de listas. Compara precios entre proveedores para el mismo SKU.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="ver">Ver listas vigentes</TabsTrigger>
          <TabsTrigger value="cargar">Cargar lista</TabsTrigger>
          <TabsTrigger value="historial"><History className="h-3.5 w-3.5 mr-1" />Historial de cargas</TabsTrigger>
        </TabsList>

        <TabsContent value="ver" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={filtroProv} onValueChange={setFiltroProv}>
                  <SelectTrigger className="w-[260px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos los proveedores</SelectItem>
                    {proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.codigo ? `[${p.codigo}] ` : ''}{p.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1 flex-1 max-w-md">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Buscar por SKU, código de barras o nombre…" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <Badge variant="outline">{filtered.length} precios vigentes</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Clave</TableHead>
                      <TableHead>Producto</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">Con IVA</TableHead>
                      <TableHead className="text-right">Existencia</TableHead>
                      <TableHead className="text-right">Min</TableHead>
                      <TableHead>Vigencia</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? <TableRow><TableCell colSpan={9} className="text-center py-8">Cargando…</TableCell></TableRow>
                      : filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sin listas cargadas. Usa la pestaña "Cargar lista" para empezar.</TableCell></TableRow>
                      : filtered.map(i => (
                        <TableRow key={i.id}>
                          <TableCell className="font-mono text-xs">{i.producto?.codigo_barras || i.producto?.sku || '—'}</TableCell>
                          <TableCell className="text-sm">{i.producto?.nombre}</TableCell>
                          <TableCell className="text-sm">{i.proveedor?.codigo ? `[${i.proveedor.codigo}] ` : ''}{i.proveedor?.nombre}</TableCell>
                          <TableCell className="text-right font-semibold">${Number(i.precio).toFixed(2)}</TableCell>
                          <TableCell className="text-right text-xs">{i.precio_con_iva != null ? `$${Number(i.precio_con_iva).toFixed(2)}` : '—'}</TableCell>
                          <TableCell className="text-right">{i.existencia_proveedor}</TableCell>
                          <TableCell className="text-right text-xs">{i.cantidad_min}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{i.fecha_vigencia_desde}{i.fecha_vigencia_hasta ? ` → ${i.fecha_vigencia_hasta}` : ''}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="ghost" onClick={() => compare(i.producto_id, i.producto?.codigo_barras || i.producto?.sku || '')}>Comparar</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {compareClave && (
            <Card>
              <CardHeader><CardTitle className="text-base">Comparación de precios para {compareClave}</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">Δ vs mejor</TableHead>
                      <TableHead className="text-right">Existencia</TableHead>
                      <TableHead className="text-right">Cant. min</TableHead>
                      <TableHead>Vigencia</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compareRows.map((r, idx) => {
                      const best = compareRows[0]?.precio || 0;
                      const diff = best > 0 ? ((Number(r.precio) - best) / best) * 100 : 0;
                      return (
                        <TableRow key={r.id} className={idx === 0 ? 'bg-green-50' : ''}>
                          <TableCell>{r.proveedor?.codigo ? `[${r.proveedor.codigo}] ` : ''}{r.proveedor?.nombre}</TableCell>
                          <TableCell className="text-right font-semibold">${Number(r.precio).toFixed(2)}</TableCell>
                          <TableCell className="text-right text-xs">
                            {idx === 0 ? <Badge className="bg-green-600">MEJOR</Badge> :
                              <span className="text-red-600 inline-flex items-center gap-1"><TrendingUp className="h-3 w-3" />+{diff.toFixed(1)}%</span>}
                          </TableCell>
                          <TableCell className="text-right">{r.existencia_proveedor}</TableCell>
                          <TableCell className="text-right">{r.cantidad_min}</TableCell>
                          <TableCell className="text-xs">{r.fecha_vigencia_desde}{r.fecha_vigencia_hasta ? ` → ${r.fecha_vigencia_hasta}` : ''}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="cargar">
          <Card>
            <CardContent className="pt-6 space-y-6">
              <div>
                <h3 className="font-semibold text-sm mb-2">Archivo tal cual del proveedor (mapeo guardado)</h3>
                <MapeoProveedorUploader onDone={() => { load(); setTab('ver'); }} />
              </div>
              <div className="border-t pt-6">
                <h3 className="font-semibold text-sm mb-2">Plantilla estándar</h3>
                <ListaPreciosUploader onDone={() => { load(); setTab('ver'); }} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historial">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" />Historial de cargas</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Archivo</TableHead>
                      <TableHead className="text-right">Líneas</TableHead>
                      <TableHead className="text-right">Actualizados</TableHead>
                      <TableHead className="text-right">Nuevos</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingCargas ? <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando…</TableCell></TableRow>
                      : cargas.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin cargas registradas.</TableCell></TableRow>
                      : cargas.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="text-xs">{new Date(c.created_at).toLocaleString()}</TableCell>
                          <TableCell className="text-sm">{c.proveedor?.codigo ? `[${c.proveedor.codigo}] ` : ''}{c.proveedor?.nombre}</TableCell>
                          <TableCell className="text-xs font-mono">{c.archivo_nombre}</TableCell>
                          <TableCell className="text-right">{c.productos_cargados}</TableCell>
                          <TableCell className="text-right">{c.productos_actualizados}</TableCell>
                          <TableCell className="text-right">{c.productos_autocreados}</TableCell>
                          <TableCell>
                            {isAdmin && (
                              <Button size="sm" variant="ghost" disabled={reverting === c.id} onClick={() => revertir(c.id)}>
                                {reverting === c.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Undo2 className="h-3 w-3 mr-1" />}
                                Revertir
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
