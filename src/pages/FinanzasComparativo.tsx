import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Legend } from "recharts";
import { Trophy, Medal, Award } from "lucide-react";

interface HospitalRanking {
  hospitalId: string;
  nombre: string;
  estado: string;
  totalFolios: number;
  ingresos: number;
  costos: number;
  margen: number;
  margenPorcentaje: number;
  eficiencia: number;
  costoPromedio: number;
  ranking: number;
}

interface ComparativoMetricas {
  nombre: string;
  eficiencia: number;
  margen: number;
  volumen: number;
}

const FinanzasComparativo = () => {
  const [loading, setLoading] = useState(true);
  const [anio, setAnio] = useState(new Date().getFullYear().toString());
  const [rankings, setRankings] = useState<HospitalRanking[]>([]);
  const [radarData, setRadarData] = useState<ComparativoMetricas[]>([]);

  const anios = ["2024", "2025", "2026"];

  useEffect(() => {
    fetchComparativoData();
  }, [anio]);

  const fetchComparativoData = async () => {
    try {
      setLoading(true);
      const anioNum = parseInt(anio);
      const fechaInicio = `${anioNum}-01-01`;
      const fechaFin = `${anioNum}-12-31`;

      // Obtener hospitales con estados
      const { data: hospitales } = await supabase
        .from("hospitales")
        .select("id, display_name, nombre, states(name)");

      // Obtener folios del año
      const { data: folios } = await supabase
        .from("folios")
        .select("id, hospital_id, cirugia, tipo_anestesia")
        .gte("fecha", fechaInicio)
        .lte("fecha", fechaFin)
        .in("estado", ["completado", "cerrado"] as any[]);

      // Obtener tarifas
      const { data: tarifas } = await supabase
        .from("tarifas_procedimientos")
        .select("*")
        .eq("activo", true);

      // Obtener precios de insumos
      const { data: precios } = await supabase
        .from("precios_insumos")
        .select("*")
        .eq("activo", true);

      const folioIds = folios?.map(f => f.id) || [];
      const { data: foliosInsumos } = await supabase
        .from("folios_insumos")
        .select("folio_id, insumo_id, cantidad")
        .in("folio_id", folioIds);

      // Crear mapas
      const hospitalMap = new Map();
      hospitales?.forEach(h => {
        hospitalMap.set(h.id, {
          nombre: h.display_name || h.nombre,
          estado: (h.states as any)?.name || 'Sin estado'
        });
      });

      const preciosMap = new Map();
      precios?.forEach(p => preciosMap.set(p.insumo_catalogo_id, p.precio_unitario));

      const tarifasMap = new Map();
      tarifas?.forEach(t => {
        const key = `${t.hospital_id}-${t.procedimiento_clave}`;
        tarifasMap.set(key, t.tarifa_facturacion);
      });

      // Calcular métricas por hospital
      const hospitalStats = new Map<string, {
        totalFolios: number;
        ingresos: number;
        costos: number;
      }>();

      folios?.forEach(folio => {
        const hospitalId = folio.hospital_id;
        if (!hospitalId) return;

        if (!hospitalStats.has(hospitalId)) {
          hospitalStats.set(hospitalId, { totalFolios: 0, ingresos: 0, costos: 0 });
        }

        const stats = hospitalStats.get(hospitalId)!;
        stats.totalFolios++;

        // Calcular ingreso
        const procedimiento = folio.cirugia || folio.tipo_anestesia;
        const tarifaKey = `${hospitalId}-${procedimiento}`;
        const tarifa = tarifasMap.get(tarifaKey) || 0;
        stats.ingresos += tarifa;

        // Calcular costo
        const insumosDelFolio = foliosInsumos?.filter(fi => fi.folio_id === folio.id) || [];
        insumosDelFolio.forEach(insumo => {
          const precio = preciosMap.get(insumo.insumo_id) || 0;
          stats.costos += precio * insumo.cantidad;
        });
      });

      // Crear rankings
      const rankingsArray: HospitalRanking[] = [];
      hospitalStats.forEach((stats, hospitalId) => {
        const hospitalInfo = hospitalMap.get(hospitalId) || { nombre: 'Hospital desconocido', estado: '' };
        const margen = stats.ingresos - stats.costos;
        const margenPorcentaje = stats.ingresos > 0 ? (margen / stats.ingresos) * 100 : 0;
        const costoPromedio = stats.totalFolios > 0 ? stats.costos / stats.totalFolios : 0;
        // Eficiencia: margen por folio normalizado
        const eficiencia = stats.totalFolios > 0 ? margen / stats.totalFolios : 0;

        rankingsArray.push({
          hospitalId,
          nombre: hospitalInfo.nombre,
          estado: hospitalInfo.estado,
          totalFolios: stats.totalFolios,
          ingresos: stats.ingresos,
          costos: stats.costos,
          margen,
          margenPorcentaje,
          eficiencia,
          costoPromedio,
          ranking: 0
        });
      });

      // Ordenar por margen y asignar ranking
      rankingsArray.sort((a, b) => b.margen - a.margen);
      rankingsArray.forEach((r, idx) => r.ranking = idx + 1);

      // Preparar datos para radar (top 5)
      const maxFolios = Math.max(...rankingsArray.map(r => r.totalFolios), 1);
      const maxMargen = Math.max(...rankingsArray.map(r => r.margenPorcentaje), 1);
      const maxEficiencia = Math.max(...rankingsArray.map(r => r.eficiencia), 1);

      const radarDataArray = rankingsArray.slice(0, 5).map(r => ({
        nombre: r.nombre.length > 15 ? r.nombre.substring(0, 15) + '...' : r.nombre,
        eficiencia: (r.eficiencia / maxEficiencia) * 100,
        margen: (r.margenPorcentaje / maxMargen) * 100,
        volumen: (r.totalFolios / maxFolios) * 100
      }));

      setRankings(rankingsArray);
      setRadarData(radarDataArray);

    } catch (error) {
      console.error("Error fetching comparative data:", error);
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

  const getRankingIcon = (ranking: number) => {
    switch (ranking) {
      case 1:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 3:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="text-muted-foreground font-medium">#{ranking}</span>;
    }
  };

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
          <h1 className="text-2xl font-bold">Comparativo de Hospitales</h1>
          <p className="text-muted-foreground">Ranking y análisis comparativo de rentabilidad</p>
        </div>
        <Select value={anio} onValueChange={setAnio}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {anios.map(a => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Top 3 Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {rankings.slice(0, 3).map((hospital, idx) => (
          <Card key={hospital.hospitalId} className={idx === 0 ? 'border-yellow-500 border-2' : ''}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                {getRankingIcon(hospital.ranking)}
                <Badge variant={idx === 0 ? 'default' : 'secondary'}>
                  {hospital.estado}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <h3 className="font-semibold text-lg mb-2">{hospital.nombre}</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Margen:</span>
                  <span className="font-bold text-green-600">{formatCurrency(hospital.margen)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Folios:</span>
                  <span>{hospital.totalFolios}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">% Margen:</span>
                  <span>{hospital.margenPorcentaje.toFixed(1)}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart - Margen por Hospital */}
        <Card>
          <CardHeader>
            <CardTitle>Margen por Hospital (Top 10)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={rankings.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <YAxis 
                  dataKey="nombre" 
                  type="category" 
                  width={150} 
                  fontSize={11}
                  tickFormatter={(value) => value.length > 20 ? value.substring(0, 20) + '...' : value}
                />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey="margen" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Radar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Comparativo Top 5 (Normalizado)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={[
                { subject: 'Eficiencia', ...Object.fromEntries(radarData.map(r => [r.nombre, r.eficiencia])) },
                { subject: 'Margen %', ...Object.fromEntries(radarData.map(r => [r.nombre, r.margen])) },
                { subject: 'Volumen', ...Object.fromEntries(radarData.map(r => [r.nombre, r.volumen])) }
              ]}>
                <PolarGrid />
                <PolarAngleAxis dataKey="subject" />
                <PolarRadiusAxis angle={30} domain={[0, 100]} />
                {radarData.map((r, idx) => (
                  <Radar
                    key={r.nombre}
                    name={r.nombre}
                    dataKey={r.nombre}
                    stroke={`hsl(${idx * 60}, 70%, 50%)`}
                    fill={`hsl(${idx * 60}, 70%, 50%)`}
                    fillOpacity={0.2}
                  />
                ))}
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tabla completa */}
      <Card>
        <CardHeader>
          <CardTitle>Ranking Completo de Hospitales</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Hospital</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Folios</TableHead>
                  <TableHead className="text-right">Ingresos</TableHead>
                  <TableHead className="text-right">Costos</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                  <TableHead className="text-right">% Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankings.map((hospital) => (
                  <TableRow key={hospital.hospitalId}>
                    <TableCell className="text-center">
                      {getRankingIcon(hospital.ranking)}
                    </TableCell>
                    <TableCell className="font-medium">{hospital.nombre}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{hospital.estado}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{hospital.totalFolios}</TableCell>
                    <TableCell className="text-right text-primary">{formatCurrency(hospital.ingresos)}</TableCell>
                    <TableCell className="text-right text-destructive">{formatCurrency(hospital.costos)}</TableCell>
                    <TableCell className={`text-right font-bold ${hospital.margen >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {formatCurrency(hospital.margen)}
                    </TableCell>
                    <TableCell className="text-right">{hospital.margenPorcentaje.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FinanzasComparativo;
