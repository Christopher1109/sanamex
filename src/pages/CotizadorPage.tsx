import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Calculator, Send, Search, Sparkles, AlertTriangle, RefreshCw, Download, ShoppingCart, Replace } from 'lucide-react';
import { toast } from 'sonner';
import { rpcPaginate } from '@/lib/rpcPaginate';

const APROBACION_UMBRAL_DEFAULT = 50000;

type Pendiente = {
  producto_id: string;
  clave: string;
  descripcion: string;
  clasificacion: string | null;
  departamento: string | null;
  cantidad_sugerida: number;
  ventas_periodo: number;
  ddi_periodo: number;
  comentario_resumen: string;
  mejor_proveedor_id: string | null;
  mejor_proveedor_nombre: string | null;
  mejor_precio: number | null;
  mejor_existencia: number | null;
  proveedores_disponibles: number;
  total_estimado: number;
};

type Alternativa = {
  proveedor_id: string; proveedor_codigo: string; proveedor_nombre: string;
  precio_unitario: number; existencia_proveedor: number;
  dias_credito: number; lead_time_dias: number;
  piezas_corrugado: number; cantidad_sugerida: number; monto_total: number;
  con_oferta: boolean; ranking: number;
};

export default function CotizadorPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { selectedSucursal } = useSucursal();

  const SUCURSALES_OPCIONES = [
    { code: '__all__', label: 'Consolidado (todas las sucursales)' },
    { code: 'SV', label: 'SV — San Vicente' },
    { code: 'ECA', label: 'ECA — Ecatepec' },
    { code: 'F36', label: 'F36 — Izta-F36' },
    { code: 'GH', label: 'GH — Izta-GH' },
    { code: 'CEDIS', label: 'CEDIS — CEDIS Central' },
  ];
  const [sucursalLocal, setSucursalLocal] = useState<string>('__all__');
  const sucursalLabel = SUCURSALES_OPCIONES.find(s => s.code === sucursalLocal)?.label.split(' — ').slice(-1)[0] || 'Consolidado';

  const [periodo, setPeriodo] = useState<7 | 14 | 30>(30);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Pendiente[]>([]);
  const [seleccion, setSeleccion] = useState<Record<string, { proveedor_id: string; cantidad: number; precio: number; descripcion: string; clave: string }>>({});
  const [soloSinProv, setSoloSinProv] = useState(false);
  const [filtroDepto, setFiltroDepto] = useState<string>('all');
  const [filtroClasif, setFiltroClasif] = useState<string>('all');
  const [filtroProv, setFiltroProv] = useState<string>('all');

  // Cambiar proveedor
  const [cambiarFor, setCambiarFor] = useState<Pendiente | null>(null);
  const [alternativas, setAlternativas] = useState<Alternativa[]>([]);

  // Manual quote
  const [manualOpen, setManualOpen] = useState(false);

  const [umbralAprob, setUmbralAprob] = useState<number>(APROBACION_UMBRAL_DEFAULT);
  const [fechaEfectiva, setFechaEfectiva] = useState<string | null>(null);

  useEffect(() => {
    (supabase as any).from('cotizador_config').select('monto_aprobacion_oc').eq('activo', true).maybeSingle()
      .then(({ data }: any) => { if (data?.monto_aprobacion_oc) setUmbralAprob(Number(data.monto_aprobacion_oc)); });
    (supabase as any).from('ventas').select('fecha').eq('estado', 'completada')
      .order('fecha', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }: any) => {
        if (!data?.fecha) return;
        const f = String(data.fecha).slice(0, 10);
        const diff = (Date.now() - new Date(f).getTime()) / 86400000;
        if (diff > 7) setFechaEfectiva(f);
      });
  }, []);

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [periodo, sucursalLocal]);

  async function cargar() {
    setLoading(true);
    try {
      const data = await rpcPaginate<Pendiente>('productos_pendientes_compra', {
        p_fecha_corte: null,
        p_sucursal_codigo: sucursalLocal === '__all__' ? null : sucursalLocal,
        p_periodo_referencia: periodo,
      });
      const list = data as Pendiente[];
      setRows(list);
    // Pre-select rows with provider
    const sel: typeof seleccion = {};
    list.forEach(r => {
      if (r.mejor_proveedor_id && r.mejor_precio) {
        sel[r.producto_id] = {
          proveedor_id: r.mejor_proveedor_id,
          cantidad: r.cantidad_sugerida,
          precio: Number(r.mejor_precio),
          descripcion: r.descripcion,
          clave: r.clave,
        };
      }
    });
    setSeleccion(sel);
    } catch (e: any) {
      toast.error(e.message || 'Error al cargar pendientes');
    } finally {
      setLoading(false);
    }
  }

  const deptos = useMemo(() => Array.from(new Set(rows.map(r => r.departamento).filter(Boolean))) as string[], [rows]);
  const clasifs = useMemo(() => Array.from(new Set(rows.map(r => r.clasificacion).filter(Boolean))) as string[], [rows]);
  const provs = useMemo(() => Array.from(new Set(rows.map(r => r.mejor_proveedor_nombre).filter(Boolean))) as string[], [rows]);

  const rowsFiltradas = useMemo(() => rows.filter(r => {
    if (soloSinProv && r.mejor_proveedor_id) return false;
    if (filtroDepto !== 'all' && r.departamento !== filtroDepto) return false;
    if (filtroClasif !== 'all' && r.clasificacion !== filtroClasif) return false;
    if (filtroProv !== 'all' && r.mejor_proveedor_nombre !== filtroProv) return false;
    return true;
  }), [rows, soloSinProv, filtroDepto, filtroClasif, filtroProv]);

  const resumen = useMemo(() => {
    const conProv = rows.filter(r => r.mejor_proveedor_id);
    const sinProv = rows.filter(r => !r.mejor_proveedor_id);
    const inv = rows.reduce((s, r) => s + Number(r.total_estimado || 0), 0);
    const seleccionados = Object.values(seleccion);
    const totalSel = seleccionados.reduce((s, x) => s + x.cantidad * x.precio, 0);
    const proveedoresUnicos = new Set(seleccionados.map(x => x.proveedor_id)).size;
    return {
      total: rows.length,
      conProv: conProv.length,
      sinProv: sinProv.length,
      inv,
      seleccionados: seleccionados.length,
      totalSel,
      proveedoresUnicos,
    };
  }, [rows, seleccion]);

  function toggleRow(r: Pendiente, on: boolean) {
    setSeleccion(prev => {
      const n = { ...prev };
      if (on && r.mejor_proveedor_id && r.mejor_precio) {
        n[r.producto_id] = {
          proveedor_id: r.mejor_proveedor_id,
          cantidad: r.cantidad_sugerida,
          precio: Number(r.mejor_precio),
          descripcion: r.descripcion,
          clave: r.clave,
        };
      } else {
        delete n[r.producto_id];
      }
      return n;
    });
  }

  async function abrirCambiarProv(r: Pendiente) {
    setCambiarFor(r);
    setAlternativas([]);
    const { data } = await (supabase as any).rpc('recomendar_proveedor', {
      p_producto_id: r.producto_id,
      p_cantidad_requerida: 1, // mostrar todos los proveedores con cualquier stock
    });
    // mostramos todos aunque no tengan stock suficiente, ordenados por precio
    setAlternativas((data || []) as Alternativa[]);
  }

  function elegirAlternativa(alt: Alternativa) {
    if (!cambiarFor) return;
    setSeleccion(prev => ({
      ...prev,
      [cambiarFor.producto_id]: {
        proveedor_id: alt.proveedor_id,
        cantidad: cambiarFor.cantidad_sugerida,
        precio: Number(alt.precio_unitario),
        descripcion: cambiarFor.descripcion,
        clave: cambiarFor.clave,
      },
    }));
    setCambiarFor(null);
  }

  function descargarSinProveedor() {
    const sin = rows.filter(r => !r.mejor_proveedor_id);
    const csv = ['Clave,Descripcion,Departamento,Clasificacion,Cantidad', ...sin.map(r =>
      `"${r.clave}","${(r.descripcion || '').replace(/"/g, '""')}","${r.departamento || ''}","${r.clasificacion || ''}",${r.cantidad_sugerida}`
    )].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sin_proveedor_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  async function generarOCs() {
    if (!user) return;
    const items = Object.entries(seleccion);
    if (!items.length) { toast.error('Selecciona al menos un producto.'); return; }

    // Cargar info de proveedores (monto minimo)
    const provIds = Array.from(new Set(items.map(([, v]) => v.proveedor_id)));
    const { data: provData } = await supabase.from('proveedores')
      .select('id, nombre, monto_minimo_pedido').in('id', provIds);
    const provMap = new Map((provData || []).map((p: any) => [p.id, p]));

    // Agrupar por proveedor
    const grupos: Record<string, { items: typeof items; subtotal: number }> = {};
    items.forEach((entry) => {
      const [, v] = entry;
      if (!grupos[v.proveedor_id]) grupos[v.proveedor_id] = { items: [], subtotal: 0 };
      grupos[v.proveedor_id].items.push(entry);
      grupos[v.proveedor_id].subtotal += v.cantidad * v.precio;
    });

    // Avisos
    const avisos: string[] = [];
    Object.entries(grupos).forEach(([pid, g]) => {
      const p: any = provMap.get(pid);
      const min = Number(p?.monto_minimo_pedido || 0);
      if (min > 0 && g.subtotal < min) {
        avisos.push(`${p?.nombre}: $${g.subtotal.toFixed(2)} < mínimo $${min.toLocaleString()}`);
      }
      if (g.subtotal > umbralAprob) {
        avisos.push(`${p?.nombre}: $${g.subtotal.toLocaleString()} > umbral $${umbralAprob.toLocaleString()} — requiere aprobación`);
      }
    });
    if (avisos.length && !confirm(`Avisos:\n\n${avisos.join('\n')}\n\n¿Generar OCs de todos modos?`)) return;

    // Mapa código de sucursal -> id (para desglosar por sucursal real)
    const { data: sucData } = await supabase.from('sucursales').select('id, codigo').eq('activo', true);
    const sucMap = new Map((sucData || []).map((s: any) => [s.codigo, s.id]));
    const sucursalesReales = SUCURSALES_OPCIONES.filter(s => s.code !== '__all__').map(s => s.code);

    // Construir el desglose por sucursal para cada producto seleccionado.
    // Si el admin ya está viendo una sucursal específica (no consolidado),
    // toda la cantidad seleccionada va a esa sola sucursal.
    const itemsPayload: { producto_id: string; proveedor_id: string; sucursal_id: string; cantidad: number; precio_unitario: number }[] = [];

    if (sucursalLocal !== '__all__') {
      const sucId = sucMap.get(sucursalLocal) as string | undefined;
      if (!sucId) { toast.error('No se encontró la sucursal seleccionada'); return; }
      items.forEach(([producto_id, v]) => {
        itemsPayload.push({ producto_id, proveedor_id: v.proveedor_id, sucursal_id: sucId, cantidad: v.cantidad, precio_unitario: v.precio });
      });
    } else {
      const productoIds = items.map(([producto_id]) => producto_id);
      for (const code of sucursalesReales) {
        const sucId = sucMap.get(code) as string | undefined;
        if (!sucId) continue;
        let desglose: Pendiente[] = [];
        try {
          desglose = await rpcPaginate<Pendiente>('productos_pendientes_compra', {
            p_fecha_corte: null, p_sucursal_codigo: code, p_periodo_referencia: periodo,
          });
        } catch {
          continue;
        }
        const porProducto = new Map(desglose.map(d => [d.producto_id, d.cantidad_sugerida]));
        items.forEach(([producto_id, v]) => {
          if (!productoIds.includes(producto_id)) return;
          const cantidadSucursal = porProducto.get(producto_id) || 0;
          if (cantidadSucursal > 0) {
            itemsPayload.push({ producto_id, proveedor_id: v.proveedor_id, sucursal_id: sucId, cantidad: cantidadSucursal, precio_unitario: v.precio });
          }
        });
      }
    }

    if (!itemsPayload.length) { toast.error('No se pudo desglosar por sucursal — revisa los Sugeridos.'); return; }

    const { data, error } = await (supabase as any).rpc('generar_ordenes_compra_desde_cotizador', { p_items: itemsPayload });
    if (error) { toast.error(error.message); return; }
    const gruposCreados = (data as any)?.grupos || [];
    toast.success(`${gruposCreados.length} orden(es) de compra generada(s) — ya puedes verlas y enviarlas a revisión de sucursal.`);
    navigate('/ordenes-compra');
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-blue-300 bg-blue-50 text-blue-900 px-3 py-2 text-sm">
        ℹ <strong>{rows.length}</strong> productos necesitan compra según Sugeridos ({sucursalLabel}, período {periodo} días)
        {fechaEfectiva && <> · datos al <strong>{fechaEfectiva}</strong></>}
      </div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Calculator className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Cotizador — Productos pendientes de compra</h1>
            <p className="text-sm text-muted-foreground">Filtro por existencia + sort por precio. Una OC por proveedor.</p>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <Select value={sucursalLocal} onValueChange={setSucursalLocal}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SUCURSALES_OPCIONES.map(s => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(periodo)} onValueChange={(v) => setPeriodo(parseInt(v) as 7 | 14 | 30)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 días</SelectItem>
              <SelectItem value="14">14 días</SelectItem>
              <SelectItem value="30">30 días</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={cargar} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refrescar
          </Button>
          <Dialog open={manualOpen} onOpenChange={setManualOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="gap-2"><Search className="h-4 w-4" /> Cotizar manual</Button>
            </DialogTrigger>
            <CotizarManualDialog onClose={() => setManualOpen(false)} onAdd={(prod, alt) => {
              setRows(prev => [{
                producto_id: prod.id,
                clave: prod.clave,
                descripcion: prod.descripcion,
                clasificacion: null, departamento: null,
                cantidad_sugerida: alt.cantidad_sugerida,
                ventas_periodo: 0, ddi_periodo: 0, comentario_resumen: 'Manual',
                mejor_proveedor_id: alt.proveedor_id,
                mejor_proveedor_nombre: alt.proveedor_nombre,
                mejor_precio: alt.precio_unitario,
                mejor_existencia: alt.existencia_proveedor,
                proveedores_disponibles: 1,
                total_estimado: alt.monto_total,
              }, ...prev]);
              setSeleccion(prev => ({
                ...prev,
                [prod.id]: {
                  proveedor_id: alt.proveedor_id,
                  cantidad: alt.cantidad_sugerida,
                  precio: Number(alt.precio_unitario),
                  descripcion: prod.descripcion,
                  clave: prod.clave,
                },
              }));
              setManualOpen(false);
            }} />
          </Dialog>
        </div>
      </div>

      <Card className="p-3 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900">
        <p className="text-sm">
          📊 <strong>{resumen.total}</strong> productos necesitan compra según Sugeridos (período {periodo} días).
          Inversión estimada: <strong>${resumen.inv.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
        </p>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3"><p className="text-xs text-muted-foreground">A comprar</p><p className="text-xl font-bold">{resumen.total}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Con proveedor</p><p className="text-xl font-bold text-emerald-600">{resumen.conProv}</p></Card>
        <Card className="p-3 flex items-start justify-between">
          <div><p className="text-xs text-muted-foreground">Sin proveedor con stock</p><p className="text-xl font-bold text-rose-600">{resumen.sinProv}</p></div>
          {resumen.sinProv > 0 && <Button size="sm" variant="ghost" onClick={descargarSinProveedor}><Download className="h-3.5 w-3.5" /></Button>}
        </Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">Inversión estimada</p><p className="text-xl font-bold">${resumen.inv.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</p></Card>
        <Card className="p-3"><p className="text-xs text-muted-foreground">OCs a generar</p><p className="text-xl font-bold">{resumen.proveedoresUnicos}</p></Card>
      </div>

      <Card className="p-3 flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">Departamento</Label>
          <Select value={filtroDepto} onValueChange={setFiltroDepto}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {deptos.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Clasificación</Label>
          <Select value={filtroClasif} onValueChange={setFiltroClasif}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {clasifs.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Proveedor</Label>
          <Select value={filtroProv} onValueChange={setFiltroProv}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {provs.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={soloSinProv} onCheckedChange={(v) => setSoloSinProv(!!v)} />
          Solo sin proveedor
        </label>
      </Card>

      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Clave</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Cantidad</TableHead>
              <TableHead>Mejor proveedor</TableHead>
              <TableHead className="text-right">Precio U.</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Prov. disp.</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Cargando…</TableCell></TableRow>}
            {!loading && !rowsFiltradas.length && <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">Sin productos pendientes.</TableCell></TableRow>}
            {rowsFiltradas.map(r => {
              const sin = !r.mejor_proveedor_id;
              const checked = !!seleccion[r.producto_id];
              return (
                <TableRow key={r.producto_id} className={sin ? 'bg-rose-50 dark:bg-rose-950/30' : ''}>
                  <TableCell>
                    <Checkbox checked={checked} onCheckedChange={(v) => toggleRow(r, !!v)} disabled={sin} />
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.clave}</TableCell>
                  <TableCell className="text-xs max-w-[300px] truncate">{r.descripcion}
                    <div className="text-[10px] text-muted-foreground">{r.departamento} {r.clasificacion && `· ${r.clasificacion}`}</div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.cantidad_sugerida}</TableCell>
                  <TableCell>
                    {sin
                      ? <Badge variant="destructive">Sin proveedor con stock</Badge>
                      : <span className="text-sm">{r.mejor_proveedor_nombre}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.mejor_precio ? `$${Number(r.mejor_precio).toFixed(2)}` : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{r.total_estimado ? `$${Number(r.total_estimado).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.proveedores_disponibles}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => abrirCambiarProv(r)} className="gap-1">
                      <Replace className="h-3.5 w-3.5" />
                      {sin ? 'Ver alternativas' : 'Cambiar'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Footer fijo */}
      <div className="sticky bottom-0 z-10 bg-background border-t -mx-4 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <ShoppingCart className="inline h-4 w-4 mr-1" />
          <strong>{resumen.seleccionados}</strong> productos seleccionados ·
          Total: <strong>${resumen.totalSel.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</strong>
          {resumen.totalSel > umbralAprob && (
            <span className="ml-2 text-amber-600"><AlertTriangle className="inline h-3.5 w-3.5" /> requiere aprobación</span>
          )}
        </div>
        <Button onClick={generarOCs} disabled={!resumen.seleccionados} className="gap-2">
          <Send className="h-4 w-4" /> Generar OCs ({resumen.proveedoresUnicos} proveedores)
        </Button>
      </div>

      {/* Modal cambiar/alternativas */}
      <Dialog open={!!cambiarFor} onOpenChange={(o) => !o && setCambiarFor(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{cambiarFor?.clave} — proveedores disponibles</DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead><TableHead>Proveedor</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Existencia</TableHead>
                <TableHead className="text-right">Crédito</TableHead>
                <TableHead className="text-right">Lead</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!alternativas.length && <TableRow><TableCell colSpan={7} className="text-center py-4 text-muted-foreground">Sin proveedores en lista de precios.</TableCell></TableRow>}
              {alternativas.map(a => {
                const cumple = a.existencia_proveedor >= (cambiarFor?.cantidad_sugerida || 0);
                return (
                  <TableRow key={a.proveedor_id} className={!cumple ? 'opacity-60' : ''}>
                    <TableCell>#{a.ranking}</TableCell>
                    <TableCell>{a.proveedor_nombre} {a.con_oferta && <Badge variant="secondary" className="ml-1">Oferta</Badge>}</TableCell>
                    <TableCell className="text-right">${Number(a.precio_unitario).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      {a.existencia_proveedor}
                      {!cumple && <Badge variant="destructive" className="ml-1 text-[10px]">parcial</Badge>}
                    </TableCell>
                    <TableCell className="text-right">{a.dias_credito}d</TableCell>
                    <TableCell className="text-right">{a.lead_time_dias}d</TableCell>
                    <TableCell><Button size="sm" onClick={() => elegirAlternativa(a)}>Elegir</Button></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// === Submódulo: cotizar producto manual ===
function CotizarManualDialog({ onAdd, onClose }: {
  onAdd: (prod: { id: string; clave: string; descripcion: string }, alt: Alternativa) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<{ id: string; clave: string; descripcion: string }[]>([]);
  const [sel, setSel] = useState<{ id: string; clave: string; descripcion: string } | null>(null);
  const [cant, setCant] = useState(1);
  const [alts, setAlts] = useState<Alternativa[]>([]);

  async function buscar() {
    if (q.trim().length < 2) return;
    const { data } = await supabase
      .from('productos')
      .select('id, sku, codigo_barras, nombre, descripcion')
      .or(`sku.ilike.%${q}%,codigo_barras.ilike.%${q}%,nombre.ilike.%${q}%,descripcion.ilike.%${q}%`)
      .eq('activo', true).limit(20);
    setHits((data || []).map((p: any) => ({
      id: p.id, clave: p.codigo_barras || p.sku, descripcion: p.descripcion || p.nombre,
    })));
  }

  async function recomendar() {
    if (!sel) return;
    const { data } = await (supabase as any).rpc('recomendar_proveedor', {
      p_producto_id: sel.id, p_cantidad_requerida: cant,
    });
    setAlts((data || []) as Alternativa[]);
    if (!data?.length) toast.warning('Sin proveedores con stock suficiente.');
  }

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader><DialogTitle>Cotizar producto manual</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div className="flex gap-2">
          <Input placeholder="Buscar SKU / código / descripción…" value={q}
            onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()} />
          <Button onClick={buscar}><Search className="h-4 w-4" /></Button>
        </div>
        {hits.length > 0 && !sel && (
          <div className="max-h-48 overflow-auto border rounded">
            {hits.map(p => (
              <button key={p.id} className="w-full text-left p-2 hover:bg-accent border-b last:border-0"
                onClick={() => { setSel(p); setHits([]); }}>
                <span className="font-mono text-xs">{p.clave}</span> — <span className="text-sm">{p.descripcion}</span>
              </button>
            ))}
          </div>
        )}
        {sel && (
          <div className="flex items-end gap-2">
            <div className="flex-1"><Label className="text-xs">Producto</Label><p className="text-sm">{sel.clave} — {sel.descripcion}</p></div>
            <div className="w-28"><Label className="text-xs">Cantidad</Label><Input type="number" value={cant} onChange={e => setCant(parseInt(e.target.value || '0'))} /></div>
            <Button onClick={recomendar}><Sparkles className="h-4 w-4 mr-1" />Recomendar</Button>
            <Button variant="ghost" onClick={() => { setSel(null); setAlts([]); }}>Cambiar</Button>
          </div>
        )}
        {alts.length > 0 && sel && (
          <Table>
            <TableHeader><TableRow>
              <TableHead>#</TableHead><TableHead>Proveedor</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-right">Existencia</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {alts.map(a => (
                <TableRow key={a.proveedor_id}>
                  <TableCell>#{a.ranking}</TableCell>
                  <TableCell>{a.proveedor_nombre}</TableCell>
                  <TableCell className="text-right">${Number(a.precio_unitario).toFixed(2)}</TableCell>
                  <TableCell className="text-right">{a.existencia_proveedor}</TableCell>
                  <TableCell><Button size="sm" onClick={() => onAdd(sel, a)}>Agregar</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="flex justify-end"><Button variant="ghost" onClick={onClose}>Cerrar</Button></div>
      </div>
    </DialogContent>
  );
}
