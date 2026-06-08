import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Plus, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { CapturaPresupuestoDialog } from '@/components/presupuesto/CapturaPresupuestoDialog';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const VENDEDORAS = ['SV', 'ECA', 'F36', 'GH']; // sucursales que venden al público
const IZTAPALAPA = ['F36', 'GH'];

const fmt = (n: number | null | undefined) => {
  if (n === null || n === undefined || isNaN(n as any)) return '—';
  return n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
};
const pct = (n: number | null | undefined) => {
  if (n === null || n === undefined || isNaN(n as any)) return '—';
  return n.toFixed(2) + '%';
};
const variacion = (curr: number | null, prev: number | null) => {
  if (curr === null || prev === null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
};

interface DashRow {
  sucursal_codigo: string;
  sucursal_nombre: string;
  anio: number;
  mes: number;
  ventas: number;
  utilidad: number;
  margen_pct: number;
}

interface PvsRRow {
  fecha: string;
  sucursal_codigo: string;
  venta_real: number;
  venta_presupuestada: number;
  diferencia: number;
  porcentaje_cumplimiento: number | null;
  margen_real: number | null;
  margen_presupuestado: number | null;
  estatus: string;
}

const ReporteVentasPresupuesto = () => {
  const { userRole } = useAuth();
  const canCapture = userRole === 'admin' || userRole === 'super_admin';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Reporte Ventas y Presupuesto</h1>
        <p className="text-sm text-muted-foreground">Análisis ejecutivo: comparativos anuales y cumplimiento de meta.</p>
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard Mensual</TabsTrigger>
          <TabsTrigger value="presupuesto">Presupuesto vs Real</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><DashboardMensual /></TabsContent>
        <TabsContent value="presupuesto"><PresupuestoVsReal canCapture={canCapture} /></TabsContent>
      </Tabs>
    </div>
  );
};

