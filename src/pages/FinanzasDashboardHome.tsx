import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  Clock, 
  CheckCircle, 
  AlertTriangle,
  Building2,
  FileText,
  CreditCard,
  RefreshCw,
  ChevronRight,
  PieChart,
  BarChart3
} from 'lucide-react';

interface FinanzasStats {
  ordenesPendientes: number;
  totalPorPagar: number;
  ordenesEnEspera: number;
  foliosCompletadosMes: number;
  totalFacturadoMes: number;
  totalCostosMes: number;
  margenMes: number;
  hospitalesConPresupuestoAlto: number;
}

interface HospitalPresupuesto {
  id: string;
  nombre: string;
  limite: number;
  consumido: number;
  porcentaje: number;
}

const FinanzasDashboardHome = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<FinanzasStats>({
    ordenesPendientes: 0,
    totalPorPagar: 0,
    ordenesEnEspera: 0,
    foliosCompletadosMes: 0,
    totalFacturadoMes: 0,
    totalCostosMes: 0,
    margenMes: 0,
    hospitalesConPresupuestoAlto: 0
  });
  const [hospitalesAlerta, setHospitalesAlerta] = useState<HospitalPresupuesto[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const anio = new Date().getFullYear();
      const mes = new Date().getMonth() + 1;
      const fechaInicioMes = `${anio}-${String(mes).padStart(2, '0')}-01`;
      const fechaFinMes = `${anio}-${String(mes).padStart(2, '0')}-31`;

      // Fetch en paralelo
      const [ordenesRes, foliosRes, tarifasRes, presupuestosRes, hospitalesRes] = await Promise.all([
        supabase
          .from('pedidos_compra')
          .select('id, estado, total, subtotal')
          .in('estado', ['enviado_a_finanzas', 'pagado_espera_confirmacion']),
        supabase
          .from('folios')
          .select('id, hospital_id, tipo_anestesia, fecha')
          .gte('fecha', fechaInicioMes)
          .lte('fecha', fechaFinMes)
          .in('estado', ['activo', 'completado'] as any[]),
        supabase
          .from('tarifas_procedimientos')
          .select('hospital_id, procedimiento_clave, tarifa_facturacion')
          .eq('activo', true),
        supabase
          .from('presupuestos_hospital')
          .select('hospital_id, limite_anual')
          .eq('anio', anio),
        supabase
          .from('hospitales')
          .select('id, display_name, budget_code')
      ]);

      // Calcular órdenes pendientes
      const ordenesPendientes = ordenesRes.data?.filter(o => o.estado === 'enviado_a_finanzas') || [];
      const ordenesEnEspera = ordenesRes.data?.filter(o => o.estado === 'pagado_espera_confirmacion') || [];
      const totalPorPagar = ordenesPendientes.reduce((sum, o) => sum + (o.total || o.subtotal || 0), 0);

      // Crear mapa de tarifas
      const tarifasMap = new Map<string, number>();
      tarifasRes.data?.forEach(t => {
        tarifasMap.set(`${t.hospital_id}-${t.procedimiento_clave}`, Number(t.tarifa_facturacion) || 0);
      });

      // Calcular facturación del mes por folios
      let totalFacturado = 0;
      const consumoPorHospital = new Map<string, number>();
      
      foliosRes.data?.forEach(f => {
        if (!f.hospital_id) return;
        const tarifa = tarifasMap.get(`${f.hospital_id}-${f.tipo_anestesia}`) || 0;
        totalFacturado += tarifa;
        
        consumoPorHospital.set(
          f.hospital_id, 
          (consumoPorHospital.get(f.hospital_id) || 0) + tarifa
        );
      });

      // Calcular límites y hospitales en alerta
      const limitesMap = new Map<string, number>();
      presupuestosRes.data?.forEach(p => {
        if (p.limite_anual && Number(p.limite_anual) > 0) {
          limitesMap.set(p.hospital_id, Number(p.limite_anual));
        }
      });

      const hospitalesEnAlerta: HospitalPresupuesto[] = [];
      let countAlerta = 0;

      hospitalesRes.data?.forEach(h => {
        const limite = limitesMap.get(h.id) || 0;
        const consumido = consumoPorHospital.get(h.id) || 0;
        
        if (limite > 0) {
          const porcentaje = (consumido / limite) * 100;
          if (porcentaje >= 70) {
            countAlerta++;
            hospitalesEnAlerta.push({
              id: h.id,
              nombre: h.display_name || h.budget_code || 'Hospital',
              limite,
              consumido,
              porcentaje
            });
          }
        }
      });

      // Ordenar hospitales por porcentaje descendente
      hospitalesEnAlerta.sort((a, b) => b.porcentaje - a.porcentaje);

      setStats({
        ordenesPendientes: ordenesPendientes.length,
        totalPorPagar,
        ordenesEnEspera: ordenesEnEspera.length,
        foliosCompletadosMes: foliosRes.data?.length || 0,
        totalFacturadoMes: totalFacturado,
        totalCostosMes: 0, // Se podría calcular con precios_insumos si es necesario
        margenMes: totalFacturado, // Simplificado por ahora
        hospitalesConPresupuestoAlto: countAlerta
      });

      setHospitalesAlerta(hospitalesEnAlerta.slice(0, 5));

    } catch (error) {
      console.error('Error fetching finanzas data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const quickActions = [
    { path: '/finanzas', icon: CreditCard, label: 'Pagos Pendientes', description: 'Aprobar y pagar órdenes', colorClass: 'bg-destructive/10 hover:bg-destructive/20 text-destructive', count: stats.ordenesPendientes },
    { path: '/finanzas-presupuestos', icon: PieChart, label: 'Presupuestos', description: 'Límites por hospital', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/finanzas-reportes', icon: BarChart3, label: 'Reportes de Costos', description: 'Análisis por hospital', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/rentabilidad', icon: TrendingUp, label: 'Rentabilidad', description: 'Margen por procedimiento', colorClass: 'bg-success/10 hover:bg-success/20 text-success' },
    { path: '/configuracion-tarifas', icon: DollarSign, label: 'Tarifas', description: 'Por procedimiento', colorClass: 'bg-warning/10 hover:bg-warning/20 text-warning' },
    { path: '/registro-actividad', icon: Clock, label: 'Actividad', description: 'Ver historial', colorClass: 'bg-muted hover:bg-muted/80 text-muted-foreground' },
  ];

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-10 bg-muted rounded w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-muted rounded" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Panel de Finanzas</h1>
          <p className="text-muted-foreground">Resumen financiero y acciones rápidas</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-destructive">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Órdenes Pendientes</CardTitle>
            <Clock className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.ordenesPendientes}</div>
            <p className="text-xs text-muted-foreground">Por pagar</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-warning">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Por Pagar</CardTitle>
            <DollarSign className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalPorPagar)}</div>
            <p className="text-xs text-muted-foreground">En órdenes pendientes</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Facturado Este Mes</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(stats.totalFacturadoMes)}</div>
            <p className="text-xs text-muted-foreground">{stats.foliosCompletadosMes} folios</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hospitales en Alerta</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats.hospitalesConPresupuestoAlto}</div>
            <p className="text-xs text-muted-foreground">&gt;70% del presupuesto</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Hospitales con presupuesto alto */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Hospitales con Alto Consumo
            </CardTitle>
            <Link to="/finanzas-presupuestos">
              <Button variant="ghost" size="sm">
                Ver todos <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {hospitalesAlerta.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-2" />
                <p>Todos los hospitales dentro del presupuesto</p>
              </div>
            ) : (
              <div className="space-y-4">
                {hospitalesAlerta.map((h) => (
                  <div key={h.id} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-sm truncate max-w-[200px]">{h.nombre}</span>
                      <Badge 
                        variant={h.porcentaje > 100 ? 'destructive' : h.porcentaje > 80 ? 'default' : 'secondary'}
                        className={h.porcentaje > 80 && h.porcentaje <= 100 ? 'bg-amber-100 text-amber-800' : ''}
                      >
                        {h.porcentaje.toFixed(0)}%
                      </Badge>
                    </div>
                    <Progress 
                      value={Math.min(h.porcentaje, 100)} 
                      className={`h-2 ${h.porcentaje > 100 ? '[&>div]:bg-destructive' : h.porcentaje > 80 ? '[&>div]:bg-amber-500' : ''}`}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Consumido: {formatCurrency(h.consumido)}</span>
                      <span>Límite: {formatCurrency(h.limite)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Acciones Rápidas */}
        <Card>
          <CardHeader>
            <CardTitle>Acciones Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 grid-cols-2">
              {quickActions.map((action) => (
                <Link 
                  key={action.path}
                  to={action.path} 
                  className={`rounded-lg border p-4 transition-colors flex flex-col items-center text-center relative ${action.colorClass}`}
                >
                  {action.count !== undefined && action.count > 0 && (
                    <Badge variant="destructive" className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 flex items-center justify-center">
                      {action.count}
                    </Badge>
                  )}
                  <action.icon className="h-6 w-6 mb-2" />
                  <h4 className="font-semibold text-sm">{action.label}</h4>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Resumen adicional */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Folios del Mes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.foliosCompletadosMes}</div>
            <p className="text-xs text-muted-foreground">Procedimientos registrados</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              En Espera de Recepción
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-600">{stats.ordenesEnEspera}</div>
            <p className="text-xs text-muted-foreground">Órdenes pagadas pendientes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Estado General
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.ordenesPendientes === 0 ? (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-500" />
                <span className="text-green-600 font-medium">Sin pendientes</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
                <span className="text-amber-600 font-medium">Órdenes por revisar</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FinanzasDashboardHome;
