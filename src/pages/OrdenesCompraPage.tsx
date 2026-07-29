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
import { Send, PackageCheck, X, ClipboardList, ArrowLeft, Check, ShieldCheck, Truck } from 'lucide-react';
import { toast } from 'sonner';

type OC = {
  id: string; folio: string; estado: string;
  fecha_creacion: string; fecha_envio: string | null; fecha_recepcion_real: string | null;
  subtotal: number; iva: number; total: number; notas: string | null;
  creada_por: string | null;
  cantidades_modificadas_gerente?: boolean;
  proveedor: { nombre: string; codigo: string | null } | null;
  sucursal_destino: { codigo: string; nombre: string } | null;
  sucursal_destino_id: string | null;
  comprador?: { nombre: string | null; username: string | null } | null;
};
type Trazabilidad = {
  id: string; folio: string; estado: string; total: number;
  proveedor_nombre: string | null;
  sucursal_nombre: string | null; sucursal_codigo: string | null;
  creada_por_nombre: string | null; fecha_creacion: string | null;
  revisada_por_gerente_nombre: string | null; fecha_revision_gerente: string | null;
  cantidades_modificadas_gerente: boolean; num_ajustes: number;
  autorizada_por_nombre: string | null; fecha_autorizacion: string | null;
  razon_aprobacion: string | null;
};
type Linea = {
  id: string; producto_id: string; cantidad_solicitada: number; cantidad_recibida: number;
  precio_unitario: number; subtotal: number;
  producto: { nombre: string; sku: string } | null;
};

const ESTADO_COLOR: Record<string, string> = {
  borrador: 'bg-slate-500', pendiente_aprobacion: 'bg-amber-600',
  confirmada_gerente: 'bg-purple-600',
  enviada: 'bg-blue-600', confirmada: 'bg-indigo-600',
  parcial: 'bg-amber-600', recibida: 'bg-emerald-600', cancelada: 'bg-rose-600',
};

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador', pendiente_aprobacion: 'Por revisar (gerente)',
  confirmada_gerente: 'Por autorizar (admin)',
  enviada: 'Enviada', confirmada: 'Confirmada por proveedor',
  parcial: 'Recepción parcial', recibida: 'Recibida', cancelada: 'Cancelada',
};

const ROLES_ADMIN = ['admin', 'super_admin'];
const ROLES_GERENCIA = ['gerente', 'subgerente'];
const ROLES_COMPRAS = ['compras'];

type Grupo = {
  id: string; folio: string; estado: string; fecha_creacion: string; fecha_envio: string | null;
  notas: string | null; proveedor_nombre: string; proveedor_codigo: string | null;
  total_sucursales: number; pendientes_gerente: number; pendientes_admin: number;
  autorizadas: number; canceladas: number; total_consolidado: number;
};

