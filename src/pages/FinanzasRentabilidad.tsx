import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  RefreshCw, 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  FileText,
  Calendar,
  BarChart3
} from 'lucide-react';

interface Hospital {
  id: string;
  nombre: string;
  display_name: string;
}

interface FolioConCostos {
  id: string;
  numero_folio: string;
  fecha: string;
  tipo_anestesia: string;
  paciente_nombre: string;
  tarifa: number;
  costo_insumos: number;
  margen: number;
}

interface ResumenMensual {
  total_folios: number;
  total_facturado: number;
  total_costos: number;
  margen_total: number;
  porcentaje_rentabilidad: number;
}

const FinanzasRentabilidad = () => {
  const [hospitales, setHospitales] = useState<Hospital[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<string>('todos');
  const [selectedMes, setSelectedMes] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [folios, setFolios] = useState<FolioConCostos[]>([]);
  const [resumen, setResumen] = useState<ResumenMensual | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHospitales();
  }, []);

  useEffect(() => {
    fetchDatosFinancieros();
  }, [selectedHospital, selectedMes]);

  const fetchHospitales = async () => {
    try {
      const { data } = await supabase
        .from('hospitales')
        .select('id, nombre, display_name')
        .order('display_name');

      setHospitales(data || []);
    } catch (error) {
      console.error('Error fetching hospitals:', error);
    }
  };

  const fetchDatosFinancieros = async () => {
    setLoading(true);
    try {
      const [year, month] = selectedMes.split('-');
      const startDate = `${year}-${month}-01`;
      const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

      // Query optimizado: solo folios completados del periodo
      let foliosQuery = supabase
        .from('folios')
        .select('id, numero_folio, fecha, tipo_anestesia, paciente_nombre, hospital_id')
        .gte('fecha', startDate)
        .lte('fecha', endDate)
        .eq('estado', 'completado')
        .limit(500);

      if (selectedHospital !== 'todos') {
        foliosQuery = foliosQuery.eq('hospital_id', selectedHospital);
      }

      const { data: foliosData } = await foliosQuery;

      if (!foliosData || foliosData.length === 0) {
        setFolios([]);
        setResumen({
          total_folios: 0,
          total_facturado: 0,
          total_costos: 0,
          margen_total: 0,
          porcentaje_rentabilidad: 0
        });
        setLoading(false);
        return;
      }

      const folioIds = foliosData.map(f => f.id);
      const hospitalIds = [...new Set(foliosData.map(f => f.hospital_id).filter(Boolean))];

      // Queries paralelas para optimizar velocidad
      const [tarifasRes, costosRes] = await Promise.all([
        supabase
          .from('tarifas_procedimientos')
          .select('hospital_id, procedimiento_clave, tarifa_facturacion')
          .in('hospital_id', hospitalIds),
        supabase
          .from('folios_insumos_costos')
          .select('folio_id, costo_total')
          .in('folio_id', folioIds)
      ]);

      // Mapear tarifas
      const tarifasMap = new Map<string, number>();
      tarifasRes.data?.forEach(t => {
        tarifasMap.set(`${t.hospital_id}-${t.procedimiento_clave}`, Number(t.tarifa_facturacion));
      });

      // Mapear costos FIFO
      const costosPorFolio = new Map<string, number>();
      costosRes.data?.forEach(item => {
        const current = costosPorFolio.get(item.folio_id) || 0;
        costosPorFolio.set(item.folio_id, current + Number(item.costo_total || 0));
      });

      // Construir datos finales
      const foliosConCostos: FolioConCostos[] = foliosData.map(f => {
        const tarifa = tarifasMap.get(`${f.hospital_id}-${f.tipo_anestesia}`) || 0;
        const costoInsumos = costosPorFolio.get(f.id) || 0;
        return {
          id: f.id,
          numero_folio: f.numero_folio,
          fecha: f.fecha,
          tipo_anestesia: f.tipo_anestesia || 'N/A',
          paciente_nombre: f.paciente_nombre || 'N/A',
          tarifa,
          costo_insumos: costoInsumos,
          margen: tarifa - costoInsumos
        };
      });

      setFolios(foliosConCostos);

      // Calcular resumen
      const totalFacturado = foliosConCostos.reduce((sum, f) => sum + f.tarifa, 0);
      const totalCostos = foliosConCostos.reduce((sum, f) => sum + f.costo_insumos, 0);
      const margenTotal = totalFacturado - totalCostos;

      setResumen({
        total_folios: foliosConCostos.length,
        total_facturado: totalFacturado,
        total_costos: totalCostos,
        margen_total: margenTotal,
        porcentaje_rentabilidad: totalFacturado > 0 ? (margenTotal / totalFacturado) * 100 : 0
      });

    } catch (error) {
      console.error('Error fetching financial data:', error);
      toast.error('Error al cargar datos financieros');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(amount);
  };

  const formatProcedimiento = (clave: string) => {
    const nombres: Record<string, string> = {
      'general_balanceada_adulto': 'General Balanceada Adulto',
      'general_balanceada_pediatrica': 'General Balanceada Pediátrica',
      'general_alta_especialidad': 'General Alta Especialidad',
      'general_endovenosa': 'General Endovenosa',
      'locorregional': 'Locorregional',
      'sedacion': 'Sedación',
      'anestesia_mixta': 'Anestesia Mixta'
    };
    return nombres[clave] || clave;
  };

  const generateMonthOptions = () => {
    const options = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
      options.push({ value, label });
    }
    return options;
  };

  const selectedHospitalData = hospitales.find(h => h.id === selectedHospital);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Rentabilidad por Hospital</h1>
          <p className="text-muted-foreground">Análisis de rentabilidad mensual por hospital</p>
        </div>
        <Button onClick={fetchDatosFinancieros} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Hospital</label>
              <Select value={selectedHospital} onValueChange={setSelectedHospital}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar hospital" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los hospitales</SelectItem>
                  {hospitales.map(h => (
                    <SelectItem key={h.id} value={h.id}>
                      {h.display_name || h.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">Período</label>
              <Select value={selectedMes} onValueChange={setSelectedMes}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {generateMonthOptions().map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumen de KPIs */}
      {resumen && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Folios Cerrados</p>
                  <p className="text-2xl font-bold">{resumen.total_folios}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Facturado</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(resumen.total_facturado)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Costo Insumos</p>
                  <p className="text-2xl font-bold text-red-600">{formatCurrency(resumen.total_costos)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${resumen.margen_total >= 0 ? 'bg-blue-100' : 'bg-red-100'}`}>
                  <BarChart3 className={`h-5 w-5 ${resumen.margen_total >= 0 ? 'text-blue-600' : 'text-red-600'}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Margen Total</p>
                  <p className={`text-2xl font-bold ${resumen.margen_total >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                    {formatCurrency(resumen.margen_total)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${resumen.porcentaje_rentabilidad >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                  <TrendingUp className={`h-5 w-5 ${resumen.porcentaje_rentabilidad >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Rentabilidad</p>
                  <p className={`text-2xl font-bold ${resumen.porcentaje_rentabilidad >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {resumen.porcentaje_rentabilidad.toFixed(1)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabla de detalle */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Detalle de Folios
            {selectedHospital !== 'todos' && (
              <Badge variant="secondary" className="ml-2">
                {selectedHospitalData?.display_name || selectedHospitalData?.nombre}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <p className="text-muted-foreground">Cargando datos...</p>
            </div>
          ) : folios.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32">
              <FileText className="h-12 w-12 text-muted-foreground/50 mb-2" />
              <p className="text-muted-foreground">No hay folios cerrados en este período</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Folio</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Procedimiento</TableHead>
                    <TableHead className="text-right">Tarifa</TableHead>
                    <TableHead className="text-right">Costo Insumos</TableHead>
                    <TableHead className="text-right">Margen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {folios.map(folio => (
                    <TableRow key={folio.id}>
                      <TableCell className="font-mono font-medium">{folio.numero_folio}</TableCell>
                      <TableCell>{new Date(folio.fecha).toLocaleDateString('es-MX')}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{formatProcedimiento(folio.tipo_anestesia)}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {formatCurrency(folio.tarifa)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-red-600">
                        {formatCurrency(folio.costo_insumos)}
                      </TableCell>
                      <TableCell className={`text-right font-bold ${folio.margen >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {formatCurrency(folio.margen)}
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
  );
};

export default FinanzasRentabilidad;
