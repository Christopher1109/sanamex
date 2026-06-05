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
  iva: number; cantidad: number; clasif: string | null; status: string | null;
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
const pct = (n: number) => `${((n || 0) * 100).toFixed(2)}%`;

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
              <th className="px-2 py-1 text-right">Cant.</th>
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
                <td className="px-2 py-1 text-right">{r.iva}</td>
                <td className="px-2 py-1 text-right">{num(r.cantidad)}</td>
                <td className="px-2 py-1 text-center">{r.clasif || '—'}</td>
                <td className="px-2 py-1 text-center">{r.status || '—'}</td>
                <td className="px-2 py-1 text-right">{mxn(r.cpi)}</td>
                <td className="px-2 py-1 text-right">{mxn(r.costo_total)}</td>
                <td className="px-2 py-1 text-right">{num(r.te)}</td>
                <td className={`px-2 py-1 text-right ${ddiColor(r.ddi_7)}`}>{r.ddi_7 != null ? r.ddi_7.toFixed(1) : '—'}</td>
                <td className={`px-2 py-1 text-right ${ddiColor(r.ddi_14)}`}>{r.ddi_14 != null ? r.ddi_14.toFixed(1) : '—'}</td>
                <td className={`px-2 py-1 text-right ${ddiColor(r.ddi_30)}`}>{r.ddi_30 != null ? r.ddi_30.toFixed(1) : '—'}</td>
                <td className={`px-2 py-1 text-right ${ddiColor(r.ddi_60)}`}>{r.ddi_60 != null ? r.ddi_60.toFixed(1) : '—'}</td>
                <td className={`px-2 py-1 text-right ${ddiColor(r.ddi_90)}`}>{r.ddi_90 != null ? r.ddi_90.toFixed(1) : '—'}</td>
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

  // Build tab list: general + each sucursal + Iztapalapa consolidated
  const iztaSucs = useMemo(() => availableSucursales.filter(s => /izta|F\d|H$/i.test(s.codigo) || /izta/i.test(s.nombre)), [availableSucursales]);
  const tabs = useMemo(() => {
    const t: { key: string; label: string; sucursalIds: string[] | null }[] = [
      { key: 'filtro', label: 'Filtro Personalizado', sucursalIds: null },
      { key: 'general', label: 'General (Consolidado)', sucursalIds: null },
    ];
    availableSucursales.forEach(s => t.push({ key: s.id, label: s.nombre.replace('Distribuidora Farmacéutica Sanamex ', ''), sucursalIds: [s.id] }));
    if (iztaSucs.length > 1) t.push({ key: 'iztapalapa', label: 'Iztapalapa (consolidado)', sucursalIds: iztaSucs.map(s => s.id) });
    t.push({ key: 'fillrate', label: 'Fill Rate Proveedores', sucursalIds: null });
    return t;
  }, [availableSucursales, iztaSucs]);

  const loadData = async () => {
    setLoading(true);
    try {
      const sb = supabase as any;
      const promises: Promise<any>[] = [];
      promises.push(sb.rpc('reporte_ventas_inventario_sanamex', { p_sucursal_id: null, p_fecha_corte: fechaCorte }));
      availableSucursales.forEach(s => {
        promises.push(sb.rpc('reporte_ventas_inventario_sanamex', { p_sucursal_id: s.id, p_fecha_corte: fechaCorte }));
      });
      promises.push(sb.rpc('fill_rate_proveedores', { p_desde: null, p_hasta: null }));

      const results = await Promise.all(promises);
      const data: Record<string, Row[]> = {};
      data['general'] = (results[0].data as Row[]) || [];
      availableSucursales.forEach((s, i) => {
        data[s.id] = (results[i + 1].data as Row[]) || [];
      });
      // Build Iztapalapa consolidated client-side
      if (iztaSucs.length > 1) {
        const byKey = new Map<string, Row>();
        iztaSucs.forEach(s => {
          (data[s.id] || []).forEach(r => {
            const ex = byKey.get(r.clave);
            if (!ex) byKey.set(r.clave, { ...r });
            else {
              ex.te += r.te; ex.costo_total += r.costo_total;
              PERIODS.forEach(p => {
                ['un_v', 'venta', 'utilidad'].forEach(f => {
                  (ex as any)[`${f}_${p.key}`] += (r as any)[`${f}_${p.key}`];
                });
              });
            }
          });
        });
        data['iztapalapa'] = Array.from(byKey.values());
      }
      setAllData(data);
      setFillRate((results[results.length - 1].data as FillRateRow[]) || []);
    } catch (e: any) {
      toast.error('Error al cargar: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (availableSucursales.length) loadData(); /* eslint-disable-next-line */ }, [availableSucursales.length, fechaCorte]);

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

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const sheetFromRows = (rows: Row[]) => {
      const header = [
        'Clave', 'Lab', 'Categoria', 'Departamento', 'Descripción', 'Agrupador', 'Sustancia', 'IVA', 'Cantidad', 'Clasif.', 'Status',
        'CPI', 'Costo Total', 'TE', '7 DDI', '14 DDI', '30 DDI', '60 DDI', '90 DDI',
        ...PERIODS.flatMap(p => [`Un V ${p.label}`, 'CU Compra', 'PU Venta', 'Venta', 'Utilidad', 'Margen']),
      ];
      const body = rows.map(r => [
        r.clave, r.lab, r.categoria, r.departamento, r.descripcion, r.agrupador, r.sustancia, r.iva, r.cantidad, r.clasif, r.status,
        r.cpi, r.costo_total, r.te, r.ddi_7, r.ddi_14, r.ddi_30, r.ddi_60, r.ddi_90,
        ...PERIODS.flatMap(p => [
          (r as any)[`un_v_${p.key}`], (r as any)[`cu_compra_${p.key}`], (r as any)[`pu_venta_${p.key}`],
          (r as any)[`venta_${p.key}`], (r as any)[`utilidad_${p.key}`], (r as any)[`margen_${p.key}`],
        ]),
      ]);
      return XLSX.utils.aoa_to_sheet([header, ...body]);
    };
    XLSX.utils.book_append_sheet(wb, sheetFromRows(filtroRows), 'Filtro Personalizado');
    XLSX.utils.book_append_sheet(wb, sheetFromRows(allData['general'] || []), 'Ventas e Inventario General');
    availableSucursales.forEach(s => {
      const name = `V&I ${s.codigo}`.slice(0, 31);
      XLSX.utils.book_append_sheet(wb, sheetFromRows(allData[s.id] || []), name);
    });
    if (allData['iztapalapa']) XLSX.utils.book_append_sheet(wb, sheetFromRows(allData['iztapalapa']), 'V&I Iztapalapa');
    const frSheet = XLSX.utils.aoa_to_sheet([
      ['Numero Proveedor', 'Nombre', 'Numero OC', 'Items Solicitados', 'Items Entregados', 'Fill Rate Items %', 'Lead Time Días', 'Fecha Emisión', 'Fecha Recepción', 'Varianza Tiempo', 'Fill Rate Lead Time %'],
      ...fillRate.map(f => [f.numero_proveedor, f.nombre_proveedor, f.numero_oc, f.total_items_solicitados, f.total_items_entregados, f.fill_rate_items, f.lead_time_dias, f.fecha_emision, f.fecha_recepcion, f.varianza_tiempo, f.fill_rate_lead_time]),
    ]);
    XLSX.utils.book_append_sheet(wb, frSheet, 'Fill Rate Proveedores');
    XLSX.writeFile(wb, `Reporte Ventas e Inventario SANAMEX ${fechaCorte.replace(/-/g, '')}.xlsx`);
  };

  const recalcAbc = async () => {
    const { error } = await supabase.rpc('clasificacion_abc_productos');
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
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="A">A — Activo</SelectItem><SelectItem value="I">I — Inactivo</SelectItem>
                <SelectItem value="C">C — Continuo</SelectItem><SelectItem value="S">S — Suspendido</SelectItem>
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
