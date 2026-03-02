import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RefreshCw, Warehouse, Send, Building2, Package, TrendingUp, FileText, Clock, CheckCircle, Truck, Edit, AlertTriangle, Filter, MapPin } from 'lucide-react';
import { StatusTimeline } from '@/components/StatusTimeline';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';

interface DocumentoSegmentado {
  id: string;
  fecha_generacion: string;
  estado: string;
  enviado_a_cadena_suministros: boolean;
  procesado_por_cadena: boolean;
  detalles?: DetalleSegmentado[];
}

interface DetalleSegmentado {
  id: string;
  hospital_id: string;
  insumo_catalogo_id: string;
  existencia_actual: number;
  minimo: number;
  faltante_requerido: number;
  hospital?: { id: string; nombre: string; display_name: string };
  insumo?: { id: string; nombre: string; clave: string };
}

interface AlmacenCentralItem {
  id: string;
  insumo_catalogo_id: string;
  cantidad_disponible: number;
  lote: string;
  insumo?: { id: string; nombre: string; clave: string };
}

interface Transferencia {
  id: string;
  hospital_destino_id: string;
  insumo_catalogo_id: string;
  cantidad_enviada: number;
  estado: string;
  fecha: string;
  alerta_creada: boolean;
  ruta_id?: string;
  hospital?: { id: string; nombre: string; display_name: string };
  insumo?: { id: string; nombre: string; clave: string };
}

interface OrdenRecibir {
  id: string;
  numero_pedido: string;
  estado: string;
  total_items: number;
  created_at: string;
  items?: {
    id: string;
    insumo_catalogo_id: string;
    cantidad_solicitada: number;
    cantidad_recibida: number;
    insumo?: { id: string; nombre: string; clave: string };
  }[];
}

interface HospitalNecesidades {
  hospital_id: string;
  hospital_nombre: string;
  insumos: {
    id: string;
    insumo_catalogo_id: string;
    nombre: string;
    clave: string;
    faltante: number;
    cantidadEnviar: number;
    stockCentral: number;
  }[];
}

interface RutaDistribucion {
  id: string;
  nombre_ruta: string;
  tipo: string;
  descripcion: string | null;
  hospitales?: { hospital_id: string }[];
}

