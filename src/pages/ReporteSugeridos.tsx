import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sparkles, Download, RefreshCw, AlertTriangle, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { rpcPaginate } from '@/lib/rpcPaginate';

const TABS: { code: string | null; label: string }[] = [
  { code: null, label: 'Consolidado' },
  { code: 'SV', label: 'San Vicente' },
  { code: 'ECA', label: 'Ecatepec' },
  { code: 'F36', label: 'Izta-F36' },
  { code: 'GH', label: 'Izta-GH' },
  { code: 'CEDIS', label: 'CEDIS' },
  { code: '__custom__', label: 'Filtro personalizado' },
];

type Row = {
  producto_id: string;
  clave: string; departamento: string | null; descripcion: string;
  clasificacion: string | null; status: string | null;
  min_dias: number; max_dias: number; existencias: number;
  ddi_7: number; ventas_7: number; eval_7: string; sugerido_7: number;
  ddi_14: number; ventas_14: number; eval_14: string; sugerido_14: number;
  ddi_30: number; ventas_30: number; eval_30: string; sugerido_30: number;
  ddi_60: number; ventas_60: number; eval_60: string; sugerido_60: number;
  ddi_90: number; ventas_90: number; eval_90: string; sugerido_90: number;
  ddi_120: number; ventas_120: number; eval_120: string; sugerido_120: number;
  comentario_resumen: string;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function ReporteSugeridos() {
  const [tab, setTab] = useState<string>('__all__');
  const [sucCode, setSucCode] = useState<string | null>(null);
  const [fechaCorte, setFechaCorte] = useState<string>(todayIso());
  const [fechaInicializada, setFechaInicializada] = useState(false);
  const [mostrarBannerHist, setMostrarBannerHist] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroClasif, setFiltroClasif] = useState<string>('all');
  const [filtroStatus, setFiltroStatus] = useState<string>('all');
  const [filtroDepto, setFiltroDepto] = useState<string>('all');
  const [soloComprar, setSoloComprar] = useState(false);
  const [decisiones, setDecisiones] = useState<Record<string, { pz: number; coment: string }>>({});

  // Resolver fecha por default basada en la última venta cargada
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('ventas')
        .select('fecha')
        .eq('estado', 'completada')
        .order('fecha', { ascending: false })
        .limit(1);
      const maxFecha = (data?.[0] as any)?.fecha?.split('T')[0];
      const hoy = todayIso();
      if (maxFecha) {
        const diff = (new Date(hoy).getTime() - new Date(maxFecha).getTime()) / 86400000;
        if (diff > 7) {
          setFechaCorte(maxFecha);
          setMostrarBannerHist(true);
        }
      }
      setFechaInicializada(true);
    })();
  }, []);

  async function load() {
    setLoading(true);
    setLoadedCount(0);
    try {
      const data = await rpcPaginate<Row>('reporte_sugeridos', {
        p_sucursal_codigo: sucCode,
        p_fecha_corte: fechaCorte,
        p_clasificacion: filtroClasif === 'all' ? null : filtroClasif,
        p_status: filtroStatus === 'all' ? null : filtroStatus,
        p_solo_comprar: soloComprar,
      }, { onProgress: (n) => setLoadedCount(n) });
      setRows(data);
      // cargar decisiones del día
      const { data: deci } = await supabase
        .from('sugeridos_decisiones')
        .select('producto_id, pz_solicitadas, comentario_gerente')
        .eq('fecha_decision', fechaCorte)
        .eq('periodo_referencia', 30);
      const map: Record<string, { pz: number; coment: string }> = {};
      (deci || []).forEach((d: any) => { map[d.producto_id] = { pz: d.pz_solicitadas ?? 0, coment: d.comentario_gerente ?? '' }; });
      setDecisiones(map);
    } catch (e: any) {
      toast.error(e.message || 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (fechaInicializada) load(); /* eslint-disable-next-line */ }, [sucCode, fechaCorte, filtroClasif, filtroStatus, soloComprar, fechaInicializada]);

  const departamentos = useMemo(() => Array.from(new Set(rows.map(r => r.departamento).filter(Boolean))).sort() as string[], [rows]);

  const filtered = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    return rows.filter(r => {
      if (filtroDepto !== 'all' && r.departamento !== filtroDepto) return false;
      if (b && !r.clave.toLowerCase().includes(b) && !r.descripcion.toLowerCase().includes(b)) return false;
      return true;
    });
  }, [rows, busqueda, filtroDepto]);

  const resumen = useMemo(() => {
    const comprar = filtered.filter(r => r.comentario_resumen === 'Comprar').length;
    const no = filtered.length - comprar;
    const inversion = filtered.reduce((acc, r) => acc + r.sugerido_30, 0); // pzs sugeridas a 30d
    const sinMov = filtered.filter(r => r.ventas_90 === 0).length;
    const sinInventario = filtered.filter(r => r.existencias === 0 && r.ventas_30 > 0).length;
    const conVentas = filtered.filter(r => r.ventas_30 > 0).length;
    const mostrarBannerSinInv = conVentas > 0 && sinInventario / Math.max(conVentas, 1) > 0.5;
    return { comprar, no, inversion, sinMov, sinInventario, mostrarBannerSinInv };
  }, [filtered]);

  async function saveDecision(r: Row, pz: number, comentario: string) {
    setDecisiones(prev => ({ ...prev, [r.producto_id]: { pz, coment: comentario } }));
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      producto_id: r.producto_id,
      sucursal_id: null as string | null,
      fecha_decision: fechaCorte,
      periodo_referencia: 30,
      sugerido_sistema: r.sugerido_30,
      pz_solicitadas: pz,
      comentario_gerente: comentario,
      decidido_por: user?.id,
    };
    if (sucCode && sucCode !== '__custom__') {
      const { data: s } = await supabase.from('sucursales').select('id').eq('codigo', sucCode).maybeSingle();
      payload.sucursal_id = s?.id ?? null;
    }
    const { error } = await supabase.from('sugeridos_decisiones')
      .upsert(payload, { onConflict: 'producto_id,sucursal_id,fecha_decision,periodo_referencia' as any });
    if (error) toast.error('No se guardó: ' + error.message);
  }

  function exportExcel() {
    const data = filtered.map(r => {
      const d = decisiones[r.producto_id] || { pz: 0, coment: '' };
      return {
        Clave: r.clave, Departamento: r.departamento, Descripcion: r.descripcion,
        Clasificacion: r.clasificacion, Status: r.status, MinDias: r.min_dias, MaxDias: r.max_dias,
        Existencias: r.existencias,
        '7 DDI': r.ddi_7, 'Un V 7d': r.ventas_7, 'Eval 7d': r.eval_7, 'Sug 7d': r.sugerido_7,
        '14 DDI': r.ddi_14, 'Un V 14d': r.ventas_14, 'Eval 14d': r.eval_14, 'Sug 14d': r.sugerido_14,
        '30 DDI': r.ddi_30, 'Un V 30d': r.ventas_30, 'Eval 30d': r.eval_30, 'Sug 30d': r.sugerido_30,
        '60 DDI': r.ddi_60, 'Un V 60d': r.ventas_60, 'Eval 60d': r.eval_60, 'Sug 60d': r.sugerido_60,
        '90 DDI': r.ddi_90, 'Un V 90d': r.ventas_90, 'Eval 90d': r.eval_90, 'Sug 90d': r.sugerido_90,
        '120 DDI': r.ddi_120, 'Un V 120d': r.ventas_120, 'Eval 120d': r.eval_120, 'Sug 120d': r.sugerido_120,
        Resumen: r.comentario_resumen,
        'Comentario gerente': d.coment, 'PZ solicitadas': d.pz,
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sugeridos');
    XLSX.writeFile(wb, `sugeridos_${TABS.find(t => t.code === sucCode)?.label || 'consolidado'}_${fechaCorte}.xlsx`);
  }

  function changeTab(val: string) {
    setTab(val);
    if (val === '__all__') setSucCode(null);
    else if (val === '__custom__') setSucCode(null);
    else setSucCode(val);
  }

  const renderBloque = (r: Row, ddi: number, ventas: number, ev: string, sug: number) => (
    <>
      <TableCell className="text-right tabular-nums border-l-2 border-l-border">{ddi}</TableCell>
      <TableCell className="text-right tabular-nums border-l">{ventas}</TableCell>
      <TableCell className="border-l">
        <Badge variant={ev === 'Comprar' ? 'default' : 'secondary'} className={ev === 'Comprar' ? 'bg-emerald-600' : ''}>{ev}</Badge>
      </TableCell>
      <TableCell className={`text-right tabular-nums font-medium border-l ${sug > 0 ? 'text-emerald-700' : 'text-muted-foreground'}`}>{sug}</TableCell>
    </>
  );


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Reporte de Sugeridos</h1>
            <p className="text-sm text-muted-foreground">Cálculo de DDI y sugerido de compra por período (7/14/30/60/90/120 días).</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Recalcular
          </Button>
          <Button onClick={exportExcel} disabled={!filtered.length}><Download className="h-4 w-4 mr-2" />Exportar Excel</Button>
        </div>
      </div>

      <Card className="p-4 grid grid-cols-2 md:grid-cols-6 gap-3 items-end">
        <div>
          <Label className="text-xs">Fecha de corte</Label>
          <Input type="date" value={fechaCorte} onChange={e => setFechaCorte(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Buscar (clave/descripción)</Label>
          <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="ej. 7502208..." />
        </div>
        <div>
          <Label className="text-xs">Clasificación</Label>
          <Select value={filtroClasif} onValueChange={setFiltroClasif}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W'].map(x =>
                <SelectItem key={x} value={x}>{x}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Status</Label>
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {['A','I','C','S','N','E','K','G'].map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Departamento</Label>
          <Select value={filtroDepto} onValueChange={setFiltroDepto}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {departamentos.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="solo-comprar" checked={soloComprar} onCheckedChange={setSoloComprar} />
          <Label htmlFor="solo-comprar" className="text-sm">Solo "Comprar"</Label>
        </div>
      </Card>

      {mostrarBannerHist && (
        <Card className="p-3 border-blue-300 bg-blue-50 dark:bg-blue-950/30 text-sm text-blue-900 dark:text-blue-200">
          📅 Mostrando datos al <strong>{fechaCorte}</strong>. Los datos más recientes son históricos cargados manualmente.
        </Card>
      )}

      {resumen.mostrarBannerSinInv && (
        <Card className="p-4 border-amber-300 bg-amber-50 dark:bg-amber-950/30 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-amber-900 dark:text-amber-200">Aún no hay inventario inicial cargado.</p>
            <p className="text-amber-800 dark:text-amber-300 mt-1">
              El reporte está calculando con existencias = 0, por lo que las sugerencias de compra
              incluyen 45 días completos de cobertura. Carga el inventario inicial para que las
              sugerencias se ajusten a tu stock real.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="border-amber-400">
            <Link to="/cargas-masivas"><Upload className="h-4 w-4 mr-2" />Cargar inventario</Link>
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">A Comprar</div><div className="text-2xl font-bold text-emerald-700">{resumen.comprar}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">No Resurtir</div><div className="text-2xl font-bold text-muted-foreground">{resumen.no}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Pzs sugeridas (30d)</div><div className="text-2xl font-bold">{resumen.inversion.toLocaleString()}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Sin movimiento 90d</div><div className="text-2xl font-bold">{resumen.sinMov}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Sugerencia sin inventario cargado</div><div className="text-2xl font-bold text-amber-700">{resumen.sinInventario}</div></Card>
      </div>

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          <TabsTrigger value="__all__">Consolidado</TabsTrigger>
          {TABS.slice(1, -1).map(t => <TabsTrigger key={t.code!} value={t.code!}>{t.label}</TabsTrigger>)}
          <TabsTrigger value="__custom__">Filtro personalizado</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="p-0 overflow-hidden">
        <div className="max-h-[70vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead rowSpan={2} className="align-bottom border-r">Clave</TableHead>
                <TableHead rowSpan={2} className="align-bottom border-r">Depto</TableHead>
                <TableHead rowSpan={2} className="align-bottom border-r">Descripción</TableHead>
                <TableHead rowSpan={2} className="align-bottom border-r">Clas</TableHead>
                <TableHead rowSpan={2} className="align-bottom border-r">St</TableHead>
                <TableHead rowSpan={2} className="align-bottom text-right border-r">Min</TableHead>
                <TableHead rowSpan={2} className="align-bottom text-right border-r">Max</TableHead>
                <TableHead rowSpan={2} className="align-bottom text-right border-r-2">Exist</TableHead>
                {[7,14,30,60,90,120].map(p => (
                  <TableHead key={`g${p}`} colSpan={4} className="text-center bg-muted/40 border-l-2 border-r-2 border-b">
                    Período {p} días
                  </TableHead>
                ))}
                <TableHead rowSpan={2} className="align-bottom border-l-2">Resumen</TableHead>
                <TableHead rowSpan={2} className="align-bottom border-l">Coment. gerente</TableHead>
                <TableHead rowSpan={2} className="align-bottom text-right border-l">PZ Solic.</TableHead>
              </TableRow>
              <TableRow>
                {[7,14,30,60,90,120].map(p => (
                  <>
                    <TableHead key={`d${p}`} className="text-right border-l-2 border-l-border">DDI</TableHead>
                    <TableHead key={`v${p}`} className="text-right border-l">UnV</TableHead>
                    <TableHead key={`e${p}`} className="border-l">Eval</TableHead>
                    <TableHead key={`s${p}`} className="text-right border-l">Sug</TableHead>
                  </>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && <TableRow><TableCell colSpan={36} className="text-center p-6">Cargando productos… {loadedCount > 0 ? `(${loadedCount.toLocaleString()})` : ''}</TableCell></TableRow>}
              {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={36} className="text-center p-6 text-muted-foreground">Sin datos.</TableCell></TableRow>}
              {filtered.slice(0, 500).map(r => {
                const d = decisiones[r.producto_id] || { pz: 0, coment: '' };
                return (
                  <TableRow key={r.producto_id}>
                    <TableCell className="font-mono text-xs border-r">{r.clave}</TableCell>
                    <TableCell className="text-xs border-r">{r.departamento}</TableCell>
                    <TableCell className="text-xs max-w-[260px] truncate border-r" title={r.descripcion}>{r.descripcion}</TableCell>
                    <TableCell className="text-xs border-r">{r.clasificacion}</TableCell>
                    <TableCell className="text-xs border-r">{r.status}</TableCell>
                    <TableCell className="text-right tabular-nums border-r">{r.min_dias}</TableCell>
                    <TableCell className="text-right tabular-nums border-r">{r.max_dias}</TableCell>
                    <TableCell className="text-right tabular-nums border-r-2">{r.existencias}</TableCell>
                    {renderBloque(r, r.ddi_7, r.ventas_7, r.eval_7, r.sugerido_7)}
                    {renderBloque(r, r.ddi_14, r.ventas_14, r.eval_14, r.sugerido_14)}
                    {renderBloque(r, r.ddi_30, r.ventas_30, r.eval_30, r.sugerido_30)}
                    {renderBloque(r, r.ddi_60, r.ventas_60, r.eval_60, r.sugerido_60)}
                    {renderBloque(r, r.ddi_90, r.ventas_90, r.eval_90, r.sugerido_90)}
                    {renderBloque(r, r.ddi_120, r.ventas_120, r.eval_120, r.sugerido_120)}
                    <TableCell className="border-l-2">
                      <Badge className={r.comentario_resumen === 'Comprar' ? 'bg-emerald-600' : 'bg-rose-600'}>
                        {r.comentario_resumen}
                      </Badge>
                    </TableCell>
                    <TableCell className="border-l">
                      <Input value={d.coment} onChange={e => setDecisiones(prev => ({ ...prev, [r.producto_id]: { ...d, coment: e.target.value } }))}
                        onBlur={e => saveDecision(r, d.pz, e.target.value)}
                        className="h-8 w-40 text-xs" />
                    </TableCell>
                    <TableCell className="text-right border-l">
                      <Input type="number" value={d.pz} onChange={e => setDecisiones(prev => ({ ...prev, [r.producto_id]: { ...d, pz: parseInt(e.target.value || '0') } }))}
                        onBlur={e => saveDecision(r, parseInt(e.target.value || '0'), d.coment)}
                        className="h-8 w-24 text-right text-xs tabular-nums" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        {filtered.length > 500 && (
          <div className="p-2 text-xs text-muted-foreground text-center border-t">Mostrando primeros 500 de {filtered.length}. Usa los filtros para reducir resultados.</div>
        )}
      </Card>
    </div>
  );
}
