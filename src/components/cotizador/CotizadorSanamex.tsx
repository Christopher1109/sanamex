import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, RefreshCw, ShoppingCart, Search, EyeOff, TrendingUp, TrendingDown, AlertTriangle, Download } from 'lucide-react';
import { toast } from 'sonner';

type Sucursal = { id: string; codigo: string; nombre: string; es_cedis: boolean };
type Postor = { proveedor_id: string; proveedor_nombre: string; precio: number; existencia: number; dias_entrega: number; entrega_por_sucursal?: boolean } | null;
type SucursalCell = { sucursal_id: string; existencia: number; ult30: number; transito: number; necesidad: number };
type Fila = {
  producto_id: string; sku: string; nombre: string; descripcion: string | null;
  codigo_barras: string | null; clasificacion: string | null; estatus: string | null;
  iva_tasa: number | null; ieps: number | null; iva_incluido: boolean;
  sin_lista_regular: boolean;
  exist_total: number; exist_sucursales: number; transito_global: number;
  ult30_total: number; ddi: number | null; venta_dia_anterior: number;
  ultimo_precio_compra: number | null; mejor_precio: number | null;
  variacion_precio_abs: number; variacion_precio_pct: number | null;
  ganador: Postor; postor_2: Postor; postor_3: Postor;
  piezas_corrugado: number | null; alerta_oferta: boolean;
  sucursales: Record<string, SucursalCell>;
};

type Snapshot = { sucursales: Sucursal[]; productos: Fila[] };

// Sugerido editable por (producto_id, sucursal_codigo) → cantidad
type EditMap = Record<string, Record<string, number>>;

