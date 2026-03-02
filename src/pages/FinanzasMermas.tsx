import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { AlertTriangle, DollarSign, Package, TrendingDown } from "lucide-react";

interface MermaResumen {
  insumoId: string;
  nombre: string;
  cantidadMerma: number;
  valorPerdido: number;
  incidentes: number;
}

interface MermaDetalle {
  id: string;
  fecha: string;
  insumo: string;
  cantidadEnviada: number;
  cantidadMerma: number;
  motivo: string;
  valorPerdido: number;
}

const COLORS = ['hsl(var(--destructive))', '#F59E0B', '#EF4444', '#DC2626', '#B91C1C'];

const FinanzasMermas = () => {
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState<string>("");
  const [resumenMermas, setResumenMermas] = useState<MermaResumen[]>([]);
  const [detalleMermas, setDetalleMermas] = useState<MermaDetalle[]>([]);
  const [kpis, setKpis] = useState({
    totalMermas: 0,
    valorTotal: 0,
    incidentesTotales: 0,
    porcentajeMerma: 0
  });

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
  }, []);

  useEffect(() => {
    if (mes) {
      fetchMermasData();
    }
  }, [mes]);

  const fetchMermasData = async () => {
    try {
      setLoading(true);
      const anio = new Date().getFullYear();
      const fechaInicio = `${anio}-${mes}-01`;
      const fechaFin = `${anio}-${mes}-31`;

      // Obtener mermas
      const { data: mermas } = await supabase
        .from("mermas_transferencia")
        .select(`
          id,
          cantidad_enviada,
          cantidad_merma,
          cantidad_recibida,
          motivo,
          created_at,
          insumo_catalogo_id
        `)
        .gte("created_at", fechaInicio)
        .lte("created_at", fechaFin);

      // Obtener catálogo de insumos
      const { data: catalogo } = await supabase
        .from("insumos_catalogo")
        .select("id, nombre");

      // Obtener precios
      const { data: precios } = await supabase
        .from("precios_insumos")
        .select("insumo_catalogo_id, precio_unitario")
        .eq("activo", true);

      // Crear mapas
      const catalogoMap = new Map();
      catalogo?.forEach(c => catalogoMap.set(c.id, c.nombre));

      const preciosMap = new Map();
      precios?.forEach(p => preciosMap.set(p.insumo_catalogo_id, p.precio_unitario));

      // Calcular resumen por insumo
      const resumenMap = new Map<string, MermaResumen>();
      let totalMermas = 0;
      let valorTotal = 0;
      let totalEnviado = 0;

      const detalleArray: MermaDetalle[] = [];

      mermas?.forEach(merma => {
        const insumoId = merma.insumo_catalogo_id;
        const nombre = catalogoMap.get(insumoId) || 'Insumo desconocido';
        const precio = preciosMap.get(insumoId) || 0;
        const valorPerdido = merma.cantidad_merma * precio;

        totalMermas += merma.cantidad_merma;
        valorTotal += valorPerdido;
        totalEnviado += merma.cantidad_enviada;

        // Agregar a resumen
        if (!resumenMap.has(insumoId)) {
          resumenMap.set(insumoId, {
            insumoId,
            nombre,
            cantidadMerma: 0,
            valorPerdido: 0,
            incidentes: 0
          });
        }
        const resumen = resumenMap.get(insumoId)!;
        resumen.cantidadMerma += merma.cantidad_merma;
        resumen.valorPerdido += valorPerdido;
        resumen.incidentes++;

        // Agregar a detalle
        detalleArray.push({
          id: merma.id,
          fecha: new Date(merma.created_at || '').toLocaleDateString('es-MX'),
          insumo: nombre,
          cantidadEnviada: merma.cantidad_enviada,
          cantidadMerma: merma.cantidad_merma,
          motivo: merma.motivo || 'Sin especificar',
          valorPerdido
        });
      });

      const resumenArray = Array.from(resumenMap.values());
      resumenArray.sort((a, b) => b.valorPerdido - a.valorPerdido);

      setResumenMermas(resumenArray);
      setDetalleMermas(detalleArray.sort((a, b) => b.valorPerdido - a.valorPerdido));
      setKpis({
        totalMermas,
        valorTotal,
        incidentesTotales: mermas?.length || 0,
        porcentajeMerma: totalEnviado > 0 ? (totalMermas / totalEnviado) * 100 : 0
      });

    } catch (error) {
      console.error("Error fetching mermas data:", error);
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
          <h1 className="text-2xl font-bold">Análisis de Mermas</h1>
          <p className="text-muted-foreground">Pérdidas y desperdicios en transferencias</p>
        </div>
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

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total Perdido</CardTitle>
            <DollarSign className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatCurrency(kpis.valorTotal)}</div>
            <p className="text-xs text-muted-foreground">{getMesLabel()}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unidades Perdidas</CardTitle>
            <Package className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.totalMermas.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Insumos afectados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Incidentes</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.incidentesTotales}</div>
            <p className="text-xs text-muted-foreground">Reportes de merma</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">% de Merma</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{kpis.porcentajeMerma.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground">Del total enviado</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart - Top Insumos */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Insumos con Mayor Pérdida</CardTitle>
          </CardHeader>
          <CardContent>
            {resumenMermas.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No hay mermas registradas en este período
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={resumenMermas.slice(0, 10)} layout="vertical">
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
                  <Bar dataKey="valorPerdido" fill="hsl(var(--destructive))" name="Valor Perdido" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart - Distribución */}
        <Card>
          <CardHeader>
            <CardTitle>Distribución de Pérdidas</CardTitle>
          </CardHeader>
          <CardContent>
            {resumenMermas.length === 0 ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No hay datos para mostrar
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={resumenMermas.slice(0, 5)}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ nombre, percent }) => `${nombre.substring(0, 15)}...: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="valorPerdido"
                    nameKey="nombre"
                  >
                    {resumenMermas.slice(0, 5).map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabla detalle */}
      <Card>
        <CardHeader>
          <CardTitle>Detalle de Mermas - {getMesLabel()}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Insumo</TableHead>
                  <TableHead className="text-right">Enviado</TableHead>
                  <TableHead className="text-right">Merma</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Valor Perdido</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detalleMermas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No hay mermas registradas en este período
                    </TableCell>
                  </TableRow>
                ) : (
                  detalleMermas.map((merma) => (
                    <TableRow key={merma.id}>
                      <TableCell>{merma.fecha}</TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate" title={merma.insumo}>
                        {merma.insumo}
                      </TableCell>
                      <TableCell className="text-right">{merma.cantidadEnviada}</TableCell>
                      <TableCell className="text-right text-destructive font-semibold">
                        -{merma.cantidadMerma}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{merma.motivo}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-destructive font-bold">
                        {formatCurrency(merma.valorPerdido)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FinanzasMermas;
