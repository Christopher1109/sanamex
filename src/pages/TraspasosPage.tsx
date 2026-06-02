import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Eye, Search } from 'lucide-react';
import { toast } from 'sonner';

const estadoBadge: Record<string, string> = { pendiente: 'secondary', aprobado: 'default', completado: 'outline', rechazado: 'destructive' };

interface SucursalRow { id: string; nombre: string; codigo: string; almacen_id: string | null; }

const TraspasosPage = () => {
  const { selectedSucursal } = useSucursal();
  const [traspasos, setTraspasos] = useState<any[]>([]);
  const [sucursalesConAlmacen, setSucursalesConAlmacen] = useState<SucursalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ sucursal_origen_id: '', sucursal_destino_id: '', notas: '' });

  const [inventarioOrigen, setInventarioOrigen] = useState<any[]>([]);
  const [lineas, setLineas] = useState<{ lote_id: string; cantidad: number; nombre: string; lote_nombre: string; disponible: number }[]>([]);
  const [searchProd, setSearchProd] = useState('');

  const [showDetail, setShowDetail] = useState<any>(null);
  const [lineasDetail, setLineasDetail] = useState<any[]>([]);

  useEffect(() => { if (selectedSucursal) { load(); loadSucursales(); } }, [selectedSucursal]);

  const load = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    const { data: alms } = await supabase.from('almacenes').select('id').eq('sucursal_id', selectedSucursal.id);
    const almIds = (alms || []).map(a => a.id);

    let query = supabase.from('traspasos')
      .select('*, origen:almacenes!traspasos_almacen_origen_id_fkey(nombre, sucursal_id, sucursales:sucursales(nombre)), destino:almacenes!traspasos_almacen_destino_id_fkey(nombre, sucursal_id, sucursales:sucursales(nombre))')
      .order('created_at', { ascending: false }).limit(50);

    if (almIds.length > 0) {
      query = query.or(`almacen_origen_id.in.(${almIds.join(',')}),almacen_destino_id.in.(${almIds.join(',')})`);
    }

    const { data } = await query;
    setTraspasos(data || []);
    setLoading(false);
  };

  const loadSucursales = async () => {
    // Trae sucursales activas y resuelve su almacén principal (el más antiguo activo)
    const { data: sucs } = await supabase
      .from('sucursales')
      .select('id, nombre, codigo')
      .eq('activo', true)
      .order('nombre');
    const { data: alms } = await supabase
      .from('almacenes')
      .select('id, sucursal_id, created_at')
      .eq('activo', true)
      .order('created_at', { ascending: true });

    const firstAlm = new Map<string, string>();
    for (const a of (alms || [])) {
      if (!firstAlm.has(a.sucursal_id)) firstAlm.set(a.sucursal_id, a.id);
    }
    setSucursalesConAlmacen(
      (sucs || []).map(s => ({ id: s.id, nombre: s.nombre, codigo: s.codigo, almacen_id: firstAlm.get(s.id) || null }))
    );
  };

  const onSelectOrigen = async (sucursalId: string) => {
    setForm({ ...form, sucursal_origen_id: sucursalId });
    setLineas([]);
    setSearchProd('');
    const suc = sucursalesConAlmacen.find(s => s.id === sucursalId);
    if (!suc?.almacen_id) {
      setInventarioOrigen([]);
      toast.error('La sucursal origen no tiene almacén activo');
      return;
    }
    const { data } = await supabase.from('inventario')
      .select('*, lotes(id, numero_lote, fecha_caducidad, producto_id, costo_unitario, productos(nombre, sku))')
      .eq('almacen_id', suc.almacen_id)
      .gt('cantidad', 0)
      .order('cantidad', { ascending: false })
      .limit(5000);
    setInventarioOrigen(data || []);
  };

  const addLinea = (inv: any) => {
    const loteId = (inv.lotes as any)?.id;
    if (lineas.some(l => l.lote_id === loteId)) { toast.error('Ya está agregado'); return; }
    setLineas([...lineas, {
      lote_id: loteId,
      cantidad: 1,
      nombre: (inv.lotes as any)?.productos?.nombre || '',
      lote_nombre: (inv.lotes as any)?.numero_lote || '',
      disponible: inv.cantidad,
    }]);
  };

  const updateCantidad = (idx: number, cant: number) => {
    const nl = [...lineas];
    nl[idx] = { ...nl[idx], cantidad: Math.min(cant, nl[idx].disponible) };
    setLineas(nl);
  };

  const save = async () => {
    if (!form.sucursal_origen_id || !form.sucursal_destino_id) { toast.error('Seleccione sucursal origen y destino'); return; }
    if (form.sucursal_origen_id === form.sucursal_destino_id) { toast.error('Origen y destino deben ser diferentes'); return; }
    if (lineas.length === 0) { toast.error('Agregue al menos un producto'); return; }

    const sucOrigen = sucursalesConAlmacen.find(s => s.id === form.sucursal_origen_id);
    const sucDestino = sucursalesConAlmacen.find(s => s.id === form.sucursal_destino_id);
    if (!sucOrigen?.almacen_id || !sucDestino?.almacen_id) {
      toast.error('Alguna sucursal no tiene almacén activo');
      return;
    }

    const user = (await supabase.auth.getUser()).data.user;
    const { data: traspaso, error } = await supabase.from('traspasos').insert({
      almacen_origen_id: sucOrigen.almacen_id,
      almacen_destino_id: sucDestino.almacen_id,
      notas: form.notas || null,
      solicitado_por: user?.id,
    }).select().single();

    if (error) { toast.error('Error al crear traspaso'); return; }

    const lineasInsert = lineas.map(l => ({
      traspaso_id: traspaso.id,
      lote_id: l.lote_id,
      cantidad: l.cantidad,
    }));
    await supabase.from('traspaso_lineas').insert(lineasInsert);

    await supabase.from('audit_log').insert({
      entidad: 'traspaso', accion: 'Traspaso creado', entidad_id: traspaso.id,
      usuario_id: user?.id, usuario_nombre: user?.email,
      sucursal_id: selectedSucursal?.id,
      datos_despues: { productos: lineas.length, sucursal_origen: sucOrigen.nombre, sucursal_destino: sucDestino.nombre },
    });

    toast.success('Traspaso creado');
    load();
    setDialogOpen(false);
  };

  const updateEstado = async (id: string, estado: string) => {
    const user = (await supabase.auth.getUser()).data.user;

    if (estado === 'completado') {
      const traspaso = traspasos.find(t => t.id === id);
      if (!traspaso) return;

      const { data: tLineas } = await supabase.from('traspaso_lineas')
        .select('*, lotes(costo_unitario, producto_id)').eq('traspaso_id', id);

      for (const linea of (tLineas || [])) {
        const { data: invOrigen } = await supabase.from('inventario')
          .select('id, cantidad').eq('almacen_id', traspaso.almacen_origen_id).eq('lote_id', linea.lote_id).limit(1);

        if (invOrigen?.[0]) {
          const newCant = Math.max(0, invOrigen[0].cantidad - linea.cantidad);
          await supabase.from('inventario').update({ cantidad: newCant }).eq('id', invOrigen[0].id);
        }

        const { data: invDest } = await supabase.from('inventario')
          .select('id, cantidad').eq('almacen_id', traspaso.almacen_destino_id).eq('lote_id', linea.lote_id).limit(1);

        if (invDest?.[0]) {
          await supabase.from('inventario').update({ cantidad: invDest[0].cantidad + linea.cantidad }).eq('id', invDest[0].id);
        } else {
          await supabase.from('inventario').insert({ almacen_id: traspaso.almacen_destino_id, lote_id: linea.lote_id, cantidad: linea.cantidad });
        }

        const origenSuc = (traspaso.origen as any)?.sucursal_id;
        const destSuc = (traspaso.destino as any)?.sucursal_id;

        await supabase.from('movimientos_inventario').insert({
          almacen_id: traspaso.almacen_origen_id, lote_id: linea.lote_id, tipo: 'traspaso_salida',
          cantidad: linea.cantidad, costo_unitario: (linea.lotes as any)?.costo_unitario || 0,
          referencia_tipo: 'traspaso', referencia_id: id,
          usuario_id: user?.id, sucursal_id: origenSuc,
          notas: `Traspaso salida`,
        });
        await supabase.from('movimientos_inventario').insert({
          almacen_id: traspaso.almacen_destino_id, lote_id: linea.lote_id, tipo: 'traspaso_entrada',
          cantidad: linea.cantidad, costo_unitario: (linea.lotes as any)?.costo_unitario || 0,
          referencia_tipo: 'traspaso', referencia_id: id,
          usuario_id: user?.id, sucursal_id: destSuc,
          notas: `Traspaso entrada`,
        });
      }
    }

    const updates: any = { estado };
    if (estado === 'completado') updates.recibido_por = user?.id;
    const { error } = await supabase.from('traspasos').update(updates).eq('id', id);
    if (error) toast.error('Error'); else {
      await supabase.from('audit_log').insert({
        entidad: 'traspaso', accion: `Traspaso ${estado}`, entidad_id: id,
        usuario_id: user?.id, usuario_nombre: user?.email,
        sucursal_id: selectedSucursal?.id,
      });
      toast.success(`Traspaso ${estado}`);
      load();
    }
  };

  const viewDetail = async (traspaso: any) => {
    setShowDetail(traspaso);
    const { data } = await supabase.from('traspaso_lineas')
      .select('*, lotes(numero_lote, productos(nombre, sku))').eq('traspaso_id', traspaso.id);
    setLineasDetail(data || []);
  };

  const filteredInventario = inventarioOrigen.filter(inv => {
    if (!searchProd) return true;
    const s = searchProd.toLowerCase();
    return (inv.lotes as any)?.productos?.nombre?.toLowerCase().includes(s) ||
           (inv.lotes as any)?.productos?.sku?.toLowerCase().includes(s) ||
           (inv.lotes as any)?.numero_lote?.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Traspasos entre Sucursales</h1><p className="text-muted-foreground">{selectedSucursal?.nombre} — Movimiento de inventario entre sucursales</p></div>
        <Button onClick={() => { setForm({ sucursal_origen_id: '', sucursal_destino_id: '', notas: '' }); setLineas([]); setInventarioOrigen([]); setSearchProd(''); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Nuevo Traspaso</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Origen</TableHead><TableHead>Destino</TableHead><TableHead>Productos</TableHead><TableHead>Estado</TableHead><TableHead>Acciones</TableHead></TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando...</TableCell></TableRow> :
               traspasos.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin traspasos</TableCell></TableRow> :
               traspasos.map(t => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs">{new Date(t.created_at).toLocaleDateString('es-MX')}</TableCell>
                  <TableCell>{(t.origen as any)?.sucursales?.nombre}</TableCell>
                  <TableCell>{(t.destino as any)?.sucursales?.nombre}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => viewDetail(t)}><Eye className="h-4 w-4 mr-1" />Ver</Button>
                  </TableCell>
                  <TableCell><Badge variant={(estadoBadge[t.estado] || 'secondary') as any}>{t.estado}</Badge></TableCell>
                  <TableCell className="space-x-1">
                    {t.estado === 'pendiente' && <>
                      <Button size="sm" variant="outline" onClick={() => updateEstado(t.id, 'aprobado')}>Aprobar</Button>
                      <Button size="sm" variant="destructive" onClick={() => updateEstado(t.id, 'rechazado')}>Rechazar</Button>
                    </>}
                    {t.estado === 'aprobado' && <Button size="sm" onClick={() => updateEstado(t.id, 'completado')}>Completar</Button>}
                  </TableCell>
                </TableRow>
               ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo Traspaso</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Sucursal Origen</Label>
              <Select value={form.sucursal_origen_id} onValueChange={onSelectOrigen}>
                <SelectTrigger><SelectValue placeholder="Seleccionar sucursal origen..." /></SelectTrigger>
                <SelectContent>{sucursalesConAlmacen.map(s => <SelectItem key={s.id} value={s.id} disabled={!s.almacen_id}>{s.codigo} — {s.nombre}{!s.almacen_id && ' (sin almacén)'}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Sucursal Destino</Label>
              <Select value={form.sucursal_destino_id} onValueChange={v => setForm({...form, sucursal_destino_id: v})}>
                <SelectTrigger><SelectValue placeholder="Seleccionar sucursal destino..." /></SelectTrigger>
                <SelectContent>{sucursalesConAlmacen.filter(s => s.id !== form.sucursal_origen_id).map(s => <SelectItem key={s.id} value={s.id} disabled={!s.almacen_id}>{s.codigo} — {s.nombre}{!s.almacen_id && ' (sin almacén)'}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {form.sucursal_origen_id && (
              <div className="border rounded-lg p-3 space-y-3">
                <Label>Agregar Productos al Traspaso</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar producto por nombre, SKU o lote..."
                    value={searchProd}
                    onChange={e => setSearchProd(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="max-h-[200px] overflow-y-auto border rounded-md">
                  {filteredInventario.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-4">Sin productos disponibles en esta sucursal</p>
                  ) : (
                    filteredInventario.slice(0, 100).map(inv => {
                      const loteId = (inv.lotes as any)?.id;
                      const alreadyAdded = lineas.some(l => l.lote_id === loteId);
                      return (
                        <button
                          key={inv.id}
                          type="button"
                          disabled={alreadyAdded}
                          className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 flex justify-between items-center transition-colors ${alreadyAdded ? 'opacity-50 bg-muted' : 'hover:bg-accent'}`}
                          onClick={() => addLinea(inv)}
                        >
                          <span>
                            <span className="font-medium">{(inv.lotes as any)?.productos?.nombre}</span>
                            <span className="text-xs text-muted-foreground ml-2">Lote: {(inv.lotes as any)?.numero_lote}</span>
                          </span>
                          <span className="text-xs font-mono">Disp: {inv.cantidad}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {lineas.length > 0 && (
              <Table>
                <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead>Lote</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Disponible</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {lineas.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.nombre}</TableCell>
                      <TableCell className="font-mono text-xs">{l.lote_nombre}</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" min="1" max={l.disponible} className="w-20 ml-auto" value={l.cantidad} onChange={e => updateCantidad(i, parseInt(e.target.value) || 1)} />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{l.disponible}</TableCell>
                      <TableCell><Button size="sm" variant="ghost" onClick={() => setLineas(lineas.filter((_, idx) => idx !== i))}>✕</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            <div><Label>Notas</Label><Textarea value={form.notas} onChange={e => setForm({...form, notas: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Crear Traspaso</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalle del Traspaso</DialogTitle></DialogHeader>
          <div className="text-sm space-y-1 mb-4">
            <p><strong>Origen:</strong> {(showDetail?.origen as any)?.sucursales?.nombre}</p>
            <p><strong>Destino:</strong> {(showDetail?.destino as any)?.sucursales?.nombre}</p>
            <p><strong>Estado:</strong> <Badge variant={(estadoBadge[showDetail?.estado] || 'secondary') as any}>{showDetail?.estado}</Badge></p>
            {showDetail?.notas && <p><strong>Notas:</strong> {showDetail.notas}</p>}
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead>Lote</TableHead><TableHead className="text-right">Cantidad</TableHead></TableRow></TableHeader>
            <TableBody>
              {lineasDetail.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground">Sin productos</TableCell></TableRow> :
               lineasDetail.map(l => (
                <TableRow key={l.id}>
                  <TableCell>{(l.lotes as any)?.productos?.nombre}</TableCell>
                  <TableCell className="font-mono text-xs">{(l.lotes as any)?.numero_lote}</TableCell>
                  <TableCell className="text-right font-bold">{l.cantidad}</TableCell>
                </TableRow>
               ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TraspasosPage;
