import React, { Fragment, useEffect, useMemo, useState } from 'react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Send, PackageCheck, Package, X, ClipboardList, ArrowLeft, Check, ShieldCheck, Truck, RefreshCw, FileDown, ChevronDown, ChevronRight, Loader2, Receipt, FileUp, FileText, Plus, FileMinus, Printer, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { generarOcProveedorExcel, descargarBlob } from '@/lib/generarOcProveedor';

type OC = {
  id: string; folio: string; estado: string;
  fecha_creacion: string; fecha_envio: string | null; fecha_recepcion_real: string | null;
  fecha_estimada_entrega?: string | null;
  llego_fisicamente?: boolean;
  llego_fisicamente_en?: string | null;
  subtotal: number; iva: number; total: number; notas: string | null;
  creada_por: string | null;
  cantidades_modificadas_gerente?: boolean;
  grupo_id?: string | null;
  compra_real_id?: string | null;
  proveedor: { nombre: string; codigo: string | null } | null;
  sucursal_destino: { codigo: string; nombre: string } | null;
  sucursal_destino_id: string | null;
  comprador?: { nombre: string | null; username: string | null } | null;
};
type Factura = {
  id: string; orden_id: string; folio: string; fecha_factura: string | null;
  importe: number | null; pdf_path: string | null; xml_path: string | null;
  created_at: string;
  dias_credito?: number | null;
  fecha_limite_pago?: string | null;
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
  parcial: 'bg-amber-600', recibida: 'bg-emerald-600',
  recibida_pend_factura: 'bg-orange-600',
  cancelada: 'bg-rose-600',
};

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Borrador', pendiente_aprobacion: 'Por revisar (gerente)',
  confirmada_gerente: 'Por autorizar (admin)',
  pendiente_confirmar: 'Pendiente de confirmar con proveedor',
  confirmada_proveedor: 'Confirmada con proveedor',
  en_ruta: 'En ruta',
  enviada: 'Enviada', confirmada: 'Confirmada por proveedor',
  parcial: 'Recepción parcial (aceptada en inventario)',
  recibida: 'Recibida y aceptada en inventario',
  recibida_pend_factura: 'Recibida — pendiente de ligar factura',
  cancelada: 'Cancelada',
};



// Rediseño: etapas visuales del flujo de una OC, para que cualquier rol
// (admin, gerente, almacenista) entienda de un vistazo en qué momento va,
// sin tener que interpretar el nombre técnico del estado.
const PIPELINE_ETAPAS = ['Revisión', 'Autorización', 'Con proveedor', 'En ruta', 'Recibido'] as const;
function pipelineIndice(estado: string): number {
  switch (estado) {
    case 'borrador':
    case 'pendiente_aprobacion': return 0;
    case 'confirmada_gerente': return 1;
    case 'pendiente_confirmar':
    case 'confirmada_proveedor': return 2;
    case 'en_ruta':
    case 'enviada': return 3;
    case 'confirmada':
    case 'parcial':
    case 'recibida_pend_factura':
    case 'recibida': return 4;
    default: return -1; // cancelada u otro estado terminal negativo
  }
}

// Barra compacta de etapas — se usa en todas las listas y en el detalle para
// que "en qué va" se lea igual en Por revisar, Mi sucursal, Todas, etc.
function PipelineOC({ estado, className = '' }: { estado: string; className?: string }) {
  if (estado === 'cancelada') {
    return <Badge className="bg-rose-600">Cancelada</Badge>;
  }
  const idx = pipelineIndice(estado);
  return (
    <div className={`flex items-center gap-1 ${className}`} title={ESTADO_LABEL[estado] || estado}>
      {PIPELINE_ETAPAS.map((etapa, i) => {
        const completada = i < idx;
        const actual = i === idx;
        return (
          <div key={etapa} className="flex items-center gap-1">
            <div
              className={
                'h-2 w-2 rounded-full shrink-0 ' +
                (completada ? 'bg-emerald-500' : actual ? 'bg-blue-600 ring-2 ring-blue-200' : 'bg-slate-200')
              }
            />
            {i < PIPELINE_ETAPAS.length - 1 && (
              <div className={'h-0.5 w-4 ' + (completada ? 'bg-emerald-500' : 'bg-slate-200')} />
            )}
          </div>
        );
      })}
      <span className={'ml-1.5 text-xs font-medium ' + (idx === 4 ? 'text-emerald-700' : 'text-muted-foreground')}>
        {PIPELINE_ETAPAS[idx] ?? '—'}
        {estado === 'parcial' && ' (parcial)'}
      </span>
    </div>
  );
}

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

// Si algo truena durante el render (ej. un dato inesperado del backend), sin
// esto React desmonta el árbol entero y deja la pantalla en blanco sin ningún
// mensaje — justo el síntoma reportado al entrar a autorizar OCs de gerentes.
// Con esto se ve un aviso y un botón para reintentar en vez de blanco total.
class OcErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('OrdenesCompraPage: error de render', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-6">
          <Card className="p-6 text-center space-y-3">
            <p className="font-semibold text-destructive">Ocurrió un error al mostrar Órdenes de Compra.</p>
            <p className="text-sm text-muted-foreground break-words">{this.state.error.message}</p>
            <Button onClick={() => { this.setState({ error: null }); window.location.reload(); }}>Reintentar</Button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}

