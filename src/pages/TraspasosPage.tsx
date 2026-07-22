import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, ArrowLeft, ArrowRight, Search, PackageCheck, X, Loader2, AlertTriangle, Truck } from 'lucide-react';
import { toast } from 'sonner';

interface SucRow { id: string; nombre: string; codigo: string; almacen_id: string | null }
interface InvRow { lote_id: string; cantidad: number; producto_id: string; producto_nombre: string; sku: string; numero_lote: string; fecha_caducidad: string | null; }
interface Linea extends InvRow { cantidad_traspaso: number }

const estadoColor: Record<string, string> = {
  enviado: 'bg-amber-100 text-amber-900',
  recibido: 'bg-green-100 text-green-900',
  cancelado: 'bg-red-100 text-red-900',
};

const TraspasosPage = () => {
  const { selectedSucursal } = useSucursal();
  const { user, userRole } = useAuth();
  const puedeAutorizarIncidencias = !!userRole && ['gerente', 'subgerente', 'admin', 'super_admin'].includes(userRole);
  const [sucursales, setSucursales] = useState<SucRow[]>([]);
  const [salientes, setSalientes] = useState<any[]>([]);
  const [entrantes, setEntrantes] = useState<any[]>([]);
  const [incidencias, setIncidencias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolviendoId, setResolviendoId] = useState<string | null>(null);
  const [notasResolucion, setNotasResolucion] = useState('');
  const [resolviendo, setResolviendo] = useState(false);

  // Wizard
  const [open, setOpen] = useState(false);
  const [paso, setPaso] = useState(1);
  const [sucDestinoId, setSucDestinoId] = useState('');
  const [inventario, setInventario] = useState<InvRow[]>([]);
  const [search, setSearch] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [comentario, setComentario] = useState('');
  const [saving, setSaving] = useState(false);

  // Recepción
  const [recepcionOpen, setRecepcionOpen] = useState(false);
  const [recepcionTraspaso, setRecepcionTraspaso] = useState<any>(null);
  const [recepcionLineas, setRecepcionLineas] = useState<any[]>([]);
  const [recepcionSaving, setRecepcionSaving] = useState(false);


  useEffect(() => { loadSucursales(); }, []);
  useEffect(() => { if (selectedSucursal) { loadTraspasos(); loadIncidencias(); } }, [selectedSucursal]);

  const loadIncidencias = async () => {
    if (!selectedSucursal) return;
    const { data } = await supabase
      .from('traspaso_incidencias')
      .select('*, traspaso:traspasos!traspaso_id(numero_traspaso, sucursal_destino_id), lote:lotes(numero_lote, producto_id, productos(nombre, sku))')
      .eq('estado', 'pendiente')
      .order('fecha_reporte', { ascending: false });
    const propias = (data || []).filter((i: any) => i.traspaso?.sucursal_destino_id === selectedSucursal.id);
    setIncidencias(propias);
  };

  const resolverIncidencia = async (id: string, accion: 'autorizar_merma' | 'autorizar_ajuste' | 'generar_complementario' | 'rechazar') => {
    setResolviendo(true);
    const { data, error } = await (supabase as any).rpc('resolver_incidencia_traspaso', {
      p_incidencia_id: id, p_accion: accion, p_notas: notasResolucion || null,
    });
    setResolviendo(false);
    if (error) return toast.error(error.message);
    const msgs: Record<string, string> = {
      autorizar_merma: 'Faltante confirmado como pérdida.',
      autorizar_ajuste: 'Sobrante confirmado — se queda en el inventario de destino.',
      generar_complementario: data?.nuevo_folio ? `Traspaso complementario ${data.nuevo_folio} generado y enviado.` : 'Corrección aplicada al inventario de origen.',
      rechazar: 'Incidencia rechazada.',
    };
    toast.success(msgs[accion]);
    setResolviendoId(null);
    setNotasResolucion('');
    loadIncidencias();
    loadTraspasos();
  };

  const loadSucursales = async () => {
    const { data: sucs } = await supabase.from('sucursales').select('id, nombre, codigo').eq('activo', true).order('nombre');
    const { data: alms } = await supabase.from('almacenes').select('id, sucursal_id, created_at').eq('activo', true).order('created_at');
    const first = new Map<string, string>();
    (alms || []).forEach(a => { if (!first.has(a.sucursal_id)) first.set(a.sucursal_id, a.id); });
    setSucursales((sucs || []).map(s => ({ ...s, almacen_id: first.get(s.id) || null })));
  };

  const sucActivaAlmId = useMemo(() => sucursales.find(s => s.id === selectedSucursal?.id)?.almacen_id || null, [sucursales, selectedSucursal]);

  const loadTraspasos = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    const sel = '*, origen:almacenes!traspasos_almacen_origen_id_fkey(nombre, sucursales(nombre)), destino:almacenes!traspasos_almacen_destino_id_fkey(nombre, sucursales(nombre))';
    const [{ data: sal }, { data: ent }] = await Promise.all([
      supabase.from('traspasos').select(sel).eq('sucursal_origen_id', selectedSucursal.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('traspasos').select(sel).eq('sucursal_destino_id', selectedSucursal.id).order('created_at', { ascending: false }).limit(50),
    ]);
    setSalientes(sal || []);
    setEntrantes(ent || []);
    setLoading(false);
  };

  // ---------- Wizard ----------
  const abrirWizard = async () => {
    if (!sucActivaAlmId) { toast.error(`La sucursal "${selectedSucursal?.nombre}" no tiene almacén activo`); return; }
    setPaso(1); setSucDestinoId(''); setSearch(''); setLineas([]); setComentario('');
    setOpen(true);
    const { data } = await supabase.from('inventario')
      .select('lote_id, cantidad, lotes!inner(numero_lote, fecha_caducidad, producto_id, productos!inner(nombre, sku))')
      .eq('almacen_id', sucActivaAlmId).gt('cantidad', 0).limit(5000);
    setInventario((data || []).map((r: any) => ({
      lote_id: r.lote_id, cantidad: r.cantidad,
      producto_id: r.lotes.producto_id, producto_nombre: r.lotes.productos.nombre, sku: r.lotes.productos.sku || '',
      numero_lote: r.lotes.numero_lote, fecha_caducidad: r.lotes.fecha_caducidad,
    })).sort((a, b) => (a.fecha_caducidad || '9999').localeCompare(b.fecha_caducidad || '9999'))); // FEFO
  };

  const inventarioFiltrado = useMemo(() => {
    const s = search.toLowerCase().trim();
    return inventario.filter(i =>
      !lineas.some(l => l.lote_id === i.lote_id) && (
        !s || i.producto_nombre.toLowerCase().includes(s) || i.sku.toLowerCase().includes(s) || i.numero_lote.toLowerCase().includes(s)
      )
    );
  }, [inventario, lineas, search]);

  const addLinea = (i: InvRow) => setLineas(prev => [...prev, { ...i, cantidad_traspaso: 1 }]);
  const setCant = (idx: number, n: number) => setLineas(prev => prev.map((l, i) => i === idx ? { ...l, cantidad_traspaso: Math.max(1, Math.min(n, l.cantidad)) } : l));
  const rmLinea = (idx: number) => setLineas(prev => prev.filter((_, i) => i !== idx));

  // Plantilla SICAR sugerida basada en lotes seleccionados
  const plantillaComentario = async () => {
    if (lineas.length === 0) return;
    const ids = [...new Set(lineas.map(l => l.lote_id))];
    const { data } = await supabase.from('lotes')
      .select('compra_id, compras(folio_factura, fecha_factura, proveedores(nombre, rfc))')
      .in('id', ids);
    const map = new Map<string, string>();
    (data || []).forEach((l: any) => {
      const c = l.compras;
      if (!c) return;
      const key = `${c.proveedores?.nombre || '?'} · Folio ${c.folio_factura || '—'} · ${c.fecha_factura || ''}`;
      map.set(key, key);
    });
    const refs = [...map.keys()];
    const txt =
      `Traspaso de ${selectedSucursal?.nombre} a ${sucursales.find(s => s.id === sucDestinoId)?.nombre}.\n` +
      `Productos: ${lineas.length} línea(s), total ${lineas.reduce((s, l) => s + l.cantidad_traspaso, 0)} pza.\n` +
      (refs.length ? `Origen de compra:\n  - ${refs.join('\n  - ')}` : `Origen de compra: (sin compra trazable)`) +
      `\nMotivo: `;
    setComentario(txt);
  };

  const guardar = async () => {
    if (!comentario.trim() || comentario.trim().length < 10) { toast.error('El comentario es obligatorio (mín. 10 caracteres) para trazabilidad SICAR'); return; }
    const destino = sucursales.find(s => s.id === sucDestinoId);
    if (!destino?.almacen_id || !selectedSucursal || !sucActivaAlmId) return;
    setSaving(true);
    const { data, error } = await supabase.rpc('enviar_traspaso', {
      p_sucursal_origen_id: selectedSucursal.id,
      p_almacen_origen_id: sucActivaAlmId,
      p_sucursal_destino_id: destino.id,
      p_almacen_destino_id: destino.almacen_id,
      p_lineas: lineas.map(l => ({ lote_id: l.lote_id, cantidad: l.cantidad_traspaso })),
      p_notas: comentario.trim(),
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Traspaso ${(data as any).numero} enviado`);
    setOpen(false); loadTraspasos();
  };

  const abrirRecepcion = async (t: any) => {
    setRecepcionTraspaso(t);
    setRecepcionOpen(true);
    setRecepcionLineas([]);
    const { data } = await supabase.from('traspaso_lineas')
      .select('id, cantidad, lote_id, lotes(numero_lote, fecha_caducidad, productos(nombre, sku))')
      .eq('traspaso_id', t.id);
    setRecepcionLineas((data || []).map((l: any) => ({
      id: l.id,
      cantidad_enviada: l.cantidad,
      producto_nombre: l.lotes?.productos?.nombre || '—',
      producto_sku: l.lotes?.productos?.sku || '',
      numero_lote: l.lotes?.numero_lote || '—',
      fecha_caducidad: l.lotes?.fecha_caducidad || null,
      cantidad_recibida_input: String(l.cantidad),
      merma_input: '0',
      notas_input: '',
    })));
  };

  const confirmarRecepcion = async () => {
    if (!recepcionTraspaso) return;
    // Validaciones básicas
    let incidenciasQueSeGeneraran = 0;
    for (const l of recepcionLineas) {
      const rec = parseInt(l.cantidad_recibida_input) || 0;
      const merma = parseInt(l.merma_input) || 0;
      if (rec < 0) {
        toast.error(`Cantidad recibida inválida para ${l.producto_nombre}`); return;
      }
      if (merma < 0 || merma > rec) {
        toast.error(`Merma no puede superar la cantidad recibida (${l.producto_nombre})`); return;
      }
      if (rec !== l.cantidad_enviada) incidenciasQueSeGeneraran++;
    }
    if (incidenciasQueSeGeneraran > 0) {
      const ok = confirm(`${incidenciasQueSeGeneraran} línea(s) no coinciden exactamente con lo enviado y van a generar una incidencia para que gerencia/administración las autorice. ¿Continuar?`);
      if (!ok) return;
    }
    setRecepcionSaving(true);
    const payload = recepcionLineas.map(l => ({
      linea_id: l.id,
      cantidad_recibida: parseInt(l.cantidad_recibida_input) || 0,
      merma: parseInt(l.merma_input) || 0,
      notas: l.notas_input || null,
    }));
    const { error } = await supabase.rpc('recibir_traspaso_confirmado', {
      p_traspaso_id: recepcionTraspaso.id,
      p_lineas: payload,
    });
    setRecepcionSaving(false);
    if (error) { toast.error(error.message); return; }
    const totalMerma = payload.reduce((s, p) => s + p.merma, 0);
    toast.success(incidenciasQueSeGeneraran > 0
      ? `Traspaso recibido. ${incidenciasQueSeGeneraran} incidencia(s) quedaron pendientes de autorización.`
      : totalMerma > 0
      ? `Traspaso recibido. ${totalMerma} pza en merma se registraron en el módulo de mermas.`
      : 'Traspaso recibido. Stock sumado al almacén.');
    setRecepcionOpen(false);
    setRecepcionTraspaso(null);
    loadTraspasos();
  };


  const cancelar = async (id: string) => {
    const motivo = prompt('Motivo de cancelación:');
    if (!motivo) return;
    const { error } = await supabase.rpc('cancelar_traspaso', { p_traspaso_id: id, p_motivo: motivo });
    if (error) { toast.error(error.message); return; }
    toast.success('Traspaso cancelado. Stock devuelto al origen.');
    loadTraspasos();
  };

  const renderRow = (t: any, esEntrante: boolean) => (
    <TableRow key={t.id}>
      <TableCell className="font-mono text-xs">{t.numero_traspaso || '—'}</TableCell>
      <TableCell className="text-xs">{new Date(t.fecha_envio || t.created_at).toLocaleDateString('es-MX')}</TableCell>
      <TableCell className="text-sm">{(t.origen as any)?.sucursales?.nombre} → {(t.destino as any)?.sucursales?.nombre}</TableCell>
      <TableCell><Badge className={estadoColor[t.estado] || ''} variant="secondary">{t.estado}</Badge></TableCell>
      <TableCell className="text-xs max-w-md truncate" title={t.notas}>{t.notas}</TableCell>
      <TableCell className="text-right">
        {esEntrante && t.estado === 'enviado' && (
          <Button size="sm" onClick={() => abrirRecepcion(t)}>
            <PackageCheck className="h-4 w-4 mr-1" /> Recibir
          </Button>
        )}

        {!esEntrante && t.estado === 'enviado' && (
          <Button size="sm" variant="outline" onClick={() => cancelar(t.id)}>Cancelar</Button>
        )}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Traspasos entre Sucursales</h1>
          <p className="text-muted-foreground text-sm">Sucursal activa: {selectedSucursal?.nombre || '—'}</p>
        </div>
        <Button onClick={abrirWizard}><Plus className="h-4 w-4 mr-2" /> Nuevo Traspaso</Button>
      </div>

      <Tabs defaultValue="entrantes">
        <TabsList>
          <TabsTrigger value="entrantes">
            Bandeja entrante {entrantes.filter(t => t.estado === 'enviado').length > 0 && <Badge className="ml-2" variant="default">{entrantes.filter(t => t.estado === 'enviado').length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="salientes">Enviados</TabsTrigger>
          {puedeAutorizarIncidencias && (
            <TabsTrigger value="incidencias" className="gap-2">
              <AlertTriangle className="h-4 w-4" /> Incidencias
              {incidencias.length > 0 && <Badge variant="destructive" className="ml-1">{incidencias.length}</Badge>}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="entrantes">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Folio</TableHead><TableHead>Fecha</TableHead><TableHead>Ruta</TableHead><TableHead>Estado</TableHead><TableHead>Notas</TableHead><TableHead className="text-right">Acción</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={6} className="text-center py-6">Cargando…</TableCell></TableRow>
                  : entrantes.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Sin traspasos entrantes</TableCell></TableRow>
                  : entrantes.map(t => renderRow(t, true))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="salientes">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Folio</TableHead><TableHead>Fecha</TableHead><TableHead>Ruta</TableHead><TableHead>Estado</TableHead><TableHead>Notas</TableHead><TableHead className="text-right">Acción</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={6} className="text-center py-6">Cargando…</TableCell></TableRow>
                  : salientes.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Sin traspasos enviados</TableCell></TableRow>
                  : salientes.map(t => renderRow(t, false))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        {puedeAutorizarIncidencias && (
          <TabsContent value="incidencias" className="space-y-3">
            {incidencias.length === 0 ? (
              <Card><CardContent className="p-6 text-center text-muted-foreground">Sin incidencias pendientes.</CardContent></Card>
            ) : incidencias.map((inc: any) => {
              const esFaltante = inc.tipo === 'faltante';
              return (
              <Card key={inc.id} className={esFaltante ? 'border-rose-300' : 'border-blue-300'}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium flex items-center gap-2">
                        <AlertTriangle className={`h-4 w-4 ${esFaltante ? 'text-rose-600' : 'text-blue-600'}`} />
                        {esFaltante ? 'Faltante' : 'Sobrante'} en traspaso {inc.traspaso?.numero_traspaso}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {inc.lote?.productos?.nombre} ({inc.lote?.productos?.sku}) · Lote {inc.lote?.numero_lote} ·
                        <span className={`font-semibold ${esFaltante ? 'text-rose-700' : 'text-blue-700'}`}>
                          {' '}{esFaltante ? 'faltaron' : 'llegaron de más'} {inc.cantidad} unidades
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {esFaltante
                          ? 'El destino ya se descontó de origen — hay que decidir si se dio por perdido o si aún se puede enviar.'
                          : 'El sobrante ya se sumó al inventario de destino — hay que decidir si se queda ahí o si se corrige el inventario de origen.'}
                      </p>
                      {inc.notas_reporte && <p className="text-xs text-muted-foreground mt-1">Nota de quien recibió: "{inc.notas_reporte}"</p>}
                    </div>
                    <Badge variant="outline">Pendiente</Badge>
                  </div>

                  {resolviendoId === inc.id ? (
                    <div className="space-y-2 border-t pt-3">
                      <Label className="text-xs">Notas de la resolución (opcional)</Label>
                      <Textarea value={notasResolucion} onChange={e => setNotasResolucion(e.target.value)} rows={2} placeholder="Ej. Se confirmó pérdida en tránsito / Origen reenvía la diferencia…" />
                      <div className="flex flex-wrap gap-2 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => { setResolviendoId(null); setNotasResolucion(''); }} disabled={resolviendo}>Cancelar</Button>
                        <Button size="sm" variant="destructive" onClick={() => resolverIncidencia(inc.id, 'rechazar')} disabled={resolviendo}>Rechazar</Button>
                        {esFaltante ? (
                          <Button size="sm" variant="outline" onClick={() => resolverIncidencia(inc.id, 'autorizar_merma')} disabled={resolviendo}>Confirmar pérdida</Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => resolverIncidencia(inc.id, 'autorizar_ajuste')} disabled={resolviendo}>Dejarlo en destino</Button>
                        )}
                        <Button size="sm" className="gap-1" onClick={() => resolverIncidencia(inc.id, 'generar_complementario')} disabled={resolviendo}>
                          <Truck className="h-3.5 w-3.5" />
                          {esFaltante ? 'Generar traspaso complementario' : 'Corregir inventario de origen'}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => setResolviendoId(inc.id)}>Resolver</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
              );
            })}
          </TabsContent>
        )}
      </Tabs>

      {/* Wizard */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo Traspaso — Paso {paso} de 3</DialogTitle></DialogHeader>

          {paso === 1 && (
            <div className="space-y-4">
              <div>
                <Label>Sucursal Destino *</Label>
                <Select value={sucDestinoId} onValueChange={setSucDestinoId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona la sucursal que recibirá" /></SelectTrigger>
                  <SelectContent>
                    {sucursales.filter(s => s.id !== selectedSucursal?.id).map(s => (
                      <SelectItem key={s.id} value={s.id} disabled={!s.almacen_id}>{s.codigo} — {s.nombre}{!s.almacen_id && ' (sin almacén)'}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">El stock se descontará de tu sucursal al enviar y se sumará al destino solo cuando confirmen la recepción (stock en tránsito).</p>
            </div>
          )}

          {paso === 2 && (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Buscar producto, SKU o lote…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="border rounded-lg">
                  <div className="px-3 py-2 border-b bg-muted text-xs font-semibold">Disponible (ordenado FEFO)</div>
                  <div className="max-h-[320px] overflow-y-auto">
                    {inventarioFiltrado.slice(0, 200).map(i => (
                      <button key={i.lote_id} onClick={() => addLinea(i)}
                        className="w-full text-left px-3 py-2 text-sm border-b last:border-b-0 hover:bg-accent">
                        <div className="font-medium truncate">{i.producto_nombre}</div>
                        <div className="text-xs text-muted-foreground flex justify-between">
                          <span>Lote {i.numero_lote} · cad {i.fecha_caducidad || '—'}</span>
                          <span className="font-mono">x{i.cantidad}</span>
                        </div>
                      </button>
                    ))}
                    {inventarioFiltrado.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">Sin resultados</p>}
                  </div>
                </div>
                <div className="border rounded-lg">
                  <div className="px-3 py-2 border-b bg-muted text-xs font-semibold">Seleccionados ({lineas.length})</div>
                  <div className="max-h-[320px] overflow-y-auto divide-y">
                    {lineas.map((l, idx) => (
                      <div key={l.lote_id} className="px-3 py-2 text-sm flex items-center gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{l.producto_nombre}</div>
                          <div className="text-xs text-muted-foreground">Lote {l.numero_lote} · disp {l.cantidad}</div>
                        </div>
                        <Input type="number" min={1} max={l.cantidad} value={l.cantidad_traspaso}
                          onChange={e => setCant(idx, parseInt(e.target.value) || 1)} className="w-20" />
                        <Button size="icon" variant="ghost" onClick={() => rmLinea(idx)}><X className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    {lineas.length === 0 && <p className="text-center text-xs text-muted-foreground py-6">Agrega lotes desde la izquierda</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          {paso === 3 && (
            <div className="space-y-4">
              <Card><CardContent className="p-4 text-sm space-y-1">
                <div className="flex justify-between"><span>Origen:</span><strong>{selectedSucursal?.nombre}</strong></div>
                <div className="flex justify-between"><span>Destino:</span><strong>{sucursales.find(s => s.id === sucDestinoId)?.nombre}</strong></div>
                <div className="flex justify-between"><span>Líneas:</span><strong>{lineas.length}</strong></div>
                <div className="flex justify-between"><span>Piezas totales:</span><strong>{lineas.reduce((s, l) => s + l.cantidad_traspaso, 0)}</strong></div>
              </CardContent></Card>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Comentario / Trazabilidad SICAR *</Label>
                  <Button size="sm" variant="outline" type="button" onClick={plantillaComentario}>Usar plantilla sugerida</Button>
                </div>
                <Textarea rows={7} value={comentario} onChange={e => setComentario(e.target.value)} maxLength={1000}
                  placeholder="Incluye Proveedor, Folio Factura, Fecha y motivo. Obligatorio para trazabilidad SICAR." />
                <p className="text-xs text-muted-foreground mt-1">{comentario.length}/1000 — mínimo 10 caracteres</p>
              </div>
            </div>
          )}

          <DialogFooter className="flex justify-between sm:justify-between">
            <Button variant="outline" onClick={() => paso > 1 ? setPaso(paso - 1) : setOpen(false)}>
              {paso > 1 ? <><ArrowLeft className="h-4 w-4 mr-1" /> Atrás</> : 'Cancelar'}
            </Button>
            {paso < 3 ? (
              <Button onClick={() => {
                if (paso === 1) { if (!sucDestinoId) return toast.error('Selecciona destino'); setPaso(2); }
                else if (paso === 2) { if (lineas.length === 0) return toast.error('Agrega al menos un lote'); setPaso(3); }
              }}>Siguiente <ArrowRight className="h-4 w-4 ml-1" /></Button>
            ) : (
              <Button onClick={guardar} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enviar traspaso
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recepción de traspaso: confirmar lote/caducidad/cantidad + reportar mermas */}
      <Dialog open={recepcionOpen} onOpenChange={(v) => { setRecepcionOpen(v); if (!v) setRecepcionTraspaso(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recibir traspaso — {recepcionTraspaso?.numero_traspaso}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Captura cuánto llegó FÍSICAMENTE en total (sea igual, menos o más de lo enviado) y, de eso, cuánto llegó
            dañado (merma). Si recibido + nada de merma no cierra con lo enviado, se genera automáticamente una
            incidencia para que gerencia/administración la revise — no se pierde nada, solo queda pendiente de autorizar.
          </p>
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Caducidad</TableHead>
                  <TableHead className="text-right">Enviado</TableHead>
                  <TableHead className="w-28">Recibido total *</TableHead>
                  <TableHead className="w-28">De eso, dañado</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recepcionLineas.map((l, i) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm">
                      <div className="font-medium">{l.producto_nombre}</div>
                      <div className="text-xs text-muted-foreground">{l.producto_sku}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.numero_lote}</TableCell>
                    <TableCell className="text-xs">{l.fecha_caducidad || '—'}</TableCell>
                    <TableCell className="text-right font-mono">{l.cantidad_enviada}</TableCell>
                    <TableCell>
                      <Input type="number" min={0} value={l.cantidad_recibida_input}
                        onChange={e => { const nl = [...recepcionLineas]; nl[i] = { ...l, cantidad_recibida_input: e.target.value }; setRecepcionLineas(nl); }} />
                      {parseInt(l.cantidad_recibida_input) > l.cantidad_enviada && (
                        <p className="text-[11px] text-amber-600 mt-0.5">Sobrante — se levantará incidencia</p>
                      )}
                      {parseInt(l.cantidad_recibida_input) < l.cantidad_enviada && (parseInt(l.merma_input) || 0) < (l.cantidad_enviada - (parseInt(l.cantidad_recibida_input) || 0)) && (
                        <p className="text-[11px] text-amber-600 mt-0.5">Faltante sin explicar — se levantará incidencia</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={0} value={l.merma_input}
                        onChange={e => { const nl = [...recepcionLineas]; nl[i] = { ...l, merma_input: e.target.value }; setRecepcionLineas(nl); }} />
                    </TableCell>
                    <TableCell>
                      <Input placeholder="Roto, mojado…" value={l.notas_input}
                        onChange={e => { const nl = [...recepcionLineas]; nl[i] = { ...l, notas_input: e.target.value }; setRecepcionLineas(nl); }} />
                    </TableCell>
                  </TableRow>
                ))}
                {recepcionLineas.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">Cargando líneas…</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecepcionOpen(false)}>Cancelar</Button>
            <Button onClick={confirmarRecepcion} disabled={recepcionSaving || recepcionLineas.length === 0}>
              {recepcionSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <PackageCheck className="h-4 w-4 mr-1" /> Confirmar recepción
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>

  );
};

export default TraspasosPage;
