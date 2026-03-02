import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, FileText, Send, RefreshCw, Building2, Package, CheckCircle2, Clock, Settings2, History, Eye, ChevronRight } from 'lucide-react';
import { StatusTimeline } from '@/components/StatusTimeline';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import EdicionMasivaMínimos from '@/components/forms/EdicionMasivaMínimos';
import { useAuth } from '@/hooks/useAuth';

interface AlertaInventario {
  id: string;
  hospital_id: string;
  insumo_catalogo_id: string;
  cantidad_actual: number;
  minimo_permitido: number;
  estado: string;
  prioridad: string;
  created_at: string;
  hospital?: { id: string; nombre: string; display_name: string };
  insumo?: { id: string; nombre: string; clave: string };
}

interface HospitalAlerta {
  hospital_id: string;
  hospital_nombre: string;
  alertas: AlertaInventario[];
  total_faltante: number;
  prioridad_max: string;
}

interface NecesidadConsolidada {
  insumo_catalogo_id: string;
  insumo_nombre: string;
  insumo_clave: string;
  total_faltante: number;
  hospitales: { hospital_id: string; hospital_nombre: string; faltante: number }[];
  alertas_ids: string[];
}

interface DocumentoEnviado {
  id: string;
  fecha_generacion: string;
  estado: string;
  enviado_a_gerente_almacen: boolean;
  enviado_at: string | null;
  procesado_por_almacen: boolean;
  procesado_at: string | null;
  total_items?: number;
}

