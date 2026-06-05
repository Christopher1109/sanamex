import { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Download, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

const mxn = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);
const num = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('es-MX').format(Math.round(n || 0));
const pct = (n: number | null | undefined, dec = 1) => (n == null ? '—' : `${(n).toFixed(dec)}%`);
const ddiColor = (v: number | null) => v == null ? 'text-muted-foreground' : v < 14 ? 'text-red-600 font-semibold' : v <= 30 ? 'text-yellow-600 font-semibold' : 'text-green-600';
const mgColor = (v: number | null) => v == null ? 'text-muted-foreground' : v < 10 ? 'text-red-600' : v <= 25 ? 'text-yellow-600' : 'text-green-600';

type SanamexRow = any;
type SucursalRow = { id: string; codigo: string; nombre: string };
type ResumenRow = { sucursal_id: string; sucursal_codigo: string; sucursal_nombre: string; existencias_pzs: number; existencias_pesos: number; items: number; ddi_30: number | null; ddi_60: number | null; ddi_90: number | null };
type AbcRow = { clasificacion: string; sucursal_id: string; sucursal_codigo: string; piezas: number; pesos: number; items: number };
type StatusRow = { status: string; sucursal_id: string; sucursal_codigo: string; cantidad: number; items: number };
type MargenRow = { producto_id: string; clave: string; departamento: string | null; descripcion: string; clasificacion: string | null; status: string | null; cp: number; existencias: number; costo_total: number; lp1: number | null; util_lp1: number | null; margen_lp1: number | null; lp2: number | null; util_lp2: number | null; margen_lp2: number | null; lp3: number | null; util_lp3: number | null; margen_lp3: number | null; lp4: number | null; util_lp4: number | null; margen_lp4: number | null };

const PERIODS = [
  { key: 'dia', label: 'Día' },
  { key: 'sem', label: 'Semanal' },
  { key: 'sem_ant', label: 'Sem. Ant.' },
  { key: 'mes', label: 'Mes Actual' },
  { key: '30', label: '30 Días Antes' },
  { key: '60', label: '60 Días Antes' },
  { key: '90', label: '90 Días Antes' },
  { key: '2sem_ant', label: '2 Sem. Ant.' },
] as const;

const STATUS_CODES = [
  ['A', 'ACTIVO'], ['I', 'INACTIVO'], ['C', 'CANCELADO'], ['S', 'SUSTITUTO'],
  ['N', 'NUEVO'], ['E', 'COMPRA ESPECIAL'], ['K', 'CORTA CADUCIDAD'], ['G', 'AGOTADO'],
] as const;
const ABC_CODES = ['A', 'B', 'C', 'D', 'O'] as const;

