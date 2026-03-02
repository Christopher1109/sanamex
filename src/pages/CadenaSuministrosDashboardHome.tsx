import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { 
  Truck, 
  Package,
  Building2,
  Clock,
  CheckCircle,
  RefreshCw,
  ChevronRight,
  FileText,
  Warehouse,
  Send,
  MapPin,
  AlertTriangle
} from 'lucide-react';

interface CadenaStats {
  documentosPendientes: number;
  hospitalesConNecesidades: number;
  transferenciasEnviadas: number;
  transferenciasHoy: number;
  ordenesParaRecibir: number;
  stockDisponible: number;
}

interface HospitalNecesidad {
  id: string;
  nombre: string;
  insumosRequeridos: number;
  unidadesFaltantes: number;
}

const CadenaSuministrosDashboardHome = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CadenaStats>({
    documentosPendientes: 0,
    hospitalesConNecesidades: 0,
    transferenciasEnviadas: 0,
    transferenciasHoy: 0,
    ordenesParaRecibir: 0,
    stockDisponible: 0
  });
  const [hospitalesNecesidad, setHospitalesNecesidad] = useState<HospitalNecesidad[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const hoy = new Date().toISOString().split('T')[0];

      // Fetch en paralelo
      const [docsRes, transRes, ordenesRes, almacenRes] = await Promise.all([
        supabase
          .from('documentos_necesidades_segmentado')
          .select(`
            id,
            estado,
            procesado_por_cadena,
            detalles:documento_segmentado_detalle(
              id,
              hospital_id,
              faltante_requerido,
              hospital:hospitales(id, display_name, nombre)
            )
          `)
          .eq('enviado_a_cadena_suministros', true)
          .eq('procesado_por_cadena', false)
          .order('fecha_generacion', { ascending: false })
          .limit(5),
        supabase
          .from('transferencias_central_hospital')
          .select('id, fecha, cantidad_enviada, estado'),
        supabase
          .from('pedidos_compra')
          .select('id')
          .eq('estado', 'pagado_espera_confirmacion'),
        supabase
          .from('almacen_central')
          .select('id, cantidad_disponible')
      ]);

      // Procesar documentos y hospitales
      const hospitalesMap = new Map<string, HospitalNecesidad>();
      let totalDocs = 0;

      (docsRes.data || []).forEach(doc => {
        totalDocs++;
        ((doc.detalles as any[]) || []).forEach(det => {
          const hospitalId = det.hospital_id;
          const hospitalNombre = det.hospital?.display_name || det.hospital?.nombre || 'Hospital';
          const faltante = det.faltante_requerido || 0;

          if (hospitalesMap.has(hospitalId)) {
            const existing = hospitalesMap.get(hospitalId)!;
            existing.insumosRequeridos++;
            existing.unidadesFaltantes += faltante;
          } else {
            hospitalesMap.set(hospitalId, {
              id: hospitalId,
              nombre: hospitalNombre,
              insumosRequeridos: 1,
              unidadesFaltantes: faltante
            });
          }
        });
      });

      // Procesar transferencias
      const transferencias = transRes.data || [];
      const transferenciasHoy = transferencias.filter(t => 
        t.fecha && t.fecha.startsWith(hoy)
      );

      // Procesar almacén
      const almacenData = almacenRes.data || [];
      const stockTotal = almacenData.reduce((sum, item) => sum + (item.cantidad_disponible || 0), 0);

      setStats({
        documentosPendientes: totalDocs,
        hospitalesConNecesidades: hospitalesMap.size,
        transferenciasEnviadas: transferencias.length,
        transferenciasHoy: transferenciasHoy.length,
        ordenesParaRecibir: ordenesRes.data?.length || 0,
        stockDisponible: stockTotal
      });

      // Ordenar hospitales por unidades faltantes
      const sortedHospitales = Array.from(hospitalesMap.values())
        .sort((a, b) => b.unidadesFaltantes - a.unidadesFaltantes)
        .slice(0, 5);

      setHospitalesNecesidad(sortedHospitales);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    { path: '/distribucion', icon: Send, label: 'Enviar a Hospitales', description: 'Ejecutar transferencias', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/rutas-distribucion', icon: MapPin, label: 'Rutas de Distribución', description: 'Configurar rutas', colorClass: 'bg-success/10 hover:bg-success/20 text-success' },
    { path: '/distribucion', icon: Building2, label: 'Necesidades por Hospital', description: 'Ver requerimientos', colorClass: 'bg-destructive/10 hover:bg-destructive/20 text-destructive', count: stats.hospitalesConNecesidades },
    { path: '/distribucion', icon: Truck, label: 'Transferencias', description: 'Historial de envíos', colorClass: 'bg-warning/10 hover:bg-warning/20 text-warning' },
    { path: '/almacen-central', icon: Warehouse, label: 'Almacén Central', description: 'Ver stock disponible', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
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
          <h1 className="text-3xl font-bold text-foreground">Panel de Cadena de Suministros</h1>
          <p className="text-muted-foreground">Distribución y transferencias a hospitales</p>
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
            <CardTitle className="text-sm font-medium">Hospitales con Necesidades</CardTitle>
            <Building2 className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.hospitalesConNecesidades}</div>
            <p className="text-xs text-muted-foreground">Requieren insumos</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-warning">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Órdenes por Recibir</CardTitle>
            <Package className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.ordenesParaRecibir}</div>
            <p className="text-xs text-muted-foreground">De proveedor</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transferencias Hoy</CardTitle>
            <Truck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.transferenciasHoy}</div>
            <p className="text-xs text-muted-foreground">Enviadas hoy</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Disponible</CardTitle>
            <Warehouse className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.stockDisponible.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Unidades en almacén central</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Hospitales con necesidades */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Hospitales Prioritarios
            </CardTitle>
            <Link to="/distribucion">
              <Button variant="ghost" size="sm">
                Ver todos <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {hospitalesNecesidad.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-2" />
                <p>No hay necesidades pendientes</p>
              </div>
            ) : (
              <div className="space-y-3">
                {hospitalesNecesidad.map((h) => (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex-1">
                      <span className="font-medium text-sm truncate block max-w-[200px]">{h.nombre}</span>
                      <p className="text-xs text-muted-foreground mt-1">
                        {h.insumosRequeridos} insumos · {h.unidadesFaltantes.toLocaleString()} unidades
                      </p>
                    </div>
                    <Badge variant="secondary">{h.insumosRequeridos}</Badge>
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
                  key={action.label}
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
              Documentos Pendientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.documentosPendientes}</div>
            <p className="text-xs text-muted-foreground">Por procesar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Total Transferencias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.transferenciasEnviadas}</div>
            <p className="text-xs text-muted-foreground">Históricas</p>
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
            {stats.hospitalesConNecesidades === 0 ? (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-500" />
                <span className="text-green-600 font-medium">Sin pendientes</span>
              </div>
            ) : stats.ordenesParaRecibir > 0 ? (
              <div className="flex items-center gap-2">
                <Clock className="h-6 w-6 text-amber-500" />
                <span className="text-amber-600 font-medium">Órdenes por recibir</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                <span className="text-destructive font-medium">Hospitales esperando</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CadenaSuministrosDashboardHome;