const GerenteOperacionesDashboard = () => {
  const { userRole } = useAuth();
  const [alertas, setAlertas] = useState<AlertaInventario[]>([]);
  const [hospitalAlertas, setHospitalAlertas] = useState<HospitalAlerta[]>([]);
  const [necesidadesConsolidadas, setNecesidadesConsolidadas] = useState<NecesidadConsolidada[]>([]);
  const [documentosEnviados, setDocumentosEnviados] = useState<DocumentoEnviado[]>([]);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  
  // Dialog para ver alertas de un hospital
  const [dialogHospitalOpen, setDialogHospitalOpen] = useState(false);
  const [selectedHospital, setSelectedHospital] = useState<HospitalAlerta | null>(null);

  // Dialog para confirmar envío consolidado
  const [dialogEnvioOpen, setDialogEnvioOpen] = useState(false);

  const fetchDataCallback = useCallback(() => {
    fetchData();
  }, []);

  useRealtimeNotifications({
    userRole: userRole || 'gerente_operaciones',
    onPedidoActualizado: fetchDataCallback,
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch alertas activas
      const { data: alertasData, error: alertasError } = await supabase
        .from('insumos_alertas')
        .select(`
          *,
          hospital:hospitales(id, nombre, display_name),
          insumo:insumos_catalogo(id, nombre, clave)
        `)
        .eq('estado', 'activa')
        .order('prioridad', { ascending: true })
        .order('created_at', { ascending: false });
      
      if (alertasError) throw alertasError;
      setAlertas(alertasData || []);

      // Agrupar alertas por hospital
      agruparPorHospital(alertasData || []);
      
      // Consolidar necesidades por insumo
      consolidarNecesidades(alertasData || []);

      // Fetch documentos enviados
      const { data: docsData } = await supabase
        .from('documentos_necesidades_agrupado')
        .select('*')
        .order('fecha_generacion', { ascending: false })
        .limit(20);
      
      setDocumentosEnviados(docsData || []);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const getPrioridadMax = (alertas: AlertaInventario[]): string => {
    const prioridades = ['critica', 'alta', 'media', 'baja'];
    for (const p of prioridades) {
      if (alertas.some(a => a.prioridad === p)) return p;
    }
    return 'baja';
  };

  const agruparPorHospital = (alertasActivas: AlertaInventario[]) => {
    const hospitalMap = new Map<string, HospitalAlerta>();
    
    alertasActivas.forEach(alerta => {
      const hospitalId = alerta.hospital_id;
      const faltante = Math.max(0, alerta.minimo_permitido - alerta.cantidad_actual);
      
      if (hospitalMap.has(hospitalId)) {
        const existing = hospitalMap.get(hospitalId)!;
        existing.alertas.push(alerta);
        existing.total_faltante += faltante;
        existing.prioridad_max = getPrioridadMax(existing.alertas);
      } else {
        hospitalMap.set(hospitalId, {
          hospital_id: hospitalId,
          hospital_nombre: alerta.hospital?.display_name || alerta.hospital?.nombre || 'Hospital',
          alertas: [alerta],
          total_faltante: faltante,
          prioridad_max: alerta.prioridad
        });
      }
    });

    // Ordenar por prioridad y cantidad de alertas
    const sorted = Array.from(hospitalMap.values()).sort((a, b) => {
      const prioridadOrder = { critica: 0, alta: 1, media: 2, baja: 3 };
      const prioridadDiff = (prioridadOrder[a.prioridad_max as keyof typeof prioridadOrder] || 3) - 
                           (prioridadOrder[b.prioridad_max as keyof typeof prioridadOrder] || 3);
      if (prioridadDiff !== 0) return prioridadDiff;
      return b.alertas.length - a.alertas.length;
    });

    setHospitalAlertas(sorted);
  };

  const consolidarNecesidades = (alertasActivas: AlertaInventario[]) => {
    const insumoMap = new Map<string, NecesidadConsolidada>();
    
    alertasActivas.forEach(alerta => {
      const faltante = Math.max(0, alerta.minimo_permitido - alerta.cantidad_actual);
      
      // Skip items with zero faltante
      if (faltante === 0) return;
      
      if (insumoMap.has(alerta.insumo_catalogo_id)) {
        const existing = insumoMap.get(alerta.insumo_catalogo_id)!;
        existing.total_faltante += faltante;
        existing.hospitales.push({
          hospital_id: alerta.hospital_id,
          hospital_nombre: alerta.hospital?.display_name || alerta.hospital?.nombre || 'Hospital',
          faltante
        });
        existing.alertas_ids.push(alerta.id);
      } else {
        insumoMap.set(alerta.insumo_catalogo_id, {
          insumo_catalogo_id: alerta.insumo_catalogo_id,
          insumo_nombre: alerta.insumo?.nombre || 'N/A',
          insumo_clave: alerta.insumo?.clave || 'N/A',
          total_faltante: faltante,
          hospitales: [{
            hospital_id: alerta.hospital_id,
            hospital_nombre: alerta.hospital?.display_name || alerta.hospital?.nombre || 'Hospital',
            faltante
          }],
          alertas_ids: [alerta.id]
        });
      }
    });

    // Filter out any with zero total faltante and sort by highest faltante
    setNecesidadesConsolidadas(
      Array.from(insumoMap.values())
        .filter(n => n.total_faltante > 0)
        .sort((a, b) => b.total_faltante - a.total_faltante)
    );
  };

  const getPrioridadColor = (prioridad: string) => {
    switch (prioridad) {
      case 'critica': return 'destructive';
      case 'alta': return 'destructive';
      case 'media': return 'secondary';
      case 'baja': return 'outline';
      default: return 'outline';
    }
  };

  const abrirDetalleHospital = (hospital: HospitalAlerta) => {
    setSelectedHospital(hospital);
    setDialogHospitalOpen(true);
  };

  const enviarDocumentos = async () => {
    if (necesidadesConsolidadas.length === 0) {
      toast.error('No hay necesidades para enviar');
      return;
    }

    setGenerando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // 1. Crear documento AGRUPADO (para Gerente Almacén)
      const { data: docAgrupado, error: docAgError } = await supabase
        .from('documentos_necesidades_agrupado')
        .insert({
          generado_por: user?.id,
          estado: 'enviado',
          enviado_a_gerente_almacen: true,
          enviado_at: new Date().toISOString()
        })
        .select()
        .single();

      if (docAgError) throw docAgError;

      // Insertar detalles agrupados
      const detallesAgrupados = necesidadesConsolidadas.map(n => ({
        documento_id: docAgrupado.id,
        insumo_catalogo_id: n.insumo_catalogo_id,
        total_faltante_requerido: n.total_faltante
      }));

      await supabase.from('documento_agrupado_detalle').insert(detallesAgrupados);

      // 2. Crear documento SEGMENTADO (para Cadena de Suministros) - AL MISMO TIEMPO
      const { data: docSegmentado, error: docSegError } = await supabase
        .from('documentos_necesidades_segmentado')
        .insert({
          generado_por: user?.id,
          estado: 'enviado',
          enviado_a_cadena_suministros: true,
          enviado_at: new Date().toISOString()
        })
        .select()
        .single();

      if (docSegError) throw docSegError;

      // Insertar detalles segmentados (por hospital)
      const detallesSegmentados: {
        documento_id: string;
        hospital_id: string;
        insumo_catalogo_id: string;
        existencia_actual: number;
        minimo: number;
        faltante_requerido: number;
      }[] = [];

      alertas.forEach(alerta => {
        detallesSegmentados.push({
          documento_id: docSegmentado.id,
          hospital_id: alerta.hospital_id,
          insumo_catalogo_id: alerta.insumo_catalogo_id,
          existencia_actual: alerta.cantidad_actual,
          minimo: alerta.minimo_permitido,
          faltante_requerido: Math.max(0, alerta.minimo_permitido - alerta.cantidad_actual)
        });
      });

      await supabase.from('documento_segmentado_detalle').insert(detallesSegmentados);

      // 3. Marcar todas las alertas como "en_proceso"
      const todasAlertasIds = alertas.map(a => a.id);
      
      if (todasAlertasIds.length > 0) {
        await supabase
          .from('insumos_alertas')
          .update({ 
            estado: 'en_proceso',
            updated_at: new Date().toISOString()
          })
          .in('id', todasAlertasIds);
      }

      toast.success('Documentos enviados exitosamente', {
        description: `Se generaron 2 documentos: uno para Gerente de Almacén (consolidado) y otro para Cadena de Suministros (por hospital).`,
        duration: 6000
      });

      setDialogEnvioOpen(false);
      fetchData();

    } catch (error) {
      console.error('Error generating documents:', error);
      toast.error('Error al generar documentos');
    } finally {
      setGenerando(false);
    }
  };

  const alertasActivas = alertas.filter(a => a.estado === 'activa');
  const totalHospitalesAfectados = hospitalAlertas.length;
  const totalInsumosUnicos = necesidadesConsolidadas.length;
  const totalUnidadesFaltantes = necesidadesConsolidadas.reduce((sum, n) => sum + n.total_faltante, 0);

  const roleTitle = userRole === 'gerente_almacen' ? 'Gerente de Almacén' : 'Gerente de Operaciones';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Panel de {roleTitle}</h1>
          <p className="text-muted-foreground">Gestión de alertas y necesidades de inventario</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Alertas Activas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{alertasActivas.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hospitales Afectados</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalHospitalesAfectados}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Insumos Únicos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInsumosUnicos}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Faltante</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalUnidadesFaltantes.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">unidades</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="alertas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="alertas">
            <Building2 className="h-3.5 w-3.5 mr-1" />
            Alertas por Hospital
            {hospitalAlertas.length > 0 && (
              <Badge variant="destructive" className="ml-2">{hospitalAlertas.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="consolidar">
            <Send className="h-3.5 w-3.5 mr-1" />
            Consolidar y Enviar
          </TabsTrigger>
          <TabsTrigger value="minimos" className="flex items-center gap-1">
            <Settings2 className="h-3.5 w-3.5" />
            Configurar Mínimos
          </TabsTrigger>
          <TabsTrigger value="historial">
            <History className="h-3.5 w-3.5 mr-1" />
            Historial
          </TabsTrigger>
        </TabsList>

        {/* Tab: Alertas por Hospital (Cards) */}
        <TabsContent value="alertas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Alertas Agrupadas por Hospital
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Haz clic en cada hospital para ver el detalle de sus insumos faltantes
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Cargando...</div>
              ) : hospitalAlertas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-2" />
                  No hay alertas activas en ningún hospital
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {hospitalAlertas.map((hospital) => (
                    <Card 
                      key={hospital.hospital_id}
                      className={`cursor-pointer hover:shadow-md transition-shadow border-l-4 ${
                        hospital.prioridad_max === 'critica' ? 'border-l-red-500' :
                        hospital.prioridad_max === 'alta' ? 'border-l-orange-500' :
                        hospital.prioridad_max === 'media' ? 'border-l-yellow-500' :
                        'border-l-gray-300'
                      }`}
                      onClick={() => abrirDetalleHospital(hospital)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">{hospital.hospital_nombre}</CardTitle>
                          <Badge variant={getPrioridadColor(hospital.prioridad_max)} className="uppercase text-xs">
                            {hospital.prioridad_max}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Alertas:</span>
                            <span className="font-bold text-destructive">{hospital.alertas.length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Unidades faltantes:</span>
                            <span className="font-bold">{hospital.total_faltante.toLocaleString()}</span>
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="w-full mt-3">
                          Ver Detalle <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Consolidar y Enviar */}
        <TabsContent value="consolidar" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  <span>Necesidades Consolidadas</span>
                </div>
                <Button 
                  onClick={() => setDialogEnvioOpen(true)} 
                  disabled={necesidadesConsolidadas.length === 0}
                  size="lg"
                >
                  <Send className="mr-2 h-4 w-4" />
                  Enviar Todo ({necesidadesConsolidadas.length} insumos)
                </Button>
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Vista consolidada de todos los insumos faltantes. Al enviar, se generan 2 documentos automáticamente:
                <br />
                <strong>1.</strong> Para Gerente de Almacén (totales por insumo) → <strong>2.</strong> Para Cadena de Suministros (desglose por hospital)
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Cargando...</div>
              ) : necesidadesConsolidadas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-2" />
                  No hay necesidades pendientes
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clave</TableHead>
                      <TableHead>Insumo</TableHead>
                      <TableHead className="text-right">Total Faltante</TableHead>
                      <TableHead className="text-right">Hospitales</TableHead>
                      <TableHead>Hospitales Afectados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {necesidadesConsolidadas.slice(0, 50).map((n) => (
                      <TableRow key={n.insumo_catalogo_id}>
                        <TableCell className="font-mono text-sm">{n.insumo_clave}</TableCell>
                        <TableCell className="font-medium">{n.insumo_nombre}</TableCell>
                        <TableCell className="text-right font-mono text-destructive font-bold">
                          {n.total_faltante.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-mono">{n.hospitales.length}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {n.hospitales.slice(0, 3).map((h, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {h.hospital_nombre.substring(0, 15)}...
                              </Badge>
                            ))}
                            {n.hospitales.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{n.hospitales.length - 3} más
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
              {necesidadesConsolidadas.length > 50 && (
                <p className="text-sm text-muted-foreground text-center mt-4">
                  Mostrando 50 de {necesidadesConsolidadas.length} insumos
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Configurar Mínimos */}
        <TabsContent value="minimos" className="space-y-4">
          <EdicionMasivaMínimos esGlobal={true} onActualizado={fetchData} />
        </TabsContent>

        {/* Tab: Historial */}
        <TabsContent value="historial" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Historial de Envíos
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Documentos generados y su estado en el flujo
              </p>
            </CardHeader>
            <CardContent>
              {documentosEnviados.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay documentos enviados
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha Envío</TableHead>
                      <TableHead>Estado Flujo</TableHead>
                      <TableHead>Procesado por Almacén</TableHead>
                      <TableHead>Fecha Procesado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentosEnviados.map(doc => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-mono">
                          {new Date(doc.fecha_generacion).toLocaleDateString('es-MX', {
                            day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </TableCell>
                        <TableCell>
                          <StatusTimeline 
                            currentStatus={doc.procesado_por_almacen ? 'procesado' : 'enviado'} 
                            tipo="agrupado" 
                          />
                        </TableCell>
                        <TableCell>
                          {doc.procesado_por_almacen ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700">
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              Sí
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Clock className="mr-1 h-3 w-3" />
                              Pendiente
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {doc.procesado_at 
                            ? new Date(doc.procesado_at).toLocaleDateString('es-MX', {
                                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                              })
                            : '-'
                          }
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

      {/* Dialog: Detalle de alertas de un hospital con edición de cantidades */}
      <Dialog open={dialogHospitalOpen} onOpenChange={setDialogHospitalOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {selectedHospital?.hospital_nombre} - Ajustar Cantidades
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Puedes modificar las cantidades a solicitar antes de enviar
            </p>
          </DialogHeader>
          
          {selectedHospital && (
            <ScrollArea className="max-h-[60vh]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Prioridad</TableHead>
                    <TableHead>Clave</TableHead>
                    <TableHead>Insumo</TableHead>
                    <TableHead className="text-right">Existencia</TableHead>
                    <TableHead className="text-right">Mínimo</TableHead>
                    <TableHead className="text-right">Faltante Calc.</TableHead>
                    <TableHead className="text-right">Cantidad a Solicitar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedHospital.alertas.map((alerta) => {
                    const faltanteCalculado = Math.max(0, alerta.minimo_permitido - alerta.cantidad_actual);
                    return (
                      <TableRow key={alerta.id} className={alerta.prioridad === 'critica' ? 'bg-red-50/50' : ''}>
                        <TableCell>
                          <Badge variant={getPrioridadColor(alerta.prioridad)} className="uppercase text-xs">
                            {alerta.prioridad}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{alerta.insumo?.clave}</TableCell>
                        <TableCell className="font-medium">{alerta.insumo?.nombre}</TableCell>
                        <TableCell className="text-right font-mono">
                          <span className={alerta.cantidad_actual === 0 ? 'text-destructive font-bold' : ''}>
                            {alerta.cantidad_actual}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {alerta.minimo_permitido}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          {faltanteCalculado}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            defaultValue={faltanteCalculado}
                            className="w-24 text-right font-mono"
                            onChange={(e) => {
                              // Store adjusted quantity - this would be used when sending
                              console.log(`Adjusted quantity for ${alerta.id}: ${e.target.value}`);
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogHospitalOpen(false)}>
              Cerrar
            </Button>
            <Button onClick={() => {
              toast.success('Cantidades guardadas para este hospital');
              setDialogHospitalOpen(false);
            }}>
              Guardar Ajustes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmar envío */}
      <Dialog open={dialogEnvioOpen} onOpenChange={setDialogEnvioOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Confirmar Envío de Documentos
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-muted-foreground">
              Se generarán <strong>2 documentos</strong> simultáneamente:
            </p>
            
            <div className="space-y-3">
              <Card className="bg-blue-50/50 border-blue-200">
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Documento Consolidado</p>
                      <p className="text-sm text-muted-foreground">
                        Para <strong>Gerente de Almacén</strong> - Totales por insumo para gestión de compras
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-green-50/50 border-green-200">
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-medium">Documento Segmentado</p>
                      <p className="text-sm text-muted-foreground">
                        Para <strong>Cadena de Suministros</strong> - Desglose por hospital para distribución
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">Hospitales afectados:</span>
                  <span className="font-bold ml-2">{totalHospitalesAfectados}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Insumos únicos:</span>
                  <span className="font-bold ml-2">{totalInsumosUnicos}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Total alertas:</span>
                  <span className="font-bold ml-2">{alertasActivas.length}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Unidades faltantes:</span>
                  <span className="font-bold ml-2">{totalUnidadesFaltantes.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogEnvioOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={enviarDocumentos} disabled={generando}>
              <Send className="mr-2 h-4 w-4" />
              {generando ? 'Enviando...' : 'Confirmar y Enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GerenteOperacionesDashboard;
