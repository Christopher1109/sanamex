import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Search, Plus, Save, Trash2, Package, FileText, Settings2, 
  RefreshCw, ChevronRight, AlertCircle, Check, X, ArrowLeft
} from 'lucide-react';
import { PROCEDIMIENTOS_CATALOG, ProcedimientoCatalogo } from '@/constants/procedimientosCatalog';
import { useCachedInsumosCatalogo } from '@/hooks/useCachedCatalogs';
import { Link } from 'react-router-dom';

interface InsumoCatalogo {
  id: string;
  nombre: string;
  clave: string | null;
  categoria: string | null;
  tipo: string | null;
}

interface ProcedimientoInsumoConfig {
  id: string;
  procedimiento_clave: string;
  procedimiento_nombre: string;
  insumo_catalogo_id: string;
  cantidad_minima: number;
  cantidad_maxima: number | null;
  cantidad_sugerida: number;
  activo: boolean;
  notas: string | null;
  insumo?: InsumoCatalogo;
}

const ConfiguracionProcedimientoInsumos = () => {
  const { data: insumosCatalogo = [], isLoading: loadingInsumos } = useCachedInsumosCatalogo();
  const [configuraciones, setConfiguraciones] = useState<ProcedimientoInsumoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Selected procedure for configuration
  const [selectedProcedimiento, setSelectedProcedimiento] = useState<ProcedimientoCatalogo | null>(null);
  
  // Dialog for adding insumos
  const [dialogAddOpen, setDialogAddOpen] = useState(false);
  const [searchInsumo, setSearchInsumo] = useState('');
  const [selectedInsumos, setSelectedInsumos] = useState<Set<string>>(new Set());
  
  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    cantidad_minima: number;
    cantidad_maxima: number | null;
    cantidad_sugerida: number;
  } | null>(null);

  useEffect(() => {
    fetchConfiguraciones();
  }, []);

  const fetchConfiguraciones = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('procedimiento_insumos_catalogo')
        .select(`
          *,
          insumo:insumos_catalogo(id, nombre, clave, categoria, tipo)
        `)
        .eq('activo', true)
        .order('procedimiento_clave')
        .order('created_at');

      if (error) throw error;
      setConfiguraciones(data || []);
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar configuraciones');
    } finally {
      setLoading(false);
    }
  };

  // Group configurations by procedure
  const configByProcedimiento = useMemo(() => {
    const map = new Map<string, ProcedimientoInsumoConfig[]>();
    configuraciones.forEach(config => {
      const list = map.get(config.procedimiento_clave) || [];
      list.push(config);
      map.set(config.procedimiento_clave, list);
    });
    return map;
  }, [configuraciones]);

  // Filter insumos for search
  const filteredInsumos = useMemo(() => {
    if (!searchInsumo.trim()) return insumosCatalogo.slice(0, 50);
    
    const term = searchInsumo.toLowerCase();
    return insumosCatalogo
      .filter(i => 
        i.nombre?.toLowerCase().includes(term) || 
        i.clave?.toLowerCase().includes(term)
      )
      .slice(0, 50);
  }, [insumosCatalogo, searchInsumo]);

  // Already configured insumos for selected procedure
  const configuredInsumoIds = useMemo(() => {
    if (!selectedProcedimiento) return new Set<string>();
    const configs = configByProcedimiento.get(selectedProcedimiento.clave) || [];
    return new Set(configs.map(c => c.insumo_catalogo_id));
  }, [selectedProcedimiento, configByProcedimiento]);

  const handleSelectProcedimiento = (proc: ProcedimientoCatalogo) => {
    setSelectedProcedimiento(proc);
    setSearchInsumo('');
    setSelectedInsumos(new Set());
  };

  const handleToggleInsumo = (insumoId: string) => {
    const newSet = new Set(selectedInsumos);
    if (newSet.has(insumoId)) {
      newSet.delete(insumoId);
    } else {
      newSet.add(insumoId);
    }
    setSelectedInsumos(newSet);
  };

  const handleAddInsumos = async () => {
    if (!selectedProcedimiento || selectedInsumos.size === 0) return;
    
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const inserts = Array.from(selectedInsumos).map(insumoId => ({
        procedimiento_clave: selectedProcedimiento.clave,
        procedimiento_nombre: selectedProcedimiento.nombre,
        insumo_catalogo_id: insumoId,
        cantidad_minima: 1,
        cantidad_maxima: null,
        cantidad_sugerida: 1,
        created_by: user?.id
      }));

      const { error } = await supabase
        .from('procedimiento_insumos_catalogo')
        .insert(inserts);

      if (error) throw error;

      toast.success(`${selectedInsumos.size} insumo(s) agregados al procedimiento`);
      setDialogAddOpen(false);
      setSelectedInsumos(new Set());
      setSearchInsumo('');
      fetchConfiguraciones();
    } catch (error: any) {
      console.error('Error:', error);
      if (error.code === '23505') {
        toast.error('Algunos insumos ya están configurados para este procedimiento');
      } else {
        toast.error('Error al agregar insumos');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStartEdit = (config: ProcedimientoInsumoConfig) => {
    setEditingId(config.id);
    setEditValues({
      cantidad_minima: config.cantidad_minima,
      cantidad_maxima: config.cantidad_maxima,
      cantidad_sugerida: config.cantidad_sugerida
    });
  };

  const handleSaveEdit = async (configId: string) => {
    if (!editValues) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('procedimiento_insumos_catalogo')
        .update({
          cantidad_minima: editValues.cantidad_minima,
          cantidad_maxima: editValues.cantidad_maxima,
          cantidad_sugerida: editValues.cantidad_sugerida,
          updated_at: new Date().toISOString()
        })
        .eq('id', configId);

      if (error) throw error;

      toast.success('Cantidades actualizadas');
      setEditingId(null);
      setEditValues(null);
      fetchConfiguraciones();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValues(null);
  };

  const handleRemoveInsumo = async (configId: string) => {
    if (!confirm('¿Estás seguro de eliminar este insumo del procedimiento?')) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('procedimiento_insumos_catalogo')
        .delete()
        .eq('id', configId);

      if (error) throw error;

      toast.success('Insumo eliminado del procedimiento');
      fetchConfiguraciones();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al eliminar');
    } finally {
      setSaving(false);
    }
  };

  const procedimientoInsumos = selectedProcedimiento 
    ? configByProcedimiento.get(selectedProcedimiento.clave) || []
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/gerente-operaciones">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Catálogo de Insumos por Procedimiento</h1>
            <p className="text-muted-foreground">Configura qué insumos aplican a cada procedimiento quirúrgico</p>
          </div>
        </div>
        <Button onClick={fetchConfiguraciones} variant="outline" size="sm" disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista de Procedimientos */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Procedimientos
            </CardTitle>
            <CardDescription>Selecciona un procedimiento para configurar sus insumos</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[calc(100vh-300px)]">
              <div className="space-y-1 p-4 pt-0">
                {PROCEDIMIENTOS_CATALOG.map((proc) => {
                  const configCount = configByProcedimiento.get(proc.clave)?.length || 0;
                  const isSelected = selectedProcedimiento?.clave === proc.clave;
                  
                  return (
                    <button
                      key={proc.clave}
                      onClick={() => handleSelectProcedimiento(proc)}
                      className={`w-full text-left p-3 rounded-lg border transition-all ${
                        isSelected 
                          ? 'border-primary bg-primary/5 shadow-sm' 
                          : 'border-transparent hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className={`font-medium text-sm truncate ${isSelected ? 'text-primary' : ''}`}>
                            {proc.clave}
                          </p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            {proc.nombre}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <Badge variant={configCount > 0 ? 'default' : 'outline'} className="text-xs">
                            {configCount}
                          </Badge>
                          <ChevronRight className={`h-4 w-4 text-muted-foreground ${isSelected ? 'text-primary' : ''}`} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Configuración de Insumos */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  {selectedProcedimiento ? (
                    <span>Insumos de {selectedProcedimiento.clave}</span>
                  ) : (
                    <span>Insumos del Procedimiento</span>
                  )}
                </CardTitle>
                {selectedProcedimiento && (
                  <CardDescription className="mt-1">{selectedProcedimiento.nombre}</CardDescription>
                )}
              </div>
              {selectedProcedimiento && (
                <Button onClick={() => setDialogAddOpen(true)} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar Insumos
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedProcedimiento ? (
              <div className="text-center py-12 text-muted-foreground">
                <Settings2 className="mx-auto h-12 w-12 mb-3 opacity-50" />
                <p>Selecciona un procedimiento de la lista para ver y configurar sus insumos</p>
              </div>
            ) : loading ? (
              <div className="text-center py-8 text-muted-foreground">Cargando...</div>
            ) : procedimientoInsumos.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <AlertCircle className="mx-auto h-12 w-12 mb-3 opacity-50" />
                <p className="mb-4">No hay insumos configurados para este procedimiento</p>
                <Button onClick={() => setDialogAddOpen(true)} variant="outline">
                  <Plus className="h-4 w-4 mr-1" />
                  Agregar Primer Insumo
                </Button>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-350px)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Insumo</TableHead>
                      <TableHead className="text-center w-24">Mínimo</TableHead>
                      <TableHead className="text-center w-24">Sugerido</TableHead>
                      <TableHead className="text-center w-24">Máximo</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {procedimientoInsumos.map((config) => (
                      <TableRow key={config.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{config.insumo?.nombre || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">
                              {config.insumo?.clave || ''}
                              {config.insumo?.categoria && ` • ${config.insumo.categoria}`}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {editingId === config.id ? (
                            <Input
                              type="number"
                              min={0}
                              value={editValues?.cantidad_minima || 0}
                              onChange={(e) => setEditValues(prev => prev ? { ...prev, cantidad_minima: parseInt(e.target.value) || 0 } : null)}
                              className="w-16 h-8 text-center mx-auto"
                            />
                          ) : (
                            <span>{config.cantidad_minima}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {editingId === config.id ? (
                            <Input
                              type="number"
                              min={0}
                              value={editValues?.cantidad_sugerida || 0}
                              onChange={(e) => setEditValues(prev => prev ? { ...prev, cantidad_sugerida: parseInt(e.target.value) || 0 } : null)}
                              className="w-16 h-8 text-center mx-auto"
                            />
                          ) : (
                            <span className="font-medium">{config.cantidad_sugerida}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {editingId === config.id ? (
                            <Input
                              type="number"
                              min={0}
                              value={editValues?.cantidad_maxima || ''}
                              onChange={(e) => setEditValues(prev => prev ? { ...prev, cantidad_maxima: e.target.value ? parseInt(e.target.value) : null } : null)}
                              className="w-16 h-8 text-center mx-auto"
                              placeholder="∞"
                            />
                          ) : (
                            <span>{config.cantidad_maxima || '∞'}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            {editingId === config.id ? (
                              <>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleSaveEdit(config.id)}
                                  disabled={saving}
                                >
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={handleCancelEdit}
                                >
                                  <X className="h-4 w-4 text-muted-foreground" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleStartEdit(config)}
                                >
                                  <Settings2 className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleRemoveInsumo(config.id)}
                                  className="text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog para agregar insumos */}
      <Dialog open={dialogAddOpen} onOpenChange={setDialogAddOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Agregar Insumos al Procedimiento</DialogTitle>
            <DialogDescription>
              {selectedProcedimiento?.clave} - {selectedProcedimiento?.nombre}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre o clave BCB..."
                value={searchInsumo}
                onChange={(e) => setSearchInsumo(e.target.value)}
                className="pl-10"
              />
            </div>

            {selectedInsumos.size > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <Badge variant="secondary">{selectedInsumos.size} seleccionados</Badge>
                <Button variant="ghost" size="sm" onClick={() => setSelectedInsumos(new Set())}>
                  Limpiar selección
                </Button>
              </div>
            )}

            <ScrollArea className="h-[350px] border rounded-lg">
              <div className="p-2 space-y-1">
                {loadingInsumos ? (
                  <div className="text-center py-8 text-muted-foreground">Cargando catálogo...</div>
                ) : filteredInsumos.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No se encontraron insumos</div>
                ) : (
                  filteredInsumos.map((insumo) => {
                    const isConfigured = configuredInsumoIds.has(insumo.id);
                    const isSelected = selectedInsumos.has(insumo.id);
                    
                    return (
                      <div
                        key={insumo.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                          isConfigured 
                            ? 'bg-muted/50 opacity-60 cursor-not-allowed' 
                            : isSelected 
                              ? 'border-primary bg-primary/5' 
                              : 'hover:bg-muted/50 cursor-pointer'
                        }`}
                        onClick={() => !isConfigured && handleToggleInsumo(insumo.id)}
                      >
                        <Checkbox 
                          checked={isSelected} 
                          disabled={isConfigured}
                          onCheckedChange={() => !isConfigured && handleToggleInsumo(insumo.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{insumo.nombre}</p>
                          <p className="text-xs text-muted-foreground">
                            {insumo.clave || 'Sin clave'}
                            {insumo.categoria && ` • ${insumo.categoria}`}
                          </p>
                        </div>
                        {isConfigured && (
                          <Badge variant="outline" className="text-xs">Ya configurado</Badge>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogAddOpen(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={handleAddInsumos} 
              disabled={selectedInsumos.size === 0 || saving}
            >
              {saving ? 'Guardando...' : `Agregar ${selectedInsumos.size} Insumo(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ConfiguracionProcedimientoInsumos;
