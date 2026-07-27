import { useEffect, useMemo, useState, Fragment } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, RefreshCw, ShoppingCart, Search, EyeOff, TrendingUp, TrendingDown, AlertTriangle, Download, ChevronRight, Package, Layers, RotateCcw, Truck, Save } from 'lucide-react';
import { toast } from 'sonner';

const HIDDEN_KEY = 'cotizador_hidden_v1';
// Encabezados fijos: fila 1 (top 0) y fila 2 (top 48) del header del cotizador.
const TH1 = 'sticky top-0 z-30 bg-background';
const TH2 = 'sticky z-30 bg-background border-b top-12';

type Sucursal = { id: string; codigo: string; nombre: string; es_cedis: boolean };
type Postor = { proveedor_id: string; proveedor_nombre: string; proveedor_codigo?: string; precio: number; precio_bruto?: number; existencia: number; dias_entrega: number; entrega_por_sucursal?: boolean; con_oferta?: boolean } | null;
type SucursalCell = { sucursal_id: string; existencia: number; ult30: number; ult30_dia_anterior: number; transito: number; necesidad: number; dif: number; estatus: string | null };
type ProveedorRow = { proveedor_id: string; proveedor_nombre: string; proveedor_codigo?: string; precio: number; existencia: number; dias_entrega: number; con_oferta: boolean; sin_lista_regular: boolean };
type Fila = {
  producto_id: string; sku: string; nombre: string; descripcion: string | null;
  codigo_barras: string | null; clasificacion: string | null; estatus: string | null;
  iva_tasa: number | null; ieps: number | null; iva_incluido: boolean;
  sin_lista_regular: boolean;
  exist_total: number; exist_sucursales: number; exist_cedis: number; transito_global: number;
  ult30_total: number; periodo_anterior_total: number; tendencia_abs: number; tendencia_pct: number | null;
  ddi: number | null; venta_dia_anterior: number;
  ultimo_precio_compra: number | null; mejor_precio: number | null;
  variacion_precio_abs: number; variacion_precio_pct: number | null;
  ganador: Postor; postor_2: Postor; postor_3: Postor;
  todos_proveedores: ProveedorRow[];
  piezas_corrugado: number | null; caja_cerrada: boolean; alerta_oferta: boolean;
  sucursales: Record<string, SucursalCell>;
};
type Snapshot = { sucursales: Sucursal[]; productos: Fila[] };
type EditMap = Record<string, Record<string, number>>;
type OverrideKey = string; // `${producto_id}|${sucursal_id}`

const ESTATUS_COLORS: Record<string, string> = {
  A: 'bg-green-100 text-green-800', I: 'bg-blue-100 text-blue-800', C: 'bg-yellow-100 text-yellow-800',
  S: 'bg-gray-100 text-gray-800', N: 'bg-purple-100 text-purple-800', E: 'bg-red-100 text-red-800',
  K: 'bg-orange-100 text-orange-800', G: 'bg-cyan-100 text-cyan-800',
};

