import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardEdit, Search, Plus, Minus, ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';

// Ajustes de inventario manuales (pedido Alejandro, minuto 41 de la sesión
// 20-jul-2026): "cuando hacemos un inventario, a veces hay piezas de más,
// piezas de menos... esas las ajusta el auditor". Solo auditoría/admin.
//
// NOTA (junta SANAMEX 15-ago-2026): Alejandro pidió que esto sea exclusivo
// de gerente/subgerente de sucursal. Se dejó como estaba (auditoría/admin)
// porque los permisos por perfil quedaron pendientes de definir en una
// llamada aparte — ver docs/SANAMEX_15ago2026_seguimiento.md, sección 5 y
// tabla de bloqueos. No cambiar esto sin confirmar con Alejandro primero.
const ROLES_PERMITIDOS = ['auditoria', 'auditor', 'admin', 'super_admin'];

interface LoteOpcion {
  lote_id: string;
  numero_lote: string;
  fecha_caducidad: string | null;
  cantidad_actual: number;
  producto_id: string;
  producto_nombre: string;
  producto_sku: string;
}

interface Motivo {
  id: string;
  nombre: string;
  es_confusion_producto: boolean;
}

// Buscador de producto/lote reutilizable, tanto para el flujo normal de un
// solo producto como para cada uno de los dos productos del flujo de
// "confusión de producto".
function BuscadorLote({
  almacenId,
  label,
  seleccionado,
  onSeleccionar,
}: {
  almacenId: string | null;
  label: string;
  seleccionado: LoteOpcion | null;
  onSeleccionar: (l: LoteOpcion | null) => void;
}) {
  const [search, setSearch] = useState('');
  const [resultados, setResultados] = useState<LoteOpcion[]>([]);

  const buscar = async () => {
    if (!almacenId || !search.trim()) { setResultados([]); return; }
    const { data } = await supabase
      .from('inventario')
      .select('cantidad, lote_id, lotes(numero_lote, fecha_caducidad, producto_id, productos(nombre, sku))')
      .eq('almacen_id', almacenId)
      .or(`lotes.productos.nombre.ilike.%${search}%,lotes.productos.sku.ilike.%${search}%,lotes.numero_lote.ilike.%${search}%`);
    const opciones: LoteOpcion[] = (data || [])
      .filter((r: any) => r.lotes?.productos)
      .map((r: any) => ({
        lote_id: r.lote_id,
        numero_lote: r.lotes.numero_lote,
        fecha_caducidad: r.lotes.fecha_caducidad,
        cantidad_actual: r.cantidad,
        producto_id: r.lotes.producto_id,
        producto_nombre: r.lotes.productos.nombre,
        producto_sku: r.lotes.productos.sku,
      }));
    setResultados(opciones);
  };

  if (seleccionado) {
    return (
      <div className="border rounded-lg p-3 bg-accent/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-medium">{seleccionado.producto_nombre}</p>
            <p className="text-xs text-muted-foreground">
              {seleccionado.producto_sku} · Lote {seleccionado.numero_lote} · Stock actual: {seleccionado.cantidad_actual}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => { onSeleccionar(null); setSearch(''); setResultados([]); }}>
            Cambiar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar producto, SKU o lote…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && buscar()}
        />
      </div>
      <Button size="sm" variant="outline" onClick={buscar}>Buscar</Button>
      {resultados.length > 0 && (
        <div className="border rounded-lg max-h-56 overflow-y-auto divide-y">
          {resultados.map((r) => (
            <button
              key={r.lote_id}
              onClick={() => { onSeleccionar(r); setResultados([]); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex justify-between items-center"
            >
              <div>
                <p className="font-medium">{r.producto_nombre}</p>
                <p className="text-xs text-muted-foreground">{r.producto_sku} · Lote {r.numero_lote} · cad {r.fecha_caducidad || '—'}</p>
              </div>
              <span className="font-mono text-sm">stock: {r.cantidad_actual}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const AjustesInventarioPage = () => {
  const { selectedSucursal } = useSucursal();
  const { userRole } = useAuth();
  const puedeAjustar = !!userRole && ROLES_PERMITIDOS.includes(userRole);

  const [almacenId, setAlmacenId] = useState<string | null>(null);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [motivoId, setMotivoId] = useState('');
  const [historial, setHistorial] = useState<any[]>([]);

  // Flujo normal (un solo producto/lote)
  const [seleccionado, setSeleccionado] = useState<LoteOpcion | null>(null);
  const [cantidadAjuste, setCantidadAjuste] = useState('');

  // Flujo especial "confusión de producto" (dos productos/lotes)
  const [loteVendidoError, setLoteVendidoError] = useState<LoteOpcion | null>(null);
  const [loteCorrecto, setLoteCorrecto] = useState<LoteOpcion | null>(null);
  const [cantidadConfusion, setCantidadConfusion] = useState('');

  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  const motivoSeleccionado = motivos.find((m) => m.id === motivoId) || null;
  const esConfusion = !!motivoSeleccionado?.es_confusion_producto;

  useEffect(() => { if (selectedSucursal) { loadAlmacen(); loadMotivos(); loadHistorial(); } }, [selectedSucursal]);

  const loadAlmacen = async () => {
    if (!selectedSucursal) return;
    const { data } = await supabase.from('almacenes').select('id').eq('sucursal_id', selectedSucursal.id).eq('activo', true).limit(1);
    setAlmacenId(data?.[0]?.id || null);
  };

  const loadMotivos = async () => {
    const { data } = await (supabase as any)
      .from('motivos_ajuste')
      .select('id, nombre, es_confusion_producto')
      .eq('tipo', 'ajuste')
      .eq('activo', true);
    setMotivos((data as Motivo[]) || []);
  };

  const loadHistorial = async () => {
    if (!selectedSucursal) return;
    const { data } = await supabase
      .from('movimientos_inventario')
      .select('*, lotes(numero_lote, productos(nombre, sku)), motivos_ajuste(nombre)')
      .eq('tipo', 'ajuste')
      .eq('sucursal_id', selectedSucursal.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setHistorial(data || []);
  };

  const resetFormulario = () => {
    setMotivoId('');
    setSeleccionado(null); setCantidadAjuste('');
    setLoteVendidoError(null); setLoteCorrecto(null); setCantidadConfusion('');
    setNotas('');
  };

  const guardarAjusteNormal = async () => {
    if (!almacenId || !seleccionado || !motivoId) { toast.error('Completa producto/lote y motivo'); return; }
    const cant = parseInt(cantidadAjuste);
    if (!cant || cant === 0) { toast.error('Captura una cantidad distinta de cero'); return; }
    setGuardando(true);
    const { data, error } = await (supabase as any).rpc('registrar_ajuste_inventario', {
      p_almacen_id: almacenId,
      p_lote_id: seleccionado.lote_id,
      p_cantidad_ajuste: cant,
      p_motivo_id: motivoId,
      p_notas: notas || null,
    });
    setGuardando(false);
    if (error) return toast.error(error.message);
    toast.success(`Ajuste registrado. Nueva cantidad en ese lote: ${data?.nueva_cantidad}`);
    resetFormulario();
    loadHistorial();
  };

  // Flujo "confusión de producto": se vendió el producto A por error en vez
  // del producto B. Hay que devolver A (se había descontado de más) y
  // descontar B (el que realmente salió). Se registran como dos movimientos
  // ligados por el mismo motivo y una nota que cruza ambos lotes, ya que
  // registrar_ajuste_inventario ajusta un solo lote a la vez.
  const guardarAjusteConfusion = async () => {
    if (!almacenId || !loteVendidoError || !loteCorrecto || !motivoId) {
      toast.error('Completa el producto vendido por error, el producto correcto y el motivo');
      return;
    }
    if (loteVendidoError.lote_id === loteCorrecto.lote_id) {
      toast.error('El producto vendido por error y el producto correcto no pueden ser el mismo lote');
      return;
    }
    const cant = parseInt(cantidadConfusion);
    if (!cant || cant <= 0) { toast.error('Captura una cantidad mayor a cero'); return; }

    setGuardando(true);
    const notaCruzada = [
      notas.trim(),
      `Confusión de producto: se devuelven ${cant} de "${loteVendidoError.producto_nombre}" (lote ${loteVendidoError.numero_lote}) ` +
        `y se descuentan ${cant} de "${loteCorrecto.producto_nombre}" (lote ${loteCorrecto.numero_lote}).`,
    ].filter(Boolean).join(' — ');

    // 1) Devuelve el producto que se había descontado de más.
    const { error: errorDevolucion } = await (supabase as any).rpc('registrar_ajuste_inventario', {
      p_almacen_id: almacenId,
      p_lote_id: loteVendidoError.lote_id,
      p_cantidad_ajuste: cant,
      p_motivo_id: motivoId,
      p_notas: notaCruzada,
    });
    if (errorDevolucion) {
      setGuardando(false);
      toast.error(`No se pudo devolver el producto vendido por error: ${errorDevolucion.message}`);
      return;
    }

    // 2) Descuenta el producto que realmente se vendió.
    const { error: errorDescuento } = await (supabase as any).rpc('registrar_ajuste_inventario', {
      p_almacen_id: almacenId,
      p_lote_id: loteCorrecto.lote_id,
      p_cantidad_ajuste: -cant,
      p_motivo_id: motivoId,
      p_notas: notaCruzada,
    });
    setGuardando(false);
    if (errorDescuento) {
      // El primer movimiento (devolución) ya quedó registrado; avisar
      // explícitamente para que se revise/corrija a mano, ya que no hay
      // una transacción que envuelva ambas llamadas RPC.
      toast.error(
        `Se devolvió "${loteVendidoError.producto_nombre}" pero falló el descuento de ` +
        `"${loteCorrecto.producto_nombre}": ${errorDescuento.message}. Revisa el historial y corrige manualmente.`
      );
      loadHistorial();
      return;
    }

    toast.success('Confusión de producto registrada: se ajustaron ambos productos.');
    resetFormulario();
    loadHistorial();
  };

  if (!puedeAjustar) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        Solo auditoría o administración pueden registrar ajustes de inventario.
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardEdit className="h-6 w-6" /> Ajustes de Inventario</h1>
        <p className="text-muted-foreground">
          {selectedSucursal?.nombre} — Corrige piezas de más o de menos detectadas en conteo físico. Cada ajuste queda registrado y visible en el Kardex (filtro "Ajustes").
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Nuevo ajuste</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {/* Paso 1 (obligatorio, junta 15-ago-2026): el motivo se elige ANTES
              de tocar cantidades, porque determina el flujo que sigue. */}
          <div>
            <Label className="text-xs">1. Motivo del ajuste *</Label>
            <Select value={motivoId} onValueChange={(v) => { setMotivoId(v); setSeleccionado(null); setLoteVendidoError(null); setLoteCorrecto(null); }}>
              <SelectTrigger><SelectValue placeholder="Selecciona un motivo para continuar" /></SelectTrigger>
              <SelectContent>
                {motivos.map((m) => <SelectItem key={m.id} value={m.id}>{m.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
            {!motivoId && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Selecciona el motivo primero — la lista completa de motivos sigue pendiente de confirmar con Alejandro.
              </p>
            )}
          </div>

          {motivoId && esConfusion && (
            <div className="border rounded-lg p-4 space-y-4 bg-accent/30">
              <p className="text-sm font-medium flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4" /> Confusión de producto
              </p>
              <p className="text-xs text-muted-foreground">
                Captura el producto que se vendió por error y el producto que realmente debió venderse.
                El sistema ajustará automáticamente ambas existencias: devuelve el que se descontó de más
                y descuenta el que realmente salió.
              </p>
              <BuscadorLote almacenId={almacenId} label="Producto vendido por error (se devuelve)" seleccionado={loteVendidoError} onSeleccionar={setLoteVendidoError} />
              <BuscadorLote almacenId={almacenId} label="Producto correcto (se descuenta)" seleccionado={loteCorrecto} onSeleccionar={setLoteCorrecto} />
              <div>
                <Label className="text-xs">Cantidad confundida</Label>
                <Input type="number" min={1} placeholder="Ej. 2" value={cantidadConfusion} onChange={(e) => setCantidadConfusion(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Notas (opcional)</Label>
                <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. Detectado en corte de caja del turno tarde…" />
              </div>
              <div className="flex justify-end">
                <Button onClick={guardarAjusteConfusion} disabled={guardando}>Registrar confusión de producto</Button>
              </div>
            </div>
          )}

          {motivoId && !esConfusion && (
            <div className="space-y-3">
              <BuscadorLote almacenId={almacenId} label="2. Producto / lote" seleccionado={seleccionado} onSeleccionar={setSeleccionado} />
              {seleccionado && (
                <div className="border rounded-lg p-4 space-y-3 bg-accent/30">
                  <div>
                    <Label className="text-xs">Cantidad a ajustar</Label>
                    <Input type="number" placeholder="Ej. 5 o -3" value={cantidadAjuste} onChange={(e) => setCantidadAjuste(e.target.value)} />
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                      {cantidadAjuste && parseInt(cantidadAjuste) > 0 && <><Plus className="h-3 w-3 text-green-600" /> Sobrante — sube el stock</>}
                      {cantidadAjuste && parseInt(cantidadAjuste) < 0 && <><Minus className="h-3 w-3 text-rose-600" /> Faltante — baja el stock</>}
                      {!cantidadAjuste && 'Positivo = sobrante encontrado. Negativo = faltante encontrado.'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs">Notas (opcional)</Label>
                    <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. Conteo físico mensual, área de refrigerados…" />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={guardarAjusteNormal} disabled={guardando}>Registrar ajuste</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Historial reciente</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead><TableHead>Producto</TableHead><TableHead>Lote</TableHead>
                <TableHead>Motivo</TableHead><TableHead className="text-right">Ajuste</TableHead><TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historial.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin ajustes registrados todavía</TableCell></TableRow>
              ) : historial.map(h => (
                <TableRow key={h.id}>
                  <TableCell className="text-xs">{new Date(h.created_at).toLocaleDateString('es-MX')}</TableCell>
                  <TableCell className="font-medium">{h.lotes?.productos?.nombre}</TableCell>
                  <TableCell className="font-mono text-xs">{h.lotes?.numero_lote}</TableCell>
                  <TableCell className="text-xs">{h.motivos_ajuste?.nombre || '—'}</TableCell>
                  <TableCell className="text-right">
                    <Badge className={h.cantidad > 0 ? 'bg-green-600' : 'bg-rose-600'}>{h.cantidad > 0 ? '+' : ''}{h.cantidad}</Badge>
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{h.notas || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AjustesInventarioPage;
