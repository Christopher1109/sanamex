import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useHospital } from '@/contexts/HospitalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet, Calendar } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { generateAnexoT29Excel } from '@/utils/excelExportT29';
import { generateAnexoT30 } from '@/utils/excelExport';

const Reportes = () => {
  const { selectedHospital } = useHospital();
  const [t29FechaInicio, setT29FechaInicio] = useState('');
  const [t29FechaFin, setT29FechaFin] = useState('');
  const [t30FechaInicio, setT30FechaInicio] = useState('');
  const [t30FechaFin, setT30FechaFin] = useState('');
  const [folios, setFolios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedHospital) {
      fetchFolios();
    }
  }, [selectedHospital]);

  const fetchFolios = async () => {
    if (!selectedHospital) return;
    
    try {
      setLoading(true);
      // Fetch folios con sus insumos para T30
      const { data, error } = await supabase
        .from('folios')
        .select(`
          *,
          folios_insumos (
            id,
            cantidad,
            insumo_id,
            insumos_catalogo:insumo_id (
              id,
              nombre,
              clave
            )
          )
        `)
        .eq('hospital_id', selectedHospital.id)
        .order('fecha', { ascending: false });

      if (error) throw error;
      setFolios(data || []);
    } catch (error: any) {
      toast.error('Error al cargar folios', {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadT29 = async () => {
    if (!selectedHospital) {
      toast.error('Debes seleccionar un hospital para continuar');
      return;
    }
    
    if (!t29FechaInicio || !t29FechaFin) {
      toast.error('Selecciona el periodo', {
        description: 'Debes indicar fecha de inicio y fin',
      });
      return;
    }

    if (new Date(t29FechaInicio) > new Date(t29FechaFin)) {
      toast.error('Fechas inválidas', {
        description: 'La fecha de inicio debe ser anterior a la fecha de fin',
      });
      return;
    }

    try {
      const foliosFiltrados = folios.filter(f => {
        const fecha = new Date(f.fecha);
        return fecha >= new Date(t29FechaInicio) && fecha <= new Date(t29FechaFin);
      });
      
      // Pasar información del hospital para el formato T29
      const hospitalInfo = selectedHospital ? {
        state_name: selectedHospital.state_name,
        hospital_type: selectedHospital.hospital_type,
        clinic_number: selectedHospital.clinic_number,
        locality: selectedHospital.locality,
        budget_code: selectedHospital.budget_code,
        display_name: selectedHospital.display_name,
      } : undefined;
      
      await generateAnexoT29Excel(foliosFiltrados, t29FechaInicio, t29FechaFin, hospitalInfo);
      toast.success('Anexo T29 generado', {
        description: 'El archivo se descargó correctamente',
      });
    } catch (error) {
      console.error('Error generando T29:', error);
      toast.error('Error al generar reporte');
    }
  };

  const handleDownloadT30 = () => {
    if (!selectedHospital) {
      toast.error('Debes seleccionar un hospital para continuar');
      return;
    }
    
    if (!t30FechaInicio || !t30FechaFin) {
      toast.error('Selecciona el periodo', {
        description: 'Debes indicar fecha de inicio y fin',
      });
      return;
    }

    if (new Date(t30FechaInicio) > new Date(t30FechaFin)) {
      toast.error('Fechas inválidas', {
        description: 'La fecha de inicio debe ser anterior a la fecha de fin',
      });
      return;
    }

    try {
      const foliosFiltrados = folios.filter(f => {
        const fecha = new Date(f.fecha);
        return fecha >= new Date(t30FechaInicio) && fecha <= new Date(t30FechaFin);
      });
      generateAnexoT30(foliosFiltrados, t30FechaInicio, t30FechaFin);
      toast.success('Anexo T30 generado', {
        description: 'El archivo se descargó correctamente',
      });
    } catch (error) {
      toast.error('Error al generar reporte');
    }
  };

  if (!selectedHospital) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Reportes</h1>
          <p className="text-muted-foreground">Generación de anexos T29 y T30</p>
        </div>
        <Alert>
          <AlertDescription>
            Debes seleccionar un hospital para generar reportes.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Reportes</h1>
        <p className="text-muted-foreground">Generación de anexos T29 y T30</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <FileSpreadsheet className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Anexo T29</CardTitle>
                <p className="text-sm text-muted-foreground">Listado de pacientes</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Genera el listado completo de pacientes atendidos en el periodo seleccionado, 
              incluyendo datos del procedimiento, médicos involucrados y tipo de anestesia utilizada.
            </p>
            
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="t29-inicio">Fecha Inicio</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    id="t29-inicio" 
                    type="date" 
                    className="pl-9"
                    value={t29FechaInicio}
                    onChange={(e) => setT29FechaInicio(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="t29-fin">Fecha Fin</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    id="t29-fin" 
                    type="date" 
                    className="pl-9"
                    value={t29FechaFin}
                    onChange={(e) => setT29FechaFin(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Button className="w-full gap-2" onClick={handleDownloadT29}>
              <Download className="h-4 w-4" />
              Descargar Anexo T29
            </Button>

            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium">Últimas descargas:</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>• 01/11/2024 - Octubre 2024</li>
                <li>• 01/10/2024 - Septiembre 2024</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-accent">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10">
                <FileSpreadsheet className="h-6 w-6 text-accent" />
              </div>
              <div>
                <CardTitle>Anexo T30</CardTitle>
                <p className="text-sm text-muted-foreground">Listado de insumos</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              Genera el reporte detallado de todos los insumos utilizados en el periodo, 
              con información de lotes, cantidades consumidas y origen de los materiales.
            </p>
            
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="t30-inicio">Fecha Inicio</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    id="t30-inicio" 
                    type="date" 
                    className="pl-9"
                    value={t30FechaInicio}
                    onChange={(e) => setT30FechaInicio(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="t30-fin">Fecha Fin</Label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input 
                    id="t30-fin" 
                    type="date" 
                    className="pl-9"
                    value={t30FechaFin}
                    onChange={(e) => setT30FechaFin(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Button className="w-full gap-2" onClick={handleDownloadT30}>
              <Download className="h-4 w-4" />
              Descargar Anexo T30
            </Button>

            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium">Últimas descargas:</p>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>• 01/11/2024 - Octubre 2024</li>
                <li>• 01/10/2024 - Septiembre 2024</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estadísticas del Periodo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Total Procedimientos</p>
              <p className="text-2xl font-bold">248</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Insumos Utilizados</p>
              <p className="text-2xl font-bold">1,234</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Médicos Activos</p>
              <p className="text-2xl font-bold">45</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Folios Cancelados</p>
              <p className="text-2xl font-bold">3</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Reportes;
