import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Save, Search, Package, Settings2, Loader2 } from 'lucide-react';

interface InsumoConfig {
  id: string;
  insumo_catalogo_id: string;
  min_global_inventario: number | null;
  max_global_inventario: number | null;
  insumo?: { id: string; nombre: string; clave: string };
}

interface InsumoCatalogo {
  id: string;
  nombre: string;
  clave: string | null;
}

interface EdicionMasivaMínimosProps {
  hospitalId?: string; // Ya no se usa para filtrar, pero se mantiene por compatibilidad
  esGlobal?: boolean;  // Ya no se usa, todos los mínimos son globales
  onActualizado?: () => void;
}

const EdicionMasivaMínimos = ({ onActualizado }: EdicionMasivaMínimosProps) => {
  const [configuraciones, setConfiguraciones] = useState<InsumoConfig[]>([]);
  const [insumosCatalogo, setInsumosCatalogo] = useState<InsumoCatalogo[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [cambiosPendientes, setCambiosPendientes] = useState<Map<string, { minimo: number; maximo: number | null; insumo_catalogo_id: string }>>(new Map());

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Obtener todos los insumos del catálogo activos
      const { data: catalogoData, error: catalogoError } = await supabase
        .from('insumos_catalogo')
        .select('id, nombre, clave')
        .eq('activo', true)
        .order('nombre');

      if (catalogoError) throw catalogoError;
      setInsumosCatalogo(catalogoData || []);

      // Obtener configuraciones existentes
      const { data: configData, error: configError } = await supabase
        .from('insumo_configuracion')
        .select(`
          id,
          insumo_catalogo_id,
          min_global_inventario,
          max_global_inventario,
          insumo:insumos_catalogo(id, nombre, clave)
        `)
        .order('insumo_catalogo_id');

      if (configError) throw configError;
      setConfiguraciones(configData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const getConfigForInsumo = (insumoId: string): InsumoConfig | undefined => {
    return configuraciones.find(c => c.insumo_catalogo_id === insumoId);
  };

  const handleMinimoChange = (insumoId: string, value: number) => {
    const config = getConfigForInsumo(insumoId);
    const cambiosActuales = cambiosPendientes.get(insumoId) || { 
      minimo: config?.min_global_inventario ?? 10, 
      maximo: config?.max_global_inventario ?? null,
      insumo_catalogo_id: insumoId
    };
    cambiosPendientes.set(insumoId, { ...cambiosActuales, minimo: value });
    setCambiosPendientes(new Map(cambiosPendientes));
  };

  const handleMaximoChange = (insumoId: string, value: number | null) => {
    const config = getConfigForInsumo(insumoId);
    const cambiosActuales = cambiosPendientes.get(insumoId) || { 
      minimo: config?.min_global_inventario ?? 10, 
      maximo: config?.max_global_inventario ?? null,
      insumo_catalogo_id: insumoId
    };
    cambiosPendientes.set(insumoId, { ...cambiosActuales, maximo: value });
    setCambiosPendientes(new Map(cambiosPendientes));
  };

  const guardarCambios = async () => {
    if (cambiosPendientes.size === 0) {
      toast.info('No hay cambios pendientes');
      return;
    }

    setGuardando(true);
    try {
      for (const [insumoId, valores] of cambiosPendientes.entries()) {
        const configExistente = getConfigForInsumo(insumoId);
        
        if (configExistente) {
          // Actualizar TODOS los registros con este insumo_catalogo_id (por si hay duplicados)
          const { error } = await supabase
            .from('insumo_configuracion')
            .update({
              min_global_inventario: valores.minimo,
              max_global_inventario: valores.maximo,
              updated_at: new Date().toISOString()
            })
            .eq('insumo_catalogo_id', insumoId);
          
          if (error) throw error;
        } else {
          // Crear nueva configuración
          const { error } = await supabase
            .from('insumo_configuracion')
            .insert({
              insumo_catalogo_id: insumoId,
              min_global_inventario: valores.minimo,
              max_global_inventario: valores.maximo
            });
          
          if (error) throw error;
        }
      }

      toast.success(`${cambiosPendientes.size} mínimos/máximos globales actualizados`);
      setCambiosPendientes(new Map());
      fetchData();
      onActualizado?.();
    } catch (error) {
      console.error('Error saving changes:', error);
      toast.error('Error al guardar cambios');
    } finally {
      setGuardando(false);
    }
  };

  const getValorActual = (insumoId: string) => {
    const cambios = cambiosPendientes.get(insumoId);
    if (cambios) {
      return { minimo: cambios.minimo, maximo: cambios.maximo };
    }
    const config = getConfigForInsumo(insumoId);
    return {
      minimo: config?.min_global_inventario ?? 10,
      maximo: config?.max_global_inventario ?? null
    };
  };

  const insumosFiltrados = insumosCatalogo.filter(insumo => {
    if (!busqueda) return true;
    const search = busqueda.toLowerCase();
    return (
      insumo.nombre?.toLowerCase().includes(search) ||
      insumo.clave?.toLowerCase().includes(search)
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            <span>Configuración Global de Mínimos y Máximos</span>
          </div>
          {cambiosPendientes.size > 0 && (
            <Button onClick={guardarCambios} disabled={guardando}>
              {guardando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Guardar {cambiosPendientes.size} cambio{cambiosPendientes.size !== 1 ? 's' : ''}
            </Button>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-2">
          Estos mínimos se aplican a todos los hospitales por igual
        </p>
        <div className="flex gap-4 pt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o clave..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : insumosFiltrados.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No hay insumos en el catálogo</p>
          </div>
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead>Clave</TableHead>
                  <TableHead>Insumo</TableHead>
                  <TableHead className="text-right w-[120px]">Mínimo Global</TableHead>
                  <TableHead className="text-right w-[120px]">Máximo Global</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {insumosFiltrados.map((insumo) => {
                  const valores = getValorActual(insumo.id);
                  const tieneCambios = cambiosPendientes.has(insumo.id);
                  const configExiste = !!getConfigForInsumo(insumo.id);
                  
                  return (
                    <TableRow 
                      key={insumo.id} 
                      className={tieneCambios ? 'bg-amber-50/50' : ''}
                    >
                      <TableCell className="font-mono text-sm">{insumo.clave || '-'}</TableCell>
                      <TableCell className="font-medium">{insumo.nombre}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={valores.minimo}
                          onChange={(e) => handleMinimoChange(insumo.id, parseInt(e.target.value) || 0)}
                          className={`w-20 text-right font-mono ${tieneCambios ? 'border-amber-500' : ''}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          value={valores.maximo ?? ''}
                          onChange={(e) => handleMaximoChange(insumo.id, e.target.value ? parseInt(e.target.value) : null)}
                          placeholder="—"
                          className={`w-20 text-right font-mono ${tieneCambios ? 'border-amber-500' : ''}`}
                        />
                      </TableCell>
                      <TableCell>
                        {configExiste ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            Configurado
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            Por defecto (10)
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {!loading && insumosFiltrados.length > 0 && (
          <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
            <span>Mostrando {insumosFiltrados.length} de {insumosCatalogo.length} insumos</span>
            <span>{configuraciones.length} con configuración personalizada</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default EdicionMasivaMínimos;