// ============================================
// TAB 1: Dashboard Mensual
// ============================================
const DashboardMensual = () => {
  const currentYear = new Date().getFullYear();
  const [aniosSel, setAniosSel] = useState<number[]>([currentYear - 2, currentYear - 1, currentYear]);
  const [sucursales, setSucursales] = useState<{ codigo: string; nombre: string }[]>([]);
  const [rows, setRows] = useState<DashRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('sucursales').select('codigo, nombre').eq('activo', true).order('codigo')
      .then(({ data }) => setSucursales(data || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    supabase.rpc('reporte_dashboard_mensual', {
      p_anios: aniosSel,
      p_sucursales: null,
    }).then(({ data, error }) => {
      if (error) console.error(error);
      setRows((data || []) as DashRow[]);
      setLoading(false);
    });
  }, [aniosSel]);

  const toggleYear = (y: number) => {
    setAniosSel(prev => prev.includes(y) ? prev.filter(x => x !== y) : [...prev, y].sort());
  };

  // Build per-sucursal pivot: { codigo: { anio: { mes: row } } }
  const pivot = useMemo(() => {
    const p: Record<string, Record<number, Record<number, DashRow>>> = {};
    rows.forEach(r => {
      if (!p[r.sucursal_codigo]) p[r.sucursal_codigo] = {};
      if (!p[r.sucursal_codigo][r.anio]) p[r.sucursal_codigo][r.anio] = {};
      p[r.sucursal_codigo][r.anio][r.mes] = r;
    });
    return p;
  }, [rows]);

  // Synthesize aggregates
  const aggregate = (codes: string[]): Record<number, Record<number, { ventas: number; utilidad: number; margen_pct: number }>> => {
    const out: Record<number, Record<number, { ventas: number; utilidad: number; margen_pct: number }>> = {};
    codes.forEach(c => {
      const data = pivot[c];
      if (!data) return;
      Object.entries(data).forEach(([yStr, meses]) => {
        const y = parseInt(yStr);
        if (!out[y]) out[y] = {};
        Object.entries(meses).forEach(([mStr, r]) => {
          const m = parseInt(mStr);
          if (!out[y][m]) out[y][m] = { ventas: 0, utilidad: 0, margen_pct: 0 };
          out[y][m].ventas += Number(r.ventas) || 0;
          out[y][m].utilidad += Number(r.utilidad) || 0;
        });
      });
    });
    Object.values(out).forEach(meses => {
      Object.values(meses).forEach(r => {
        r.margen_pct = r.ventas > 0 ? (r.utilidad / r.ventas) * 100 : 0;
      });
    });
    return out;
  };

  const izt = useMemo(() => aggregate(IZTAPALAPA), [pivot]);
  const totalSanamex = useMemo(() => aggregate(VENDEDORAS), [pivot]);

  const allBlocks: { titulo: string; getRow: (anio: number, mes: number) => any }[] = [
    ...sucursales.map(s => ({
      titulo: `${s.codigo} — ${s.nombre}`,
      getRow: (anio: number, mes: number) => pivot[s.codigo]?.[anio]?.[mes] ?? null,
    })),
    { titulo: 'Total Iztapalapa (F36 + GH)', getRow: (a: number, m: number) => izt[a]?.[m] ?? null },
    { titulo: 'Total Sanamex (SV + ECA + F36 + GH)', getRow: (a: number, m: number) => totalSanamex[a]?.[m] ?? null },
  ];

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    allBlocks.forEach(blk => {
      const sheetData: any[][] = [];
      const header: any[] = ['Mes'];
      aniosSel.forEach(y => { header.push(`${y} Ventas`, `${y} Margen %`, `${y} Utilidad`); });
      for (let i = 1; i < aniosSel.length; i++) header.push(`% Var ${aniosSel[i-1]}→${aniosSel[i]}`);
      sheetData.push(header);
      for (let m = 1; m <= 12; m++) {
        const r: any[] = [MONTHS[m-1]];
        const ventasYear: Record<number, number | null> = {};
        aniosSel.forEach(y => {
          const row = blk.getRow(y, m);
          if (row) {
            r.push(Number(row.ventas), Number(row.margen_pct), Number(row.utilidad));
            ventasYear[y] = Number(row.ventas);
          } else {
            r.push('—', '—', '—'); ventasYear[y] = null;
          }
        });
        for (let i = 1; i < aniosSel.length; i++) {
          const v = variacion(ventasYear[aniosSel[i]], ventasYear[aniosSel[i-1]]);
          r.push(v === null ? '—' : `${v.toFixed(1)}%`);
        }
        sheetData.push(r);
      }
      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      XLSX.utils.book_append_sheet(wb, ws, blk.titulo.substring(0, 30).replace(/[\\/?*[\]]/g, ''));
    });
    XLSX.writeFile(wb, `dashboard-mensual-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 3 + i);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex items-end gap-4 flex-wrap">
          <div>
            <Label className="text-xs">Años a comparar</Label>
            <div className="flex gap-2 mt-1">
              {years.map(y => (
                <Button key={y} size="sm" variant={aniosSel.includes(y) ? 'default' : 'outline'}
                  onClick={() => toggleYear(y)}>{y}</Button>
              ))}
            </div>
          </div>
          <div className="ml-auto">
            <Button variant="outline" onClick={exportExcel}>
              <Download className="h-4 w-4 mr-1" />Exportar a Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && <div className="text-sm text-muted-foreground">Cargando...</div>}

      {allBlocks.map(blk => (
        <Card key={blk.titulo}>
          <CardHeader><CardTitle className="text-base">{blk.titulo}</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    {aniosSel.map(y => (
                      <>
                        <TableHead key={`${y}-v`} className="text-right">{y} Ventas</TableHead>
                        <TableHead key={`${y}-m`} className="text-right">{y} Margen</TableHead>
                        <TableHead key={`${y}-u`} className="text-right">{y} Utilidad</TableHead>
                      </>
                    ))}
                    {aniosSel.slice(1).map((y, i) => (
                      <TableHead key={`var-${y}`} className="text-right">% Var {aniosSel[i]}→{y}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from({ length: 12 }, (_, idx) => idx + 1).map(m => {
                    const cells: any[] = [];
                    const ventasYear: Record<number, number | null> = {};
                    aniosSel.forEach(y => {
                      const r = blk.getRow(y, m);
                      ventasYear[y] = r ? Number(r.ventas) : null;
                      cells.push(
                        <TableCell key={`${y}-v`} className="text-right">{r ? `$${fmt(r.ventas)}` : '—'}</TableCell>,
                        <TableCell key={`${y}-m`} className="text-right">{r ? pct(r.margen_pct) : '—'}</TableCell>,
                        <TableCell key={`${y}-u`} className="text-right">{r ? `$${fmt(r.utilidad)}` : '—'}</TableCell>
                      );
                    });
                    aniosSel.slice(1).forEach((y, i) => {
                      const v = variacion(ventasYear[y], ventasYear[aniosSel[i]]);
                      cells.push(
                        <TableCell key={`var-${y}`} className="text-right">
                          {v === null ? '—' : (
                            <span className={v >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {v >= 0 ? '+' : ''}{v.toFixed(1)}%
                            </span>
                          )}
                        </TableCell>
                      );
                    });
                    return <TableRow key={m}><TableCell className="font-medium">{MONTHS[m-1]}</TableCell>{cells}</TableRow>;
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// ============================================
// TAB 2: Presupuesto vs Real
// ============================================
const PresupuestoVsReal = ({ canCapture }: { canCapture: boolean }) => {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState<number | 'all'>(now.getMonth() + 1);
  const [sucursales, setSucursales] = useState<{ id: string; codigo: string; nombre: string }[]>([]);
  const [sucSel, setSucSel] = useState<string[]>([]);
  const [vista, setVista] = useState<'diaria' | 'mensual'>('mensual');
  const [rows, setRows] = useState<PvsRRow[]>([]);
  const [openCapt, setOpenCapt] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('sucursales').select('id, codigo, nombre').eq('activo', true).order('codigo')
      .then(({ data }) => setSucursales(data || []));
  }, []);

  const reload = () => {
    setLoading(true);
    supabase.rpc('reporte_presupuesto_vs_real', {
      p_anio: anio,
      p_mes: mes === 'all' ? null : mes,
      p_sucursales: sucSel.length ? sucSel : null,
    }).then(({ data, error }) => {
      if (error) console.error(error);
      setRows((data || []) as PvsRRow[]);
      setLoading(false);
    });
  };

  useEffect(reload, [anio, mes, sucSel.join(',')]);

  // Aggregate by month/sucursal for monthly view + YTD
  const monthly = useMemo(() => {
    const map: Record<string, { mes: number; codigo: string; venta_real: number; venta_presup: number }> = {};
    rows.forEach(r => {
      const d = new Date(r.fecha);
      const key = `${d.getMonth()+1}-${r.sucursal_codigo}`;
      if (!map[key]) map[key] = { mes: d.getMonth()+1, codigo: r.sucursal_codigo, venta_real: 0, venta_presup: 0 };
      map[key].venta_real += Number(r.venta_real) || 0;
      map[key].venta_presup += Number(r.venta_presupuestada) || 0;
    });
    const arr = Object.values(map).sort((a, b) => a.mes - b.mes || a.codigo.localeCompare(b.codigo));
    // YTD acumulado por sucursal
    const ytdAcc: Record<string, { real: number; presup: number }> = {};
    return arr.map(r => {
      if (!ytdAcc[r.codigo]) ytdAcc[r.codigo] = { real: 0, presup: 0 };
      ytdAcc[r.codigo].real += r.venta_real;
      ytdAcc[r.codigo].presup += r.venta_presup;
      const diff = r.venta_real - r.venta_presup;
      const cumpl = r.venta_presup > 0 ? (r.venta_real / r.venta_presup) * 100 : null;
      const estatus = cumpl === null ? 'sin_meta' : cumpl >= 100 ? 'verde' : cumpl >= 80 ? 'amarillo' : 'rojo';
      return { ...r, diff, cumpl, estatus, ytd_real: ytdAcc[r.codigo].real, ytd_presup: ytdAcc[r.codigo].presup };
    });
  }, [rows]);

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      verde: 'bg-green-100 text-green-800 border-green-300',
      amarillo: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      rojo: 'bg-red-100 text-red-800 border-red-300',
      sin_meta: 'bg-gray-100 text-gray-600 border-gray-300',
    };
    return <Badge variant="outline" className={map[s]}>{s === 'sin_meta' ? 'Sin meta' : s}</Badge>;
  };

  const toggleSuc = (cod: string) =>
    setSucSel(prev => prev.includes(cod) ? prev.filter(c => c !== cod) : [...prev, cod]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const ms = monthly.map(r => ({
      Mes: MONTHS[r.mes - 1], Sucursal: r.codigo,
      'Venta Real': r.venta_real, 'Venta Presupuestada': r.venta_presup,
      Diferencia: r.diff, '% Cumplimiento': r.cumpl === null ? '—' : r.cumpl.toFixed(2),
      'YTD Real': r.ytd_real, 'YTD Presup': r.ytd_presup,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ms), 'Mensual');
    const ds = rows.map(r => ({
      Fecha: r.fecha, Sucursal: r.sucursal_codigo,
      'Venta Real': Number(r.venta_real), 'Venta Presup': Number(r.venta_presupuestada),
      Diferencia: Number(r.diferencia),
      '% Cumplimiento': r.porcentaje_cumplimiento === null ? '—' : Number(r.porcentaje_cumplimiento).toFixed(2),
      'Margen Real %': r.margen_real === null ? '—' : Number(r.margen_real).toFixed(2),
      'Margen Presup %': r.margen_presupuestado ?? '—',
      Estatus: r.estatus,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ds), 'Diario');
    XLSX.writeFile(wb, `presupuesto-vs-real-${anio}-${mes === 'all' ? 'anual' : mes}.xlsx`);
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 3 + i);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div>
            <Label className="text-xs">Año</Label>
            <Select value={String(anio)} onValueChange={v => setAnio(parseInt(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Mes</Label>
            <Select value={String(mes)} onValueChange={v => setMes(v === 'all' ? 'all' : parseInt(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo el año</SelectItem>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i+1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Vista</Label>
            <Select value={vista} onValueChange={v => setVista(v as any)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mensual">Mensual</SelectItem>
                <SelectItem value="diaria">Diaria</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Sucursales</Label>
            <div className="flex gap-1 mt-1 flex-wrap">
              {sucursales.map(s => (
                <Button key={s.id} size="sm" variant={sucSel.includes(s.codigo) ? 'default' : 'outline'}
                  onClick={() => toggleSuc(s.codigo)}>{s.codigo}</Button>
              ))}
              {sucSel.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSucSel([])}>Todas</Button>}
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            {canCapture && (
              <Button onClick={() => setOpenCapt(true)}>
                <Plus className="h-4 w-4 mr-1" />Capturar presupuesto
              </Button>
            )}
            <Button variant="outline" onClick={exportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-1" />Exportar
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && <div className="text-sm text-muted-foreground">Cargando...</div>}

      {vista === 'mensual' ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Resumen mensual (con YTD acumulado)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead className="text-right">Venta Real</TableHead>
                  <TableHead className="text-right">Venta Presup</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead className="text-right">% Cumpl</TableHead>
                  <TableHead className="text-right">YTD Real</TableHead>
                  <TableHead className="text-right">YTD Presup</TableHead>
                  <TableHead>Estatus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthly.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Sin datos</TableCell></TableRow>
                )}
                {monthly.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{MONTHS[r.mes-1]}</TableCell>
                    <TableCell>{r.codigo}</TableCell>
                    <TableCell className="text-right">${fmt(r.venta_real)}</TableCell>
                    <TableCell className="text-right">{r.venta_presup > 0 ? `$${fmt(r.venta_presup)}` : '—'}</TableCell>
                    <TableCell className="text-right">{r.venta_presup > 0 ? `$${fmt(r.diff)}` : '—'}</TableCell>
                    <TableCell className="text-right">{r.cumpl === null ? '—' : pct(r.cumpl)}</TableCell>
                    <TableCell className="text-right">${fmt(r.ytd_real)}</TableCell>
                    <TableCell className="text-right">{r.ytd_presup > 0 ? `$${fmt(r.ytd_presup)}` : '—'}</TableCell>
                    <TableCell>{statusBadge(r.estatus)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Detalle diario</CardTitle></CardHeader>
          <CardContent>
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead className="text-right">Venta Real</TableHead>
                    <TableHead className="text-right">Venta Presup</TableHead>
                    <TableHead className="text-right">Diferencia</TableHead>
                    <TableHead className="text-right">% Cumpl</TableHead>
                    <TableHead className="text-right">Margen Real</TableHead>
                    <TableHead className="text-right">Margen Presup</TableHead>
                    <TableHead>Estatus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Sin datos</TableCell></TableRow>
                  )}
                  {rows.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>{r.fecha}</TableCell>
                      <TableCell>{r.sucursal_codigo}</TableCell>
                      <TableCell className="text-right">${fmt(Number(r.venta_real))}</TableCell>
                      <TableCell className="text-right">{Number(r.venta_presupuestada) > 0 ? `$${fmt(Number(r.venta_presupuestada))}` : '—'}</TableCell>
                      <TableCell className="text-right">{Number(r.venta_presupuestada) > 0 ? `$${fmt(Number(r.diferencia))}` : '—'}</TableCell>
                      <TableCell className="text-right">{r.porcentaje_cumplimiento === null ? '—' : pct(Number(r.porcentaje_cumplimiento))}</TableCell>
                      <TableCell className="text-right">{r.margen_real === null ? '—' : pct(Number(r.margen_real))}</TableCell>
                      <TableCell className="text-right">{r.margen_presupuestado === null ? '—' : pct(Number(r.margen_presupuestado))}</TableCell>
                      <TableCell>{statusBadge(r.estatus)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {canCapture && (
        <CapturaPresupuestoDialog
          open={openCapt}
          onOpenChange={setOpenCapt}
          sucursales={sucursales}
          onSaved={reload}
        />
      )}
    </div>
  );
};

export default ReporteVentasPresupuesto;
