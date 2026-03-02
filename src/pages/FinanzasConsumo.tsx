import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ConsumoInsumo {
  insumoId: string;
  nombre: string;
  categoria: string;
  cantidadTotal: number;
  costoTotal: number;
  precioUnitario: number;
  tendencia: 'subiendo' | 'bajando' | 'estable';
  variacion: number;
}

interface TendenciaMensual {
  mes: string;
  cantidad: number;
  costo: number;
}

const FinanzasConsumo = () => {
  const [loading, setLoading] = useState(true);
  const [anio, setAnio] = useState(new Date().getFullYear().toString());
  const [consumoInsumos, setConsumoInsumos] = useState<ConsumoInsumo[]>([]);
  const [tendenciasTop, setTendenciasTop] = useState<{ nombre: string; data: TendenciaMensual[] }[]>([]);
  const [totalConsumo, setTotalConsumo] = useState(0);
  const [totalCosto, setTotalCosto] = useState(0);

  const anios = ["2024", "2025", "2026"];

  useEffect(() => {
    fetchConsumoData();
  }, [anio]);

  const fetchConsumoData = async () => {
    try {
      setLoading(true);
      const anioNum = parseInt(anio);
      const fechaInicio = `${anioNum}-01-01`;
      const fechaFin = `${anioNum}-12-31`;

      // Obtener folios del año
      const { data: folios } = await supabase
        .from("folios")
        .select("id, fecha")
        .gte("fecha", fechaInicio)
        .lte("fecha", fechaFin)
        .in("estado", ["completado", "cerrado"] as any[]);

      const folioIds = folios?.map(f => f.id) || [];

      // Obtener consumo de insumos
      const { data: foliosInsumos } = await supabase
        .from("folios_insumos")
        .select("folio_id, insumo_id, cantidad")
        .in("folio_id", folioIds);

      // Obtener catálogo de insumos
      const { data: catalogo } = await supabase
        .from("insumos_catalogo")
        .select("id, nombre, categoria");

      // Obtener precios
      const { data: precios } = await supabase
        .from("precios_insumos")
        .select("insumo_catalogo_id, precio_unitario")
        .eq("activo", true);

      // Crear mapas
      const catalogoMap = new Map();
      catalogo?.forEach(c => catalogoMap.set(c.id, c));

      const preciosMap = new Map();
      precios?.forEach(p => preciosMap.set(p.insumo_catalogo_id, p.precio_unitario));

      // Crear mapa de folio -> mes
      const folioMesMap = new Map();
      folios?.forEach(f => {
        folioMesMap.set(f.id, f.fecha?.substring(0, 7) || '');
      });

      // Agrupar consumo por insumo
      const consumoMap = new Map<string, {
        cantidad: number;
        costo: number;
        porMes: Map<string, number>;
      }>();

      foliosInsumos?.forEach(fi => {
        const insumoId = fi.insumo_id;
        if (!insumoId) return;

        const precio = preciosMap.get(insumoId) || 0;
        const mes = folioMesMap.get(fi.folio_id) || '';

        if (!consumoMap.has(insumoId)) {
          consumoMap.set(insumoId, { cantidad: 0, costo: 0, porMes: new Map() });
        }
        const stats = consumoMap.get(insumoId)!;
        stats.cantidad += fi.cantidad;
        stats.costo += fi.cantidad * precio;

        if (mes) {
          stats.porMes.set(mes, (stats.porMes.get(mes) || 0) + fi.cantidad);
        }
      });

      // Convertir a array y calcular tendencias
      const consumoArray: ConsumoInsumo[] = [];
      let totalCantidad = 0;
      let totalCostoAcc = 0;

      consumoMap.forEach((stats, insumoId) => {
        const insumoInfo = catalogoMap.get(insumoId);
        const precio = preciosMap.get(insumoId) || 0;

        // Calcular tendencia (comparar últimos 3 meses vs 3 anteriores)
        const mesesOrdenados = Array.from(stats.porMes.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        let tendencia: 'subiendo' | 'bajando' | 'estable' = 'estable';
        let variacion = 0;

        if (mesesOrdenados.length >= 4) {
          const mitad = Math.floor(mesesOrdenados.length / 2);
          const primerasMitad = mesesOrdenados.slice(0, mitad).reduce((sum, [_, v]) => sum + v, 0);
          const segundaMitad = mesesOrdenados.slice(mitad).reduce((sum, [_, v]) => sum + v, 0);
          
          if (primerasMitad > 0) {
            variacion = ((segundaMitad - primerasMitad) / primerasMitad) * 100;
            if (variacion > 10) tendencia = 'subiendo';
            else if (variacion < -10) tendencia = 'bajando';
          }
        }

        consumoArray.push({
          insumoId,
          nombre: insumoInfo?.nombre || 'Insumo desconocido',
          categoria: insumoInfo?.categoria || 'Sin categoría',
          cantidadTotal: stats.cantidad,
          costoTotal: stats.costo,
          precioUnitario: precio,
          tendencia,
          variacion
        });

        totalCantidad += stats.cantidad;
        totalCostoAcc += stats.costo;
      });

      // Ordenar por cantidad consumida
      consumoArray.sort((a, b) => b.cantidadTotal - a.cantidadTotal);

      // Preparar tendencias mensuales para los top 5
      const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const tendenciasData: { nombre: string; data: TendenciaMensual[] }[] = [];

      consumoArray.slice(0, 5).forEach(insumo => {
        const stats = consumoMap.get(insumo.insumoId);
        if (!stats) return;

        const dataArray: TendenciaMensual[] = [];
        for (let i = 1; i <= 12; i++) {
          const mesKey = `${anio}-${i.toString().padStart(2, '0')}`;
          const cantidad = stats.porMes.get(mesKey) || 0;
          dataArray.push({
            mes: meses[i - 1],
            cantidad,
            costo: cantidad * insumo.precioUnitario
          });
        }
        tendenciasData.push({ nombre: insumo.nombre, data: dataArray });
      });

      setConsumoInsumos(consumoArray);
      setTendenciasTop(tendenciasData);
      setTotalConsumo(totalCantidad);
      setTotalCosto(totalCostoAcc);

    } catch (error) {
      console.error("Error fetching consumption data:", error);
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

  const getTendenciaIcon = (tendencia: string) => {
    switch (tendencia) {
      case 'subiendo':
        return <TrendingUp className="h-4 w-4 text-red-500" />;
      case 'bajando':
        return <TrendingDown className="h-4 w-4 text-green-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-500" />;
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
          <h1 className="text-2xl font-bold">Análisis de Consumo</h1>
          <p className="text-muted-foreground">Tendencias y patrones de uso de insumos</p>
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

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Unidades Consumidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalConsumo.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Costo Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(totalCosto)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Tipos de Insumos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{consumoInsumos.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfica Top 10 */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Insumos Más Consumidos</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={consumoInsumos.slice(0, 10)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis 
                dataKey="nombre" 
                type="category" 
                width={200} 
                fontSize={11}
                tickFormatter={(value) => value.length > 30 ? value.substring(0, 30) + '...' : value}
              />
              <Tooltip />
              <Bar dataKey="cantidadTotal" fill="hsl(var(--primary))" name="Cantidad" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tendencias Mensuales */}
      {tendenciasTop.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tendencia Mensual - Top 5 Insumos</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" allowDuplicatedCategory={false} />
                <YAxis />
                <Tooltip />
                {tendenciasTop.map((insumo, idx) => (
                  <Line
                    key={insumo.nombre}
                    data={insumo.data}
                    type="monotone"
                    dataKey="cantidad"
                    name={insumo.nombre.substring(0, 20)}
                    stroke={`hsl(${idx * 60}, 70%, 50%)`}
                    strokeWidth={2}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Tabla detallada */}
      <Card>
        <CardHeader>
          <CardTitle>Detalle de Consumo por Insumo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Insumo</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Precio Unit.</TableHead>
                  <TableHead className="text-right">Costo Total</TableHead>
                  <TableHead className="text-center">Tendencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consumoInsumos.slice(0, 50).map((insumo, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium max-w-[300px] truncate" title={insumo.nombre}>
                      {insumo.nombre}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{insumo.categoria}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{insumo.cantidadTotal.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{formatCurrency(insumo.precioUnitario)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(insumo.costoTotal)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {getTendenciaIcon(insumo.tendencia)}
                        {insumo.variacion !== 0 && (
                          <span className={`text-xs ${insumo.variacion > 0 ? 'text-red-500' : 'text-green-500'}`}>
                            {insumo.variacion > 0 ? '+' : ''}{insumo.variacion.toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </TableCell>
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

export default FinanzasConsumo;
