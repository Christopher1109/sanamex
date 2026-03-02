import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { 
  Warehouse, 
  Package,
  ShoppingCart,
  Clock,
  CheckCircle,
  RefreshCw,
  ChevronRight,
  FileText,
  AlertTriangle,
  Truck,
  Send
} from 'lucide-react';

interface AlmacenStats {
  documentosPendientes: number;
  ordenesPorProcesar: number;
  ordenesEnviadas: number;
  itemsAlmacenCentral: number;
  totalUnidadesStock: number;
  ordenesConPrecios: number;
}

interface DocumentoPendiente {
  id: string;
  fecha: string;
  totalItems: number;
  estado: string;
}

const GerenteAlmacenDashboardHome = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AlmacenStats>({
    documentosPendientes: 0,
    ordenesPorProcesar: 0,
    ordenesEnviadas: 0,
    itemsAlmacenCentral: 0,
    totalUnidadesStock: 0,
    ordenesConPrecios: 0
  });
  const [documentosPendientes, setDocumentosPendientes] = useState<DocumentoPendiente[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch en paralelo
      const [docsRes, ordenesRes, almacenRes] = await Promise.all([
        supabase
          .from('documentos_necesidades_agrupado')
          .select(`
            id,
            fecha_generacion,
            estado,
            procesado_por_almacen,
            detalles:documento_agrupado_detalle(id)
          `)
          .eq('enviado_a_gerente_almacen', true)
          .order('fecha_generacion', { ascending: false })
          .limit(10),
        supabase
          .from('pedidos_compra')
          .select('id, estado, numero_pedido, total'),
        supabase
          .from('almacen_central')
          .select('id, cantidad_disponible')
      ]);

      // Procesar documentos
      const docsPendientes = (docsRes.data || []).filter(d => !d.procesado_por_almacen);
      const docsFormateados = docsPendientes.slice(0, 5).map(d => ({
        id: d.id,
        fecha: d.fecha_generacion,
        totalItems: (d.detalles as any[])?.length || 0,
        estado: d.estado
      }));

      // Procesar órdenes
      const ordenesData = ordenesRes.data || [];
      const pendientes = ordenesData.filter(o => o.estado === 'pendiente');
      const enviadas = ordenesData.filter(o => o.estado === 'enviado_a_finanzas');
      const conPrecios = ordenesData.filter(o => o.total && o.total > 0);

      // Procesar almacén central
      const almacenData = almacenRes.data || [];
      const totalStock = almacenData.reduce((sum, item) => sum + (item.cantidad_disponible || 0), 0);

      setStats({
        documentosPendientes: docsPendientes.length,
        ordenesPorProcesar: pendientes.length,
        ordenesEnviadas: enviadas.length,
        itemsAlmacenCentral: almacenData.length,
        totalUnidadesStock: totalStock,
        ordenesConPrecios: conPrecios.length
      });

      setDocumentosPendientes(docsFormateados);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const quickActions = [
    { path: '/almacen-central', icon: FileText, label: 'Documentos Pendientes', description: 'Procesar solicitudes', colorClass: 'bg-destructive/10 hover:bg-destructive/20 text-destructive', count: stats.documentosPendientes },
    { path: '/almacen-central', icon: Warehouse, label: 'Almacén Central', description: 'Ver inventario', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/distribucion', icon: Truck, label: 'Distribución', description: 'Envíos a hospitales', colorClass: 'bg-success/10 hover:bg-success/20 text-success' },
    { path: '/insumos', icon: Package, label: 'Insumos', description: 'Gestionar inventario', colorClass: 'bg-warning/10 hover:bg-warning/20 text-warning' },
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
          <h1 className="text-3xl font-bold text-foreground">Panel de Gerente de Almacén</h1>
          <p className="text-muted-foreground">Gestión de órdenes de compra y almacén central</p>
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
            <CardTitle className="text-sm font-medium">Documentos Pendientes</CardTitle>
            <FileText className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.documentosPendientes}</div>
            <p className="text-xs text-muted-foreground">Por procesar</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-warning">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Órdenes Sin Precios</CardTitle>
            <ShoppingCart className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.ordenesPorProcesar}</div>
            <p className="text-xs text-muted-foreground">Requieren cotización</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-primary">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enviadas a Finanzas</CardTitle>
            <Send className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.ordenesEnviadas}</div>
            <p className="text-xs text-muted-foreground">Pendientes de pago</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Almacén Central</CardTitle>
            <Warehouse className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.totalUnidadesStock.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">{stats.itemsAlmacenCentral} tipos de insumos</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Documentos pendientes */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documentos Recientes
            </CardTitle>
            <Link to="/almacen-central">
              <Button variant="ghost" size="sm">
                Ver todos <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {documentosPendientes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-2" />
                <p>No hay documentos pendientes</p>
              </div>
            ) : (
              <div className="space-y-3">
                {documentosPendientes.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{formatDate(doc.fecha)}</span>
                        <Badge variant="secondary" className="text-xs">
                          {doc.totalItems} items
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        ID: {doc.id.slice(0, 8)}...
                      </p>
                    </div>
                    <Badge variant="outline">Pendiente</Badge>
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
              <Package className="h-4 w-4" />
              Órdenes con Precios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.ordenesConPrecios}</div>
            <p className="text-xs text-muted-foreground">Listas para enviar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Flujo de Trabajo
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.documentosPendientes > 0 ? (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
                <span className="text-amber-600 font-medium">Documentos por procesar</span>
              </div>
            ) : stats.ordenesPorProcesar > 0 ? (
              <div className="flex items-center gap-2">
                <Clock className="h-6 w-6 text-primary" />
                <span className="text-primary font-medium">Asignar precios</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-500" />
                <span className="text-green-600 font-medium">Al día</span>
              </div>
            )}
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
            {stats.documentosPendientes === 0 && stats.ordenesPorProcesar === 0 ? (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-500" />
                <span className="text-green-600 font-medium">Sin pendientes</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Clock className="h-6 w-6 text-amber-500" />
                <span className="text-amber-600 font-medium">Tareas pendientes</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GerenteAlmacenDashboardHome;