export default function ReporteInventarioGeneral() {
  const [fechaCorte, setFechaCorte] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [sucursales, setSucursales] = useState<SucursalRow[]>([]);
  const [bd, setBd] = useState<SanamexRow[]>([]);
  const [margenes, setMargenes] = useState<MargenRow[]>([]);
  const [resumen, setResumen] = useState<ResumenRow[]>([]);
  const [abc, setAbc] = useState<AbcRow[]>([]);
  const [statusMat, setStatusMat] = useState<StatusRow[]>([]);
  const [search, setSearch] = useState('');
  const [filterDepto, setFilterDepto] = useState('all');
  const [filterLab, setFilterLab] = useState('all');
  const [filterClasif, setFilterClasif] = useState('A');
  const [filterStatus, setFilterStatus] = useState('A');
  const [productosFiltro, setProductosFiltro] = useState<string[]>(['', '', '', '', '']);
  const [tab, setTab] = useState('resumen');
  const fileInput = useRef<HTMLInputElement>(null);

  const [bdLoaded, setBdLoaded] = useState(false);
  const [margenesLoaded, setMargenesLoaded] = useState(false);

  // Carga ligera (rápida): resumen, ABC, status, sucursales
  const loadLight = async () => {
    setLoading(true);
    try {
      const [s3, s4, s5, s6] = await Promise.all([
        (supabase as any).rpc('inventario_resumen_por_sucursal', { p_fecha: fechaCorte }),
        (supabase as any).rpc('inventario_abc_por_sucursal', { p_fecha: fechaCorte }),
        (supabase as any).rpc('inventario_status_por_sucursal', { p_fecha: fechaCorte }),
        supabase.from('sucursales').select('id,codigo,nombre').eq('activo', true).order('codigo'),
      ]);
      setResumen((s3.data as ResumenRow[]) || []);
      setAbc((s4.data as AbcRow[]) || []);
      setStatusMat((s5.data as StatusRow[]) || []);
      setSucursales((s6.data as SucursalRow[]) || []);
    } catch (e: any) {
      toast.error('Error al cargar: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Carga pesada bajo demanda
  const loadBd = async () => {
    if (bdLoaded) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('reporte_ventas_inventario_sanamex', { p_sucursal_id: null, p_fecha_corte: fechaCorte });
      if (error) throw error;
      setBd((data as SanamexRow[]) || []);
      setBdLoaded(true);
    } catch (e: any) { toast.error('Error BD: ' + e.message); }
    finally { setLoading(false); }
  };
  const loadMargenes = async () => {
    if (margenesLoaded) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc('reporte_margenes', { p_fecha: fechaCorte });
      if (error) throw error;
      setMargenes((data as MargenRow[]) || []);
      setMargenesLoaded(true);
    } catch (e: any) { toast.error('Error margenes: ' + e.message); }
    finally { setLoading(false); }
  };

  const load = async () => {
    // Refresco completo invalida caches
    setBdLoaded(false); setMargenesLoaded(false);
    setBd([]); setMargenes([]);
    await loadLight();
    // Recargar lo que ya estaba activo
    if (['bd', 'vig', 'fclasif', 'fstatus', 'fpers'].includes(tab)) await loadBd();
    if (tab === 'margenes') await loadMargenes();
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [fechaCorte]);

  // Carga datos pesados solo cuando la pestaña los necesita
  useEffect(() => {
    if (['bd', 'vig', 'fclasif', 'fstatus', 'fpers'].includes(tab)) loadBd();
    if (tab === 'margenes') loadMargenes();
    /* eslint-disable-next-line */
  }, [tab]);

  const totalPzs = resumen.reduce((a, r) => a + (r.existencias_pzs || 0), 0);
  const totalPesos = resumen.reduce((a, r) => a + (r.existencias_pesos || 0), 0);

  const depts = useMemo(() => Array.from(new Set(bd.map((r: any) => r.departamento).filter(Boolean))) as string[], [bd]);
  const labs = useMemo(() => Array.from(new Set(bd.map((r: any) => r.lab).filter(Boolean))) as string[], [bd]);

  const bdFiltered = useMemo(() => bd.filter((r: any) => {
    if (search && !`${r.clave} ${r.descripcion}`.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterDepto !== 'all' && r.departamento !== filterDepto) return false;
    if (filterLab !== 'all' && r.lab !== filterLab) return false;
    return true;
  }), [bd, search, filterDepto, filterLab]);

  const byClasif = bdFiltered.filter((r: any) => (r.clasif || 'D') === filterClasif);
  const byStatus = bdFiltered.filter((r: any) => (r.status || 'A') === filterStatus);

  const filtroRows = useMemo(() => productosFiltro
    .map(c => c && bd.find((r: any) => r.clave === c || (r.descripcion || '').toLowerCase().includes(c.toLowerCase())))
    .filter(Boolean) as SanamexRow[], [productosFiltro, bd]);

  // Aggregate ABC/Status matrices into pivot form
  const abcPivot = useMemo(() => {
    const m = new Map<string, Map<string, AbcRow>>();
    ABC_CODES.forEach(c => m.set(c, new Map()));
    abc.forEach(r => {
      if (!m.has(r.clasificacion)) m.set(r.clasificacion, new Map());
      m.get(r.clasificacion)!.set(r.sucursal_codigo, r);
    });
    return m;
  }, [abc]);
  const statusPivot = useMemo(() => {
    const m = new Map<string, Map<string, StatusRow>>();
    STATUS_CODES.forEach(([c]) => m.set(c, new Map()));
    statusMat.forEach(r => {
      if (!m.has(r.status)) m.set(r.status, new Map());
      m.get(r.status)!.set(r.sucursal_codigo, r);
    });
    return m;
  }, [statusMat]);

  const handleUploadPrecios = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(sheet);
      if (!rows.length) return toast.error('Archivo vacío');
      // Expect columns: clave, lista, precio
      const productos = await supabase.from('productos').select('id,sku,codigo_barras');
      const map = new Map<string, string>();
      (productos.data || []).forEach((p: any) => {
        if (p.sku) map.set(String(p.sku), p.id);
        if (p.codigo_barras) map.set(String(p.codigo_barras), p.id);
      });
      const inserts: any[] = [];
      const today = new Date().toISOString().slice(0, 10);
      let skipped = 0;
      for (const r of rows) {
        const clave = String(r.clave || r.Clave || r.SKU || '').trim();
        const lista = Number(r.lista || r.Lista || r.LP);
        const precio = Number(r.precio || r.Precio || r.PU);
        const pid = map.get(clave);
        if (!pid || !lista || !precio || lista < 1 || lista > 4) { skipped++; continue; }
        inserts.push({ producto_id: pid, lista, precio, vigente_desde: today });
      }
      if (!inserts.length) return toast.error('Sin filas válidas');
      const { error } = await supabase.from('productos_precios_lista').upsert(inserts as any, { onConflict: 'producto_id,lista,vigente_desde' });
      if (error) throw error;
      toast.success(`Cargadas ${inserts.length} listas (${skipped} omitidas)`);
      load();
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    }
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    // BD
    const bdHeader = ['Clave', 'Departamento', 'Descripcion', 'Clasificacion', 'CP Inventario', 'Costo Total', 'Existencias', 'DDI 30', 'DDI 60', 'DDI 90',
      ...PERIODS.flatMap(p => [`U V ${p.label}`, 'CU', 'PU', 'Venta', 'Utilidad', 'Margen'])];
    const bdBody = bd.map((r: any) => [r.clave, r.departamento, r.descripcion, r.clasif, r.cpi, r.costo_total, r.te, r.ddi_30, r.ddi_60, r.ddi_90,
      ...PERIODS.flatMap(p => [r[`un_v_${p.key}`], r[`cu_compra_${p.key}`], r[`pu_venta_${p.key}`], r[`venta_${p.key}`], r[`utilidad_${p.key}`], r[`margen_${p.key}`]])]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([bdHeader, ...bdBody]), 'BD');

    // Tabla General (resumen)
    const tgHeader = ['Sucursal', 'Existencias (Pzs)', '% Piezas', 'Existencias ($)', '% Pesos', 'ITEMS', 'DDI 30', 'DDI 60', 'DDI 90'];
    const tgBody = resumen.map(r => [r.sucursal_nombre, r.existencias_pzs, totalPzs ? r.existencias_pzs / totalPzs : 0, r.existencias_pesos, totalPesos ? r.existencias_pesos / totalPesos : 0, r.items, r.ddi_30, r.ddi_60, r.ddi_90]);
    tgBody.push(['General', totalPzs, 1, totalPesos, 1, resumen.reduce((a, r) => a + r.items, 0), null, null, null]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([tgHeader, ...tgBody]), 'Tabla General');

    // Desglose Días de Inventario (placeholder = mismo BD reducido)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Clave', 'Descripcion', 'Existencias', 'DDI 30', 'DDI 60', 'DDI 90'],
      ...bd.map((r: any) => [r.clave, r.descripcion, r.te, r.ddi_30, r.ddi_60, r.ddi_90])
    ]), 'Desglose Dias de Inventario ');

    // Ventas e Inventario General (mismo formato SANAMEX consolidado)
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([bdHeader, ...bdBody]), 'Ventas e Inventario General');

    // Margenes
    const mgHeader = ['Clave', 'Departamento', 'Descripcion', 'Clasificacion', 'Status', 'CP', 'Costo Total', 'Existencias',
      'LP 1', 'Utilidad LP1', 'Margen LP1', 'LP 2', 'Utilidad LP2', 'Margen LP2', 'LP 3', 'Utilidad LP3', 'Margen LP3', 'LP 4', 'Utilidad LP4', 'Margen LP4'];
    const mgBody = margenes.map(r => [r.clave, r.departamento, r.descripcion, r.clasificacion, r.status, r.cp, r.costo_total, r.existencias,
      r.lp1, r.util_lp1, r.margen_lp1, r.lp2, r.util_lp2, r.margen_lp2, r.lp3, r.util_lp3, r.margen_lp3, r.lp4, r.util_lp4, r.margen_lp4]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([mgHeader, ...mgBody]), 'Margenes');

    // Filtro Clasificacion
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([bdHeader, ...byClasif.map((r: any) => bdBody[bd.indexOf(r)] || [])]), 'Filtro Clasificacion');

    // Validacion
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Clasificacion', 'Status'],
      ...Math.max(ABC_CODES.length, STATUS_CODES.length) > 0
        ? Array.from({ length: Math.max(ABC_CODES.length, STATUS_CODES.length) }, (_, i) => [ABC_CODES[i] || '', STATUS_CODES[i] ? `${STATUS_CODES[i][0]} — ${STATUS_CODES[i][1]}` : ''])
        : []
    ]), 'Validacion');

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([bdHeader, ...byStatus.map((r: any) => bdBody[bd.indexOf(r)] || [])]), 'Filtro Status');

    XLSX.writeFile(wb, `Reporte Inventario General ${fechaCorte.replace(/-/g, '')}.xlsx`);
  };

  // ---- Render helpers ----
  const renderBdTable = (rows: SanamexRow[]) => (
    <div className="overflow-auto border rounded-md max-h-[70vh]">
      <table className="text-xs w-full">
        <thead className="sticky top-0 bg-muted z-10">
          <tr>
            <th className="sticky left-0 bg-muted px-2 py-1 text-left z-20">Clave</th>
            <th className="sticky left-[90px] bg-muted px-2 py-1 text-left z-20 min-w-[260px]">Descripción</th>
            <th className="px-2 py-1">Depto</th>
            <th className="px-2 py-1">Clasif.</th>
            <th className="px-2 py-1 text-right">CP Inv.</th>
            <th className="px-2 py-1 text-right">Costo Total</th>
            <th className="px-2 py-1 text-right">Exist.</th>
            <th className="px-2 py-1 text-right">DDI 30</th>
            <th className="px-2 py-1 text-right">DDI 60</th>
            <th className="px-2 py-1 text-right">DDI 90</th>
            {PERIODS.map(p => (
              <th key={p.key} colSpan={6} className="px-2 py-1 text-center border-l">{p.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 500).map((r: any) => (
            <tr key={r.clave} className="border-b hover:bg-muted/30">
              <td className="sticky left-0 bg-background px-2 py-1 font-mono z-10">{r.clave}</td>
              <td className="sticky left-[90px] bg-background px-2 py-1 z-10">{r.descripcion}</td>
              <td className="px-2 py-1">{r.departamento || '—'}</td>
              <td className="px-2 py-1 text-center">{r.clasif || '—'}</td>
              <td className="px-2 py-1 text-right">{mxn(r.cpi)}</td>
              <td className="px-2 py-1 text-right">{mxn(r.costo_total)}</td>
              <td className="px-2 py-1 text-right">{num(r.te)}</td>
              <td className={`px-2 py-1 text-right ${ddiColor(r.ddi_30)}`}>{r.ddi_30 != null ? r.ddi_30.toFixed(0) : '—'}</td>
              <td className={`px-2 py-1 text-right ${ddiColor(r.ddi_60)}`}>{r.ddi_60 != null ? r.ddi_60.toFixed(0) : '—'}</td>
              <td className={`px-2 py-1 text-right ${ddiColor(r.ddi_90)}`}>{r.ddi_90 != null ? r.ddi_90.toFixed(0) : '—'}</td>
              {PERIODS.map(p => (
                <>
                  <td key={`u${p.key}`} className="px-2 py-1 text-right border-l">{num(r[`un_v_${p.key}`])}</td>
                  <td className="px-2 py-1 text-right">{mxn(r[`cu_compra_${p.key}`])}</td>
                  <td className="px-2 py-1 text-right">{mxn(r[`pu_venta_${p.key}`])}</td>
                  <td className="px-2 py-1 text-right">{mxn(r[`venta_${p.key}`])}</td>
                  <td className="px-2 py-1 text-right">{mxn(r[`utilidad_${p.key}`])}</td>
                  <td className="px-2 py-1 text-right">{pct(r[`margen_${p.key}`] * 100)}</td>
                </>
              ))}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={16} className="text-center py-8 text-muted-foreground">Sin datos</td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot className="bg-muted font-semibold sticky bottom-0">
            <tr>
              <td colSpan={6} className="px-2 py-1">TOTAL ({rows.length} SKUs)</td>
              <td className="px-2 py-1 text-right">{num(rows.reduce((a: number, r: any) => a + (r.te || 0), 0))}</td>
              <td colSpan={3}></td>
              {PERIODS.map(p => (
                <>
                  <td key={`tu${p.key}`} className="px-2 py-1 text-right border-l">{num(rows.reduce((a: number, r: any) => a + (r[`un_v_${p.key}`] || 0), 0))}</td>
                  <td colSpan={2}></td>
                  <td className="px-2 py-1 text-right">{mxn(rows.reduce((a: number, r: any) => a + (r[`venta_${p.key}`] || 0), 0))}</td>
                  <td colSpan={2}></td>
                </>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Reporte Inventario General</h1>
          <p className="text-sm text-muted-foreground">Vista ejecutiva consolidada por sucursal — ABC, Status y márgenes LP1-LP4</p>
        </div>
        <div className="flex gap-2">
          <input ref={fileInput} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => e.target.files?.[0] && handleUploadPrecios(e.target.files[0])} />
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}><Upload className="h-4 w-4 mr-1" />Cargar Listas LP1-LP4</Button>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-1" />Refrescar</Button>
          <Button size="sm" onClick={exportExcel}><Download className="h-4 w-4 mr-1" />Exportar Excel</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label className="text-xs">Fecha corte</Label><Input type="date" value={fechaCorte} onChange={e => setFechaCorte(e.target.value)} /></div>
          <div><Label className="text-xs">Buscar clave / descripción</Label><Input value={search} onChange={e => setSearch(e.target.value)} placeholder="..." /></div>
          <div><Label className="text-xs">Departamento</Label>
            <Select value={filterDepto} onValueChange={setFilterDepto}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{depts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Laboratorio</Label>
            <Select value={filterLab} onValueChange={setFilterLab}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>{labs.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="resumen" className="text-xs">Resumen General</TabsTrigger>
          <TabsTrigger value="bd" className="text-xs">BD</TabsTrigger>
          <TabsTrigger value="vig" className="text-xs">Ventas e Inv. General</TabsTrigger>
          <TabsTrigger value="margenes" className="text-xs">Margenes</TabsTrigger>
          <TabsTrigger value="fclasif" className="text-xs">Filtro Clasificación</TabsTrigger>
          <TabsTrigger value="fstatus" className="text-xs">Filtro Status</TabsTrigger>
          <TabsTrigger value="fpers" className="text-xs">Filtro Personalizado</TabsTrigger>
          <TabsTrigger value="valid" className="text-xs">Validación</TabsTrigger>
        </TabsList>

        {/* RESUMEN */}
        <TabsContent value="resumen" className="mt-4 space-y-4">
          {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : <>
            <Card><CardHeader><CardTitle className="text-base">A. Desglose de Inventario por Sucursal</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-auto border rounded-md">
                  <table className="text-sm w-full">
                    <thead className="bg-muted"><tr>
                      <th className="px-3 py-2 text-left">Sucursal</th>
                      <th className="px-3 py-2 text-right">Existencias (Pzs)</th>
                      <th className="px-3 py-2 text-right">% Piezas</th>
                      <th className="px-3 py-2 text-right">Existencias ($)</th>
                      <th className="px-3 py-2 text-right">% Pesos</th>
                      <th className="px-3 py-2 text-right">ITEMS</th>
                      <th className="px-3 py-2 text-right">DDI 30</th>
                      <th className="px-3 py-2 text-right">DDI 60</th>
                      <th className="px-3 py-2 text-right">DDI 90</th>
                    </tr></thead>
                    <tbody>
                      {resumen.map(r => (
                        <tr key={r.sucursal_id} className="border-b hover:bg-muted/30">
                          <td className="px-3 py-2 font-medium">{r.sucursal_nombre} <span className="text-xs text-muted-foreground">({r.sucursal_codigo})</span></td>
                          <td className="px-3 py-2 text-right">{num(r.existencias_pzs)}</td>
                          <td className="px-3 py-2 text-right">{totalPzs ? pct((r.existencias_pzs / totalPzs) * 100) : '—'}</td>
                          <td className="px-3 py-2 text-right">{mxn(r.existencias_pesos)}</td>
                          <td className="px-3 py-2 text-right">{totalPesos ? pct((r.existencias_pesos / totalPesos) * 100) : '—'}</td>
                          <td className="px-3 py-2 text-right">{num(r.items)}</td>
                          <td className={`px-3 py-2 text-right ${ddiColor(r.ddi_30)}`}>{r.ddi_30 != null ? r.ddi_30.toFixed(0) : '—'}</td>
                          <td className={`px-3 py-2 text-right ${ddiColor(r.ddi_60)}`}>{r.ddi_60 != null ? r.ddi_60.toFixed(0) : '—'}</td>
                          <td className={`px-3 py-2 text-right ${ddiColor(r.ddi_90)}`}>{r.ddi_90 != null ? r.ddi_90.toFixed(0) : '—'}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted font-semibold">
                        <td className="px-3 py-2">General</td>
                        <td className="px-3 py-2 text-right">{num(totalPzs)}</td>
                        <td className="px-3 py-2 text-right">100%</td>
                        <td className="px-3 py-2 text-right">{mxn(totalPesos)}</td>
                        <td className="px-3 py-2 text-right">100%</td>
                        <td className="px-3 py-2 text-right">{num(resumen.reduce((a, r) => a + r.items, 0))}</td>
                        <td colSpan={3}></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="text-base">B. Clasificación ABC por Sucursal</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-auto border rounded-md">
                  <table className="text-xs w-full">
                    <thead className="bg-muted"><tr>
                      <th className="px-2 py-1 text-left">Clasif.</th>
                      {sucursales.map(s => <th key={s.id} className="px-2 py-1 text-center border-l" colSpan={4}>{s.codigo}</th>)}
                    </tr>
                    <tr className="border-b text-[10px] text-muted-foreground">
                      <th></th>
                      {sucursales.flatMap(s => [
                        <th key={`${s.id}-p`} className="px-2 py-1 text-right border-l">% $</th>,
                        <th key={`${s.id}-pz`} className="px-2 py-1 text-right">Pzs</th>,
                        <th key={`${s.id}-$`} className="px-2 py-1 text-right">Pesos</th>,
                        <th key={`${s.id}-it`} className="px-2 py-1 text-right">ITEMS</th>,
                      ])}
                    </tr></thead>
                    <tbody>
                      {ABC_CODES.map(c => {
                        const row = abcPivot.get(c) || new Map();
                        return (
                          <tr key={c} className="border-b">
                            <td className="px-2 py-1 font-medium">{c}</td>
                            {sucursales.flatMap(s => {
                              const r = row.get(s.codigo);
                              const sucTotal = abc.filter(x => x.sucursal_codigo === s.codigo).reduce((a, x) => a + (x.pesos || 0), 0);
                              const p = r && sucTotal ? (r.pesos / sucTotal) * 100 : 0;
                              return [
                                <td key={`${s.id}-${c}-p`} className="px-2 py-1 text-right border-l">{pct(p)}</td>,
                                <td key={`${s.id}-${c}-pz`} className="px-2 py-1 text-right">{num(r?.piezas || 0)}</td>,
                                <td key={`${s.id}-${c}-$`} className="px-2 py-1 text-right">{mxn(r?.pesos || 0)}</td>,
                                <td key={`${s.id}-${c}-it`} className="px-2 py-1 text-right">{num(r?.items || 0)}</td>,
                              ];
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card><CardHeader><CardTitle className="text-base">C. Distribución por Status</CardTitle></CardHeader>
              <CardContent>
                <div className="overflow-auto border rounded-md">
                  <table className="text-xs w-full">
                    <thead className="bg-muted"><tr>
                      <th className="px-2 py-1 text-left">Status</th>
                      {sucursales.map(s => <th key={s.id} colSpan={2} className="px-2 py-1 text-center border-l">{s.codigo}</th>)}
                    </tr>
                    <tr className="border-b text-[10px] text-muted-foreground">
                      <th></th>
                      {sucursales.flatMap(s => [
                        <th key={`${s.id}-c`} className="px-2 py-1 text-right border-l">Cant.</th>,
                        <th key={`${s.id}-i`} className="px-2 py-1 text-right">ITEM</th>,
                      ])}
                    </tr></thead>
                    <tbody>
                      {STATUS_CODES.map(([c, nm]) => {
                        const row = statusPivot.get(c) || new Map();
                        return (
                          <tr key={c} className="border-b">
                            <td className="px-2 py-1"><span className="font-medium">{c}</span> <span className="text-muted-foreground">{nm}</span></td>
                            {sucursales.flatMap(s => {
                              const r = row.get(s.codigo);
                              return [
                                <td key={`${s.id}-${c}-c`} className="px-2 py-1 text-right border-l">{num(r?.cantidad || 0)}</td>,
                                <td key={`${s.id}-${c}-i`} className="px-2 py-1 text-right">{num(r?.items || 0)}</td>,
                              ];
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>}
        </TabsContent>

        {/* BD */}
        <TabsContent value="bd" className="mt-4">
          <Card><CardContent className="pt-4">{loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : renderBdTable(bdFiltered)}</CardContent></Card>
          {bdFiltered.length > 500 && <p className="text-xs text-muted-foreground mt-2">Mostrando primeros 500 de {bdFiltered.length}. Use filtros o exporte Excel para ver todos.</p>}
        </TabsContent>

        <TabsContent value="vig" className="mt-4">
          <Card><CardContent className="pt-4">{loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : renderBdTable(bdFiltered)}</CardContent></Card>
        </TabsContent>

        {/* MARGENES */}
        <TabsContent value="margenes" className="mt-4">
          <Card><CardContent className="pt-4">
            {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : (
              <div className="overflow-auto border rounded-md max-h-[70vh]">
                <table className="text-xs w-full">
                  <thead className="sticky top-0 bg-muted z-10"><tr>
                    <th className="sticky left-0 bg-muted px-2 py-1 text-left z-20">Clave</th>
                    <th className="sticky left-[90px] bg-muted px-2 py-1 text-left z-20 min-w-[240px]">Descripción</th>
                    <th className="px-2 py-1">Depto</th>
                    <th className="px-2 py-1">Clasif.</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1 text-right">CP</th>
                    <th className="px-2 py-1 text-right">Costo Total</th>
                    <th className="px-2 py-1 text-right">Exist.</th>
                    {[1, 2, 3, 4].map(i => (
                      <>
                        <th key={`lp${i}h`} className="px-2 py-1 text-right border-l">LP {i}</th>
                        <th key={`u${i}h`} className="px-2 py-1 text-right">Utilidad</th>
                        <th key={`m${i}h`} className="px-2 py-1 text-right">Margen</th>
                      </>
                    ))}
                  </tr></thead>
                  <tbody>
                    {margenes.slice(0, 500).map(r => (
                      <tr key={r.producto_id} className="border-b hover:bg-muted/30">
                        <td className="sticky left-0 bg-background px-2 py-1 font-mono z-10">{r.clave}</td>
                        <td className="sticky left-[90px] bg-background px-2 py-1 z-10">{r.descripcion}</td>
                        <td className="px-2 py-1">{r.departamento || '—'}</td>
                        <td className="px-2 py-1 text-center">{r.clasificacion || '—'}</td>
                        <td className="px-2 py-1 text-center">{r.status || '—'}</td>
                        <td className="px-2 py-1 text-right">{mxn(r.cp)}</td>
                        <td className="px-2 py-1 text-right">{mxn(r.costo_total)}</td>
                        <td className="px-2 py-1 text-right">{num(r.existencias)}</td>
                        {[1, 2, 3, 4].map(i => {
                          const lp = (r as any)[`lp${i}`]; const ut = (r as any)[`util_lp${i}`]; const mg = (r as any)[`margen_lp${i}`];
                          return (
                            <>
                              <td key={`lp${i}`} className="px-2 py-1 text-right border-l">{mxn(lp)}</td>
                              <td key={`u${i}`} className="px-2 py-1 text-right">{mxn(ut)}</td>
                              <td key={`m${i}`} className={`px-2 py-1 text-right ${mgColor(mg)}`}>{pct(mg)}</td>
                            </>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent></Card>
        </TabsContent>

        {/* FILTRO CLASIFICACIÓN */}
        <TabsContent value="fclasif" className="mt-4 space-y-3">
          <Card><CardContent className="pt-4 flex items-center gap-3">
            <Label className="text-xs">Clasificación:</Label>
            <Select value={filterClasif} onValueChange={setFilterClasif}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{ABC_CODES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{byClasif.length} SKUs</span>
          </CardContent></Card>
          <Card><CardContent className="pt-4">{renderBdTable(byClasif)}</CardContent></Card>
        </TabsContent>

        {/* FILTRO STATUS */}
        <TabsContent value="fstatus" className="mt-4 space-y-3">
          <Card><CardContent className="pt-4 flex items-center gap-3">
            <Label className="text-xs">Status:</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_CODES.map(([c, n]) => <SelectItem key={c} value={c}>{c} — {n}</SelectItem>)}</SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">{byStatus.length} SKUs</span>
          </CardContent></Card>
          <Card><CardContent className="pt-4">{renderBdTable(byStatus)}</CardContent></Card>
        </TabsContent>

        {/* FILTRO PERSONALIZADO */}
        <TabsContent value="fpers" className="mt-4 space-y-4">
          <Card><CardHeader><CardTitle className="text-base">Comparativo (hasta 5 productos)</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                {productosFiltro.map((v, i) => (
                  <div key={i}>
                    <Label className="text-xs">Producto {String.fromCharCode(65 + i)}</Label>
                    <Input value={v} onChange={e => { const n = [...productosFiltro]; n[i] = e.target.value; setProductosFiltro(n); }} placeholder="Clave o descripción" />
                  </div>
                ))}
              </div>
              <div className="overflow-auto border rounded-md">
                <table className="text-xs w-full">
                  <thead className="bg-muted"><tr>
                    <th className="px-2 py-1 text-left">Clave</th>
                    <th className="px-2 py-1 text-left">Descripción</th>
                    <th className="px-2 py-1">Clasif.</th>
                    <th className="px-2 py-1">Status</th>
                    <th className="px-2 py-1 text-right">Exist.</th>
                    <th className="px-2 py-1 text-right">Costo Total</th>
                    <th className="px-2 py-1 text-right">V. Sem</th>
                    <th className="px-2 py-1 text-right">V. 30d</th>
                    <th className="px-2 py-1 text-right">V. 60d</th>
                    <th className="px-2 py-1 text-right">V. 90d</th>
                  </tr></thead>
                  <tbody>
                    {filtroRows.map((r: any) => (
                      <tr key={r.clave} className="border-b">
                        <td className="px-2 py-1 font-mono">{r.clave}</td>
                        <td className="px-2 py-1">{r.descripcion}</td>
                        <td className="px-2 py-1 text-center">{r.clasif || '—'}</td>
                        <td className="px-2 py-1 text-center">{r.status || '—'}</td>
                        <td className="px-2 py-1 text-right">{num(r.te)}</td>
                        <td className="px-2 py-1 text-right">{mxn(r.costo_total)}</td>
                        <td className="px-2 py-1 text-right">{mxn(r.venta_sem)}</td>
                        <td className="px-2 py-1 text-right">{mxn(r.venta_30)}</td>
                        <td className="px-2 py-1 text-right">{mxn(r.venta_60)}</td>
                        <td className="px-2 py-1 text-right">{mxn(r.venta_90)}</td>
                      </tr>
                    ))}
                    {!filtroRows.length && <tr><td colSpan={10} className="text-center py-6 text-muted-foreground">Ingrese claves para comparar</td></tr>}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card><CardHeader><CardTitle className="text-base">Resumen por Status (sucursales)</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-auto border rounded-md">
                <table className="text-xs w-full">
                  <thead className="bg-muted"><tr>
                    <th className="px-2 py-1 text-left">Status</th>
                    {sucursales.map(s => <th key={s.id} colSpan={2} className="px-2 py-1 text-center border-l">{s.codigo}</th>)}
                  </tr>
                  <tr className="border-b text-[10px] text-muted-foreground">
                    <th></th>{sucursales.flatMap(s => [
                      <th key={`${s.id}-c`} className="px-2 py-1 text-right border-l">Cant.</th>,
                      <th key={`${s.id}-i`} className="px-2 py-1 text-right">ITEM</th>,
                    ])}
                  </tr></thead>
                  <tbody>
                    {STATUS_CODES.map(([c, nm]) => {
                      const row = statusPivot.get(c) || new Map();
                      return (
                        <tr key={c} className="border-b">
                          <td className="px-2 py-1">{c} <span className="text-muted-foreground">{nm}</span></td>
                          {sucursales.flatMap(s => {
                            const r = row.get(s.codigo);
                            return [
                              <td key={`${s.id}-${c}-c`} className="px-2 py-1 text-right border-l">{num(r?.cantidad || 0)}</td>,
                              <td key={`${s.id}-${c}-i`} className="px-2 py-1 text-right">{num(r?.items || 0)}</td>,
                            ];
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* VALIDACIÓN */}
        <TabsContent value="valid" className="mt-4">
          <Card><CardHeader><CardTitle className="text-base">Catálogos de Validación</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-2">Clasificación ABC</h4>
                <table className="text-sm w-full border">
                  <thead className="bg-muted"><tr><th className="px-2 py-1 text-left">Código</th><th className="px-2 py-1 text-left">Significado</th></tr></thead>
                  <tbody>
                    <tr className="border-b"><td className="px-2 py-1 font-mono">A</td><td className="px-2 py-1">Top 80% ingreso (Pareto)</td></tr>
                    <tr className="border-b"><td className="px-2 py-1 font-mono">B</td><td className="px-2 py-1">Siguiente 15%</td></tr>
                    <tr className="border-b"><td className="px-2 py-1 font-mono">C</td><td className="px-2 py-1">Último 5%</td></tr>
                    <tr className="border-b"><td className="px-2 py-1 font-mono">D</td><td className="px-2 py-1">Sin ventas 90 días</td></tr>
                    <tr className="border-b"><td className="px-2 py-1 font-mono">O</td><td className="px-2 py-1">Reservado / Otro</td></tr>
                  </tbody>
                </table>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Status (8 valores)</h4>
                <table className="text-sm w-full border">
                  <thead className="bg-muted"><tr><th className="px-2 py-1 text-left">Código</th><th className="px-2 py-1 text-left">Nombre</th></tr></thead>
                  <tbody>
                    {STATUS_CODES.map(([c, n]) => (
                      <tr key={c} className="border-b"><td className="px-2 py-1 font-mono">{c}</td><td className="px-2 py-1">{n}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
