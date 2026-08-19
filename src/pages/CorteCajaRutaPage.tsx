import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Truck, RefreshCw, CheckCircle2, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Corte de Caja — Ruta.
 *
 * Módulo separado del de Mostrador (pedido explícito del usuario después
 * del PR #39: "no me gustó de esa manera... quiero que estén separados,
 * es demasiada información en un mismo módulo"). Cada quien entra al
 * módulo que le corresponde: un chofer solo ve esto, no Corte de Caja
 * Mostrador (ver src/config/modulos.ts).
 *
 * Qué muestra:
 *  - Entregas pendientes: ventas con estatus_entrega = 'en_ruta' (todavía
 *    no confirmadas), sin importar el día en que se generó la venta —
 *    puede seguir pendiente de días anteriores.
 *  - Entregas concluidas hoy: se reconstruyen desde venta_correcciones
 *    (estatus_anterior = 'en_ruta', estatus_corregido = 'concluida',
 *    corregido_at = hoy), porque ventas.estatus_entrega no conserva el
 *    canal original una vez que se concluye.
 *
 * Limitación conocida (documentada también en
 * docs/SANAMEX_15ago2026_seguimiento.md): hoy nada en el flujo de POS
 * marca una venta como en_ruta al crearla — no hay checkbox de "entrega a
 * domicilio" ni vínculo entre `ventas` y `rutas`/`ruta_entregas`. Esta
 * página funciona sobre el campo que YA existe, pero el paso de "cómo una
 * venta empieza a ser de ruta" sigue sin resolverse — es justo el punto
 * que la propia junta dejó abierto ("quién concluye una venta hecha en
 * sucursal cuando el cliente recoge directo").
 */

type EntregaPendiente = {
  id: string;
  numero_venta: string | null;
  total: number;
  fecha: string;
  sucursal_id: string;
  repartidor_id: string | null;
};

type EntregaConcluidaHoy = {
  venta_id: string;
  numero_venta: string | null;
  total: number;
  metodo_pago_corregido: string;
  corregido_at: string;
};

const money = (n: number) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type LineaDetalle = {
  id: string;
  sku: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
};

const CorteCajaRutaPage = () => {
  const { selectedSucursal, availableSucursales, canSwitchSucursal } = useSucursal();
  const { userRole, user } = useAuth();
  const esRepartidor = userRole === 'repartidor';
  const hoy = new Date().toISOString().slice(0, 10);

  const [alcance, setAlcance] = useState<'sucursal' | 'todas'>('sucursal');
  const [loading, setLoading] = useState(true);
  const [pendientes, setPendientes] = useState<EntregaPendiente[]>([]);
  const [concluidasHoy, setConcluidasHoy] = useState<EntregaConcluidaHoy[]>([]);
  const [metodosPago, setMetodosPago] = useState<any[]>([]);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [detalles, setDetalles] = useState<Record<string, LineaDetalle[] | 'loading'>>({});
  // Asignación de entregas por chofer (junta 15-ago-2026): cuando hay varios
  // repartidores, cada entrega se asigna a uno y el chofer solo ve las suyas.
  const [repartidores, setRepartidores] = useState<{ id: string; nombre: string }[]>([]);
  const [asignando, setAsignando] = useState<string | null>(null);


  const [confirmando, setConfirmando] = useState<EntregaPendiente | null>(null);
  const [metodo, setMetodo] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargarDetalle = useCallback(async (ventaId: string) => {
    setDetalles((d) => (d[ventaId] && d[ventaId] !== 'loading' ? d : { ...d, [ventaId]: 'loading' }));
    const { data, error } = await (supabase as any)
      .from('venta_lineas')
      .select('id, cantidad, precio_unitario, subtotal, productos(sku, nombre)')
      .eq('venta_id', ventaId);
    if (error) { toast.error(`Detalle: ${error.message}`); setDetalles((d) => ({ ...d, [ventaId]: [] })); return; }
    setDetalles((d) => ({
      ...d,
      [ventaId]: (data || []).map((l: any) => ({
        id: l.id,
        sku: l.productos?.sku || '—',
        nombre: l.productos?.nombre || '—',
        cantidad: Number(l.cantidad || 0),
        precio_unitario: Number(l.precio_unitario || 0),
        subtotal: Number(l.subtotal || 0),
      })),
    }));
  }, []);

  const toggleDetalle = (ventaId: string) => {
    if (expandida === ventaId) { setExpandida(null); return; }
    setExpandida(ventaId);
    if (!detalles[ventaId] || detalles[ventaId] === 'loading') cargarDetalle(ventaId);
  };


  // OJO: memoizado a propósito. Si `sucursalIds` se recalcula en cada render,
  // `load` (useCallback que lo tiene como dependencia) cambia de identidad en
  // cada render y el useEffect que lo llama entra en bucle infinito
  // (setState -> render -> nuevo array -> nuevo load -> efecto) — eso era lo
  // que dejaba la pantalla en blanco.
  const sucursalIds = useMemo(
    () => (alcance === 'todas'
      ? availableSucursales.map(s => s.id)
      : selectedSucursal ? [selectedSucursal.id] : []),
    [alcance, availableSucursales, selectedSucursal],
  );
  const sucursalKey = sucursalIds.join(',');
  const nombreSucursal = (id: string) => availableSucursales.find(s => s.id === id)?.nombre || '—';


  useEffect(() => {
    supabase.from('metodos_pago').select('id, nombre').eq('activo', true).order('nombre').then(({ data }) => setMetodosPago(data || []));
  }, []);

  useEffect(() => {
    if (esRepartidor) return; // el chofer no asigna, solo ve lo suyo
    (async () => {
      const { data: roles } = await (supabase as any).from('user_roles').select('user_id').eq('role', 'repartidor');
      const ids = (roles || []).map((r: any) => r.user_id);
      if (!ids.length) { setRepartidores([]); return; }
      const { data: perfiles } = await (supabase as any).from('profiles').select('id, nombre, username').in('id', ids);
      setRepartidores((perfiles || []).map((p: any) => ({ id: p.id, nombre: p.nombre || p.username || p.id.slice(0, 8) })));
    })();
  }, [esRepartidor]);

  const load = useCallback(async () => {
    const ids = sucursalKey ? sucursalKey.split(',') : [];
    if (ids.length === 0) { setPendientes([]); setConcluidasHoy([]); setLoading(false); return; }
    setLoading(true);

    let pendQuery = (supabase as any).from('ventas')
        .select('id, numero_venta, total, fecha, sucursal_id, repartidor_id')
        .in('sucursal_id', ids)
        .eq('estado', 'completada')
        .eq('estatus_entrega', 'en_ruta');
    // Un chofer solo ve las entregas que le fueron asignadas (o las que aún
    // no tienen chofer asignado, para no esconder trabajo pendiente).
    if (esRepartidor && user?.id) pendQuery = pendQuery.or(`repartidor_id.eq.${user.id},repartidor_id.is.null`);

    const [pendRes, corrRes] = await Promise.all([
      pendQuery
        .order('fecha', { ascending: true })
        .limit(300),
      (supabase as any).from('venta_correcciones')
        .select('venta_id, metodo_pago_corregido, corregido_at, ventas!inner(numero_venta, total, sucursal_id)')
        .eq('estatus_anterior', 'en_ruta')
        .eq('estatus_corregido', 'concluida')
        .in('ventas.sucursal_id', ids)
        .gte('corregido_at', `${hoy}T00:00:00`)
        .lte('corregido_at', `${hoy}T23:59:59`)
        .order('corregido_at', { ascending: false })
        .limit(300),
    ]);

    if (pendRes.error) toast.error(`Pendientes: ${pendRes.error.message}`);
    if (corrRes.error) toast.error(`Confirmadas: ${corrRes.error.message}`);

    setPendientes((pendRes.data || []) as EntregaPendiente[]);
    setConcluidasHoy(
      (corrRes.data || []).map((c: any) => ({
        venta_id: c.venta_id,
        numero_venta: c.ventas?.numero_venta || null,
        total: Number(c.ventas?.total || 0),
        metodo_pago_corregido: c.metodo_pago_corregido,
        corregido_at: c.corregido_at,
      }))
    );
    setLoading(false);
  }, [sucursalKey, hoy, esRepartidor, user?.id]);

  async function asignarRepartidor(ventaId: string, repartidorId: string) {
    setAsignando(ventaId);
    const { error } = await (supabase as any).from('ventas')
      .update({ repartidor_id: repartidorId || null }).eq('id', ventaId);
    setAsignando(null);
    if (error) { toast.error(error.message); return; }
    setPendientes((p) => p.map((v) => (v.id === ventaId ? { ...v, repartidor_id: repartidorId || null } : v)));
    toast.success('Entrega asignada');
  }

  useEffect(() => { load(); }, [load]);


  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  function abrirConfirmacion(v: EntregaPendiente) {
    setConfirmando(v);
    setMetodo('');
    setMotivo('');
  }

  async function confirmarEntrega() {
    if (!confirmando) return;
    if (!metodo.trim()) { toast.error('Indica el método de pago real recibido'); return; }
    setGuardando(true);
    const { error } = await (supabase as any).rpc('corregir_venta_pago_estatus', {
      p_venta_id: confirmando.id,
      p_metodo_pago_corregido: metodo.trim(),
      p_estatus_corregido: 'concluida',
      p_motivo: motivo.trim() || null,
    });
    setGuardando(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Entrega de ${confirmando.numero_venta || confirmando.id.slice(0, 8)} confirmada`);
    setConfirmando(null);
    load();
  }

  const totalPendiente = pendientes.reduce((s, v) => s + Number(v.total || 0), 0);
  const totalConcluidoHoy = concluidasHoy.reduce((s, v) => s + v.total, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="h-6 w-6" /> Corte de Caja — Ruta</h1>
          <p className="text-muted-foreground">
            {esRepartidor ? 'Mis entregas' : (alcance === 'todas' ? 'Todas las sucursales' : selectedSucursal?.nombre)}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-1" />Actualizar
        </Button>
      </div>

      {!esRepartidor && (canSwitchSucursal || availableSucursales.length > 1) && (
        <Card>
          <CardContent className="pt-6">
            <Label className="text-xs text-muted-foreground">Alcance</Label>
            <Select value={alcance} onValueChange={(v: any) => setAlcance(v)}>
              <SelectTrigger className="w-[280px] mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sucursal">Solo {selectedSucursal?.nombre || 'sucursal actual'}</SelectItem>
                <SelectItem value="todas">Todas las sucursales</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border-amber-500/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> Pendientes de entrega
          </CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{money(totalPendiente)}</p><p className="text-xs text-muted-foreground">{pendientes.length} entregas</p></CardContent>
        </Card>
        <Card className="border-green-500/50">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground font-normal flex items-center gap-1">
            <CheckCircle2 className="h-3.5 w-3.5" /> Confirmadas hoy
          </CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{money(totalConcluidoHoy)}</p><p className="text-xs text-muted-foreground">{concluidasHoy.length} entregas</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Pendientes de entrega</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Folio</TableHead>
              <TableHead>Fecha</TableHead>
              {alcance === 'todas' && <TableHead>Sucursal</TableHead>}
              <TableHead>Chofer</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead className="text-right">Acción</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando…</TableCell></TableRow>
              ) : pendientes.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin entregas pendientes.</TableCell></TableRow>
              ) : pendientes.map((v) => {
                const det = detalles[v.id];
                const abierta = expandida === v.id;
                return (
                <Fragment key={v.id}>
                <TableRow className="cursor-pointer" onClick={() => toggleDetalle(v.id)}>
                  <TableCell>
                    {abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{v.numero_venta || v.id.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs">{new Date(v.fecha).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</TableCell>
                  {alcance === 'todas' && <TableCell className="text-xs">{nombreSucursal(v.sucursal_id)}</TableCell>}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {esRepartidor ? (
                      <span className="text-xs text-muted-foreground">
                        {v.repartidor_id ? (v.repartidor_id === user?.id ? 'Asignada a ti' : 'Otro chofer') : 'Sin asignar'}
                      </span>
                    ) : (
                      <Select
                        value={v.repartidor_id || 'ninguno'}
                        disabled={asignando === v.id}
                        onValueChange={(val) => asignarRepartidor(v.id, val === 'ninguno' ? '' : val)}
                      >
                        <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ninguno">Sin asignar</SelectItem>
                          {repartidores.map((r) => (<SelectItem key={r.id} value={r.id}>{r.nombre}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">{money(v.total)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); abrirConfirmacion(v); }}>Confirmar entrega</Button>
                  </TableCell>
                </TableRow>
                {abierta && (
                  <TableRow key={`${v.id}-det`} className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={alcance === 'todas' ? 7 : 6} className="p-3">
                      {det === 'loading' || det === undefined ? (
                        <p className="text-xs text-muted-foreground">Cargando artículos…</p>
                      ) : det.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Esta venta no tiene artículos registrados.</p>
                      ) : (
                        <div className="space-y-1">
                          <p className="text-xs font-medium mb-2">Mercancía que debe llevar ({det.reduce((s, l) => s + l.cantidad, 0)} pzas)</p>
                          <Table>
                            <TableHeader><TableRow>
                              <TableHead className="h-8 text-xs">SKU</TableHead>
                              <TableHead className="h-8 text-xs">Descripción</TableHead>
                              <TableHead className="h-8 text-xs text-center">Cant.</TableHead>
                              <TableHead className="h-8 text-xs text-right">P. Unit</TableHead>
                              <TableHead className="h-8 text-xs text-right">Importe</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                              {det.map((l) => (
                                <TableRow key={l.id}>
                                  <TableCell className="font-mono text-xs">{l.sku}</TableCell>
                                  <TableCell className="text-xs">{l.nombre}</TableCell>
                                  <TableCell className="text-center text-xs font-medium">{l.cantidad}</TableCell>
                                  <TableCell className="text-right text-xs">{money(l.precio_unitario)}</TableCell>
                                  <TableCell className="text-right text-xs">{money(l.subtotal)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
              );})}

            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Confirmadas hoy</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Folio</TableHead>
              <TableHead>Hora confirmación</TableHead>
              <TableHead>Método real</TableHead>
              <TableHead className="text-right">Monto</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {concluidasHoy.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Sin entregas confirmadas todavía hoy.</TableCell></TableRow>
              ) : concluidasHoy.map((v) => (
                <TableRow key={v.venta_id}>
                  <TableCell className="font-mono text-xs">{v.numero_venta || v.venta_id.slice(0, 8)}</TableCell>
                  <TableCell className="text-xs">{new Date(v.corregido_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</TableCell>
                  <TableCell><Badge variant="secondary">{v.metodo_pago_corregido}</Badge></TableCell>
                  <TableCell className="text-right font-medium">{money(v.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!confirmando} onOpenChange={(o) => !o && setConfirmando(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirmar entrega</DialogTitle>
            <DialogDescription>
              Indica el método de pago real con el que se cobró al entregar. Esto concluye la venta.
            </DialogDescription>
          </DialogHeader>
          {confirmando && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">{confirmando.numero_venta || confirmando.id.slice(0, 8)}</p>
                <p className="text-muted-foreground text-xs">{money(confirmando.total)}</p>
              </div>
              <div>
                <Label>Método de pago real *</Label>
                <Select value={metodo} onValueChange={setMetodo}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {metodosPago.map((m) => <SelectItem key={m.id} value={m.nombre}>{m.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notas (opcional)</Label>
                <Input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. Cliente pagó con transferencia al recibir" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmando(null)} disabled={guardando}>Cancelar</Button>
            <Button onClick={confirmarEntrega} disabled={guardando}>Confirmar entrega</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CorteCajaRutaPage;
