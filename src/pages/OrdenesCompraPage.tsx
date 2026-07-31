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
import { Send, PackageCheck, X, ClipboardList, ArrowLeft, Check, ShieldCheck, Truck, RefreshCw, FileDown } from 'lucide-react';
import { toast } from 'sonner';
import { generarOcProveedorExcel, descargarBlob } from '@/lib/generarOcProveedor';

type OC = {
  id: string; folio: string; estado: string;
  fecha_creacion: string; fecha_envio: string | null; fecha_recepcion_real: string | null;
  subtotal: number; iva: number; total: number; notas: string | null;
  creada_por: string | null;
  cantidades_modificadas_gerente?: boolean;
  grupo_id?: string | null;
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
  pendiente_confirmar: 'bg-cyan-700',
  confirmada_proveedor: 'bg-teal-600',
  en_ruta: 'bg-blue-600',
  enviada: 'bg-blue-600', confirmada: 'bg-indigo-600',
  parcial: 'bg-amber-600', recibida: 'bg-emerald-600', cancelada: 'bg-rose-600',
};

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador', pendiente_aprobacion: 'Por revisar (gerente)',
  confirmada_gerente: 'Por autorizar (admin)',
  pendiente_confirmar: 'Pendiente de confirmar con proveedor',
  confirmada_proveedor: 'Confirmada con proveedor',
  en_ruta: 'En ruta',
  enviada: 'Enviada', confirmada: 'Confirmada por proveedor',
  parcial: 'Recepción parcial', recibida: 'Recibida', cancelada: 'Cancelada',
};


const ROLES_ADMIN = ['admin', 'super_admin'];
const ROLES_GERENCIA = ['gerente', 'subgerente'];
const ROLES_COMPRAS = ['compras'];
const ROLES_ALMACEN = ['almacen_ventas', 'almacen'];

type Grupo = {
  id: string; folio: string; estado: string; fecha_creacion: string; fecha_envio: string | null;
  notas: string | null; proveedor_nombre: string; proveedor_codigo: string | null;
  total_sucursales: number; pendientes_gerente: number; pendientes_admin: number;
  autorizadas: number; canceladas: number; total_consolidado: number;
};

