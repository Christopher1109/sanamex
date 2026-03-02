import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { PROCEDIMIENTOS_BY_CLAVE } from "@/constants/procedimientosCatalog";

interface Hospital {
  id: string;
  display_name: string;
  budget_code: string;
}

interface ReporteCosto {
  hospital: string;
  totalFolios: number;
  costoInsumos: number;
  ingresosTarifas: number;
  margen: number;
  costoPromedio: number;
}

interface DesgloseProcedimiento {
  clave: string;
  nombre: string;
  cantidad: number;
  tarifa: number;
  costoInsumos: number;
  margen: number;
}

const FinanzasReportes = () => {
  const [loading, setLoading] = useState(true);
  const [hospitales, setHospitales] = useState<Hospital[]>([]);
  const [selectedHospital, setSelectedHospital] = useState<string>("todos");
  const [mes, setMes] = useState<string>("");
  const [reporteHospitales, setReporteHospitales] = useState<ReporteCosto[]>([]);
  const [desgloseProcedimientos, setDesgloseProcedimientos] = useState<DesgloseProcedimiento[]>([]);

  const meses = [
    { value: "01", label: "Enero" },
    { value: "02", label: "Febrero" },
    { value: "03", label: "Marzo" },
    { value: "04", label: "Abril" },
    { value: "05", label: "Mayo" },
    { value: "06", label: "Junio" },
    { value: "07", label: "Julio" },
    { value: "08", label: "Agosto" },
    { value: "09", label: "Septiembre" },
    { value: "10", label: "Octubre" },
    { value: "11", label: "Noviembre" },
    { value: "12", label: "Diciembre" },
  ];

  useEffect(() => {
    const currentMonth = (new Date().getMonth() + 1).toString().padStart(2, '0');
    setMes(currentMonth);
    fetchHospitales();
  }, []);

  useEffect(() => {
    if (mes) {
      fetchReportes();
    }
  }, [selectedHospital, mes]);

  const fetchHospitales = async () => {
    const { data, error } = await supabase
      .from("hospitales")
      .select("id, display_name, budget_code")
      .order("display_name");
    
    if (!error && data) {
      setHospitales(data);
    }
  };

  const fetchReportes = async () => {
    try {
      setLoading(true);
      const anio = new Date().getFullYear();
      const fechaInicio = `${anio}-${mes}-01`;
      const fechaFin = `${anio}-${mes}-31`;

      // Construir query de folios
      let foliosQuery = supabase
        .from("folios")
        .select("id, hospital_id, hospital_display_name, cirugia, tipo_anestesia")
        .gte("fecha", fechaInicio)
        .lte("fecha", fechaFin)
        .eq("estado", "completado");

      if (selectedHospital !== "todos") {
        foliosQuery = foliosQuery.eq("hospital_id", selectedHospital);
      }

      const { data: folios, error: foliosError } = await foliosQuery;
      if (foliosError) throw foliosError;

      // Obtener tarifas y precios
      const { data: tarifas } = await supabase
        .from("tarifas_procedimientos")
        .select("*")
        .eq("activo", true);

      const { data: preciosInsumos } = await supabase
        .from("precios_insumos")
        .select("*")
        .eq("activo", true);

      const folioIds = folios?.map(f => f.id) || [];
      const { data: foliosInsumos } = await supabase
        .from("folios_insumos")
        .select("folio_id, insumo_id, cantidad")
        .in("folio_id", folioIds);

      // Crear mapas
      const preciosMap = new Map();
      preciosInsumos?.forEach(p => preciosMap.set(p.insumo_catalogo_id, p.precio_unitario));

      const tarifasMap = new Map();
      tarifas?.forEach(t => {
        const key = `${t.hospital_id}-${t.procedimiento_clave}`;
        tarifasMap.set(key, t.tarifa_facturacion);
      });

      // Calcular reporte por hospital
      const hospitalStats = new Map<string, ReporteCosto>();
      const procedimientoStats = new Map<string, DesgloseProcedimiento>();

      folios?.forEach(folio => {
        const hospitalId = folio.hospital_id || 'sin-hospital';
        const hospitalNombre = folio.hospital_display_name || 'Sin hospital';
        
        // Usar tipo_anestesia (clave 19.01.xxx) para agrupar por tipo de procedimiento
        const tipoClave = folio.tipo_anestesia || 'sin-tipo';
        const procedimientoCatalogo = PROCEDIMIENTOS_BY_CLAVE.get(tipoClave);
        const procedimientoNombre = procedimientoCatalogo?.nombre || tipoClave;

        const tarifaKey = `${folio.hospital_id}-${tipoClave}`;
        const tarifa = tarifasMap.get(tarifaKey) || 0;

        const insumosDelFolio = foliosInsumos?.filter(fi => fi.folio_id === folio.id) || [];
        let costoFolio = 0;
        insumosDelFolio.forEach(insumo => {
          const precio = preciosMap.get(insumo.insumo_id) || 0;
          costoFolio += precio * insumo.cantidad;
        });

        // Agrupar por hospital
        if (!hospitalStats.has(hospitalId)) {
          hospitalStats.set(hospitalId, {
            hospital: hospitalNombre,
            totalFolios: 0,
            costoInsumos: 0,
            ingresosTarifas: 0,
            margen: 0,
            costoPromedio: 0
          });
        }
        const hStats = hospitalStats.get(hospitalId)!;
        hStats.totalFolios++;
        hStats.costoInsumos += costoFolio;
        hStats.ingresosTarifas += tarifa;
        hStats.margen = hStats.ingresosTarifas - hStats.costoInsumos;
        hStats.costoPromedio = hStats.costoInsumos / hStats.totalFolios;

        // Agrupar por tipo de anestesia (clave 19.01.xxx)
        if (!procedimientoStats.has(tipoClave)) {
          procedimientoStats.set(tipoClave, {
            clave: tipoClave,
            nombre: procedimientoNombre,
            cantidad: 0,
            tarifa: 0,
            costoInsumos: 0,
            margen: 0
          });
        }
        const pStats = procedimientoStats.get(tipoClave)!;
        pStats.cantidad++;
        pStats.tarifa += tarifa;
        pStats.costoInsumos += costoFolio;
        pStats.margen = pStats.tarifa - pStats.costoInsumos;
      });

      setReporteHospitales(Array.from(hospitalStats.values()).sort((a, b) => b.margen - a.margen));
      setDesgloseProcedimientos(Array.from(procedimientoStats.values()).sort((a, b) => b.cantidad - a.cantidad));

    } catch (error) {
      console.error("Error fetching reports:", error);
      toast.error("Error al cargar reportes");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0
    }).format(value);
  };

  const exportToCSV = (data: any[], filename: string) => {
    const headers = Object.keys(data[0] || {}).join(',');
    const rows = data.map(row => Object.values(row).join(',')).join('\n');
    const csv = `${headers}\n${rows}`;
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
    toast.success("Reporte exportado");
  };

  const getMesLabel = () => meses.find(m => m.value === mes)?.label || '';

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Reportes de Costos</h1>
          <p className="text-muted-foreground">Desglose detallado por hospital y procedimiento</p>
        </div>
        <div className="flex gap-4">
          <Select value={selectedHospital} onValueChange={setSelectedHospital}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Todos los hospitales" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los hospitales</SelectItem>
              {hospitales.map(h => (
                <SelectItem key={h.id} value={h.id}>{h.display_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {meses.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Reporte por Hospital */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Costos por Hospital - {getMesLabel()}</CardTitle>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => exportToCSV(reporteHospitales, `reporte_hospitales_${mes}`)}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Hospital</TableHead>
                <TableHead className="text-right">Folios</TableHead>
                <TableHead className="text-right">Ingresos</TableHead>
                <TableHead className="text-right">Costos</TableHead>
                <TableHead className="text-right">Margen</TableHead>
                <TableHead className="text-right">Costo Promedio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reporteHospitales.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No hay datos para el período seleccionado
                  </TableCell>
                </TableRow>
              ) : (
                reporteHospitales.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{row.hospital}</TableCell>
                    <TableCell className="text-right">{row.totalFolios}</TableCell>
                    <TableCell className="text-right text-primary">{formatCurrency(row.ingresosTarifas)}</TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(row.costoInsumos)}</TableCell>
                    <TableCell className={`text-right font-semibold ${row.margen >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {formatCurrency(row.margen)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(row.costoPromedio)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Desglose por Procedimiento */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Desglose por Tipo de Procedimiento - {getMesLabel()}</CardTitle>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => exportToCSV(desgloseProcedimientos, `reporte_procedimientos_${mes}`)}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Clave</TableHead>
                <TableHead>Tipo de Anestesia</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Tarifas Total</TableHead>
                <TableHead className="text-right">Costos Total</TableHead>
                <TableHead className="text-right">Margen Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {desgloseProcedimientos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No hay datos para el período seleccionado
                  </TableCell>
                </TableRow>
              ) : (
                desgloseProcedimientos.map((row, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-sm">{row.clave}</TableCell>
                    <TableCell className="font-medium">{row.nombre}</TableCell>
                    <TableCell className="text-right">{row.cantidad}</TableCell>
                    <TableCell className="text-right text-primary">{formatCurrency(row.tarifa)}</TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(row.costoInsumos)}</TableCell>
                    <TableCell className={`text-right font-semibold ${row.margen >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {formatCurrency(row.margen)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default FinanzasReportes;
