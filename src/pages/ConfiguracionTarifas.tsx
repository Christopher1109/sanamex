import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { RefreshCw, Building2, DollarSign, Save, AlertTriangle } from 'lucide-react';

interface Hospital {
  id: string;
  nombre: string;
  display_name: string;
}

interface Procedimiento {
  procedimiento_clave: string;
  procedimiento_nombre: string;
}

interface Tarifa {
  id?: string;
  hospital_id: string;
  procedimiento_clave: string;
  procedimiento_nombre: string;
  tarifa_facturacion: number;
}

const ConfiguracionTarifas = () => {
  const [hospitales, setHospitales] = useState<Hospital[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<string>('');
  const [procedimientos, setProcedimientos] = useState<Procedimiento[]>([]);
  const [tarifas, setTarifas] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchHospitales();
  }, []);

  useEffect(() => {
    if (selectedHospital) {
      fetchProcedimientosYTarifas(selectedHospital);
    }
  }, [selectedHospital]);

  const fetchHospitales = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('hospitales')
        .select('id, nombre, display_name')
        .order('display_name');

      setHospitales(data || []);

      if (data && data.length > 0) {
        setSelectedHospital(data[0].id);
      }
    } catch (error) {
      console.error('Error fetching hospitals:', error);
      toast.error('Error al cargar hospitales');
    } finally {
      setLoading(false);
    }
  };

  const fetchProcedimientosYTarifas = async (hospitalId: string) => {
    try {
      // Fetch authorized procedures for this hospital
      const { data: procData } = await supabase
        .from('hospital_procedimientos')
        .select('procedimiento_clave, procedimiento_nombre')
        .eq('hospital_id', hospitalId)
        .eq('activo', true)
        .order('procedimiento_clave');

      setProcedimientos(procData || []);

      // Fetch existing tariffs
      const { data: tarifasData } = await supabase
        .from('tarifas_procedimientos')
        .select('procedimiento_clave, tarifa_facturacion')
        .eq('hospital_id', hospitalId);

      const tarifasMap: Record<string, number> = {};
      tarifasData?.forEach(t => {
        tarifasMap[t.procedimiento_clave] = Number(t.tarifa_facturacion);
      });
      setTarifas(tarifasMap);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const handleTarifaChange = (clave: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setTarifas(prev => ({
      ...prev,
      [clave]: numValue
    }));
  };

  const guardarTarifas = async () => {
    if (!selectedHospital) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Delete existing tariffs for this hospital
      await supabase
        .from('tarifas_procedimientos')
        .delete()
        .eq('hospital_id', selectedHospital);

      // Insert new tariffs
      const inserts = procedimientos
        .filter(p => tarifas[p.procedimiento_clave] && tarifas[p.procedimiento_clave] > 0)
        .map(p => ({
          hospital_id: selectedHospital,
          procedimiento_clave: p.procedimiento_clave,
          procedimiento_nombre: p.procedimiento_nombre,
          tarifa_facturacion: tarifas[p.procedimiento_clave],
          created_by: user?.id,
          updated_by: user?.id
        }));

      if (inserts.length > 0) {
        const { error } = await supabase
          .from('tarifas_procedimientos')
          .insert(inserts);

        if (error) throw error;
      }

      toast.success(`${inserts.length} tarifas guardadas correctamente`);
    } catch (error) {
      console.error('Error saving tariffs:', error);
      toast.error('Error al guardar tarifas');
    } finally {
      setSaving(false);
    }
  };

  const selectedHospitalData = hospitales.find(h => h.id === selectedHospital);
  const tarifasConfiguradas = Object.values(tarifas).filter(t => t > 0).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Configuración de Tarifas</h1>
          <p className="text-muted-foreground">Define los precios de facturación por procedimiento y hospital</p>
        </div>
        <Button onClick={fetchHospitales} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Seleccionar Hospital
            <Badge variant="secondary" className="ml-2">
              {hospitales.length} hospitales
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedHospital} onValueChange={setSelectedHospital}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue placeholder="Selecciona un hospital" />
            </SelectTrigger>
            <SelectContent>
              {hospitales.map(h => (
                <SelectItem key={h.id} value={h.id}>
                  {h.display_name || h.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selectedHospital && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Tarifas por Procedimiento
                <Badge variant="secondary" className="ml-2">
                  {tarifasConfiguradas} / {procedimientos.length} configuradas
                </Badge>
              </div>
              <Button onClick={guardarTarifas} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Guardando...' : 'Guardar Tarifas'}
              </Button>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Hospital: <strong>{selectedHospitalData?.display_name || selectedHospitalData?.nombre}</strong>
            </p>
          </CardHeader>
          <CardContent>
            {procedimientos.length === 0 ? (
              <div className="py-12 text-center">
                <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Sin procedimientos autorizados</h3>
                <p className="text-muted-foreground">
                  Este hospital no tiene procedimientos autorizados. Ve a "Procedimientos por Hospital" para configurarlos primero.
                </p>
              </div>
            ) : (
              <ScrollArea className="max-h-[60vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Clave</TableHead>
                      <TableHead>Procedimiento</TableHead>
                      <TableHead className="w-48 text-right">Tarifa (MXN)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {procedimientos.map(proc => (
                      <TableRow 
                        key={proc.procedimiento_clave}
                        className={tarifas[proc.procedimiento_clave] > 0 ? 'bg-primary/5' : ''}
                      >
                        <TableCell className="font-mono text-sm font-semibold text-primary">
                          {proc.procedimiento_clave}
                        </TableCell>
                        <TableCell className="font-medium">
                          {proc.procedimiento_nombre}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-muted-foreground">$</span>
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={tarifas[proc.procedimiento_clave] || ''}
                              onChange={(e) => handleTarifaChange(proc.procedimiento_clave, e.target.value)}
                              className="w-32 text-right"
                              placeholder="0.00"
                            />
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
      )}
    </div>
  );
};

export default ConfiguracionTarifas;
