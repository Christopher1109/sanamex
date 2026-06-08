import React, { useEffect, useMemo, useState } from 'react';
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
import { CapturaCorteDialog } from '@/components/cortes/CapturaCorteDialog';
import { Input } from '@/components/ui/input';
import { AlertTriangle } from 'lucide-react';

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
          <TabsTrigger value="cortes">Cortes de Caja</TabsTrigger>
          <TabsTrigger value="vendedores">Productividad Vendedores</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard"><DashboardMensual /></TabsContent>
        <TabsContent value="presupuesto"><PresupuestoVsReal canCapture={canCapture} /></TabsContent>
        <TabsContent value="cortes"><CortesCajaTab userRole={userRole} /></TabsContent>
        <TabsContent value="vendedores"><ProductividadVendedoresTab /></TabsContent>
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
                      <React.Fragment key={y}>
                        <TableHead className="text-right">{y} Ventas</TableHead>
                        <TableHead className="text-right">{y} Margen</TableHead>
                        <TableHead className="text-right">{y} Utilidad</TableHead>
                      </React.Fragment>
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

// ============================================
// TAB 3: Cortes de Caja
// ============================================
interface CorteRow {
  fecha: string;
  sucursal_id: string;
  sucursal_codigo: string;
  sucursal_nombre: string;
  diferencia: number;
  estado_alerta: string;
  color: string;
  mensaje: string;
  observaciones: string | null;
}

const ESTADO_COLOR: Record<string, string> = {
  amarillo: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  azul: 'bg-blue-100 text-blue-800 border-blue-300',
  verde: 'bg-green-100 text-green-800 border-green-300',
  naranja: 'bg-orange-100 text-orange-800 border-orange-300',
  rojo: 'bg-red-100 text-red-800 border-red-300',
};
const ESTADO_LABEL: Record<string, string> = {
  sobrante_alto: 'Sobrante alto',
  sobrante_leve: 'Sobrante leve',
  cuadrado: 'Cuadrado',
  faltante_leve: 'Faltante leve',
  faltante_alto: 'Faltante alto',
};

