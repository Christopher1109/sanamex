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
import { Plus, Eye, Truck, Package } from 'lucide-react';
import { toast } from 'sonner';

const estadoColor: Record<string, string> = {
  pendiente: 'secondary', en_ruta: 'default', entregado: 'outline', 
  entregado_confirmacion: 'default', cancelado: 'destructive'
};

const PedidosPage = () => {
  const { selectedSucursal } = useSucursal();
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [lineasDetail, setLineasDetail] = useState<any[]>([]);

  const [clientes, setClientes] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);
  const [rutas, setRutas] = useState<any[]>([]);
  const [lotesPorProducto, setLotesPorProducto] = useState<any[]>([]);
  const [form, setForm] = useState({ cliente_id: '', ruta_id: '', notas: '' });
  const [lineas, setLineas] = useState<{producto_id: string; lote_id: string; cantidad: number; precio: number; nombre: string; lote_nombre: string; disponible: number}[]>([]);
  const [addProd, setAddProd] = useState({ producto_id: '', lote_id: '', cantidad: '1' });

  useEffect(() => { if (selectedSucursal) load(); }, [selectedSucursal]);

  const load = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    const { data } = await supabase.from('pedidos').select('*, clientes(nombre), rutas(notas, estado, fecha)')
      .eq('sucursal_id', selectedSucursal.id).order('created_at', { ascending: false });
    setPedidos(data || []);
    setLoading(false);
  };

  const openCreate = async () => {
    setShowCreate(true);
    setForm({ cliente_id: '', ruta_id: '', notas: '' });
    setLineas([]);
    setAddProd({ producto_id: '', lote_id: '', cantidad: '1' });

    const [cRes, pRes, rRes] = await Promise.all([
      supabase.from('clientes').select('id, nombre').eq('activo', true),
      supabase.from('productos').select('id, nombre, sku, precio_base').eq('activo', true),
      supabase.from('rutas').select('id, notas, estado, fecha, profiles:repartidor_id(nombre)').eq('sucursal_id', selectedSucursal!.id).in('estado', ['preparando']),
    ]);
    setClientes(cRes.data || []);
    setProductos(pRes.data || []);
    setRutas(rRes.data || []);
  };

  const onSelectProducto = async (prodId: string) => {
    setAddProd({ ...addProd, producto_id: prodId, lote_id: '' });
    if (!selectedSucursal) return;
    const { data: alm } = await supabase.from('almacenes').select('id').eq('sucursal_id', selectedSucursal.id);
    if (!alm?.length) { setLotesPorProducto([]); return; }
    
    const { data: lotesData } = await supabase.from('inventario')
      .select('cantidad, lotes(id, numero_lote, fecha_caducidad, producto_id)')
      .in('almacen_id', alm.map(a => a.id))
      .gt('cantidad', 0);
    
    const lotesProducto = (lotesData || []).filter(l => (l.lotes as any)?.producto_id === prodId);
    setLotesPorProducto(lotesProducto);
  };

  const addLinea = () => {
    if (!addProd.producto_id || !addProd.lote_id || parseInt(addProd.cantidad) <= 0) {
      toast.error('Complete producto, lote y cantidad'); return;
    }
    const prod = productos.find(p => p.id === addProd.producto_id);
    const loteInv = lotesPorProducto.find(l => (l.lotes as any)?.id === addProd.lote_id);
    const cant = parseInt(addProd.cantidad);
    
    if (loteInv && cant > loteInv.cantidad) {
      toast.error(`Solo hay ${loteInv.cantidad} disponibles`); return;
    }

    setLineas([...lineas, {
      producto_id: addProd.producto_id, lote_id: addProd.lote_id,
      cantidad: cant, precio: prod?.precio_base || 0,
      nombre: prod?.nombre || '', lote_nombre: (loteInv?.lotes as any)?.numero_lote || '',
      disponible: loteInv?.cantidad || 0,
    }]);
    setAddProd({ producto_id: '', lote_id: '', cantidad: '1' });
    setLotesPorProducto([]);
  };

  const savePedido = async () => {
    if (!form.cliente_id) { toast.error('Seleccione un cliente'); return; }
    if (lineas.length === 0) { toast.error('Agregue al menos un producto'); return; }

    const user = (await supabase.auth.getUser()).data.user;
    const numPedido = `PED-${Date.now().toString(36).toUpperCase()}`;

    const { data: pedido, error } = await supabase.from('pedidos').insert({
      numero_pedido: numPedido, cliente_id: form.cliente_id,
      sucursal_id: selectedSucursal!.id, estado: 'pendiente',
      ruta_id: form.ruta_id || null,
      notas: form.notas || null, creado_por: user?.id,
    }).select().single();

    if (error) { toast.error('Error al crear pedido'); console.error(error); return; }

    const lineasInsert = lineas.map(l => ({
      pedido_id: pedido.id, producto_id: l.producto_id, lote_id: l.lote_id,
      cantidad: l.cantidad, precio_unitario: l.precio, subtotal: l.cantidad * l.precio,
    }));

    await supabase.from('pedido_lineas').insert(lineasInsert);
    toast.success(`Pedido ${numPedido} creado`);
    setShowCreate(false);
    load();
  };

  const enviarARuta = async (pedido: any) => {
    const { data: lineasPed } = await supabase.from('pedido_lineas').select('*').eq('pedido_id', pedido.id);
    if (!lineasPed?.length) { toast.error('Pedido sin líneas'); return; }

    const { data: alm } = await supabase.from('almacenes').select('id').eq('sucursal_id', pedido.sucursal_id);
    if (!alm?.length) { toast.error('Sin almacén'); return; }

    for (const linea of lineasPed) {
      const { data: inv } = await supabase.from('inventario')
        .select('id, cantidad').eq('lote_id', linea.lote_id).in('almacen_id', alm.map(a => a.id)).limit(1);
      
      if (inv?.[0]) {
        const newCant = Math.max(0, inv[0].cantidad - linea.cantidad);
        await supabase.from('inventario').update({ cantidad: newCant }).eq('id', inv[0].id);
        const user = (await supabase.auth.getUser()).data.user;
        await supabase.from('movimientos_inventario').insert({
          almacen_id: alm[0].id, lote_id: linea.lote_id, tipo: 'salida_pedido',
          cantidad: linea.cantidad, referencia_tipo: 'pedido', referencia_id: pedido.id,
          usuario_id: user?.id, sucursal_id: pedido.sucursal_id,
          notas: `Salida por pedido ${pedido.numero_pedido}`,
        });
      }
    }

    await supabase.from('pedidos').update({ estado: 'en_ruta' }).eq('id', pedido.id);
    toast.success('Pedido enviado a ruta — inventario descontado');
    load();
  };

  const viewDetail = async (pedido: any) => {
    setShowDetail(pedido);
    const { data } = await supabase.from('pedido_lineas')
      .select('*, productos(nombre, sku), lotes(numero_lote)')
      .eq('pedido_id', pedido.id);
    setLineasDetail(data || []);
  };

  const marcarEntregado = async (pedido: any) => {
    await supabase.from('pedidos').update({ estado: 'entregado_confirmacion' }).eq('id', pedido.id);
    toast.success('Pedido marcado como entregado — esperando confirmación');
    setShowDetail(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Pedidos</h1><p className="text-muted-foreground">{selectedSucursal?.nombre}</p></div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Nuevo Pedido</Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Pedidos</p><p className="text-2xl font-bold">{pedidos.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Pendientes</p><p className="text-2xl font-bold">{pedidos.filter(p => p.estado === 'pendiente').length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">En Ruta</p><p className="text-2xl font-bold text-primary">{pedidos.filter(p => p.estado === 'en_ruta').length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Entregados</p><p className="text-2xl font-bold">{pedidos.filter(p => p.estado.startsWith('entregado')).length}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead># Pedido</TableHead><TableHead>Cliente</TableHead><TableHead>Ruta</TableHead><TableHead>Fecha</TableHead>
              <TableHead>Estado</TableHead><TableHead>Acciones</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando...</TableCell></TableRow> :
               pedidos.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin pedidos</TableCell></TableRow> :
               pedidos.map(p => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono font-bold">{p.numero_pedido}</TableCell>
                  <TableCell>{(p.clientes as any)?.nombre || '—'}</TableCell>
                  <TableCell className="text-xs">{p.ruta_id ? ((p.rutas as any)?.notas?.split('\n')[0] || 'Asignada') : '—'}</TableCell>
                  <TableCell className="text-sm">{new Date(p.created_at).toLocaleDateString('es-MX')}</TableCell>
                  <TableCell><Badge variant={(estadoColor[p.estado] || 'secondary') as any}>{p.estado.replace('_', ' ')}</Badge></TableCell>
                  <TableCell className="space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => viewDetail(p)}><Eye className="h-4 w-4" /></Button>
                    {p.estado === 'pendiente' && <Button size="sm" onClick={() => enviarARuta(p)}><Truck className="h-4 w-4 mr-1" />Enviar a Ruta</Button>}
                  </TableCell>
                </TableRow>
               ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create Order Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo Pedido</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Cliente *</Label>
              <Select value={form.cliente_id} onValueChange={v => setForm({...form, cliente_id: v})}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cliente..." /></SelectTrigger>
                <SelectContent>{clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div>
              <Label>Ruta de Entrega</Label>
              <Select value={form.ruta_id} onValueChange={v => setForm({...form, ruta_id: v})}>
                <SelectTrigger><SelectValue placeholder="Seleccionar ruta (opcional)..." /></SelectTrigger>
                <SelectContent>
                  {rutas.length === 0 ? (
                    <SelectItem value="__none" disabled>No hay rutas en preparación</SelectItem>
                  ) : (
                    rutas.map(r => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.fecha} — {r.notas?.split('\n')[0] || 'Ruta'} ({(r.profiles as any)?.nombre || 'Sin repartidor'})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="border rounded-lg p-3 space-y-3">
              <Label>Agregar Productos</Label>
              <div className="flex gap-2">
                <Select value={addProd.producto_id} onValueChange={onSelectProducto}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Producto..." /></SelectTrigger>
                  <SelectContent>{productos.map(p => <SelectItem key={p.id} value={p.id}>{p.sku} — {p.nombre}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={addProd.lote_id} onValueChange={v => setAddProd({...addProd, lote_id: v})}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Lote..." /></SelectTrigger>
                  <SelectContent>{lotesPorProducto.map(l => <SelectItem key={(l.lotes as any)?.id} value={(l.lotes as any)?.id}>{(l.lotes as any)?.numero_lote} (Disp: {l.cantidad})</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" min="1" className="w-20" value={addProd.cantidad} onChange={e => setAddProd({...addProd, cantidad: e.target.value})} />
                <Button size="sm" onClick={addLinea}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>

            {lineas.length > 0 && (
              <Table>
                <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead>Lote</TableHead><TableHead className="text-right">Cant</TableHead><TableHead className="text-right">Precio</TableHead><TableHead className="text-right">Subtotal</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {lineas.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.nombre}</TableCell>
                      <TableCell className="font-mono text-xs">{l.lote_nombre}</TableCell>
                      <TableCell className="text-right">{l.cantidad}</TableCell>
                      <TableCell className="text-right">${l.precio.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-bold">${(l.cantidad * l.precio).toFixed(2)}</TableCell>
                      <TableCell><Button size="sm" variant="ghost" onClick={() => setLineas(lineas.filter((_, idx) => idx !== i))}>✕</Button></TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-bold">Total:</TableCell>
                    <TableCell className="text-right font-bold text-lg">${lineas.reduce((s, l) => s + l.cantidad * l.precio, 0).toFixed(2)}</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}

            <div><Label>Notas</Label><Textarea value={form.notas} onChange={e => setForm({...form, notas: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={savePedido}>Crear Pedido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Pedido {showDetail?.numero_pedido}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p><strong>Cliente:</strong> {(showDetail?.clientes as any)?.nombre}</p>
            <p><strong>Estado:</strong> <Badge variant={(estadoColor[showDetail?.estado] || 'secondary') as any}>{showDetail?.estado?.replace('_', ' ')}</Badge></p>
            {showDetail?.ruta_id && <p><strong>Ruta:</strong> {(showDetail?.rutas as any)?.notas?.split('\n')[0] || 'Asignada'}</p>}
            <p><strong>Notas:</strong> {showDetail?.notas || '—'}</p>
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead>Lote</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Precio</TableHead><TableHead className="text-right">Subtotal</TableHead></TableRow></TableHeader>
            <TableBody>
              {lineasDetail.map(l => (
                <TableRow key={l.id}>
                  <TableCell>{(l.productos as any)?.nombre}</TableCell>
                  <TableCell className="font-mono text-xs">{(l.lotes as any)?.numero_lote}</TableCell>
                  <TableCell className="text-right">{l.cantidad}</TableCell>
                  <TableCell className="text-right">${Number(l.precio_unitario).toFixed(2)}</TableCell>
                  <TableCell className="text-right font-bold">${Number(l.subtotal).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <DialogFooter>
            {showDetail?.estado === 'en_ruta' && (
              <Button onClick={() => marcarEntregado(showDetail)}><Package className="h-4 w-4 mr-1" />Marcar Entregado</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PedidosPage;
