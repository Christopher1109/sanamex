import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Download, FileSpreadsheet, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

type Row = {
  clave: string; lab: string | null; categoria: string | null; departamento: string | null;
  descripcion: string; agrupador: string | null; sustancia: string | null;
  iva: number | null; stock_minimo: number;
  clasif: string | null;       // Clasificación libre del cliente (A-W, DESCLASIFICADO, etc.)
  clasif_abc: string | null;   // Clasificación ABC Pareto (A/B/C/D/O) calculada por el sistema
  status: string | null;
  cpi: number; costo_total: number; te: number;
  ddi_7: number | null; ddi_14: number | null; ddi_30: number | null; ddi_60: number | null; ddi_90: number | null;
  un_v_dia: number; cu_compra_dia: number; pu_venta_dia: number; venta_dia: number; utilidad_dia: number; margen_dia: number;
  un_v_sem: number; cu_compra_sem: number; pu_venta_sem: number; venta_sem: number; utilidad_sem: number; margen_sem: number;
  un_v_sem_ant: number; cu_compra_sem_ant: number; pu_venta_sem_ant: number; venta_sem_ant: number; utilidad_sem_ant: number; margen_sem_ant: number;
  un_v_2sem_ant: number; cu_compra_2sem_ant: number; pu_venta_2sem_ant: number; venta_2sem_ant: number; utilidad_2sem_ant: number; margen_2sem_ant: number;
  un_v_mes: number; cu_compra_mes: number; pu_venta_mes: number; venta_mes: number; utilidad_mes: number; margen_mes: number;
  un_v_30: number; cu_compra_30: number; pu_venta_30: number; venta_30: number; utilidad_30: number; margen_30: number;
  un_v_60: number; cu_compra_60: number; pu_venta_60: number; venta_60: number; utilidad_60: number; margen_60: number;
  un_v_90: number; cu_compra_90: number; pu_venta_90: number; venta_90: number; utilidad_90: number; margen_90: number;
};

type FillRateRow = {
  numero_proveedor: string; nombre_proveedor: string; numero_oc: string;
  total_items_solicitados: number; total_items_entregados: number;
  fill_rate_items: number; lead_time_dias: number;
  fecha_emision: string; fecha_recepcion: string;
  varianza_tiempo: number; fill_rate_lead_time: number | null;
};

const mxn = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);
const num = (n: number) => new Intl.NumberFormat('es-MX').format(Math.round(n || 0));
// SQL ya devuelve márgenes en escala 0–100. NO multiplicar aquí.
const pct = (n: number | null | undefined) => (n == null ? '—' : `${(n || 0).toFixed(2)}%`);
const ivaCell = (n: number | null) =>
  n == null
    ? <span className="text-muted-foreground italic">Sin definir</span>
    : <span>{Number(n).toFixed(Number(n) % 1 === 0 ? 0 : 2)}%</span>;

const ddiColor = (v: number | null) => {
  if (v == null) return 'text-muted-foreground';
  if (v < 14) return 'text-red-600 font-semibold';
  if (v <= 30) return 'text-yellow-600 font-semibold';
  return 'text-green-600';
};

const PERIODS = [
  { key: 'dia', label: 'Día' },
  { key: 'sem', label: 'Semanal' },
  { key: 'sem_ant', label: 'Sem. Ant.' },
  { key: '2sem_ant', label: '2 Sem. Ant.' },
  { key: 'mes', label: 'Mes Actual' },
  { key: '30', label: '30 Días Antes' },
  { key: '60', label: '60 Días Antes' },
  { key: '90', label: '90 Días Antes' },
] as const;

