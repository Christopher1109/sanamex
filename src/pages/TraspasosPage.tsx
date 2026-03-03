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
import { Plus, Eye } from 'lucide-react';
import { toast } from 'sonner';

const estadoBadge: Record<string, string> = { pendiente: 'secondary', aprobado: 'default', completado: 'outline', rechazado: 'destructive' };

const TraspasosPage = () => {
  const { selectedSucursal } = useSucursal();
  const [traspasos, setTraspasos] = useState<any[]>([]);
  const [almacenes, setAlmacenes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ almacen_origen_id: '', almacen_destino_id: '', notas: '' });

  // Product lines for traspaso
  const [inventarioOrigen, setInventarioOrigen] = useState<any[]>([]);
  const [lineas, setLineas] = useState<{ lote_id: string; cantidad: number; nombre: string; lote_nombre: string; disponible: number }[]>([]);
  const [addItem, setAddItem] = useState({ lote_id: '', cantidad: '1' });

  const [showDetail, setShowDetail] = useState<any>(null);
  const [lineasDetail, setLineasDetail] = useState<any[]>([]);

  useEffect(() => { if (selectedSucursal) { load(); loadAlmacenes(); } }, [selectedSucursal]);

  const load = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    // Get almacenes for this sucursal
    const { data: alms } = await supabase.from('almacenes').select('id').eq('sucursal_id', selectedSucursal.id);
    const almIds = (alms || []).map(a => a.id);

    let query = supabase.from('traspasos')
      .select('*, origen:almacenes!traspasos_almacen_origen_id_fkey(nombre, sucursal_id, sucursales:sucursales(nombre)), destino:almacenes!traspasos_almacen_destino_id_fkey(nombre, sucursal_id, sucursales:sucursales(nombre))')
      .order('created_at', { ascending: false }).limit(50);

    // Show traspasos where this sucursal is origin or destination
    if (almIds.length > 0) {
      query = query.or(`almacen_origen_id.in.(${almIds.join(',')}),almacen_destino_id.in.(${almIds.join(',')})`);
    }

    const { data } = await query;
    setTraspasos(data || []);
    setLoading(false);
  };

  const loadAlmacenes = async () => {
    const { data } = await supabase.from('almacenes').select('*, sucursales(nombre)').eq('activo', true);
    setAlmacenes(data || []);
  };

  const onSelectOrigen = async (almacenId: string) => {
    setForm({ ...form, almacen_origen_id: almacenId });
    setLineas([]);
    setAddItem({ lote_id: '', cantidad: '1' });
    // Load inventory for this almacen
    const { data } = await supabase.from('inventario')
      .select('*, lotes(id, numero_lote, fecha_caducidad, producto_id, costo_unitario, productos(nombre, sku))')
      .eq('almacen_id', almacenId)
      .gt('cantidad', 0)
      .order('cantidad', { ascending: false });
    setInventarioOrigen(data || []);
  };

  const addLinea = () => {
    if (!addItem.lote_id || parseInt(addItem.cantidad) <= 0) { toast.error('Seleccione producto y cantidad'); return; }
    const inv = inventarioOrigen.find(i => (i.lotes as any)?.id === addItem.lote_id);
    if (!inv) return;
    const cant = parseInt(addItem.cantidad);
    if (cant > inv.cantidad) { toast.error(`Solo hay ${inv.cantidad} disponibles`); return; }

    setLineas([...lineas, {
      lote_id: addItem.lote_id,
      cantidad: cant,
      nombre: (inv.lotes as any)?.productos?.nombre || '',
      lote_nombre: (inv.lotes as any)?.numero_lote || '',
      disponible: inv.cantidad,
    }]);
    setAddItem({ lote_id: '', cantidad: '1' });
  };

  const save = async () => {
    if (!form.almacen_origen_id || !form.almacen_destino_id) { toast.error('Seleccione origen y destino'); return; }
    if (form.almacen_origen_id === form.almacen_destino_id) { toast.error('Origen y destino deben ser diferentes'); return; }
    if (lineas.length === 0) { toast.error('Agregue al menos un producto'); return; }

    const user = (await supabase.auth.getUser()).data.user;
    const { data: traspaso, error } = await supabase.from('traspasos').insert({
      almacen_origen_id: form.almacen_origen_id,
      almacen_destino_id: form.almacen_destino_id,
      notas: form.notas || null,
      solicitado_por: user?.id,
    }).select().single();

    if (error) { toast.error('Error al crear traspaso'); return; }

    // Insert traspaso_lineas
    const lineasInsert = lineas.map(l => ({
      traspaso_id: traspaso.id,
      lote_id: l.lote_id,
      cantidad: l.cantidad,
    }));
    await supabase.from('traspaso_lineas').insert(lineasInsert);

    toast.success('Traspaso creado con productos');
    load();
    setDialogOpen(false);
  };

  const updateEstado = async (id: string, estado: string) => {
    const user = (await supabase.auth.getUser()).data.user;

    if (estado === 'completado') {
      // Get traspaso with lines
      const traspaso = traspasos.find(t => t.id === id);
      if (!traspaso) return;

      const { data: tLineas } = await supabase.from('traspaso_lineas')
        .select('*, lotes(costo_unitario, producto_id)').eq('traspaso_id', id);

      for (const linea of (tLineas || [])) {
        // Decrease from origin
        const { data: invOrigen } = await supabase.from('inventario')
          .select('id, cantidad').eq('almacen_id', traspaso.almacen_origen_id).eq('lote_id', linea.lote_id).limit(1);

        if (invOrigen?.[0]) {
          const newCant = Math.max(0, invOrigen[0].cantidad - linea.cantidad);
          await supabase.from('inventario').update({ cantidad: newCant }).eq('id', invOrigen[0].id);
        }

        // Increase in destination (upsert)
        const { data: invDest } = await supabase.from('inventario')
          .select('id, cantidad').eq('almacen_id', traspaso.almacen_destino_id).eq('lote_id', linea.lote_id).limit(1);

        if (invDest?.[0]) {
          await supabase.from('inventario').update({ cantidad: invDest[0].cantidad + linea.cantidad }).eq('id', invDest[0].id);
        } else {
          await supabase.from('inventario').insert({ almacen_id: traspaso.almacen_destino_id, lote_id: linea.lote_id, cantidad: linea.cantidad });
        }

        // Kardex movements
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
    if (error) toast.error('Error'); else { toast.success(`Traspaso ${estado}`); load(); }
  };

  const viewDetail = async (traspaso: any) => {
    setShowDetail(traspaso);
    const { data } = await supabase.from('traspaso_lineas')
      .select('*, lotes(numero_lote, productos(nombre, sku))').eq('traspaso_id', traspaso.id);
    setLineasDetail(data || []);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Traspasos entre Almacenes</h1><p className="text-muted-foreground">{selectedSucursal?.nombre} — Movimiento de inventario entre sucursales</p></div>
        <Button onClick={() => { setForm({ almacen_origen_id: '', almacen_destino_id: '', notas: '' }); setLineas([]); setInventarioOrigen([]); setDialogOpen(true); }}><Plus className="h-4 w-4 mr-2" /> Nuevo Traspaso</Button>
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
                  <TableCell>{(t.origen as any)?.sucursales?.nombre} — {(t.origen as any)?.nombre}</TableCell>
                  <TableCell>{(t.destino as any)?.sucursales?.nombre} — {(t.destino as any)?.nombre}</TableCell>
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

      {/* Create Traspaso Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo Traspaso</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Almacén Origen</Label>
              <Select value={form.almacen_origen_id} onValueChange={onSelectOrigen}>
                <SelectTrigger><SelectValue placeholder="Seleccionar origen..." /></SelectTrigger>
                <SelectContent>{almacenes.map(a => <SelectItem key={a.id} value={a.id}>{(a.sucursales as any)?.nombre} — {a.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Almacén Destino</Label>
              <Select value={form.almacen_destino_id} onValueChange={v => setForm({...form, almacen_destino_id: v})}>
                <SelectTrigger><SelectValue placeholder="Seleccionar destino..." /></SelectTrigger>
                <SelectContent>{almacenes.filter(a => a.id !== form.almacen_origen_id).map(a => <SelectItem key={a.id} value={a.id}>{(a.sucursales as any)?.nombre} — {a.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Product selection */}
            {form.almacen_origen_id && (
              <div className="border rounded-lg p-3 space-y-3">
                <Label>Agregar Productos al Traspaso</Label>
                <div className="flex gap-2">
                  <Select value={addItem.lote_id} onValueChange={v => setAddItem({...addItem, lote_id: v})}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder="Producto / Lote..." /></SelectTrigger>
                    <SelectContent>
                      {inventarioOrigen.map(inv => (
                        <SelectItem key={(inv.lotes as any)?.id} value={(inv.lotes as any)?.id}>
                          {(inv.lotes as any)?.productos?.nombre} — Lote: {(inv.lotes as any)?.numero_lote} (Disp: {inv.cantidad})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="number" min="1" className="w-20" placeholder="Cant" value={addItem.cantidad} onChange={e => setAddItem({...addItem, cantidad: e.target.value})} />
                  <Button size="sm" onClick={addLinea}><Plus className="h-4 w-4" /></Button>
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
                      <TableCell className="text-right font-bold">{l.cantidad}</TableCell>
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

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Detalle del Traspaso</DialogTitle></DialogHeader>
          <div className="text-sm space-y-1 mb-4">
            <p><strong>Origen:</strong> {(showDetail?.origen as any)?.sucursales?.nombre} — {(showDetail?.origen as any)?.nombre}</p>
            <p><strong>Destino:</strong> {(showDetail?.destino as any)?.sucursales?.nombre} — {(showDetail?.destino as any)?.nombre}</p>
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
