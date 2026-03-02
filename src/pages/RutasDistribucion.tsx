import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RefreshCw, Plus, Truck, Building2, Save, Trash2, Edit } from 'lucide-react';

interface Ruta {
  id: string;
  nombre_ruta: string;
  tipo: string;
  descripcion: string | null;
  activo: boolean;
  hospitales?: Hospital[];
}

interface Hospital {
  id: string;
  nombre: string;
  display_name: string;
}

interface RutaHospital {
  id: string;
  ruta_id: string;
  hospital_id: string;
}

const RutasDistribucion = () => {
  const [rutas, setRutas] = useState<Ruta[]>([]);
  const [hospitales, setHospitales] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRuta, setEditingRuta] = useState<Ruta | null>(null);
  const [formData, setFormData] = useState({ nombre_ruta: '', tipo: 'zona', descripcion: '' });
  const [selectedHospitales, setSelectedHospitales] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch rutas with hospitals
      const { data: rutasData } = await supabase
        .from('rutas_distribucion')
        .select('*')
        .order('nombre_ruta');

      // Fetch hospital assignments for each ruta
      const rutasConHospitales = await Promise.all((rutasData || []).map(async (ruta) => {
        const { data: asignaciones } = await supabase
          .from('rutas_hospitales')
          .select('hospital_id')
          .eq('ruta_id', ruta.id);

        const hospitalIds = asignaciones?.map(a => a.hospital_id) || [];
        
        const { data: hospitalesRuta } = await supabase
          .from('hospitales')
          .select('id, nombre, display_name')
          .in('id', hospitalIds.length > 0 ? hospitalIds : ['none']);

        return { ...ruta, hospitales: hospitalesRuta || [] };
      }));

      setRutas(rutasConHospitales);

      // Fetch all hospitals
      const { data: hospitalesData } = await supabase
        .from('hospitales')
        .select('id, nombre, display_name')
        .order('display_name');

      setHospitales(hospitalesData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const openNewRutaDialog = () => {
    setEditingRuta(null);
    setFormData({ nombre_ruta: '', tipo: 'zona', descripcion: '' });
    setSelectedHospitales(new Set());
    setDialogOpen(true);
  };

  const openEditRutaDialog = async (ruta: Ruta) => {
    setEditingRuta(ruta);
    setFormData({ 
      nombre_ruta: ruta.nombre_ruta, 
      tipo: ruta.tipo, 
      descripcion: ruta.descripcion || '' 
    });
    
    // Fetch assigned hospitals
    const { data: asignaciones } = await supabase
      .from('rutas_hospitales')
      .select('hospital_id')
      .eq('ruta_id', ruta.id);

    setSelectedHospitales(new Set(asignaciones?.map(a => a.hospital_id) || []));
    setDialogOpen(true);
  };

  const toggleHospital = (hospitalId: string) => {
    const newSelected = new Set(selectedHospitales);
    if (newSelected.has(hospitalId)) {
      newSelected.delete(hospitalId);
    } else {
      newSelected.add(hospitalId);
    }
    setSelectedHospitales(newSelected);
  };

  const saveRuta = async () => {
    if (!formData.nombre_ruta.trim()) {
      toast.error('El nombre de la ruta es requerido');
      return;
    }

    setSaving(true);
    try {
      let rutaId: string;

      if (editingRuta) {
        // Update existing
        await supabase
          .from('rutas_distribucion')
          .update({
            nombre_ruta: formData.nombre_ruta,
            tipo: formData.tipo,
            descripcion: formData.descripcion || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingRuta.id);
        
        rutaId = editingRuta.id;

        // Delete existing hospital assignments
        await supabase
          .from('rutas_hospitales')
          .delete()
          .eq('ruta_id', rutaId);
      } else {
        // Create new
        const { data, error } = await supabase
          .from('rutas_distribucion')
          .insert({
            nombre_ruta: formData.nombre_ruta,
            tipo: formData.tipo,
            descripcion: formData.descripcion || null
          })
          .select()
          .single();

        if (error) throw error;
        rutaId = data.id;
      }

      // Insert hospital assignments
      if (selectedHospitales.size > 0) {
        const inserts = Array.from(selectedHospitales).map(hospitalId => ({
          ruta_id: rutaId,
          hospital_id: hospitalId
        }));

        await supabase.from('rutas_hospitales').insert(inserts);
      }

      toast.success(editingRuta ? 'Ruta actualizada' : 'Ruta creada');
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error saving ruta:', error);
      toast.error('Error al guardar ruta');
    } finally {
      setSaving(false);
    }
  };

  const deleteRuta = async (rutaId: string) => {
    if (!confirm('¿Eliminar esta ruta?')) return;

    try {
      await supabase.from('rutas_hospitales').delete().eq('ruta_id', rutaId);
      await supabase.from('rutas_distribucion').delete().eq('id', rutaId);
      toast.success('Ruta eliminada');
      fetchData();
    } catch (error) {
      console.error('Error deleting ruta:', error);
      toast.error('Error al eliminar ruta');
    }
  };

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'zona': return 'bg-blue-100 text-blue-800';
      case 'estado': return 'bg-green-100 text-green-800';
      case 'region': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Rutas de Distribución</h1>
          <p className="text-muted-foreground">Administra las rutas para distribución de insumos a hospitales</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchData} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" />
            Actualizar
          </Button>
          <Button onClick={openNewRutaDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Nueva Ruta
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Rutas Configuradas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : rutas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay rutas configuradas. Crea una nueva ruta para comenzar.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead>Hospitales</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rutas.map(ruta => (
                  <TableRow key={ruta.id}>
                    <TableCell className="font-medium">{ruta.nombre_ruta}</TableCell>
                    <TableCell>
                      <Badge className={getTipoColor(ruta.tipo)}>
                        {ruta.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {ruta.descripcion || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {ruta.hospitales?.slice(0, 3).map(h => (
                          <Badge key={h.id} variant="outline" className="text-xs">
                            {(h.display_name || h.nombre).substring(0, 15)}...
                          </Badge>
                        ))}
                        {(ruta.hospitales?.length || 0) > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{(ruta.hospitales?.length || 0) - 3} más
                          </Badge>
                        )}
                        {(!ruta.hospitales || ruta.hospitales.length === 0) && (
                          <span className="text-muted-foreground text-sm">Sin hospitales</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditRutaDialog(ruta)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteRuta(ruta.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog: Create/Edit Ruta */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              {editingRuta ? 'Editar Ruta' : 'Nueva Ruta de Distribución'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nombre de la Ruta</Label>
                <Input
                  value={formData.nombre_ruta}
                  onChange={(e) => setFormData({ ...formData, nombre_ruta: e.target.value })}
                  placeholder="Ej: Zona Norte CDMX"
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zona">Zona</SelectItem>
                    <SelectItem value="estado">Estado</SelectItem>
                    <SelectItem value="region">Región</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Input
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                placeholder="Descripción de la ruta"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Hospitales en esta Ruta
                <Badge variant="secondary" className="ml-2">{selectedHospitales.size} seleccionados</Badge>
              </Label>
              <ScrollArea className="h-[300px] border rounded-lg p-3">
                <div className="space-y-2">
                  {hospitales.map(h => (
                    <div 
                      key={h.id} 
                      className={`flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer ${
                        selectedHospitales.has(h.id) ? 'bg-primary/5' : ''
                      }`}
                      onClick={() => toggleHospital(h.id)}
                    >
                      <Checkbox
                        checked={selectedHospitales.has(h.id)}
                        onCheckedChange={() => toggleHospital(h.id)}
                      />
                      <span className="flex-1">{h.display_name || h.nombre}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveRuta} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RutasDistribucion;