export default function CotizadorSanamex() {
  const [loading, setLoading] = useState(false);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [search, setSearch] = useState('');
  const [incluirSinLista, setIncluirSinLista] = useState(false);
  const [excluirE, setExcluirE] = useState(true);
  const [soloFaltantes, setSoloFaltantes] = useState(true);
  const [filtroEstatus, setFiltroEstatus] = useState<Set<string>>(new Set());
  const [soloConOferta, setSoloConOferta] = useState(false);
  const [ocultas, setOcultas] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); } catch { return new Set(); }
  });
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<EditMap>({});
  const [overrides, setOverrides] = useState<Record<OverrideKey, number>>({});
  const [savingOv, setSavingOv] = useState<Set<string>>(new Set());
  const [genOpen, setGenOpen] = useState(false);
  const [generando, setGenerando] = useState(false);
  const [detalle, setDetalle] = useState<Fila | null>(null);
  const [histData, setHistData] = useState<any[]>([]);
  const [ocAbiertas, setOcAbiertas] = useState<any[]>([]);

  useEffect(() => {
    try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(ocultas))); } catch {}
  }, [ocultas]);

  const folioRun = useMemo(() => 'COT-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(), []);

  async function cargar() {
    setLoading(true);
    try {
      const [{ data, error }, { data: ovs, error: eOv }] = await Promise.all([
        supabase.rpc('cotizador_snapshot', {
          p_incluir_sin_lista: incluirSinLista,
          p_excluir_estatus_e: excluirE,
          p_solo_con_faltante: soloFaltantes,
          p_search: search || null,
          p_limit: 1000, p_offset: 0,
        }),
        supabase.rpc('cotizador_overrides_list' as any),
      ]);
      if (error) throw error;
      if (eOv) throw eOv;
      setSnap(data as unknown as Snapshot);
      const ovMap: Record<string, number> = {};
      ((ovs as any[]) || []).forEach(o => { ovMap[`${o.producto_id}|${o.sucursal_id}`] = o.cantidad; });
      setOverrides(ovMap);
      setEdits({});
    } catch (e: any) { toast.error('Error al cargar cotizador: ' + e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  const sucursales = snap?.sucursales?.filter(s => !s.es_cedis) || [];

  function sugeridoCalc(f: Fila, sCodigo: string) {
    const c = f.sucursales?.[sCodigo];
    if (!c) return 0;
    let s = Math.max(0, Math.ceil(c.dif - c.transito));
    if (f.caja_cerrada && f.piezas_corrugado && f.piezas_corrugado > 1 && s > 0) {
      s = Math.ceil(s / f.piezas_corrugado) * f.piezas_corrugado;
    }
    return s;
  }
  function ovKey(pid: string, sid: string) { return `${pid}|${sid}`; }
  function sugeridoValor(f: Fila, sCodigo: string) {
    const c = f.sucursales?.[sCodigo];
    const edited = edits[f.producto_id]?.[sCodigo];
    if (edited !== undefined) return edited;
    if (c) {
      const ov = overrides[ovKey(f.producto_id, c.sucursal_id)];
      if (ov !== undefined) return ov;
    }
    return sugeridoCalc(f, sCodigo);
  }
  function hasOverride(f: Fila, sCodigo: string) {
    const c = f.sucursales?.[sCodigo];
    return !!(c && overrides[ovKey(f.producto_id, c.sucursal_id)] !== undefined);
  }
  function setEdit(pid: string, sCodigo: string, val: number) {
    setEdits(prev => ({ ...prev, [pid]: { ...(prev[pid] || {}), [sCodigo]: val } }));
  }
  async function guardarOverride(f: Fila, sCodigo: string) {
    const c = f.sucursales?.[sCodigo];
    if (!c) return;
    const val = sugeridoValor(f, sCodigo);
    const key = ovKey(f.producto_id, c.sucursal_id);
    setSavingOv(prev => new Set(prev).add(key));
    try {
      const { error } = await supabase.rpc('cotizador_upsert_override' as any, {
        p_producto_id: f.producto_id, p_sucursal_id: c.sucursal_id, p_cantidad: val, p_motivo: null,
      });
      if (error) throw error;
      setOverrides(prev => ({ ...prev, [key]: val }));
      setEdits(prev => { const n = { ...prev }; if (n[f.producto_id]) { delete n[f.producto_id][sCodigo]; } return n; });
      toast.success('Sugerido guardado');
    } catch (e: any) { toast.error('No se pudo guardar: ' + e.message); }
    finally { setSavingOv(prev => { const n = new Set(prev); n.delete(key); return n; }); }
  }
  async function restaurarOverride(f: Fila, sCodigo: string) {
    const c = f.sucursales?.[sCodigo];
    if (!c) return;
    const key = ovKey(f.producto_id, c.sucursal_id);
    try {
      const { error } = await supabase.rpc('cotizador_upsert_override' as any, {
        p_producto_id: f.producto_id, p_sucursal_id: c.sucursal_id, p_cantidad: null as any, p_motivo: null,
      });
      if (error) throw error;
      setOverrides(prev => { const n = { ...prev }; delete n[key]; return n; });
      setEdits(prev => { const n = { ...prev }; if (n[f.producto_id]) { delete n[f.producto_id][sCodigo]; } return n; });
      toast.success('Restaurado al valor del sistema');
    } catch (e: any) { toast.error('No se pudo restaurar: ' + e.message); }
  }

  const filasFiltradas = useMemo(() => {
    if (!snap) return [];
    return snap.productos.filter(f => {
      if (ocultas.has(f.producto_id)) return false;
      if (filtroEstatus.size > 0 && !filtroEstatus.has(f.estatus || '')) return false;
      if (soloConOferta && !f.alerta_oferta) return false;
      return true;
    });
  }, [snap, ocultas, filtroEstatus, soloConOferta]);

  const estatusPresentes = useMemo(() => {
    return Array.from(new Set((snap?.productos || []).map(f => f.estatus).filter(Boolean))) as string[];
  }, [snap]);

  const grupoPorProv = useMemo(() => {
    const g: Record<string, { proveedor_nombre: string; entrega_por_sucursal: boolean; lineas: any[]; total: number }> = {};
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
            producto_id: f.producto_id, sku: f.sku, nombre: f.nombre, codigo_barras: f.codigo_barras,
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
          proveedor_id: proveedorId, folio_cotizacion: folioRun,
          lineas: g.lineas.map(l => ({ producto_id: l.producto_id, sucursal_id: l.sucursal_id, cantidad: l.cantidad, precio_unitario: l.precio_unitario, precio_con_iva: l.precio_con_iva })),
        },
      });
      if (error) throw error;
      const ordenes = (data as any)?.ordenes || [];
      toast.success(`${ordenes.length} orden(es) generada(s) para ${g.proveedor_nombre}`);
      const idsAfectados = new Set(g.lineas.map(l => l.producto_id));
      setSeleccion(prev => new Set([...prev].filter(id => !idsAfectados.has(id))));
      setGenOpen(false);
      cargar();
    } catch (e: any) { toast.error('Error al generar OC: ' + e.message); }
    finally { setGenerando(false); }
  }

  async function verDetalle(f: Fila) {
    setDetalle(f);
    setHistData([]); setOcAbiertas([]);
    const [{ data: h }, { data: oc }] = await Promise.all([
      supabase.rpc('cotizador_historial_mensual', { p_producto_id: f.producto_id }),
      supabase.rpc('cotizador_oc_abiertas', { p_producto_id: f.producto_id }),
    ]);
    setHistData((h as any) || []);
    setOcAbiertas((oc as any) || []);
  }

  function toggleSeleccion(pid: string) {
    setSeleccion(prev => { const n = new Set(prev); n.has(pid) ? n.delete(pid) : n.add(pid); return n; });
  }
  function ocultar(pid: string) { setOcultas(prev => new Set(prev).add(pid)); }

  function exportarCSV() {
    if (!snap) return;
    const headers = ['clave', 'SKU', 'Descripción', 'Clasif', 'Estatus', 'CEDIS', 'Exist total', 'Suma suc.', 'Tránsito', 'DDI', 'Vta día ant.', 'Últ30 total', 'Δ 30d %'];
    sucursales.forEach(s => headers.push(`${s.codigo} exist`, `${s.codigo} ult30`, `${s.codigo} nec.`, `${s.codigo} DIF`, `${s.codigo} estatus`, `${s.codigo} sugerido`));
    headers.push('Últ. precio', 'Mejor precio', 'Δ$', 'Δ%', 'Ganador', 'Existencia ganador', '2º postor', '3º postor', 'Pzas/corrug.');
    const rows = filasFiltradas.map(f => {
      const r: any[] = [f.codigo_barras || '', f.sku, f.nombre, f.clasificacion || '', f.estatus || '', f.exist_cedis, f.exist_total, f.exist_sucursales, f.transito_global, f.ddi ?? '', f.venta_dia_anterior, f.ult30_total, f.tendencia_pct ?? ''];
      sucursales.forEach(s => {
        const c = f.sucursales?.[s.codigo];
        r.push(c?.existencia ?? 0, c?.ult30 ?? 0, c?.necesidad ?? 0, c?.dif ?? 0, c?.estatus ?? '', sugeridoValor(f, s.codigo));
      });
      r.push(f.ultimo_precio_compra ?? '', f.mejor_precio ?? '', f.variacion_precio_abs, f.variacion_precio_pct ?? '', f.ganador?.proveedor_nombre ?? '', f.ganador?.existencia ?? '', f.postor_2?.proveedor_nombre ?? '', f.postor_3?.proveedor_nombre ?? '', f.piezas_corrugado ?? '');
      return r;
    });
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cotizador_${folioRun}.csv`; a.click();
  }

  return (
    <div className="space-y-3">
      <Card className="p-3 flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs text-muted-foreground">Buscar (clave / SKU / nombre)</label>
          <div className="flex gap-1">
            <Input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && cargar()} placeholder="Buscar…" />
            <Button variant="outline" size="sm" onClick={cargar}><Search className="h-4 w-4" /></Button>
          </div>
        </div>
        <Tooltip><TooltipTrigger asChild>
          <label className="flex items-center gap-1 text-xs cursor-help"><Checkbox checked={soloFaltantes} onCheckedChange={v => setSoloFaltantes(!!v)} />Solo faltantes</label>
        </TooltipTrigger><TooltipContent>Oculta productos que ya tienen suficiente inventario/tránsito para cubrir la necesidad — solo muestra lo que sí hay que pedir.</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild>
          <label className="flex items-center gap-1 text-xs cursor-help"><Checkbox checked={excluirE} onCheckedChange={v => setExcluirE(!!v)} />Excluir estatus "E"</label>
        </TooltipTrigger><TooltipContent>"E" = artículo de única ocasión / especial. No se resurte normalmente, por eso se excluye del cotizador por default.</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild>
          <label className="flex items-center gap-1 text-xs cursor-help"><Checkbox checked={incluirSinLista} onCheckedChange={v => setIncluirSinLista(!!v)} />Incluir sin lista</label>
        </TooltipTrigger><TooltipContent>Cuando está apagado, oculta productos que no tienen precio de ningún proveedor regular cargado (no se les puede calcular "mejor precio").</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild>
          <label className="flex items-center gap-1 text-xs cursor-help"><Checkbox checked={soloConOferta} onCheckedChange={v => setSoloConOferta(!!v)} />Solo con oferta</label>
        </TooltipTrigger><TooltipContent>Muestra solo productos donde el mejor precio disponible supera el de una oferta vigente — vale la pena revisar antes de comprar.</TooltipContent></Tooltip>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Estatus:</span>
          {['A','I','C','S','N','K','G'].map(e => (
            <label key={e} className="flex items-center gap-0.5 text-xs cursor-pointer">
              <Checkbox
                checked={filtroEstatus.size === 0 || filtroEstatus.has(e)}
                onCheckedChange={v => setFiltroEstatus(prev => {
                  // Si no hay filtro activo, "destildar" uno arranca la selección desde todos menos ese.
                  const base = prev.size === 0 ? new Set(estatusPresentes.length ? estatusPresentes : ['A','I','C','S','N','K','G']) : new Set(prev);
                  if (v) base.add(e); else base.delete(e);
                  // Si quedaron todos marcados, volvemos a "sin filtro" (más simple internamente).
                  return base.size >= (estatusPresentes.length || 7) ? new Set() : base;
                })}
              />
              <span className={`px-1 rounded text-[10px] ${ESTATUS_COLORS[e] || 'bg-gray-100'}`}>{e}</span>
            </label>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={cargar} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Recalcular</Button>
        <Button variant="outline" size="sm" onClick={exportarCSV} disabled={!snap}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        <Button size="sm" onClick={() => setGenOpen(true)} disabled={seleccion.size === 0}>
          <ShoppingCart className="h-4 w-4 mr-1" /> Generar OC ({seleccion.size})
        </Button>
      </Card>

      <div className="text-xs text-muted-foreground flex items-center gap-3">
        <span>Folio: <span className="font-mono">{folioRun}</span></span>
        <span>{filasFiltradas.length} productos</span>
        {ocultas.size > 0 && <><span>· {ocultas.size} ocultos</span><Button variant="link" size="sm" className="h-auto p-0" onClick={() => setOcultas(new Set())}>Restaurar</Button></>}
      </div>

      {!loading && snap && (snap.productos?.length ?? 0) > 0 && (
        <>
          {(snap.productos || []).every(f => !f.ult30_total) && (
            <div className="text-xs rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2">
              No hay ventas registradas en los últimos 30 días, por lo que la necesidad y el sugerido salen en 0. Carga el histórico de ventas o desactiva “Solo faltantes” para revisar el catálogo completo.
            </div>
          )}
          {(snap.productos || []).every(f => !f.mejor_precio) && (
            <div className="text-xs rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2">
              No hay listas de precios de proveedor cargadas: no se puede calcular mejor precio ni proveedor ganador. Cárgalas en Compras → Catálogos → Proveedores.
            </div>
          )}
        </>
      )}

      <TooltipProvider>
        <Card className="overflow-auto max-h-[75vh] relative">
          <table className="w-full caption-bottom text-sm border-separate border-spacing-0">
            <TableHeader className="[&_th]:border-b">
              <TableRow className="bg-background">
                <TableHead className="sticky top-0 left-0 z-40 bg-background px-1" style={{ width: 36, minWidth: 36, maxWidth: 36 }}></TableHead>
                <TableHead className="sticky top-0 z-40 bg-background overflow-hidden px-2" style={{ left: 36, width: 110, minWidth: 110, maxWidth: 110 }}>SKU</TableHead>
                <TableHead className="sticky top-0 z-40 bg-background border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.25)] overflow-hidden px-2" style={{ left: 146, width: 220, minWidth: 220, maxWidth: 220 }}>Descripción</TableHead>
                <TableHead className={TH1}>Clasif</TableHead>
                <TableHead className={`${TH1} text-center`}>Est.</TableHead>
                <TableHead className={`${TH1} text-right`}>CEDIS</TableHead>
                <TableHead className={`${TH1} text-right`}>Exist total</TableHead>
                <TableHead className={`${TH1} text-right`}>Suma suc.</TableHead>
                <TableHead className={`${TH1} text-right`}>Tránsito</TableHead>
                <TableHead className={`${TH1} text-right`}>DDI</TableHead>
                <TableHead className={`${TH1} text-right`}>Vta ayer</TableHead>
                <TableHead className={`${TH1} text-right`}>Últ30</TableHead>
                <TableHead className={`${TH1} text-right`}>Δ 30d</TableHead>
                {sucursales.map(s => (
                  <TableHead key={s.id} className={`${TH1} text-center border-l bg-muted`} colSpan={5}>{s.codigo}</TableHead>
                ))}
                <TableHead className={`${TH1} text-right border-l`}>Últ. $</TableHead>
                <TableHead className={`${TH1} text-right`}>Mejor $</TableHead>
                <TableHead className={`${TH1} text-right`}>Δ%</TableHead>
                <TableHead className={TH1}>Ganador</TableHead>
                <TableHead className={TH1}>2º</TableHead>
                <TableHead className={TH1}>3º</TableHead>
                <TableHead className={`${TH1} text-right`}>P/Corrug</TableHead>
                <TableHead className={`${TH1} w-8`}></TableHead>
                <TableHead className={`${TH1} w-8`}></TableHead>
              </TableRow>
              <TableRow className="text-[10px] bg-background h-9">
                <TableHead className="sticky left-0 z-40 bg-background h-9 border-b" style={{ top: 48, width: 36, minWidth: 36 }}></TableHead>
                <TableHead className="sticky z-40 bg-background h-9 border-b" style={{ top: 48, left: 36, width: 110, minWidth: 110 }}></TableHead>
                <TableHead className="sticky z-40 bg-background border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.25)] h-9 border-b" style={{ top: 48, left: 146, width: 220, minWidth: 220 }}></TableHead>
                <TableHead colSpan={10} className={`${TH2} h-9`}></TableHead>
                {sucursales.flatMap(s => [
                  <TableHead key={s.id + '-e'} className={`${TH2} text-right border-l`}>Exist</TableHead>,
                  <TableHead key={s.id + '-u'} className={`${TH2} text-right`}>Últ30</TableHead>,
                  <TableHead key={s.id + '-n'} className={`${TH2} text-right`}>Nec.</TableHead>,
                  <TableHead key={s.id + '-d'} className={`${TH2} text-right`}>DIF</TableHead>,
                  <TableHead key={s.id + '-s'} className={`${TH2} text-right bg-primary/10`}>Sug.</TableHead>,
                ])}
                <TableHead colSpan={8} className={TH2}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={100} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin inline" /></TableCell></TableRow>}
              {!loading && filasFiltradas.length === 0 && (
                <TableRow><TableCell colSpan={100} className="text-center py-8 text-muted-foreground">
                  <p className="font-medium">Sin resultados</p>
                  <p className="text-xs mt-1">
                    {soloFaltantes
                      ? 'Ningún producto tiene faltante con los filtros actuales (sin ventas recientes, la necesidad calculada es 0).'
                      : 'Ningún producto cumple los filtros actuales.'}
                  </p>
                  {soloFaltantes && (
                    <Button variant="link" size="sm" className="mt-1" onClick={() => { setSoloFaltantes(false); setTimeout(cargar, 0); }}>
                      Ver todos los productos
                    </Button>
                  )}
                </TableCell></TableRow>
              )}
              {filasFiltradas.map(f => {
                const varPct = f.variacion_precio_pct;
                const tend = f.tendencia_pct;
                return (
                  <TableRow key={f.producto_id} className={seleccion.has(f.producto_id) ? 'bg-primary/5' : ''}>
                    <TableCell className="sticky left-0 z-10 bg-inherit px-1" style={{ width: 36, minWidth: 36, maxWidth: 36 }}><Checkbox checked={seleccion.has(f.producto_id)} onCheckedChange={() => toggleSeleccion(f.producto_id)} /></TableCell>
                    <TableCell className="sticky z-10 bg-inherit font-mono text-xs border-r overflow-hidden px-2" style={{ left: 36, width: 110, minWidth: 110, maxWidth: 110 }}>{f.sku}</TableCell>
                    <TableCell className="sticky z-10 bg-inherit text-xs border-r overflow-hidden px-2" style={{ left: 146, width: 220, minWidth: 220, maxWidth: 220 }}>
                      <button className="text-left hover:underline line-clamp-2 leading-tight" onClick={() => verDetalle(f)} title={f.nombre}>{f.nombre}</button>
                      <div className="flex gap-1 mt-0.5">
                        {f.alerta_oferta && <Tooltip><TooltipTrigger><AlertTriangle className="h-3 w-3 text-orange-500" /></TooltipTrigger><TooltipContent>Mejor precio supera oferta vigente</TooltipContent></Tooltip>}
                        {f.sin_lista_regular && <Badge variant="outline" className="text-[9px] px-1 py-0">sin lista</Badge>}
                        {f.caja_cerrada && <Tooltip><TooltipTrigger><Package className="h-3 w-3 text-muted-foreground" /></TooltipTrigger><TooltipContent>Caja cerrada: {f.piezas_corrugado} pzas</TooltipContent></Tooltip>}
                      </div>
                    </TableCell>
                    <TableCell className="text-center"><Badge variant="outline" className="text-[10px]">{f.clasificacion || '-'}</Badge></TableCell>
                    <TableCell className="text-center">{f.estatus && <span className={`text-[10px] px-1 rounded ${ESTATUS_COLORS[f.estatus] || 'bg-gray-100'}`}>{f.estatus}</span>}</TableCell>
                    <TableCell className="text-right text-xs">{f.exist_cedis}</TableCell>
                    <TableCell className="text-right text-xs font-medium">{f.exist_total}</TableCell>
                    <TableCell className="text-right text-xs">{f.exist_sucursales}</TableCell>
                    <TableCell className="text-right text-xs">{f.transito_global}</TableCell>
                    <TableCell className="text-right text-xs">{f.ddi ?? '—'}</TableCell>
                    <TableCell className="text-right text-xs">{Number(f.venta_dia_anterior).toFixed(0)}</TableCell>
                    <TableCell className="text-right text-xs">{Number(f.ult30_total).toFixed(0)}</TableCell>
                    <TableCell className={`text-right text-xs ${tend != null && tend > 0 ? 'text-green-600' : tend != null && tend < 0 ? 'text-red-600' : ''}`}>
                      {tend != null ? <span className="inline-flex items-center gap-0.5">{tend > 0 ? <TrendingUp className="h-3 w-3" /> : tend < 0 ? <TrendingDown className="h-3 w-3" /> : null}{tend.toFixed(0)}%</span> : '—'}
                    </TableCell>
                    {sucursales.flatMap(s => {
                      const c = f.sucursales?.[s.codigo];
                      const sug = sugeridoValor(f, s.codigo);
                      const ov = hasOverride(f, s.codigo);
                      const savKey = c ? ovKey(f.producto_id, c.sucursal_id) : '';
                      const saving = savingOv.has(savKey);
                      const transito = c?.transito ?? 0;
                      const estBadge = c?.estatus ? <span className={`ml-0.5 text-[8px] px-0.5 rounded ${ESTATUS_COLORS[c.estatus] || 'bg-gray-100'}`}>{c.estatus}</span> : null;
                      const existCell = (
                        <span className="inline-flex items-center gap-0.5">
                          {c?.existencia ?? 0}
                          {transito > 0 && (
                            <Tooltip><TooltipTrigger asChild><Truck className="h-3 w-3 text-blue-600" /></TooltipTrigger>
                              <TooltipContent>Tránsito abierto: {transito} pzas hacia {s.codigo}</TooltipContent></Tooltip>
                          )}
                          {estBadge}
                        </span>
                      );
                      return [
                        <TableCell key={f.producto_id + s.id + '-e'} className="text-right text-xs border-l">{existCell}</TableCell>,
                        <TableCell key={f.producto_id + s.id + '-u'} className="text-right text-xs">{Number(c?.ult30 ?? 0).toFixed(0)}</TableCell>,
                        <TableCell key={f.producto_id + s.id + '-n'} className="text-right text-xs">{Number(c?.necesidad ?? 0).toFixed(0)}</TableCell>,
                        <TableCell key={f.producto_id + s.id + '-d'} className={`text-right text-xs ${(c?.dif ?? 0) > 0 ? 'text-red-600 font-medium' : ''}`}>{Number(c?.dif ?? 0).toFixed(0)}</TableCell>,
                        <TableCell key={f.producto_id + s.id + '-s'} className={`text-right text-xs p-1 ${ov ? 'bg-amber-100' : 'bg-primary/5'}`}>
                          <div className="flex items-center gap-0.5">
                            <Input
                              type="number" min={0} value={sug}
                              onChange={e => setEdit(f.producto_id, s.codigo, Math.max(0, parseInt(e.target.value) || 0))}
                              onBlur={() => { const cur = sugeridoValor(f, s.codigo); const sys = sugeridoCalc(f, s.codigo); if (cur !== sys) { guardarOverride(f, s.codigo); } }}
                              className="h-7 w-14 text-right text-xs px-1"
                            />
                            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> :
                              ov ? <Tooltip><TooltipTrigger asChild>
                                <button onClick={() => restaurarOverride(f, s.codigo)} className="text-muted-foreground hover:text-foreground"><RotateCcw className="h-3 w-3" /></button>
                              </TooltipTrigger><TooltipContent>Restaurar propuesta del sistema (era {sugeridoCalc(f, s.codigo)})</TooltipContent></Tooltip>
                              : <Save className="h-3 w-3 opacity-0" />}
                          </div>
                        </TableCell>,
                      ];
                    })}
                    <TableCell className="text-right text-xs border-l">{f.ultimo_precio_compra ? '$' + Number(f.ultimo_precio_compra).toFixed(2) : '—'}</TableCell>
                    <TableCell className="text-right text-xs font-semibold">{f.mejor_precio ? '$' + Number(f.mejor_precio).toFixed(2) : '—'}</TableCell>
                    <TableCell className={`text-right text-xs ${varPct != null && varPct > 15 ? 'bg-red-100 text-red-700 font-semibold' : varPct != null && varPct > 5 ? 'bg-amber-100 text-amber-700' : varPct != null && varPct < 0 ? 'text-green-600' : ''}`}>
                      {varPct != null ? (<span className="inline-flex items-center gap-0.5">{varPct > 0 ? <TrendingUp className="h-3 w-3" /> : varPct < 0 ? <TrendingDown className="h-3 w-3" /> : null}{varPct.toFixed(1)}%{f.variacion_precio_abs ? <span className="ml-1 text-[10px] opacity-70">({f.variacion_precio_abs > 0 ? '+' : ''}${Number(f.variacion_precio_abs).toFixed(2)})</span> : null}</span>) : '—'}
                    </TableCell>
                    <TableCell className="text-xs">
                      {f.ganador ? <>
                        <div className="font-medium leading-tight">{f.ganador.proveedor_nombre}</div>
                        <div className="text-muted-foreground leading-tight">exist {f.ganador.existencia} · {f.ganador.dias_entrega}d {f.ganador.con_oferta && '· 🏷'}</div>
                      </> : <Badge variant="destructive" className="text-[10px]">Sin proveedor</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground leading-tight">
                      {f.postor_2 ? <>{f.postor_2.proveedor_nombre}<br />${Number(f.postor_2.precio).toFixed(2)} · {f.postor_2.existencia}</> : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground leading-tight">
                      {f.postor_3 ? <>{f.postor_3.proveedor_nombre}<br />${Number(f.postor_3.precio).toFixed(2)} · {f.postor_3.existencia}</> : '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs">{f.piezas_corrugado || '—'}</TableCell>
                    <TableCell><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => verDetalle(f)} title="Ver detalle"><Layers className="h-3 w-3" /></Button></TableCell>
                    <TableCell><Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => ocultar(f.producto_id)} title="Ocultar"><EyeOff className="h-3 w-3" /></Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </table>
        </Card>
      </TooltipProvider>

      {/* Diálogo Detalle: Proveedores + Histórico + OC abiertas */}
      <Dialog open={!!detalle} onOpenChange={o => !o && setDetalle(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
          <DialogHeader><DialogTitle>{detalle?.sku} · {detalle?.nombre}</DialogTitle></DialogHeader>
          {detalle && (
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="border rounded p-2"><div className="text-muted-foreground">Existencia total</div><div className="text-lg font-semibold">{detalle.exist_total}</div></div>
                <div className="border rounded p-2"><div className="text-muted-foreground">DDI</div><div className="text-lg font-semibold">{detalle.ddi ?? '—'}</div></div>
                <div className="border rounded p-2"><div className="text-muted-foreground">Últ30 total</div><div className="text-lg font-semibold">{Number(detalle.ult30_total).toFixed(0)}</div></div>
                <div className="border rounded p-2"><div className="text-muted-foreground">Tendencia vs 30d anteriores</div><div className={`text-lg font-semibold ${(detalle.tendencia_pct || 0) > 0 ? 'text-green-600' : (detalle.tendencia_pct || 0) < 0 ? 'text-red-600' : ''}`}>{detalle.tendencia_pct != null ? `${detalle.tendencia_pct.toFixed(1)}%` : '—'}</div></div>
              </div>

              <div>
                <h3 className="text-sm font-semibold mb-1">Todos los proveedores</h3>
                <div className="max-h-64 overflow-auto border rounded">
                  <Table>
                    <TableHeader><TableRow><TableHead>Proveedor</TableHead><TableHead className="text-right">Existencia</TableHead><TableHead className="text-right">Precio c/IVA</TableHead><TableHead className="text-right">Días entrega</TableHead><TableHead>Marca</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {(detalle.todos_proveedores || []).map((p, i) => (
                        <TableRow key={i} className={p.existencia === 0 ? 'opacity-50' : ''}>
                          <TableCell className="text-xs">{p.proveedor_nombre}</TableCell>
                          <TableCell className="text-right text-xs">{p.existencia}</TableCell>
                          <TableCell className="text-right text-xs">${Number(p.precio).toFixed(2)}</TableCell>
                          <TableCell className="text-right text-xs">{p.dias_entrega}d</TableCell>
                          <TableCell className="text-xs">
                            {p.con_oferta && <Badge className="bg-orange-500 text-white text-[9px]">Oferta</Badge>}
                            {p.sin_lista_regular && <Badge variant="outline" className="text-[9px] ml-1">Sin lista</Badge>}
                            {p.existencia === 0 && <Badge variant="secondary" className="text-[9px] ml-1">Sin stock</Badge>}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {ocAbiertas.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-1 text-orange-700">⚠ Órdenes abiertas — evita duplicar</h3>
                  <div className="max-h-40 overflow-auto border rounded">
                    <Table>
                      <TableHeader><TableRow><TableHead>Folio</TableHead><TableHead>Sucursal</TableHead><TableHead>Proveedor</TableHead><TableHead className="text-right">Piezas</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                      <TableBody>
                        {ocAbiertas.map((o, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{o.folio}</TableCell>
                            <TableCell className="text-xs">{o.sucursal_codigo || '—'}</TableCell>
                            <TableCell className="text-xs">{o.proveedor_nombre}</TableCell>
                            <TableCell className="text-right text-xs">{o.piezas_pendientes} / {o.piezas_solicitadas}</TableCell>
                            <TableCell className="text-xs"><Badge variant="outline">{o.estado}</Badge></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold mb-1">Histórico mensual por sucursal</h3>
                <div className="max-h-64 overflow-auto border rounded">
                  <Table>
                    <TableHeader><TableRow><TableHead>Mes</TableHead><TableHead>Sucursal</TableHead><TableHead className="text-right">Unidades</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {histData.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground text-xs">Sin datos históricos</TableCell></TableRow>}
                      {histData.map((h, i) => {
                        const suc = snap?.sucursales?.find(s => s.id === h.sucursal_id);
                        return <TableRow key={i}><TableCell className="text-xs">{h.mes}</TableCell><TableCell className="text-xs">{suc?.codigo || '—'}</TableCell><TableCell className="text-right text-xs">{Number(h.unidades).toFixed(0)}</TableCell></TableRow>;
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo Generar OC */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader><DialogTitle>Generar órdenes de compra — {folioRun}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {Object.entries(grupoPorProv).length === 0 && <p className="text-sm text-muted-foreground">No hay líneas con sugerido &gt; 0 en la selección.</p>}
            {Object.entries(grupoPorProv).map(([pid, g]) => (
              <Card key={pid} className="p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-semibold">{g.proveedor_nombre}</div>
                    <div className="text-xs text-muted-foreground">
                      {g.entrega_por_sucursal ? `Genera ${new Set(g.lineas.map((l: any) => l.sucursal_id)).size} OC (por sucursal)` : '1 OC consolidada'}
                      {' · '}{g.lineas.length} línea(s) · Total ≈ ${g.total.toFixed(2)}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => generarOC(pid)} disabled={generando}>
                    {generando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Fincar'}
                  </Button>
                </div>
                <div className="text-xs max-h-40 overflow-auto">
                  {g.lineas.map((l: any, i: number) => (
                    <div key={i} className="flex justify-between border-t py-1">
                      <span>{l.codigo_barras && <span className="font-mono text-[10px] mr-1">{l.codigo_barras}</span>}{l.sku} · <span className="text-muted-foreground">{l.nombre}</span></span>
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
