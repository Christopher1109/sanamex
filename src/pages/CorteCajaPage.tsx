import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Lock, ShoppingCart, PackageCheck, RefreshCw, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

type Movimiento = { tipo: 'venta' | 'compra'; id: string; folio: string; monto: number; hora: string };


const CorteCajaPage = () => {
  const { selectedSucursal } = useSucursal();
  const hoy = new Date().toISOString().slice(0, 10);

  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [totales, setTotales] = useState({ total_ventas: 0, num_ventas: 0, total_compras: 0, num_compras: 0, ventas_por_metodo: {} as Record<string, number> });
  const [corteHoy, setCorteHoy] = useState<any>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cerrando, setCerrando] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    if (!selectedSucursal) return;
    setLoading(true);

    const [{ data: ventasHoy }, { data: comprasHoy }, { data: tot }, { data: corte }, { data: hist }] = await Promise.all([
      supabase.from('ventas').select('id, folio, total, fecha').eq('sucursal_id', selectedSucursal.id).eq('estado', 'completada').gte('fecha', `${hoy}T00:00:00`).lte('fecha', `${hoy}T23:59:59`).order('fecha', { ascending: false }).limit(200),
      supabase.from('compras').select('id, numero_compra, total, created_at').eq('sucursal_id', selectedSucursal.id).neq('estado', 'cancelada').gte('created_at', `${hoy}T00:00:00`).lte('created_at', `${hoy}T23:59:59`).order('created_at', { ascending: false }).limit(200),
      (supabase as any).rpc('calcular_totales_dia', { p_sucursal_id: selectedSucursal.id, p_fecha: hoy }),
      supabase.from('cortes_caja').select('*').eq('sucursal_id', selectedSucursal.id).eq('fecha', hoy).maybeSingle(),
      supabase.from('cortes_caja').select('*').eq('sucursal_id', selectedSucursal.id).order('fecha', { ascending: false }).limit(30),
    ]);

    const movs: Movimiento[] = [
      ...(ventasHoy || []).map((v: any) => ({ tipo: 'venta' as const, id: v.id, folio: v.folio || v.id.slice(0, 8), monto: Number(v.total), hora: v.fecha })),
      ...(comprasHoy || []).map((c: any) => ({ tipo: 'compra' as const, id: c.id, folio: c.numero_compra || c.id.slice(0, 8), monto: Number(c.total), hora: c.created_at })),
    ].sort((a, b) => new Date(b.hora).getTime() - new Date(a.hora).getTime());
    setMovimientos(movs);

    const t = (tot as any)?.[0];
    if (t) setTotales({ total_ventas: Number(t.total_ventas), num_ventas: t.num_ventas, total_compras: Number(t.total_compras), num_compras: t.num_compras, ventas_por_metodo: t.ventas_por_metodo || {} });
    setCorteHoy(corte || null);
    setHistorial(hist || []);
    setLoading(false);
  }, [selectedSucursal, hoy]);

  useEffect(() => { load(); }, [load]);

  // Refresca cada 60s mientras el día sigue abierto — el "en vivo" que se pidió.
  useEffect(() => {
    if (corteHoy?.estado === 'cerrado') return;
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load, corteHoy?.estado]);

  async function terminarDia() {
    if (!selectedSucursal) return;
    setCerrando(true);
    const { error } = await (supabase as any).rpc('cerrar_corte_caja', { p_sucursal_id: selectedSucursal.id, p_fecha: hoy, p_automatico: false });
    setCerrando(false);
    setConfirmOpen(false);
    if (error) { toast.error('No se pudo cerrar el corte: ' + error.message); return; }
    toast.success('Corte de caja cerrado. El análisis del día ya está disponible.');
    load();
  }

  const cerrado = corteHoy?.estado === 'cerrado';
  const neto = totales.total_ventas - totales.total_compras;

  // Análisis financiero de los últimos cortes cerrados (los que ya están en historial).
  const analisis = useMemo(() => {
    const cerrados = historial.filter((c: any) => c.estado === 'cerrado');
    const ventas = cerrados.reduce((s, c: any) => s + Number(c.total_ventas || 0), 0);
    const compras = cerrados.reduce((s, c: any) => s + Number(c.total_compras || 0), 0);
    const tickets = cerrados.reduce((s, c: any) => s + Number(c.num_ventas || 0), 0);
    const difs = cerrados.reduce((s, c: any) => s + Number(c.diferencia || 0), 0);
    const conDif = cerrados.filter((c: any) => Math.abs(Number(c.diferencia || 0)) >= 20).length;
    const serie = [...cerrados]
      .sort((a: any, b: any) => a.fecha.localeCompare(b.fecha))
      .map((c: any) => ({
        fecha: String(c.fecha).slice(5),
        Ventas: Number(c.total_ventas || 0),
        Compras: Number(c.total_compras || 0),
        Diferencia: Number(c.diferencia || 0),
      }));
    return {
      dias: cerrados.length,
      ventas,
      compras,
      neto: ventas - compras,
      promedioDiario: cerrados.length ? ventas / cerrados.length : 0,
      ticketPromedio: tickets ? ventas / tickets : 0,
      difs,
      conDif,
      serie,
    };
  }, [historial]);

  const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Corte de Caja</h1>
          <p className="text-muted-foreground">{selectedSucursal?.nombre} · {hoy}</p>
        </div>
        <div className="flex items-center gap-2">
          {cerrado ? (
            <Badge variant="outline" className="gap-1 py-1.5 px-3"><Lock className="h-3.5 w-3.5" />
              Día cerrado {corteHoy?.cerrado_automatico ? '(automático a medianoche)' : ''}
            </Badge>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className="h-4 w-4 mr-1" />Actualizar</Button>
              <Button onClick={() => setConfirmOpen(true)}><Lock className="h-4 w-4 mr-2" />Terminar día / Corte de caja</Button>
            </>
          )}
        </div>
      </div>

      {!cerrado && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          El día se cierra solo a medianoche si nadie lo cierra antes. Esta lista se actualiza sola cada minuto.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">Ventas del día</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">${totales.total_ventas.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p><p className="text-xs text-muted-foreground">{totales.num_ventas} tickets</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">Compras del día</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">${totales.total_compras.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p><p className="text-xs text-muted-foreground">{totales.num_compras} compras</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">Neto del día</CardTitle></CardHeader>
          <CardContent><p className={`text-2xl font-bold ${neto >= 0 ? 'text-green-600' : 'text-destructive'}`}>${neto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">Por método de pago</CardTitle></CardHeader>
          <CardContent className="space-y-0.5">
            {Object.keys(totales.ventas_por_metodo).length === 0
              ? <p className="text-xs text-muted-foreground">Sin ventas aún</p>
              : Object.entries(totales.ventas_por_metodo).map(([m, v]) => (
                  <div key={m} className="flex justify-between text-xs"><span>{m}</span><span className="font-medium">${Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></div>
                ))}
          </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Movimientos de hoy (en vivo)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Hora</TableHead><TableHead>Tipo</TableHead><TableHead>Folio</TableHead><TableHead className="text-right">Monto</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8">Cargando...</TableCell></TableRow>
              ) : movimientos.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Sin movimientos todavía hoy.</TableCell></TableRow>
              ) : movimientos.map(m => (
                <TableRow key={m.tipo + m.id}>
                  <TableCell className="text-xs">{new Date(m.hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                  <TableCell>
                    {m.tipo === 'venta'
                      ? <Badge className="gap-1"><PackageCheck className="h-3 w-3" />Venta</Badge>
                      : <Badge variant="secondary" className="gap-1"><ShoppingCart className="h-3 w-3" />Compra</Badge>}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{m.folio}</TableCell>
                  <TableCell className={`text-right font-medium ${m.tipo === 'compra' ? 'text-orange-600' : ''}`}>
                    {m.tipo === 'compra' ? '-' : ''}${m.monto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Análisis financiero de cortes ({analisis.dias} días cerrados)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div><p className="text-xs text-muted-foreground">Ventas acumuladas</p><p className="text-lg font-bold">{money(analisis.ventas)}</p></div>
            <div><p className="text-xs text-muted-foreground">Compras acumuladas</p><p className="text-lg font-bold">{money(analisis.compras)}</p></div>
            <div><p className="text-xs text-muted-foreground">Neto acumulado</p><p className={`text-lg font-bold ${analisis.neto >= 0 ? 'text-green-600' : 'text-destructive'}`}>{money(analisis.neto)}</p></div>
            <div><p className="text-xs text-muted-foreground">Promedio diario</p><p className="text-lg font-bold">{money(analisis.promedioDiario)}</p></div>
            <div><p className="text-xs text-muted-foreground">Ticket promedio</p><p className="text-lg font-bold">{money(analisis.ticketPromedio)}</p></div>
            <div>
              <p className="text-xs text-muted-foreground">Descuadres acumulados</p>
              <p className={`text-lg font-bold ${Math.abs(analisis.difs) < 20 ? '' : 'text-destructive'}`}>{money(analisis.difs)}</p>
              <p className="text-xs text-muted-foreground">{analisis.conDif} día(s) con diferencia &gt; $20</p>
            </div>
          </div>

          {analisis.serie.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aún no hay cortes cerrados para analizar.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analisis.serie}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="fecha" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => money(Number(v))} />
                  <Legend />
                  <Bar dataKey="Ventas" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Compras" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardHeader><CardTitle className="text-base">Historial de cortes</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Cierre</TableHead><TableHead className="text-right">Ventas</TableHead><TableHead className="text-right">Compras</TableHead><TableHead className="text-right">Neto</TableHead></TableRow></TableHeader>
            <TableBody>
              {historial.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin cortes anteriores.</TableCell></TableRow>
              ) : historial.map((c: any) => (
                <TableRow key={c.id}>
                  <TableCell>{c.fecha}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{c.cerrado_automatico ? 'Automático (medianoche)' : 'Manual'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">${Number(c.total_ventas || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className="text-right">${Number(c.total_compras || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</TableCell>
                  <TableCell className={`text-right font-medium ${Number(c.total_ventas || 0) - Number(c.total_compras || 0) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    ${(Number(c.total_ventas || 0) - Number(c.total_compras || 0)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Terminar el día y cerrar el corte de caja?</AlertDialogTitle>
            <AlertDialogDescription>
              Se registrará el corte de <strong>{selectedSucursal?.nombre}</strong> del <strong>{hoy}</strong> con
              {' '}${totales.total_ventas.toLocaleString('es-MX', { minimumFractionDigits: 2 })} en ventas y
              {' '}${totales.total_compras.toLocaleString('es-MX', { minimumFractionDigits: 2 })} en compras.
              Los movimientos posteriores del día seguirán registrándose en el sistema, pero ya no se sumarán a este corte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={terminarDia} disabled={cerrando}>{cerrando ? 'Cerrando...' : 'Sí, cerrar el día'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CorteCajaPage;
