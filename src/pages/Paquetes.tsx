import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Package, ArrowLeft, Save, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PROCEDIMIENTOS_CATALOG } from '@/constants/procedimientosCatalog';

interface AnestesiaInsumo {
  id: string;
  nota: string | null;
  cantidad_minima: number | null;
  cantidad_maxima: number | null;
  grupo_exclusivo: string | null;
  condicionante: string | null;
  orden: number | null;
}

const Paquetes = () => {
  const { user } = useAuth();
  const [selectedTipo, setSelectedTipo] = useState<string | null>(null);
  const [selectedTipoLabel, setSelectedTipoLabel] = useState<string>('');
  const [tiposAnestesia, setTiposAnestesia] = useState<{ tipo: string; label: string; clave: string }[]>([]);
  const [insumosDelTipo, setInsumosDelTipo] = useState<AnestesiaInsumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<{
    cantidad_minima: number;
    cantidad_maxima: number;
    condicionante: string;
  }>({ cantidad_minima: 0, cantidad_maxima: 0, condicionante: '' });

  useEffect(() => {
    if (user) {
      fetchTiposAnestesia();
    }
  }, [user]);

  const fetchTiposAnestesia = async () => {
    try {
      setLoading(true);
      // Obtener los tipos de anestesia únicos de la DB
      const { data, error } = await supabase
        .from('anestesia_insumos')
        .select('tipo_anestesia')
        .order('tipo_anestesia');

      if (error) throw error;

      // Obtener tipos únicos
      const tiposUnicos = [...new Set((data || []).map((d: any) => d.tipo_anestesia))];
      
      // Mapear a los nombres del catálogo estandarizado
      const tiposMapeados = tiposUnicos.map(tipo => {
        // Buscar en el catálogo por tipoAnestesiaKey
        const catalogItem = PROCEDIMIENTOS_CATALOG.find(p => p.tipoAnestesiaKey === tipo);
        if (catalogItem) {
          return {
            tipo,
            clave: catalogItem.clave,
            label: `${catalogItem.clave} - ${catalogItem.nombre}`
          };
        }
        return {
          tipo,
          clave: tipo,
          label: tipo
        };
      });

      // Ordenar por clave
      tiposMapeados.sort((a, b) => a.clave.localeCompare(b.clave));
      setTiposAnestesia(tiposMapeados);
      
    } catch (error: any) {
      toast.error('Error al cargar tipos de anestesia', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchInsumosDelTipo = async (tipo: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('anestesia_insumos')
        .select('id, nota, cantidad_minima, cantidad_maxima, grupo_exclusivo, condicionante, orden')
        .eq('tipo_anestesia', tipo)
        .eq('activo', true)
        .order('orden', { ascending: true, nullsFirst: false });

      if (error) throw error;

      console.log(`✅ Cargados ${data?.length || 0} insumos para ${tipo}`);
      setInsumosDelTipo(data || []);
    } catch (error: any) {
      toast.error('Error al cargar insumos', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectTipo = (tipo: string, label: string) => {
    setSelectedTipo(tipo);
    setSelectedTipoLabel(label);
    fetchInsumosDelTipo(tipo);
  };

  const handleStartEdit = (insumo: AnestesiaInsumo) => {
    setEditingId(insumo.id);
    setEditValues({
      cantidad_minima: insumo.cantidad_minima || 0,
      cantidad_maxima: insumo.cantidad_maxima || 0,
      condicionante: insumo.condicionante || ''
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValues({ cantidad_minima: 0, cantidad_maxima: 0, condicionante: '' });
  };

  const handleSaveEdit = async (id: string) => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('anestesia_insumos')
        .update({
          cantidad_minima: editValues.cantidad_minima,
          cantidad_maxima: editValues.cantidad_maxima,
          condicionante: editValues.condicionante || null
        })
        .eq('id', id);

      if (error) throw error;

      // Actualizar lista local
      setInsumosDelTipo(prev => prev.map(item => 
        item.id === id 
          ? { 
              ...item, 
              cantidad_minima: editValues.cantidad_minima,
              cantidad_maxima: editValues.cantidad_maxima,
              condicionante: editValues.condicionante || null
            }
          : item
      ));

      setEditingId(null);
      toast.success('Insumo actualizado correctamente');
    } catch (error: any) {
      toast.error('Error al guardar', { description: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Configuración de Procedimientos</h1>
          <p className="text-muted-foreground">Configura los insumos mínimos y máximos por tipo de anestesia</p>
        </div>
      </div>

      {loading && !selectedTipo ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Cargando procedimientos...</p>
          </CardContent>
        </Card>
      ) : selectedTipo ? (
        <div className="space-y-4">
          <Button variant="outline" onClick={() => { setSelectedTipo(null); setEditingId(null); }}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Procedimientos
          </Button>
          
          <Card>
            <CardHeader>
              <CardTitle>{selectedTipoLabel}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Configura los insumos y sus cantidades mínimas/máximas. Los cambios afectarán la creación de folios.
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center text-muted-foreground py-4">Cargando insumos...</p>
              ) : insumosDelTipo.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  No hay insumos configurados para este procedimiento
                </p>
              ) : (
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">#</TableHead>
                        <TableHead className="min-w-[300px]">Nombre del Insumo</TableHead>
                        <TableHead className="w-[100px] text-center">Mín</TableHead>
                        <TableHead className="w-[100px] text-center">Máx</TableHead>
                        <TableHead className="w-[150px]">Grupo Exclusivo</TableHead>
                        <TableHead className="min-w-[200px]">Condicionante</TableHead>
                        <TableHead className="w-[100px] text-center">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {insumosDelTipo.map((insumo, index) => (
                        <TableRow key={insumo.id}>
                          <TableCell className="font-medium">{index + 1}</TableCell>
                          <TableCell className="text-sm">{insumo.nota || 'Sin nombre'}</TableCell>
                          <TableCell className="text-center">
                            {editingId === insumo.id ? (
                              <Input
                                type="number"
                                min={0}
                                className="w-16 h-8 text-center"
                                value={editValues.cantidad_minima}
                                onChange={(e) => setEditValues(prev => ({ 
                                  ...prev, 
                                  cantidad_minima: parseInt(e.target.value) || 0 
                                }))}
                              />
                            ) : (
                              <Badge variant="outline">{insumo.cantidad_minima ?? 0}</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {editingId === insumo.id ? (
                              <Input
                                type="number"
                                min={0}
                                className="w-16 h-8 text-center"
                                value={editValues.cantidad_maxima}
                                onChange={(e) => setEditValues(prev => ({ 
                                  ...prev, 
                                  cantidad_maxima: parseInt(e.target.value) || 0 
                                }))}
                              />
                            ) : (
                              <Badge variant="secondary">{insumo.cantidad_maxima ?? 0}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {insumo.grupo_exclusivo && (
                              <Badge variant="destructive" className="text-xs truncate max-w-[140px]">
                                {insumo.grupo_exclusivo}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingId === insumo.id ? (
                              <Input
                                type="text"
                                className="h-8 text-sm"
                                placeholder="Condición de uso..."
                                value={editValues.condicionante}
                                onChange={(e) => setEditValues(prev => ({ 
                                  ...prev, 
                                  condicionante: e.target.value 
                                }))}
                              />
                            ) : insumo.condicionante ? (
                              <span className="text-xs text-muted-foreground">{insumo.condicionante}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground/50">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {editingId === insumo.id ? (
                              <div className="flex gap-1 justify-center">
                                <Button 
                                  size="sm" 
                                  variant="default"
                                  onClick={() => handleSaveEdit(insumo.id)}
                                  disabled={saving}
                                >
                                  <Save className="h-3 w-3" />
                                </Button>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={handleCancelEdit}
                                  disabled={saving}
                                >
                                  ✕
                                </Button>
                              </div>
                            ) : (
                              <Button 
                                size="sm" 
                                variant="ghost"
                                onClick={() => handleStartEdit(insumo)}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tiposAnestesia.map((tipo) => (
            <Card 
              key={tipo.tipo} 
              className="border-l-4 border-l-primary cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => handleSelectTipo(tipo.tipo, tipo.label)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base leading-tight">{tipo.label}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        Haz clic para configurar
                      </p>
                    </div>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Paquetes;