// Estatus visual de cada sucursal dentro de un grupo (proveedor): una bolita
// por sucursal con su código, coloreada según en qué parte del flujo va, para
// identificar de un vistazo quién ya aprobó y quién no sin tener que expandir
// cada grupo.
type HijaGrupo = { sucursal_codigo: string; estado: string; cantidades_modificadas_gerente: boolean; llego_fisicamente?: boolean };
function SucursalDots({ hijas }: { hijas?: HijaGrupo[] }) {
  if (!hijas || !hijas.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {hijas.map((h, i) => {
        const modificada = h.cantidades_modificadas_gerente;
        const recibida = h.estado === 'recibida' || h.estado === 'parcial';
        const yaLlego = !recibida && !!h.llego_fisicamente;
        const color = h.estado === 'cancelada' ? 'bg-rose-500'
          : recibida ? 'bg-blue-600'
          : h.estado === 'pendiente_aprobacion' ? 'bg-slate-300'
          : h.estado === 'confirmada_gerente' ? 'bg-amber-500'
          : 'bg-emerald-500';
        const label = h.estado === 'cancelada' ? 'Cancelada'
          : h.estado === 'recibida' ? 'Ya recibió y aceptó en inventario'
          : h.estado === 'parcial' ? 'Recibió parcialmente'
          : h.estado === 'pendiente_aprobacion' ? 'Pendiente de revisión del gerente'
          : h.estado === 'confirmada_gerente' ? 'Revisada por el gerente — pendiente de autorizar' + (modificada ? ' (modificó cantidades)' : '')
          : (yaLlego ? 'Ya llegó físicamente — pendiente de recibir' : 'Autorizada / en camino');
        return (
          <Tooltip key={i}>
            <TooltipTrigger asChild>
              <span
                className={`inline-flex items-center gap-0.5 justify-center h-5 min-w-5 px-1 rounded-full text-[9px] font-bold text-white ${color} ${modificada ? 'ring-2 ring-offset-1 ring-amber-400' : ''} ${yaLlego ? 'ring-2 ring-offset-1 ring-sky-400' : ''}`}
              >
                {h.sucursal_codigo.slice(0, 3).toUpperCase()}
                {yaLlego && <Package className="h-2.5 w-2.5" />}
              </span>
            </TooltipTrigger>
            <TooltipContent>{h.sucursal_codigo} — {label}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

// Punto 1: la marca "Ya llegó" (marcar_llegada_oc) solo se notaba dentro del
// detalle. Este badge la hace visible en las listas; se deja de mostrar solo
// cuando la OC ya se recibió formalmente (recibida / parcial / cancelada).
function LlegoBadge({ oc }: { oc: { estado: string; llego_fisicamente?: boolean } }) {
  if (!oc.llego_fisicamente) return null;
  if (['recibida', 'parcial', 'cancelada'].includes(oc.estado)) return null;
  return (
    <Badge variant="outline" className="gap-1 w-fit border-sky-400 bg-sky-50 text-sky-700 text-[10px]">
      <Package className="h-3 w-3" /> Ya llegó — pendiente de recibir
    </Badge>
  );
}


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
                <td className="text-right tabular-nums py-1 px-1">
                  {Number(l.cantidad_solicitada).toLocaleString('es-MX')}
                  {(l as any).ajuste && (
                    <div className="text-[9px] font-normal text-amber-600 whitespace-nowrap">
                      antes: {(l as any).ajuste.cantidad_anterior.toLocaleString('es-MX')}
                    </div>
                  )}
                </td>
                <td className="text-right tabular-nums py-1 px-1">${Number(l.precio_unitario).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="text-right tabular-nums py-1 px-1">${Number(l.subtotal).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


export default function OrdenesCompraPage() {
  return (
    <OcErrorBoundary>
      <TooltipProvider>
        <OrdenesCompraPageInner />
      </TooltipProvider>
    </OcErrorBoundary>
  );
}

function OrdenesCompraPageInner() {
  const { user, userRole } = useAuth();
  const esAdmin = !!userRole && ROLES_ADMIN.includes(userRole);
  const esGerencia = !!userRole && ROLES_GERENCIA.includes(userRole);
  const esCompras = !!userRole && ROLES_COMPRAS.includes(userRole);
  const esAlmacen = !!userRole && ROLES_ALMACEN.includes(userRole);
  const [misSucursales, setMisSucursales] = useState<string[]>([]);
  const [ocs, setOcs] = useState<OC[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<string>('all');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionada, setSeleccionada] = useState<OC | null>(null);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [lineasEditadas, setLineasEditadas] = useState<Record<string, number>>({});
  const [recibirOpen, setRecibirOpen] = useState(false);
  type RecepcionLinea = { cantidad: number; numero_lote: string; fecha_caducidad: string; costo_unitario: string; incidencia_tipo: string; incidencia_notas: string };
  const [recepciones, setRecepciones] = useState<Record<string, RecepcionLinea>>({});
  const [tab, setTab] = useState<'grupos' | 'todas' | 'seguimiento' | 'revision_gerente' | 'autorizacion_admin' | 'bitacora'>('grupos');
  const [almacenes, setAlmacenes] = useState<{ id: string; nombre: string; sucursal: string; sucursal_id?: string }[]>([]);
  const [almacenSel, setAlmacenSel] = useState<string>('');
  // "Ya llegó" — marca ligera, independiente de la recepción formal.
  const [marcandoLlegada, setMarcandoLlegada] = useState<string | null>(null);
  // Bitácora de recepción.
  const [bitacora, setBitacora] = useState<any[]>([]);
  const [reportandoBitacora, setReportandoBitacora] = useState(false);
  // OCs que ya tienen un reporte en la bitácora: el reporte es definitivo, una sola vez.
  const [ordenesReportadas, setOrdenesReportadas] = useState<Set<string>>(new Set());
  const [bitacoraManualOpen, setBitacoraManualOpen] = useState(false);
  const [bitacoraManualForm, setBitacoraManualForm] = useState({
    sucursal_id: '', fecha: new Date().toISOString().slice(0, 10), proveedor_nombre: '',
    factura_folio: '', factura_monto: '', orden_folio: '', orden_total: '', notas: '',
  });
  const [guardandoBitacoraManual, setGuardandoBitacoraManual] = useState(false);
  // Paso 2 (marcar en ruta): puede ser sobre un grupo completo o una OC individual.
  const [enRutaOpen, setEnRutaOpen] = useState<{ grupo_id?: string | null; orden_id?: string | null; folio: string } | null>(null);
  const [pagoProveedorForm, setPagoProveedorForm] = useState({ metodo_pago: 'credito' as 'credito' | 'contado', dias_credito: '30', fecha_pago_limite: '', fecha_estimada_entrega: '', monto_a_pagar: '', notas: '' });
  // Total de la OC/grupo que se está marcando en ruta, para precargar "se va a pagar".
  const [totalEnRuta, setTotalEnRuta] = useState<number>(0);
  const [confirmandoProveedor, setConfirmandoProveedor] = useState(false);
  // Filtros de la vista "Por proveedor" (grupos de OC).
  const [filtroGrupos, setFiltroGrupos] = useState({ folio: '', proveedor: '', desde: '', hasta: '', sucursal: 'all' });
  const [rechazoOpen, setRechazoOpen] = useState<{ oc: OC; tipo: 'gerente' | 'admin' } | null>(null);
  const [razonRechazo, setRazonRechazo] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState<string | null>(null);
  // Qué grupos (proveedor) están expandidos en "Por revisar" / "Por autorizar" —
  // colapsados por default para no saturar la vista con todas las sucursales.
  const [gruposAbiertos, setGruposAbiertos] = useState<Record<string, boolean>>({});
  // Vista previa de insumos (punto 3): líneas precargadas por OC para mostrarlas
  // directamente en la lista del gerente, sin tener que entrar al detalle.
  const [lineasPorOc, setLineasPorOc] = useState<Record<string, Linea[]>>({});
  // Estatus por sucursal dentro de cada grupo, para las "bolitas" visuales.
  const [hijasPorGrupo, setHijasPorGrupo] = useState<Record<string, HijaGrupo[]>>({});
  // Qué grupo/orden se está confirmando con el proveedor ahora mismo — para
  // deshabilitar el botón y mostrar spinner en vez de que parezca congelado
  // mientras corre la RPC + la descarga de los Excel.
  const [confirmandoConProveedorKey, setConfirmandoConProveedorKey] = useState<string | null>(null);
  // Ajustes de cantidad (antes → después) que hizo el gerente, para mostrarlos
  // en el detalle de la OC cuando el administrador la está autorizando.
  const [ajustesLineas, setAjustesLineas] = useState<Record<string, { cantidad_anterior: number; cantidad_nueva: number }>>({});

  // --- Facturas de la OC (folio obligatorio para recibir, varias por OC) ---
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [facturaSel, setFacturaSel] = useState<string>('');
  const [nuevaFacturaOpen, setNuevaFacturaOpen] = useState(false);
  const [nuevaFacturaForm, setNuevaFacturaForm] = useState({ folio: '', fecha_factura: '', importe: '', dias_credito: '' });
  const [guardandoFactura, setGuardandoFactura] = useState(false);
  const [subiendoDoc, setSubiendoDoc] = useState<string | null>(null); // `${facturaId}-pdf` | `${facturaId}-xml`
  const [recepcionesPorFactura, setRecepcionesPorFactura] = useState<Record<string, { linea_id: string; cantidad: number; factura_folio: string }[]>>({});
  const [notaOpen, setNotaOpen] = useState<Factura | null>(null);
  const [notaForm, setNotaForm] = useState({ tipo: 'incidencia' as 'incidencia' | 'negociada' | 'objetivo_trimestral', monto: '', motivo: '', productoId: '', cantidad: '' });
  const [guardandoNota, setGuardandoNota] = useState(false);
  // Punto 3: notas de crédito ya creadas de esta OC, para poder consultarlas
  // después y generarles un formato imprimible para el proveedor.
  type NotaCredito = {
    id: string; folio: string; tipo: string; monto: number; motivo: string | null;
    fecha: string | null; created_at: string; factura_id: string | null;
    cantidad_incidencia: number | null;
  };
  const [notasCredito, setNotasCredito] = useState<NotaCredito[]>([]);
  


  useEffect(() => { load(); loadAlmacenes(); }, []);
  useEffect(() => {
    // Antes esto vivía en el mismo useEffect de montaje (deps: []), junto con
    // load()/loadAlmacenes(). Bug real: esAdmin/esCompras dependen de userRole
    // (useAuth), que puede no estar listo todavía en el primer render — si no
    // lo estaba, loadGrupos() nunca se llamaba y la pestaña "Por proveedor"
    // se quedaba vacía hasta que el usuario le diera "Refrescar" a mano
    // (momento en el que userRole ya sí estaba listo). Al depender
    // explícitamente de esAdmin/esCompras, se reintenta en cuanto el rol
    // termine de cargar — mismo patrón que ya se usó para misSucursales.
    if (esAdmin || esCompras) loadGrupos();
  }, [esAdmin, esCompras]);
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
    const ids = (data || []).map((g: any) => g.id);
    if (!ids.length) { setHijasPorGrupo({}); return; }
    const { data: hijas } = await supabase
      .from('ordenes_compra')
      .select('grupo_id, estado, cantidades_modificadas_gerente, llego_fisicamente, sucursal_destino:sucursales!sucursal_destino_id(codigo)')
      .in('grupo_id', ids);
    const map: Record<string, HijaGrupo[]> = {};
    (hijas || []).forEach((h: any) => {
      if (!h.grupo_id) return;
      (map[h.grupo_id] ||= []).push({
        sucursal_codigo: h.sucursal_destino?.codigo || '?',
        estado: h.estado,
        cantidades_modificadas_gerente: !!h.cantidades_modificadas_gerente,
        llego_fisicamente: !!h.llego_fisicamente,
      });
    });
    setHijasPorGrupo(map);
  }

  // Punto 3: precarga de insumos para que el gerente vea QUÉ y CUÁNTO se le
  // está pidiendo sin tener que abrir "Ver y confirmar". También trae los
  // ajustes de cantidad (antes → después) para que el admin vea desde la
  // lista, sin entrar al detalle, si el gerente modificó algo.
  async function loadLineasPreview(ids: string[]) {
    const faltantes = ids.filter(id => !lineasPorOc[id]);
    if (!faltantes.length) return;
    const [{ data }, { data: ajustes }] = await Promise.all([
      (supabase as any)
        .from('orden_compra_lineas')
        .select('id, orden_id, producto_id, cantidad_solicitada, cantidad_recibida, precio_unitario, subtotal, producto:productos(nombre, sku)')
        .in('orden_id', faltantes),
      (supabase as any)
        .from('orden_compra_lineas_ajustes')
        .select('linea_id, orden_id, cantidad_anterior, cantidad_nueva')
        .in('orden_id', faltantes),
    ]);
    const ajusteMap: Record<string, { cantidad_anterior: number; cantidad_nueva: number }> = {};
    (ajustes || []).forEach((a: any) => { ajusteMap[a.linea_id] = { cantidad_anterior: a.cantidad_anterior, cantidad_nueva: a.cantidad_nueva }; });
    const map: Record<string, Linea[]> = {};
    (data || []).forEach((l: any) => {
      (map[l.orden_id] ||= []).push({ ...l, ajuste: ajusteMap[l.id] } as any);
    });

    setLineasPorOc(prev => ({ ...prev, ...map }));
  }



  // PASO 1 del flujo con proveedor. Sustituye a la antigua RPC
  // `enviar_grupo_a_proveedor`, que fue eliminada de la base de datos porque
  // validaba estados viejos y siempre fallaba. Ahora solo pasa las órdenes de
  // `pendiente_confirmar` → `confirmada_proveedor` (sin pedir método de pago).
  async function confirmarConProveedor(args: { grupo_id?: string | null; orden_id?: string | null; folio: string }) {
    const key = args.grupo_id || args.orden_id || args.folio;
    setConfirmandoConProveedorKey(key);
    try {
      const { error } = await (supabase as any).rpc('confirmar_con_proveedor', {
        p_grupo_id: args.grupo_id || null,
        p_orden_id: args.grupo_id ? null : (args.orden_id || null),
        p_notas: null,
      });
      if (error) { toast.error(error.message); return; }
      toast.success(`${args.folio} confirmada con el proveedor — ya se puede marcar en ruta`);
      await loadGrupos();
      await load();
      if (seleccionada) await abrirDetalle(seleccionada);
      // Al confirmar, se descargan de una vez todos los Excel de OC involucrados
      // (uno por sucursal) — antes había que entrar OC por OC a generarlo manualmente.
      if (args.grupo_id) await descargarExcelesDelGrupo(args.grupo_id);
      else if (args.orden_id && seleccionada?.id === args.orden_id) await generarExcelProveedor(seleccionada);
    } catch (e: any) {
      // Antes un error aquí (ej. de red) se quedaba sin manejar y el botón
      // parecía congelado para siempre, sin ningún aviso.
      toast.error('No se pudo confirmar con el proveedor: ' + (e?.message || 'error desconocido'));
    } finally {
      setConfirmandoConProveedorKey(null);
    }
  }

  // Descarga un Excel por cada OC (sucursal) que forme parte del grupo confirmado,
  // en el mismo formato de machote que ya se usa para una OC individual.
  async function descargarExcelesDelGrupo(grupoId: string) {
    const { data: hijas } = await supabase
      .from('ordenes_compra')
      .select('id, folio, proveedor:proveedores(nombre), sucursal_destino:sucursales!sucursal_destino_id(codigo, nombre)')
      .eq('grupo_id', grupoId);
    if (!hijas?.length) return;
    toast.info(`Generando ${hijas.length} archivo${hijas.length === 1 ? '' : 's'} de Excel (uno por sucursal)…`);
    for (let i = 0; i < hijas.length; i++) {
      const h: any = hijas[i];
      const { data: lns } = await supabase
        .from('orden_compra_lineas')
        .select('producto_id, cantidad_solicitada, precio_con_iva, producto:productos(sku, nombre)')
        .eq('orden_id', h.id);
      const sucCodigo = h.sucursal_destino?.codigo || '';
      const lineasExcel = (lns || []).map((l: any) => ({
        sku: l.producto?.sku || '', nombre: l.producto?.nombre || '',
        piezas: l.cantidad_solicitada, precioConIva: l.precio_con_iva,
        reparto: sucCodigo ? { [sucCodigo]: l.cantidad_solicitada } : {},
      }));
      try {
        const blob = await generarOcProveedorExcel({
          proveedorNombre: h.proveedor?.nombre || '',
          numeroOC: h.folio,
          condicionesPago: 'Por confirmar con proveedor',
          sucursalDestinoTexto: sucCodigo,
          folioCotizacion: '',
          lineas: lineasExcel,
        });
        descargarBlob(blob, `${h.folio}_${sucCodigo || 'orden'}_compra.xlsx`);
      } catch (e: any) {
        toast.error(`No se pudo generar el Excel de ${h.folio}: ${e.message}`);
      }
      // Pausa breve entre descargas para que el navegador no las bloquee por ir muy seguidas.
      if (i < hijas.length - 1) await new Promise(r => setTimeout(r, 400));
    }
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
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('ordenes_compra')
      .select(`id, folio, estado, fecha_creacion, fecha_envio, fecha_recepcion_real, fecha_estimada_entrega, subtotal, iva, total, notas,
               sucursal_destino_id, grupo_id, cantidades_modificadas_gerente, compra_real_id, llego_fisicamente, llego_fisicamente_en,
               proveedor:proveedores(nombre, codigo),
               sucursal_destino:sucursales!sucursal_destino_id(codigo, nombre)`)
      .order('created_at', { ascending: false });
    setOcs((data || []) as any);
    setLoading(false);
    loadOrdenesReportadas();
  }

  async function loadOrdenesReportadas() {
    const { data } = await (supabase as any)
      .from('bitacora_recepcion').select('orden_id').not('orden_id', 'is', null);
    setOrdenesReportadas(new Set((data || []).map((b: any) => b.orden_id)));
  }

  async function loadAlmacenes() {
    const { data } = await supabase
      .from('almacenes')
      .select('id, nombre, sucursal_id, sucursal:sucursales(codigo, nombre)')
      .eq('activo', true);
    setAlmacenes((data || []).map((a: any) => ({
      id: a.id, nombre: a.nombre, sucursal: a.sucursal?.codigo || '', sucursal_id: a.sucursal_id,
    })));
  }

  async function abrirDetalle(oc: OC) {
    setSeleccionada(oc);
    setLineasEditadas({});
    setFacturaSel('');
    const [{ data }, { data: ajustes }] = await Promise.all([
      supabase
        .from('orden_compra_lineas')
        .select('id, producto_id, cantidad_solicitada, cantidad_recibida, precio_unitario, subtotal, producto:productos(nombre, sku)')
        .eq('orden_id', oc.id),
      (supabase as any)
        .from('orden_compra_lineas_ajustes')
        .select('linea_id, cantidad_anterior, cantidad_nueva')
        .eq('orden_id', oc.id),
    ]);
    setLineas((data || []) as any);
    const am: Record<string, { cantidad_anterior: number; cantidad_nueva: number }> = {};
    (ajustes || []).forEach((a: any) => { am[a.linea_id] = { cantidad_anterior: a.cantidad_anterior, cantidad_nueva: a.cantidad_nueva }; });
    setAjustesLineas(am);
    await loadFacturas(oc.id);
  }

  async function loadFacturas(ordenId: string) {
    const { data } = await (supabase as any)
      .from('ordenes_compra_facturas')
      .select('id, orden_id, folio, fecha_factura, importe, pdf_path, xml_path, created_at, dias_credito, fecha_limite_pago')
      .eq('orden_id', ordenId)
      .order('created_at', { ascending: false });
    setFacturas((data || []) as Factura[]);
    // Desglose de cuánto se ha recibido bajo cada factura, para mostrarlo junto a cada una.
    const { data: recs } = await (supabase as any)
      .from('ordenes_compra_recepciones')
      .select('factura_id, linea_id, cantidad, ordenes_compra_facturas!inner(folio)')
      .eq('orden_id', ordenId);
    const map: Record<string, { linea_id: string; cantidad: number; factura_folio: string }[]> = {};
    (recs || []).forEach((r: any) => {
      (map[r.factura_id] ||= []).push({ linea_id: r.linea_id, cantidad: r.cantidad, factura_folio: r.ordenes_compra_facturas?.folio || '' });
    });
    setRecepcionesPorFactura(map);
    await loadNotasCredito((data || []).map((f: any) => f.id));
  }

  // Notas de crédito ligadas a cualquiera de las facturas de esta OC.
  async function loadNotasCredito(facturaIds: string[]) {
    if (!facturaIds.length) { setNotasCredito([]); return; }
    const { data } = await (supabase as any)
      .from('notas_credito_proveedor')
      .select('id, folio, tipo, monto, motivo, fecha, created_at, factura_id, cantidad_incidencia')
      .in('factura_id', facturaIds)
      .order('created_at', { ascending: false });
    setNotasCredito((data || []) as NotaCredito[]);
  }

  const NOTA_TIPO_LABEL: Record<string, string> = {
    incidencia: 'Incidencia (faltante de piezas)',
    negociada: 'Negociada / descuento',
    objetivo_trimestral: 'Objetivo trimestral',
  };

  // "Generar formato": documento imprimible listo para mandarle al proveedor.
  function imprimirNota(nota: NotaCredito) {
    const factura = facturas.find(f => f.id === nota.factura_id);
    const esc = (s: any) => String(s ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
    const monto = Number(nota.monto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Nota de crédito ${esc(nota.folio)}</title>
<style>
  body{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111;margin:40px;}
  h1{font-size:20px;margin:0 0 4px;}
  .sub{color:#666;font-size:12px;margin-bottom:24px;}
  table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #e5e5e5;}
  th{width:220px;color:#555;font-weight:600;background:#fafafa;}
  .total{font-size:18px;font-weight:700;}
  .firma{margin-top:60px;display:flex;gap:60px;font-size:12px;color:#555;}
  .firma div{flex:1;border-top:1px solid #999;padding-top:6px;text-align:center;}
  @media print{body{margin:16px;}}
</style></head><body>
<h1>Nota de crédito a proveedor</h1>
<div class="sub">Folio ${esc(nota.folio)} · Emitida ${esc(nota.fecha || (nota.created_at || '').slice(0, 10))}</div>
<table>
  <tr><th>Proveedor</th><td>${esc(seleccionada?.proveedor?.nombre || '—')}</td></tr>
  <tr><th>Orden de compra</th><td>${esc(seleccionada?.folio || '—')}</td></tr>
  <tr><th>Factura afectada</th><td>${esc(factura?.folio || '—')}${factura?.fecha_factura ? ' · ' + esc(factura.fecha_factura) : ''}</td></tr>
  <tr><th>Sucursal destino</th><td>${esc(seleccionada?.sucursal_destino?.nombre || seleccionada?.sucursal_destino?.codigo || '—')}</td></tr>
  <tr><th>Tipo de nota</th><td>${esc(NOTA_TIPO_LABEL[nota.tipo] || nota.tipo)}</td></tr>
  ${nota.cantidad_incidencia ? `<tr><th>Piezas afectadas</th><td>${esc(nota.cantidad_incidencia)}</td></tr>` : ''}
  <tr><th>Motivo</th><td>${esc(nota.motivo || '—')}</td></tr>
  <tr><th>Importe de la nota</th><td class="total">$${monto}</td></tr>
</table>
<p style="font-size:12px;color:#555;">
  Por medio del presente documento se hace constar la aplicación de la nota de crédito arriba descrita
  contra el saldo de la factura indicada. Favor de considerar este ajuste en el estado de cuenta correspondiente.
</p>
<div class="firma"><div>Autorizó (Sanamex)</div><div>Recibió (proveedor)</div></div>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast.error('El navegador bloqueó la ventana. Permite las ventanas emergentes para generar el formato.'); return; }
    w.document.write(html);
    w.document.close();
  }


  async function crearFactura() {
    if (!seleccionada) return;
    if (!nuevaFacturaForm.folio.trim()) { toast.error('El folio de factura es obligatorio'); return; }
    setGuardandoFactura(true);
    try {
      const { data, error } = await (supabase as any).rpc('agregar_factura_oc', {
        p_orden_id: seleccionada.id,
        p_folio: nuevaFacturaForm.folio.trim(),
        p_fecha_factura: nuevaFacturaForm.fecha_factura || null,
        p_importe: nuevaFacturaForm.importe ? Number(nuevaFacturaForm.importe) : null,
        p_dias_credito: nuevaFacturaForm.dias_credito ? Number(nuevaFacturaForm.dias_credito) : null,
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Factura ligada a la orden de compra');
      setNuevaFacturaOpen(false);
      setNuevaFacturaForm({ folio: '', fecha_factura: '', importe: '', dias_credito: '' });
      await loadFacturas(seleccionada.id);
      setFacturaSel(data as string);
    } catch (e: any) {
      toast.error('No se pudo guardar la factura: ' + (e?.message || 'error desconocido'));
    } finally {
      setGuardandoFactura(false);
    }
  }

  async function subirDocumentoFactura(factura: Factura, tipo: 'pdf' | 'xml', file: File) {
    const key = `${factura.id}-${tipo}`;
    setSubiendoDoc(key);
    try {
      const ext = file.name.split('.').pop() || tipo;
      const path = `${factura.orden_id}/${factura.id}/${tipo}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('facturas-compra').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const campo = tipo === 'pdf' ? 'pdf_path' : 'xml_path';
      const { error: updErr } = await (supabase as any).from('ordenes_compra_facturas').update({ [campo]: path }).eq('id', factura.id);
      if (updErr) throw updErr;
      toast.success(`${tipo.toUpperCase()} de la factura ${factura.folio} guardado`);
      if (seleccionada) await loadFacturas(seleccionada.id);
    } catch (e: any) {
      toast.error(`No se pudo subir el ${tipo.toUpperCase()}: ` + (e?.message || 'error desconocido'));
    } finally {
      setSubiendoDoc(null);
    }
  }

  async function verDocumentoFactura(path: string) {
    const { data, error } = await supabase.storage.from('facturas-compra').createSignedUrl(path, 300);
    if (error || !data) { toast.error('No se pudo abrir el documento'); return; }
    window.open(data.signedUrl, '_blank');
  }

  function abrirNota(factura: Factura) {
    setNotaOpen(factura);
    setNotaForm({ tipo: 'incidencia', monto: '', motivo: '', productoId: '', cantidad: '' });
  }

  async function guardarNotaFactura() {
    if (!notaOpen || !seleccionada) return;
    const monto = Number(notaForm.monto);
    if (!monto || monto <= 0) { toast.error('Captura un monto válido'); return; }
    const requiereProducto = notaForm.tipo === 'incidencia' || notaForm.tipo === 'negociada';
    if (requiereProducto && (!notaForm.productoId || !notaForm.cantidad)) {
      toast.error('Selecciona el producto y la cantidad afectada'); return;
    }
    if (!seleccionada.compra_real_id) {
      toast.error('Esta orden todavía no tiene una compra real ligada (debe estar en ruta o más adelante)'); return;
    }
    setGuardandoNota(true);
    try {
      // Proveedor de esta OC — necesario para crear_nota_credito_proveedor.
      const { data: ocData } = await supabase.from('ordenes_compra').select('proveedor_id').eq('id', seleccionada.id).maybeSingle() as any;
      const { data, error } = await (supabase as any).rpc('crear_nota_credito_proveedor', {
        p_proveedor_id: (ocData as any)?.proveedor_id,
        p_tipo: notaForm.tipo,
        p_monto: monto,
        p_motivo: notaForm.motivo || null,
        p_compra_id: seleccionada.compra_real_id,
        p_producto_id: requiereProducto ? notaForm.productoId : null,
        p_cantidad_incidencia: requiereProducto ? Number(notaForm.cantidad) : null,
        p_factura_id: notaOpen.id,
      });
      if (error) { toast.error(error.message); return; }
      toast.success(`Nota de crédito ${data?.folio} ligada a la factura ${notaOpen.folio}`);
      setNotaOpen(null);
      await loadFacturas(seleccionada.id);
    } catch (e: any) {
      toast.error('No se pudo crear la nota de crédito: ' + (e?.message || 'error desconocido'));
    } finally {
      setGuardandoNota(false);
    }
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
  // Precarga los días de crédito con el valor que ya se tiene capturado para
  // ese proveedor (proveedores.plazo_pago_dias) — el usuario lo puede
  // modificar caso por caso, pero ya no arranca siempre en 30 por default.
  async function abrirEnRuta(args: { grupo_id?: string | null; orden_id?: string | null; folio: string }) {
    setEnRutaOpen(args);
    setTotalEnRuta(0);
    setPagoProveedorForm({ metodo_pago: 'credito', dias_credito: '30', fecha_pago_limite: '', fecha_estimada_entrega: '', monto_a_pagar: '', notas: '' });
    try {
      let q = supabase.from('ordenes_compra').select('total, estado, proveedor:proveedores(plazo_pago_dias)');
      q = args.grupo_id ? q.eq('grupo_id', args.grupo_id) : q.eq('id', args.orden_id as string);
      const { data } = await q;
      const filas = (data || []).filter((r: any) => r.estado !== 'cancelada');
      const total = filas.reduce((s: number, r: any) => s + Number(r.total || 0), 0);
      setTotalEnRuta(total);
      const dias = (filas[0] as any)?.proveedor?.plazo_pago_dias;
      setPagoProveedorForm(prev => ({
        ...prev,
        monto_a_pagar: total ? total.toFixed(2) : '',
        ...(dias !== null && dias !== undefined
          ? { dias_credito: String(dias), metodo_pago: (Number(dias) === 0 ? 'contado' : 'credito') as 'credito' | 'contado' }
          : {}),
      }));
    } catch {
      // Si falla la consulta del default, se queda con 30 y el usuario lo ajusta a mano.
    }
  }

  async function confirmarProveedor() {
    if (!enRutaOpen) return;
    setConfirmandoProveedor(true);
    const target = enRutaOpen;
    try {
      const { data, error } = await (supabase as any).rpc('confirmar_envio_proveedor', {
        p_grupo_id: target.grupo_id || null,
        p_orden_id: target.grupo_id ? null : (target.orden_id || null),
        p_metodo_pago: pagoProveedorForm.metodo_pago,
        p_dias_credito: pagoProveedorForm.metodo_pago === 'credito' ? Number(pagoProveedorForm.dias_credito) : null,
        p_fecha_pago_limite: pagoProveedorForm.fecha_pago_limite || null,
        p_fecha_estimada_entrega: pagoProveedorForm.fecha_estimada_entrega || null,
        p_notas: pagoProveedorForm.notas || null,
        p_monto_a_pagar: pagoProveedorForm.monto_a_pagar ? Number(pagoProveedorForm.monto_a_pagar) : null,
      });
      if (error) { toast.error(error.message); return; }
      toast.success(`Marcada en ruta — compra ${data?.numero_compra} creada en Cuentas por Pagar`);
      setEnRutaOpen(null);
      await loadGrupos();
      await load();
      if (seleccionada) abrirDetalle(seleccionada);
    } catch (e: any) {
      // Antes, si la llamada tronaba por red (en vez de regresar { error }),
      // el botón se quedaba en "Procesando..." para siempre — este es
      // probablemente el "se queda congelado" reportado al marcar en ruta.
      toast.error('No se pudo marcar en ruta: ' + (e?.message || 'error desconocido'));
    } finally {
      setConfirmandoProveedor(false);
    }
  }


  // Abre "Recibir mercancía": para gerente/almacenista el almacén queda fijo
  // a su propia sucursal (no tiene sentido preguntarles, solo tienen una).
  // Admin/compras sí pueden elegir, porque llegan a operar más de una.
  function abrirRecibir() {
    if (!(esAdmin || esCompras)) {
      const miAlmacen = almacenes.find(a => misSucursales.includes(a.sucursal_id || ''));
      setAlmacenSel(miAlmacen?.id || '');
    } else {
      setAlmacenSel('');
    }
    setFacturaSel('');
    setRecibirOpen(true);
  }

  async function ejecutarRecepcion() {
    if (!seleccionada || !almacenSel) { toast.error('Selecciona almacén'); return; }
    if (!facturaSel) { toast.error('Liga el folio de factura antes de recibir mercancía'); return; }
    const items = Object.entries(recepciones)
      .filter(([, r]) => r.cantidad > 0)
      .map(([linea_id, r]) => ({
        linea_id, cantidad: r.cantidad,
        numero_lote: r.numero_lote || undefined,
        fecha_caducidad: r.fecha_caducidad || undefined,
        costo_unitario: r.costo_unitario ? Number(r.costo_unitario) : undefined,
        incidencia_tipo: r.incidencia_tipo || undefined,
        incidencia_notas: r.incidencia_notas || undefined,
      }));
    if (!items.length) { toast.error('Captura al menos una cantidad'); return; }
    const sinCaducidad = items.filter(i => !i.fecha_caducidad);
    if (sinCaducidad.length) { toast.error('Captura la fecha de caducidad de cada producto recibido'); return; }
    const conIncidenciaSinNota = items.filter(i => i.incidencia_tipo && !i.incidencia_notas);
    if (conIncidenciaSinNota.length) { toast.error('Describe cada incidencia reportada'); return; }
    const { data, error } = await (supabase as any).rpc('recibir_oc', {
      p_orden_id: seleccionada.id, p_recepciones: items, p_almacen_id: almacenSel, p_factura_id: facturaSel,
    });
    if (error) return toast.error(error.message);
    toast.success(data?.estado === 'recibida'
      ? 'Recepción completa: la mercancía ya entró al inventario y la orden quedó como Recibida y aceptada.'
      : 'Recepción parcial registrada: lo recibido ya entró al inventario; la orden sigue con piezas pendientes.');
    setRecibirOpen(false); setRecepciones({});
    await load(); await loadGrupos(); abrirDetalle(seleccionada);
  }

  // "Ya llegó" — marca ligera e independiente de recibir_oc. Se puede
  // encender y apagar (por si se marcó por error).
  async function toggleLlegada(oc: OC) {
    setMarcandoLlegada(oc.id);
    try {
      const nuevoValor = !oc.llego_fisicamente;
      const { error } = await (supabase as any).rpc('marcar_llegada_oc', { p_orden_id: oc.id, p_valor: nuevoValor });
      if (error) { toast.error(error.message); return; }
      toast.success(nuevoValor ? 'Marcado como llegado' : 'Se quitó la marca de llegada');
      await load();
      setSeleccionada(prev => (prev && prev.id === oc.id ? { ...prev, llego_fisicamente: nuevoValor } : prev));
    } catch (e: any) {
      toast.error('No se pudo actualizar: ' + (e?.message || 'error desconocido'));
    } finally {
      setMarcandoLlegada(null);
    }
  }

  // Bitácora de recepción — reporte automático con todo lo ya capturado.
  async function reportarBitacora(oc: OC) {
    if (ordenesReportadas.has(oc.id)) {
      toast.info('Esta orden ya fue reportada en la bitácora. El reporte es definitivo.');
      return;
    }
    setReportandoBitacora(true);
    try {
      const { error } = await (supabase as any).rpc('reportar_bitacora_recepcion', { p_orden_id: oc.id, p_notas: null });
      if (error) { toast.error(error.message); return; }
      toast.success('Reportado en la bitácora de recepción');
      setOrdenesReportadas(prev => new Set(prev).add(oc.id));
      await loadBitacora();
    } catch (e: any) {
      toast.error('No se pudo reportar en la bitácora: ' + (e?.message || 'error desconocido'));
    } finally {
      setReportandoBitacora(false);
    }
  }

  async function loadBitacora() {
    let q = (supabase as any).from('bitacora_recepcion').select('*').order('created_at', { ascending: false }).limit(200);
    if (!(esAdmin || esCompras) && misSucursales.length) q = q.in('sucursal_id', misSucursales);
    const { data } = await q;
    setBitacora(data || []);
    await loadOrdenesReportadas();
  }

  async function guardarBitacoraManual() {
    if (!bitacoraManualForm.sucursal_id) { toast.error('Selecciona la sucursal'); return; }
    setGuardandoBitacoraManual(true);
    try {
      const { error } = await (supabase as any).from('bitacora_recepcion').insert({
        sucursal_id: bitacoraManualForm.sucursal_id,
        fecha: bitacoraManualForm.fecha,
        proveedor_nombre: bitacoraManualForm.proveedor_nombre || null,
        factura_folio: bitacoraManualForm.factura_folio || null,
        factura_monto: bitacoraManualForm.factura_monto ? Number(bitacoraManualForm.factura_monto) : null,
        orden_folio: bitacoraManualForm.orden_folio || null,
        orden_total: bitacoraManualForm.orden_total ? Number(bitacoraManualForm.orden_total) : null,
        notas: bitacoraManualForm.notas || null,
        automatico: false,
      });
      if (error) { toast.error(error.message); return; }
      toast.success('Registro agregado a la bitácora');
      setBitacoraManualOpen(false);
      setBitacoraManualForm({ sucursal_id: '', fecha: new Date().toISOString().slice(0, 10), proveedor_nombre: '', factura_folio: '', factura_monto: '', orden_folio: '', orden_total: '', notas: '' });
      await loadBitacora();
    } catch (e: any) {
      toast.error('No se pudo guardar: ' + (e?.message || 'error desconocido'));
    } finally {
      setGuardandoBitacoraManual(false);
    }
  }


  const filtradas = useMemo(() => ocs.filter(o => {
    if (filtroEstado !== 'all' && o.estado !== filtroEstado) return false;
    if (filtroGrupo && (o as any).grupo_id !== filtroGrupo) return false;
    const b = busqueda.toLowerCase();
    if (b && !o.folio.toLowerCase().includes(b) && !(o.proveedor?.nombre || '').toLowerCase().includes(b)) return false;
    return true;
  }), [ocs, filtroEstado, busqueda, filtroGrupo]);


  // Filtros de "Por proveedor": folio, nombre de proveedor, rango de fechas y
  // sucursal aplicada (usando las OC hijas de cada grupo).
  const gruposFiltrados = useMemo(() => grupos.filter(g => {
    const f = filtroGrupos;
    if (f.folio && !(g.folio || '').toLowerCase().includes(f.folio.toLowerCase())) return false;
    if (f.proveedor && !(g.proveedor_nombre || '').toLowerCase().includes(f.proveedor.toLowerCase())) return false;
    if (f.desde && (g.fecha_creacion || '') < f.desde) return false;
    if (f.hasta && (g.fecha_creacion || '') > f.hasta) return false;
    if (f.sucursal !== 'all') {
      const hijas = hijasPorGrupo[g.id] || [];
      if (!hijas.some(h => h.sucursal_codigo === f.sucursal)) return false;
    }
    return true;
  }), [grupos, filtroGrupos, hijasPorGrupo]);

  const sucursalesEnGrupos = useMemo(() => {
    const set = new Set<string>();
    Object.values(hijasPorGrupo).forEach(hijas => (hijas || []).forEach(h => {
      if (h.sucursal_codigo) set.add(h.sucursal_codigo);
    }));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [hijasPorGrupo]);

  const pendientesRevisionGerente = ocs.filter(o => o.estado === 'pendiente_aprobacion' && puedeRevisarComoGerente(o));
  const pendientesAutorizacionAdmin = esAdmin ? ocs.filter(o => o.estado === 'confirmada_gerente') : [];

  // Rediseño: "Por revisar (gerente)" y "Por autorizar (admin)" mostraban una
  // fila plana por cada OC individual — con varias sucursales del mismo
  // proveedor, eso se veía como una lista larga y repetitiva. Se agrupan por
  // grupo_id (o por sí misma si es una OC suelta, sin grupo) para que primero
  // se vea "Proveedor X — 4 sucursales" y solo al expandir aparezcan las OC
  // individuales de cada sucursal (que sí son órdenes distintas entre sí).
  function agruparPorProveedor(lista: OC[]) {
    const mapa = new Map<string, { key: string; proveedor: string; ocs: OC[] }>();
    for (const oc of lista) {
      const key = oc.grupo_id || oc.id;
      if (!mapa.has(key)) mapa.set(key, { key, proveedor: oc.proveedor?.nombre || 'Sin proveedor', ocs: [] });
      mapa.get(key)!.ocs.push(oc);
    }
    return Array.from(mapa.values());
  }
  const gruposRevisionGerente = useMemo(() => agruparPorProveedor(pendientesRevisionGerente), [pendientesRevisionGerente]);
  const gruposAutorizacionAdmin = useMemo(() => agruparPorProveedor(pendientesAutorizacionAdmin), [pendientesAutorizacionAdmin]);

  // Punto 6: "Por revisar (gerente)" se agrupaba por proveedor. El gerente
  // razona por sucursal, así que ahora se arma un bloque por sucursal con
  // TODAS sus OC pendientes, sin importar el proveedor. Se muestran también
  // las sucursales sin pendientes (en cero) para que quede claro el panorama.
  const bloquesRevisionSucursal = useMemo(() => {
    const sucursales = new Map<string, { id: string; codigo: string; ocs: OC[] }>();
    const visibles = esAdmin || esCompras ? null : misSucursales;
    [...new Map(almacenes.map(a => [a.sucursal_id, a])).values()].forEach(a => {
      if (!a.sucursal_id) return;
      if (visibles && visibles.length && !visibles.includes(a.sucursal_id)) return;
      sucursales.set(a.sucursal_id, { id: a.sucursal_id, codigo: a.sucursal || '—', ocs: [] });
    });
    for (const oc of pendientesRevisionGerente) {
      const key = oc.sucursal_destino_id || 'sin_sucursal';
      if (!sucursales.has(key)) {
        sucursales.set(key, { id: key, codigo: oc.sucursal_destino?.codigo || 'Sin sucursal', ocs: [] });
      }
      sucursales.get(key)!.ocs.push(oc);
    }
    return [...sucursales.values()].sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [pendientesRevisionGerente, almacenes, misSucursales, esAdmin, esCompras]);

  // El diálogo de "Marcar en ruta" vivía solo dentro de la vista de detalle,
  // así que al pulsar el botón desde la lista de grupos el estado cambiaba pero
  // no había diálogo montado y "no pasaba nada". Se comparte en ambas vistas.
  const enRutaDialog = (
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
                <Label className="text-xs">Se va a pagar (monto)</Label>
                <Input type="number" step="0.01" min="0" value={pagoProveedorForm.monto_a_pagar}
                  onChange={e => setPagoProveedorForm({ ...pagoProveedorForm, monto_a_pagar: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">
                  Total de la orden: ${totalEnRuta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.
                  Este monto es el que se registra en Cuentas por Pagar.
                  {pagoProveedorForm.monto_a_pagar && Math.abs(Number(pagoProveedorForm.monto_a_pagar) - totalEnRuta) > 0.5 && (
                    <span className="text-amber-600"> Distinto al total de la orden.</span>
                  )}
                </p>
              </div>
              <div>
                <Label className="text-xs">Fecha estimada de entrega</Label>
                <Input type="date" value={pagoProveedorForm.fecha_estimada_entrega}
                  onChange={e => setPagoProveedorForm({ ...pagoProveedorForm, fecha_estimada_entrega: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">
                  Se le avisa a la sucursal y le sirve para ordenar sus pedidos por cuándo les llega.
                </p>
              </div>
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
  );

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
              <div className="mt-2"><PipelineOC estado={seleccionada.estado} /></div>
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
                    disabled={seleccionada.estado !== 'pendiente_confirmar' || confirmandoConProveedorKey === seleccionada.id}
                    onClick={() => confirmarConProveedor({ orden_id: seleccionada.id, folio: seleccionada.folio })}>
                    {confirmandoConProveedorKey === seleccionada.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    1. Confirmar con proveedor
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
                <Button
                  variant={seleccionada.llego_fisicamente ? 'secondary' : 'outline'}
                  className="gap-2"
                  disabled={marcandoLlegada === seleccionada.id}
                  onClick={() => toggleLlegada(seleccionada)}>
                  {marcandoLlegada === seleccionada.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {seleccionada.llego_fisicamente ? 'Ya llegó ✓' : 'Marcar que ya llegó'}
                </Button>
              )}
              {['en_ruta', 'enviada', 'confirmada', 'parcial'].includes(seleccionada.estado) && (
                <Button onClick={abrirRecibir} className="gap-2"><PackageCheck className="h-4 w-4" />Recibir mercancía</Button>
              )}
              {['parcial', 'recibida'].includes(seleccionada.estado) && (
                ordenesReportadas.has(seleccionada.id) ? (
                  <Button variant="secondary" className="gap-2" disabled
                    title="El reporte en bitácora es definitivo y ya fue generado para esta orden">
                    <ClipboardList className="h-4 w-4" />Ya reportada en bitácora
                  </Button>
                ) : (
                  <Button variant="outline" className="gap-2" disabled={reportandoBitacora} onClick={() => reportarBitacora(seleccionada)}>
                    {reportandoBitacora ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                    Reportar en bitácora de recepción
                  </Button>
                )
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
                      : (
                        <div>
                          {l.cantidad_solicitada}
                          {ajustesLineas[l.id] && (
                            <div className="text-[10px] font-normal text-amber-600 whitespace-nowrap">
                              antes: {ajustesLineas[l.id].cantidad_anterior} → {ajustesLineas[l.id].cantidad_nueva}
                            </div>
                          )}
                        </div>
                      )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{l.cantidad_recibida}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {seleccionada.estado === 'borrador'
                      ? <Input type="number" step="0.01" defaultValue={Number(l.precio_unitario)} className="h-7 w-24 text-right text-xs"
                          onBlur={e => actualizarPrecio(l, parseFloat(e.target.value))} />
                      : `$${Number(l.precio_unitario).toFixed(2)}`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">${Number(l.subtotal).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
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
              <p>Subtotal: <span className="tabular-nums font-medium">${Number(seleccionada.subtotal).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
              <p>IVA: <span className="tabular-nums font-medium">${Number(seleccionada.iva).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></p>
              <p className="text-lg font-bold">Total: ${Number(seleccionada.total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            </div>
          </div>
        </Card>

        {['en_ruta', 'enviada', 'confirmada', 'parcial', 'recibida'].includes(seleccionada.estado) && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Facturas de esta orden</h3>
                <Badge variant="outline">{facturas.length}</Badge>
                {facturas.length > 0 && (
                  <Badge variant={saldoPorFacturar > 0.5 ? 'secondary' : 'outline'} className="font-normal">
                    Facturado ${totalFacturado.toLocaleString('es-MX', { minimumFractionDigits: 2 })} de ${Number(seleccionada.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    {saldoPorFacturar > 0.5 && ` · saldo $${saldoPorFacturar.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
                  </Badge>
                )}
              </div>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => { setNuevaFacturaForm({ folio: '', fecha_factura: '', importe: '', dias_credito: '' }); setNuevaFacturaOpen(true); }}>
                <Plus className="h-4 w-4" /> Agregar factura
              </Button>
            </div>
            {!facturas.length ? (
              <p className="text-sm text-muted-foreground">
                Todavía no se ha ligado ningún folio de factura a esta orden. La mercancía solo entra al
                inventario cuando se recibe con su folio de factura.
              </p>
            ) : (
              <div className="space-y-2">
                {facturas.map(f => {
                  const recibidoEnEstaFactura = (recepcionesPorFactura[f.id] || []).reduce((s, r) => s + r.cantidad, 0);
                  const notasDeFactura = notasCredito.filter(n => n.factura_id === f.id);
                  return (
                    <div key={f.id} className="border rounded-md p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">{f.folio}</div>
                        <div className="text-xs text-muted-foreground">
                          {f.fecha_factura || 'sin fecha'} {f.importe ? `· $${Number(f.importe).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : ''}
                          {recibidoEnEstaFactura > 0 && <> · {recibidoEnEstaFactura.toLocaleString('es-MX')} pieza{recibidoEnEstaFactura === 1 ? '' : 's'} recibidas con este folio</>}
                        </div>
                        {f.fecha_limite_pago && (() => {
                          const dias = Math.round((new Date(f.fecha_limite_pago + 'T00:00:00').getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);
                          const tono = dias < 0 ? 'text-destructive' : dias <= 3 ? 'text-amber-600' : 'text-muted-foreground';
                          return (
                            <div className={`text-xs mt-0.5 ${tono}`}>
                              Pago límite {f.fecha_limite_pago}
                              {f.dias_credito != null && ` (${f.dias_credito} días de crédito)`}
                              {' · '}{dias < 0 ? `vencida hace ${Math.abs(dias)} día${Math.abs(dias) === 1 ? '' : 's'}` : dias === 0 ? 'vence hoy' : `vence en ${dias} día${dias === 1 ? '' : 's'}`}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <input type="file" accept=".pdf" className="hidden" id={`pdf-${f.id}`}
                          onChange={e => e.target.files?.[0] && subirDocumentoFactura(f, 'pdf', e.target.files[0])} />
                        <Button size="sm" variant={f.pdf_path ? 'outline' : 'secondary'} className="gap-1"
                          disabled={subiendoDoc === `${f.id}-pdf`}
                          onClick={() => f.pdf_path ? verDocumentoFactura(f.pdf_path) : document.getElementById(`pdf-${f.id}`)?.click()}>
                          {subiendoDoc === `${f.id}-pdf` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                          {f.pdf_path ? 'Ver PDF' : 'Subir PDF'}
                        </Button>
                        <input type="file" accept=".xml" className="hidden" id={`xml-${f.id}`}
                          onChange={e => e.target.files?.[0] && subirDocumentoFactura(f, 'xml', e.target.files[0])} />
                        <Button size="sm" variant={f.xml_path ? 'outline' : 'secondary'} className="gap-1"
                          disabled={subiendoDoc === `${f.id}-xml`}
                          onClick={() => f.xml_path ? verDocumentoFactura(f.xml_path) : document.getElementById(`xml-${f.id}`)?.click()}>
                          {subiendoDoc === `${f.id}-xml` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
                          {f.xml_path ? 'Ver XML' : 'Subir XML'}
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => abrirNota(f)}>
                          <FileMinus className="h-3.5 w-3.5" /> Nueva nota de crédito
                        </Button>
                      </div>
                    </div>
                    {/* Punto 3: las notas de crédito ya creadas se quedaban invisibles.
                        Aquí se listan y se les puede generar el formato para el proveedor. */}
                    {notasDeFactura.length > 0 && (
                      <div className="rounded-md border bg-muted/30 p-2">
                        <div className="text-xs font-medium mb-1">
                          Notas de crédito de esta factura ({notasDeFactura.length}) — total $
                          {notasDeFactura.reduce((s, n) => s + Number(n.monto || 0), 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <table className="w-full text-xs">
                          <thead className="text-muted-foreground">
                            <tr>
                              <th className="text-left font-medium py-1 px-1">Folio</th>
                              <th className="text-left font-medium py-1 px-1">Tipo</th>
                              <th className="text-right font-medium py-1 px-1">Monto</th>
                              <th className="text-left font-medium py-1 px-1">Motivo</th>
                              <th className="text-left font-medium py-1 px-1">Fecha</th>
                              <th className="text-right font-medium py-1 px-1"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {notasDeFactura.map(n => (
                              <tr key={n.id} className="border-t">
                                <td className="font-mono py-1 px-1">{n.folio}</td>
                                <td className="py-1 px-1">{NOTA_TIPO_LABEL[n.tipo] || n.tipo}</td>
                                <td className="text-right tabular-nums py-1 px-1">
                                  ${Number(n.monto || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="py-1 px-1 max-w-[240px] truncate" title={n.motivo || ''}>{n.motivo || '—'}</td>
                                <td className="py-1 px-1">{n.fecha || (n.created_at || '').slice(0, 10)}</td>
                                <td className="text-right py-1 px-1">
                                  <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => imprimirNota(n)}>
                                    <Printer className="h-3 w-3" /> Generar formato
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {/* Nota de crédito ligada a una factura de esta OC */}
        <Dialog open={!!notaOpen} onOpenChange={o => !o && setNotaOpen(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Nota de crédito — factura {notaOpen?.folio}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Tipo de nota</Label>
                <Select value={notaForm.tipo} onValueChange={(v: any) => setNotaForm({ ...notaForm, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="incidencia">Incidencia (faltante de piezas) — ajusta inventario</SelectItem>
                    <SelectItem value="negociada">Negociada / descuento — impacta el costo</SelectItem>
                    <SelectItem value="objetivo_trimestral">Objetivo trimestral — beneficio financiero</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(notaForm.tipo === 'incidencia' || notaForm.tipo === 'negociada') && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Producto (de esta orden)</Label>
                    <Select value={notaForm.productoId} onValueChange={v => setNotaForm({ ...notaForm, productoId: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                      <SelectContent>
                        {lineas.map(l => (
                          <SelectItem key={l.producto_id} value={l.producto_id}>{l.producto?.sku} — {l.producto?.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{notaForm.tipo === 'incidencia' ? 'Piezas faltantes' : 'Piezas con descuento'}</Label>
                    <Input type="number" value={notaForm.cantidad} onChange={e => setNotaForm({ ...notaForm, cantidad: e.target.value })} />
                  </div>
                </div>
              )}
              <div>
                <Label>Monto total de la nota</Label>
                <Input type="number" step="0.01" value={notaForm.monto} onChange={e => setNotaForm({ ...notaForm, monto: e.target.value })} />
              </div>
              <div>
                <Label>Motivo (opcional)</Label>
                <Textarea rows={2} value={notaForm.motivo} onChange={e => setNotaForm({ ...notaForm, motivo: e.target.value })} />
              </div>
              <p className="text-xs text-muted-foreground">
                Esta nota queda ligada a la factura {notaOpen?.folio} de {seleccionada?.folio} y se aplica de inmediato contra el saldo de esta compra.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNotaOpen(null)}>Cancelar</Button>
              <Button onClick={guardarNotaFactura} disabled={guardandoNota}>
                {guardandoNota ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Aplicar nota de crédito
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={recibirOpen} onOpenChange={setRecibirOpen}>
          <DialogContent className="max-w-[min(1100px,96vw)] max-h-[92vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Recibir mercancía — {seleccionada.folio}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Almacén de recepción</Label>
                  {(esAdmin || esCompras) ? (
                    <Select value={almacenSel} onValueChange={setAlmacenSel}>
                      <SelectTrigger><SelectValue placeholder="Selecciona almacén…" /></SelectTrigger>
                      <SelectContent>
                        {almacenes.map(a => <SelectItem key={a.id} value={a.id}>{a.sucursal} · {a.nombre}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-sm">
                      {almacenes.find(a => a.id === almacenSel)?.sucursal} · {almacenes.find(a => a.id === almacenSel)?.nombre || 'Tu almacén'}
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Folio de factura (obligatorio)</Label>
                  <div className="flex gap-1">
                    <Select value={facturaSel} onValueChange={setFacturaSel}>
                      <SelectTrigger><SelectValue placeholder="Selecciona la factura…" /></SelectTrigger>
                      <SelectContent>
                        {facturas.map(f => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.folio}{f.fecha_factura ? ` · ${f.fecha_factura}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" size="icon" variant="outline" onClick={() => setNuevaFacturaOpen(true)} title="Agregar nueva factura">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              {!facturas.length && (
                <div className="text-xs rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2">
                  Esta orden todavía no tiene ninguna factura ligada. No se puede recibir mercancía sin antes agregar
                  el folio (botón "+"). Si el proveedor mandó varias facturas para esta misma orden, agrega cada una
                  por separado — vas a poder elegir cuál corresponde a lo que estás recibiendo ahora.
                </div>
              )}
              {/* Antes era una tabla de 8 columnas: en la pantalla del gerente
                  se salía del diálogo y no se alcanzaban a ver los campos.
                  Ahora es una tarjeta por producto con campos etiquetados. */}
              <div className="space-y-2">
                {lineas.map(l => {
                  const pend = l.cantidad_solicitada - l.cantidad_recibida;
                  const r: RecepcionLinea = recepciones[l.id] || {
                    cantidad: 0, numero_lote: '', fecha_caducidad: '',
                    costo_unitario: String(Number(l.precio_unitario ?? 0)), incidencia_tipo: '', incidencia_notas: '',
                  };
                  const set = (patch: Partial<RecepcionLinea>) =>
                    setRecepciones(p => ({ ...p, [l.id]: { ...r, ...patch } }));
                  const faltante = r.cantidad > 0 && r.cantidad < pend;
                  return (
                    <div key={l.id} className="rounded-md border p-3 space-y-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0">
                          <div className="font-mono text-xs text-muted-foreground">{l.producto?.sku}</div>
                          <div className="text-sm font-medium">{l.producto?.nombre}</div>
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          Solicitado <span className="font-semibold text-foreground tabular-nums">{l.cantidad_solicitada}</span>
                          {' · '}Ya recibido <span className="font-semibold text-foreground tabular-nums">{l.cantidad_recibida}</span>
                          {' · '}Pendiente <span className="font-semibold text-foreground tabular-nums">{pend}</span>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        <div>
                          <Label className="text-xs">Recibir ahora</Label>
                          <Input type="number" min={0} max={pend} className="h-9"
                            value={r.cantidad || ''}
                            onChange={e => set({ cantidad: parseInt(e.target.value || '0') })} />
                          {faltante && (
                            <div className="text-[11px] text-amber-600">Faltan {pend - r.cantidad} pza(s)</div>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs">No. de lote</Label>
                          <Input className="h-9" placeholder="Lote"
                            value={r.numero_lote}
                            onChange={e => set({ numero_lote: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Caducidad</Label>
                          <Input type="date" className="h-9"
                            value={r.fecha_caducidad}
                            onChange={e => set({ fecha_caducidad: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Costo unitario</Label>
                          <Input type="number" step="0.01" min={0} className="h-9 text-right"
                            value={r.costo_unitario}
                            onChange={e => set({ costo_unitario: e.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Incidencia</Label>
                          <Select value={r.incidencia_tipo || 'ninguna'} onValueChange={v => set({ incidencia_tipo: v === 'ninguna' ? '' : v })}>
                            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ninguna">Sin incidencia</SelectItem>
                              <SelectItem value="faltante">Llegó menos cantidad</SelectItem>
                              <SelectItem value="producto_equivocado">Producto equivocado</SelectItem>
                              <SelectItem value="dañado">Producto dañado</SelectItem>
                              <SelectItem value="otro">Otra incidencia</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {r.incidencia_tipo && (
                        <Input className="h-9" placeholder="Describe la incidencia (qué pasó, cuántas piezas, etc.)"
                          value={r.incidencia_notas}
                          onChange={e => set({ incidencia_notas: e.target.value })} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setRecibirOpen(false)}>Cancelar</Button>
              <Button onClick={ejecutarRecepcion} disabled={!facturaSel} title={!facturaSel ? 'Liga primero el folio de factura' : undefined}>
                Confirmar recepción y aceptar en inventario
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Alta rápida de factura — se puede abrir desde "Recibir mercancía" o desde la sección Facturas del detalle. */}
        <Dialog open={nuevaFacturaOpen} onOpenChange={setNuevaFacturaOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Agregar folio de factura — {seleccionada.folio}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Folio de factura *</Label>
                <Input value={nuevaFacturaForm.folio} onChange={e => setNuevaFacturaForm({ ...nuevaFacturaForm, folio: e.target.value })} placeholder="Ej. A-4521" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Fecha de factura</Label>
                  <Input type="date" value={nuevaFacturaForm.fecha_factura} onChange={e => setNuevaFacturaForm({ ...nuevaFacturaForm, fecha_factura: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Importe</Label>
                  <Input type="number" step="0.01" value={nuevaFacturaForm.importe} onChange={e => setNuevaFacturaForm({ ...nuevaFacturaForm, importe: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Días de crédito</Label>
                  <Input type="number" min={0} value={nuevaFacturaForm.dias_credito}
                    onChange={e => setNuevaFacturaForm({ ...nuevaFacturaForm, dias_credito: e.target.value })}
                    placeholder="Del proveedor" />
                </div>
                <div>
                  <Label className="text-xs">Fecha límite de pago</Label>
                  <div className="h-10 flex items-center text-sm tabular-nums">
                    {fechaLimiteCalculada || <span className="text-muted-foreground text-xs">Se calcula con la fecha y los días de crédito</span>}
                  </div>
                </div>
              </div>
              <div className={`rounded-md border p-2 text-xs ${excedeTotalOc ? 'border-destructive bg-destructive/10 text-destructive' : 'bg-muted/40 text-muted-foreground'}`}>
                Total de la orden: <span className="tabular-nums font-medium">${Number(seleccionada.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                {' · '}Ya facturado: <span className="tabular-nums font-medium">${totalFacturado.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                {' · '}Saldo por facturar: <span className="tabular-nums font-medium">${saldoPorFacturar.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                {excedeTotalOc && <div className="mt-1 font-medium">Con este importe la suma de facturas excedería el total de la orden.</div>}
              </div>
              <p className="text-xs text-muted-foreground">
                Si el proveedor separó esta orden en varias facturas (por empaque o por IVA), agrégalas todas aquí — cada una queda ligada a esta misma orden de compra.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNuevaFacturaOpen(false)}>Cancelar</Button>
              <Button onClick={crearFactura} disabled={guardandoFactura || excedeTotalOc}>
                {guardandoFactura ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Guardar factura
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {enRutaDialog}
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
        <Button
          variant="outline" size="sm" className="gap-2"
          onClick={() => { load(); if (esAdmin || esCompras) { loadGrupos(); } }}
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
        if (v === 'bitacora') loadBitacora();
      }}>
        <TabsList>
          {(esAdmin || esCompras) && (
            <TabsTrigger value="grupos" className="gap-2"><Truck className="h-4 w-4" /> Por proveedor</TabsTrigger>
          )}
          {!(esGerencia || esAlmacen) && (
            <TabsTrigger value="todas">Todas</TabsTrigger>
          )}
          {(esGerencia || esAlmacen) && (
            <TabsTrigger value="seguimiento" className="gap-2">
              <PackageCheck className="h-4 w-4" /> Mi sucursal
            </TabsTrigger>
          )}

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
          {(esGerencia || esAlmacen || esAdmin || esCompras) && (
            <TabsTrigger value="bitacora" className="gap-2">
              <ClipboardList className="h-4 w-4" /> Bitácora
            </TabsTrigger>
          )}
        </TabsList>

        {/* Bitácora de recepción: se llena sola al terminar de recibir (botón
            "Reportar en bitácora de recepción" en el detalle), y también
            admite alta manual para lo que no se haya hecho desde el sistema.
            Gerencia/almacén ven solo su(s) sucursal(es); admin/compras ven todo. */}
        {(esGerencia || esAlmacen || esAdmin || esCompras) && (
        <TabsContent value="bitacora" className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Se reporta sola cuando terminan de recibir una orden. Si algo se recibió fuera del sistema, se puede agregar aquí a mano.
            </p>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setBitacoraManualOpen(true)}>
              <Plus className="h-4 w-4" /> Registro manual
            </Button>
          </div>
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead><TableHead>Sucursal</TableHead><TableHead>Proveedor</TableHead>
                  <TableHead>Folio factura</TableHead><TableHead className="text-right">Monto factura</TableHead>
                  <TableHead>Folio OC</TableHead><TableHead className="text-right">Total OC</TableHead>
                  <TableHead>Origen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!bitacora.length && (
                  <TableRow><TableCell colSpan={8} className="text-center p-6 text-muted-foreground">Todavía no hay registros en la bitácora.</TableCell></TableRow>
                )}
                {bitacora.map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="text-xs">{b.fecha}</TableCell>
                    <TableCell>{almacenes.find(a => a.sucursal_id === b.sucursal_id)?.sucursal || '—'}</TableCell>
                    <TableCell>{b.proveedor_nombre || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{b.factura_folio || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.factura_monto ? `$${Number(b.factura_monto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{b.orden_folio || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{b.orden_total ? `$${Number(b.orden_total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                    <TableCell>
                      {b.automatico
                        ? <Badge variant="outline" className="text-emerald-700 border-emerald-400">Automático</Badge>
                        : <Badge variant="outline" className="text-amber-700 border-amber-400">Manual</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        )}

        {(esAdmin || esCompras) && (
        <TabsContent value="grupos" className="space-y-3">
          <Card className="p-3">
            <div className="grid gap-2 sm:grid-cols-5">
              <div>
                <Label className="text-xs">Folio</Label>
                <Input className="h-8" placeholder="OC-…" value={filtroGrupos.folio}
                  onChange={e => setFiltroGrupos({ ...filtroGrupos, folio: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Proveedor</Label>
                <Input className="h-8" placeholder="Nombre" value={filtroGrupos.proveedor}
                  onChange={e => setFiltroGrupos({ ...filtroGrupos, proveedor: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Desde</Label>
                <Input type="date" className="h-8" value={filtroGrupos.desde}
                  onChange={e => setFiltroGrupos({ ...filtroGrupos, desde: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Hasta</Label>
                <Input type="date" className="h-8" value={filtroGrupos.hasta}
                  onChange={e => setFiltroGrupos({ ...filtroGrupos, hasta: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Sucursal</Label>
                <Select value={filtroGrupos.sucursal} onValueChange={v => setFiltroGrupos({ ...filtroGrupos, sucursal: v })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {sucursalesEnGrupos.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {(filtroGrupos.folio || filtroGrupos.proveedor || filtroGrupos.desde || filtroGrupos.hasta || filtroGrupos.sucursal !== 'all') && (
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <span>{gruposFiltrados.length} de {grupos.length} órdenes</span>
                <Button variant="ghost" size="sm" className="h-6 text-xs"
                  onClick={() => setFiltroGrupos({ folio: '', proveedor: '', desde: '', hasta: '', sucursal: 'all' })}>
                  Limpiar filtros
                </Button>
              </div>
            )}
          </Card>
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
                {!gruposFiltrados.length && <TableRow><TableCell colSpan={7} className="text-center p-6 text-muted-foreground">{grupos.length ? 'Ninguna orden coincide con los filtros.' : 'No hay órdenes generadas desde el Cotizador todavía.'}</TableCell></TableRow>}
                {gruposFiltrados.map(g => (
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
                      <SucursalDots hijas={hijasPorGrupo[g.id]} />
                    </TableCell>
                    <TableCell>
                      {/* Punto 4: cuando todas las sucursales del grupo ya recibieron,
                          el grupo se muestra como Terminada (aunque la RPC siga en "enviada"). */}
                      {(() => {
                        const hijas = hijasPorGrupo[g.id] || [];
                        const vivas = hijas.filter(h => h.estado !== 'cancelada');
                        const terminada = vivas.length > 0 && vivas.every(h => h.estado === 'recibida');
                        if (terminada) return <Badge className="bg-blue-600">Terminada — todas recibieron</Badge>;
                        return (
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
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      ${Number(g.total_consolidado).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      {(esAdmin || esCompras) && (g.estado === 'lista_para_enviar' || g.estado === 'confirmada_proveedor') && (
                        <div className="flex gap-2 justify-end">
                          <Button size="sm" className="gap-1 bg-teal-600 hover:bg-teal-700"
                            disabled={g.estado !== 'lista_para_enviar' || confirmandoConProveedorKey === g.id}
                            onClick={() => confirmarConProveedor({ grupo_id: g.id, folio: g.folio })}>
                            {confirmandoConProveedorKey === g.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} 1. Confirmar con proveedor
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

        {!(esGerencia || esAlmacen) && (
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
                  {/* Punto 5: solo los estados que hoy sí se usan en el flujo. */}
                  {['pendiente_aprobacion','confirmada_gerente','pendiente_confirmar','confirmada_proveedor','en_ruta','enviada','recibida'].map(e =>
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
                      <div className="flex flex-col gap-1">
                        <PipelineOC estado={oc.estado} />
                        <LlegoBadge oc={oc} />
                        {oc.cantidades_modificadas_gerente && (
                          <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600 w-fit">Modificada</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{oc.fecha_creacion}</TableCell>
                    <TableCell className="text-right tabular-nums">${Number(oc.total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
        )}

        {/* Punto 4: seguimiento por sucursal para gerente y almacenista —
            saber en qué va cada OC y cuándo ya se puede recibir físicamente.
            Solo para roles operativos: administración/compras ya tiene "Todas". */}
        {(esGerencia || esAlmacen) && (
        <TabsContent value="seguimiento" className="space-y-4">
          {(() => {
            const misOcs = misSucursales.length
              ? ocs.filter(o => o.sucursal_destino_id && misSucursales.includes(o.sucursal_destino_id))
              : ocs;
            const activas = misOcs.filter(o => o.estado !== 'cancelada' && o.estado !== 'recibida');
            const porRecibir = misOcs.filter(o => ['en_ruta', 'enviada', 'confirmada', 'parcial'].includes(o.estado));
            const porAutorizar = misOcs.filter(o => ['pendiente_aprobacion', 'confirmada_gerente'].includes(o.estado));
            // Orden cronológico: primero las que ya van en camino, ordenadas por
            // cuándo llegan (las sin fecha estimada quedan al final del grupo);
            // después el resto en el orden que ya traían.
            const enCaminoIds = new Set(porRecibir.map(o => o.id));
            const enCaminoOrdenado = [...porRecibir].sort((a, b) => {
              if (!a.fecha_estimada_entrega && !b.fecha_estimada_entrega) return 0;
              if (!a.fecha_estimada_entrega) return 1;
              if (!b.fecha_estimada_entrega) return -1;
              return a.fecha_estimada_entrega.localeCompare(b.fecha_estimada_entrega);
            });
            const misOcsOrdenadas = [...enCaminoOrdenado, ...misOcs.filter(o => !enCaminoIds.has(o.id))];
            const etaLabel = (fecha?: string | null) => {
              if (!fecha) return null;
              const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
              const d = new Date(fecha + 'T00:00:00');
              const dias = Math.round((d.getTime() - hoy.getTime()) / 86400000);
              if (dias < 0) return { texto: `Atrasado ${Math.abs(dias)}d`, color: 'text-destructive' };
              if (dias === 0) return { texto: 'Llega hoy', color: 'text-emerald-600 font-semibold' };
              if (dias === 1) return { texto: 'Llega mañana', color: 'text-blue-600 font-semibold' };
              return { texto: `Llega en ${dias}d (${fecha})`, color: 'text-muted-foreground' };
            };
            return (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground">Pendientes de autorizar</div>
                    <div className="text-2xl font-bold">{porAutorizar.length}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground">En camino (listas para recibir)</div>
                    <div className="text-2xl font-bold text-blue-600">{porRecibir.length}</div>
                  </Card>
                  <Card className="p-4">
                    <div className="text-xs text-muted-foreground">Órdenes activas</div>
                    <div className="text-2xl font-bold">{activas.length}</div>
                  </Card>
                </div>
                {(esGerencia || esAlmacen) && !esAdmin && !esCompras && !misSucursales.length && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-sm px-3 py-2">
                    No tienes ninguna sucursal asignada todavía, por eso no ves órdenes aquí — esto es una
                    configuración pendiente, no un error. Pide a un administrador que te asigne tu sucursal
                    en "Gestión de usuarios".
                  </div>
                )}
                <Card className="p-0 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Folio</TableHead><TableHead>Proveedor</TableHead>
                        <TableHead>Sucursal</TableHead><TableHead>En qué va</TableHead>
                        <TableHead>Llega</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead className="text-right">Acción</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!misOcsOrdenadas.length && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center p-6 text-muted-foreground">
                            {misSucursales.length || esAdmin || esCompras
                              ? 'No hay órdenes de compra para tu sucursal por ahora.'
                              : 'Sin sucursal asignada — ver aviso arriba.'}
                          </TableCell>
                        </TableRow>
                      )}
                      {misOcsOrdenadas.map(oc => {
                        const listaParaRecibir = ['en_ruta', 'enviada', 'confirmada', 'parcial'].includes(oc.estado);
                        const eta = listaParaRecibir ? etaLabel(oc.fecha_estimada_entrega) : null;
                        return (
                          <TableRow key={oc.id} className="cursor-pointer hover:bg-accent" onClick={() => abrirDetalle(oc)}>
                            <TableCell className="font-mono font-medium">{oc.folio}</TableCell>
                            <TableCell>{oc.proveedor?.nombre}</TableCell>
                            <TableCell>{oc.sucursal_destino?.codigo || '—'}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <PipelineOC estado={oc.estado} />
                                <LlegoBadge oc={oc} />
                              </div>
                            </TableCell>
                            <TableCell className={`text-xs ${eta?.color || 'text-muted-foreground'}`}>{eta?.texto || (listaParaRecibir ? 'Sin fecha estimada' : '—')}</TableCell>
                            <TableCell className="text-xs">{oc.fecha_creacion}</TableCell>
                            <TableCell className="text-right tabular-nums">${Number(oc.total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                            <TableCell className="text-right">
                              <Button size="sm" variant={listaParaRecibir ? 'default' : 'outline'} onClick={(e) => { e.stopPropagation(); abrirDetalle(oc); }}>
                                {listaParaRecibir ? 'Recibir' : 'Ver'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Card>
              </>
            );
          })()}
        </TabsContent>
        )}



        {/* Punto 6: bloques por sucursal (no por proveedor): dentro de cada
            sucursal se ven todas sus OC pendientes, sin importar el proveedor. */}
        <TabsContent value="revision_gerente" className="space-y-3">
          {!pendientesRevisionGerente.length && (
            <Card className="p-6 text-center text-muted-foreground">No hay OCs pendientes de tu revisión.</Card>
          )}
          {!!pendientesRevisionGerente.length && bloquesRevisionSucursal.map(bloque => {
            const llave = 'suc:' + bloque.id;
            const abierto = gruposAbiertos[llave] ?? bloque.ocs.length > 0;
            const totalBloque = bloque.ocs.reduce((s, o) => s + Number(o.total || 0), 0);
            return (
              <Card key={bloque.id} className="p-0 overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent text-left"
                  onClick={() => setGruposAbiertos(prev => ({ ...prev, [llave]: !abierto }))}
                >
                  <div className="flex items-center gap-2">
                    {abierto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="font-semibold">{bloque.codigo}</span>
                    <Badge variant={bloque.ocs.length ? 'destructive' : 'outline'}>
                      {bloque.ocs.length} orden{bloque.ocs.length === 1 ? '' : 'es'} por revisar
                    </Badge>
                  </div>
                  <span className="font-semibold tabular-nums">
                    ${totalBloque.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </button>
                {abierto && (!bloque.ocs.length ? (
                  <p className="px-4 pb-4 text-sm text-muted-foreground">Esta sucursal no tiene órdenes pendientes de revisión.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Folio</TableHead>
                        <TableHead>Proveedor</TableHead><TableHead>Fecha</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bloque.ocs.map(oc => (
                        <Fragment key={oc.id}>
                        <TableRow>
                          <TableCell className="font-mono font-medium">
                            {oc.folio}
                            <div className="mt-1"><PipelineOC estado={oc.estado} /></div>
                            <LlegoBadge oc={oc} />
                          </TableCell>
                          <TableCell>{oc.proveedor?.nombre || '—'}</TableCell>
                          <TableCell className="text-xs">{oc.fecha_creacion}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            ${Number(oc.total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={5} className="pt-0">
                            <PreviewInsumos lineas={lineasPorOc[oc.id]} />
                          </TableCell>
                        </TableRow>
                        </Fragment>
                      ))}
                    </TableBody>
                  </Table>
                ))}
              </Card>
            );
          })}
        </TabsContent>

        {esAdmin && (
          <TabsContent value="autorizacion_admin" className="space-y-3">
            {!gruposAutorizacionAdmin.length && (
              <Card className="p-6 text-center text-muted-foreground">No hay OCs pendientes de autorización final.</Card>
            )}
            {gruposAutorizacionAdmin.map(grupo => {
              const llave = 'admin:' + grupo.key;
              const abierto = !!gruposAbiertos[llave];
              const totalGrupo = grupo.ocs.reduce((s, o) => s + Number(o.total || 0), 0);
              const modificadas = grupo.ocs.filter(o => o.cantidades_modificadas_gerente).length;
              return (
                <Card key={grupo.key} className="p-0 overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent text-left"
                    onClick={() => setGruposAbiertos(prev => ({ ...prev, [llave]: !abierto }))}
                  >
                    <div className="flex items-center gap-2">
                      {abierto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      <span className="font-semibold">{grupo.proveedor}</span>
                      <Badge variant="outline">{grupo.ocs.length} sucursal{grupo.ocs.length === 1 ? '' : 'es'} por autorizar</Badge>
                      {modificadas > 0 && (
                        <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">
                          {modificadas} modificada{modificadas === 1 ? '' : 's'} por gerente
                        </Badge>
                      )}
                    </div>
                    <span className="font-semibold tabular-nums">
                      ${totalGrupo.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </button>
                  {abierto && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Folio</TableHead>
                          <TableHead>Destino</TableHead><TableHead>Confirmada por</TableHead>
                          <TableHead className="text-right">Monto</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {grupo.ocs.map(oc => (
                          <Fragment key={oc.id}>
                          <TableRow>
                            <TableCell className="font-mono font-medium">
                              {oc.folio}
                              <div className="mt-1"><PipelineOC estado={oc.estado} /></div>
                            </TableCell>
                            <TableCell>{oc.sucursal_destino?.codigo || '—'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              Gerente de sucursal
                              {oc.cantidades_modificadas_gerente && (
                                <Badge variant="outline" className="ml-1.5 text-[10px] border-amber-500 text-amber-600">Modificó cantidades</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-semibold">
                              ${Number(oc.total).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                          <TableRow className="hover:bg-transparent">
                            <TableCell colSpan={5} className="pt-0">
                              <PreviewInsumos lineas={lineasPorOc[oc.id]} />
                            </TableCell>
                          </TableRow>
                          </Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </Card>
              );
            })}
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

      {/* Registro manual de bitácora — para lo que se reciba fuera del sistema. */}
      <Dialog open={bitacoraManualOpen} onOpenChange={setBitacoraManualOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Registro manual — Bitácora de recepción</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Sucursal *</Label>
                <Select value={bitacoraManualForm.sucursal_id} onValueChange={v => setBitacoraManualForm({ ...bitacoraManualForm, sucursal_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                  <SelectContent>
                    {[...new Map(almacenes.map(a => [a.sucursal_id, a])).values()].map(a => (
                      <SelectItem key={a.sucursal_id} value={a.sucursal_id as string}>{a.sucursal}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Fecha</Label>
                <Input type="date" value={bitacoraManualForm.fecha} onChange={e => setBitacoraManualForm({ ...bitacoraManualForm, fecha: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Proveedor</Label>
              <Input value={bitacoraManualForm.proveedor_nombre} onChange={e => setBitacoraManualForm({ ...bitacoraManualForm, proveedor_nombre: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Folio de factura</Label>
                <Input value={bitacoraManualForm.factura_folio} onChange={e => setBitacoraManualForm({ ...bitacoraManualForm, factura_folio: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Monto de factura</Label>
                <Input type="number" step="0.01" value={bitacoraManualForm.factura_monto} onChange={e => setBitacoraManualForm({ ...bitacoraManualForm, factura_monto: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Folio de la orden de compra</Label>
                <Input value={bitacoraManualForm.orden_folio} onChange={e => setBitacoraManualForm({ ...bitacoraManualForm, orden_folio: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Total de la orden</Label>
                <Input type="number" step="0.01" value={bitacoraManualForm.orden_total} onChange={e => setBitacoraManualForm({ ...bitacoraManualForm, orden_total: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notas</Label>
              <Textarea rows={2} value={bitacoraManualForm.notas} onChange={e => setBitacoraManualForm({ ...bitacoraManualForm, notas: e.target.value })} placeholder="Qué se recibió, cuánto, cualquier detalle relevante…" />
            </div>
            <p className="text-xs text-muted-foreground">
              Este registro se marca como "Manual" en la bitácora, para distinguirlo de los que se generan solos al recibir desde el sistema.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBitacoraManualOpen(false)}>Cancelar</Button>
            <Button onClick={guardarBitacoraManual} disabled={guardandoBitacoraManual}>
              {guardandoBitacoraManual ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Guardar registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {enRutaDialog}
    </div>
  );
}
