import { useState, useMemo, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Search, AlertCircle, AlertTriangle, Calendar, LayoutGrid, Table2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PaginationControls } from '@/components/ui/pagination-controls';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import InsumoForm from '@/components/forms/InsumoForm';
import InsumoDetailDialog from '@/components/dialogs/InsumoDetailDialog';
import { InsumoGroupedCard } from '@/components/InsumoGroupedCard';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useHospital } from '@/contexts/HospitalContext';
import { useCachedAlmacenes } from '@/hooks/useCachedCatalogs';
import { usePaginatedInventario, useInventarioLotes, useInventarioStats } from '@/hooks/usePaginatedInventario';
import { useHospitalProcedimientos, useInsumosPorProcedimiento } from '@/hooks/useHospitalProcedimientos';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';

interface GroupedInsumo {
  insumo_catalogo_id: string;
  consolidado_id: string;
  nombre: string;
  clave: string | null;
  tipo: string;
  stockTotal: number;
  cantidadMinima: number;
}

const Insumos = () => {
  const { user } = useAuth();
  const { selectedHospital } = useHospital();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedInsumo, setSelectedInsumo] = useState<any>(null);
  const [showDetail, setShowDetail] = useState(false);
  
  // Filtros avanzados
  const [filterStockBajo, setFilterStockBajo] = useState(false);
  const [filterProximosCaducar, setFilterProximosCaducar] = useState(false);
  const [filterTipo, setFilterTipo] = useState<'todos' | 'insumo' | 'medicamento'>('todos');
  const [filterProcedimiento, setFilterProcedimiento] = useState<string>('');

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Get almacen for hospital (cached)
  const { data: almacenes } = useCachedAlmacenes(selectedHospital?.id);
  const almacenId = almacenes?.[0]?.id;

  // Procedimientos del hospital
  const { data: procedimientos = [] } = useHospitalProcedimientos(selectedHospital?.id);
  const { data: insumosProcedimiento } = useInsumosPorProcedimiento(filterProcedimiento || undefined);

  // Paginated inventory data
  const {
    data: inventarioData,
    isLoading,
    page,
    pageSize,
    pageSizeOptions,
    totalCount,
    totalPages,
    hasNextPage,
    hasPreviousPage,
    goToPage,
    nextPage,
    previousPage,
    changePageSize,
    refetch,
    resetPage
  } = usePaginatedInventario({
    hospitalId: selectedHospital?.id,
    almacenId,
    searchTerm: debouncedSearch,
    filterStockBajo,
    filterProximosCaducar,
    filterTipo,
    filterProcedimientoInsumos: insumosProcedimiento
  });

  // Stats (cached separately)
  const { data: stats } = useInventarioStats(selectedHospital?.id, almacenId);

  // Lazy load lotes only for current page items
  const consolidadoIds = useMemo(() => 
    inventarioData.map(item => item.id), 
    [inventarioData]
  );
  
  const { data: lotes = [] } = useInventarioLotes(consolidadoIds, consolidadoIds.length > 0);

  // Reset page when filters change
  useEffect(() => {
    resetPage();
  }, [debouncedSearch, filterStockBajo, filterProximosCaducar, filterTipo, filterProcedimiento, resetPage]);

  // Realtime subscription - lightweight update
  useEffect(() => {
    if (!selectedHospital?.id) return;

    const channel = supabase
      .channel(`inventario-${selectedHospital.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'inventario_consolidado',
          filter: `hospital_id=eq.${selectedHospital.id}`
        },
        () => {
          // Invalidate cache instead of refetching immediately
          queryClient.invalidateQueries({ queryKey: ['inventario-paginated', selectedHospital.id] });
          queryClient.invalidateQueries({ queryKey: ['inventario-stats', selectedHospital.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedHospital?.id, queryClient]);

  // Mapa de lotes por consolidado_id
  const lotesPorConsolidado = useMemo(() => {
    const map = new Map<string, typeof lotes>();
    lotes.forEach(lote => {
      const arr = map.get(lote.consolidado_id) || [];
      arr.push(lote);
      map.set(lote.consolidado_id, arr);
    });
    return map;
  }, [lotes]);

  // Group items for card view
  const groupedInsumos = useMemo((): GroupedInsumo[] => {
    return inventarioData
      .filter(item => item.insumos_catalogo)
      .map(item => ({
        insumo_catalogo_id: item.insumo_catalogo_id,
        consolidado_id: item.id,
        nombre: item.insumos_catalogo.nombre,
        clave: item.insumos_catalogo.clave,
        tipo: item.insumos_catalogo.tipo || 'insumo',
        stockTotal: item.cantidad_total,
        cantidadMinima: item.cantidad_minima || 10
      }));
  }, [inventarioData]);

  // Flat lotes for table view
  const flatLotes = useMemo(() => {
    return inventarioData
      .filter(item => item.insumos_catalogo)
      .flatMap(item => {
        const itemLotes = lotesPorConsolidado.get(item.id) || [];
        return itemLotes.map(lote => ({
          ...lote,
          insumos_catalogo: item.insumos_catalogo,
          cantidad_total: item.cantidad_total
        }));
      });
  }, [inventarioData, lotesPorConsolidado]);

  // Filter lotes for table view
  const filteredLotes = useMemo(() => {
    let result = flatLotes;
    
    if (filterProximosCaducar) {
      result = result.filter(item => isCaducidadProxima(item.fecha_caducidad));
    }
    
    return result;
  }, [flatLotes, filterProximosCaducar]);

  const getStockStatus = (cantidadActual: number, cantidadMinima: number = 10) => {
    if (cantidadActual === 0) return { variant: 'destructive' as const, label: 'Agotado' };
    if (cantidadActual <= cantidadMinima / 2) return { variant: 'destructive' as const, label: 'Crítico' };
    if (cantidadActual <= cantidadMinima) return { variant: 'default' as const, label: 'Bajo' };
    return { variant: 'default' as const, label: 'Normal' };
  };

  const isCaducidadProxima = (fecha: string | null) => {
    if (!fecha) return false;
    const diff = new Date(fecha).getTime() - new Date().getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    return days <= 60 && days >= 0;
  };

  const handleCreateInsumo = async (data: any) => {
    try {
      if (!user || !selectedHospital || !almacenId) return;

      // Check/create catalog entry
      let catalogoId;
      const { data: insumosCatalogo } = await supabase
        .from('insumos_catalogo')
        .select('id')
        .eq('nombre', data.nombre)
        .maybeSingle();

      if (!insumosCatalogo) {
        const { data: nuevoCatalogo, error: createError } = await supabase
          .from('insumos_catalogo')
          .insert({
            nombre: data.nombre,
            clave: data.clave,
            descripcion: data.descripcion,
            categoria: 'Material médico',
            unidad: 'pieza',
            activo: true
          })
          .select()
          .single();

        if (createError) throw createError;
        catalogoId = nuevoCatalogo.id;
      } else {
        catalogoId = insumosCatalogo.id;
      }

      // Check if consolidated record exists
      const { data: existente } = await supabase
        .from('inventario_consolidado')
        .select('id, cantidad_total')
        .eq('hospital_id', selectedHospital.id)
        .eq('almacen_id', almacenId)
        .eq('insumo_catalogo_id', catalogoId)
        .maybeSingle();

      let consolidadoId: string;

      if (existente) {
        await supabase
          .from('inventario_consolidado')
          .update({ 
            cantidad_total: existente.cantidad_total + (data.cantidad || 0),
            updated_at: new Date().toISOString()
          })
          .eq('id', existente.id);
        consolidadoId = existente.id;
      } else {
        const { data: nuevoConsolidado, error: consError } = await supabase
          .from('inventario_consolidado')
          .insert({
            hospital_id: selectedHospital.id,
            almacen_id: almacenId,
            insumo_catalogo_id: catalogoId,
            cantidad_total: data.cantidad || 0,
            cantidad_minima: 10
          })
          .select()
          .single();

        if (consError) throw consError;
        consolidadoId = nuevoConsolidado.id;
      }

      // Create lot record
      const { error: loteError } = await supabase
        .from('inventario_lotes')
        .insert({
          consolidado_id: consolidadoId,
          lote: data.lote,
          fecha_caducidad: data.fecha_caducidad,
          fecha_entrada: new Date().toISOString(),
          cantidad: data.cantidad || 0,
          ubicacion: 'Almacén general'
        });

      if (loteError) throw loteError;

      toast.success('Insumo registrado exitosamente');
      setShowForm(false);
      refetch();
    } catch (error: any) {
      toast.error('Error al registrar insumo', {
        description: error.message,
      });
    }
  };

  const handleCardClick = useCallback((item: GroupedInsumo) => {
    const itemLotes = lotesPorConsolidado.get(item.consolidado_id) || [];
    const firstLote = itemLotes[0];
    
    setSelectedInsumo({
      id: firstLote?.id || item.consolidado_id,
      lote: firstLote?.lote || 'N/A',
      cantidad_actual: item.stockTotal,
      fecha_caducidad: firstLote?.fecha_caducidad,
      ubicacion: firstLote?.ubicacion || 'Almacén general',
      insumos_catalogo: {
        nombre: item.nombre,
        clave: item.clave,
        tipo: item.tipo
      }
    });
    setShowDetail(true);
  }, [lotesPorConsolidado]);

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-6">
      {!selectedHospital && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Debes seleccionar un hospital para ver y gestionar el inventario de insumos.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventario de Insumos</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona el inventario de insumos médicos del hospital
          </p>
        </div>
        <Button onClick={() => setShowForm(true)} disabled={!selectedHospital}>
          <Plus className="mr-2 h-4 w-4" />
          Registrar Insumo
        </Button>
      </div>

      {selectedHospital && (
        <>
          {/* Resumen estadístico */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Productos en Inventario
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats?.total || 0}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Mostrando {startItem}-{endItem} de {totalCount}
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Stock Bajo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-bold text-orange-500">{stats?.stockBajo || 0}</div>
                  {(stats?.stockBajo || 0) > 0 && <AlertTriangle className="h-5 w-5 text-orange-500" />}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Requieren reabastecimiento
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Próximos a Vencer
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-bold text-red-500">{stats?.proximosVencer || 0}</div>
                  {(stats?.proximosVencer || 0) > 0 && <Calendar className="h-5 w-5 text-red-500" />}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Menos de 60 días
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Barra de búsqueda y controles */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, clave o lote..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <ToggleGroup type="single" value={viewMode} onValueChange={(v) => v && setViewMode(v as any)}>
                <ToggleGroupItem value="cards" aria-label="Vista tarjetas">
                  <LayoutGrid className="h-4 w-4" />
                </ToggleGroupItem>
                <ToggleGroupItem value="table" aria-label="Vista tabla">
                  <Table2 className="h-4 w-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            {/* Filtros rápidos */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Filtro por procedimiento */}
              <div className="flex items-center gap-1">
                <Select
                  value={filterProcedimiento}
                  onValueChange={setFilterProcedimiento}
                >
                  <SelectTrigger className="w-[280px] h-9">
                    <SelectValue placeholder="Filtrar por procedimiento..." />
                  </SelectTrigger>
                  <SelectContent>
                    {procedimientos.map((proc) => (
                      <SelectItem key={proc.id} value={proc.procedimiento_clave}>
                        {proc.procedimiento_clave} - {proc.procedimiento_nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filterProcedimiento && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    onClick={() => setFilterProcedimiento('')}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="h-6 w-px bg-border" />

              <Button
                variant={filterStockBajo ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterStockBajo(!filterStockBajo)}
              >
                Stock Bajo
              </Button>
              <Button
                variant={filterProximosCaducar ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterProximosCaducar(!filterProximosCaducar)}
              >
                Próximos a Caducar
              </Button>
              <Button
                variant={filterTipo === 'insumo' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterTipo(filterTipo === 'insumo' ? 'todos' : 'insumo')}
              >
                Solo Insumos
              </Button>
              <Button
                variant={filterTipo === 'medicamento' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterTipo(filterTipo === 'medicamento' ? 'todos' : 'medicamento')}
              >
                Solo Medicamentos
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              Cargando inventario...
            </div>
          ) : groupedInsumos.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                No se encontraron insumos que coincidan con los filtros
              </CardContent>
            </Card>
          ) : viewMode === 'cards' ? (
            // Vista de tarjetas agrupadas
            <>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {groupedInsumos.map((item) => {
                  const itemLotes = lotesPorConsolidado.get(item.consolidado_id) || [];
                  return (
                    <InsumoGroupedCard
                      key={item.consolidado_id}
                      nombre={item.nombre}
                      clave={item.clave}
                      tipo={item.tipo}
                      stockTotal={item.stockTotal}
                      lotes={itemLotes.map(l => ({
                        id: l.id,
                        lote: l.lote || 'N/A',
                        cantidad_actual: l.cantidad,
                        fecha_caducidad: l.fecha_caducidad,
                        ubicacion: l.ubicacion
                      }))}
                      onSelectLote={(lote) => {
                        setSelectedInsumo({
                          id: lote.id,
                          lote: lote.lote,
                          cantidad_actual: lote.cantidad_actual,
                          fecha_caducidad: lote.fecha_caducidad,
                          ubicacion: lote.ubicacion,
                          insumos_catalogo: {
                            nombre: item.nombre,
                            clave: item.clave,
                            tipo: item.tipo
                          }
                        });
                        setShowDetail(true);
                      }}
                    />
                  );
                })}
              </div>
              
              {/* Paginación */}
              <PaginationControls
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={pageSize}
                hasPreviousPage={hasPreviousPage}
                hasNextPage={hasNextPage}
                isLoading={isLoading}
                onPageChange={goToPage}
                onPageSizeChange={changePageSize}
                pageSizeOptions={pageSizeOptions}
              />
            </>
          ) : (
            // Vista de tabla
            <>
              <Card>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Clave</TableHead>
                          <TableHead>Tipo</TableHead>
                          <TableHead>Lote</TableHead>
                          <TableHead>Caducidad</TableHead>
                          <TableHead className="text-right">Cantidad</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Ubicación</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredLotes.map((item) => {
                          const status = getStockStatus(item.cantidad);
                          const proximoVencer = isCaducidadProxima(item.fecha_caducidad);
                          
                          return (
                            <TableRow
                              key={item.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                setSelectedInsumo({
                                  id: item.id,
                                  lote: item.lote,
                                  cantidad_actual: item.cantidad,
                                  fecha_caducidad: item.fecha_caducidad,
                                  ubicacion: item.ubicacion,
                                  insumos_catalogo: item.insumos_catalogo
                                });
                                setShowDetail(true);
                              }}
                            >
                              <TableCell className="font-medium">
                                {item.insumos_catalogo?.nombre}
                              </TableCell>
                              <TableCell className="text-sm">
                                {item.insumos_catalogo?.clave || '-'}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {item.insumos_catalogo?.tipo}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">{item.lote || 'N/A'}</TableCell>
                              <TableCell className="text-sm">
                                {item.fecha_caducidad ? (
                                  <span className={proximoVencer ? 'text-red-500 font-medium' : ''}>
                                    {format(new Date(item.fecha_caducidad), 'dd/MM/yyyy')}
                                  </span>
                                ) : 'N/A'}
                              </TableCell>
                              <TableCell className="text-right font-semibold">
                                {item.cantidad}
                              </TableCell>
                              <TableCell>
                                <Badge variant={status.variant} className="text-xs">
                                  {status.label}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {item.ubicacion}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Paginación */}
              <PaginationControls
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={pageSize}
                hasPreviousPage={hasPreviousPage}
                hasNextPage={hasNextPage}
                isLoading={isLoading}
                onPageChange={goToPage}
                onPageSizeChange={changePageSize}
                pageSizeOptions={pageSizeOptions}
              />
            </>
          )}
        </>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <InsumoForm
            onClose={() => setShowForm(false)}
            onSubmit={handleCreateInsumo}
          />
        </DialogContent>
      </Dialog>

      {selectedInsumo && (
        <InsumoDetailDialog
          insumo={selectedInsumo}
          open={showDetail}
          onOpenChange={(open) => {
            setShowDetail(open);
            if (!open) setSelectedInsumo(null);
          }}
        />
      )}
    </div>
  );
};

export default Insumos;