function ReportTable({ rows, loading }: { rows: Row[]; loading: boolean }) {
  const [page, setPage] = useState(0);
  const PAGE = 50;
  useEffect(() => setPage(0), [rows]);
  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!rows.length) return <div className="text-center py-12 text-muted-foreground">Sin datos para los filtros aplicados</div>;

  const slice = rows.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.ceil(rows.length / PAGE);

  return (
    <div className="space-y-2">
      <div className="overflow-auto border rounded-md max-h-[70vh]">
        <table className="text-xs w-full">
          <thead className="sticky top-0 bg-muted z-10">
            <tr className="border-b">
              <th className="sticky left-0 z-20 bg-muted px-2 py-1 text-left whitespace-nowrap">Clave</th>
              <th className="sticky left-[110px] z-20 bg-muted px-2 py-1 text-left whitespace-nowrap min-w-[300px]">Descripción</th>
              <th className="px-2 py-1 text-left">Lab</th>
              <th className="px-2 py-1 text-left">Categoría</th>
              <th className="px-2 py-1 text-left">Depto</th>
              <th className="px-2 py-1 text-left">Agrupador</th>
              <th className="px-2 py-1 text-left">Sustancia</th>
              <th className="px-2 py-1 text-right">IVA</th>
              <th className="px-2 py-1 text-right">Stock Mín.</th>
              <th className="px-2 py-1 text-center">Clasif.</th>
              <th className="px-2 py-1 text-center">Status</th>
              <th className="px-2 py-1 text-right">CPI</th>
              <th className="px-2 py-1 text-right">Costo Total</th>
              <th className="px-2 py-1 text-right">TE</th>
              <th className="px-2 py-1 text-right">7 DDI</th>
              <th className="px-2 py-1 text-right">14 DDI</th>
              <th className="px-2 py-1 text-right">30 DDI</th>
              <th className="px-2 py-1 text-right">60 DDI</th>
              <th className="px-2 py-1 text-right">90 DDI</th>
              {PERIODS.map(p => (
                <>
                  <th key={`u-${p.key}`} className="px-2 py-1 text-right border-l">Un V {p.label}</th>
                  <th key={`cu-${p.key}`} className="px-2 py-1 text-right">CU Compra</th>
                  <th key={`pu-${p.key}`} className="px-2 py-1 text-right">PU Venta</th>
                  <th key={`v-${p.key}`} className="px-2 py-1 text-right">Venta</th>
                  <th key={`ut-${p.key}`} className="px-2 py-1 text-right">Utilidad</th>
                  <th key={`m-${p.key}`} className="px-2 py-1 text-right">Margen</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={i} className="border-b hover:bg-muted/30">
                <td className="sticky left-0 bg-background px-2 py-1 font-mono whitespace-nowrap">{r.clave}</td>
                <td className="sticky left-[110px] bg-background px-2 py-1 min-w-[300px]">{r.descripcion}</td>
                <td className="px-2 py-1">{r.lab || '—'}</td>
                <td className="px-2 py-1">{r.categoria || '—'}</td>
                <td className="px-2 py-1">{r.departamento || '—'}</td>
                <td className="px-2 py-1">{r.agrupador || '—'}</td>
                <td className="px-2 py-1 max-w-[200px] truncate" title={r.sustancia || ''}>{r.sustancia || '—'}</td>
                <td className="px-2 py-1 text-right">{ivaCell(r.iva)}</td>
                <td className="px-2 py-1 text-right">{num(r.stock_minimo)}</td>
                <td className="px-2 py-1 text-center">{r.clasif || '—'}</td>
                <td className="px-2 py-1 text-center">{r.status || '—'}</td>
                <td className="px-2 py-1 text-right">{mxn(r.cpi)}</td>
                <td className="px-2 py-1 text-right">{mxn(r.costo_total)}</td>
                <td className="px-2 py-1 text-right">{num(r.te)}</td>
                {(['ddi_7','ddi_14','ddi_30','ddi_60','ddi_90'] as const).map(k => {
                  const v = (r as any)[k] as number | null;
                  const noAplica = (r.te ?? 0) === 0 || r.status === 'O' || r.status === 'I';
                  const sinVenta = !noAplica && (v == null || v === 0);
                  return (
                    <td key={k} className={`px-2 py-1 text-right ${noAplica || sinVenta ? 'text-muted-foreground' : ddiColor(v)}`}>
                      {noAplica ? '—' : sinVenta ? 'Sin venta' : v!.toFixed(1)}
                    </td>
                  );
                })}
                {PERIODS.map(p => {
                  const k = (s: string) => (r as any)[`${s}_${p.key}`];
                  return (
                    <>
                      <td className="px-2 py-1 text-right border-l">{num(k('un_v'))}</td>
                      <td className="px-2 py-1 text-right">{mxn(k('cu_compra'))}</td>
                      <td className="px-2 py-1 text-right">{mxn(k('pu_venta'))}</td>
                      <td className="px-2 py-1 text-right">{mxn(k('venta'))}</td>
                      <td className="px-2 py-1 text-right">{mxn(k('utilidad'))}</td>
                      <td className="px-2 py-1 text-right">{pct(k('margen'))}</td>
                    </>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span>Mostrando {page * PAGE + 1}–{Math.min((page + 1) * PAGE, rows.length)} de {num(rows.length)}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
          <span className="self-center">Pág {page + 1} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
        </div>
      </div>
    </div>
  );
}

export default function ReporteVentasInventarioSanamex() {
  const { availableSucursales } = useSucursal();
  const [tab, setTab] = useState('general');
  const [allData, setAllData] = useState<Record<string, Row[]>>({});
  const [fillRate, setFillRate] = useState<FillRateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterClasif, setFilterClasif] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterDepto, setFilterDepto] = useState<string>('all');
  const [filterLab, setFilterLab] = useState<string>('all');
  const [fechaCorte, setFechaCorte] = useState(new Date().toISOString().slice(0, 10));
  const [productosFiltro, setProductosFiltro] = useState<[string, string, string, string]>(['', '', '', '']);

  // Pestañas en orden EXACTO: filtro, general(sin cedis), SV, ECA, F36, GH, CEDIS, fillrate
  const sucOrder = ['SV', 'ECA', 'F36', 'GH'];
  const orderedSucs = useMemo(
    () => sucOrder
      .map(code => availableSucursales.find(s => s.codigo === code))
      .filter(Boolean) as typeof availableSucursales,
    [availableSucursales],
  );
  const cedisSuc = useMemo(
    () => availableSucursales.find(s => s.codigo === 'CEDIS' || /cedis/i.test(s.nombre)),
    [availableSucursales],
  );
  const tabs = useMemo(() => {
    const t: { key: string; label: string }[] = [
      { key: 'filtro', label: 'Filtro Personalizado' },
      { key: 'general', label: 'V&I General' },
    ];
    orderedSucs.forEach(s => t.push({ key: s.id, label: `V&I ${s.nombre.replace('Distribuidora Farmacéutica Sanamex ', '')}` }));
    if (cedisSuc) t.push({ key: `cedis:${cedisSuc.id}`, label: 'Inventario CEDIS' });
    t.push({ key: 'fillrate', label: 'Fill Rate Proveedores' });
    return t;
  }, [orderedSucs, cedisSuc]);

  // Lazy load: solo la pestaña activa. Cache por fechaCorte.
  const loadKey = async (key: string, currentCache: Record<string, Row[]> = allData) => {
    if (currentCache[key]) return;
    setLoading(true);
    try {
      const sb = supabase as any;
      if (key === 'general') {
        const { data, error } = await sb.rpc('reporte_ventas_inventario_sanamex', { p_sucursal_id: null, p_fecha_corte: fechaCorte, p_incluir_cedis: false });
        if (error) throw error;
        setAllData(p => ({ ...p, general: (data as Row[]) || [] }));
      } else if (key.startsWith('cedis:')) {
        const cedisId = key.slice('cedis:'.length);
        const { data, error } = await sb.rpc('reporte_ventas_inventario_sanamex', { p_sucursal_id: cedisId, p_fecha_corte: fechaCorte, p_incluir_cedis: true });
        if (error) throw error;
        setAllData(p => ({ ...p, [key]: (data as Row[]) || [] }));
      } else if (key === 'fillrate') {
        const { data, error } = await sb.rpc('fill_rate_proveedores', { p_desde: null, p_hasta: null });
        if (error) throw error;
        setFillRate((data as FillRateRow[]) || []);
      } else {
        const { data, error } = await sb.rpc('reporte_ventas_inventario_sanamex', { p_sucursal_id: key, p_fecha_corte: fechaCorte, p_incluir_cedis: false });
        if (error) throw error;
        setAllData(p => ({ ...p, [key]: (data as Row[]) || [] }));
      }
    } catch (e: any) {
      toast.error('Error al cargar: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadData = async () => {
    setAllData({});
    setFillRate([]);
    await loadKey(tab === 'filtro' ? 'general' : tab, {});
  };

  // Recarga al cambiar fecha o cuando se monta con sucursales disponibles
  useEffect(() => {
    if (!availableSucursales.length) return;
    setAllData({});
    setFillRate([]);
    loadKey(tab === 'filtro' ? 'general' : tab, {});
    /* eslint-disable-next-line */
  }, [fechaCorte, availableSucursales.length]);

  // Carga al cambiar de pestaña (usa cache si ya existe)
  useEffect(() => {
    if (!availableSucursales.length) return;
    loadKey(tab === 'filtro' ? 'general' : tab);
    /* eslint-disable-next-line */
  }, [tab]);

  const currentRows = useMemo(() => {
    if (tab === 'filtro' || tab === 'fillrate') return [];
    const base = allData[tab] || [];
    return base.filter(r => {
      if (search && !`${r.clave} ${r.descripcion}`.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterClasif !== 'all' && r.clasif !== filterClasif) return false;
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      if (filterDepto !== 'all' && r.departamento !== filterDepto) return false;
      if (filterLab !== 'all' && r.lab !== filterLab) return false;
      return true;
    });
  }, [allData, tab, search, filterClasif, filterStatus, filterDepto, filterLab]);

  const depts = useMemo(() => Array.from(new Set((allData['general'] || []).map(r => r.departamento).filter(Boolean))) as string[], [allData]);
  const labs = useMemo(() => Array.from(new Set((allData['general'] || []).map(r => r.lab).filter(Boolean))) as string[], [allData]);

  const filtroRows = useMemo(() => {
    return productosFiltro.map(c => (allData['general'] || []).find(r => r.clave === c || r.descripcion?.toLowerCase().includes(c.toLowerCase()))).filter(Boolean) as Row[];
  }, [productosFiltro, allData]);

  const exportExcel = async () => {
    // Asegurar que todas las pestañas (general + sucursales operativas + CEDIS) estén cargadas
    const sb = supabase as any;
    const needed: { key: string; sucId: string | null; incluirCedis: boolean }[] = [
      { key: 'general', sucId: null, incluirCedis: false },
      ...orderedSucs.map(s => ({ key: s.id, sucId: s.id, incluirCedis: false })),
      ...(cedisSuc ? [{ key: `cedis:${cedisSuc.id}`, sucId: cedisSuc.id, incluirCedis: true }] : []),
    ];
    const faltantes = needed.filter(n => !allData[n.key]);
    if (faltantes.length || !fillRate.length) {
      setLoading(true);
      try {
        const calls = await Promise.all([
          ...faltantes.map(n => sb.rpc('reporte_ventas_inventario_sanamex', { p_sucursal_id: n.sucId, p_fecha_corte: fechaCorte, p_incluir_cedis: n.incluirCedis })),
          fillRate.length ? Promise.resolve({ data: fillRate }) : sb.rpc('fill_rate_proveedores', { p_desde: null, p_hasta: null }),
        ]);
        const next = { ...allData };
        faltantes.forEach((n, i) => { next[n.key] = (calls[i].data as Row[]) || []; });
        setAllData(next);
        const fr = !fillRate.length ? ((calls[calls.length - 1].data as FillRateRow[]) || []) : fillRate;
        if (!fillRate.length) setFillRate(fr);
        return doExport(next, fr);
      } finally { setLoading(false); }
    }
    doExport(allData, fillRate);
  };

  const doExport = (data: Record<string, Row[]>, fr: FillRateRow[]) => {
    const wb = XLSX.utils.book_new();
    const sheetFromRows = (rows: Row[]) => {
      const header = [
        'Clave', 'Lab', 'Categoria', 'Departamento', 'Descripción', 'Agrupador', 'Sustancia', 'IVA', 'Stock Mínimo', 'Clasif.', 'Status',
        'CPI', 'Costo Total', 'TE', '7 DDI', '14 DDI', '30 DDI', '60 DDI', '90 DDI',
        ...PERIODS.flatMap(p => [`Un V ${p.label}`, 'CU Compra', 'PU Venta', 'Venta', 'Utilidad', 'Margen']),
      ];
      const body = rows.map(r => [
        r.clave, r.lab, r.categoria, r.departamento, r.descripcion, r.agrupador, r.sustancia, r.iva, r.stock_minimo, r.clasif, r.status,
        r.cpi, r.costo_total, r.te, r.ddi_7, r.ddi_14, r.ddi_30, r.ddi_60, r.ddi_90,
        ...PERIODS.flatMap(p => [
          (r as any)[`un_v_${p.key}`], (r as any)[`cu_compra_${p.key}`], (r as any)[`pu_venta_${p.key}`],
          (r as any)[`venta_${p.key}`], (r as any)[`utilidad_${p.key}`], (r as any)[`margen_${p.key}`],
        ]),
      ]);
      return XLSX.utils.aoa_to_sheet([header, ...body]);
    };
    XLSX.utils.book_append_sheet(wb, sheetFromRows(filtroRows), 'Filtro Personalizado');
    XLSX.utils.book_append_sheet(wb, sheetFromRows(data['general'] || []), 'V&I General');
    orderedSucs.forEach(s => {
      const name = `V&I ${s.codigo}`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, sheetFromRows(data[s.id] || []), name);
    });
    if (cedisSuc && data[`cedis:${cedisSuc.id}`]) {
      XLSX.utils.book_append_sheet(wb, sheetFromRows(data[`cedis:${cedisSuc.id}`]), 'Inventario CEDIS');
    }
    const frSheet = XLSX.utils.aoa_to_sheet([
      ['Numero Proveedor', 'Nombre', 'Numero OC', 'Items Solicitados', 'Items Entregados', 'Fill Rate Items %', 'Lead Time Días', 'Fecha Emisión', 'Fecha Recepción', 'Varianza Tiempo', 'Fill Rate Lead Time %'],
      ...fr.map(f => [f.numero_proveedor, f.nombre_proveedor, f.numero_oc, f.total_items_solicitados, f.total_items_entregados, f.fill_rate_items, f.lead_time_dias, f.fecha_emision, f.fecha_recepcion, f.varianza_tiempo, f.fill_rate_lead_time]),
    ]);
    XLSX.utils.book_append_sheet(wb, frSheet, 'Fill Rate Proveedores');
    XLSX.writeFile(wb, `Reporte Ventas e Inventario SANAMEX ${fechaCorte.replace(/-/g, '')}.xlsx`);
  };

  const recalcAbc = async () => {
    const { error } = await (supabase as any).rpc('clasificacion_abc_productos');
    if (error) toast.error(error.message); else { toast.success('Clasificación ABC recalculada'); loadData(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">Reporte Ventas e Inventario SANAMEX</h1>
          <p className="text-sm text-muted-foreground">Vista maestra consolidada por SKU, sucursal y período</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={recalcAbc}><RefreshCw className="h-4 w-4 mr-1" />Recalcular ABC</Button>
          <Button variant="outline" size="sm" onClick={loadData}><RefreshCw className="h-4 w-4 mr-1" />Refrescar</Button>
          <Button size="sm" onClick={exportExcel}><Download className="h-4 w-4 mr-1" />Exportar Excel</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <Label className="text-xs">Fecha corte</Label>
            <Input type="date" value={fechaCorte} onChange={e => setFechaCorte(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Buscar clave / descripción</Label>
            <div className="relative"><Search className="h-3 w-3 absolute left-2 top-3 text-muted-foreground" />
              <Input className="pl-7" placeholder="..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Clasif.</Label>
            <Select value={filterClasif} onValueChange={setFilterClasif}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="A">A</SelectItem><SelectItem value="B">B</SelectItem>
                <SelectItem value="C">C</SelectItem><SelectItem value="D">D</SelectItem>
                <SelectItem value="O">O — Obsoleto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="A">A — Activo</SelectItem>
                <SelectItem value="I">I — Inactivo</SelectItem>
                <SelectItem value="C">C — Cancelado</SelectItem>
                <SelectItem value="S">S — Sustituto</SelectItem>
                <SelectItem value="N">N — Nuevo</SelectItem>
                <SelectItem value="E">E — Compra Especial</SelectItem>
                <SelectItem value="K">K — Corta Caducidad</SelectItem>
                <SelectItem value="G">G — Agotado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Departamento</Label>
            <Select value={filterDepto} onValueChange={setFilterDepto}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>
                {depts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Laboratorio</Label>
            <Select value={filterLab} onValueChange={setFilterLab}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos</SelectItem>
                {labs.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          {tabs.map(t => <TabsTrigger key={t.key} value={t.key} className="text-xs">{t.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="filtro" className="mt-4">
          <Card><CardHeader><CardTitle className="text-base">Comparativo de hasta 4 productos</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                {[0, 1, 2, 3].map(i => (
                  <div key={i}>
                    <Label className="text-xs">Producto {String.fromCharCode(65 + i)} — Clave o descripción</Label>
                    <Input value={productosFiltro[i]} onChange={e => {
                      const n = [...productosFiltro] as [string, string, string, string];
                      n[i] = e.target.value;
                      setProductosFiltro(n);
                    }} />
                  </div>
                ))}
              </div>
              <ReportTable rows={filtroRows} loading={false} />
            </CardContent>
          </Card>
        </TabsContent>

        {tabs.filter(t => !['filtro', 'fillrate'].includes(t.key)).map(t => (
          <TabsContent key={t.key} value={t.key} className="mt-4">
            <Card><CardContent className="pt-4">
              <ReportTable rows={tab === t.key ? currentRows : []} loading={loading} />
            </CardContent></Card>
          </TabsContent>
        ))}

        <TabsContent value="fillrate" className="mt-4">
          <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" />Fill Rate Proveedores</CardTitle></CardHeader>
            <CardContent>
              {loading ? <Loader2 className="h-6 w-6 animate-spin mx-auto" /> : (
                <div className="overflow-auto border rounded-md max-h-[70vh]">
                  <table className="text-xs w-full">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left"># Prov.</th>
                        <th className="px-2 py-1 text-left">Nombre</th>
                        <th className="px-2 py-1 text-left">OC</th>
                        <th className="px-2 py-1 text-right">Solicitados</th>
                        <th className="px-2 py-1 text-right">Entregados</th>
                        <th className="px-2 py-1 text-right">Fill Rate Items</th>
                        <th className="px-2 py-1 text-right">Lead Time</th>
                        <th className="px-2 py-1 text-left">F. Emisión</th>
                        <th className="px-2 py-1 text-left">F. Recepción</th>
                        <th className="px-2 py-1 text-right">Varianza</th>
                        <th className="px-2 py-1 text-right">Fill Rate LT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fillRate.map((f, i) => (
                        <tr key={i} className="border-b hover:bg-muted/30">
                          <td className="px-2 py-1 font-mono">{f.numero_proveedor}</td>
                          <td className="px-2 py-1">{f.nombre_proveedor}</td>
                          <td className="px-2 py-1 font-mono">{f.numero_oc}</td>
                          <td className="px-2 py-1 text-right">{num(f.total_items_solicitados)}</td>
                          <td className="px-2 py-1 text-right">{num(f.total_items_entregados)}</td>
                          <td className="px-2 py-1 text-right">{f.fill_rate_items.toFixed(1)}%</td>
                          <td className="px-2 py-1 text-right">{f.lead_time_dias} d</td>
                          <td className="px-2 py-1">{f.fecha_emision}</td>
                          <td className="px-2 py-1">{f.fecha_recepcion}</td>
                          <td className={`px-2 py-1 text-right ${f.varianza_tiempo > 0 ? 'text-red-600' : 'text-green-600'}`}>{f.varianza_tiempo > 0 ? '+' : ''}{f.varianza_tiempo} d</td>
                          <td className="px-2 py-1 text-right">{f.fill_rate_lead_time != null ? `${f.fill_rate_lead_time.toFixed(1)}%` : '—'}</td>
                        </tr>
                      ))}
                      {!fillRate.length && <tr><td colSpan={11} className="text-center py-8 text-muted-foreground">Sin órdenes de compra recibidas</td></tr>}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
