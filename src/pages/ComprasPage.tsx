import { useState, useEffect, useRef } from 'react';
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
import { Plus, Eye, PackageCheck, CreditCard, ChevronRight, Upload, ImageIcon, CheckCircle2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import ProductSearchInput from '@/components/ProductSearchInput';

const estadoConfig: Record<string, { color: string; label: string }> = {
  ordenada: { color: 'secondary', label: 'Ordenada' },
  en_transito: { color: 'secondary', label: 'Ordenada' }, // legacy alias
  pagada: { color: 'default', label: 'Pagada' },
  recibida: { color: 'outline', label: 'Recibida' },
  cerrada: { color: 'default', label: 'Cerrada' },
  cancelada: { color: 'destructive', label: 'Cancelada' },
};

const ComprasPage = () => {
  const { selectedSucursal } = useSucursal();
  const [compras, setCompras] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showRecepcion, setShowRecepcion] = useState<any>(null);
  const [showDetail, setShowDetail] = useState<any>(null);
  const [lineasDetail, setLineasDetail] = useState<any[]>([]);
  const [showPago, setShowPago] = useState<any>(null);
  const [pagoFile, setPagoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [proveedores, setProveedores] = useState<any[]>([]);
  const [productosDisp, setProductosDisp] = useState<any[]>([]);
  const [form, setForm] = useState({ proveedor_id: '', notas: '' });
  const [lineas, setLineas] = useState<{producto_id: string; cantidad: number; precio_est: number; nombre: string}[]>([]);
  const [addItem, setAddItem] = useState({ producto_id: '', cantidad: '1', precio: '' });

  const [recLineas, setRecLineas] = useState<any[]>([]);

  useEffect(() => { if (selectedSucursal) load(); }, [selectedSucursal]);

  const load = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    const { data } = await supabase.from('compras')
      .select('*, proveedores(nombre)')
      .eq('sucursal_id', selectedSucursal.id)
      .order('created_at', { ascending: false });
    setCompras(data || []);
    setLoading(false);
  };

  const openCreate = async () => {
    setShowCreate(true);
    setForm({ proveedor_id: '', notas: '' });
    setLineas([]);
    setAddItem({ producto_id: '', cantidad: '1', precio: '' });
    const [pRes, prRes] = await Promise.all([
      supabase.from('productos').select('id, nombre, sku, precio_base').eq('activo', true),
      supabase.from('proveedores').select('id, nombre').eq('activo', true),
    ]);
    setProductosDisp(pRes.data || []);
    setProveedores(prRes.data || []);
  };

  const addLinea = () => {
    if (!addItem.producto_id || parseInt(addItem.cantidad) <= 0) { toast.error('Complete los campos'); return; }
    const prod = productosDisp.find(p => p.id === addItem.producto_id);
    setLineas([...lineas, {
      producto_id: addItem.producto_id, cantidad: parseInt(addItem.cantidad),
      precio_est: parseFloat(addItem.precio) || prod?.precio_base || 0, nombre: prod?.nombre || '',
    }]);
    setAddItem({ producto_id: '', cantidad: '1', precio: '' });
  };

  const saveCompra = async () => {
    if (!form.proveedor_id) { toast.error('Seleccione proveedor'); return; }
    if (lineas.length === 0) { toast.error('Agregue productos'); return; }
    const user = (await supabase.auth.getUser()).data.user;
    const numCompra = `OC-${Date.now().toString(36).toUpperCase()}`;
    const subtotal = lineas.reduce((s, l) => s + l.cantidad * l.precio_est, 0);

    const { data: alm } = await supabase.from('almacenes').select('id').eq('sucursal_id', selectedSucursal!.id).limit(1);

    const { data: compra, error } = await supabase.from('compras').insert({
      numero_compra: numCompra, proveedor_id: form.proveedor_id,
      sucursal_id: selectedSucursal!.id, almacen_id: alm?.[0]?.id || null,
      subtotal, total: subtotal, notas: form.notas || null, creado_por: user?.id,
      estado: 'ordenada',
    }).select().single();

    if (error) { toast.error('Error al crear compra'); console.error(error); return; }

    const lineasInsert = lineas.map(l => ({
      compra_id: compra.id, producto_id: l.producto_id,
      cantidad_ordenada: l.cantidad, precio_unitario_estimado: l.precio_est,
    }));
    await supabase.from('compra_lineas').insert(lineasInsert);

    // Log activity
    await supabase.from('audit_log').insert({
      entidad: 'compra', accion: 'Orden de compra creada', entidad_id: compra.id,
      usuario_id: user?.id, usuario_nombre: user?.email,
      sucursal_id: selectedSucursal!.id,
      datos_despues: { numero_compra: numCompra, total: subtotal, productos: lineas.length },
    });

    toast.success(`Orden ${numCompra} creada — En Tránsito`);
    setShowCreate(false);
    load();
  };

  const openRecepcion = async (compra: any) => {
    setShowRecepcion(compra);
    const { data } = await supabase.from('compra_lineas')
      .select('*, productos(nombre, sku)').eq('compra_id', compra.id);
    setRecLineas((data || []).map(l => ({
      ...l, cantidad_recibida_input: l.cantidad_ordenada.toString(),
      lote_input: '', caducidad_input: '',
      costo_real_input: l.precio_unitario_estimado.toString(),
      merma_input: '0',
    })));
  };

  const processRecepcion = async () => {
    if (!showRecepcion) return;
    const user = (await supabase.auth.getUser()).data.user;
    const { data: alm } = await supabase.from('almacenes').select('id').eq('sucursal_id', showRecepcion.sucursal_id).limit(1);
    if (!alm?.length) { toast.error('Sin almacén configurado'); return; }

    for (const linea of recLineas) {
      const cantRecibida = parseInt(linea.cantidad_recibida_input) || 0;
      const merma = parseInt(linea.merma_input) || 0;
      const costoReal = parseFloat(linea.costo_real_input) || 0;
      const loteNum = linea.lote_input || `LOT-${Date.now().toString(36)}`;

      const { data: lote } = await supabase.from('lotes').insert({
        producto_id: linea.producto_id, numero_lote: loteNum,
        fecha_caducidad: linea.caducidad_input || null,
        costo_unitario: costoReal, proveedor_id: showRecepcion.proveedor_id,
      }).select().single();

      if (!lote) continue;

      const cantNeta = cantRecibida - merma;
      if (cantNeta > 0) {
        await supabase.from('inventario').insert({ almacen_id: alm[0].id, lote_id: lote.id, cantidad: cantNeta });
        await supabase.from('movimientos_inventario').insert({
          almacen_id: alm[0].id, lote_id: lote.id, tipo: 'entrada_compra',
          cantidad: cantNeta, costo_unitario: costoReal,
          referencia_tipo: 'compra', referencia_id: showRecepcion.id,
          usuario_id: user?.id, sucursal_id: showRecepcion.sucursal_id,
          notas: `Recepción OC ${showRecepcion.numero_compra}`,
        });
      }

      if (merma > 0) {
        await supabase.from('movimientos_inventario').insert({
          almacen_id: alm[0].id, lote_id: lote.id, tipo: 'merma',
          cantidad: merma, costo_unitario: costoReal,
          referencia_tipo: 'compra', referencia_id: showRecepcion.id,
          usuario_id: user?.id, sucursal_id: showRecepcion.sucursal_id,
          notas: `Merma en recepción OC ${showRecepcion.numero_compra}`,
        });
      }

      await supabase.from('compra_lineas').update({
        cantidad_recibida: cantRecibida, precio_unitario_real: costoReal,
        lote_asignado: loteNum, fecha_caducidad: linea.caducidad_input || null,
        merma_recepcion: merma,
      }).eq('id', linea.id);
    }

    await supabase.from('compras').update({ estado: 'recibida' }).eq('id', showRecepcion.id);

    // Log activity
    await supabase.from('audit_log').insert({
      entidad: 'compra', accion: 'Recepción completada', entidad_id: showRecepcion.id,
      usuario_id: user?.id, usuario_nombre: user?.email,
      sucursal_id: showRecepcion.sucursal_id,
    });

    toast.success('Recepción completada — inventario actualizado');
    setShowRecepcion(null);
    load();
  };

  const openPago = (compra: any) => {
    setShowPago(compra);
    setPagoFile(null);
  };

  const processPago = async () => {
    if (!showPago) return;
    setUploading(true);
    let comprobanteUrl: string | null = null;

    if (pagoFile) {
      const ext = pagoFile.name.split('.').pop();
      const filePath = `${showPago.id}/comprobante_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('comprobantes-pago')
        .upload(filePath, pagoFile);
      if (uploadError) {
        toast.error('Error subiendo comprobante');
        console.error(uploadError);
        setUploading(false);
        return;
      }
      // Store just the file path, not the full URL
      comprobanteUrl = filePath;
    }

    await supabase.from('compras').update({
      estado: 'pagada',
      comprobante_pago_url: comprobanteUrl,
    }).eq('id', showPago.id);

    const user = (await supabase.auth.getUser()).data.user;
    await supabase.from('audit_log').insert({
      entidad: 'compra', accion: 'Compra marcada como pagada', entidad_id: showPago.id,
      usuario_id: user?.id, usuario_nombre: user?.email,
      sucursal_id: showPago.sucursal_id,
    });

    toast.success('Compra marcada como pagada');
    setShowPago(null);
    setUploading(false);
    load();
  };

  const viewComprobante = async (compra: any) => {
    if (!compra.comprobante_pago_url) return;
    // If it's a path (not full URL), download via signed URL
    const path = compra.comprobante_pago_url;
    if (path.startsWith('http')) {
      // Legacy full URLs - try downloading via blob
      try {
        const response = await fetch(path);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      } catch {
        toast.error('No se pudo abrir el comprobante. Verifique que no tenga un bloqueador de anuncios activo.');
      }
      return;
    }
    // Use signed URL approach
    const { data, error } = await supabase.storage
      .from('comprobantes-pago')
      .createSignedUrl(path, 300); // 5 min
    if (error || !data?.signedUrl) {
      toast.error('Error al obtener comprobante');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const viewDetail = async (compra: any) => {
    setShowDetail(compra);
    const { data } = await supabase.from('compra_lineas')
      .select('*, productos(nombre, sku)').eq('compra_id', compra.id);
    setLineasDetail(data || []);
  };

  const flowSteps = ['en_transito', 'recibida', 'pagada'];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Compras</h1><p className="text-muted-foreground">{selectedSucursal?.nombre}</p></div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Nueva Orden de Compra</Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            {flowSteps.map((step, i) => {
              const count = compras.filter(c => c.estado === step).length;
              const cfg = estadoConfig[step];
              return (
                <div key={step} className="flex items-center">
                  <div className="text-center">
                    <div className={`rounded-full w-12 h-12 flex items-center justify-center text-lg font-bold ${count > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {count}
                    </div>
                    <p className="text-xs mt-1 font-medium">{cfg.label}</p>
                  </div>
                  {i < flowSteps.length - 1 && <ChevronRight className="h-5 w-5 text-muted-foreground mx-4" />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">En Tránsito</p><p className="text-2xl font-bold text-primary">{compras.filter(c => c.estado === 'en_transito').length}</p><p className="text-xs text-muted-foreground">${compras.filter(c => c.estado === 'en_transito').reduce((s, c) => s + Number(c.total), 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Pendientes de Pago</p><p className="text-2xl font-bold">{compras.filter(c => c.estado === 'recibida').length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Pagado</p><p className="text-2xl font-bold">${compras.filter(c => c.estado === 'pagada').reduce((s, c) => s + Number(c.total), 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead># OC</TableHead><TableHead>Proveedor</TableHead><TableHead>Fecha</TableHead>
              <TableHead>Total</TableHead><TableHead>Estado</TableHead><TableHead>Acciones</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando...</TableCell></TableRow> :
               compras.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin compras</TableCell></TableRow> :
               compras.map(c => {
                const cfg = estadoConfig[c.estado] || { color: 'secondary', label: c.estado };
                return (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-bold">{c.numero_compra}</TableCell>
                  <TableCell>{(c.proveedores as any)?.nombre}</TableCell>
                  <TableCell className="text-sm">{new Date(c.created_at).toLocaleDateString('es-MX')}</TableCell>
                  <TableCell className="font-bold">${Number(c.total).toFixed(2)}</TableCell>
                  <TableCell><Badge variant={(cfg.color || 'secondary') as any}>{cfg.label}</Badge></TableCell>
                  <TableCell className="space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => viewDetail(c)}><Eye className="h-4 w-4" /></Button>
                    {c.estado === 'en_transito' && (
                      <Button size="sm" onClick={() => openRecepcion(c)}><PackageCheck className="h-4 w-4 mr-1" />Recibir</Button>
                    )}
                    {c.estado === 'recibida' && (
                      <Button size="sm" onClick={() => openPago(c)}><CreditCard className="h-4 w-4 mr-1" />Marcar Pagada</Button>
                    )}
                  </TableCell>
                </TableRow>
                );
               })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create OC Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva Orden de Compra</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Proveedor *</Label>
              <Select value={form.proveedor_id} onValueChange={v => setForm({...form, proveedor_id: v})}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="border rounded-lg p-3 space-y-3">
              <Label>Agregar Productos</Label>
              <div className="flex gap-2 items-end">
                <ProductSearchInput
                  products={productosDisp}
                  value={addItem.producto_id}
                  onSelect={v => setAddItem({...addItem, producto_id: v})}
                  placeholder="Buscar producto..."
                />
                <Input type="number" min="1" className="w-20" placeholder="Cant" value={addItem.cantidad} onChange={e => setAddItem({...addItem, cantidad: e.target.value})} />
                <Input type="number" step="0.01" className="w-28" placeholder="P. Est." value={addItem.precio} onChange={e => setAddItem({...addItem, precio: e.target.value})} />
                <Button size="sm" onClick={addLinea}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            {lineas.length > 0 && (
              <Table>
                <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead className="text-right">Cant</TableHead><TableHead className="text-right">Precio Est.</TableHead><TableHead className="text-right">Subtotal</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {lineas.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.nombre}</TableCell>
                      <TableCell className="text-right">{l.cantidad}</TableCell>
                      <TableCell className="text-right">${l.precio_est.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-bold">${(l.cantidad * l.precio_est).toFixed(2)}</TableCell>
                      <TableCell><Button size="sm" variant="ghost" onClick={() => setLineas(lineas.filter((_, idx) => idx !== i))}>✕</Button></TableCell>
                    </TableRow>
                  ))}
                  <TableRow><TableCell colSpan={3} className="text-right font-bold">Total:</TableCell><TableCell className="text-right font-bold text-lg">${lineas.reduce((s, l) => s + l.cantidad * l.precio_est, 0).toFixed(2)}</TableCell><TableCell></TableCell></TableRow>
                </TableBody>
              </Table>
            )}
            <div><Label>Notas</Label><Textarea value={form.notas} onChange={e => setForm({...form, notas: e.target.value})} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={saveCompra}>Crear OC</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Recepción Dialog */}
      <Dialog open={!!showRecepcion} onOpenChange={() => setShowRecepcion(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Recepción — {showRecepcion?.numero_compra}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">Capture lote, caducidad y costo real por cada producto. Las mermas en recepción se registran automáticamente.</p>
          <div className="space-y-4">
            {recLineas.map((l, i) => (
              <Card key={l.id}>
                <CardContent className="p-4 space-y-2">
                  <p className="font-bold">{(l.productos as any)?.nombre} ({(l.productos as any)?.sku})</p>
                  <p className="text-sm text-muted-foreground">Ordenados: {l.cantidad_ordenada}</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div><Label className="text-xs">Cant. Recibida</Label><Input type="number" value={l.cantidad_recibida_input} onChange={e => { const nl = [...recLineas]; nl[i] = {...l, cantidad_recibida_input: e.target.value}; setRecLineas(nl); }} /></div>
                    <div><Label className="text-xs">Merma</Label><Input type="number" value={l.merma_input} onChange={e => { const nl = [...recLineas]; nl[i] = {...l, merma_input: e.target.value}; setRecLineas(nl); }} /></div>
                    <div><Label className="text-xs">Costo Real</Label><Input type="number" step="0.01" value={l.costo_real_input} onChange={e => { const nl = [...recLineas]; nl[i] = {...l, costo_real_input: e.target.value}; setRecLineas(nl); }} /></div>
                    <div><Label className="text-xs"># Lote</Label><Input value={l.lote_input} onChange={e => { const nl = [...recLineas]; nl[i] = {...l, lote_input: e.target.value}; setRecLineas(nl); }} placeholder="LOT-XXX" /></div>
                  </div>
                  <div><Label className="text-xs">Caducidad</Label><Input type="date" value={l.caducidad_input} onChange={e => { const nl = [...recLineas]; nl[i] = {...l, caducidad_input: e.target.value}; setRecLineas(nl); }} /></div>
                  {parseInt(l.merma_input) > 0 && (
                    <p className="text-xs text-destructive font-medium">⚠ Merma: {l.merma_input} unidades = ${(parseInt(l.merma_input) * parseFloat(l.costo_real_input || '0')).toFixed(2)} de pérdida</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRecepcion(null)}>Cancelar</Button>
            <Button onClick={processRecepcion}><PackageCheck className="h-4 w-4 mr-1" />Procesar Recepción</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Pago Dialog */}
      <Dialog open={!!showPago} onOpenChange={() => setShowPago(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Marcar como Pagada — {showPago?.numero_compra}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Total: <strong>${Number(showPago?.total || 0).toFixed(2)}</strong></p>
            <div>
              <Label>Comprobante de Pago (opcional)</Label>
              <div
                className="mt-2 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {pagoFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <ImageIcon className="h-5 w-5 text-primary" />
                    <span className="text-sm font-medium">{pagoFile.name}</span>
                  </div>
                ) : (
                  <div>
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">Haz clic para subir imagen o PDF del comprobante</p>
                  </div>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setPagoFile(e.target.files?.[0] || null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPago(null)}>Cancelar</Button>
            <Button onClick={processPago} disabled={uploading}>
              {uploading ? 'Subiendo...' : <><CreditCard className="h-4 w-4 mr-1" />Confirmar Pago</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>OC {showDetail?.numero_compra}</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p><strong>Proveedor:</strong> {(showDetail?.proveedores as any)?.nombre}</p>
            <p><strong>Estado:</strong> <Badge variant={(estadoConfig[showDetail?.estado]?.color || 'secondary') as any}>{estadoConfig[showDetail?.estado]?.label || showDetail?.estado}</Badge></p>
            <p><strong>Total:</strong> ${Number(showDetail?.total || 0).toFixed(2)}</p>
            <p><strong>Fecha:</strong> {showDetail?.created_at ? new Date(showDetail.created_at).toLocaleDateString('es-MX') : '—'}</p>
            {showDetail?.comprobante_pago_url && (
              <div>
                <strong>Comprobante:</strong>{' '}
                <button onClick={() => viewComprobante(showDetail)} className="text-primary underline cursor-pointer">Ver comprobante</button>
              </div>
            )}
          </div>
          <Table>
            <TableHeader><TableRow><TableHead>Producto</TableHead><TableHead className="text-right">Ordenados</TableHead><TableHead className="text-right">Recibidos</TableHead><TableHead className="text-right">Merma</TableHead><TableHead>Lote</TableHead><TableHead className="text-right">Costo Real</TableHead></TableRow></TableHeader>
            <TableBody>
              {lineasDetail.map(l => (
                <TableRow key={l.id}>
                  <TableCell>{(l.productos as any)?.nombre}</TableCell>
                  <TableCell className="text-right">{l.cantidad_ordenada}</TableCell>
                  <TableCell className="text-right">{l.cantidad_recibida || 0}</TableCell>
                  <TableCell className="text-right text-destructive">{l.merma_recepcion || 0}</TableCell>
                  <TableCell className="font-mono text-xs">{l.lote_asignado || '—'}</TableCell>
                  <TableCell className="text-right">${Number(l.precio_unitario_real || 0).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ComprasPage;
