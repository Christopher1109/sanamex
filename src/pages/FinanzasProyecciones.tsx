import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area } from "recharts";
import { TrendingUp, Calculator, Target, Calendar } from "lucide-react";

interface ProyeccionMensual {
  mes: string;
  real: number;
  proyectado: number;
  tendencia: number;
}

interface ProyeccionAnual {
  concepto: string;
  actual: number;
  proyectado: number;
  variacion: number;
}

const FinanzasProyecciones = () => {
  const [loading, setLoading] = useState(true);
  const [anio, setAnio] = useState(new Date().getFullYear().toString());
  const [proyeccionIngresos, setProyeccionIngresos] = useState<ProyeccionMensual[]>([]);
  const [proyeccionCostos, setProyeccionCostos] = useState<ProyeccionMensual[]>([]);
  const [resumenAnual, setResumenAnual] = useState<ProyeccionAnual[]>([]);
  const [kpis, setKpis] = useState({
    ingresoProyectadoAnual: 0,
    costoProyectadoAnual: 0,
    margenProyectadoAnual: 0,
    crecimientoEstimado: 0
  });

  const anios = ["2024", "2025", "2026"];
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  useEffect(() => {
    fetchProyecciones();
  }, [anio]);

  const fetchProyecciones = async () => {
    try {
      setLoading(true);
      const anioNum = parseInt(anio);
      const mesActual = new Date().getMonth() + 1;
      const fechaInicio = `${anioNum}-01-01`;
      const fechaFin = `${anioNum}-12-31`;

      // Obtener folios del año
      const { data: folios } = await supabase
        .from("folios")
        .select("id, hospital_id, fecha, cirugia, tipo_anestesia")
        .gte("fecha", fechaInicio)
        .lte("fecha", fechaFin)
        .in("estado", ["completado", "cerrado"] as any[]);

      // Obtener tarifas y precios
      const { data: tarifas } = await supabase
        .from("tarifas_procedimientos")
        .select("*")
        .eq("activo", true);

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
      const preciosMap = new Map();
      precios?.forEach(p => preciosMap.set(p.insumo_catalogo_id, p.precio_unitario));

      const tarifasMap = new Map();
      tarifas?.forEach(t => {
        const key = `${t.hospital_id}-${t.procedimiento_clave}`;
        tarifasMap.set(key, t.tarifa_facturacion);
      });

      // Calcular datos por mes
      const ingresosPorMes = new Map<number, number>();
      const costosPorMes = new Map<number, number>();

      folios?.forEach(folio => {
        const mesNum = parseInt(folio.fecha?.split('-')[1] || '0');
        if (mesNum === 0) return;

        // Calcular ingreso
        const procedimiento = folio.cirugia || folio.tipo_anestesia;
        const tarifaKey = `${folio.hospital_id}-${procedimiento}`;
        const tarifa = tarifasMap.get(tarifaKey) || 0;
        ingresosPorMes.set(mesNum, (ingresosPorMes.get(mesNum) || 0) + tarifa);

        // Calcular costo
        const insumosDelFolio = foliosInsumos?.filter(fi => fi.folio_id === folio.id) || [];
        let costoFolio = 0;
        insumosDelFolio.forEach(insumo => {
          const precio = preciosMap.get(insumo.insumo_id) || 0;
          costoFolio += precio * insumo.cantidad;
        });
        costosPorMes.set(mesNum, (costosPorMes.get(mesNum) || 0) + costoFolio);
      });

      // Calcular promedio de meses con datos para proyección
      const mesesConDatos = Array.from(ingresosPorMes.keys()).filter(m => m <= mesActual);
      const promedioIngresos = mesesConDatos.length > 0 
        ? mesesConDatos.reduce((sum, m) => sum + (ingresosPorMes.get(m) || 0), 0) / mesesConDatos.length 
        : 0;
      const promedioCostos = mesesConDatos.length > 0 
        ? mesesConDatos.reduce((sum, m) => sum + (costosPorMes.get(m) || 0), 0) / mesesConDatos.length 
        : 0;

      // Calcular tendencia (regresión simple)
      let tendenciaIngresos = 0;
      let tendenciaCostos = 0;
      if (mesesConDatos.length >= 3) {
        const ultimosTres = mesesConDatos.slice(-3);
        const promedioUltimos = ultimosTres.reduce((sum, m) => sum + (ingresosPorMes.get(m) || 0), 0) / 3;
        const promedioAnteriores = mesesConDatos.slice(0, -3).length > 0
          ? mesesConDatos.slice(0, -3).reduce((sum, m) => sum + (ingresosPorMes.get(m) || 0), 0) / mesesConDatos.slice(0, -3).length
          : promedioUltimos;
        tendenciaIngresos = promedioAnteriores > 0 ? ((promedioUltimos - promedioAnteriores) / promedioAnteriores) : 0;
      }

      // Construir proyecciones mensuales
      const proyeccionIngresosArray: ProyeccionMensual[] = [];
      const proyeccionCostosArray: ProyeccionMensual[] = [];

      for (let i = 1; i <= 12; i++) {
        const ingresoReal = ingresosPorMes.get(i) || 0;
        const costoReal = costosPorMes.get(i) || 0;

        // Para meses futuros, proyectar basado en promedio + tendencia
        const factorTendencia = 1 + (tendenciaIngresos * (i - mesActual) / 12);
        const ingresoProyectado = i > mesActual ? promedioIngresos * Math.max(0.8, Math.min(1.2, factorTendencia)) : ingresoReal;
        const costoProyectado = i > mesActual ? promedioCostos * Math.max(0.9, Math.min(1.1, factorTendencia)) : costoReal;

        proyeccionIngresosArray.push({
          mes: meses[i - 1],
          real: i <= mesActual ? ingresoReal : 0,
          proyectado: ingresoProyectado,
          tendencia: promedioIngresos * factorTendencia
        });

        proyeccionCostosArray.push({
          mes: meses[i - 1],
          real: i <= mesActual ? costoReal : 0,
          proyectado: costoProyectado,
          tendencia: promedioCostos * factorTendencia
        });
      }

      // Calcular KPIs anuales
      const ingresoRealAcumulado = mesesConDatos.reduce((sum, m) => sum + (ingresosPorMes.get(m) || 0), 0);
      const costoRealAcumulado = mesesConDatos.reduce((sum, m) => sum + (costosPorMes.get(m) || 0), 0);
      
      const mesesRestantes = 12 - mesActual;
      const ingresoProyectadoAnual = ingresoRealAcumulado + (promedioIngresos * mesesRestantes);
      const costoProyectadoAnual = costoRealAcumulado + (promedioCostos * mesesRestantes);

      // Obtener datos del año anterior para comparación
      const anioAnterior = anioNum - 1;
      const { data: foliosAnterior } = await supabase
        .from("folios")
        .select("id, hospital_id, cirugia, tipo_anestesia")
        .gte("fecha", `${anioAnterior}-01-01`)
        .lte("fecha", `${anioAnterior}-12-31`)
        .in("estado", ["completado", "cerrado"] as any[]);

      let ingresoAnterior = 0;
      foliosAnterior?.forEach(folio => {
        const procedimiento = folio.cirugia || folio.tipo_anestesia;
        const tarifaKey = `${folio.hospital_id}-${procedimiento}`;
        ingresoAnterior += tarifasMap.get(tarifaKey) || 0;
      });

      const crecimiento = ingresoAnterior > 0 ? ((ingresoProyectadoAnual - ingresoAnterior) / ingresoAnterior) * 100 : 0;

      setKpis({
        ingresoProyectadoAnual,
        costoProyectadoAnual,
        margenProyectadoAnual: ingresoProyectadoAnual - costoProyectadoAnual,
        crecimientoEstimado: crecimiento
      });

      setProyeccionIngresos(proyeccionIngresosArray);
      setProyeccionCostos(proyeccionCostosArray);

      // Resumen anual
      setResumenAnual([
        { 
          concepto: 'Ingresos', 
          actual: ingresoRealAcumulado, 
          proyectado: ingresoProyectadoAnual,
          variacion: ingresoProyectadoAnual - ingresoRealAcumulado
        },
        { 
          concepto: 'Costos', 
          actual: costoRealAcumulado, 
          proyectado: costoProyectadoAnual,
          variacion: costoProyectadoAnual - costoRealAcumulado
        },
        { 
          concepto: 'Margen', 
          actual: ingresoRealAcumulado - costoRealAcumulado, 
          proyectado: ingresoProyectadoAnual - costoProyectadoAnual,
          variacion: (ingresoProyectadoAnual - costoProyectadoAnual) - (ingresoRealAcumulado - costoRealAcumulado)
        }
      ]);

    } catch (error) {
      console.error("Error fetching proyecciones:", error);
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
          <h1 className="text-2xl font-bold">Proyecciones Financieras</h1>
          <p className="text-muted-foreground">Estimados basados en datos históricos</p>
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

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingreso Proyectado Anual</CardTitle>
            <Target className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(kpis.ingresoProyectadoAnual)}</div>
            <p className="text-xs text-muted-foreground">Estimado {anio}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Costo Proyectado Anual</CardTitle>
            <Calculator className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(kpis.costoProyectadoAnual)}</div>
            <p className="text-xs text-muted-foreground">Estimado {anio}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Margen Proyectado</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${kpis.margenProyectadoAnual >= 0 ? 'text-green-600' : 'text-destructive'}`}>
              {formatCurrency(kpis.margenProyectadoAnual)}
            </div>
            <p className="text-xs text-muted-foreground">Ganancia esperada</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Crecimiento vs Año Anterior</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${kpis.crecimientoEstimado >= 0 ? 'text-green-600' : 'text-destructive'}`}>
              {kpis.crecimientoEstimado >= 0 ? '+' : ''}{kpis.crecimientoEstimado.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Comparado con {parseInt(anio) - 1}</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 gap-6">
        {/* Proyección de Ingresos */}
        <Card>
          <CardHeader>
            <CardTitle>Proyección de Ingresos {anio}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={proyeccionIngresos}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Area 
                  type="monotone" 
                  dataKey="real" 
                  stackId="1"
                  stroke="hsl(var(--primary))" 
                  fill="hsl(var(--primary))"
                  fillOpacity={0.6}
                  name="Real"
                />
                <Area 
                  type="monotone" 
                  dataKey="proyectado" 
                  stackId="2"
                  stroke="#10B981" 
                  fill="#10B981"
                  fillOpacity={0.3}
                  strokeDasharray="5 5"
                  name="Proyectado"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Proyección de Costos */}
        <Card>
          <CardHeader>
            <CardTitle>Proyección de Costos {anio}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={proyeccionCostos}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="real" 
                  stroke="hsl(var(--destructive))" 
                  strokeWidth={2}
                  name="Real"
                  dot={{ fill: 'hsl(var(--destructive))' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="proyectado" 
                  stroke="#F59E0B" 
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Proyectado"
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Resumen Anual */}
      <Card>
        <CardHeader>
          <CardTitle>Resumen de Proyección Anual {anio}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {resumenAnual.map((item, idx) => (
              <div key={idx} className="p-4 border rounded-lg">
                <h3 className="font-semibold text-lg mb-4">{item.concepto}</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Actual acumulado:</span>
                    <span className="font-semibold">{formatCurrency(item.actual)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Proyectado fin de año:</span>
                    <span className="font-bold text-primary">{formatCurrency(item.proyectado)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2">
                    <span className="text-muted-foreground">Por ejecutar:</span>
                    <span className={`font-semibold ${item.variacion >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {item.variacion >= 0 ? '+' : ''}{formatCurrency(item.variacion)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FinanzasProyecciones;