export default function CotizadorSanamex() {
  const [loading, setLoading] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [search, setSearch] = useState('');
  const [incluirSinLista, setIncluirSinLista] = useState(false);
  const [excluirE, setExcluirE] = useState(true);
  const [soloFaltantes, setSoloFaltantes] = useState(true);
  const [filtroProv, setFiltroProv] = useState<string>('all');
  const [filtroVar, setFiltroVar] = useState<'todos' | 'subieron' | 'bajaron'>('todos');
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<EditMap>({});
  const [genOpen, setGenOpen] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [detalleHist, setDetalleHist] = useState<Fila | null>(null);
  const [histData, setHistData] = useState<any[]>([]);

  const folioRun = useMemo(() => 'COT-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(), []);

  async function cargar() {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('cotizador_snapshot', {
        p_incluir_sin_lista: incluirSinLista,
        p_excluir_estatus_e: excluirE,
        p_solo_con_faltante: soloFaltantes,
        p_search: search || null,
        p_limit: 1000,
        p_offset: 0,
      });
      if (error) throw error;
      setSnap(data as unknown as Snapshot);
      setEdits({});
    } catch (e: any) {
      toast.error('Error al cargar cotizador: ' + e.message);
    } finally { setLoading(false); }
  }

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  const sucursales = snap?.sucursales?.filter(s => !s.es_cedis) || [];

  // Sugerido calculado por celda (max(0, necesidad - existencia - transito), redondeado a corrugado si aplica)
  function sugeridoCalc(f: Fila, sCodigo: string) {
    const c = f.sucursales?.[sCodigo];
    if (!c) return 0;
    const dif = c.necesidad - c.existencia - c.transito;
    let s = Math.max(0, Math.ceil(dif));
    const pxc = f.piezas_corrugado || 0;
    if (pxc > 1 && s > 0) s = Math.ceil(s / pxc) * pxc;
    return s;
  }

  function sugeridoValor(f: Fila, sCodigo: string) {
    const edited = edits[f.producto_id]?.[sCodigo];
    if (edited !== undefined) return edited;
    return sugeridoCalc(f, sCodigo);
  }

  function setEdit(pid: string, sCodigo: string, val: number) {
    setEdits(prev => ({ ...prev, [pid]: { ...(prev[pid] || {}), [sCodigo]: val } }));
  }

  const filasFiltradas = useMemo(() => {
    if (!snap) return [];
    return snap.productos.filter(f => {
      if (ocultas.has(f.producto_id)) return false;
      if (filtroProv !== 'all' && f.ganador?.proveedor_id !== filtroProv) return false;
      if (filtroVar === 'subieron' && !(f.variacion_precio_abs > 0)) return false;
      if (filtroVar === 'bajaron' && !(f.variacion_precio_abs < 0)) return false;
      return true;
    });
  }, [snap, ocultas, filtroProv, filtroVar]);

  const proveedoresGanadores = useMemo(() => {
    const map = new Map<string, string>();
    (snap?.productos || []).forEach(f => {
      if (f.ganador?.proveedor_id) map.set(f.ganador.proveedor_id, f.ganador.proveedor_nombre);
    });
    return Array.from(map.entries());
  }, [snap]);

  // Agrupa selección por proveedor ganador para el diálogo de generación
  const grupoPorProv = useMemo(() => {
    const g: Record<string, { proveedor_nombre: string; entrega_por_sucursal: boolean; lineas: { producto_id: string; sku: string; nombre: string; sucursal_codigo: string; sucursal_id: string; cantidad: number; precio_unitario: number; precio_con_iva: number }[]; total: number }> = {};
    filasFiltradas.forEach(f => {
      if (!seleccion.has(f.producto_id) || !f.ganador) return;
      const pid = f.ganador.proveedor_id;
      if (!g[pid]) g[pid] = { proveedor_nombre: f.ganador.proveedor_nombre, entrega_por_sucursal: !!f.ganador.entrega_por_sucursal, lineas: [], total: 0 };
      sucursales.forEach(s => {
        const q = sugeridoValor(f, s.codigo);
        if (q > 0) {
          const conIva = f.ganador!.precio;
          const iva = f.iva_tasa || 0;
          const sinIva = iva > 0 ? conIva / (1 + iva / 100) : conIva;
          g[pid].lineas.push({
            producto_id: f.producto_id, sku: f.sku, nombre: f.nombre,
            sucursal_codigo: s.codigo, sucursal_id: s.id, cantidad: q,
            precio_unitario: +sinIva.toFixed(4), precio_con_iva: +conIva.toFixed(4),
          });
          g[pid].total += q * conIva;
        }
      });
    });
    return g;
  }, [filasFiltradas, seleccion, edits, sucursales]);

  async function generarOC(proveedorId: string) {
    setGenerando(true);
    try {
      const g = grupoPorProv[proveedorId];
      const { data, error } = await supabase.rpc('cotizador_generar_oc', {
        payload: {
          proveedor_id: proveedorId,
          folio_cotizacion: folioRun,
          lineas: g.lineas.map(l => ({
            producto_id: l.producto_id, sucursal_id: l.sucursal_id,
            cantidad: l.cantidad, precio_unitario: l.precio_unitario, precio_con_iva: l.precio_con_iva,
          })),
        },
      });
      if (error) throw error;
      const ordenes = (data as any)?.ordenes || [];
      toast.success(`${ordenes.length} orden(es) generada(s) para ${g.proveedor_nombre}`);
      // Limpiar selección de esos productos
      const idsAfectados = new Set(g.lineas.map(l => l.producto_id));
      setSeleccion(prev => new Set([...prev].filter(id => !idsAfectados.has(id))));
      setGenOpen(false);
      cargar();
    } catch (e: any) {
      toast.error('Error al generar OC: ' + e.message);
    } finally { setGenerando(false); }
  }

  async function verHistorial(f: Fila) {
    setDetalleHist(f);
    const { data } = await supabase.rpc('cotizador_historial_mensual', { p_producto_id: f.producto_id });
    setHistData((data as any) || []);
  }

  function toggleSeleccion(pid: string) {
    setSeleccion(prev => { const n = new Set(prev); n.has(pid) ? n.delete(pid) : n.add(pid); return n; });
  }
  function ocultar(pid: string) { setOcultas(prev => new Set(prev).add(pid)); }

  function exportarExcel() {
    if (!snap) return;
    const headers = ['SKU', 'Descripción', 'Clasif', 'Estatus', 'Exist total', 'Suma sucursales', 'Tránsito', 'DDI', 'Últ30 total'];
    sucursales.forEach(s => headers.push(`${s.codigo} exist`, `${s.codigo} ult30`, `${s.codigo} necesidad`, `${s.codigo} sugerido`));
    headers.push('Último precio', 'Mejor precio', 'Δ$', 'Δ%', 'Ganador', 'Existencia ganador');
    const rows = filasFiltradas.map(f => {
      const r: any[] = [f.sku, f.nombre, f.clasificacion || '', f.estatus || '', f.exist_total, f.exist_sucursales, f.transito_global, f.ddi ?? '', f.ult30_total];
      sucursales.forEach(s => {
        const c = f.sucursales?.[s.codigo];
        r.push(c?.existencia ?? 0, c?.ult30 ?? 0, c?.necesidad ?? 0, sugeridoValor(f, s.codigo));
      });
      r.push(f.ultimo_precio_compra ?? '', f.mejor_precio ?? '', f.variacion_precio_abs, f.variacion_precio_pct ?? '', f.ganador?.proveedor_nombre ?? '', f.ganador?.existencia ?? '');
      return r;
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cotizador_${folioRun}.csv`;
    a.click();
  }

  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[240px]">
          <label className="text-xs text-muted-foreground">Buscar (SKU, nombre, código de barras)</label>
          <div className="flex gap-2">
            <Input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && cargar()} placeholder="Buscar…" />
            <Button variant="outline" size="sm" onClick={cargar}><Search className="h-4 w-4" /></Button>
          </div>
        </div>
        <label className="flex items-center gap-1 text-xs"><Checkbox checked={soloFaltantes} onCheckedChange={v => setSoloFaltantes(!!v)} />Solo con faltantes</label>
        <label className="flex items-center gap-1 text-xs"><Checkbox checked={excluirE} onCheckedChange={v => setExcluirE(!!v)} />Excluir estatus "E"</label>
        <label className="flex items-center gap-1 text-xs"><Checkbox checked={incluirSinLista} onCheckedChange={v => setIncluirSinLista(!!v)} />Incluir "sin lista"</label>
        <Select value={filtroProv} onValueChange={setFiltroProv}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Proveedor ganador" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los ganadores</SelectItem>
            {proveedoresGanadores.map(([id, nom]) => <SelectItem key={id} value={id}>{nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroVar} onValueChange={(v: any) => setFiltroVar(v)}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Variación: todos</SelectItem>
            <SelectItem value="subieron">Precios que subieron</SelectItem>
            <SelectItem value="bajaron">Precios que bajaron</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={cargar} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Recalcular
        </Button>
        <Button variant="outline" size="sm" onClick={exportarExcel} disabled={!snap}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        <Button size="sm" onClick={() => setGenOpen(true)} disabled={seleccion.size === 0}>
          <ShoppingCart className="h-4 w-4 mr-1" /> Generar OC ({seleccion.size})
        </Button>
      </Card>

      <div className="text-xs text-muted-foreground">
        Folio corrida: <span className="font-mono">{folioRun}</span> · {filasFiltradas.length} productos {ocultas.size > 0 && `· ${ocultas.size} ocultos`}
        {ocultas.size > 0 && <Button variant="link" size="sm" className="h-auto p-0 ml-2" onClick={() => setOcultas(new Set())}>Restaurar</Button>}
      </div>

      <Card className="overflow-auto max-h-[75vh]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead>Clasif</TableHead>
              <TableHead className="text-right">Exist total</TableHead>
              <TableHead className="text-right">Tránsito</TableHead>
              <TableHead className="text-right">DDI</TableHead>
              <TableHead className="text-right">Últ30</TableHead>
              {sucursales.map(s => (
                <TableHead key={s.id} className="text-center border-l bg-muted/40" colSpan={4}>{s.codigo}</TableHead>
              ))}
              <TableHead className="text-right border-l">Últ. precio</TableHead>
              <TableHead className="text-right">Mejor precio</TableHead>
              <TableHead className="text-right">Δ%</TableHead>
              <TableHead>Ganador</TableHead>
              <TableHead>2º postor</TableHead>
              <TableHead>3er postor</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
            <TableRow>
              <TableHead colSpan={8}></TableHead>
              {sucursales.map(s => (
                <>
                  <TableHead key={s.id + '-e'} className="text-right text-xs border-l">Exist</TableHead>
                  <TableHead key={s.id + '-u'} className="text-right text-xs">Últ30</TableHead>
                  <TableHead key={s.id + '-n'} className="text-right text-xs">Nec.</TableHead>
                  <TableHead key={s.id + '-s'} className="text-right text-xs bg-primary/10">Sug.</TableHead>
                </>
              ))}
              <TableHead colSpan={7}></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={100} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>}
            {!loading && filasFiltradas.length === 0 && <TableRow><TableCell colSpan={100} className="text-center py-8 text-muted-foreground">Sin resultados</TableCell></TableRow>}
            {filasFiltradas.map(f => {
              const varPct = f.variacion_precio_pct;
              return (
                <TableRow key={f.producto_id} className={seleccion.has(f.producto_id) ? 'bg-primary/5' : ''}>
                  <TableCell><Checkbox checked={seleccion.has(f.producto_id)} onCheckedChange={() => toggleSeleccion(f.producto_id)} /></TableCell>
                  <TableCell className="font-mono text-xs">{f.sku}</TableCell>
                  <TableCell className="text-xs max-w-[280px]">
                    <button className="text-left hover:underline" onClick={() => verHistorial(f)}>{f.nombre}</button>
                    {f.alerta_oferta && <AlertTriangle className="inline h-3 w-3 ml-1 text-orange-500" />}
                    {f.sin_lista_regular && <Badge variant="outline" className="ml-1 text-[10px]">sin lista</Badge>}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{f.clasificacion || '-'}</Badge></TableCell>
                  <TableCell className="text-right text-xs">{f.exist_total}</TableCell>
                  <TableCell className="text-right text-xs">{f.transito_global}</TableCell>
                  <TableCell className="text-right text-xs">{f.ddi ?? '—'}</TableCell>
                  <TableCell className="text-right text-xs">{Number(f.ult30_total).toFixed(0)}</TableCell>
                  {sucursales.map(s => {
                    const c = f.sucursales?.[s.codigo];
                    const sug = sugeridoValor(f, s.codigo);
                    return (
                      <>
                        <TableCell key={s.id + '-e'} className="text-right text-xs border-l">{c?.existencia ?? 0}</TableCell>
                        <TableCell key={s.id + '-u'} className="text-right text-xs">{Number(c?.ult30 ?? 0).toFixed(0)}</TableCell>
                        <TableCell key={s.id + '-n'} className="text-right text-xs">{Number(c?.necesidad ?? 0).toFixed(0)}</TableCell>
                        <TableCell key={s.id + '-s'} className="text-right text-xs bg-primary/5 p-1">
                          <Input type="number" min={0} value={sug} onChange={e => setEdit(f.producto_id, s.codigo, Math.max(0, parseInt(e.target.value) || 0))} className="h-7 w-16 text-right text-xs px-1" />
                        </TableCell>
                      </>
                    );
                  })}
                  <TableCell className="text-right text-xs border-l">{f.ultimo_precio_compra ? '$' + Number(f.ultimo_precio_compra).toFixed(2) : '—'}</TableCell>
                  <TableCell className="text-right text-xs font-semibold">{f.mejor_precio ? '$' + Number(f.mejor_precio).toFixed(2) : '—'}</TableCell>
                  <TableCell className={`text-right text-xs ${varPct && varPct > 0 ? 'text-red-600' : varPct && varPct < 0 ? 'text-green-600' : ''}`}>
                    {varPct != null ? (<span className="inline-flex items-center gap-0.5">{varPct > 0 ? <TrendingUp className="h-3 w-3" /> : varPct < 0 ? <TrendingDown className="h-3 w-3" /> : null}{varPct.toFixed(1)}%</span>) : '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {f.ganador ? <>
                      <div className="font-medium">{f.ganador.proveedor_nombre}</div>
                      <div className="text-muted-foreground">exist {f.ganador.existencia} · {f.ganador.dias_entrega}d</div>
                    </> : <Badge variant="destructive" className="text-[10px]">Sin proveedor con stock</Badge>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {f.postor_2 ? <>{f.postor_2.proveedor_nombre}<br />${Number(f.postor_2.precio).toFixed(2)} · {f.postor_2.existencia}</> : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {f.postor_3 ? <>{f.postor_3.proveedor_nombre}<br />${Number(f.postor_3.precio).toFixed(2)} · {f.postor_3.existencia}</> : '—'}
                  </TableCell>
                  <TableCell><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => ocultar(f.producto_id)}><EyeOff className="h-3 w-3" /></Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Diálogo Historial */}
      <Dialog open={!!detalleHist} onOpenChange={o => !o && setDetalleHist(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Histórico mensual — {detalleHist?.nombre}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Mes</TableHead><TableHead>Sucursal</TableHead><TableHead className="text-right">Unidades</TableHead></TableRow></TableHeader>
              <TableBody>
                {histData.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">Sin datos históricos</TableCell></TableRow>}
                {histData.map((h, i) => {
                  const suc = snap?.sucursales?.find(s => s.id === h.sucursal_id);
                  return <TableRow key={i}><TableCell>{h.mes}</TableCell><TableCell>{suc?.codigo || '—'}</TableCell><TableCell className="text-right">{Number(h.unidades).toFixed(0)}</TableCell></TableRow>;
                })}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo Generar OC */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Generar órdenes de compra</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[65vh] overflow-auto">
            {Object.entries(grupoPorProv).length === 0 && <p className="text-sm text-muted-foreground">No hay líneas con sugerido &gt; 0 en la selección.</p>}
            {Object.entries(grupoPorProv).map(([pid, g]) => (
              <Card key={pid} className="p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-semibold">{g.proveedor_nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {g.entrega_por_sucursal ? `Genera ${new Set(g.lineas.map(l => l.sucursal_id)).size} OC (por sucursal)` : '1 OC consolidada'}
                      {' · '}{g.lineas.length} línea(s) · Total ≈ ${g.total.toFixed(2)}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => generarOC(pid)} disabled={generando}>
                    {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Fincar'}
                  </Button>
                </div>
                <div className="text-xs max-h-32 overflow-auto">
                  {g.lineas.map((l, i) => (
                    <div key={i} className="flex justify-between border-t py-1">
                      <span>{l.sku} · {l.nombre}</span>
                      <span className="text-muted-foreground">{l.sucursal_codigo} · {l.cantidad} × ${l.precio_con_iva.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