const CadenaSuministrosDashboard = () => {
  const [documentos, setDocumentos] = useState<DocumentoSegmentado[]>([]);
  const [almacenCentral, setAlmacenCentral] = useState<AlmacenCentralItem[]>([]);
  const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
  const [ordenesParaRecibir, setOrdenesParaRecibir] = useState<OrdenRecibir[]>([]);
  const [rutas, setRutas] = useState<RutaDistribucion[]>([]);
  const [selectedRutaFilter, setSelectedRutaFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  
  // Dialog state for bulk hospital transfer
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState<HospitalNecesidades | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [selectedRutaForTransfer, setSelectedRutaForTransfer] = useState<string>('');

  // Dialog for receiving orders
  const [recibirDialogOpen, setRecibirDialogOpen] = useState(false);
  const [ordenRecibiendo, setOrdenRecibiendo] = useState<OrdenRecibir | null>(null);
  const [cantidadesRecibidas, setCantidadesRecibidas] = useState<Record<string, number>>({});

  const fetchDataCallback = useCallback(() => {
    fetchData();
  }, []);

  // Realtime notifications
  useRealtimeNotifications({
    userRole: 'cadena_suministros',
    onDocumentoSegmentado: fetchDataCallback,
    onPedidoActualizado: fetchDataCallback,
  });

  useEffect(() => {
    fetchData();
    fetchRutas();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch documentos segmentados enviados
      const { data: docsData, error: docsError } = await supabase
        .from('documentos_necesidades_segmentado')
        .select(`
          *,
          detalles:documento_segmentado_detalle(
            *,
            hospital:hospitales(id, nombre, display_name),
            insumo:insumos_catalogo(id, nombre, clave)
          )
        `)
        .eq('enviado_a_cadena_suministros', true)
        .order('fecha_generacion', { ascending: false })
        .limit(20);

      if (docsError) throw docsError;
      setDocumentos(docsData || []);

      // Fetch almacen central
      const { data: almacenData, error: almacenError } = await supabase
        .from('almacen_central')
        .select(`
          *,
          insumo:insumos_catalogo(id, nombre, clave)
        `)
        .gt('cantidad_disponible', 0)
        .order('cantidad_disponible', { ascending: false });

      if (almacenError) throw almacenError;
      setAlmacenCentral(almacenData || []);

      // Fetch transferencias
      const { data: transData, error: transError } = await supabase
        .from('transferencias_central_hospital')
        .select(`
          *,
          hospital:hospitales(id, nombre, display_name),
          insumo:insumos_catalogo(id, nombre, clave)
        `)
        .order('fecha', { ascending: false })
        .limit(50);

      if (transError) throw transError;
      setTransferencias(transData || []);

      // Fetch ordenes pagadas pendientes de recibir (estado = pagado_espera_confirmacion)
      const { data: ordenesData, error: ordenesError } = await supabase
        .from('pedidos_compra')
        .select(`
          *,
          items:pedido_items(
            *,
            insumo:insumos_catalogo(id, nombre, clave)
          )
        `)
        .eq('estado', 'pagado_espera_confirmacion')
        .order('created_at', { ascending: false });

      if (ordenesError) throw ordenesError;
      setOrdenesParaRecibir(ordenesData || []);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const fetchRutas = async () => {
    try {
      const { data, error } = await supabase
        .from('rutas_distribucion')
        .select(`
          *,
          hospitales:rutas_hospitales(hospital_id)
        `)
        .eq('activo', true)
        .order('nombre_ruta');

      if (error) throw error;
      setRutas(data || []);
    } catch (error) {
      console.error('Error fetching rutas:', error);
    }
  };

  const getHospitalesEnRuta = (rutaId: string): string[] => {
    const ruta = rutas.find(r => r.id === rutaId);
    return ruta?.hospitales?.map(h => h.hospital_id) || [];
  };

  const getDisponibilidadCentral = (insumoId: string) => {
    const item = almacenCentral.find(a => a.insumo_catalogo_id === insumoId);
    return item?.cantidad_disponible || 0;
  };

  // Group document details by hospital, with optional route filtering
  // Now considers what has already been sent via transferencias
  const agruparPorHospital = (doc: DocumentoSegmentado, rutaFilter?: string): HospitalNecesidades[] => {
    if (!doc.detalles) return [];
    
    const hospitalesEnRuta = rutaFilter && rutaFilter !== 'all' ? getHospitalesEnRuta(rutaFilter) : null;
    
    // Calculate what has already been sent for each hospital/insumo combination
    const enviados: Record<string, number> = {};
    transferencias.forEach(t => {
      const key = `${t.hospital_destino_id}_${t.insumo_catalogo_id}`;
      enviados[key] = (enviados[key] || 0) + t.cantidad_enviada;
    });
    
    const grouped: Record<string, HospitalNecesidades> = {};
    
    doc.detalles.forEach(det => {
      const hospitalId = det.hospital_id;
      
      // Filter by route if selected
      if (hospitalesEnRuta && !hospitalesEnRuta.includes(hospitalId)) {
        return;
      }
      
      // Calculate remaining need after what has been sent
      const key = `${hospitalId}_${det.insumo_catalogo_id}`;
      const yaEnviado = enviados[key] || 0;
      const faltanteRestante = Math.max(0, det.faltante_requerido - yaEnviado);
      
      // Skip if already fully covered
      if (faltanteRestante <= 0) {
        return;
      }
      
      if (!grouped[hospitalId]) {
        grouped[hospitalId] = {
          hospital_id: hospitalId,
          hospital_nombre: det.hospital?.display_name || det.hospital?.nombre || 'Hospital',
          insumos: []
        };
      }
      
      const stockCentral = getDisponibilidadCentral(det.insumo_catalogo_id);
      grouped[hospitalId].insumos.push({
        id: det.id,
        insumo_catalogo_id: det.insumo_catalogo_id,
        nombre: det.insumo?.nombre || '',
        clave: det.insumo?.clave || '',
        faltante: faltanteRestante, // Updated to remaining need
        cantidadEnviar: Math.min(faltanteRestante, stockCentral),
        stockCentral
      });
    });
    
    // Filter out hospitals with no remaining insumos to send
    return Object.values(grouped).filter(h => h.insumos.length > 0);
  };

  const abrirDialogHospital = (hospital: HospitalNecesidades) => {
    // Initialize quantities
    setSelectedHospital({
      ...hospital,
      insumos: hospital.insumos.map(i => ({
        ...i,
        cantidadEnviar: Math.min(i.faltante, i.stockCentral)
      }))
    });
    setDialogOpen(true);
  };

  const actualizarCantidad = (insumoId: string, cantidad: number) => {
    if (!selectedHospital) return;
    setSelectedHospital({
      ...selectedHospital,
      insumos: selectedHospital.insumos.map(i => 
        i.insumo_catalogo_id === insumoId 
          ? { ...i, cantidadEnviar: Math.max(0, cantidad) }
          : i
      )
    });
  };

  // Check if any item has insufficient stock (for warning)
  const tieneStockInsuficiente = (hospital: HospitalNecesidades | null) => {
    if (!hospital) return false;
    return hospital.insumos.some(i => i.cantidadEnviar > i.stockCentral);
  };

  const getInsumosConStockInsuficiente = (hospital: HospitalNecesidades | null) => {
    if (!hospital) return [];
    return hospital.insumos.filter(i => i.cantidadEnviar > i.stockCentral);
  };

  const ejecutarTransferenciaMasiva = async () => {
    if (!selectedHospital) return;

    // Only send items with stock available and quantity > 0
    const insumosAEnviar = selectedHospital.insumos.filter(i => 
      i.cantidadEnviar > 0 && i.stockCentral > 0
    );
    
    if (insumosAEnviar.length === 0) {
      toast.error('No hay insumos para enviar');
      return;
    }

    setEnviando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Generate unique tirada_id for this batch
      const tiradaId = crypto.randomUUID();
      let enviados = 0;
      let omitidos = 0;
      let erroresDescuento = 0;

      for (const insumo of insumosAEnviar) {
        // IMPORTANTE: Hacer refetch del stock actual para tener datos frescos
        const { data: stockItemFresh, error: stockError } = await supabase
          .from('almacen_central')
          .select('*')
          .eq('insumo_catalogo_id', insumo.insumo_catalogo_id)
          .gt('cantidad_disponible', 0)
          .maybeSingle();
        
        if (stockError) {
          console.error('Error fetching stock:', stockError);
          omitidos++;
          continue;
        }
        
        if (!stockItemFresh || stockItemFresh.cantidad_disponible <= 0) {
          console.log(`Sin stock para insumo ${insumo.insumo_catalogo_id}`);
          omitidos++;
          continue;
        }
        
        // Calculate actual quantity to send (limited by FRESH available stock)
        const cantidadReal = Math.min(insumo.cantidadEnviar, stockItemFresh.cantidad_disponible);
        
        if (cantidadReal <= 0) {
          omitidos++;
          continue;
        }

        // 1. Create transfer record with tirada_id and optional ruta_id
        const { data: transferencia, error: transError } = await supabase
          .from('transferencias_central_hospital')
          .insert({
            hospital_destino_id: selectedHospital.hospital_id,
            insumo_catalogo_id: insumo.insumo_catalogo_id,
            cantidad_enviada: cantidadReal,
            estado: 'enviado',
            enviado_por: user?.id,
            alerta_creada: true,
            tirada_id: tiradaId,
            ruta_id: selectedRutaForTransfer || null
          })
          .select()
          .single();

        if (transError) throw transError;

        // 2. Create alert for almacenista with tirada_id
        const { error: alertError } = await supabase
          .from('alertas_transferencia')
          .insert({
            transferencia_id: transferencia.id,
            hospital_id: selectedHospital.hospital_id,
            insumo_catalogo_id: insumo.insumo_catalogo_id,
            cantidad_enviada: cantidadReal,
            estado: 'pendiente',
            tirada_id: tiradaId
          });

        if (alertError) {
          console.error('Error creating alert:', alertError);
        }

        // 3. Decrease almacen central immediately - VERIFICAR QUE FUNCIONE
        const nuevaCantidad = Math.max(0, stockItemFresh.cantidad_disponible - cantidadReal);
        const { error: updateError } = await supabase
          .from('almacen_central')
          .update({
            cantidad_disponible: nuevaCantidad,
            updated_at: new Date().toISOString()
          })
          .eq('id', stockItemFresh.id);

        if (updateError) {
          console.error('Error actualizando almacén central:', updateError);
          erroresDescuento++;
        } else {
          console.log(`Almacén central actualizado: ${stockItemFresh.cantidad_disponible} -> ${nuevaCantidad} para insumo ${insumo.nombre}`);
        }

        enviados++;
      }

      let mensaje = `${enviados} insumos enviados a ${selectedHospital.hospital_nombre}`;
      if (omitidos > 0) mensaje += ` (${omitidos} omitidos por falta de stock)`;
      if (erroresDescuento > 0) mensaje += ` (${erroresDescuento} con error al descontar)`;
      
      toast.success(mensaje);
      setDialogOpen(false);
      setSelectedHospital(null);
      
      // Refresh data to update cards
      await fetchData();

    } catch (error) {
      console.error('Error executing bulk transfer:', error);
      toast.error('Error al ejecutar transferencias');
    } finally {
      setEnviando(false);
    }
  };

  // State for merma tracking
  const [mermas, setMermas] = useState<Record<string, { cantidad: number; motivo: string }>>({});

  // Functions for receiving orders
  const abrirRecibirDialog = (orden: OrdenRecibir) => {
    setOrdenRecibiendo(orden);
    const initialCantidades: Record<string, number> = {};
    const initialMermas: Record<string, { cantidad: number; motivo: string }> = {};
    orden.items?.forEach(item => {
      initialCantidades[item.id] = item.cantidad_solicitada;
      initialMermas[item.id] = { cantidad: 0, motivo: '' };
    });
    setCantidadesRecibidas(initialCantidades);
    setMermas(initialMermas);
    setRecibirDialogOpen(true);
  };

  const actualizarCantidadRecibida = (itemId: string, cantidad: number, solicitada: number) => {
    setCantidadesRecibidas(prev => ({ ...prev, [itemId]: cantidad }));
    // Auto-calculate merma
    const merma = Math.max(0, solicitada - cantidad);
    setMermas(prev => ({ ...prev, [itemId]: { ...prev[itemId], cantidad: merma } }));
  };

  const confirmarRecepcion = async () => {
    if (!ordenRecibiendo) return;

    setEnviando(true);
    let actualizadosExitosamente = 0;
    let erroresActualizacion = 0;
    
    try {
      // 1. Update almacen_central with received quantities and track mermas
      for (const item of ordenRecibiendo.items || []) {
        const cantidadRecibida = cantidadesRecibidas[item.id] || 0;
        const mermaData = mermas[item.id] || { cantidad: 0, motivo: '' };
        
        if (cantidadRecibida > 0) {
          // Consultar el estado actual del almacén central para este insumo
          const { data: existingItem, error: fetchError } = await supabase
            .from('almacen_central')
            .select('*')
            .eq('insumo_catalogo_id', item.insumo_catalogo_id)
            .maybeSingle();

          if (fetchError) {
            console.error('Error fetching almacen_central:', fetchError);
            erroresActualizacion++;
            continue;
          }

          if (existingItem) {
            // Sumar al stock existente
            const nuevaCantidad = existingItem.cantidad_disponible + cantidadRecibida;
            const { error: updateError } = await supabase
              .from('almacen_central')
              .update({
                cantidad_disponible: nuevaCantidad,
                updated_at: new Date().toISOString()
              })
              .eq('id', existingItem.id);

            if (updateError) {
              console.error('Error updating almacen_central:', updateError);
              erroresActualizacion++;
            } else {
              console.log(`Almacén central actualizado: ${existingItem.cantidad_disponible} + ${cantidadRecibida} = ${nuevaCantidad} para ${item.insumo?.nombre}`);
              actualizadosExitosamente++;
            }
          } else {
            // Crear nuevo registro con lote y fecha de caducidad
            const loteNuevo = `LOTE-${ordenRecibiendo.numero_pedido}-${Date.now().toString(36).toUpperCase()}`;
            // Fecha de caducidad por defecto: 1 año desde hoy
            const fechaCaducidad = new Date();
            fechaCaducidad.setFullYear(fechaCaducidad.getFullYear() + 1);
            
            const { error: insertError } = await supabase
              .from('almacen_central')
              .insert({
                insumo_catalogo_id: item.insumo_catalogo_id,
                cantidad_disponible: cantidadRecibida,
                lote: loteNuevo,
                fecha_caducidad: fechaCaducidad.toISOString().split('T')[0],
                ubicacion: 'Almacén Central México'
              });

            if (insertError) {
              console.error('Error inserting almacen_central:', insertError);
              erroresActualizacion++;
            } else {
              console.log(`Nuevo registro en almacén central: ${cantidadRecibida} unidades de ${item.insumo?.nombre}, lote ${loteNuevo}`);
              actualizadosExitosamente++;
            }
          }
        }

        // Update pedido_items with merma info
        const { error: itemUpdateError } = await supabase
          .from('pedido_items')
          .update({
            cantidad_recibida: cantidadRecibida,
            cantidad_merma: mermaData.cantidad,
            motivo_merma: mermaData.motivo || null,
            estado: 'recibido'
          })
          .eq('id', item.id);

        if (itemUpdateError) {
          console.error('Error updating pedido_items:', itemUpdateError);
        }
      }

      // 2. Update order status to 'recibido'
      const { error: ordenUpdateError } = await supabase
        .from('pedidos_compra')
        .update({
          estado: 'recibido',
          completado_at: new Date().toISOString()
        })
        .eq('id', ordenRecibiendo.id);

      if (ordenUpdateError) {
        console.error('Error updating pedidos_compra:', ordenUpdateError);
      }

      if (erroresActualizacion > 0) {
        toast.warning(`Orden ${ordenRecibiendo.numero_pedido} recibida. ${actualizadosExitosamente} items actualizados, ${erroresActualizacion} con errores.`);
      } else {
        toast.success(`Orden ${ordenRecibiendo.numero_pedido} recibida. ${actualizadosExitosamente} items agregados al Almacén Central.`);
      }
      
      setRecibirDialogOpen(false);
      setOrdenRecibiendo(null);
      await fetchData();

    } catch (error) {
      console.error('Error confirming reception:', error);
      toast.error('Error al confirmar recepción');
    } finally {
      setEnviando(false);
    }
  };

  const marcarDocumentoProcesado = async (docId: string) => {
    try {
      await supabase
        .from('documentos_necesidades_segmentado')
        .update({
          procesado_por_cadena: true,
          procesado_at: new Date().toISOString()
        })
        .eq('id', docId);

      toast.success('Documento marcado como procesado');
      fetchData();
    } catch (error) {
      console.error('Error marking document:', error);
      toast.error('Error al marcar documento');
    }
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'pendiente': return 'secondary';
      case 'enviado': return 'outline';
      case 'aceptado': return 'outline';
      case 'rechazado': return 'destructive';
      default: return 'outline';
    }
  };

  const documentosPendientes = documentos.filter(d => !d.procesado_por_cadena);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Panel de Cadena de Suministros</h1>
          <p className="text-muted-foreground">Distribución de insumos a hospitales</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Documentos Pendientes</CardTitle>
            <FileText className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documentosPendientes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Órdenes por Recibir</CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ordenesParaRecibir.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hospitales con Faltantes</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Set(documentosPendientes.flatMap(d => d.detalles?.map(det => det.hospital_id) || [])).size}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Items en Almacén</CardTitle>
            <Warehouse className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{almacenCentral.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transferencias Hoy</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {transferencias.filter(t => 
                new Date(t.fecha).toDateString() === new Date().toDateString()
              ).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="recibir" className="space-y-4">
        <TabsList>
          <TabsTrigger value="recibir">
            Recepción de Órdenes
            {ordenesParaRecibir.length > 0 && (
              <Badge variant="destructive" className="ml-2">{ordenesParaRecibir.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="distribucion">
            Distribución a Hospitales
            {documentosPendientes.length > 0 && (
              <Badge variant="secondary" className="ml-2">{documentosPendientes.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="almacen">Almacén Central</TabsTrigger>
          <TabsTrigger value="transferencias">Historial</TabsTrigger>
        </TabsList>

        {/* Tab: Recepción de Órdenes Pagadas */}
        <TabsContent value="recibir" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Órdenes Pagadas Pendientes de Recibir
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Revisa los items de cada orden y confirma la recepción para actualizar el Almacén Central
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Cargando...</div>
              ) : ordenesParaRecibir.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay órdenes pendientes de recibir
                </div>
              ) : (
                <div className="space-y-6">
                  {ordenesParaRecibir.map(orden => (
                    <Card key={orden.id} className="border-l-4 border-l-primary">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-mono font-bold text-lg">{orden.numero_pedido}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(orden.created_at).toLocaleDateString('es-MX', {
                                year: 'numeric', month: 'long', day: 'numeric'
                              })}
                            </p>
                          </div>
                          <Badge className="bg-amber-100 text-amber-800">Pagado - Espera Confirmación</Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {/* Show items preview */}
                        <div className="mb-4">
                          <p className="text-sm font-medium text-muted-foreground mb-2">Items a recibir:</p>
                          {orden.items && orden.items.length > 0 ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Clave</TableHead>
                                  <TableHead>Insumo</TableHead>
                                  <TableHead className="text-right">Cantidad Solicitada</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {orden.items.slice(0, 5).map(item => (
                                  <TableRow key={item.id}>
                                    <TableCell className="font-mono text-sm">{item.insumo?.clave || 'N/A'}</TableCell>
                                    <TableCell className="max-w-[200px]">
                                      <span className="block truncate" title={item.insumo?.nombre || 'Sin nombre'}>
                                        {item.insumo?.nombre || 'Sin nombre'}
                                      </span>
                                    </TableCell>
                                    <TableCell className="text-right font-mono font-bold">{item.cantidad_solicitada}</TableCell>
                                  </TableRow>
                                ))}
                                {orden.items.length > 5 && (
                                  <TableRow>
                                    <TableCell colSpan={3} className="text-center text-muted-foreground text-sm">
                                      ... y {orden.items.length - 5} items más
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          ) : (
                            <p className="text-muted-foreground text-sm py-2">Cargando items...</p>
                          )}
                        </div>
                        <div className="flex justify-end">
                          <Button onClick={() => abrirRecibirDialog(orden)} size="lg">
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Confirmar Recepción ({orden.total_items} items)
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Distribución - Cards por Hospital with Route Filter */}
        <TabsContent value="distribucion" className="space-y-4">
          {/* Route Filter */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Label>Filtrar por Ruta:</Label>
                </div>
                <Select value={selectedRutaFilter} onValueChange={setSelectedRutaFilter}>
                  <SelectTrigger className="w-[250px]">
                    <SelectValue placeholder="Todas las rutas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las rutas</SelectItem>
                    {rutas.map(ruta => (
                      <SelectItem key={ruta.id} value={ruta.id}>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3 w-3" />
                          {ruta.nombre_ruta} ({ruta.tipo})
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedRutaFilter !== 'all' && (
                  <Badge variant="secondary">
                    {getHospitalesEnRuta(selectedRutaFilter).length} hospitales en ruta
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : documentos.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8 text-muted-foreground">
                No hay documentos recibidos
              </CardContent>
            </Card>
          ) : (
            documentos.map(doc => {
              const hospitalesAgrupados = agruparPorHospital(doc, selectedRutaFilter);
              
              return (
                <Card key={doc.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span>Documento del {new Date(doc.fecha_generacion).toLocaleDateString('es-MX', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}</span>
                        {doc.procesado_por_cadena ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Procesado
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Clock className="mr-1 h-3 w-3" />
                            Pendiente
                          </Badge>
                        )}
                      </div>
                      {!doc.procesado_por_cadena && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => marcarDocumentoProcesado(doc.id)}
                        >
                          Marcar procesado
                        </Button>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {hospitalesAgrupados.length === 0 ? (
                      <p className="text-muted-foreground text-center py-4">
                        {selectedRutaFilter !== 'all' ? 'No hay hospitales en esta ruta con necesidades' : 'Sin detalles'}
                      </p>
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {hospitalesAgrupados.map(hospital => {
                          const totalInsumos = hospital.insumos.length;
                          const insumosConStock = hospital.insumos.filter(i => i.stockCentral > 0).length;
                          
                          return (
                            <Card 
                              key={hospital.hospital_id} 
                              className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-primary"
                              onClick={() => abrirDialogHospital(hospital)}
                            >
                              <CardHeader className="pb-2">
                                <CardTitle className="text-base flex items-center gap-2">
                                  <Building2 className="h-4 w-4" />
                                  {hospital.hospital_nombre}
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-2 text-sm">
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Insumos requeridos:</span>
                                    <span className="font-bold">{totalInsumos}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Con stock central:</span>
                                    <span className={insumosConStock > 0 ? 'text-green-600 font-bold' : 'text-destructive'}>
                                      {insumosConStock}
                                    </span>
                                  </div>
                                  <Button 
                                    className="w-full mt-2" 
                                    size="sm"
                                    disabled={insumosConStock === 0}
                                  >
                                    <Send className="mr-2 h-4 w-4" />
                                    Enviar Insumos
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="almacen" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stock del Almacén Central México</CardTitle>
            </CardHeader>
            <CardContent>
              {almacenCentral.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay stock en el almacén central
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clave</TableHead>
                      <TableHead>Insumo</TableHead>
                      <TableHead>Lote</TableHead>
                      <TableHead className="text-right">Cantidad Disponible</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {almacenCentral.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">{item.insumo?.clave}</TableCell>
                        <TableCell className="font-medium">{item.insumo?.nombre}</TableCell>
                        <TableCell className="font-mono text-sm">{item.lote}</TableCell>
                        <TableCell className="text-right font-mono font-bold text-green-600">
                          {item.cantidad_disponible.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transferencias" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historial de Transferencias</CardTitle>
            </CardHeader>
            <CardContent>
              {transferencias.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay transferencias registradas
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Hospital Destino</TableHead>
                      <TableHead>Insumo</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transferencias.map((trans) => (
                      <TableRow key={trans.id}>
                        <TableCell>
                          {new Date(trans.fecha).toLocaleDateString('es-MX', {
                            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                          })}
                        </TableCell>
                        <TableCell className="font-medium">
                          {trans.hospital?.display_name || trans.hospital?.nombre}
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{trans.insumo?.nombre}</div>
                            <div className="text-sm text-muted-foreground">{trans.insumo?.clave}</div>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono">{trans.cantidad_enviada}</TableCell>
                        <TableCell>
                          <Badge variant={getEstadoColor(trans.estado)}>{trans.estado}</Badge>
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

      {/* Dialog: Enviar insumos a hospital */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Enviar Insumos a {selectedHospital?.hospital_nombre}
            </DialogTitle>
          </DialogHeader>
          {selectedHospital && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-2 pr-4">
                {selectedHospital.insumos.map((insumo) => (
                  <Card key={insumo.insumo_catalogo_id} className={insumo.stockCentral === 0 ? 'opacity-50' : ''}>
                    <CardContent className="py-3 px-4">
                      <div className="space-y-2">
                        {/* Nombre del insumo - ocupa todo el ancho */}
                        <div className="w-full">
                          <p className="font-medium text-sm leading-tight break-words">{insumo.nombre}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{insumo.clave}</p>
                        </div>
                        {/* Fila de cantidades */}
                        <div className="flex items-center justify-between gap-2 pt-1 border-t">
                          <div className="flex items-center gap-4">
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground">Faltante</p>
                              <p className="font-mono text-destructive font-bold text-base">{insumo.faltante}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-xs text-muted-foreground">Stock Central</p>
                              <p className={`font-mono font-bold text-base ${insumo.stockCentral > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                                {insumo.stockCentral}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground whitespace-nowrap">Enviar:</Label>
                            <Input
                              type="number"
                              min={0}
                              max={insumo.stockCentral}
                              value={insumo.cantidadEnviar}
                              onChange={(e) => actualizarCantidad(insumo.insumo_catalogo_id, Number(e.target.value))}
                              disabled={insumo.stockCentral === 0}
                              className="h-8 w-20 text-center font-mono font-bold"
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
          {/* Warning for insufficient stock */}
          {tieneStockInsuficiente(selectedHospital) && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800">Stock insuficiente en algunos insumos</p>
                <p className="text-amber-700">Se enviará solo lo disponible. El resto quedará pendiente.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={ejecutarTransferenciaMasiva} 
              disabled={enviando || !selectedHospital?.insumos.some(i => i.cantidadEnviar > 0 && i.cantidadEnviar <= i.stockCentral)}
            >
              <Send className="mr-2 h-4 w-4" />
              {enviando ? 'Enviando...' : 'Confirmar Envío'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Recibir orden */}
      <Dialog open={recibirDialogOpen} onOpenChange={setRecibirDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Recibir Orden {ordenRecibiendo?.numero_pedido}
            </DialogTitle>
          </DialogHeader>
          {ordenRecibiendo && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-3 pr-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Ajusta las cantidades recibidas. Las diferencias se registrarán como merma:
                </p>
                {ordenRecibiendo.items?.map((item) => {
                  const mermaData = mermas[item.id] || { cantidad: 0, motivo: '' };
                  // Truncate name to 60 characters
                  const nombreCorto = item.insumo?.nombre && item.insumo.nombre.length > 60
                    ? item.insumo.nombre.substring(0, 60) + '...'
                    : item.insumo?.nombre;
                  return (
                    <Card key={item.id} className={mermaData.cantidad > 0 ? 'border-amber-300 bg-amber-50/30' : ''}>
                      <CardContent className="py-3">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0 max-w-[300px]">
                              <p className="font-medium text-sm leading-tight" title={item.insumo?.nombre}>
                                {nombreCorto}
                              </p>
                              <p className="text-xs text-muted-foreground">{item.insumo?.clave}</p>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <div className="text-center">
                                <p className="text-muted-foreground">Solicitado</p>
                                <p className="font-mono font-bold">{item.cantidad_solicitada}</p>
                              </div>
                              <div className="w-24">
                                <Label className="text-xs text-muted-foreground">Recibido</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  value={cantidadesRecibidas[item.id] || 0}
                                  onChange={(e) => actualizarCantidadRecibida(
                                    item.id, 
                                    Number(e.target.value), 
                                    item.cantidad_solicitada
                                  )}
                                  className="h-8"
                                />
                              </div>
                              <div className="text-center">
                                <p className="text-muted-foreground">Merma</p>
                                <p className={`font-mono font-bold ${mermaData.cantidad > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                  {mermaData.cantidad}
                                </p>
                              </div>
                            </div>
                          </div>
                          {mermaData.cantidad > 0 && (
                            <div className="pl-0">
                              <Input
                                placeholder="Motivo de la merma (opcional)"
                                value={mermaData.motivo}
                                onChange={(e) => setMermas(prev => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], motivo: e.target.value }
                                }))}
                                className="h-8 text-sm"
                              />
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecibirDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarRecepcion} disabled={enviando}>
              <CheckCircle className="mr-2 h-4 w-4" />
              {enviando ? 'Procesando...' : 'Confirmar Recepción'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CadenaSuministrosDashboard;
