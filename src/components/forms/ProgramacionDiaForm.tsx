import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Calendar, Plus, Minus, Package, ArrowRight, Loader2, AlertTriangle, Check } from 'lucide-react';
import { useRegistroActividad } from '@/hooks/useRegistroActividad';

// Ya no necesitamos mapeo, usamos procedimiento_insumos_catalogo directamente

interface Procedimiento {
  clave: string;
  nombre: string;
}

interface InsumoCalculado {
  insumo_catalogo_id: string;
  nombre: string;
  clave: string | null;
  cantidad_sugerida: number;
  cantidad_editable: number;
  stock_disponible: number;
  stock_insuficiente: boolean;
}

interface ProgramacionDiaFormProps {
  hospitalId: string;
  almacenProvId: string;
  almacenProvNombre: string;
  onClose: () => void;
  onSuccess: () => void;
}

const ProgramacionDiaForm = ({
  hospitalId,
  almacenProvId,
  almacenProvNombre,
  onClose,
  onSuccess,
}: ProgramacionDiaFormProps) => {
  const { registrarActividad } = useRegistroActividad();
  const [procedimientosHospital, setProcedimientosHospital] = useState<Procedimiento[]>([]);
  const [cantidadesProcedimiento, setCantidadesProcedimiento] = useState<Record<string, number>>({});
  const [insumosCalculados, setInsumosCalculados] = useState<InsumoCalculado[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [paso, setPaso] = useState<'seleccion' | 'revision'>('seleccion');

  // Cargar procedimientos autorizados para el hospital
  useEffect(() => {
    const cargarProcedimientos = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('hospital_procedimientos')
          .select('procedimiento_clave, procedimiento_nombre')
          .eq('hospital_id', hospitalId)
          .eq('activo', true)
          .order('procedimiento_clave');

        if (error) throw error;

        setProcedimientosHospital(
          (data || []).map((p) => ({
            clave: p.procedimiento_clave,
            nombre: p.procedimiento_nombre,
          }))
        );
      } catch (error) {
        console.error('Error loading procedures:', error);
        toast.error('Error al cargar procedimientos');
      } finally {
        setLoading(false);
      }
    };

    cargarProcedimientos();
  }, [hospitalId]);

  const totalCirugias = useMemo(() => {
    return Object.values(cantidadesProcedimiento).reduce((sum, qty) => sum + qty, 0);
  }, [cantidadesProcedimiento]);

  const ajustarCantidad = (clave: string, delta: number) => {
    setCantidadesProcedimiento((prev) => {
      const actual = prev[clave] || 0;
      const nueva = Math.max(0, actual + delta);
      if (nueva === 0) {
        const { [clave]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [clave]: nueva };
    });
  };

  const calcularInsumos = async () => {
    const procedimientosSeleccionados = Object.entries(cantidadesProcedimiento).filter(
      ([_, qty]) => qty > 0
    );

    if (procedimientosSeleccionados.length === 0) {
      toast.error('Selecciona al menos un procedimiento');
      return;
    }

    setCalculando(true);
    try {
      // Obtener las claves de procedimientos seleccionados
      const clavesSeleccionadas = procedimientosSeleccionados.map(([clave]) => clave);

      // Obtener insumos desde procedimiento_insumos_catalogo con los datos del catálogo
      const { data: procedimientoInsumos, error: piError } = await supabase
        .from('procedimiento_insumos_catalogo')
        .select(`
          procedimiento_clave,
          insumo_catalogo_id,
          cantidad_sugerida,
          insumos_catalogo!inner(id, nombre, clave)
        `)
        .in('procedimiento_clave', clavesSeleccionadas)
        .eq('activo', true);

      if (piError) throw piError;

      // Calcular cantidades por insumo sumando según cantidad de procedimientos
      const insumosTotales = new Map<string, { 
        insumo_catalogo_id: string;
        nombre: string;
        clave: string | null;
        cantidad: number;
      }>();

      for (const [procClave, cantidadProcedimientos] of procedimientosSeleccionados) {
        const insumosDelProcedimiento = (procedimientoInsumos || []).filter(
          (pi) => pi.procedimiento_clave === procClave
        );

        for (const pi of insumosDelProcedimiento) {
          const catalogo = pi.insumos_catalogo as any;
          const cantidadBase = pi.cantidad_sugerida || 1;
          const cantidadTotal = cantidadBase * cantidadProcedimientos;

          const existente = insumosTotales.get(pi.insumo_catalogo_id);
          if (existente) {
            existente.cantidad += cantidadTotal;
          } else {
            insumosTotales.set(pi.insumo_catalogo_id, {
              insumo_catalogo_id: pi.insumo_catalogo_id,
              nombre: catalogo.nombre,
              clave: catalogo.clave,
              cantidad: cantidadTotal,
            });
          }
        }
      }

      // Obtener stock disponible del almacén general del hospital
      const insumoIds = Array.from(insumosTotales.keys());
      
      const { data: inventario, error: invError } = await supabase
        .from('inventario_consolidado')
        .select('insumo_catalogo_id, cantidad_total')
        .eq('hospital_id', hospitalId)
        .in('insumo_catalogo_id', insumoIds);

      if (invError) throw invError;

      const stockMap = new Map<string, number>();
      for (const inv of inventario || []) {
        stockMap.set(inv.insumo_catalogo_id, inv.cantidad_total);
      }

      // Construir lista final
      const resultado: InsumoCalculado[] = Array.from(insumosTotales.values()).map((item) => {
        const stockDisponible = stockMap.get(item.insumo_catalogo_id) || 0;
        return {
          insumo_catalogo_id: item.insumo_catalogo_id,
          nombre: item.nombre,
          clave: item.clave,
          cantidad_sugerida: item.cantidad,
          cantidad_editable: Math.min(item.cantidad, stockDisponible),
          stock_disponible: stockDisponible,
          stock_insuficiente: stockDisponible < item.cantidad,
        };
      });

      // Ordenar: primero los que tienen stock suficiente, luego por nombre
      resultado.sort((a, b) => {
        if (a.stock_insuficiente !== b.stock_insuficiente) {
          return a.stock_insuficiente ? 1 : -1;
        }
        return a.nombre.localeCompare(b.nombre);
      });

      setInsumosCalculados(resultado);
      setPaso('revision');
    } catch (error) {
      console.error('Error calculating insumos:', error);
      toast.error('Error al calcular insumos');
    } finally {
      setCalculando(false);
    }
  };

  const actualizarCantidadInsumo = (insumoId: string, nuevaCantidad: number) => {
    setInsumosCalculados((prev) =>
      prev.map((item) =>
        item.insumo_catalogo_id === insumoId
          ? { ...item, cantidad_editable: Math.max(0, Math.min(nuevaCantidad, item.stock_disponible)) }
          : item
      )
    );
  };

  const ejecutarTraspaso = async () => {
    const itemsATransferir = insumosCalculados.filter((item) => item.cantidad_editable > 0);

    if (itemsATransferir.length === 0) {
      toast.error('No hay insumos para transferir');
      return;
    }

    setEjecutando(true);
    setProgreso(0);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Cargar lotes e inventario provisional en paralelo
      setProgreso(10);
      
      const [lotesRes, provRes] = await Promise.all([
        supabase
          .from('inventario_lotes')
          .select(`
            id, cantidad, consolidado_id,
            inventario_consolidado!inner(insumo_catalogo_id, hospital_id)
          `)
          .eq('inventario_consolidado.hospital_id', hospitalId)
          .gt('cantidad', 0)
          .order('fecha_entrada', { ascending: true }),
        supabase
          .from('almacen_provisional_inventario')
          .select('id, insumo_catalogo_id, cantidad_disponible')
          .eq('almacen_provisional_id', almacenProvId),
      ]);

      if (lotesRes.error) throw lotesRes.error;
      if (provRes.error) throw provRes.error;

      setProgreso(30);

      // Mapear lotes por insumo
      const lotesPorInsumo = new Map<string, Array<{ id: string; cantidad: number; consolidado_id: string }>>();
      for (const lote of lotesRes.data || []) {
        const insumoCatId = (lote.inventario_consolidado as any).insumo_catalogo_id;
        const arr = lotesPorInsumo.get(insumoCatId) || [];
        arr.push({ id: lote.id, cantidad: lote.cantidad, consolidado_id: lote.consolidado_id });
        lotesPorInsumo.set(insumoCatId, arr);
      }

      // Mapear inventario provisional
      const provPorInsumo = new Map<string, { id: string; cantidad_disponible: number }>();
      for (const item of provRes.data || []) {
        provPorInsumo.set(item.insumo_catalogo_id, item);
      }

      // Preparar actualizaciones batch
      const updateLotes: Array<{ id: string; cantidad: number }> = [];
      const updateConsolidados = new Map<string, number>();
      const updateProv: Array<{ id: string; cantidad_disponible: number }> = [];
      const insertProv: Array<{ almacen_provisional_id: string; insumo_catalogo_id: string; cantidad_disponible: number }> = [];
      const movimientos: Array<{
        almacen_provisional_id: string;
        hospital_id: string;
        insumo_catalogo_id: string;
        cantidad: number;
        tipo: string;
        usuario_id: string | undefined;
        observaciones: string;
      }> = [];

      for (const item of itemsATransferir) {
        const lotes = lotesPorInsumo.get(item.insumo_catalogo_id) || [];
        let cantidadRestante = item.cantidad_editable;

        for (const lote of lotes) {
          if (cantidadRestante <= 0) break;
          const aDescontar = Math.min(cantidadRestante, lote.cantidad);
          lote.cantidad -= aDescontar;
          updateLotes.push({ id: lote.id, cantidad: lote.cantidad });
          
          const currentDeduct = updateConsolidados.get(lote.consolidado_id) || 0;
          updateConsolidados.set(lote.consolidado_id, currentDeduct + aDescontar);
          
          cantidadRestante -= aDescontar;
        }

        const existente = provPorInsumo.get(item.insumo_catalogo_id);
        if (existente) {
          updateProv.push({
            id: existente.id,
            cantidad_disponible: existente.cantidad_disponible + item.cantidad_editable,
          });
        } else {
          insertProv.push({
            almacen_provisional_id: almacenProvId,
            insumo_catalogo_id: item.insumo_catalogo_id,
            cantidad_disponible: item.cantidad_editable,
          });
        }

        movimientos.push({
          almacen_provisional_id: almacenProvId,
          hospital_id: hospitalId,
          insumo_catalogo_id: item.insumo_catalogo_id,
          cantidad: item.cantidad_editable,
          tipo: 'entrada',
          usuario_id: user?.id,
          observaciones: 'Traspaso desde programación del día',
        });
      }

      setProgreso(50);

      // Ejecutar TODAS las actualizaciones en paralelo con batches más grandes
      const BATCH_SIZE = 100;
      const timestamp = new Date().toISOString();

      // 1. Actualizar lotes en paralelo (batches de 100)
      const loteBatches = [];
      for (let i = 0; i < updateLotes.length; i += BATCH_SIZE) {
        loteBatches.push(updateLotes.slice(i, i + BATCH_SIZE));
      }
      await Promise.all(
        loteBatches.map((batch) =>
          Promise.all(
            batch.map((lote) =>
              supabase
                .from('inventario_lotes')
                .update({ cantidad: lote.cantidad, updated_at: timestamp })
                .eq('id', lote.id)
            )
          )
        )
      );

      setProgreso(65);

      // 2. Obtener TODOS los consolidados de una vez y actualizar en paralelo
      const consolidadoIds = Array.from(updateConsolidados.keys());
      if (consolidadoIds.length > 0) {
        const { data: consolidadosActuales } = await supabase
          .from('inventario_consolidado')
          .select('id, cantidad_total')
          .in('id', consolidadoIds);

        if (consolidadosActuales) {
          const consolidadoMap = new Map(consolidadosActuales.map(c => [c.id, c.cantidad_total]));
          
          await Promise.all(
            Array.from(updateConsolidados.entries()).map(([consolidadoId, cantidadRestar]) => {
              const cantidadActual = consolidadoMap.get(consolidadoId) || 0;
              return supabase
                .from('inventario_consolidado')
                .update({
                  cantidad_total: Math.max(0, cantidadActual - cantidadRestar),
                  updated_at: timestamp,
                })
                .eq('id', consolidadoId);
            })
          );
        }
      }

      setProgreso(80);

      // 3. Ejecutar todo el inventario provisional y movimientos en paralelo
      const finalPromises = [];

      // Updates de inventario provisional existente
      for (const item of updateProv) {
        finalPromises.push(
          supabase
            .from('almacen_provisional_inventario')
            .update({ cantidad_disponible: item.cantidad_disponible, updated_at: timestamp })
            .eq('id', item.id)
        );
      }

      // Inserts de nuevo inventario provisional
      if (insertProv.length > 0) {
        finalPromises.push(
          supabase.from('almacen_provisional_inventario').insert(insertProv)
        );
      }

      // Registrar movimientos
      if (movimientos.length > 0) {
        finalPromises.push(
          supabase.from('movimientos_almacen_provisional').insert(movimientos)
        );
      }

      await Promise.all(finalPromises);

      setProgreso(100);

      // Registrar actividad de traspaso por programación
      const insumosAfectados = itemsATransferir.map(item => ({
        insumo_id: item.insumo_catalogo_id,
        nombre: item.nombre,
        clave: item.clave || '',
        cantidad: item.cantidad_editable,
      }));

      const procedimientosUsados = Object.entries(cantidadesProcedimiento)
        .filter(([_, cant]) => cant > 0)
        .map(([clave, cantidad]) => {
          const proc = procedimientosHospital.find(p => p.clave === clave);
          return { clave, nombre: proc?.nombre || clave, cantidad };
        });

      await registrarActividad({
        tipo_actividad: 'traspaso_almacen_provisional',
        descripcion: `Traspaso por programación: ${itemsATransferir.length} insumos al almacén "${almacenProvNombre}"`,
        almacen_origen_nombre: 'Almacén General',
        almacen_destino_id: almacenProvId,
        almacen_destino_nombre: almacenProvNombre,
        insumos_afectados: insumosAfectados,
        cantidad_total: insumosAfectados.reduce((sum, i) => sum + i.cantidad, 0),
        detalles_adicionales: {
          procedimientos: procedimientosUsados,
          tipo_traspaso: 'programacion_dia',
        }
      });

      toast.success(`${itemsATransferir.length} insumos transferidos a ${almacenProvNombre}`);
      onSuccess();
    } catch (error) {
      console.error('Error executing transfer:', error);
      toast.error('Error al realizar el traspaso');
    } finally {
      setEjecutando(false);
      setProgreso(0);
    }
  };

  const insumosConStock = insumosCalculados.filter((i) => i.cantidad_editable > 0);
  const insumosSinStock = insumosCalculados.filter((i) => i.stock_disponible === 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (procedimientosHospital.length === 0) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          No hay procedimientos autorizados para este hospital. Contacta al supervisor.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {paso === 'seleccion' ? (
        <>
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold">Programación del Día</h3>
              <p className="text-sm text-muted-foreground">
                Selecciona los procedimientos que habrá hoy y el sistema calculará los insumos necesarios
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {procedimientosHospital.map((proc) => {
              const cantidad = cantidadesProcedimiento[proc.clave] || 0;
              return (
                <Card key={proc.clave} className={cantidad > 0 ? 'border-primary bg-primary/5' : ''}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex-1">
                      <div className="font-medium">{proc.nombre}</div>
                      <div className="text-sm text-muted-foreground">Código: {proc.clave}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => ajustarCantidad(proc.clave, -1)}
                        disabled={cantidad === 0}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <div className="w-12 text-center font-mono text-lg font-bold">{cantidad}</div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => ajustarCantidad(proc.clave, 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {totalCirugias > 0 && (
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <span className="font-semibold">{totalCirugias}</span> cirugía{totalCirugias !== 1 ? 's' : ''} programada{totalCirugias !== 1 ? 's' : ''}
              </div>
              <Badge variant="default">{almacenProvNombre}</Badge>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={calcularInsumos}
              disabled={totalCirugias === 0 || calculando}
              className="flex-1"
            >
              {calculando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ArrowRight className="mr-2 h-4 w-4" />
              )}
              Calcular Insumos
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold">Insumos Calculados</h3>
                <p className="text-sm text-muted-foreground">
                  Revisa y ajusta las cantidades antes de transferir
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setPaso('seleccion')}>
              Volver
            </Button>
          </div>

          {insumosSinStock.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {insumosSinStock.length} insumo{insumosSinStock.length !== 1 ? 's' : ''} sin stock disponible
              </AlertDescription>
            </Alert>
          )}

          <ScrollArea className="h-[400px] border rounded-lg">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Insumo</TableHead>
                  <TableHead className="text-right w-24">Sugerido</TableHead>
                  <TableHead className="text-right w-24">Stock</TableHead>
                  <TableHead className="text-right w-32">Cantidad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {insumosCalculados.map((item) => (
                  <TableRow key={item.insumo_catalogo_id} className={item.stock_disponible === 0 ? 'opacity-50' : ''}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{item.nombre}</div>
                        {item.clave && <div className="text-xs text-muted-foreground">{item.clave}</div>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">{item.cantidad_sugerida}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={item.stock_insuficiente ? 'destructive' : 'secondary'}>
                        {item.stock_disponible}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        max={item.stock_disponible}
                        value={item.cantidad_editable}
                        onChange={(e) => actualizarCantidadInsumo(item.insumo_catalogo_id, parseInt(e.target.value) || 0)}
                        className="w-20 text-right font-mono ml-auto"
                        disabled={item.stock_disponible === 0}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <span className="font-semibold">{insumosConStock.length}</span> insumos a transferir
            </div>
            <Badge variant="default">{almacenProvNombre}</Badge>
          </div>

          {ejecutando && (
            <div className="space-y-2">
              <Progress value={progreso} />
              <p className="text-sm text-center text-muted-foreground">Transfiriendo insumos...</p>
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1" disabled={ejecutando}>
              Cancelar
            </Button>
            <Button
              onClick={ejecutarTraspaso}
              disabled={insumosConStock.length === 0 || ejecutando}
              className="flex-1"
            >
              {ejecutando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              Transferir {insumosConStock.length} Insumos
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default ProgramacionDiaForm;
