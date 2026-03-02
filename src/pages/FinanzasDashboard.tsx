import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RefreshCw, DollarSign, CheckCircle, Clock, FileText, CreditCard, Send, AlertCircle, Building2, Phone, Mail, Upload, Eye, Receipt, Paperclip } from 'lucide-react';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';

interface Proveedor {
  id: string;
  nombre: string;
  rfc: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  banco: string | null;
  cuenta_bancaria: string | null;
  clabe: string | null;
  condiciones_pago: string | null;
  dias_credito: number | null;
  categoria_productos: string | null;
}

interface OrdenCompra {
  id: string;
  numero_pedido: string;
  estado: string;
  proveedor: string;
  proveedor_id: string | null;
  total_items: number;
  created_at: string;
  aprobado_at: string | null;
  subtotal: number | null;
  total_impuestos: number | null;
  total_retenciones: number | null;
  total: number | null;
  items?: OrdenCompraItem[];
  proveedor_info?: Proveedor;
  comprobantes?: ComprobantePago[];
}

interface OrdenCompraItem {
  id: string;
  insumo_catalogo_id: string;
  cantidad_solicitada: number;
  precio_unitario: number | null;
  estado: string;
  insumo?: { id: string; nombre: string; clave: string };
}

interface ComprobantePago {
  id: string;
  pedido_compra_id: string;
  tipo_comprobante: string;
  numero_referencia: string | null;
  monto_pagado: number;
  fecha_pago: string;
  archivo_url: string | null;
  archivo_nombre: string | null;
  notas: string | null;
}

const FinanzasDashboard = () => {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [selectedOrden, setSelectedOrden] = useState<OrdenCompra | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Payment confirmation state
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [tipoComprobante, setTipoComprobante] = useState('transferencia');
  const [numeroReferencia, setNumeroReferencia] = useState('');
  const [montoPagado, setMontoPagado] = useState('');
  const [notasPago, setNotasPago] = useState('');
  const [archivoComprobante, setArchivoComprobante] = useState<File | null>(null);
  const [uploadingComprobante, setUploadingComprobante] = useState(false);
  
  // Comprobante viewer
  const [viewingComprobante, setViewingComprobante] = useState<ComprobantePago | null>(null);

  // Real-time notifications
  useRealtimeNotifications({
    userRole: 'finanzas',
    onPedidoActualizado: () => {
      fetchOrdenes();
    }
  });

  useEffect(() => {
    fetchOrdenes();
    
    const channel = supabase
      .channel('finanzas-pedidos')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pedidos_compra'
        },
        () => {
          fetchOrdenes();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrdenes = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('pedidos_compra')
        .select(`
          *,
          items:pedido_items(
            *,
            insumo:insumos_catalogo(id, nombre, clave)
          ),
          proveedor_info:proveedores(*),
          comprobantes:comprobantes_pago(*)
        `)
        .in('estado', ['enviado_a_finanzas', 'pagado_espera_confirmacion', 'recibido'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrdenes(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Error al cargar órdenes');
    } finally {
      setLoading(false);
    }
  };

  const verDetalle = (orden: OrdenCompra) => {
    setSelectedOrden(orden);
    setDialogOpen(true);
  };

  const abrirConfirmacionPago = (orden: OrdenCompra) => {
    setSelectedOrden(orden);
    setMontoPagado(calcularTotalOrden(orden).toString());
    setTipoComprobante('transferencia');
    setNumeroReferencia('');
    setNotasPago('');
    setArchivoComprobante(null);
    setConfirmDialogOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setArchivoComprobante(file);
    }
  };

  const confirmarPago = async () => {
    if (!selectedOrden) return;
    if (!montoPagado || parseFloat(montoPagado) <= 0) {
      toast.error('Ingrese un monto válido');
      return;
    }

    setUploadingComprobante(true);
    setProcesando(selectedOrden.id);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      let archivoUrl: string | null = null;
      let archivoNombre: string | null = null;

      // Upload file if provided
      if (archivoComprobante) {
        const fileExt = archivoComprobante.name.split('.').pop();
        const fileName = `${selectedOrden.id}/${Date.now()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('comprobantes-pago')
          .upload(fileName, archivoComprobante);

        if (uploadError) {
          console.error('Error uploading file:', uploadError);
          toast.error('Error al subir comprobante');
        } else {
          const { data: urlData } = supabase.storage
            .from('comprobantes-pago')
            .getPublicUrl(fileName);
          archivoUrl = urlData.publicUrl;
          archivoNombre = archivoComprobante.name;
        }
      }

      // Create comprobante record
      const { error: comprobanteError } = await supabase
        .from('comprobantes_pago')
        .insert({
          pedido_compra_id: selectedOrden.id,
          tipo_comprobante: tipoComprobante,
          numero_referencia: numeroReferencia || null,
          monto_pagado: parseFloat(montoPagado),
          notas: notasPago || null,
          archivo_url: archivoUrl,
          archivo_nombre: archivoNombre,
          registrado_por: user?.id
        });

      if (comprobanteError) throw comprobanteError;

      // Update order status
      const { error } = await supabase
        .from('pedidos_compra')
        .update({
          estado: 'pagado_espera_confirmacion',
          aprobado_at: new Date().toISOString(),
          aprobado_por: user?.id,
          pagado_at: new Date().toISOString(),
          enviado_a_cadena: true,
          enviado_a_cadena_at: new Date().toISOString()
        })
        .eq('id', selectedOrden.id);

      if (error) throw error;

      toast.success(`Orden ${selectedOrden.numero_pedido} marcada como pagada.`, {
        description: 'Cadena de Suministros recibirá la orden para confirmar recepción.',
        duration: 5000
      });
      
      setConfirmDialogOpen(false);
      setDialogOpen(false);
      fetchOrdenes();
    } catch (error) {
      console.error('Error updating order:', error);
      toast.error('Error al registrar pago');
    } finally {
      setUploadingComprobante(false);
      setProcesando(null);
    }
  };

  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'enviado_a_finanzas':
        return <Badge variant="destructive" className="gap-1"><Clock className="h-3 w-3" />Pendiente de Pago</Badge>;
      case 'pagado_espera_confirmacion':
        return <Badge className="bg-amber-100 text-amber-800 gap-1"><Send className="h-3 w-3" />Pagado - En Espera</Badge>;
      case 'recibido':
        return <Badge variant="outline" className="bg-green-50 text-green-700 gap-1"><CheckCircle className="h-3 w-3" />Recibido</Badge>;
      default:
        return <Badge variant="outline">{estado}</Badge>;
    }
  };

  const calcularTotalOrden = (orden: OrdenCompra) => {
    if (orden.total) return orden.total;
    if (!orden.items) return 0;
    return orden.items.reduce((sum, item) => {
      const precio = item.precio_unitario || 100;
      return sum + (precio * item.cantidad_solicitada);
    }, 0);
  };

  const ordenesPendientes = ordenes.filter(o => o.estado === 'enviado_a_finanzas');
  const ordenesEnEspera = ordenes.filter(o => o.estado === 'pagado_espera_confirmacion');
  const ordenesRecibidas = ordenes.filter(o => o.estado === 'recibido');

  const getCategoriaLabel = (cat: string | null) => {
    const labels: Record<string, string> = {
      'medicamentos': 'Medicamentos',
      'material_curacion': 'Material de Curación',
      'equipos': 'Equipos Médicos'
    };
    return cat ? labels[cat] || cat : 'General';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Panel de Finanzas</h1>
          <p className="text-muted-foreground">Gestión de pagos de órdenes de compra</p>
        </div>
        <Button onClick={fetchOrdenes} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes de Pago</CardTitle>
            <Clock className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{ordenesPendientes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Por Pagar</CardTitle>
            <DollarSign className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${ordenesPendientes.reduce((sum, o) => sum + calcularTotalOrden(o), 0).toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">En Espera de Recepción</CardTitle>
            <Send className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{ordenesEnEspera.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completadas</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{ordenesRecibidas.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pendientes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pendientes">
            Pendientes de Pago
            {ordenesPendientes.length > 0 && (
              <Badge variant="destructive" className="ml-2">{ordenesPendientes.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="espera">
            En Espera
            {ordenesEnEspera.length > 0 && (
              <Badge className="ml-2 bg-amber-100 text-amber-800">{ordenesEnEspera.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="completadas">Completadas</TabsTrigger>
        </TabsList>

        {/* Pendientes de Pago */}
        <TabsContent value="pendientes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Órdenes Pendientes de Pago
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Revisa y aprueba los pagos. Una vez pagado, la orden se enviará a Cadena de Suministros.
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Cargando...</div>
              ) : ordenesPendientes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay órdenes pendientes de pago
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordenesPendientes.map((orden) => (
                      <TableRow key={orden.id}>
                        <TableCell className="font-mono font-bold">{orden.numero_pedido}</TableCell>
                        <TableCell>
                          {new Date(orden.created_at).toLocaleDateString('es-MX')}
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{orden.proveedor_info?.nombre || orden.proveedor || 'Por definir'}</p>
                            {orden.proveedor_info && (
                              <p className="text-xs text-muted-foreground">{getCategoriaLabel(orden.proveedor_info.categoria_productos)}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">{orden.total_items}</TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          ${calcularTotalOrden(orden).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Button size="sm" onClick={() => verDetalle(orden)}>
                            <DollarSign className="mr-2 h-4 w-4" />
                            Ver y Pagar
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* En Espera de Recepción */}
        <TabsContent value="espera" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Send className="h-5 w-5" />
                Órdenes Pagadas en Espera de Confirmación
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Estas órdenes fueron pagadas y están esperando que Cadena de Suministros confirme la recepción.
              </p>
            </CardHeader>
            <CardContent>
              {ordenesEnEspera.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay órdenes en espera
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Fecha Pago</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Comprobante</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordenesEnEspera.map((orden) => (
                      <TableRow key={orden.id}>
                        <TableCell className="font-mono">{orden.numero_pedido}</TableCell>
                        <TableCell>
                          {orden.aprobado_at ? new Date(orden.aprobado_at).toLocaleDateString('es-MX') : '-'}
                        </TableCell>
                        <TableCell>{orden.proveedor_info?.nombre || orden.proveedor || 'Por definir'}</TableCell>
                        <TableCell className="text-right">{orden.total_items}</TableCell>
                        <TableCell className="text-right font-mono">
                          ${calcularTotalOrden(orden).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {getEstadoBadge(orden.estado)}
                        </TableCell>
                        <TableCell>
                          {orden.comprobantes && orden.comprobantes.length > 0 && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setViewingComprobante(orden.comprobantes![0])}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Ver
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Completadas */}
        <TabsContent value="completadas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Órdenes Completadas
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Órdenes pagadas y recibidas en el Almacén Central
              </p>
            </CardHeader>
            <CardContent>
              {ordenesRecibidas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay órdenes completadas
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Fecha Pago</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Comprobante</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordenesRecibidas.map((orden) => (
                      <TableRow key={orden.id}>
                        <TableCell className="font-mono">{orden.numero_pedido}</TableCell>
                        <TableCell>
                          {orden.aprobado_at ? new Date(orden.aprobado_at).toLocaleDateString('es-MX') : '-'}
                        </TableCell>
                        <TableCell>{orden.proveedor_info?.nombre || orden.proveedor || 'Por definir'}</TableCell>
                        <TableCell className="text-right">{orden.total_items}</TableCell>
                        <TableCell className="text-right font-mono">
                          ${calcularTotalOrden(orden).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {getEstadoBadge(orden.estado)}
                        </TableCell>
                        <TableCell>
                          {orden.comprobantes && orden.comprobantes.length > 0 && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setViewingComprobante(orden.comprobantes![0])}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Ver
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog: Ver detalle y pagar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Orden de Compra {selectedOrden?.numero_pedido}
            </DialogTitle>
          </DialogHeader>
          {selectedOrden && (
            <div className="space-y-4">
              {/* Supplier Info */}
              {selectedOrden.proveedor_info && (
                <Card className="bg-muted/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Información del Proveedor
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Nombre</p>
                      <p className="font-medium">{selectedOrden.proveedor_info.nombre}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">RFC</p>
                      <p className="font-mono">{selectedOrden.proveedor_info.rfc || 'N/A'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-3 w-3 text-muted-foreground" />
                      <span>{selectedOrden.proveedor_info.telefono || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-3 w-3 text-muted-foreground" />
                      <span>{selectedOrden.proveedor_info.email || 'N/A'}</span>
                    </div>
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Datos Bancarios</p>
                      <p className="font-mono text-xs">
                        {selectedOrden.proveedor_info.banco} - Cuenta: {selectedOrden.proveedor_info.cuenta_bancaria || 'N/A'}
                      </p>
                      {selectedOrden.proveedor_info.clabe && (
                        <p className="font-mono text-xs">CLABE: {selectedOrden.proveedor_info.clabe}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-muted-foreground">Condiciones de Pago</p>
                      <p>{selectedOrden.proveedor_info.condiciones_pago || 'Contado'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Categoría</p>
                      <Badge variant="outline">{getCategoriaLabel(selectedOrden.proveedor_info.categoria_productos)}</Badge>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Fecha</p>
                  <p className="font-medium">{new Date(selectedOrden.created_at).toLocaleDateString('es-MX')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Proveedor</p>
                  <p className="font-medium">{selectedOrden.proveedor_info?.nombre || selectedOrden.proveedor || 'Por definir'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Estado</p>
                  {getEstadoBadge(selectedOrden.estado)}
                </div>
              </div>

              <Separator />

              <ScrollArea className="max-h-[30vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clave</TableHead>
                      <TableHead>Insumo</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">P. Unit.</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrden.items?.map((item) => {
                      const precio = item.precio_unitario || 100;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono text-sm">{item.insumo?.clave}</TableCell>
                          <TableCell>{item.insumo?.nombre}</TableCell>
                          <TableCell className="text-right font-mono">{item.cantidad_solicitada}</TableCell>
                          <TableCell className="text-right font-mono">${precio}</TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            ${(precio * item.cantidad_solicitada).toLocaleString()}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className="flex justify-end border-t pt-4">
                <div className="text-right space-y-1">
                  {selectedOrden.subtotal && (
                    <div className="flex justify-between gap-8 text-sm">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span className="font-mono">${selectedOrden.subtotal.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedOrden.total_impuestos && selectedOrden.total_impuestos > 0 && (
                    <div className="flex justify-between gap-8 text-sm">
                      <span className="text-muted-foreground">Impuestos:</span>
                      <span className="font-mono text-amber-600">+${selectedOrden.total_impuestos.toLocaleString()}</span>
                    </div>
                  )}
                  {selectedOrden.total_retenciones && selectedOrden.total_retenciones > 0 && (
                    <div className="flex justify-between gap-8 text-sm">
                      <span className="text-muted-foreground">Retenciones:</span>
                      <span className="font-mono text-green-600">-${selectedOrden.total_retenciones.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-8 pt-2 border-t">
                    <span className="text-muted-foreground">Total a Pagar:</span>
                    <span className="text-2xl font-bold">${calcularTotalOrden(selectedOrden).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            {selectedOrden?.estado === 'enviado_a_finanzas' && (
              <Button 
                onClick={() => abrirConfirmacionPago(selectedOrden)}
                className="bg-green-600 hover:bg-green-700"
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Registrar Pago
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar Pago con Comprobante */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Registrar Pago
            </DialogTitle>
            <DialogDescription>
              Registre el comprobante de pago para la orden {selectedOrden?.numero_pedido}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo de Comprobante</Label>
              <Select value={tipoComprobante} onValueChange={setTipoComprobante}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transferencia">Transferencia Bancaria</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta Corporativa</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="referencia">Número de Referencia</Label>
              <Input 
                id="referencia"
                placeholder="Ej: REF123456789"
                value={numeroReferencia}
                onChange={(e) => setNumeroReferencia(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="monto">Monto Pagado</Label>
              <Input 
                id="monto"
                type="number"
                value={montoPagado}
                onChange={(e) => setMontoPagado(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="comprobante">Comprobante (PDF/Imagen)</Label>
              <div className="flex items-center gap-2">
                <Input 
                  id="comprobante"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                  className="flex-1"
                />
                {archivoComprobante && (
                  <Badge variant="secondary" className="gap-1">
                    <Paperclip className="h-3 w-3" />
                    {archivoComprobante.name.slice(0, 15)}...
                  </Badge>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notas">Notas (opcional)</Label>
              <Textarea 
                id="notas"
                placeholder="Observaciones adicionales..."
                value={notasPago}
                onChange={(e) => setNotasPago(e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={confirmarPago}
              disabled={uploadingComprobante || procesando === selectedOrden?.id}
              className="bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {uploadingComprobante ? 'Procesando...' : 'Confirmar Pago'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Ver Comprobante */}
      <Dialog open={!!viewingComprobante} onOpenChange={() => setViewingComprobante(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Comprobante de Pago
            </DialogTitle>
          </DialogHeader>
          
          {viewingComprobante && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Tipo</p>
                  <p className="font-medium capitalize">{viewingComprobante.tipo_comprobante}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Monto</p>
                  <p className="font-mono font-bold">${viewingComprobante.monto_pagado.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Fecha</p>
                  <p>{new Date(viewingComprobante.fecha_pago).toLocaleDateString('es-MX')}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Referencia</p>
                  <p className="font-mono">{viewingComprobante.numero_referencia || 'N/A'}</p>
                </div>
              </div>
              
              {viewingComprobante.notas && (
                <div>
                  <p className="text-muted-foreground text-sm">Notas</p>
                  <p className="text-sm">{viewingComprobante.notas}</p>
                </div>
              )}
              
              {viewingComprobante.archivo_url && (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => window.open(viewingComprobante.archivo_url!, '_blank')}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  Ver Archivo: {viewingComprobante.archivo_nombre}
                </Button>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingComprobante(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinanzasDashboard;
