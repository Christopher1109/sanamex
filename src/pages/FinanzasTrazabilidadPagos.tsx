import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { Building2, Package, TrendingUp, DollarSign, Receipt, Percent } from "lucide-react";

interface Proveedor {
  id: string;
  nombre: string;
  categoria_productos: string | null;
}

interface PagoProveedor {
  proveedorId: string;
  proveedorNombre: string;
  categoria: string;
  totalPagado: number;
  totalImpuestos: number;
  totalRetenciones: number;
  ordenesCount: number;
}

interface InsumoComprado {
  insumoId: string;
  insumoNombre: string;
  clave: string;
  cantidadTotal: number;
  costoTotal: number;
  proveedores: string[];
}

interface GastoHospital {
  hospitalId: string;
  hospitalNombre: string;
  subtotal: number;
  impuestos: number;
  retenciones: number;
  total: number;
  ordenesCount: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

const FinanzasTrazabilidadPagos = () => {
  const [loading, setLoading] = useState(true);
  const [anio, setAnio] = useState(new Date().getFullYear().toString());
  const [mes, setMes] = useState((new Date().getMonth() + 1).toString());
  
  const [pagosProveedores, setPagosProveedores] = useState<PagoProveedor[]>([]);
  const [insumosComprados, setInsumosComprados] = useState<InsumoComprado[]>([]);
  const [gastosHospitales, setGastosHospitales] = useState<GastoHospital[]>([]);
  const [resumenMensual, setResumenMensual] = useState({
    subtotal: 0,
    impuestos: 0,
    retenciones: 0,
    total: 0
  });

  const anios = ["2024", "2025", "2026"];
  const meses = [
    { value: "1", label: "Enero" },
    { value: "2", label: "Febrero" },
    { value: "3", label: "Marzo" },
    { value: "4", label: "Abril" },
    { value: "5", label: "Mayo" },
    { value: "6", label: "Junio" },
    { value: "7", label: "Julio" },
    { value: "8", label: "Agosto" },
    { value: "9", label: "Septiembre" },
    { value: "10", label: "Octubre" },
    { value: "11", label: "Noviembre" },
    { value: "12", label: "Diciembre" },
  ];

  useEffect(() => {
    fetchData();
  }, [anio, mes]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const anioNum = parseInt(anio);
      const mesNum = parseInt(mes);
      const fechaInicio = `${anioNum}-${mes.padStart(2, '0')}-01`;
      const fechaFin = `${anioNum}-${mes.padStart(2, '0')}-31`;

      // Obtener órdenes de compra pagadas en el período
      const { data: ordenes, error: ordenesError } = await supabase
        .from("pedidos_compra")
        .select(`
          *,
          proveedor_rel:proveedores(id, nombre, categoria_productos),
          items:pedido_items(*, insumo:insumos_catalogo(id, nombre, clave)),
          impuestos:orden_compra_impuestos(*)
        `)
        .in("estado", ["pagado_espera_confirmacion", "recibido"])
        .gte("pagado_at", fechaInicio)
        .lte("pagado_at", fechaFin + "T23:59:59");

      if (ordenesError) {
        console.error("Error fetching orders:", ordenesError);
      }

      // Obtener proveedores
      const { data: proveedores } = await supabase
        .from("proveedores")
        .select("*");

      const proveedoresMap = new Map();
      proveedores?.forEach(p => proveedoresMap.set(p.id, p));

      // Procesar pagos por proveedor
      const pagosPorProveedor = new Map<string, PagoProveedor>();
      const insumosPorId = new Map<string, InsumoComprado>();
      
      let totalSubtotal = 0;
      let totalImpuestos = 0;
      let totalRetenciones = 0;

      (ordenes || []).forEach((orden: any) => {
        const subtotal = Number(orden.subtotal) || 0;
        const impuestos = Number(orden.total_impuestos) || 0;
        const retenciones = Number(orden.total_retenciones) || 0;
        const proveedorId = orden.proveedor_id;
        const proveedor = proveedoresMap.get(proveedorId);
        const proveedorNombre = proveedor?.nombre || orden.proveedor || "Sin proveedor";
        const categoria = proveedor?.categoria_productos || "General";

        totalSubtotal += subtotal;
        totalImpuestos += impuestos;
        totalRetenciones += retenciones;

        // Acumular por proveedor
        if (!pagosPorProveedor.has(proveedorNombre)) {
          pagosPorProveedor.set(proveedorNombre, {
            proveedorId: proveedorId || "",
            proveedorNombre,
            categoria,
            totalPagado: 0,
            totalImpuestos: 0,
            totalRetenciones: 0,
            ordenesCount: 0
          });
        }
        const pagoProveedor = pagosPorProveedor.get(proveedorNombre)!;
        pagoProveedor.totalPagado += subtotal + impuestos - retenciones;
        pagoProveedor.totalImpuestos += impuestos;
        pagoProveedor.totalRetenciones += retenciones;
        pagoProveedor.ordenesCount += 1;

        // Procesar items
        (orden.items || []).forEach((item: any) => {
          const insumoId = item.insumo_catalogo_id;
          const insumoNombre = item.insumo?.nombre || "Sin nombre";
          const clave = item.insumo?.clave || "N/A";
          const cantidad = item.cantidad_solicitada || 0;
          const precioUnit = item.precio_unitario || 0;

          if (!insumosPorId.has(insumoId)) {
            insumosPorId.set(insumoId, {
              insumoId,
              insumoNombre,
              clave,
              cantidadTotal: 0,
              costoTotal: 0,
              proveedores: []
            });
          }
          const insumo = insumosPorId.get(insumoId)!;
          insumo.cantidadTotal += cantidad;
          insumo.costoTotal += cantidad * precioUnit;
          if (proveedorNombre && !insumo.proveedores.includes(proveedorNombre)) {
            insumo.proveedores.push(proveedorNombre);
          }
        });
      });

      // Obtener gastos por hospital (basado en folios del período)
      const { data: folios } = await supabase
        .from("folios")
        .select("id, hospital_id, hospital_display_name")
        .gte("fecha", fechaInicio)
        .lte("fecha", fechaFin)
        .in("estado", ["completado", "cerrado"] as any[]);

      const { data: foliosCostos } = await supabase
        .from("folios_insumos_costos")
        .select("folio_id, costo_total");

      const folioHospitalMap = new Map();
      folios?.forEach(f => folioHospitalMap.set(f.id, { 
        hospitalId: f.hospital_id, 
        hospitalNombre: f.hospital_display_name 
      }));

      const gastosPorHospital = new Map<string, GastoHospital>();
      foliosCostos?.forEach((fc: any) => {
        const hospital = folioHospitalMap.get(fc.folio_id);
        if (!hospital) return;

        const hospitalId = hospital.hospitalId;
        const hospitalNombre = hospital.hospitalNombre || "Sin hospital";

        if (!gastosPorHospital.has(hospitalId)) {
          gastosPorHospital.set(hospitalId, {
            hospitalId,
            hospitalNombre,
            subtotal: 0,
            impuestos: 0,
            retenciones: 0,
            total: 0,
            ordenesCount: 0
          });
        }
        const gasto = gastosPorHospital.get(hospitalId)!;
        gasto.subtotal += Number(fc.costo_total) || 0;
        gasto.total += Number(fc.costo_total) || 0;
        gasto.ordenesCount += 1;
      });

      setPagosProveedores(Array.from(pagosPorProveedor.values()).sort((a, b) => b.totalPagado - a.totalPagado));
      setInsumosComprados(Array.from(insumosPorId.values()).sort((a, b) => b.costoTotal - a.costoTotal).slice(0, 20));
      setGastosHospitales(Array.from(gastosPorHospital.values()).sort((a, b) => b.total - a.total));
      setResumenMensual({
        subtotal: totalSubtotal,
        impuestos: totalImpuestos,
        retenciones: totalRetenciones,
        total: totalSubtotal + totalImpuestos - totalRetenciones
      });

    } catch (error) {
      console.error("Error fetching data:", error);
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
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Trazabilidad de Pagos</h1>
          <p className="text-muted-foreground">Análisis de pagos a proveedores, insumos y gastos por hospital</p>
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

      {/* Resumen mensual */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Subtotal</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(resumenMensual.subtotal)}</div>
            <p className="text-xs text-muted-foreground">{getMesLabel()} {anio}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Impuestos</CardTitle>
            <Percent className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{formatCurrency(resumenMensual.impuestos)}</div>
            <p className="text-xs text-muted-foreground">IVA y otros cargos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Retenciones</CardTitle>
            <Percent className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">-{formatCurrency(resumenMensual.retenciones)}</div>
            <p className="text-xs text-muted-foreground">ISR, IVA retenido</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pagado</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(resumenMensual.total)}</div>
            <p className="text-xs text-muted-foreground">Neto a proveedores</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="proveedores" className="space-y-4">
        <TabsList>
          <TabsTrigger value="proveedores">Por Proveedor</TabsTrigger>
          <TabsTrigger value="insumos">Insumos Más Comprados</TabsTrigger>
          <TabsTrigger value="hospitales">Por Hospital</TabsTrigger>
        </TabsList>

        {/* Proveedores */}
        <TabsContent value="proveedores" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Pagos por Proveedor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={pagosProveedores.slice(0, 5)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="proveedorNombre" width={150} tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="totalPagado" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Distribución por Categoría</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pagosProveedores.slice(0, 5)}
                      dataKey="totalPagado"
                      nameKey="categoria"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {pagosProveedores.slice(0, 5).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Detalle de Pagos a Proveedores</CardTitle>
            </CardHeader>
            <CardContent>
              {pagosProveedores.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No hay pagos registrados en este período</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead className="text-right">Órdenes</TableHead>
                      <TableHead className="text-right">Impuestos</TableHead>
                      <TableHead className="text-right">Retenciones</TableHead>
                      <TableHead className="text-right">Total Pagado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagosProveedores.map((p) => (
                      <TableRow key={p.proveedorNombre}>
                        <TableCell className="font-medium">{p.proveedorNombre}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{p.categoria}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{p.ordenesCount}</TableCell>
                        <TableCell className="text-right text-amber-600">{formatCurrency(p.totalImpuestos)}</TableCell>
                        <TableCell className="text-right text-blue-600">-{formatCurrency(p.totalRetenciones)}</TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(p.totalPagado)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insumos más comprados */}
        <TabsContent value="insumos" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Top 20 Insumos Más Comprados
              </CardTitle>
            </CardHeader>
            <CardContent>
              {insumosComprados.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No hay compras registradas en este período</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clave</TableHead>
                      <TableHead>Insumo</TableHead>
                      <TableHead className="text-right">Cantidad</TableHead>
                      <TableHead className="text-right">Costo Total</TableHead>
                      <TableHead>Proveedores</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {insumosComprados.map((i, idx) => (
                      <TableRow key={i.insumoId}>
                        <TableCell className="font-mono text-sm">{i.clave}</TableCell>
                        <TableCell className="font-medium">{i.insumoNombre}</TableCell>
                        <TableCell className="text-right font-mono">{i.cantidadTotal.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(i.costoTotal)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {i.proveedores.slice(0, 2).map((p, pi) => (
                              <Badge key={pi} variant="secondary" className="text-xs">{p}</Badge>
                            ))}
                            {i.proveedores.length > 2 && (
                              <Badge variant="outline" className="text-xs">+{i.proveedores.length - 2}</Badge>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Por Hospital */}
        <TabsContent value="hospitales" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Gastos por Hospital
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={gastosHospitales.slice(0, 10)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hospitalNombre" tick={{ fontSize: 10 }} angle={-45} textAnchor="end" height={100} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detalle de Consumo por Hospital</CardTitle>
            </CardHeader>
            <CardContent>
              {gastosHospitales.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">No hay gastos registrados en este período</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hospital</TableHead>
                      <TableHead className="text-right">Folios</TableHead>
                      <TableHead className="text-right">Subtotal</TableHead>
                      <TableHead className="text-right">Impuestos</TableHead>
                      <TableHead className="text-right">Retenciones</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gastosHospitales.map((g) => (
                      <TableRow key={g.hospitalId}>
                        <TableCell className="font-medium">{g.hospitalNombre}</TableCell>
                        <TableCell className="text-right">{g.ordenesCount}</TableCell>
                        <TableCell className="text-right">{formatCurrency(g.subtotal)}</TableCell>
                        <TableCell className="text-right text-amber-600">{formatCurrency(g.impuestos)}</TableCell>
                        <TableCell className="text-right text-blue-600">-{formatCurrency(g.retenciones)}</TableCell>
                        <TableCell className="text-right font-bold">{formatCurrency(g.total)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default FinanzasTrazabilidadPagos;