const CortesCajaTab: React.FC<{ userRole: any }> = ({ userRole }) => {
  const canCapture = ['admin', 'super_admin', 'gerente', 'subgerente'].includes(userRole || '');
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const [desde, setDesde] = useState(firstDay);
  const [hasta, setHasta] = useState(today);
  const [sucursales, setSucursales] = useState<{ id: string; codigo: string; nombre: string }[]>([]);
  const [sucSel, setSucSel] = useState<string[]>([]);
  const [tipoAlerta, setTipoAlerta] = useState<string>('todos');
  const [rows, setRows] = useState<CorteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [openCapt, setOpenCapt] = useState(false);

  useEffect(() => {
    supabase.from('sucursales').select('id, codigo, nombre').eq('activo', true).order('codigo')
      .then(({ data }) => setSucursales(data || []));
  }, []);

  const reload = () => {
    setLoading(true);
    supabase.rpc('reporte_cortes_caja', {
      p_fecha_desde: desde, p_fecha_hasta: hasta,
      p_sucursales: sucSel.length ? sucSel : null,
    }).then(({ data, error }) => {
      if (error) console.error(error);
      setRows((data || []) as CorteRow[]);
      setLoading(false);
    });
  };

  useEffect(reload, [desde, hasta, sucSel.join(',')]);

  const filtered = useMemo(() =>
    tipoAlerta === 'todos' ? rows : rows.filter(r => r.estado_alerta === tipoAlerta),
    [rows, tipoAlerta]);

  // Resumen
  const resumen = useMemo(() => {
    const porSuc: Record<string, { codigo: string; acumulado: number; cuadrados: number; total: number; maxSobrante: number; maxFaltante: number }> = {};
    rows.forEach(r => {
      if (!porSuc[r.sucursal_codigo]) porSuc[r.sucursal_codigo] = { codigo: r.sucursal_codigo, acumulado: 0, cuadrados: 0, total: 0, maxSobrante: 0, maxFaltante: 0 };
      const s = porSuc[r.sucursal_codigo];
      s.acumulado += Number(r.diferencia);
      s.total += 1;
      if (Number(r.diferencia) === 0) s.cuadrados += 1;
      if (Number(r.diferencia) > s.maxSobrante) s.maxSobrante = Number(r.diferencia);
      if (Number(r.diferencia) < s.maxFaltante) s.maxFaltante = Number(r.diferencia);
    });
    // Alerta tendencia: >3 días seguidos con faltante por sucursal
    const alertas: string[] = [];
    const grupos: Record<string, CorteRow[]> = {};
    rows.forEach(r => {
      grupos[r.sucursal_codigo] = grupos[r.sucursal_codigo] || [];
      grupos[r.sucursal_codigo].push(r);
    });
    Object.entries(grupos).forEach(([cod, arr]) => {
      const sorted = [...arr].sort((a, b) => a.fecha.localeCompare(b.fecha));
      let streak = 0, maxStreak = 0;
      sorted.forEach(r => {
        if (Number(r.diferencia) < 0) { streak++; maxStreak = Math.max(maxStreak, streak); }
        else streak = 0;
      });
      if (maxStreak > 3) alertas.push(`${cod}: ${maxStreak} días seguidos con faltante`);
    });
    return { porSuc: Object.values(porSuc), alertas };
  }, [rows]);

  const toggleSuc = (cod: string) =>
    setSucSel(prev => prev.includes(cod) ? prev.filter(c => c !== cod) : [...prev, cod]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
      Fecha: r.fecha, Sucursal: r.sucursal_codigo,
      Diferencia: Number(r.diferencia),
      Estado: ESTADO_LABEL[r.estado_alerta] || r.estado_alerta,
      Mensaje: r.mensaje, Observaciones: r.observaciones || '',
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'Metricas Cortes');
    XLSX.writeFile(wb, `cortes-caja-${desde}-${hasta}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">Tipo de alerta</Label>
            <Select value={tipoAlerta} onValueChange={setTipoAlerta}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sobrante_alto">Sobrante alto</SelectItem>
                <SelectItem value="sobrante_leve">Sobrante leve</SelectItem>
                <SelectItem value="cuadrado">Cuadrado</SelectItem>
                <SelectItem value="faltante_leve">Faltante leve</SelectItem>
                <SelectItem value="faltante_alto">Faltante alto</SelectItem>
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
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            {canCapture && (
              <Button onClick={() => setOpenCapt(true)}>
                <Plus className="h-4 w-4 mr-1" />Capturar
              </Button>
            )}
            <Button variant="outline" onClick={exportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-1" />Exportar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Resumen por sucursal</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Suc</TableHead>
                  <TableHead className="text-right">Acumulado</TableHead>
                  <TableHead className="text-right">Cuadrados</TableHead>
                  <TableHead className="text-right">Max Sobr</TableHead>
                  <TableHead className="text-right">Max Falt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumen.porSuc.map(s => (
                  <TableRow key={s.codigo}>
                    <TableCell>{s.codigo}</TableCell>
                    <TableCell className={`text-right ${s.acumulado < 0 ? 'text-red-600' : s.acumulado > 0 ? 'text-yellow-700' : ''}`}>
                      ${fmt(s.acumulado)}
                    </TableCell>
                    <TableCell className="text-right">{s.cuadrados}/{s.total}</TableCell>
                    <TableCell className="text-right">${fmt(s.maxSobrante)}</TableCell>
                    <TableCell className="text-right text-red-600">${fmt(s.maxFaltante)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Alertas de tendencia</CardTitle></CardHeader>
          <CardContent>
            {resumen.alertas.length === 0
              ? <p className="text-sm text-muted-foreground">Sin tendencias preocupantes detectadas.</p>
              : <ul className="space-y-1 text-sm">{resumen.alertas.map((a, i) => <li key={i} className="text-red-700">⚠️ {a}</li>)}</ul>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Detalle de cortes</CardTitle></CardHeader>
        <CardContent>
          {loading && <div className="text-sm text-muted-foreground">Cargando...</div>}
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead className="text-right">Diferencia</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Mensaje</TableHead>
                  <TableHead>Observaciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Sin cortes capturados aún. Usa el botón Capturar para registrar el corte diario por sucursal.
                  </TableCell></TableRow>
                )}
                {filtered.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{r.fecha}</TableCell>
                    <TableCell>{r.sucursal_codigo}</TableCell>
                    <TableCell className={`text-right font-medium ${Number(r.diferencia) < 0 ? 'text-red-600' : Number(r.diferencia) > 0 ? 'text-yellow-700' : ''}`}>
                      ${fmt(Number(r.diferencia))}
                    </TableCell>
                    <TableCell><Badge variant="outline" className={ESTADO_COLOR[r.color]}>{ESTADO_LABEL[r.estado_alerta]}</Badge></TableCell>
                    <TableCell className="text-sm">{r.mensaje}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.observaciones || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {canCapture && (
        <CapturaCorteDialog open={openCapt} onOpenChange={setOpenCapt} sucursales={sucursales} onSaved={reload} />
      )}
    </div>
  );
};

// ============================================
// TAB 4: Productividad Vendedores
// ============================================
interface VendRow {
  vendedor: string;
  sucursal_codigo: string;
  num_tickets: number;
  venta_total: number;
  ticket_promedio: number;
  utilidad_total: number;
  margen_pct: number;
}

const colorFromName = (name: string) => {
  const colors = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500'];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
};
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';

const ProductividadVendedoresTab: React.FC = () => {
  const [vista, setVista] = useState<'lista' | 'pivote'>('lista');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button size="sm" variant={vista === 'lista' ? 'default' : 'outline'} onClick={() => setVista('lista')}>Lista Plana</Button>
        <Button size="sm" variant={vista === 'pivote' ? 'default' : 'outline'} onClick={() => setVista('pivote')}>Pivote por día</Button>
      </div>
      {vista === 'lista' ? <ProductividadLista /> : <ProductividadPivote />}
    </div>
  );
};

const ProductividadLista: React.FC = () => {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const [desde, setDesde] = useState(firstDay);
  const [hasta, setHasta] = useState(today);
  const [sucursales, setSucursales] = useState<{ id: string; codigo: string; nombre: string }[]>([]);
  const [sucSel, setSucSel] = useState<string[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [rows, setRows] = useState<VendRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.from('sucursales').select('id, codigo, nombre').eq('activo', true).order('codigo')
      .then(({ data }) => setSucursales(data || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    supabase.rpc('reporte_productividad_vendedores', {
      p_fecha_desde: desde, p_fecha_hasta: hasta,
      p_sucursales: sucSel.length ? sucSel : null,
    }).then(({ data, error }) => {
      if (error) console.error(error);
      setRows((data || []) as VendRow[]);
      setLoading(false);
    });
  }, [desde, hasta, sucSel.join(',')]);

  const filtered = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return q ? rows.filter(r => r.vendedor.toLowerCase().includes(q)) : rows;
  }, [rows, busqueda]);

  const topVendedores = useMemo(() => {
    const map: Record<string, VendRow> = {};
    rows.forEach(r => {
      if (!map[r.vendedor]) map[r.vendedor] = { ...r, sucursal_codigo: '-' };
      else {
        const m = map[r.vendedor];
        m.num_tickets += Number(r.num_tickets);
        m.venta_total = Number(m.venta_total) + Number(r.venta_total);
        m.utilidad_total = Number(m.utilidad_total) + Number(r.utilidad_total);
      }
    });
    return Object.values(map).map(v => ({
      ...v,
      ticket_promedio: Number(v.num_tickets) > 0 ? Number(v.venta_total) / Number(v.num_tickets) : 0,
      margen_pct: Number(v.venta_total) > 0 ? (Number(v.utilidad_total) / Number(v.venta_total)) * 100 : 0,
    })).sort((a, b) => Number(b.venta_total) - Number(a.venta_total)).slice(0, 5);
  }, [rows]);

  const toggleSuc = (cod: string) =>
    setSucSel(prev => prev.includes(cod) ? prev.filter(c => c !== cod) : [...prev, cod]);

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
      Vendedor: r.vendedor, Sucursal: r.sucursal_codigo,
      'Tickets': Number(r.num_tickets), 'Venta': Number(r.venta_total),
      'Ticket Promedio': Number(r.ticket_promedio),
      'Utilidad': Number(r.utilidad_total),
      'Margen %': Number(r.margen_pct).toFixed(2),
    })));
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas_Ocup');
    XLSX.writeFile(wb, `productividad-vendedores-${desde}-${hasta}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-3 rounded-md border border-yellow-300 bg-yellow-50 text-sm">
        <AlertTriangle className="h-4 w-4 text-yellow-700 mt-0.5 flex-shrink-0" />
        <span>
          Los vendedores se identifican por nombre capturado. Pueden existir variaciones
          (mayúsculas, espacios). Función de normalización disponible próximamente.
        </span>
      </div>

      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Desde</Label>
            <Input type="date" value={desde} onChange={e => setDesde(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">Hasta</Label>
            <Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} className="w-40" />
          </div>
          <div>
            <Label className="text-xs">Buscar vendedor</Label>
            <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre..." className="w-56" />
          </div>
          <div>
            <Label className="text-xs">Sucursales</Label>
            <div className="flex gap-1 mt-1 flex-wrap">
              {sucursales.map(s => (
                <Button key={s.id} size="sm" variant={sucSel.includes(s.codigo) ? 'default' : 'outline'}
                  onClick={() => toggleSuc(s.codigo)}>{s.codigo}</Button>
              ))}
            </div>
          </div>
          <div className="ml-auto">
            <Button variant="outline" onClick={exportExcel}>
              <FileSpreadsheet className="h-4 w-4 mr-1" />Exportar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Top 5 vendedores del período</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {topVendedores.map((v, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-semibold ${colorFromName(v.vendedor)}`}>
                  {initials(v.vendedor)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{v.vendedor}</div>
                  <div className="text-xs text-muted-foreground">
                    ${fmt(Number(v.venta_total))} · {v.num_tickets} tickets · {pct(Number(v.margen_pct))}
                  </div>
                </div>
              </div>
            ))}
            {topVendedores.length === 0 && <p className="text-sm text-muted-foreground">Sin datos.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Detalle por vendedor y sucursal</CardTitle></CardHeader>
        <CardContent>
          {loading && <div className="text-sm text-muted-foreground">Cargando...</div>}
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendedor</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead className="text-right"># Tickets</TableHead>
                  <TableHead className="text-right">Venta $</TableHead>
                  <TableHead className="text-right">Ticket Prom.</TableHead>
                  <TableHead className="text-right">Utilidad $</TableHead>
                  <TableHead className="text-right">Margen %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin datos</TableCell></TableRow>
                )}
                {filtered.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{r.vendedor}</TableCell>
                    <TableCell>{r.sucursal_codigo}</TableCell>
                    <TableCell className="text-right">{Number(r.num_tickets).toLocaleString('es-MX')}</TableCell>
                    <TableCell className="text-right">${fmt(Number(r.venta_total))}</TableCell>
                    <TableCell className="text-right">${fmt(Number(r.ticket_promedio))}</TableCell>
                    <TableCell className="text-right">${fmt(Number(r.utilidad_total))}</TableCell>
                    <TableCell className="text-right">{pct(Number(r.margen_pct))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ============================================
// Pivote por día (vista tipo Excel del cliente)
// ============================================
interface PivoteRow { sucursal_codigo: string; vendedor: string; dia: number; valor: number; }

const ProductividadPivote: React.FC = () => {
  const now = new Date();
  const [anio, setAnio] = useState<number>(2026);
  const [mes, setMes] = useState<number>(1); // enero por defecto (más datos)
  const [metrica, setMetrica] = useState<'tickets' | 'venta'>('tickets');
  const [rows, setRows] = useState<PivoteRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    supabase.rpc('reporte_productividad_pivote', {
      p_anio: anio, p_mes: mes, p_metrica: metrica, p_sucursales: null,
    }).then(({ data, error }) => {
      if (error) console.error(error);
      setRows(((data || []) as any[]).map(r => ({
        sucursal_codigo: r.sucursal_codigo,
        vendedor: r.vendedor,
        dia: Number(r.dia),
        valor: Number(r.valor),
      })));
      setLoading(false);
    });
  }, [anio, mes, metrica]);

  const diasMes = new Date(anio, mes, 0).getDate();
  const diasArr = Array.from({ length: diasMes }, (_, i) => i + 1);

  // Agrupar: { sucursal: { vendedores: { vendedor: { dia: valor } }, subtotal: { dia: valor } } }
  const agrupado = useMemo(() => {
    const map: Record<string, { vendedores: Record<string, Record<number, number>>; subtotal: Record<number, number>; totalVendedor: Record<string, number>; totalSucursal: number }> = {};
    rows.forEach(r => {
      if (!map[r.sucursal_codigo]) map[r.sucursal_codigo] = { vendedores: {}, subtotal: {}, totalVendedor: {}, totalSucursal: 0 };
      const s = map[r.sucursal_codigo];
      if (!s.vendedores[r.vendedor]) s.vendedores[r.vendedor] = {};
      s.vendedores[r.vendedor][r.dia] = (s.vendedores[r.vendedor][r.dia] || 0) + r.valor;
      s.subtotal[r.dia] = (s.subtotal[r.dia] || 0) + r.valor;
      s.totalVendedor[r.vendedor] = (s.totalVendedor[r.vendedor] || 0) + r.valor;
      s.totalSucursal += r.valor;
    });
    return map;
  }, [rows]);

  const fmtCelda = (v: number | undefined) => {
    if (!v || v === 0) return <span className="text-muted-foreground/50">—</span>;
    if (metrica === 'venta') return `$${Math.round(v).toLocaleString('es-MX')}`;
    return v.toLocaleString('es-MX');
  };

  const sucursalesOrden = Object.keys(agrupado).sort();

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const header = ['Empleado/Día', ...diasArr.map(String), 'Total'];
    const aoa: any[][] = [header];
    sucursalesOrden.forEach(suc => {
      const s = agrupado[suc];
      aoa.push([suc, ...diasArr.map(d => s.subtotal[d] || 0), s.totalSucursal]);
      Object.keys(s.vendedores).sort().forEach(v => {
        aoa.push([`  ${v}`, ...diasArr.map(d => s.vendedores[v][d] || 0), s.totalVendedor[v]]);
      });
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, `Pivote ${MONTHS[mes - 1]} ${anio}`);
    XLSX.writeFile(wb, `productividad-pivote-${anio}-${String(mes).padStart(2, '0')}-${metrica}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-xs">Año</Label>
            <Select value={String(anio)} onValueChange={v => setAnio(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2025, 2026].map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Mes</Label>
            <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Métrica</Label>
            <div className="flex gap-1 mt-1">
              <Button size="sm" variant={metrica === 'tickets' ? 'default' : 'outline'} onClick={() => setMetrica('tickets')}>Tickets</Button>
              <Button size="sm" variant={metrica === 'venta' ? 'default' : 'outline'} onClick={() => setMetrica('venta')}>Venta $</Button>
            </div>
          </div>
          <div className="ml-auto">
            <Button variant="outline" onClick={exportExcel} disabled={!rows.length}>
              <FileSpreadsheet className="h-4 w-4 mr-1" />Exportar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Pivote — {MONTHS[mes - 1]} {anio} ({metrica === 'tickets' ? 'Tickets' : 'Venta $'})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <div className="text-sm text-muted-foreground">Cargando...</div>}
          {!loading && sucursalesOrden.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin datos para el período seleccionado.</p>
          )}
          {!loading && sucursalesOrden.length > 0 && (
            <div className="overflow-auto max-h-[70vh] border rounded">
              <table className="text-xs border-collapse">
                <thead className="sticky top-0 bg-background z-10 shadow-sm">
                  <tr>
                    <th className="text-left p-2 border-b border-r min-w-[200px] sticky left-0 bg-background z-20">Empleado/Día</th>
                    {diasArr.map(d => (
                      <th key={d} className="text-right p-2 border-b min-w-[70px]">{d}</th>
                    ))}
                    <th className="text-right p-2 border-b border-l min-w-[90px] font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sucursalesOrden.map(suc => {
                    const s = agrupado[suc];
                    const vendedores = Object.keys(s.vendedores).sort();
                    return (
                      <React.Fragment key={suc}>
                        <tr className="bg-muted/60 font-bold">
                          <td className="p-2 border-b border-r sticky left-0 bg-muted/60 z-10">{suc}</td>
                          {diasArr.map(d => (
                            <td key={d} className="text-right p-2 border-b">{fmtCelda(s.subtotal[d])}</td>
                          ))}
                          <td className="text-right p-2 border-b border-l">{fmtCelda(s.totalSucursal)}</td>
                        </tr>
                        {vendedores.map(v => (
                          <tr key={v} className="hover:bg-muted/20">
                            <td className="p-2 border-b border-r pl-6 sticky left-0 bg-background z-10">{v}</td>
                            {diasArr.map(d => (
                              <td key={d} className="text-right p-2 border-b">{fmtCelda(s.vendedores[v][d])}</td>
                            ))}
                            <td className="text-right p-2 border-b border-l font-medium">{fmtCelda(s.totalVendedor[v])}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReporteVentasPresupuesto;