export default function OrdenesCompraPage() {
  const { user, userRole } = useAuth();
  const esAdmin = !!userRole && ROLES_ADMIN.includes(userRole);
  const esGerencia = !!userRole && ROLES_GERENCIA.includes(userRole);
  const esCompras = !!userRole && ROLES_COMPRAS.includes(userRole);
  const [misSucursales, setMisSucursales] = useState<string[]>([]);
  const [ocs, setOcs] = useState<OC[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [trazabilidad, setTrazabilidad] = useState<Trazabilidad[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<string>('all');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionada, setSeleccionada] = useState<OC | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [lineasEditadas, setLineasEditadas] = useState<Record<string, number>>({});
  const [recibirOpen, setRecibirOpen] = useState(false);
  const [recepciones, setRecepciones] = useState<Record<string, number>>({});
  const [almacenes, setAlmacenes] = useState<{ id: string; nombre: string; sucursal: string }[]>([]);
  const [almacenSel, setAlmacenSel] = useState<string>('');
  const [tab, setTab] = useState<'grupos' | 'todas' | 'revision_gerente' | 'autorizacion_admin' | 'trazabilidad'>('grupos');
  const [rechazoOpen, setRechazoOpen] = useState<{ oc: OC; tipo: 'gerente' | 'admin' } | null>(null);
  const [razonRechazo, setRazonRechazo] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState<string | null>(null);

  useEffect(() => { load(); loadAlmacenes(); loadMisSucursales(); loadGrupos(); }, []);
  useEffect(() => { if (esAdmin || esCompras) loadTrazabilidad(); }, [esAdmin, esCompras]);

  async function loadGrupos() {
    const { data } = await (supabase as any).from('v_ordenes_compra_grupo_resumen').select('*').order('fecha_creacion', { ascending: false });
    setGrupos((data || []) as Grupo[]);
  }

  async function loadTrazabilidad() {
    const { data } = await (supabase as any)
      .from('v_ordenes_compra_trazabilidad')
      .select('*')
      .order('fecha_creacion', { ascending: false })
      .limit(200);
    setTrazabilidad((data || []) as Trazabilidad[]);
  }

  async function enviarGrupoAProveedor(g: Grupo) {
    const { error } = await (supabase as any).rpc('enviar_grupo_a_proveedor', { p_grupo_id: g.id });
    if (error) return toast.error(error.message);
    toast.success(`${g.folio} enviada al proveedor ${g.proveedor_nombre}`);
    await loadGrupos();
    await load();
  }

  async function loadMisSucursales() {
    if (!user) return;
    const { data } = await supabase.from('user_sucursal_asignacion').select('sucursal_id').eq('user_id', user.id);
    setMisSucursales((data || []).map((r: any) => r.sucursal_id));
  }

  // ¿Puede revisar (como gerente) esta OC específica? admin/super_admin siempre;
  // gerente/subgerente solo si están asignados a la sucursal destino de la OC.
  function puedeRevisarComoGerente(oc: OC): boolean {
    if (esAdmin) return true;
    if (esGerencia && oc.sucursal_destino_id) return misSucursales.includes(oc.sucursal_destino_id);
    return false;
  }

  async function revisarComoGerente(oc: OC, accion: 'confirmar' | 'rechazar', razon?: string) {
    const lineasPayload = accion === 'confirmar' && Object.keys(lineasEditadas).length
      ? Object.entries(lineasEditadas).map(([linea_id, cantidad_solicitada]) => ({ linea_id, cantidad_solicitada }))
      : null;
    const { data, error } = await (supabase as any).rpc('revisar_oc_gerente', {
      p_oc_id: oc.id, p_accion: accion, p_lineas: lineasPayload, p_razon: razon || null,
    });
    if (error) return toast.error(error.message);
    toast.success(accion === 'confirmar' ? `${oc.folio} confirmada — pasa a autorización de administración` : `${oc.folio} rechazada`);
    setLineasEditadas({});
    setSeleccionada(null);
    await load();
    await loadGrupos();
    if (esAdmin || esCompras) await loadTrazabilidad();
  }

  async function autorizarComoAdmin(oc: OC, accion: 'autorizar' | 'rechazar', razon?: string) {
    const { data, error } = await (supabase as any).rpc('autorizar_oc_admin', {
      p_oc_id: oc.id, p_accion: accion, p_razon: razon || null,
    });
    if (error) return toast.error(error.message);
    toast.success(accion === 'autorizar' ? `${oc.folio} autorizada — ya se puede editar y enviar` : `${oc.folio} rechazada`);
    setSeleccionada(null);
    await load();
    await loadGrupos();
    if (esAdmin || esCompras) await loadTrazabilidad();
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('ordenes_compra')
      .select(`id, folio, estado, fecha_creacion, fecha_envio, fecha_recepcion_real, subtotal, iva, total, notas,
               sucursal_destino_id, grupo_id, cantidades_modificadas_gerente,
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
    setLineasEditadas({});
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
    if (filtroGrupo && (o as any).grupo_id !== filtroGrupo) return false;
    const b = busqueda.toLowerCase();
    if (b && !o.folio.toLowerCase().includes(b) && !(o.proveedor?.nombre || '').toLowerCase().includes(b)) return false;
    return true;
  }), [ocs, filtroEstado, busqueda, filtroGrupo]);

  if (seleccionada) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setSeleccionada(null)}><ArrowLeft className="h-4 w-4 mr-2" />Volver al listado</Button>
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{seleccionada.folio}</h2>
                <Badge className={ESTADO_COLOR[seleccionada.estado]}>{ESTADO_LABEL[seleccionada.estado] || seleccionada.estado}</Badge>
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
              {seleccionada.estado === 'pendiente_aprobacion' && puedeRevisarComoGerente(seleccionada) && (
                <>
                  <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => revisarComoGerente(seleccionada, 'confirmar')}>
                    <Check className="h-4 w-4" />Confirmar y enviar a autorización
                  </Button>
                  <Button variant="destructive" className="gap-2" onClick={() => setRechazoOpen({ oc: seleccionada, tipo: 'gerente' })}>
                    <X className="h-4 w-4" />Rechazar
                  </Button>
                </>
              )}
              {seleccionada.estado === 'confirmada_gerente' && esAdmin && (
                <>
                  <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => autorizarComoAdmin(seleccionada, 'autorizar')}>
                    <ShieldCheck className="h-4 w-4" />Autorizar compra
                  </Button>
                  <Button variant="destructive" className="gap-2" onClick={() => setRechazoOpen({ oc: seleccionada, tipo: 'admin' })}>
                    <X className="h-4 w-4" />Rechazar
                  </Button>
                </>
              )}
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
              {lineas.map(l => {
                const enRevisionGerente = seleccionada.estado === 'pendiente_aprobacion' && puedeRevisarComoGerente(seleccionada);
                return (
                <TableRow key={l.id}>
                  <TableCell className="font-mono text-xs">{l.producto?.sku}</TableCell>
                  <TableCell className="text-xs max-w-[300px] truncate">{l.producto?.nombre}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {enRevisionGerente
                      ? <Input type="number" min={0} defaultValue={l.cantidad_solicitada} className="h-7 w-20 text-right text-xs ml-auto"
                          onChange={e => setLineasEditadas(p => ({ ...p, [l.id]: parseInt(e.target.value || '0') }))} />
                      : l.cantidad_solicitada}
                  </TableCell>
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
                );
              })}
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

  const pendientesRevisionGerente = ocs.filter(o => o.estado === 'pendiente_aprobacion' && puedeRevisarComoGerente(o));
  const pendientesAutorizacionAdmin = esAdmin ? ocs.filter(o => o.estado === 'confirmada_gerente') : [];

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

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="grupos" className="gap-2"><Truck className="h-4 w-4" /> Por proveedor</TabsTrigger>
          <TabsTrigger value="todas">Todas</TabsTrigger>
          {pendientesRevisionGerente.length > 0 || esGerencia || esAdmin ? (
            <TabsTrigger value="revision_gerente" className="gap-2">
              <ShieldCheck className="h-4 w-4" /> Por revisar (gerente)
              {pendientesRevisionGerente.length > 0 && <Badge variant="destructive" className="ml-1">{pendientesRevisionGerente.length}</Badge>}
            </TabsTrigger>
          ) : null}
          {esAdmin && (
            <TabsTrigger value="autorizacion_admin" className="gap-2">
              <ShieldCheck className="h-4 w-4" /> Por autorizar (admin)
              {pendientesAutorizacionAdmin.length > 0 && <Badge variant="destructive" className="ml-1">{pendientesAutorizacionAdmin.length}</Badge>}
            </TabsTrigger>
          )}
          {(esAdmin || esCompras) && (
            <TabsTrigger value="trazabilidad" className="gap-2">
              <ClipboardList className="h-4 w-4" /> Trazabilidad
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="grupos">
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folio (OC real)</TableHead><TableHead>Proveedor</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-center">Sucursales</TableHead>
                  <TableHead>Estado del grupo</TableHead>
                  <TableHead className="text-right">Total consolidado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!grupos.length && <TableRow><TableCell colSpan={7} className="text-center p-6 text-muted-foreground">No hay órdenes generadas desde el Cotizador todavía.</TableCell></TableRow>}
                {grupos.map(g => (
                  <TableRow key={g.id}>
                    <TableCell className="font-mono font-medium">{g.folio}</TableCell>
                    <TableCell>{g.proveedor_nombre}</TableCell>
                    <TableCell className="text-xs">{g.fecha_creacion}</TableCell>
                    <TableCell className="text-center text-xs">
                      <button className="underline decoration-dotted" onClick={() => { setFiltroGrupo(g.id); setTab('todas'); }}>
                        {g.total_sucursales} sucursal{g.total_sucursales === 1 ? '' : 'es'}
                      </button>
                      <div className="text-muted-foreground mt-0.5">
                        {g.pendientes_gerente > 0 && <span>{g.pendientes_gerente} por revisar · </span>}
                        {g.pendientes_admin > 0 && <span>{g.pendientes_admin} por autorizar · </span>}
                        {g.autorizadas > 0 && <span>{g.autorizadas} autorizada{g.autorizadas === 1 ? '' : 's'}</span>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        g.estado === 'enviada' ? 'bg-emerald-600' :
                        g.estado === 'lista_para_enviar' ? 'bg-blue-600' :
                        g.estado === 'cancelada' ? 'bg-rose-600' : 'bg-amber-600'
                      }>
                        {g.estado === 'en_revision' ? 'En revisión de sucursales' :
                         g.estado === 'lista_para_enviar' ? 'Lista para enviar' :
                         g.estado === 'enviada' ? 'Enviada al proveedor' : 'Cancelada'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      ${Number(g.total_consolidado).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      {esAdmin && g.estado === 'lista_para_enviar' && (
                        <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => enviarGrupoAProveedor(g)}>
                          <Send className="h-3.5 w-3.5" /> Enviar al proveedor
                        </Button>
                      )}
                      {g.estado !== 'lista_para_enviar' && (
                        <Button size="sm" variant="outline" onClick={() => { setFiltroGrupo(g.id); setTab('todas'); }}>
                          Ver sucursales
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="todas" className="space-y-4">
          {filtroGrupo && (
            <div className="flex items-center gap-2 text-sm bg-accent rounded-md px-3 py-2">
              <span>Filtrando por: {grupos.find(g => g.id === filtroGrupo)?.folio}</span>
              <Button size="sm" variant="ghost" onClick={() => setFiltroGrupo(null)}>Quitar filtro</Button>
            </div>
          )}
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
                  {['borrador','pendiente_aprobacion','confirmada_gerente','enviada','confirmada','parcial','recibida','cancelada'].map(e =>
                    <SelectItem key={e} value={e}>{ESTADO_LABEL[e] || e}</SelectItem>)}
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
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge className={ESTADO_COLOR[oc.estado]}>{ESTADO_LABEL[oc.estado] || oc.estado}</Badge>
                        {oc.cantidades_modificadas_gerente && (
                          <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">Modificada</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{oc.fecha_creacion}</TableCell>
                    <TableCell className="text-right tabular-nums">${Number(oc.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="revision_gerente">
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folio</TableHead><TableHead>Proveedor</TableHead>
                  <TableHead>Destino</TableHead><TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!pendientesRevisionGerente.length && <TableRow><TableCell colSpan={6} className="text-center p-6 text-muted-foreground">No hay OCs pendientes de tu revisión.</TableCell></TableRow>}
                {pendientesRevisionGerente.map(oc => (
                  <TableRow key={oc.id}>
                    <TableCell className="font-mono font-medium">{oc.folio}</TableCell>
                    <TableCell>{oc.proveedor?.nombre}</TableCell>
                    <TableCell>{oc.sucursal_destino?.codigo || '—'}</TableCell>
                    <TableCell className="text-xs">{oc.fecha_creacion}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      ${Number(oc.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button size="sm" variant="outline" onClick={() => abrirDetalle(oc)}>Ver y confirmar</Button>
                        <Button size="sm" variant="destructive" className="gap-1" onClick={() => setRechazoOpen({ oc, tipo: 'gerente' })}>
                          <X className="h-3.5 w-3.5" /> Rechazar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {esAdmin && (
          <TabsContent value="autorizacion_admin">
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio</TableHead><TableHead>Proveedor</TableHead>
                    <TableHead>Destino</TableHead><TableHead>Confirmada por</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!pendientesAutorizacionAdmin.length && <TableRow><TableCell colSpan={6} className="text-center p-6 text-muted-foreground">No hay OCs pendientes de autorización final.</TableCell></TableRow>}
                  {pendientesAutorizacionAdmin.map(oc => (
                    <TableRow key={oc.id}>
                      <TableCell className="font-mono font-medium">{oc.folio}</TableCell>
                      <TableCell>{oc.proveedor?.nombre}</TableCell>
                      <TableCell>{oc.sucursal_destino?.codigo || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        Gerente de sucursal
                        {oc.cantidades_modificadas_gerente && (
                          <Badge variant="outline" className="ml-1.5 text-[10px] border-amber-500 text-amber-600">Modificó cantidades</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        ${Number(oc.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" variant="outline" onClick={() => abrirDetalle(oc)}>Ver detalle</Button>
                          <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700" onClick={() => autorizarComoAdmin(oc, 'autorizar')}>
                            <Check className="h-3.5 w-3.5" /> Autorizar
                          </Button>
                          <Button size="sm" variant="destructive" className="gap-1" onClick={() => setRechazoOpen({ oc, tipo: 'admin' })}>
                            <X className="h-3.5 w-3.5" /> Rechazar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        )}

        {(esAdmin || esCompras) && (
          <TabsContent value="trazabilidad">
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio</TableHead><TableHead>Proveedor</TableHead><TableHead>Destino</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Creada por</TableHead>
                    <TableHead>Revisada por (gerente)</TableHead>
                    <TableHead>Autorizada por</TableHead>
                    <TableHead className="text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!trazabilidad.length && <TableRow><TableCell colSpan={8} className="text-center p-6 text-muted-foreground">Sin datos de trazabilidad todavía.</TableCell></TableRow>}
                  {trazabilidad.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="font-mono font-medium">{t.folio}</TableCell>
                      <TableCell>{t.proveedor_nombre || '—'}</TableCell>
                      <TableCell>{t.sucursal_codigo || '—'}</TableCell>
                      <TableCell><Badge className={ESTADO_COLOR[t.estado]}>{ESTADO_LABEL[t.estado] || t.estado}</Badge></TableCell>
                      <TableCell className="text-xs">{t.creada_por_nombre || '—'}</TableCell>
                      <TableCell className="text-xs">
                        {t.revisada_por_gerente_nombre || '—'}
                        {t.cantidades_modificadas_gerente && (
                          <div className="mt-0.5">
                            <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">
                              Modificó {t.num_ajustes} línea{t.num_ajustes === 1 ? '' : 's'}
                            </Badge>
                          </div>
                        )}
                        {t.razon_aprobacion && <div className="text-muted-foreground mt-0.5 max-w-[220px] truncate" title={t.razon_aprobacion}>{t.razon_aprobacion}</div>}
                      </TableCell>
                      <TableCell className="text-xs">{t.autorizada_por_nombre || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        ${Number(t.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={!!rechazoOpen} onOpenChange={(o) => { if (!o) { setRechazoOpen(null); setRazonRechazo(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rechazar {rechazoOpen?.oc.folio}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Razón del rechazo (obligatoria)</Label>
            <Textarea value={razonRechazo} onChange={e => setRazonRechazo(e.target.value)} rows={4} placeholder="Ej. Monto excede presupuesto trimestral, proveedor en revisión…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRechazoOpen(null); setRazonRechazo(''); }}>Cancelar</Button>
            <Button variant="destructive" onClick={() => {
              if (!rechazoOpen || !razonRechazo.trim()) { toast.error('Razón obligatoria'); return; }
              if (rechazoOpen.tipo === 'gerente') revisarComoGerente(rechazoOpen.oc, 'rechazar', razonRechazo.trim());
              else autorizarComoAdmin(rechazoOpen.oc, 'rechazar', razonRechazo.trim());
              setRechazoOpen(null); setRazonRechazo('');
            }}>Confirmar rechazo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
