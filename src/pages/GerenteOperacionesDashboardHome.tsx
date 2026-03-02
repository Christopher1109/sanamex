import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { 
  AlertTriangle, 
  Building2,
  Package,
  TrendingUp,
  Clock,
  CheckCircle,
  RefreshCw,
  ChevronRight,
  FileText,
  Send,
  Settings2,
  Activity
} from 'lucide-react';

interface OperacionesStats {
  alertasActivas: number;
  hospitalesAfectados: number;
  insumosUnicos: number;
  totalUnidadesFaltantes: number;
  documentosEnviados: number;
  alertasCriticas: number;
  alertasAltas: number;
}

interface HospitalAlerta {
  id: string;
  nombre: string;
  alertas: number;
  prioridad: string;
  unidadesFaltantes: number;
}

const GerenteOperacionesDashboardHome = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OperacionesStats>({
    alertasActivas: 0,
    hospitalesAfectados: 0,
    insumosUnicos: 0,
    totalUnidadesFaltantes: 0,
    documentosEnviados: 0,
    alertasCriticas: 0,
    alertasAltas: 0
  });
  const [hospitalesAlerta, setHospitalesAlerta] = useState<HospitalAlerta[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch alertas activas con información de hospital
      const { data: alertasData } = await supabase
        .from('insumos_alertas')
        .select(`
          id,
          hospital_id,
          insumo_catalogo_id,
          cantidad_actual,
          minimo_permitido,
          prioridad,
          hospital:hospitales(id, display_name, nombre)
        `)
        .eq('estado', 'activa');

      // Fetch documentos enviados recientes
      const { data: docsData } = await supabase
        .from('documentos_necesidades_agrupado')
        .select('id')
        .eq('enviado_a_gerente_almacen', true);

      if (alertasData) {
        const hospitalesMap = new Map<string, HospitalAlerta>();
        let totalFaltante = 0;
        let criticas = 0;
        let altas = 0;
        const insumosSet = new Set<string>();

        alertasData.forEach(alerta => {
          const faltante = Math.max(0, alerta.minimo_permitido - alerta.cantidad_actual);
          totalFaltante += faltante;
          insumosSet.add(alerta.insumo_catalogo_id);
          
          if (alerta.prioridad === 'critica') criticas++;
          if (alerta.prioridad === 'alta') altas++;

          const hospitalId = alerta.hospital_id;
          const hospitalNombre = (alerta.hospital as any)?.display_name || (alerta.hospital as any)?.nombre || 'Hospital';

          if (hospitalesMap.has(hospitalId)) {
            const existing = hospitalesMap.get(hospitalId)!;
            existing.alertas++;
            existing.unidadesFaltantes += faltante;
            if (getPrioridadPeso(alerta.prioridad) < getPrioridadPeso(existing.prioridad)) {
              existing.prioridad = alerta.prioridad;
            }
          } else {
            hospitalesMap.set(hospitalId, {
              id: hospitalId,
              nombre: hospitalNombre,
              alertas: 1,
              prioridad: alerta.prioridad,
              unidadesFaltantes: faltante
            });
          }
        });

        // Ordenar hospitales por prioridad
        const sortedHospitales = Array.from(hospitalesMap.values())
          .sort((a, b) => getPrioridadPeso(a.prioridad) - getPrioridadPeso(b.prioridad))
          .slice(0, 5);

        setStats({
          alertasActivas: alertasData.length,
          hospitalesAfectados: hospitalesMap.size,
          insumosUnicos: insumosSet.size,
          totalUnidadesFaltantes: totalFaltante,
          documentosEnviados: docsData?.length || 0,
          alertasCriticas: criticas,
          alertasAltas: altas
        });

        setHospitalesAlerta(sortedHospitales);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPrioridadPeso = (prioridad: string) => {
    switch (prioridad) {
      case 'critica': return 0;
      case 'alta': return 1;
      case 'media': return 2;
      case 'baja': return 3;
      default: return 4;
    }
  };

  const getPrioridadColor = (prioridad: string) => {
    switch (prioridad) {
      case 'critica': return 'destructive';
      case 'alta': return 'destructive';
      case 'media': return 'secondary';
      default: return 'outline';
    }
  };

  const quickActions = [
    { path: '/alertas-operaciones', icon: AlertTriangle, label: 'Alertas por Hospital', description: 'Ver insumos faltantes', colorClass: 'bg-destructive/10 hover:bg-destructive/20 text-destructive', count: stats.alertasActivas },
    { path: '/folios', icon: FileText, label: 'Folios del Día', description: 'Procedimientos programados', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/alertas-operaciones', icon: Send, label: 'Consolidar y Enviar', description: 'Generar documentos', colorClass: 'bg-success/10 hover:bg-success/20 text-success' },
    { path: '/alertas-operaciones', icon: Settings2, label: 'Configurar Mínimos', description: 'Editar niveles mínimos', colorClass: 'bg-warning/10 hover:bg-warning/20 text-warning' },
    { path: '/configuracion-procedimiento-insumos', icon: Package, label: 'Insumos por Procedimiento', description: 'Configurar relaciones', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/registro-actividad', icon: Activity, label: 'Actividad', description: 'Ver historial', colorClass: 'bg-muted hover:bg-muted/80 text-muted-foreground' },
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
          <h1 className="text-3xl font-bold text-foreground">Panel de Gerente de Operaciones</h1>
          <p className="text-muted-foreground">Gestión de alertas y necesidades de inventario</p>
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
            <CardTitle className="text-sm font-medium">Alertas Activas</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.alertasActivas}</div>
            <p className="text-xs text-muted-foreground">
              {stats.alertasCriticas > 0 && <span className="text-destructive">{stats.alertasCriticas} críticas</span>}
              {stats.alertasCriticas > 0 && stats.alertasAltas > 0 && ', '}
              {stats.alertasAltas > 0 && <span className="text-orange-500">{stats.alertasAltas} altas</span>}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-warning">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hospitales Afectados</CardTitle>
            <Building2 className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.hospitalesAfectados}</div>
            <p className="text-xs text-muted-foreground">Con alertas activas</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Insumos Únicos</CardTitle>
            <Package className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.insumosUnicos}</div>
            <p className="text-xs text-muted-foreground">Requieren atención</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Faltante</CardTitle>
            <TrendingUp className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats.totalUnidadesFaltantes.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Unidades requeridas</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Hospitales con alertas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Hospitales con Alertas
            </CardTitle>
            <Link to="/alertas-operaciones">
              <Button variant="ghost" size="sm">
                Ver todos <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {hospitalesAlerta.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-2" />
                <p>No hay alertas activas</p>
              </div>
            ) : (
              <div className="space-y-4">
                {hospitalesAlerta.map((h) => (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate max-w-[200px]">{h.nombre}</span>
                        <Badge variant={getPrioridadColor(h.prioridad)} className="uppercase text-xs">
                          {h.prioridad}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {h.alertas} alertas · {h.unidadesFaltantes.toLocaleString()} unidades faltantes
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
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
                  key={action.path + action.label}
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
              Documentos Enviados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.documentosEnviados}</div>
            <p className="text-xs text-muted-foreground">Total histórico</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Alertas Críticas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{stats.alertasCriticas}</div>
            <p className="text-xs text-muted-foreground">Requieren atención inmediata</p>
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
            {stats.alertasCriticas === 0 ? (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-500" />
                <span className="text-green-600 font-medium">Sin críticos</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-destructive" />
                <span className="text-destructive font-medium">Atención requerida</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GerenteOperacionesDashboardHome;