// Vista previa de insumos dentro de la propia lista (sin entrar al detalle).
function PreviewInsumos({ lineas }: { lineas?: Linea[] }) {
  if (!lineas) return <div className="text-xs text-muted-foreground px-2 py-1">Cargando insumos…</div>;
  if (!lineas.length) return <div className="text-xs text-muted-foreground px-2 py-1">Esta orden no tiene renglones.</div>;
  const totalPiezas = lineas.reduce((s, l) => s + Number(l.cantidad_solicitada || 0), 0);
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="text-xs font-medium mb-1">
        {lineas.length} producto{lineas.length === 1 ? '' : 's'} · {totalPiezas.toLocaleString('es-MX')} pieza{totalPiezas === 1 ? '' : 's'} solicitadas
      </div>
      <div className="max-h-56 overflow-auto">
        <table className="w-full text-xs">
          <thead className="text-muted-foreground">
            <tr>
              <th className="text-left font-medium py-1 px-1">SKU</th>
              <th className="text-left font-medium py-1 px-1">Descripción</th>
              <th className="text-right font-medium py-1 px-1">Cantidad</th>
              <th className="text-right font-medium py-1 px-1">P. unitario</th>
              <th className="text-right font-medium py-1 px-1">Importe</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map(l => (
              <tr key={l.id} className="border-t">
                <td className="font-mono py-1 px-1">{l.producto?.sku || '—'}</td>
                <td className="py-1 px-1">{l.producto?.nombre || '—'}</td>
                <td className="text-right tabular-nums py-1 px-1">{Number(l.cantidad_solicitada).toLocaleString('es-MX')}</td>
                <td className="text-right tabular-nums py-1 px-1">${Number(l.precio_unitario).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
                <td className="text-right tabular-nums py-1 px-1">${Number(l.subtotal).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


export default function OrdenesCompraPage() {
  const { user, userRole } = useAuth();
  const esAdmin = !!userRole && ROLES_ADMIN.includes(userRole);
  const esGerencia = !!userRole && ROLES_GERENCIA.includes(userRole);
  const esCompras = !!userRole && ROLES_COMPRAS.includes(userRole);
  const esAlmacen = !!userRole && ROLES_ALMACEN.includes(userRole);
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
  const [recepciones, setRecepciones] = useState<Record<string, { cantidad: number; numero_lote: string; fecha_caducidad: string }>>({});
  const [almacenes, setAlmacenes] = useState<{ id: string; nombre: string; sucursal: string }[]>([]);
  const [almacenSel, setAlmacenSel] = useState<string>('');
  // Paso 2 (marcar en ruta): puede ser sobre un grupo completo o una OC individual.
  const [enRutaOpen, setEnRutaOpen] = useState<{ grupo_id?: string | null; orden_id?: string | null; folio: string } | null>(null);
  const [pagoProveedorForm, setPagoProveedorForm] = useState({ metodo_pago: 'credito' as 'credito' | 'contado', dias_credito: '30', fecha_pago_limite: '', notas: '' });
  const [confirmandoProveedor, setConfirmandoProveedor] = useState(false);
  const [tab, setTab] = useState<'grupos' | 'todas' | 'seguimiento' | 'revision_gerente' | 'autorizacion_admin' | 'trazabilidad'>('grupos');
  const [rechazoOpen, setRechazoOpen] = useState<{ oc: OC; tipo: 'gerente' | 'admin' } | null>(null);
  const [razonRechazo, setRazonRechazo] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState<string | null>(null);
  // Vista previa de insumos (punto 3): líneas precargadas por OC para mostrarlas
  // directamente en la lista del gerente, sin tener que entrar al detalle.
  const [lineasPorOc, setLineasPorOc] = useState<Record<string, Linea[]>>({});


  useEffect(() => { load(); loadAlmacenes(); if (esAdmin || esCompras) loadGrupos(); }, []);
  useEffect(() => {
    // Antes esto vivía en el useEffect de montaje (deps: []) junto con loadMisSucursales().
    // Bug real: loadMisSucursales() corta con "if (!user) return" — si la sesión de auth
    // todavía no terminaba de cargar en el primer render (muy común justo después de un
    // refresh de página), la función se salía sin hacer nada y, como el efecto nunca se
    // repetía, "misSucursales" se quedaba vacío para siempre en esa carga de página. Eso
    // hacía que "Por revisar (gerente)" pareciera vacío aunque la OC sí existiera y RLS
    // sí se la dejara ver (por eso en "Todas" sí aparecía, ya que esa consulta no depende
    // de misSucursales). Al depender explícitamente de user?.id, se vuelve a intentar en
    // cuanto la sesión termine de cargar.
    loadMisSucursales();
  }, [user?.id]);
  useEffect(() => { if (esAdmin || esCompras) loadTrazabilidad(); }, [esAdmin, esCompras]);
  useEffect(() => {
    // Refresco periódico: si alguien más genera/aprueba una OC mientras esta pantalla
    // ya estaba abierta, no había forma de enterarse sin recargar toda la página.
    const intervalo = setInterval(() => {
      load();
      if (esAdmin || esCompras) loadGrupos();
    }, 45000);
    return () => clearInterval(intervalo);
  }, [esAdmin, esCompras]);
  useEffect(() => {
    // Punto 3: en cuanto se conocen las OC pendientes de revisión/autorización,
    // se precargan sus insumos para mostrarlos en la propia lista.
    const ids = ocs
      .filter(o => o.estado === 'pendiente_aprobacion' || o.estado === 'confirmada_gerente')
      .map(o => o.id);
    if (ids.length) loadLineasPreview(ids);
  }, [ocs]);
  useEffect(() => {
    // Gerente/subgerente no tienen la pestaña "Por proveedor" (grupos) — que no se quede
    // seleccionada por defecto una pestaña que para ellos no existe.
    if (esAlmacen && !esAdmin && !esCompras && !esGerencia) setTab('seguimiento');
    else if (esGerencia && !esAdmin && !esCompras) setTab('revision_gerente');
  }, [esGerencia, esAdmin, esCompras, esAlmacen]);


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

  // Punto 3: precarga de insumos para que el gerente vea QUÉ y CUÁNTO se le
  // está pidiendo sin tener que abrir "Ver y confirmar".
  async function loadLineasPreview(ids: string[]) {
    const faltantes = ids.filter(id => !lineasPorOc[id]);
    if (!faltantes.length) return;
    const { data } = await (supabase as any)
      .from('orden_compra_lineas')
      .select('id, orden_id, producto_id, cantidad_solicitada, cantidad_recibida, precio_unitario, subtotal, producto:productos(nombre, sku)')
      .in('orden_id', faltantes);
    const map: Record<string, Linea[]> = {};
    (data || []).forEach((l: any) => {
      (map[l.orden_id] ||= []).push(l as Linea);
    });

    setLineasPorOc(prev => ({ ...prev, ...map }));
  }



  // PASO 1 del flujo con proveedor. Sustituye a la antigua RPC
  // `enviar_grupo_a_proveedor`, que fue eliminada de la base de datos porque
  // validaba estados viejos y siempre fallaba. Ahora solo pasa las órdenes de
  // `pendiente_confirmar` → `confirmada_proveedor` (sin pedir método de pago).
  async function confirmarConProveedor(args: { grupo_id?: string | null; orden_id?: string | null; folio: string }) {
    const { error } = await (supabase as any).rpc('confirmar_con_proveedor', {
      p_grupo_id: args.grupo_id || null,
      p_orden_id: args.grupo_id ? null : (args.orden_id || null),
      p_notas: null,
    });
    if (error) return toast.error(error.message);
    toast.success(`${args.folio} confirmada con el proveedor — ya se puede marcar en ruta`);
    await loadGrupos();
    await load();
    if (seleccionada) await abrirDetalle(seleccionada);
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

  async function generarExcelProveedor(oc: OC) {
    try {
      let filasFuente: { producto_id: string; sku: string; nombre: string; cantidad: number; precio_con_iva: number; sucursal_codigo: string }[] = [];

      if (oc.grupo_id) {
        const { data: hijas } = await supabase.from('ordenes_compra')
          .select('id, sucursal_destino:sucursales!sucursal_destino_id(codigo)')
          .eq('grupo_id', oc.grupo_id);
        const ids = (hijas || []).map((h: any) => h.id);
        const sucPorOc: Record<string, string> = {};
        (hijas || []).forEach((h: any) => { sucPorOc[h.id] = h.sucursal_destino?.codigo || ''; });
        const { data: lns } = await supabase.from('orden_compra_lineas')
          .select('orden_id, producto_id, cantidad_solicitada, precio_con_iva, producto:productos(sku, nombre)')
          .in('orden_id', ids);
        filasFuente = (lns || []).map((l: any) => ({
          producto_id: l.producto_id, sku: l.producto?.sku || '', nombre: l.producto?.nombre || '',
          cantidad: l.cantidad_solicitada, precio_con_iva: l.precio_con_iva,
          sucursal_codigo: sucPorOc[l.orden_id] || '',
        }));
      } else {
        filasFuente = lineas.map(l => ({
          producto_id: l.producto_id, sku: l.producto?.sku || '', nombre: l.producto?.nombre || '',
          cantidad: l.cantidad_solicitada, precio_con_iva: l.precio_unitario,
          sucursal_codigo: oc.sucursal_destino?.codigo || '',
        }));
      }

      const porProducto = new Map<string, { sku: string; nombre: string; piezas: number; precioConIva: number; reparto: Record<string, number> }>();
      for (const f of filasFuente) {
        const acc = porProducto.get(f.producto_id) || { sku: f.sku, nombre: f.nombre, piezas: 0, precioConIva: f.precio_con_iva, reparto: {} };
        acc.piezas += f.cantidad;
        if (f.sucursal_codigo) acc.reparto[f.sucursal_codigo] = (acc.reparto[f.sucursal_codigo] || 0) + f.cantidad;
        porProducto.set(f.producto_id, acc);
      }

      const sucursales = Array.from(new Set(filasFuente.map(f => f.sucursal_codigo).filter(Boolean)));
      const blob = await generarOcProveedorExcel({
        proveedorNombre: oc.proveedor?.nombre || '',
        numeroOC: oc.folio,
        condicionesPago: 'Por confirmar con proveedor',
        sucursalDestinoTexto: sucursales.length > 1 ? sucursales.join(' / ') : (sucursales[0] || oc.sucursal_destino?.codigo || ''),
        folioCotizacion: '',
        lineas: Array.from(porProducto.values()).map(p => ({ sku: p.sku, nombre: p.nombre, piezas: p.piezas, precioConIva: p.precioConIva, reparto: p.reparto })),
      });
      descargarBlob(blob, `${oc.folio}_orden_compra.xlsx`);
    } catch (e: any) {
      toast.error('No se pudo generar el archivo: ' + e.message);
    }
  }

  // PASO 2: abre el formulario de método de pago para marcar en ruta.
  function abrirEnRuta(args: { grupo_id?: string | null; orden_id?: string | null; folio: string }) {
    setEnRutaOpen(args);
    setPagoProveedorForm({ metodo_pago: 'credito', dias_credito: '30', fecha_pago_limite: '', notas: '' });
  }

  async function confirmarProveedor() {
    if (!enRutaOpen) return;
    setConfirmandoProveedor(true);
    const target = enRutaOpen;
    const { data, error } = await (supabase as any).rpc('confirmar_envio_proveedor', {
      p_grupo_id: target.grupo_id || null,
      p_orden_id: target.grupo_id ? null : (target.orden_id || null),
      p_metodo_pago: pagoProveedorForm.metodo_pago,
      p_dias_credito: pagoProveedorForm.metodo_pago === 'credito' ? Number(pagoProveedorForm.dias_credito) : null,
      p_fecha_pago_limite: pagoProveedorForm.fecha_pago_limite || null,
      p_notas: pagoProveedorForm.notas || null,
    });
    setConfirmandoProveedor(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Marcada en ruta — compra ${data?.numero_compra} creada en Cuentas por Pagar`);
    setEnRutaOpen(null);
    await loadGrupos();
    await load();
    if (seleccionada) abrirDetalle(seleccionada);
  }


  async function ejecutarRecepcion() {
    if (!seleccionada || !almacenSel) { toast.error('Selecciona almacén'); return; }
    const items = Object.entries(recepciones)
      .filter(([, r]) => r.cantidad > 0)
      .map(([linea_id, r]) => ({
        linea_id, cantidad: r.cantidad,
        numero_lote: r.numero_lote || undefined,
        fecha_caducidad: r.fecha_caducidad || undefined,
      }));
    if (!items.length) { toast.error('Captura al menos una cantidad'); return; }
    const sinCaducidad = items.filter(i => !i.fecha_caducidad);
    if (sinCaducidad.length) { toast.error('Captura la fecha de caducidad de cada producto recibido'); return; }
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
              {(seleccionada.estado === 'pendiente_confirmar' || seleccionada.estado === 'confirmada_proveedor') && (esAdmin || esCompras) && (
                <>
                  <Button variant="outline" className="gap-2" onClick={() => generarExcelProveedor(seleccionada)}>
                    <FileDown className="h-4 w-4" />Generar OC (Excel)
                  </Button>
                  <Button
                    className="gap-2 bg-teal-600 hover:bg-teal-700"
                    disabled={seleccionada.estado !== 'pendiente_confirmar'}
                    onClick={() => confirmarConProveedor({ orden_id: seleccionada.id, folio: seleccionada.folio })}>
                    <Check className="h-4 w-4" />1. Confirmar con proveedor
                  </Button>
                  <Button
                    className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                    disabled={seleccionada.estado !== 'confirmada_proveedor'}
                    onClick={() => abrirEnRuta({ orden_id: seleccionada.id, folio: seleccionada.folio })}>
                    <Truck className="h-4 w-4" />2. Marcar en ruta
                  </Button>
                </>
              )}

              {!esAlmacen && seleccionada.estado === 'borrador' && (
                <>
                  <Button onClick={() => cambiarEstado(seleccionada, 'enviada')} className="gap-2"><Send className="h-4 w-4" />Enviar</Button>
                  <Button variant="destructive" onClick={() => cambiarEstado(seleccionada, 'cancelada')} className="gap-2"><X className="h-4 w-4" />Cancelar</Button>
                </>
              )}
              {!esAlmacen && seleccionada.estado === 'enviada' && (
                <Button onClick={() => cambiarEstado(seleccionada, 'confirmada')}>Marcar confirmada</Button>
              )}
              {['en_ruta', 'enviada', 'confirmada', 'parcial'].includes(seleccionada.estado) && (
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
                    <TableHead>No. de lote</TableHead>
                    <TableHead>Caducidad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineas.map(l => {
                    const pend = l.cantidad_solicitada - l.cantidad_recibida;
                    const r = recepciones[l.id] || { cantidad: 0, numero_lote: '', fecha_caducidad: '' };
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">{l.producto?.sku} · {l.producto?.nombre}</TableCell>
                        <TableCell className="text-right">{l.cantidad_solicitada}</TableCell>
                        <TableCell className="text-right">{l.cantidad_recibida}</TableCell>
                        <TableCell className="text-right">
                          <Input type="number" min={0} max={pend} className="h-8 w-20 text-right ml-auto"
                            value={r.cantidad || ''}
                            onChange={e => setRecepciones(p => ({ ...p, [l.id]: { ...r, cantidad: parseInt(e.target.value || '0') } }))} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 w-32" placeholder="Lote"
                            value={r.numero_lote}
                            onChange={e => setRecepciones(p => ({ ...p, [l.id]: { ...r, numero_lote: e.target.value } }))} />
                        </TableCell>
                        <TableCell>
                          <Input type="date" className="h-8 w-36"
                            value={r.fecha_caducidad}
                            onChange={e => setRecepciones(p => ({ ...p, [l.id]: { ...r, fecha_caducidad: e.target.value } }))} />
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

        <Dialog open={!!enRutaOpen} onOpenChange={o => !o && setEnRutaOpen(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Marcar en ruta — {enRutaOpen?.folio}</DialogTitle></DialogHeader>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Esto se hace cuando ya quedaron de acuerdo con el proveedor en cómo y cuándo se paga, y el pedido
                ya va en camino. Se crea el registro en Cuentas por Pagar y la orden pasa a "En ruta".
              </p>
              <div>
                <Label className="text-xs">Forma de pago</Label>
                <Select value={pagoProveedorForm.metodo_pago} onValueChange={(v: 'credito' | 'contado') => setPagoProveedorForm({ ...pagoProveedorForm, metodo_pago: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credito">Crédito</SelectItem>
                    <SelectItem value="contado">Contado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {pagoProveedorForm.metodo_pago === 'credito' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Días de crédito</Label>
                    <Input type="number" value={pagoProveedorForm.dias_credito}
                      onChange={e => setPagoProveedorForm({ ...pagoProveedorForm, dias_credito: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-xs">Fecha límite de pago (opcional)</Label>
                    <Input type="date" value={pagoProveedorForm.fecha_pago_limite}
                      onChange={e => setPagoProveedorForm({ ...pagoProveedorForm, fecha_pago_limite: e.target.value })} />
                  </div>
                </div>
              )}
              <div>
                <Label className="text-xs">Notas (opcional)</Label>
                <Textarea rows={2} value={pagoProveedorForm.notas}
                  onChange={e => setPagoProveedorForm({ ...pagoProveedorForm, notas: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEnRutaOpen(null)}>Cancelar</Button>
              <Button onClick={confirmarProveedor} disabled={confirmandoProveedor} className="bg-emerald-600 hover:bg-emerald-700">
                {confirmandoProveedor ? 'Procesando...' : 'Marcar en ruta'}

              </Button>
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
        <Button
          variant="outline" size="sm" className="gap-2"
          onClick={() => { load(); if (esAdmin || esCompras) { loadGrupos(); loadTrazabilidad(); } }}
        >
          <RefreshCw className="h-4 w-4" /> Refrescar
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => {
        setTab(v as any);
        // Antes solo se cargaba una vez al entrar a la pantalla — si una OC nueva llegaba
        // mientras la pantalla ya estaba abierta, no aparecía hasta recargar la página entera.
        load();
        if (v === 'grupos' && (esAdmin || esCompras)) loadGrupos();
        if (v === 'trazabilidad' && (esAdmin || esCompras)) loadTrazabilidad();
      }}>
        <TabsList>
          {(esAdmin || esCompras) && (
            <TabsTrigger value="grupos" className="gap-2"><Truck className="h-4 w-4" /> Por proveedor</TabsTrigger>
          )}
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

        {(esAdmin || esCompras) && (
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
                        g.estado === 'confirmada_proveedor' ? 'bg-teal-600' :
                        g.estado === 'lista_para_enviar' ? 'bg-blue-600' :
                        g.estado === 'cancelada' ? 'bg-rose-600' : 'bg-amber-600'
                      }>
                        {g.estado === 'en_revision' ? 'En revisión de sucursales' :
                         g.estado === 'lista_para_enviar' ? 'Lista para confirmar' :
                         g.estado === 'confirmada_proveedor' ? 'Confirmada con proveedor' :
                         g.estado === 'enviada' ? 'En ruta / enviada al proveedor' : 'Cancelada'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      ${Number(g.total_consolidado).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      {(esAdmin || esCompras) && (g.estado === 'lista_para_enviar' || g.estado === 'confirmada_proveedor') && (
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"
                            disabled={g.estado !== 'lista_para_enviar'}
                            onClick={() => confirmarConProveedor({ grupo_id: g.id, folio: g.folio })}>
                            <Check className="h-3.5 w-3.5" /> 1. Confirmar con proveedor
                          </Button>
                          <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                            disabled={g.estado !== 'confirmada_proveedor'}
                            onClick={() => abrirEnRuta({ grupo_id: g.id, folio: g.folio })}>
                            <Truck className="h-3.5 w-3.5" /> 2. Marcar en ruta
                          </Button>
                        </div>
                      )}
                      {g.estado !== 'lista_para_enviar' && g.estado !== 'confirmada_proveedor' && (
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
        )}

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
