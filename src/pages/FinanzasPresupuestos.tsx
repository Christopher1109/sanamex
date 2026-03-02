import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, AlertCircle, CheckCircle, AlertTriangle, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

interface Hospital {
  id: string;
  display_name: string;
  budget_code: string;
}

interface PresupuestoAnual {
  hospitalId: string;
  hospitalNombre: string;
  limiteAnual: number;
  consumidoAnual: number;
  disponibleAnual: number;
  porcentajeAnual: number;
  datosMensuales: DatoMensual[];
  necesitaExtension: boolean;
}

interface DatoMensual {
  mes: number;
  mesNombre: string;
  consumido: number;
  acumulado: number;
}

const FinanzasPresupuestos = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [anio, setAnio] = useState(new Date().getFullYear().toString());
  const [hospitales, setHospitales] = useState<Hospital[]>([]);
  const [presupuestosAnuales, setPresupuestosAnuales] = useState<PresupuestoAnual[]>([]);
  const [limitesAnuales, setLimitesAnuales] = useState<Map<string, number>>(new Map());
  const [selectedHospital, setSelectedHospital] = useState<string>("all");

  const anios = ["2024", "2025", "2026"];
  const meses = [
    { value: 1, label: "Ene" },
    { value: 2, label: "Feb" },
    { value: 3, label: "Mar" },
    { value: 4, label: "Abr" },
    { value: 5, label: "May" },
    { value: 6, label: "Jun" },
    { value: 7, label: "Jul" },
    { value: 8, label: "Ago" },
    { value: 9, label: "Sep" },
    { value: 10, label: "Oct" },
    { value: 11, label: "Nov" },
    { value: 12, label: "Dic" },
  ];

  useEffect(() => {
    fetchHospitales();
  }, []);

  useEffect(() => {
    if (hospitales.length > 0) {
      fetchPresupuestos();
    }
  }, [anio, hospitales]);

  const fetchHospitales = async () => {
    const { data, error } = await supabase
      .from("hospitales")
      .select("id, display_name, budget_code")
      .order("display_name");
    
    if (!error && data) {
      setHospitales(data);
    }
  };

  const fetchPresupuestos = async () => {
    try {
      setLoading(true);
      const anioNum = parseInt(anio);

      // Queries paralelas para optimizar velocidad
      const [presupuestosRes, foliosRes, tarifasRes] = await Promise.all([
        supabase.from("presupuestos_hospital").select("*").eq("anio", anioNum),
        supabase
          .from("folios")
          .select("id, hospital_id, tipo_anestesia, fecha")
          .gte("fecha", `${anioNum}-01-01`)
          .lte("fecha", `${anioNum}-12-31`)
          .in("estado", ["activo", "completado"] as any[]),
        supabase
          .from("tarifas_procedimientos")
          .select("hospital_id, procedimiento_clave, tarifa_facturacion")
          .eq("activo", true),
      ]);

      if (presupuestosRes.error) throw presupuestosRes.error;
      if (foliosRes.error) throw foliosRes.error;
      if (tarifasRes.error) throw tarifasRes.error;

      // Mapa de límites anuales
      const limitesMap = new Map<string, number>();
      presupuestosRes.data?.forEach(p => {
        if (p.limite_anual && Number(p.limite_anual) > 0) {
          limitesMap.set(p.hospital_id, Number(p.limite_anual));
        }
      });
      setLimitesAnuales(limitesMap);

      // Mapa de tarifas por hospital y procedimiento
      const tarifasMap = new Map<string, number>();
      tarifasRes.data?.forEach((t: any) => {
        tarifasMap.set(`${t.hospital_id}-${t.procedimiento_clave}`, Number(t.tarifa_facturacion) || 0);
      });

      // Agrupar folios por hospital y mes
      const foliosPorHospitalMes = new Map<string, number>();
      foliosRes.data?.forEach(f => {
        if (!f.hospital_id || !f.fecha) return;
        const mes = parseInt(f.fecha.split('-')[1]);
        const key = `${f.hospital_id}-${mes}`;
        const tarifa = tarifasMap.get(`${f.hospital_id}-${f.tipo_anestesia}`) || 0;
        foliosPorHospitalMes.set(key, (foliosPorHospitalMes.get(key) || 0) + tarifa);
      });

      // Construir datos para cada hospital
      const presupuestosArray: PresupuestoAnual[] = hospitales.map(hospital => {
        const datosMensuales: DatoMensual[] = [];
        let consumidoAnual = 0;

        for (let mes = 1; mes <= 12; mes++) {
          const consumidoMes = foliosPorHospitalMes.get(`${hospital.id}-${mes}`) || 0;
          consumidoAnual += consumidoMes;
          datosMensuales.push({
            mes,
            mesNombre: meses.find(m => m.value === mes)?.label || "",
            consumido: consumidoMes,
            acumulado: consumidoAnual
          });
        }

        const limiteAnual = limitesMap.get(hospital.id) || 0;
        const porcentaje = limiteAnual > 0 ? (consumidoAnual / limiteAnual) * 100 : 0;

        return {
          hospitalId: hospital.id,
          hospitalNombre: hospital.display_name || hospital.budget_code,
          limiteAnual,
          consumidoAnual,
          disponibleAnual: limiteAnual - consumidoAnual,
          porcentajeAnual: porcentaje,
          datosMensuales,
          necesitaExtension: porcentaje > 80
        };
      });

      setPresupuestosAnuales(presupuestosArray);

    } catch (error) {
      console.error("Error fetching presupuestos:", error);
      toast.error("Error al cargar presupuestos");
    } finally {
      setLoading(false);
    }
  };

  const handleLimiteChange = (hospitalId: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    const newLimites = new Map(limitesAnuales);
    newLimites.set(hospitalId, numValue);
    setLimitesAnuales(newLimites);
  };

  const guardarLimites = async () => {
    try {
      setSaving(true);
      const anioNum = parseInt(anio);

      // Guardar límites anuales
      for (const [hospitalId, limite] of limitesAnuales.entries()) {
        // Verificar si existe
        const { data: existing } = await supabase
          .from("presupuestos_hospital")
          .select("id")
          .eq("hospital_id", hospitalId)
          .eq("anio", anioNum)
          .eq("mes", 1) // Usamos mes 1 como referencia
          .maybeSingle();

        if (existing) {
          await supabase
            .from("presupuestos_hospital")
            .update({ limite_anual: limite })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("presupuestos_hospital")
            .insert({
              hospital_id: hospitalId,
              anio: anioNum,
              mes: 1,
              presupuesto_asignado: 0,
              limite_anual: limite
            });
        }
      }

      toast.success("Límites anuales guardados correctamente");
      fetchPresupuestos();

    } catch (error) {
      console.error("Error saving limites:", error);
      toast.error("Error al guardar límites");
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0
    }).format(value);
  };

  const getEstadoBadge = (p: PresupuestoAnual) => {
    if (p.limiteAnual === 0) {
      return <Badge variant="outline">Sin límite</Badge>;
    }
    if (p.porcentajeAnual > 100) {
      return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Excedido</Badge>;
    }
    if (p.porcentajeAnual > 80) {
      return <Badge className="bg-yellow-500 gap-1"><AlertTriangle className="h-3 w-3" /> Requiere extensión</Badge>;
    }
    return <Badge variant="secondary" className="gap-1 bg-green-100 text-green-800"><CheckCircle className="h-3 w-3" /> OK</Badge>;
  };

  // Calcular totales
  const totalLimite = presupuestosAnuales.reduce((sum, p) => sum + p.limiteAnual, 0);
  const totalConsumido = presupuestosAnuales.reduce((sum, p) => sum + p.consumidoAnual, 0);
  const hospitalesEnAlerta = presupuestosAnuales.filter(p => p.necesitaExtension).length;

  // Datos para gráfica del hospital seleccionado
  const hospitalSeleccionado = selectedHospital !== "all" 
    ? presupuestosAnuales.find(p => p.hospitalId === selectedHospital)
    : null;

  const datosGrafica = hospitalSeleccionado
    ? hospitalSeleccionado.datosMensuales.map(d => ({
        mes: d.mesNombre,
        consumido: d.consumido,
        acumulado: d.acumulado,
        limite: hospitalSeleccionado.limiteAnual
      }))
    : presupuestosAnuales.length > 0
    ? meses.map((m, i) => ({
        mes: m.label,
        consumido: presupuestosAnuales.reduce((sum, p) => sum + (p.datosMensuales[i]?.consumido || 0), 0),
        acumulado: presupuestosAnuales.reduce((sum, p) => sum + (p.datosMensuales[i]?.acumulado || 0), 0),
        limite: totalLimite
      }))
    : [];

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
          <h1 className="text-2xl font-bold">Límites de Contrato por Hospital</h1>
          <p className="text-muted-foreground">Monitorea el consumo anual vs. límite máximo de contrato</p>
        </div>
        <div className="flex gap-4">
          <Select value={anio} onValueChange={setAnio}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anios.map(a => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={guardarLimites} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Guardando...' : 'Guardar Límites'}
          </Button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Límite Total Contratos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(totalLimite)}</div>
            <p className="text-xs text-muted-foreground">Año {anio}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Consumido</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalConsumido)}</div>
            <p className="text-xs text-muted-foreground">
              {totalLimite > 0 ? ((totalConsumido / totalLimite) * 100).toFixed(1) : 0}% del límite
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Disponible</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${totalLimite - totalConsumido >= 0 ? 'text-green-600' : 'text-destructive'}`}>
              {formatCurrency(totalLimite - totalConsumido)}
            </div>
            <p className="text-xs text-muted-foreground">Restante</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Requieren Extensión</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${hospitalesEnAlerta > 0 ? 'text-destructive' : 'text-green-600'}`}>
              {hospitalesEnAlerta}
            </div>
            <p className="text-xs text-muted-foreground">Hospitales &gt;80%</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfica de progreso mensual */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Progreso Mensual {anio}
            </CardTitle>
            <Select value={selectedHospital} onValueChange={setSelectedHospital}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Todos los hospitales" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los hospitales</SelectItem>
                {presupuestosAnuales.map(p => (
                  <SelectItem key={p.hospitalId} value={p.hospitalId}>
                    {p.hospitalNombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={datosGrafica}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes" />
              <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip 
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name === "consumido" ? "Consumo mes" : name === "acumulado" ? "Acumulado" : "Límite"
                ]}
              />
              <Legend />
              <Bar dataKey="consumido" fill="hsl(var(--primary))" name="Consumo mes" radius={[4, 4, 0, 0]} />
              <Bar dataKey="acumulado" fill="hsl(var(--chart-2))" name="Acumulado" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tabla de hospitales */}
      <Card>
        <CardHeader>
          <CardTitle>Límites por Hospital - {anio}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[280px]">Hospital</TableHead>
                  <TableHead className="w-[180px]">Límite Anual Contrato</TableHead>
                  <TableHead className="text-right">Consumido</TableHead>
                  <TableHead className="text-right">Disponible</TableHead>
                  <TableHead className="w-[200px]">Avance</TableHead>
                  <TableHead className="text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {presupuestosAnuales.map((p) => (
                  <TableRow key={p.hospitalId}>
                    <TableCell className="font-medium">{p.hospitalNombre}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        value={limitesAnuales.get(p.hospitalId) || ''}
                        onChange={(e) => handleLimiteChange(p.hospitalId, e.target.value)}
                        placeholder="0"
                        className="w-full"
                      />
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(p.consumidoAnual)}
                    </TableCell>
                    <TableCell className={`text-right font-semibold ${p.disponibleAnual >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      {formatCurrency(p.disponibleAnual)}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Progress 
                          value={Math.min(p.porcentajeAnual, 100)} 
                          className={`h-2 ${p.porcentajeAnual > 100 ? '[&>div]:bg-destructive' : p.porcentajeAnual > 80 ? '[&>div]:bg-yellow-500' : ''}`}
                        />
                        <span className="text-xs text-muted-foreground">
                          {p.porcentajeAnual.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {getEstadoBadge(p)}
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

export default FinanzasPresupuestos;
