import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useHospital } from '@/contexts/HospitalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, ArrowRight, Clock, CheckCircle, XCircle, Package, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import TraspasoForm from '@/components/forms/TraspasoForm';
import { toast } from 'sonner';

interface TransferenciaCentral {
  id: string;
  hospital_destino_id: string;
  insumo_catalogo_id: string;
  cantidad_enviada: number;
  estado: string;
  fecha: string;
  notas: string | null;
  insumo?: { id: string; nombre: string; clave: string };
}

interface AlertaTransferencia {
  id: string;
  transferencia_id: string;
  hospital_id: string;
  insumo_catalogo_id: string;
  cantidad_enviada: number;
  cantidad_aceptada: number | null;
  cantidad_merma: number | null;
  motivo_merma: string | null;
  estado: string;
  created_at: string;
  insumo?: { id: string; nombre: string; clave: string };
}

const Traspasos = () => {
  const { user } = useAuth();
  const { selectedHospital } = useHospital();
  const [showForm, setShowForm] = useState(false);
  const [selectedTraspaso, setSelectedTraspaso] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [traspasos, setTraspasos] = useState<any[]>([]);
  const [transferenciasCentral, setTransferenciasCentral] = useState<TransferenciaCentral[]>([]);
  const [alertasTransferencia, setAlertasTransferencia] = useState<AlertaTransferencia[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog for accepting transfer
  const [aceptarDialogOpen, setAceptarDialogOpen] = useState(false);
  const [alertaSeleccionada, setAlertaSeleccionada] = useState<AlertaTransferencia | null>(null);
  const [cantidadAceptada, setCantidadAceptada] = useState(0);
  const [cantidadMerma, setCantidadMerma] = useState(0);
  const [motivoMerma, setMotivoMerma] = useState('');
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    if (user && selectedHospital) {
      fetchTraspasos();
      fetchTransferenciasCentral();
    }
  }, [user, selectedHospital]);

  const fetchTraspasos = async () => {
    try {
      if (!selectedHospital) return;
      
      setLoading(true);
      const { data: traspasosData, error: traspasosError } = await supabase
        .from('traspasos')
        .select('*')
        .or(`hospital_budget_code_origen.eq.${selectedHospital.budget_code},hospital_budget_code_destino.eq.${selectedHospital.budget_code}`)
        .order('created_at', { ascending: false });

      if (traspasosError) throw traspasosError;

      const traspasosConInsumos = await Promise.all(
        (traspasosData || []).map(async (traspaso) => {
          const { data: insumosData } = await supabase
            .from('traspaso_insumos')
            .select('cantidad, insumo_id, insumos(nombre)')
            .eq('traspaso_id', traspaso.id);

          return {
            ...traspaso,
            insumos: (insumosData || []).map((i: any) => ({
              id: i.insumo_id,
              nombre: i.insumos?.nombre || '',
              cantidad: i.cantidad,
            })),
          };
        })
      );

      setTraspasos(traspasosConInsumos);
    } catch (error: any) {
      toast.error('Error al cargar traspasos', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTransferenciasCentral = async () => {
    try {
      if (!selectedHospital) return;

      // Fetch transfers from central warehouse to this hospital
      const { data: transData, error: transError } = await supabase
        .from('transferencias_central_hospital')
        .select(`
          *,
          insumo:insumos_catalogo(id, nombre, clave)
        `)
        .eq('hospital_destino_id', selectedHospital.id)
        .order('fecha', { ascending: false });

      if (transError) throw transError;
      setTransferenciasCentral(transData || []);

      // Fetch alerts for this hospital
      const { data: alertasData, error: alertasError } = await supabase
        .from('alertas_transferencia')
        .select(`
          *,
          insumo:insumos_catalogo(id, nombre, clave)
        `)
        .eq('hospital_id', selectedHospital.id)
        .order('created_at', { ascending: false });

      if (alertasError) throw alertasError;
      setAlertasTransferencia(alertasData || []);

    } catch (error: any) {
      console.error('Error fetching central transfers:', error);
    }
  };

  const handleCreateTraspaso = async (data: any) => {
    try {
      if (!user || !selectedHospital) {
        toast.error('Debes seleccionar un hospital para continuar');
        return;
      }

      const { data: traspasoData, error: traspasoError } = await (supabase as any)
        .from('traspasos')
        .insert([{
          numero_traspaso: `TR-${Date.now()}`,
          unidad_origen: data.unidadOrigen,
          unidad_destino: data.unidadDestino,
          state_name_origen: selectedHospital.state_name,
          hospital_budget_code_origen: selectedHospital.budget_code,
          hospital_display_name_origen: selectedHospital.display_name,
          state_name_destino: data.stateNameDestino || selectedHospital.state_name,
          hospital_budget_code_destino: data.hospitalDestino,
          hospital_display_name_destino: data.hospitalDisplayNameDestino,
        }])
        .select()
        .single();

      if (traspasoError) throw traspasoError;

      if (data.insumos && data.insumos.length > 0) {
        const insumosData = data.insumos.map((insumo: any) => ({
          traspaso_id: traspasoData.id,
          insumo_id: insumo.id,
          cantidad: insumo.cantidad,
        }));

        const { error: insumosError } = await supabase
          .from('traspaso_insumos')
          .insert(insumosData);

        if (insumosError) throw insumosError;
      }

      toast.success('Traspaso creado exitosamente');
      setShowForm(false);
      fetchTraspasos();
    } catch (error: any) {
      toast.error('Error al crear traspaso', {
        description: error.message,
      });
    }
  };

  const abrirDialogAceptar = (alerta: AlertaTransferencia) => {
    setAlertaSeleccionada(alerta);
    setCantidadAceptada(alerta.cantidad_enviada);
    setCantidadMerma(0);
    setMotivoMerma('');
    setAceptarDialogOpen(true);
  };

  const confirmarRecepcion = async () => {
    if (!alertaSeleccionada || !selectedHospital) return;

    setProcesando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Update alerta
      await supabase
        .from('alertas_transferencia')
        .update({
          estado: 'aceptada',
          cantidad_aceptada: cantidadAceptada,
          cantidad_merma: cantidadMerma,
          motivo_merma: motivoMerma || null,
          aceptada_at: new Date().toISOString(),
          aceptada_por: user?.id
        })
        .eq('id', alertaSeleccionada.id);

      // 2. Update transfer status
      await supabase
        .from('transferencias_central_hospital')
        .update({
          estado: 'recibido',
          recibido_at: new Date().toISOString(),
          recibido_por: user?.id
        })
        .eq('id', alertaSeleccionada.transferencia_id);

      // 3. Add to hospital inventory using new hybrid system (inventario_consolidado + inventario_lotes)
      const { data: almacen } = await supabase
        .from('almacenes')
        .select('id')
        .eq('hospital_id', selectedHospital.id)
        .maybeSingle();

      if (almacen) {
        // Check if consolidado exists
        const { data: existingConsolidado } = await supabase
          .from('inventario_consolidado')
          .select('id, cantidad_total')
          .eq('hospital_id', selectedHospital.id)
          .eq('almacen_id', almacen.id)
          .eq('insumo_catalogo_id', alertaSeleccionada.insumo_catalogo_id)
          .maybeSingle();

        let consolidadoId: string;

        if (existingConsolidado) {
          // Update consolidado total
          await supabase
            .from('inventario_consolidado')
            .update({
              cantidad_total: existingConsolidado.cantidad_total + cantidadAceptada,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingConsolidado.id);
          consolidadoId = existingConsolidado.id;
        } else {
          // Create new consolidado record
          const { data: newConsolidado } = await supabase
            .from('inventario_consolidado')
            .insert({
              hospital_id: selectedHospital.id,
              almacen_id: almacen.id,
              insumo_catalogo_id: alertaSeleccionada.insumo_catalogo_id,
              cantidad_total: cantidadAceptada,
              cantidad_minima: 10
            })
            .select()
            .single();
          consolidadoId = newConsolidado?.id;
        }

        // Create new lote record for FIFO tracking
        if (consolidadoId) {
          await supabase
            .from('inventario_lotes')
            .insert({
              consolidado_id: consolidadoId,
              cantidad: cantidadAceptada,
              fecha_entrada: new Date().toISOString(),
              ubicacion: 'Transferencia Central'
            });
        }
      }

      toast.success('Transferencia aceptada. Inventario actualizado.');
      setAceptarDialogOpen(false);
      setAlertaSeleccionada(null);
      fetchTransferenciasCentral();

    } catch (error: any) {
      console.error('Error accepting transfer:', error);
      toast.error('Error al aceptar transferencia');
    } finally {
      setProcesando(false);
    }
  };

  const getEstadoConfig = (estado: string) => {
    switch (estado) {
      case 'pendiente':
        return { icon: Clock, variant: 'default' as const, label: 'Pendiente', color: 'text-warning' };
      case 'completado':
      case 'aceptado':
      case 'aceptada':
      case 'recibido':
        return { icon: CheckCircle, variant: 'default' as const, label: 'Completado', color: 'text-success' };
      case 'rechazado':
        return { icon: XCircle, variant: 'destructive' as const, label: 'Rechazado', color: 'text-destructive' };
      case 'enviado':
        return { icon: Truck, variant: 'default' as const, label: 'Enviado', color: 'text-primary' };
      default:
        return { icon: Clock, variant: 'default' as const, label: estado, color: 'text-muted-foreground' };
    }
  };

  const alertasPendientes = alertasTransferencia.filter(a => a.estado === 'pendiente');
  const pendientes = traspasos.filter(t => t.estado === 'pendiente').length;
  const completados = traspasos.filter(t => t.estado === 'completado').length;

  if (!selectedHospital) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Traspasos</h1>
          <p className="text-muted-foreground">Gestión de movimientos de inventario</p>
        </div>
        <Alert>
          <AlertDescription>
            Debes seleccionar un hospital para ver y gestionar los traspasos.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Traspasos</h1>
          <p className="text-muted-foreground">
            Gestión de movimientos de inventario - {selectedHospital.display_name}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Nuevo Traspaso
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Recepciones Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{alertasPendientes.length}</div>
            <p className="text-xs text-muted-foreground">desde Almacén Central</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Traspasos Pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{pendientes}</div>
            <p className="text-xs text-muted-foreground">entre hospitales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Completados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{completados}</div>
            <p className="text-xs text-muted-foreground">traspasos exitosos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Transferencias Central</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{transferenciasCentral.length}</div>
            <p className="text-xs text-muted-foreground">recibidas del central</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="central" className="space-y-4">
        <TabsList>
          <TabsTrigger value="central">
            Desde Almacén Central
            {alertasPendientes.length > 0 && (
              <Badge variant="destructive" className="ml-2">{alertasPendientes.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="hospitales">Entre Hospitales</TabsTrigger>
        </TabsList>

        {/* Transfers from Central Warehouse */}
        <TabsContent value="central" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Transferencias desde Almacén Central
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Acepta las transferencias enviadas desde el almacén central y reporta mermas si aplica.
              </p>
            </CardHeader>
            <CardContent>
              {alertasPendientes.length === 0 && transferenciasCentral.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay transferencias desde el almacén central
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Insumo</TableHead>
                      <TableHead className="text-right">Cantidad Enviada</TableHead>
                      <TableHead className="text-right">Aceptada</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alertasTransferencia.map((alerta) => {
                      const estadoConfig = getEstadoConfig(alerta.estado);
                      return (
                        <TableRow key={alerta.id}>
                          <TableCell>
                            {new Date(alerta.created_at).toLocaleDateString('es-MX')}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{alerta.insumo?.nombre}</p>
                              <p className="text-sm text-muted-foreground">{alerta.insumo?.clave}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            {alerta.cantidad_enviada}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {alerta.cantidad_aceptada ?? '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={estadoConfig.variant} className="gap-1">
                              <estadoConfig.icon className="h-3 w-3" />
                              {estadoConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {alerta.estado === 'pendiente' ? (
                              <Button size="sm" onClick={() => abrirDialogAceptar(alerta)}>
                                <CheckCircle className="mr-2 h-4 w-4" />
                                Aceptar
                              </Button>
                            ) : alerta.cantidad_merma && alerta.cantidad_merma > 0 ? (
                              <span className="text-sm text-destructive">
                                Merma: {alerta.cantidad_merma}
                              </span>
                            ) : (
                              <span className="text-sm text-muted-foreground">Procesado</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transfers between hospitals */}
        <TabsContent value="hospitales" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Historial de Traspasos entre Hospitales</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center text-muted-foreground py-8">Cargando traspasos...</p>
              ) : traspasos.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No hay traspasos registrados</p>
              ) : (
                <div className="space-y-4">
                  {traspasos.map((traspaso) => {
                    const estadoConfig = getEstadoConfig(traspaso.estado);
                    const EstadoIcon = estadoConfig.icon;
                    
                    return (
                      <Card key={traspaso.id} className="border-l-4 border-l-primary">
                        <CardContent className="pt-6">
                          <div className="space-y-4">
                            <div className="flex items-start justify-between">
                              <div className="space-y-2 flex-1">
                                <div className="flex items-center gap-3">
                                  <Badge variant={estadoConfig.variant} className="gap-1">
                                    <EstadoIcon className="h-3 w-3" />
                                    {estadoConfig.label}
                                  </Badge>
                                  <span className="text-sm text-muted-foreground">
                                    {new Date(traspaso.created_at).toLocaleDateString()}
                                  </span>
                                </div>
                                
                                <div className="flex items-center gap-3 text-sm">
                                  <div className="flex flex-col">
                                    <span className="font-medium">{traspaso.hospital_display_name_origen || traspaso.unidad_origen}</span>
                                    <span className="text-xs text-muted-foreground">{traspaso.state_name_origen}</span>
                                  </div>
                                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                  <div className="flex flex-col">
                                    <span className="font-medium">{traspaso.hospital_display_name_destino || traspaso.unidad_destino}</span>
                                    <span className="text-xs text-muted-foreground">{traspaso.state_name_destino}</span>
                                  </div>
                                </div>

                                {traspaso.insumos && traspaso.insumos.length > 0 && (
                                  <div className="rounded-lg bg-muted/50 p-3">
                                    <p className="mb-2 text-sm font-medium">Insumos:</p>
                                    <ul className="space-y-1 text-sm">
                                      {traspaso.insumos.map((insumo: any, index: number) => (
                                        <li key={index}>
                                          • {insumo.nombre}: <span className="font-medium">{insumo.cantidad} unidades</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <TraspasoForm 
            onClose={() => setShowForm(false)} 
            onSubmit={handleCreateTraspaso}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog: Accept transfer */}
      <Dialog open={aceptarDialogOpen} onOpenChange={setAceptarDialogOpen}>
        <DialogContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold">Aceptar Transferencia</h3>
              <p className="text-sm text-muted-foreground">
                {alertaSeleccionada?.insumo?.nombre}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cantidad Enviada</Label>
                <p className="text-2xl font-bold">{alertaSeleccionada?.cantidad_enviada}</p>
              </div>
              <div>
                <Label htmlFor="cantidadAceptada">Cantidad Aceptada</Label>
                <Input
                  id="cantidadAceptada"
                  type="number"
                  min={0}
                  max={alertaSeleccionada?.cantidad_enviada}
                  value={cantidadAceptada}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setCantidadAceptada(val);
                    setCantidadMerma((alertaSeleccionada?.cantidad_enviada || 0) - val);
                  }}
                />
              </div>
            </div>

            {cantidadMerma > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label>Merma:</Label>
                  <Badge variant="destructive">{cantidadMerma} unidades</Badge>
                </div>
                <div>
                  <Label htmlFor="motivoMerma">Motivo de Merma</Label>
                  <Textarea
                    id="motivoMerma"
                    placeholder="Describe el motivo de la merma..."
                    value={motivoMerma}
                    onChange={(e) => setMotivoMerma(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setAceptarDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={confirmarRecepcion} disabled={procesando}>
                <CheckCircle className="mr-2 h-4 w-4" />
                {procesando ? 'Procesando...' : 'Confirmar Recepción'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Traspasos;
