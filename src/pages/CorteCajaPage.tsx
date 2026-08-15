import { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Lock, ShoppingCart, PackageCheck, RefreshCw, Clock, CalendarDays, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

type Movimiento = { tipo: 'venta' | 'compra'; id: string; folio: string; monto: number; hora: string; sucursal_id: string };

const money = (n: number) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CorteCajaPage = () => {
  const { selectedSucursal, availableSucursales, canSwitchSucursal } = useSucursal();
  const hoy = new Date().toISOString().slice(0, 10);

  const [fecha, setFecha] = useState(hoy);
  const [alcance, setAlcance] = useState<'sucursal' | 'todas'>('sucursal');

  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [totales, setTotales] = useState({ total_ventas: 0, num_ventas: 0, total_compras: 0, num_compras: 0, ventas_por_metodo: {} as Record<string, number> });
  const [corteHoy, setCorteHoy] = useState<any>(null);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cerrando, setCerrando] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Detalle del corte histórico seleccionado
  const [detalle, setDetalle] = useState<{ corte: any; ventas: any[]; compras: any[] } | null>(null);
  const [detalleLoading, setDetalleLoading] = useState(false);

  // Desglose de artículos por venta
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());
  const [lineas, setLineas] = useState<Record<string, any[]>>({});

  // Cierre auditado de la venta: "En ruta" -> "Concluida" con método de pago final
  const [ventasInfo, setVentasInfo] = useState<Record<string, { estatus_entrega: string }>>({});
  const [metodoOriginal, setMetodoOriginal] = useState<Record<string, string>>({});
  const [correccionesCount, setCorreccionesCount] = useState<Record<string, number>>({});
  const [metodosPago, setMetodosPago] = useState<any[]>([]);
  const [corrigiendo, setCorrigiendo] = useState<Movimiento | null>(null);
  const [historialCorr, setHistorialCorr] = useState<any[]>([]);
  const [corrForm, setCorrForm] = useState({ metodo: '', motivo: '' });
  const [guardandoCorr, setGuardandoCorr] = useState(false);

  useEffect(() => {
    supabase.from('metodos_pago').select('id, nombre').eq('activo', true).order('nombre').then(({ data }) => setMetodosPago(data || []));
  }, []);


  const sucursalIds = useMemo(
    () => (alcance === 'todas' ? availableSucursales.map(s => s.id) : selectedSucursal ? [selectedSucursal.id] : []),
    [alcance, availableSucursales, selectedSucursal]
  );
  const nombreSucursal = (id: string) => availableSucursales.find(s => s.id === id)?.nombre || '—';
  const esGeneral = alcance === 'todas';
  const esHoy = fecha === hoy;

  const load = useCallback(async () => {
    if (sucursalIds.length === 0) return;
    setLoading(true);

    const [{ data: ventasDia }, { data: comprasDia }, { data: hist }] = await Promise.all([
      (supabase as any).from('ventas').select('id, numero_venta, total, fecha, sucursal_id, estatus_entrega').in('sucursal_id', sucursalIds).eq('estado', 'completada').gte('fecha', `${fecha}T00:00:00`).lte('fecha', `${fecha}T23:59:59`).order('fecha', { ascending: false }).limit(500),
      supabase.from('compras').select('id, numero_compra, total, created_at, sucursal_id').in('sucursal_id', sucursalIds).neq('estado', 'cancelada').gte('created_at', `${fecha}T00:00:00`).lte('created_at', `${fecha}T23:59:59`).order('created_at', { ascending: false }).limit(500),
      supabase.from('cortes_caja').select('*').in('sucursal_id', sucursalIds).order('fecha', { ascending: false }).limit(esGeneral ? 120 : 30),
    ]);

    const movs: Movimiento[] = [
      ...(ventasDia || []).map((v: any) => ({ tipo: 'venta' as const, id: v.id, folio: v.numero_venta || v.id.slice(0, 8), monto: Number(v.total), hora: v.fecha, sucursal_id: v.sucursal_id })),
      ...(comprasDia || []).map((c: any) => ({ tipo: 'compra' as const, id: c.id, folio: c.numero_compra || c.id.slice(0, 8), monto: Number(c.total), hora: c.created_at, sucursal_id: c.sucursal_id })),
    ].sort((a, b) => new Date(b.hora).getTime() - new Date(a.hora).getTime());
    setMovimientos(movs);

    const infoVentas: Record<string, { estatus_entrega: string }> = {};
    (ventasDia || []).forEach((v: any) => { infoVentas[v.id] = { estatus_entrega: v.estatus_entrega || 'concluida' }; });
    setVentasInfo(infoVentas);
    const idsVenta = (ventasDia || []).map((v: any) => v.id);
    if (idsVenta.length) {
      const [{ data: corrs }, { data: pagos }] = await Promise.all([
        (supabase as any).from('venta_correcciones').select('venta_id').in('venta_id', idsVenta),
        (supabase as any).from('venta_pagos').select('venta_id, metodos_pago:metodo_pago_id ( nombre )').in('venta_id', idsVenta),
      ]);
      const cnt: Record<string, number> = {};
      (corrs || []).forEach((c: any) => { cnt[c.venta_id] = (cnt[c.venta_id] || 0) + 1; });
      setCorreccionesCount(cnt);
      const orig: Record<string, string> = {};
      (pagos || []).forEach((p: any) => {
        const n = p.metodos_pago?.nombre;
        if (!n) return;
        orig[p.venta_id] = orig[p.venta_id] ? `${orig[p.venta_id]} + ${n}` : n;
      });
      setMetodoOriginal(orig);
    } else { setCorreccionesCount({}); setMetodoOriginal({}); }

    // Totales por RPC (suma de todas las sucursales del alcance)
    const rpcs = await Promise.all(
      sucursalIds.map(id => (supabase as any).rpc('calcular_totales_dia', { p_sucursal_id: id, p_fecha: fecha }))
    );
    const acc = { total_ventas: 0, num_ventas: 0, total_compras: 0, num_compras: 0, ventas_por_metodo: {} as Record<string, number> };
    rpcs.forEach(({ data }: any) => {
      const t = data?.[0];
      if (!t) return;
      acc.total_ventas += Number(t.total_ventas || 0);
      acc.num_ventas += Number(t.num_ventas || 0);
      acc.total_compras += Number(t.total_compras || 0);
      acc.num_compras += Number(t.num_compras || 0);
      Object.entries(t.ventas_por_metodo || {}).forEach(([m, v]: any) => { acc.ventas_por_metodo[m] = (acc.ventas_por_metodo[m] || 0) + Number(v); });
    });
    setTotales(acc);

    const cortesDia = (hist || []).filter((c: any) => c.fecha === fecha);
    setCorteHoy(esGeneral ? null : cortesDia[0] || null);
    setHistorial(hist || []);
    setLoading(false);
  }, [sucursalIds, fecha, esGeneral]);

  useEffect(() => { load(); }, [load]);

  // Refresca cada 60s mientras el día de hoy sigue abierto.
  useEffect(() => {
    if (!esHoy || corteHoy?.estado === 'cerrado') return;
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load, corteHoy?.estado, esHoy]);

  async function terminarDia() {
    if (!selectedSucursal) return;
    setCerrando(true);
    const { error } = await (supabase as any).rpc('cerrar_corte_caja', { p_sucursal_id: selectedSucursal.id, p_fecha: fecha, p_automatico: false });
    setCerrando(false);
    setConfirmOpen(false);
    if (error) { toast.error('No se pudo cerrar el corte: ' + error.message); return; }
    toast.success('Corte de caja cerrado. El análisis del día ya está disponible.');
    load();
  }

  async function toggleLineas(ventaId: string) {
    setExpandidas(prev => {
      const n = new Set(prev);
      n.has(ventaId) ? n.delete(ventaId) : n.add(ventaId);
      return n;
    });
    if (lineas[ventaId]) return;
    const { data } = await supabase
      .from('venta_lineas')
      .select('id, cantidad, precio_unitario, subtotal, productos:producto_id ( sku, nombre, descripcion, unidad )')
      .eq('venta_id', ventaId);
    setLineas(prev => ({ ...prev, [ventaId]: data || [] }));
  }

  async function abrirCorreccion(m: Movimiento) {
    setCorrigiendo(m);
    setCorrForm({ metodo: metodoOriginal[m.id] || '', motivo: '' });
    const { data } = await (supabase as any).from('venta_correcciones').select('*').eq('venta_id', m.id).order('corregido_at', { ascending: false });
    setHistorialCorr(data || []);
  }

  async function guardarCorreccion() {
    if (!corrigiendo) return;
    if (!corrForm.metodo.trim()) { toast.error('Indica el método de pago final'); return; }
    setGuardandoCorr(true);
    const { error } = await (supabase as any).rpc('corregir_venta_pago_estatus', {
      p_venta_id: corrigiendo.id,
      p_metodo_pago_corregido: corrForm.metodo.trim(),
      p_estatus_corregido: 'concluida',
      p_motivo: corrForm.motivo.trim() || null,
    });
    setGuardandoCorr(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Venta concluida con el método de pago final — queda el histórico del cambio');
    setCorrigiendo(null);
    load();
  }

  async function abrirDetalle(corte: any) {
    setDetalle({ corte, ventas: [], compras: [] });
    setDetalleLoading(true);
    const [{ data: ventas }, { data: compras }] = await Promise.all([
      supabase.from('ventas').select('id, numero_venta, total, subtotal, impuestos, fecha, estado').eq('sucursal_id', corte.sucursal_id).eq('estado', 'completada').gte('fecha', `${corte.fecha}T00:00:00`).lte('fecha', `${corte.fecha}T23:59:59`).order('fecha', { ascending: false }).limit(500),
      supabase.from('compras').select('id, numero_compra, total, subtotal, estado, created_at, proveedor_id').eq('sucursal_id', corte.sucursal_id).neq('estado', 'cancelada').gte('created_at', `${corte.fecha}T00:00:00`).lte('created_at', `${corte.fecha}T23:59:59`).order('created_at', { ascending: false }).limit(500),
    ]);
    setDetalle({ corte, ventas: ventas || [], compras: compras || [] });
    setDetalleLoading(false);
  }

  const renderLineas = (ventaId: string, colSpan: number) => {
    const rows = lineas[ventaId];
    return (
      <TableRow className="bg-muted/40 hover:bg-muted/40">
        <TableCell colSpan={colSpan} className="p-0">
          <div className="px-6 py-3">
            {!rows ? (
              <p className="text-xs text-muted-foreground">Cargando artículos...</p>
            ) : rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">Esta venta no tiene artículos capturados.</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr className="text-left">
                    <th className="py-1 pr-4">SKU</th>
                    <th className="py-1 pr-4">Descripción</th>
                    <th className="py-1 pr-4 text-right">Cantidad</th>
                    <th className="py-1 pr-4 text-right">P. unitario</th>
                    <th className="py-1 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l: any) => (
                    <tr key={l.id} className="border-t border-border/60">
                      <td className="py-1 pr-4 font-mono">{l.productos?.sku || '—'}</td>
                      <td className="py-1 pr-4">{l.productos?.nombre || l.productos?.descripcion || '—'}</td>
                      <td className="py-1 pr-4 text-right">{l.cantidad} {l.productos?.unidad || ''}</td>
                      <td className="py-1 pr-4 text-right">{money(l.precio_unitario)}</td>
                      <td className="py-1 text-right font-medium">{money(l.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  };


  const cerrado = corteHoy?.estado === 'cerrado';
  const neto = totales.total_ventas - totales.total_compras;
  const ventasDelDia = movimientos.filter(m => m.tipo === 'venta');
  const comprasDelDia = movimientos.filter(m => m.tipo === 'compra');

  const analisis = useMemo(() => {
    const cerrados = historial.filter((c: any) => c.estado === 'cerrado');
    const ventas = cerrados.reduce((s, c: any) => s + Number(c.total_ventas || 0), 0);
    const compras = cerrados.reduce((s, c: any) => s + Number(c.total_compras || 0), 0);
    const tickets = cerrados.reduce((s, c: any) => s + Number(c.num_ventas || 0), 0);
    const difs = cerrados.reduce((s, c: any) => s + Number(c.diferencia || 0), 0);
    const conDif = cerrados.filter((c: any) => Math.abs(Number(c.diferencia || 0)) >= 20).length;
    const porFecha = new Map<string, { fecha: string; Ventas: number; Compras: number; Diferencia: number }>();
    cerrados.forEach((c: any) => {
      const k = String(c.fecha);
      const row = porFecha.get(k) || { fecha: k.slice(5), Ventas: 0, Compras: 0, Diferencia: 0 };
      row.Ventas += Number(c.total_ventas || 0);
      row.Compras += Number(c.total_compras || 0);
      row.Diferencia += Number(c.diferencia || 0);
      porFecha.set(k, row);
    });
    const serie = [...porFecha.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);
    const diasUnicos = porFecha.size;
    return {
      dias: diasUnicos,
      registros: cerrados.length,
      ventas,
      compras,
      neto: ventas - compras,
      promedioDiario: diasUnicos ? ventas / diasUnicos : 0,
      ticketPromedio: tickets ? ventas / tickets : 0,
      difs,
      conDif,
      serie,
    };
  }, [historial]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Corte de Caja</h1>
          <p className="text-muted-foreground">
            {esGeneral ? 'Todas las sucursales' : selectedSucursal?.nombre} · {fecha}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}><RefreshCw className="h-4 w-4 mr-1" />Actualizar</Button>
          {!esGeneral && esHoy && (cerrado
            ? <Badge variant="outline" className="gap-1 py-1.5 px-3"><Lock className="h-3.5 w-3.5" />Día cerrado {corteHoy?.cerrado_automatico ? '(automático a medianoche)' : ''}</Badge>
            : <Button onClick={() => setConfirmOpen(true)}><Lock className="h-4 w-4 mr-2" />Terminar día / Corte de caja</Button>)}
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />Día del corte</Label>
            <Input type="date" value={fecha} max={hoy} onChange={e => setFecha(e.target.value || hoy)} className="w-[180px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Alcance</Label>
            <Select value={alcance} onValueChange={(v: any) => setAlcance(v)}>
              <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sucursal">Solo {selectedSucursal?.nombre || 'sucursal actual'}</SelectItem>
                {(canSwitchSucursal || availableSucursales.length > 1) && (
                  <SelectItem value="todas">Corte general (todas las sucursales)</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          {!esHoy && (
            <Button variant="ghost" size="sm" onClick={() => setFecha(hoy)}>Volver a hoy</Button>
          )}
        </CardContent>
      </Card>

      {esHoy && !esGeneral && !cerrado && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          El día se cierra solo a medianoche si nadie lo cierra antes. Esta lista se actualiza sola cada minuto.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">Ventas del día</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{money(totales.total_ventas)}</p><p className="text-xs text-muted-foreground">{totales.num_ventas} tickets</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">Compras del día</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{money(totales.total_compras)}</p><p className="text-xs text-muted-foreground">{totales.num_compras} compras</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">Neto del día</CardTitle></CardHeader>
          <CardContent><p className={`text-2xl font-bold ${neto >= 0 ? 'text-green-600' : 'text-destructive'}`}>{money(neto)}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal">Por método de pago</CardTitle></CardHeader>
          <CardContent className="space-y-0.5">
            {Object.keys(totales.ventas_por_metodo).length === 0
              ? <p className="text-xs text-muted-foreground">Sin ventas</p>
              : Object.entries(totales.ventas_por_metodo).map(([m, v]) => (
                  <div key={m} className="flex justify-between text-xs"><span>{m}</span><span className="font-medium">{money(Number(v))}</span></div>
                ))}
          </CardContent></Card>
      </div>

      {/* Movimientos del día con pestañas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Movimientos del {fecha}{esHoy ? ' (en vivo)' : ''}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="todos">
            <TabsList>
              <TabsTrigger value="todos">Todos ({movimientos.length})</TabsTrigger>
              <TabsTrigger value="ventas">Ventas ({ventasDelDia.length})</TabsTrigger>
              <TabsTrigger value="compras">Compras ({comprasDelDia.length})</TabsTrigger>
            </TabsList>
            {([['todos', movimientos], ['ventas', ventasDelDia], ['compras', comprasDelDia]] as const).map(([key, rows]) => (
              <TabsContent key={key} value={key} className="mt-4">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Hora</TableHead>
                    {key === 'todos' && <TableHead>Tipo</TableHead>}
                    <TableHead>Folio</TableHead>
                    {esGeneral && <TableHead>Sucursal</TableHead>}
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow>
                    ) : rows.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin movimientos en este día.</TableCell></TableRow>
                    ) : rows.map(m => {
                      const cols = 3 + (key === 'todos' ? 1 : 0) + (esGeneral ? 1 : 0);
                      const abierta = expandidas.has(m.id);
                      return (
                      <Fragment key={m.tipo + m.id}>
                      <TableRow
                       
                        className={m.tipo === 'venta' ? 'cursor-pointer' : ''}
                        onClick={m.tipo === 'venta' ? () => toggleLineas(m.id) : undefined}
                      >
                        <TableCell className="text-xs">
                          <span className="inline-flex items-center gap-1">
                            {m.tipo === 'venta' && (abierta ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
                            {new Date(m.hora).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </TableCell>
                        {key === 'todos' && (
                          <TableCell>
                            {m.tipo === 'venta'
                              ? <Badge className="gap-1"><PackageCheck className="h-3 w-3" />Venta</Badge>
                              : <Badge variant="secondary" className="gap-1"><ShoppingCart className="h-3 w-3" />Compra</Badge>}
                          </TableCell>
                        )}
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{m.folio}</span>
                            {m.tipo === 'venta' && (
                              <>
                                {ventasInfo[m.id]?.estatus_entrega === 'en_ruta' ? (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500 text-amber-600">En ruta</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Concluida</Badge>
                                )}
                                {correccionesCount[m.id] > 0 && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Pago ajustado ({correccionesCount[m.id]})</Badge>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                        {esGeneral && <TableCell className="text-xs">{nombreSucursal(m.sucursal_id)}</TableCell>}
                        <TableCell className={`text-right font-medium ${m.tipo === 'compra' ? 'text-orange-600' : ''}`}>
                          {m.tipo === 'compra' ? '-' : ''}{money(m.monto)}
                          {m.tipo === 'venta' && (
                            <Button size="sm" variant={ventasInfo[m.id]?.estatus_entrega === 'en_ruta' ? 'outline' : 'ghost'} className="h-6 ml-2 px-2 text-xs"
                              onClick={(ev) => { ev.stopPropagation(); abrirCorreccion(m); }}>
                              {ventasInfo[m.id]?.estatus_entrega === 'en_ruta' ? 'Concluir' : 'Ajustar pago'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                      {m.tipo === 'venta' && abierta && renderLineas(m.id, cols)}
                      </Fragment>
                      );
                    })}

                  </TableBody>
                </Table>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Análisis financiero de cortes ({analisis.dias} días cerrados{esGeneral ? `, ${analisis.registros} cortes` : ''})</CardTitle>
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
              <p className="text-xs text-muted-foreground">{analisis.conDif} corte(s) con diferencia &gt; $20</p>
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
        <CardHeader>
          <CardTitle className="text-base">Historial de cortes</CardTitle>
          <p className="text-xs text-muted-foreground">Haz clic en un renglón para ver el desglose de ventas y compras de ese día.</p>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Fecha</TableHead>
              {esGeneral && <TableHead>Sucursal</TableHead>}
              <TableHead>Cierre</TableHead>
              <TableHead className="text-right">Ventas</TableHead>
              <TableHead className="text-right">Compras</TableHead>
              <TableHead className="text-right">Neto</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {historial.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin cortes anteriores.</TableCell></TableRow>
              ) : historial.map((c: any) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => abrirDetalle(c)}>
                  <TableCell>{c.fecha}</TableCell>
                  {esGeneral && <TableCell className="text-xs">{nombreSucursal(c.sucursal_id)}</TableCell>}
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{c.cerrado_automatico ? 'Automático (medianoche)' : 'Manual'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{money(c.total_ventas)}</TableCell>
                  <TableCell className="text-right">{money(c.total_compras)}</TableCell>
                  <TableCell className={`text-right font-medium ${Number(c.total_ventas || 0) - Number(c.total_compras || 0) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {money(Number(c.total_ventas || 0) - Number(c.total_compras || 0))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detalle del corte histórico */}
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Desglose del corte · {detalle?.corte?.fecha}</DialogTitle>
            <DialogDescription>
              {nombreSucursal(detalle?.corte?.sucursal_id)} · Ventas {money(detalle?.corte?.total_ventas)} · Compras {money(detalle?.corte?.total_compras)} · Diferencia {money(detalle?.corte?.diferencia)}
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="ventas">
            <TabsList>
              <TabsTrigger value="ventas">Ventas ({detalle?.ventas.length || 0})</TabsTrigger>
              <TabsTrigger value="compras">Compras ({detalle?.compras.length || 0})</TabsTrigger>
            </TabsList>
            <TabsContent value="ventas" className="mt-4 max-h-[50vh] overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Hora</TableHead><TableHead>Folio</TableHead><TableHead className="text-right">Subtotal</TableHead><TableHead className="text-right">Impuestos</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {detalleLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6">Cargando...</TableCell></TableRow>
                  ) : (detalle?.ventas.length || 0) === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Sin ventas ese día.</TableCell></TableRow>
                  ) : detalle!.ventas.map((v: any) => (
                    <Fragment key={v.id}>
                    <TableRow className="cursor-pointer" onClick={() => toggleLineas(v.id)}>
                      <TableCell className="text-xs">
                        <span className="inline-flex items-center gap-1">
                          {expandidas.has(v.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          {new Date(v.fecha).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{v.numero_venta || v.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-right">{money(v.subtotal)}</TableCell>
                      <TableCell className="text-right">{money(v.impuestos)}</TableCell>
                      <TableCell className="text-right font-medium">{money(v.total)}</TableCell>
                    </TableRow>
                    {expandidas.has(v.id) && renderLineas(v.id, 5)}
                    </Fragment>
                  ))}

                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="compras" className="mt-4 max-h-[50vh] overflow-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Hora</TableHead><TableHead>Folio</TableHead><TableHead>Estado</TableHead><TableHead className="text-right">Subtotal</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                <TableBody>
                  {detalleLoading ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6">Cargando...</TableCell></TableRow>
                  ) : (detalle?.compras.length || 0) === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">Sin compras ese día.</TableCell></TableRow>
                  ) : detalle!.compras.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-xs">{new Date(c.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                      <TableCell className="font-mono text-xs">{c.numero_compra || c.id.slice(0, 8)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{c.estado}</Badge></TableCell>
                      <TableCell className="text-right">{money(c.subtotal)}</TableCell>
                      <TableCell className="text-right font-medium text-orange-600">{money(c.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Corrección de método de pago / estatus de venta */}
      <Dialog open={!!corrigiendo} onOpenChange={(o) => !o && setCorrigiendo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Concluir venta {corrigiendo?.folio}</DialogTitle>
            <DialogDescription>
              Confirma la entrega y el pago final. Esto no cambia el ticket original — se guarda el histórico (anterior → final) con quién y cuándo lo hizo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded border bg-muted/40 p-2 text-sm">
              Método original (punto de venta): <strong>{corrigiendo ? (metodoOriginal[corrigiendo.id] || 'sin dato') : '—'}</strong>
            </div>
            <div>
              <Label>Método de pago final</Label>
              <Select value={corrForm.metodo} onValueChange={(v) => setCorrForm({ ...corrForm, metodo: v })}>
                <SelectTrigger><SelectValue placeholder="Selecciona el método con el que pagó..." /></SelectTrigger>
                <SelectContent>
                  {metodosPago.map((m) => <SelectItem key={m.id} value={m.nombre}>{m.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Motivo (opcional)</Label>
              <Input value={corrForm.motivo} onChange={(e) => setCorrForm({ ...corrForm, motivo: e.target.value })} placeholder="Ej. Cliente dijo efectivo, pagó con transferencia al recibir" />
            </div>
            {historialCorr.length > 0 && (
              <div className="border rounded p-2 bg-muted/30">
                <p className="text-xs font-semibold mb-1">Historial de correcciones</p>
                {historialCorr.map((h: any) => (
                  <div key={h.id} className="text-xs text-muted-foreground border-b last:border-0 py-1">
                    {new Date(h.corregido_at).toLocaleString('es-MX')} — {h.metodo_pago_anterior || '(sin dato)'} → <strong>{h.metodo_pago_corregido}</strong>
                    {h.estatus_anterior !== h.estatus_corregido && <> · {h.estatus_anterior || '—'} → <strong>{h.estatus_corregido}</strong></>}
                    {h.motivo && <div>Motivo: {h.motivo}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrigiendo(null)}>Cancelar</Button>
            <Button onClick={guardarCorreccion} disabled={guardandoCorr}>{guardandoCorr ? 'Guardando...' : 'Concluir venta'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Terminar el día y cerrar el corte de caja?</AlertDialogTitle>
            <AlertDialogDescription>
              Se registrará el corte de <strong>{selectedSucursal?.nombre}</strong> del <strong>{fecha}</strong> con
              {' '}{money(totales.total_ventas)} en ventas y {money(totales.total_compras)} en compras.
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
