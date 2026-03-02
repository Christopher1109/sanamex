import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useHospital } from '@/contexts/HospitalContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Search, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import MedicoForm from '@/components/forms/MedicoForm';
import { toast } from 'sonner';

const Medicos = () => {
  const { user } = useAuth();
  const { selectedHospital } = useHospital();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingMedico, setEditingMedico] = useState<any>(null);
  const [medicos, setMedicos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && selectedHospital) {
      fetchMedicos();
    }
  }, [user, selectedHospital]);

  const fetchMedicos = async () => {
    try {
      if (!selectedHospital) return;
      
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from('medicos')
        .select('*')
        .eq('activo', true)
        .eq('hospital_budget_code', selectedHospital.budget_code)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMedicos(data || []);
    } catch (error: any) {
      toast.error('Error al cargar médicos', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrUpdate = async (data: any) => {
    try {
      if (editingMedico) {
        const { error } = await supabase
          .from('medicos')
          .update({
            nombre: data.nombre,
            especialidad: data.especialidad,
            subespecialidad: data.subespecialidad,
            unidad: data.unidad,
            telefono: data.telefono,
          })
          .eq('id', editingMedico.id);

        if (error) throw error;
        toast.success('Médico actualizado exitosamente');
      } else {
        const { error } = await (supabase as any)
          .from('medicos')
          .insert({
            nombre: data.nombre,
            especialidad: data.especialidad,
            subespecialidad: data.subespecialidad,
            unidad: data.unidad,
            telefono: data.telefono,
            state_name: selectedHospital?.state_name,
            hospital_budget_code: selectedHospital?.budget_code,
            hospital_display_name: selectedHospital?.display_name,
          });

        if (error) throw error;
        toast.success('Médico creado exitosamente');
      }

      setShowForm(false);
      setEditingMedico(null);
      fetchMedicos();
    } catch (error: any) {
      toast.error('Error al guardar médico', {
        description: error.message,
      });
    }
  };

  const handleEdit = (medico: any) => {
    setEditingMedico(medico);
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Médicos</h1>
          <p className="text-muted-foreground">Gestión de anestesiólogos y cirujanos</p>
        </div>
        <Button className="gap-2" onClick={() => {
          setEditingMedico(null);
          setShowForm(true);
        }}>
          <Plus className="h-4 w-4" />
          Agregar Médico
        </Button>
      </div>

      <Tabs defaultValue="todos" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="anestesiologos">Anestesiólogos</TabsTrigger>
          <TabsTrigger value="cirujanos">Cirujanos</TabsTrigger>
        </TabsList>

        <TabsContent value="todos" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar médico..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-center text-muted-foreground">Cargando médicos...</p>
              ) : (
                <div className="space-y-4">
                  {medicos.filter(m => searchTerm === '' || 
                    m.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    m.especialidad.toLowerCase().includes(searchTerm.toLowerCase())
                  ).map((medico) => (
                  <Card key={medico.id} className="border-l-4 border-l-primary">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                            <User className="h-6 w-6 text-primary" />
                          </div>
                           <div className="space-y-2">
                             <div className="flex items-center gap-3">
                               <h3 className="font-semibold">{medico.nombre}</h3>
                               <Badge variant={medico.especialidad === 'anestesiologia' ? 'default' : 'secondary'}>
                                 {medico.especialidad === 'anestesiologia' ? 'Anestesiólogo' : 'Cirujano'}
                               </Badge>
                             </div>
                             <div className="grid gap-1 text-sm">
                               <p><span className="font-medium">Especialidad:</span> {medico.especialidad}</p>
                             </div>
                           </div>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEdit(medico)}
                        >
                          Editar
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

        <TabsContent value="anestesiologos">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {medicos.filter(m => m.especialidad === 'anestesiologia').map((medico) => (
                  <Card key={medico.id} className="border-l-4 border-l-primary">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                            <User className="h-6 w-6 text-primary" />
                          </div>
                          <div className="space-y-2">
                            <h3 className="font-semibold">{medico.nombre}</h3>
                            <div className="grid gap-1 text-sm">
                              <p><span className="font-medium">Especialidad:</span> {medico.especialidad}</p>
                            </div>
                          </div>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEdit(medico)}
                        >
                          Editar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {medicos.filter(m => m.especialidad === 'anestesiologia').length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    No hay anestesiólogos registrados
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cirujanos">
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {medicos.filter(m => ['cirugia_general', 'traumatologia', 'ginecologia', 'urologia', 'otra'].includes(m.especialidad)).map((medico) => (
                  <Card key={medico.id} className="border-l-4 border-l-secondary">
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between">
                        <div className="flex gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/10">
                            <User className="h-6 w-6 text-secondary" />
                          </div>
                          <div className="space-y-2">
                            <h3 className="font-semibold">{medico.nombre}</h3>
                            <div className="grid gap-1 text-sm">
                              <p><span className="font-medium">Especialidad:</span> {medico.especialidad}</p>
                            </div>
                          </div>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleEdit(medico)}
                        >
                          Editar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {medicos.filter(m => ['cirugia_general', 'traumatologia', 'ginecologia', 'urologia', 'otra'].includes(m.especialidad)).length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    No hay cirujanos registrados
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showForm} onOpenChange={(open) => {
        setShowForm(open);
        if (!open) setEditingMedico(null);
      }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <MedicoForm 
            onClose={() => {
              setShowForm(false);
              setEditingMedico(null);
            }} 
            onSubmit={handleCreateOrUpdate}
            defaultValues={editingMedico ? {
              nombre: editingMedico.nombre,
              especialidad: editingMedico.especialidad,
              cedula: editingMedico.cedula || '',
              unidad: editingMedico.hospital_display_name || ''
            } : undefined}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Medicos;
