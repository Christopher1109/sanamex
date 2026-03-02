import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RefreshCw, Package, CheckCircle, AlertTriangle, Settings2, Layers, ChevronRight } from 'lucide-react';
import { useHospital } from '@/contexts/HospitalContext';
import EdicionMasivaMínimos from '@/components/forms/EdicionMasivaMínimos';

interface AlertaTransferencia {
  id: string;
  transferencia_id: string;
  hospital_id: string;
  insumo_catalogo_id: string;
  cantidad_enviada: number;
  cantidad_aceptada: number | null;
  cantidad_merma: number;
  motivo_merma: string | null;
  estado: string;
  created_at: string;
  notas: string | null;
  tirada_id: string | null;
  insumo?: { id: string; nombre: string; clave: string };
}

interface TiradaAgrupada {
  tirada_id: string;
  fecha: string;
  alertas: AlertaTransferencia[];
  estado: 'pendiente' | 'parcialmente_recibida' | 'completa';
  total_insumos: number;
}

const AlmacenistaAlertasTransferencia = () => {
  const { selectedHospital } = useHospital();
  const [alertas, setAlertas] = useState<AlertaTransferencia[]>([]);
  const [tiradasAgrupadas, setTiradasAgrupadas] = useState<TiradaAgrupada[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog states
  const [dialogTiradaOpen, setDialogTiradaOpen] = useState(false);
  const [selectedTirada, setSelectedTirada] = useState<TiradaAgrupada | null>(null);
  const [cantidadesRecibidas, setCantidadesRecibidas] = useState<Record<string, number>>({});
  const [mermas, setMermas] = useState<Record<string, number>>({});
  const [motivosMerma, setMotivosMerma] = useState<Record<string, string>>({});
  const [procesando, setProcesando] = useState(false);

  useEffect(() => {
    if (selectedHospital) {
      fetchAlertas();
    }
  }, [selectedHospital]);

  const fetchAlertas = async () => {
    if (!selectedHospital) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('alertas_transferencia')
        .select(`
          *,
          insumo:insumos_catalogo(id, nombre, clave)
        `)
        .eq('hospital_id', selectedHospital.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAlertas(data || []);
      agruparPorTirada(data || []);
    } catch (error) {
      console.error('Error fetching alerts:', error);
      toast.error('Error al cargar alertas');
    } finally {
      setLoading(false);
    }
  };

  const agruparPorTirada = (alertasData: AlertaTransferencia[]) => {
    const tiradaMap = new Map<string, TiradaAgrupada>();
    const sinTirada: AlertaTransferencia[] = [];
    
    alertasData.forEach(alerta => {
      if (alerta.tirada_id) {
        if (tiradaMap.has(alerta.tirada_id)) {
          tiradaMap.get(alerta.tirada_id)!.alertas.push(alerta);
        } else {
          tiradaMap.set(alerta.tirada_id, {
            tirada_id: alerta.tirada_id,
            fecha: alerta.created_at,
            alertas: [alerta],
            estado: 'pendiente',
            total_insumos: 0
          });
        }
      } else {
        sinTirada.push(alerta);
      }
    });

    // Calculate estado for each tirada
    tiradaMap.forEach(tirada => {
      tirada.total_insumos = tirada.alertas.length;
      const pendientes = tirada.alertas.filter(a => a.estado === 'pendiente').length;
      const procesadas = tirada.alertas.filter(a => a.estado !== 'pendiente').length;
      
      if (pendientes === tirada.alertas.length) {
        tirada.estado = 'pendiente';
      } else if (procesadas === tirada.alertas.length) {
        tirada.estado = 'completa';
      } else {
        tirada.estado = 'parcialmente_recibida';
      }
    });

    // Add individual alerts without tirada_id as separate "tiradas"
    sinTirada.forEach(alerta => {
      tiradaMap.set(alerta.id, {
        tirada_id: alerta.id,
        fecha: alerta.created_at,
        alertas: [alerta],
        estado: alerta.estado === 'pendiente' ? 'pendiente' : 'completa',
        total_insumos: 1
      });
    });

    setTiradasAgrupadas(
      Array.from(tiradaMap.values()).sort((a, b) => 
        new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
      )
    );
  };

  const abrirDialogTirada = (tirada: TiradaAgrupada) => {
    setSelectedTirada(tirada);
    const initialCantidades: Record<string, number> = {};
    const initialMermas: Record<string, number> = {};
    tirada.alertas.forEach(a => {
      initialCantidades[a.id] = a.cantidad_enviada;
      initialMermas[a.id] = 0;
    });
    setCantidadesRecibidas(initialCantidades);
    setMermas(initialMermas);
    setMotivosMerma({});
    setDialogTiradaOpen(true);
  };

  const procesarTirada = async () => {
    if (!selectedTirada || !selectedHospital) return;

    setProcesando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Collect all alert IDs to update at once for the tirada
      const alertaIds = selectedTirada.alertas.map(a => a.id);
      
      // Process each alerta
      const updatePromises = selectedTirada.alertas.map(async (alerta) => {
        const cantidadRecibida = cantidadesRecibidas[alerta.id] || 0;
        const merma = mermas[alerta.id] || 0;
        const motivoMerma = motivosMerma[alerta.id] || '';

        // Update alert
        const { error: alertaError } = await supabase
          .from('alertas_transferencia')
          .update({
            cantidad_aceptada: cantidadRecibida,
            cantidad_merma: merma,
            motivo_merma: merma > 0 ? motivoMerma : null,
            estado: merma > 0 ? 'aceptada_parcial' : 'aceptada',
            aceptada_at: new Date().toISOString(),
            aceptada_por: user?.id
          })
          .eq('id', alerta.id);

        if (alertaError) {
          console.error('Error updating alerta:', alerta.id, alertaError);
          throw alertaError;
        }

        // Register merma if any
        if (merma > 0) {
          await supabase
            .from('mermas_transferencia')
            .insert({
              alerta_transferencia_id: alerta.id,
              insumo_catalogo_id: alerta.insumo_catalogo_id,
              cantidad_enviada: alerta.cantidad_enviada,
              cantidad_recibida: cantidadRecibida,
              cantidad_merma: merma,
              motivo: motivoMerma,
              registrado_por: user?.id
            });
        }

        // Update hospital inventory using hybrid system (inventario_consolidado + inventario_lotes)
        const { data: almacenHospital } = await supabase
          .from('almacenes')
          .select('id')
          .eq('hospital_id', selectedHospital.id)
          .maybeSingle();

        if (almacenHospital) {
          // Check if consolidado exists
          const { data: existingConsolidado } = await supabase
            .from('inventario_consolidado')
            .select('id, cantidad_total')
            .eq('hospital_id', selectedHospital.id)
            .eq('almacen_id', almacenHospital.id)
            .eq('insumo_catalogo_id', alerta.insumo_catalogo_id)
            .maybeSingle();

          let consolidadoId: string;

          if (existingConsolidado) {
            // Update consolidado total
            await supabase
              .from('inventario_consolidado')
              .update({
                cantidad_total: existingConsolidado.cantidad_total + cantidadRecibida,
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
                almacen_id: almacenHospital.id,
                insumo_catalogo_id: alerta.insumo_catalogo_id,
                cantidad_total: cantidadRecibida,
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
                cantidad: cantidadRecibida,
                fecha_entrada: new Date().toISOString(),
                ubicacion: 'Transferencia Central'
              });
          }
        }

        // Update transfer status
        await supabase
          .from('transferencias_central_hospital')
          .update({
            estado: 'recibido',
            recibido_at: new Date().toISOString(),
            recibido_por: user?.id
          })
          .eq('id', alerta.transferencia_id);
          
        return alerta.id;
      });

      // Wait for ALL updates to complete
      await Promise.all(updatePromises);
      
      console.log('Tirada procesada, alertas actualizadas:', alertaIds);

      const totalMerma = Object.values(mermas).reduce((sum, m) => sum + m, 0);
      toast.success(
        totalMerma > 0 
          ? `Tirada aceptada con ${totalMerma} unidades de merma total` 
          : `Tirada de ${selectedTirada.alertas.length} insumos aceptada completamente`
      );

      // Close dialog first
      setDialogTiradaOpen(false);
      setSelectedTirada(null);
      
      // Then reload data to reflect changes
      await fetchAlertas();

    } catch (error) {
      console.error('Error processing tirada:', error);
      toast.error('Error al procesar tirada');
    } finally {
      setProcesando(false);
    }
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'pendiente': return 'destructive';
      case 'parcialmente_recibida': return 'secondary';
      case 'completa': return 'outline';
      default: return 'outline';
    }
  };

  const tiradasPendientes = tiradasAgrupadas.filter(t => t.estado !== 'completa');
  const tiradasCompletas = tiradasAgrupadas.filter(t => t.estado === 'completa');

  if (!selectedHospital) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Selecciona un hospital para ver las alertas de transferencia</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Recepción de Insumos</h1>
          <p className="text-muted-foreground">Recepción de transferencias desde Almacén Central</p>
        </div>
        <Button onClick={fetchAlertas} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>
      
      <Tabs defaultValue="tiradas" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tiradas" className="flex items-center gap-1">
            <Layers className="h-3.5 w-3.5" />
            Recepción por Tirada
            {tiradasPendientes.length > 0 && (
              <Badge variant="destructive" className="ml-1">{tiradasPendientes.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="minimos" className="flex items-center gap-1">
            <Settings2 className="h-3.5 w-3.5" />
            Configurar Mínimos
          </TabsTrigger>
        </TabsList>
        
        {/* Tab: Recepción por Tirada */}
        <TabsContent value="tiradas" className="space-y-4">
          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tiradas Pendientes</CardTitle>
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tiradasPendientes.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tiradas Completas</CardTitle>
                <CheckCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tiradasCompletas.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Insumos Pendientes</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {tiradasPendientes.reduce((sum, t) => sum + t.alertas.filter(a => a.estado === 'pendiente').length, 0)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tiradas Pendientes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-destructive" />
                Tiradas Pendientes de Recepción
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Cada tirada agrupa los insumos enviados en un mismo envío desde Cadena de Suministros
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Cargando...</div>
              ) : tiradasPendientes.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No hay tiradas pendientes de recepción
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {tiradasPendientes.map((tirada) => (
                    <Card 
                      key={tirada.tirada_id}
                      className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-destructive"
                      onClick={() => abrirDialogTirada(tirada)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base">
                            {new Date(tirada.fecha).toLocaleDateString('es-MX', {
                              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                            })}
                          </CardTitle>
                          <Badge variant={getEstadoColor(tirada.estado)} className="uppercase text-xs">
                            {tirada.estado.replace('_', ' ')}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Insumos:</span>
                            <span className="font-bold">{tirada.total_insumos}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Unidades total:</span>
                            <span className="font-bold">
                              {tirada.alertas.reduce((sum, a) => sum + a.cantidad_enviada, 0)}
                            </span>
                          </div>
                        </div>
                        <Button variant="default" size="sm" className="w-full mt-3">
                          Procesar Tirada <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Historial de Tiradas */}
          <Card>
            <CardHeader>
              <CardTitle>Historial de Tiradas Recibidas</CardTitle>
            </CardHeader>
            <CardContent>
              {tiradasCompletas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">Sin historial</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead className="text-right">Insumos</TableHead>
                      <TableHead className="text-right">Total Recibido</TableHead>
                      <TableHead className="text-right">Merma Total</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tiradasCompletas.slice(0, 10).map((tirada) => (
                      <TableRow key={tirada.tirada_id}>
                        <TableCell>
                          {new Date(tirada.fecha).toLocaleDateString('es-MX', {
                            day: 'numeric', month: 'short'
                          })}
                        </TableCell>
                        <TableCell className="text-right font-mono">{tirada.total_insumos}</TableCell>
                        <TableCell className="text-right font-mono">
                          {tirada.alertas.reduce((sum, a) => sum + (a.cantidad_aceptada || 0), 0)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {tirada.alertas.reduce((sum, a) => sum + a.cantidad_merma, 0) > 0 ? (
                            <span className="text-destructive">
                              {tirada.alertas.reduce((sum, a) => sum + a.cantidad_merma, 0)}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Completa
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Tab: Configurar Mínimos */}
        <TabsContent value="minimos" className="space-y-4">
          <EdicionMasivaMínimos hospitalId={selectedHospital?.id} onActualizado={fetchAlertas} />
        </TabsContent>
      </Tabs>

      {/* Dialog: Procesar Tirada */}
      <Dialog open={dialogTiradaOpen} onOpenChange={setDialogTiradaOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Procesar Tirada - {selectedTirada && new Date(selectedTirada.fecha).toLocaleDateString('es-MX', {
                day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
              })}
            </DialogTitle>
          </DialogHeader>
          {selectedTirada && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-3 pr-4">
                {selectedTirada.alertas.filter(a => a.estado === 'pendiente').map((alerta) => (
                  <Card key={alerta.id}>
                    <CardContent className="py-3">
                      <div className="grid gap-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{alerta.insumo?.nombre}</p>
                            <p className="text-sm text-muted-foreground">{alerta.insumo?.clave}</p>
                          </div>
                          <Badge variant="secondary">Enviadas: {alerta.cantidad_enviada}</Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label className="text-xs">Cantidad Recibida</Label>
                            <Input
                              type="number"
                              min={0}
                              max={alerta.cantidad_enviada}
                              value={cantidadesRecibidas[alerta.id] || 0}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setCantidadesRecibidas(prev => ({ ...prev, [alerta.id]: val }));
                                setMermas(prev => ({ ...prev, [alerta.id]: alerta.cantidad_enviada - val }));
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Merma</Label>
                            <Input
                              type="number"
                              min={0}
                              value={mermas[alerta.id] || 0}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 0;
                                setMermas(prev => ({ ...prev, [alerta.id]: val }));
                                setCantidadesRecibidas(prev => ({ 
                                  ...prev, 
                                  [alerta.id]: alerta.cantidad_enviada - val 
                                }));
                              }}
                            />
                          </div>
                          {(mermas[alerta.id] || 0) > 0 && (
                            <div>
                              <Label className="text-xs">Motivo Merma</Label>
                              <Input
                                placeholder="Ej: Dañado"
                                value={motivosMerma[alerta.id] || ''}
                                onChange={(e) => setMotivosMerma(prev => ({ 
                                  ...prev, 
                                  [alerta.id]: e.target.value 
                                }))}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogTiradaOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={procesarTirada} disabled={procesando}>
              <CheckCircle className="mr-2 h-4 w-4" />
              {procesando ? 'Procesando...' : 'Aceptar Tirada Completa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AlmacenistaAlertasTransferencia;
