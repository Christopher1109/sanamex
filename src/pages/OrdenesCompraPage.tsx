import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Send, PackageCheck, X, ClipboardList, ArrowLeft, Check, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

type OC = {
  id: string; folio: string; estado: string;
  fecha_creacion: string; fecha_envio: string | null; fecha_recepcion_real: string | null;
  subtotal: number; iva: number; total: number; notas: string | null;
  creada_por: string | null;
  proveedor: { nombre: string; codigo: string | null } | null;
  sucursal_destino: { codigo: string; nombre: string } | null;
  comprador?: { nombre: string | null; username: string | null } | null;
};
type Linea = {
  id: string; producto_id: string; cantidad_solicitada: number; cantidad_recibida: number;
  precio_unitario: number; subtotal: number;
  producto: { nombre: string; sku: string } | null;
};

const ESTADO_COLOR: Record<string, string> = {
  borrador: 'bg-slate-500', pendiente_aprobacion: 'bg-amber-600',
  enviada: 'bg-blue-600', confirmada: 'bg-indigo-600',
  parcial: 'bg-amber-600', recibida: 'bg-emerald-600', cancelada: 'bg-rose-600',
};

const ROLES_APROBADOR = ['gerente', 'admin', 'super_admin'];

export default function OrdenesCompraPage() {
  const { user, userRole } = useAuth();
  const esAprobador = !!userRole && ROLES_APROBADOR.includes(userRole);
  const [ocs, setOcs] = useState<OC[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<string>('all');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionada, setSeleccionada] = useState<OC | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [recibirOpen, setRecibirOpen] = useState(false);
  const [recepciones, setRecepciones] = useState<Record<string, number>>({});
  const [almacenes, setAlmacenes] = useState<{ id: string; nombre: string; sucursal: string }[]>([]);
  const [almacenSel, setAlmacenSel] = useState<string>('');
  const [tab, setTab] = useState<'todas' | 'aprobaciones'>('todas');
  const [rechazoOpen, setRechazoOpen] = useState<OC | null>(null);
  const [razonRechazo, setRazonRechazo] = useState('');

  useEffect(() => { load(); loadAlmacenes(); }, []);

  async function aprobarOC(oc: OC) {
    const { error } = await supabase.from('ordenes_compra').update({
      estado: 'borrador',
      aprobada_por: user?.id,
      fecha_aprobacion: new Date().toISOString(),
      razon_aprobacion: 'Aprobada',
    } as any).eq('id', oc.id);
    if (error) return toast.error(error.message);
    toast.success(`${oc.folio} aprobada — comprador puede enviarla`);
    load();
  }

  async function rechazarOC() {
    if (!rechazoOpen || !razonRechazo.trim()) { toast.error('Razón obligatoria'); return; }
    const { error } = await supabase.from('ordenes_compra').update({
      estado: 'cancelada',
      aprobada_por: user?.id,
      fecha_aprobacion: new Date().toISOString(),
      razon_aprobacion: razonRechazo.trim(),
    } as any).eq('id', rechazoOpen.id);
    if (error) return toast.error(error.message);
    toast.success(`${rechazoOpen.folio} rechazada`);
    setRechazoOpen(null); setRazonRechazo('');
    load();
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('ordenes_compra')
      .select(`id, folio, estado, fecha_creacion, fecha_envio, fecha_recepcion_real, subtotal, iva, total, notas,
               proveedor:proveedores(nombre, codigo),
               sucursal_destino:sucursales!sucursal_destino_id(codigo, nombre)`)
      .order('created_at', { ascending: false });
    setOcs((data || []) as any);
    setLoading(false);
  }

  async function loadAlmacenes() {
    const { data } = await supabase
      .from('almacenes')
      .select('id, nombre, sucursal:sucursales(codigo, nombre)')
      .eq('activo', true);
    setAlmacenes((data || []).map((a: any) => ({
      id: a.id, nombre: a.nombre, sucursal: a.sucursal?.codigo || '',
    })));
  }

  async function abrirDetalle(oc: OC) {
    setSeleccionada(oc);
    const { data } = await supabase
      .from('orden_compra_lineas')
      .select('id, producto_id, cantidad_solicitada, cantidad_recibida, precio_unitario, subtotal, producto:productos(nombre, sku)')
      .eq('orden_id', oc.id);
    setLineas((data || []) as any);
  }

  async function cambiarEstado(oc: OC, nuevo: string) {
    const updates: any = { estado: nuevo };
    if (nuevo === 'enviada') { updates.fecha_envio = new Date().toISOString().slice(0, 10); updates.enviada_por = user?.id; }
    const { error } = await supabase.from('ordenes_compra').update(updates).eq('id', oc.id);
    if (error) return toast.error(error.message);
    toast.success(`OC ${nuevo}`);
    await load();
    if (seleccionada?.id === oc.id) abrirDetalle({ ...oc, estado: nuevo });
  }

  async function actualizarPrecio(linea: Linea, precio: number) {
    if (seleccionada?.estado !== 'borrador') return;
    await supabase.from('orden_compra_lineas').update({ precio_unitario: precio }).eq('id', linea.id);
    if (seleccionada) abrirDetalle(seleccionada);
    load();
  }

  async function eliminarLinea(linea: Linea) {
    if (seleccionada?.estado !== 'borrador') return;
    await supabase.from('orden_compra_lineas').delete().eq('id', linea.id);
    if (seleccionada) abrirDetalle(seleccionada);
    load();
  }

  async function ejecutarRecepcion() {
    if (!seleccionada || !almacenSel) { toast.error('Selecciona almacén'); return; }
    const items = Object.entries(recepciones)
      .filter(([, c]) => c > 0)
      .map(([linea_id, cantidad]) => ({ linea_id, cantidad }));
    if (!items.length) { toast.error('Captura al menos una cantidad'); return; }
    const { data, error } = await (supabase as any).rpc('recibir_oc', {
      p_orden_id: seleccionada.id, p_recepciones: items, p_almacen_id: almacenSel,
    });
    if (error) return toast.error(error.message);
    toast.success(`Recepción registrada: ${data?.estado}`);
    setRecibirOpen(false); setRecepciones({});
    await load(); abrirDetalle(seleccionada);
  }

  const filtradas = useMemo(() => ocs.filter(o => {
    if (filtroEstado !== 'all' && o.estado !== filtroEstado) return false;
    const b = busqueda.toLowerCase();
    if (b && !o.folio.toLowerCase().includes(b) && !(o.proveedor?.nombre || '').toLowerCase().includes(b)) return false;
    return true;
  }), [ocs, filtroEstado, busqueda]);

  if (seleccionada) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setSeleccionada(null)}><ArrowLeft className="h-4 w-4 mr-2" />Volver al listado</Button>
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{seleccionada.folio}</h2>
                <Badge className={ESTADO_COLOR[seleccionada.estado]}>{seleccionada.estado}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {seleccionada.proveedor?.nombre} · Destino: {seleccionada.sucursal_destino?.codigo || '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                Creada: {seleccionada.fecha_creacion}
                {seleccionada.fecha_envio && ` · Enviada: ${seleccionada.fecha_envio}`}
                {seleccionada.fecha_recepcion_real && ` · Recibida: ${seleccionada.fecha_recepcion_real}`}
              </p>
            </div>
            <div className="flex gap-2">
              {seleccionada.estado === 'borrador' && (
                <>
                  <Button onClick={() => cambiarEstado(seleccionada, 'enviada')} className="gap-2"><Send className="h-4 w-4" />Enviar</Button>
                  <Button variant="destructive" onClick={() => cambiarEstado(seleccionada, 'cancelada')} className="gap-2"><X className="h-4 w-4" />Cancelar</Button>
                </>
              )}
              {seleccionada.estado === 'enviada' && (
                <Button onClick={() => cambiarEstado(seleccionada, 'confirmada')}>Marcar confirmada</Button>
              )}
              {['enviada', 'confirmada', 'parcial'].includes(seleccionada.estado) && (
                <Button onClick={() => setRecibirOpen(true)} className="gap-2"><PackageCheck className="h-4 w-4" />Recibir mercancía</Button>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-0 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead><TableHead>Producto</TableHead>
                <TableHead className="text-right">Solicitado</TableHead>
                <TableHead className="text-right">Recibido</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                {seleccionada.estado === 'borrador' && <TableHead></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineas.map(l => (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.producto?.sku}</TableCell>
                  <TableCell className="text-xs max-w-[300px] truncate">{l.producto?.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.cantidad_solicitada}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.cantidad_recibida}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {seleccionada.estado === 'borrador'
                      ? <Input type="number" step="0.01" defaultValue={Number(l.precio_unitario)} className="h-7 w-24 text-right text-xs"
                          onBlur={e => actualizarPrecio(l, parseFloat(e.target.value))} />
                      : `$${Number(l.precio_unitario).toFixed(2)}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">${Number(l.subtotal).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</TableCell>
                  {seleccionada.estado === 'borrador' && (
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => eliminarLinea(l)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="border-t p-4 flex justify-end gap-8">
            <div className="text-sm space-y-1 text-right">
              <p>Subtotal: <span className="tabular-nums font-medium">${Number(seleccionada.subtotal).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></p>
              <p>IVA: <span className="tabular-nums font-medium">${Number(seleccionada.iva).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span></p>
              <p className="text-lg font-bold">Total: ${Number(seleccionada.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        </Card>

        <Dialog open={recibirOpen} onOpenChange={setRecibirOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>Recibir mercancía — {seleccionada.folio}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Almacén de recepción</Label>
                <Select value={almacenSel} onValueChange={setAlmacenSel}>
                  <SelectTrigger><SelectValue placeholder="Selecciona almacén…" /></SelectTrigger>
                  <SelectContent>
                    {almacenes.map(a => <SelectItem key={a.id} value={a.id}>{a.sucursal} · {a.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Solicitado</TableHead>
                    <TableHead className="text-right">Ya recibido</TableHead>
                    <TableHead className="text-right">Recibir ahora</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineas.map(l => {
                    const pend = l.cantidad_solicitada - l.cantidad_recibida;
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{l.producto?.sku} · {l.producto?.nombre}</TableCell>
                        <TableCell className="text-right">{l.cantidad_solicitada}</TableCell>
                        <TableCell className="text-right">{l.cantidad_recibida}</TableCell>
                        <TableCell className="text-right">
                          <Input type="number" min={0} max={pend} className="h-8 w-24 text-right ml-auto"
                            value={recepciones[l.id] ?? ''}
                            onChange={e => setRecepciones(p => ({ ...p, [l.id]: parseInt(e.target.value || '0') }))} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRecibirOpen(false)}>Cancelar</Button>
              <Button onClick={ejecutarRecepcion}>Confirmar recepción</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ClipboardList className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Órdenes de Compra</h1>
            <p className="text-sm text-muted-foreground">Gestión de OCs generadas desde el Cotizador o manualmente.</p>
          </div>
        </div>
      </div>

      <Card className="p-3 flex gap-3 items-end">
        <div className="flex-1">
          <Label className="text-xs">Buscar folio o proveedor</Label>
          <Input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="OC-2026-… o nombre" />
        </div>
        <div className="w-48">
          <Label className="text-xs">Estado</Label>
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {['borrador','enviada','confirmada','parcial','recibida','cancelada'].map(e =>
                <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Folio</TableHead><TableHead>Proveedor</TableHead>
              <TableHead>Destino</TableHead><TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={6} className="text-center p-6">Cargando…</TableCell></TableRow>}
            {!loading && !filtradas.length && <TableRow><TableCell colSpan={6} className="text-center p-6 text-muted-foreground">Sin órdenes de compra.</TableCell></TableRow>}
            {filtradas.map(oc => (
              <TableRow key={oc.id} className="cursor-pointer hover:bg-accent" onClick={() => abrirDetalle(oc)}>
                <TableCell className="font-mono font-medium">{oc.folio}</TableCell>
                <TableCell>{oc.proveedor?.nombre}</TableCell>
                <TableCell>{oc.sucursal_destino?.codigo || '—'}</TableCell>
                <TableCell><Badge className={ESTADO_COLOR[oc.estado]}>{oc.estado}</Badge></TableCell>
                <TableCell className="text-xs">{oc.fecha_creacion}</TableCell>
                <TableCell className="text-right tabular-nums">${Number(oc.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
