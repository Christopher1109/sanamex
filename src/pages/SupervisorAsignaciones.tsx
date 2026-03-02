import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RefreshCw, Users, Building2, Save, AlertTriangle } from 'lucide-react';

interface Supervisor {
  user_id: string;
  username: string;
  nombre: string;
}

interface Hospital {
  id: string;
  nombre: string;
  display_name: string;
  state_id: string;
  state_name?: string;
}

interface State {
  id: string;
  name: string;
}

interface Assignment {
  id: string;
  supervisor_user_id: string;
  hospital_id: string;
}

const SupervisorAsignaciones = () => {
  const [supervisores, setSupervisores] = useState<Supervisor[]>([]);
  const [hospitales, setHospitales] = useState<Hospital[]>([]);
  const [estados, setEstados] = useState<State[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedSupervisor, setSelectedSupervisor] = useState<string>('');
  const [selectedHospitales, setSelectedHospitales] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedSupervisor) {
      fetchSupervisorAssignments(selectedSupervisor);
    }
  }, [selectedSupervisor]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch supervisors from user_roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .eq('role', 'supervisor');

      console.log('Roles data:', rolesData, 'Error:', rolesError);

      // Get profiles for supervisors - even if no user_roles found, check users table
      let supervisorsList: Supervisor[] = [];
      
      if (rolesData && rolesData.length > 0) {
        const supervisorIds = rolesData.map(r => r.user_id);
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, nombre, username')
          .in('id', supervisorIds);

        supervisorsList = profilesData?.map(p => ({
          user_id: p.id,
          username: p.username || 'Sin username',
          nombre: p.nombre
        })) || [];
      }
      
      // Fallback: If no supervisors in user_roles, get from users table with role supervisor
      if (supervisorsList.length === 0) {
        const { data: usersData } = await supabase
          .from('users')
          .select('id, username, role')
          .eq('role', 'supervisor');
        
        console.log('Users fallback data:', usersData);
        
        // Check profiles for these usernames
        if (usersData && usersData.length > 0) {
          const { data: profilesFromUsers } = await supabase
            .from('profiles')
            .select('id, nombre, username')
            .in('username', usersData.map(u => u.username));
          
          console.log('Profiles from users:', profilesFromUsers);
          
          supervisorsList = profilesFromUsers?.map(p => ({
            user_id: p.id,
            username: p.username || 'Sin username',
            nombre: p.nombre
          })) || [];
        }
      }

      setSupervisores(supervisorsList);

      // Fetch states
      const { data: statesData } = await supabase
        .from('states')
        .select('id, name')
        .order('name');

      setEstados(statesData || []);

      // Fetch hospitals with state info
      const { data: hospitalesData } = await supabase
        .from('hospitales')
        .select(`
          id, nombre, display_name, state_id,
          state:states(name)
        `)
        .order('display_name');

      setHospitales(hospitalesData?.map(h => ({
        ...h,
        state_name: (h.state as any)?.name || 'Sin estado'
      })) || []);

      // Fetch all assignments
      const { data: assignmentsData } = await supabase
        .from('supervisor_hospital_assignments')
        .select('*');

      setAssignments(assignmentsData || []);

      if (supervisorsList.length > 0) {
        setSelectedSupervisor(supervisorsList[0].user_id);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const fetchSupervisorAssignments = async (supervisorId: string) => {
    try {
      const { data } = await supabase
        .from('supervisor_hospital_assignments')
        .select('hospital_id')
        .eq('supervisor_user_id', supervisorId);

      setSelectedHospitales(new Set(data?.map(a => a.hospital_id) || []));
    } catch (error) {
      console.error('Error fetching assignments:', error);
    }
  };

  const toggleHospital = (hospitalId: string) => {
    const newSelected = new Set(selectedHospitales);
    if (newSelected.has(hospitalId)) {
      newSelected.delete(hospitalId);
    } else {
      // Limit to 4 hospitals max
      if (newSelected.size >= 4) {
        toast.error('Máximo 4 hospitales por supervisor');
        return;
      }
      newSelected.add(hospitalId);
    }
    setSelectedHospitales(newSelected);
  };

  const guardarAsignaciones = async () => {
    if (!selectedSupervisor) return;

    setSaving(true);
    try {
      // Delete existing assignments
      await supabase
        .from('supervisor_hospital_assignments')
        .delete()
        .eq('supervisor_user_id', selectedSupervisor);

      // Insert new assignments
      if (selectedHospitales.size > 0) {
        const inserts = Array.from(selectedHospitales).map(hospitalId => ({
          supervisor_user_id: selectedSupervisor,
          hospital_id: hospitalId
        }));

        const { error } = await supabase
          .from('supervisor_hospital_assignments')
          .insert(inserts);

        if (error) throw error;
      }

      toast.success(`${selectedHospitales.size} hospitales asignados al supervisor`);
      
      // Refresh assignments
      const { data } = await supabase
        .from('supervisor_hospital_assignments')
        .select('*');
      setAssignments(data || []);
    } catch (error) {
      console.error('Error saving assignments:', error);
      toast.error('Error al guardar asignaciones');
    } finally {
      setSaving(false);
    }
  };

  const getHospitalesAsignados = (supervisorId: string) => {
    return assignments.filter(a => a.supervisor_user_id === supervisorId).length;
  };

  const selectedSupervisorData = supervisores.find(s => s.user_id === selectedSupervisor);

  // Group hospitals by state
  const hospitalesPorEstado = hospitales.reduce((acc, h) => {
    const estado = h.state_name || 'Sin estado';
    if (!acc[estado]) acc[estado] = [];
    acc[estado].push(h);
    return acc;
  }, {} as Record<string, Hospital[]>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Asignación de Supervisores</h1>
          <p className="text-muted-foreground">Asigna hasta 4 hospitales a cada supervisor</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Supervisores</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{supervisores.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hospitales Totales</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hospitales.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Asignaciones Totales</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{assignments.length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Supervisor selector */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Supervisores
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedSupervisor} onValueChange={setSelectedSupervisor}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona supervisor" />
              </SelectTrigger>
              <SelectContent>
                {supervisores.map(s => (
                  <SelectItem key={s.user_id} value={s.user_id}>
                    <div className="flex items-center justify-between w-full gap-4">
                      <span>{s.username}</span>
                      <Badge variant="secondary" className="ml-auto">
                        {getHospitalesAsignados(s.user_id)}/4
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedSupervisorData && (
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <p className="font-medium">{selectedSupervisorData.nombre}</p>
                <p className="text-sm text-muted-foreground">@{selectedSupervisorData.username}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge 
                    variant={selectedHospitales.size === 4 ? 'default' : 'secondary'}
                    className={selectedHospitales.size === 4 ? 'bg-green-600' : ''}
                  >
                    {selectedHospitales.size}/4 hospitales
                  </Badge>
                </div>
              </div>
            )}

            <Button 
              onClick={guardarAsignaciones} 
              disabled={saving} 
              className="w-full"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Guardando...' : 'Guardar Asignaciones'}
            </Button>
          </CardContent>
        </Card>

        {/* Hospital selection */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Hospitales Disponibles
              </div>
              <Badge variant="outline">
                {selectedHospitales.size} seleccionados
              </Badge>
            </CardTitle>
            {selectedHospitales.size >= 4 && (
              <div className="flex items-center gap-2 text-amber-600 text-sm">
                <AlertTriangle className="h-4 w-4" />
                Límite de 4 hospitales alcanzado
              </div>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Cargando...</div>
            ) : (
              <ScrollArea className="h-[60vh]">
                <div className="space-y-6 pr-4">
                  {Object.entries(hospitalesPorEstado).map(([estado, hosps]) => (
                    <div key={estado}>
                      <h4 className="font-semibold text-sm text-muted-foreground mb-2 uppercase tracking-wide">
                        {estado} ({hosps.length})
                      </h4>
                      <div className="space-y-2">
                        {hosps.map(hospital => {
                          const isSelected = selectedHospitales.has(hospital.id);
                          const assignedTo = assignments.find(
                            a => a.hospital_id === hospital.id && a.supervisor_user_id !== selectedSupervisor
                          );
                          const otherSupervisor = assignedTo 
                            ? supervisores.find(s => s.user_id === assignedTo.supervisor_user_id)
                            : null;

                          return (
                            <div
                              key={hospital.id}
                              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                                isSelected 
                                  ? 'bg-primary/10 border-primary' 
                                  : 'hover:bg-muted/50'
                              }`}
                              onClick={() => toggleHospital(hospital.id)}
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleHospital(hospital.id)}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">
                                  {hospital.display_name || hospital.nombre}
                                </p>
                                {otherSupervisor && (
                                  <p className="text-xs text-amber-600">
                                    También asignado a: {otherSupervisor.username}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SupervisorAsignaciones;
