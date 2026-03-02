import { Link } from 'react-router-dom';
import { UserRole } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  FileText, 
  Package, 
  Users, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle, 
  AlertTriangle, 
  Truck, 
  Route, 
  Warehouse, 
  Clock,
  FileSpreadsheet,
  ArrowLeftRight,
  UserCog,
  ClipboardList,
  DollarSign
} from 'lucide-react';

interface DashboardProps {
  userRole: UserRole;
}

// Definición de acciones rápidas por rol
const quickActionsByRole: Record<string, Array<{
  path: string;
  icon: any;
  label: string;
  description: string;
  colorClass: string;
}>> = {
  auxiliar: [
    { path: '/folios', icon: FileText, label: 'Nuevo Folio', description: 'Registrar procedimiento', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
  ],
  almacenista: [
    { path: '/almacenes-provisionales', icon: Warehouse, label: 'Almacenes Provisionales', description: 'Gestionar almacenes', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/insumos', icon: Package, label: 'Insumos', description: 'Ver inventario', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/alertas-transferencia', icon: Truck, label: 'Recepción Insumos', description: 'Recibir transferencias', colorClass: 'bg-success/10 hover:bg-success/20 text-success' },
  ],
  lider: [
    { path: '/folios', icon: FileText, label: 'Folios', description: 'Gestionar procedimientos', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/insumos', icon: Package, label: 'Insumos', description: 'Ver inventario', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/medicos', icon: Users, label: 'Médicos', description: 'Gestionar médicos', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes', description: 'Anexos T29 y T30', colorClass: 'bg-success/10 hover:bg-success/20 text-success' },
  ],
  supervisor: [
    { path: '/folios', icon: FileText, label: 'Folios', description: 'Gestionar procedimientos', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/insumos', icon: Package, label: 'Insumos', description: 'Ver inventario', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/medicos', icon: Users, label: 'Médicos', description: 'Gestionar médicos', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/procedimientos-hospital', icon: ClipboardList, label: 'Procedimientos', description: 'Autorizar procedimientos', colorClass: 'bg-warning/10 hover:bg-warning/20 text-warning' },
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes', description: 'Anexos T29 y T30', colorClass: 'bg-success/10 hover:bg-success/20 text-success' },
    { path: '/registro-actividad', icon: Clock, label: 'Registro Actividad', description: 'Ver historial', colorClass: 'bg-muted hover:bg-muted/80 text-muted-foreground' },
  ],
  gerente_operaciones: [
    { path: '/alertas-operaciones', icon: AlertTriangle, label: 'Alertas y Necesidades', description: 'Consolidar alertas', colorClass: 'bg-warning/10 hover:bg-warning/20 text-warning' },
    { path: '/folios', icon: FileText, label: 'Folios', description: 'Gestionar procedimientos', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/almacenes-provisionales', icon: Warehouse, label: 'Almacenes Provisionales', description: 'Gestionar almacenes', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/insumos', icon: Package, label: 'Insumos', description: 'Ver inventario', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/alertas-transferencia', icon: Truck, label: 'Recepción Insumos', description: 'Recibir transferencias', colorClass: 'bg-success/10 hover:bg-success/20 text-success' },
    { path: '/supervisor-asignaciones', icon: UserCog, label: 'Asignar Supervisores', description: 'Gestionar asignaciones', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes', description: 'Anexos T29 y T30', colorClass: 'bg-success/10 hover:bg-success/20 text-success' },
    { path: '/registro-actividad', icon: Clock, label: 'Registro Actividad', description: 'Ver historial', colorClass: 'bg-muted hover:bg-muted/80 text-muted-foreground' },
  ],
  gerente: [
    { path: '/alertas-operaciones', icon: AlertTriangle, label: 'Alertas y Necesidades', description: 'Consolidar alertas', colorClass: 'bg-warning/10 hover:bg-warning/20 text-warning' },
    { path: '/folios', icon: FileText, label: 'Folios', description: 'Gestionar procedimientos', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/traspasos', icon: ArrowLeftRight, label: 'Traspasos', description: 'Entre unidades', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes', description: 'Anexos T29 y T30', colorClass: 'bg-success/10 hover:bg-success/20 text-success' },
  ],
  gerente_almacen: [
    { path: '/alertas-operaciones', icon: AlertTriangle, label: 'Alertas y Necesidades', description: 'Ver consolidado de alertas', colorClass: 'bg-warning/10 hover:bg-warning/20 text-warning' },
    { path: '/almacen-central', icon: Warehouse, label: 'LOAD', description: 'Gestión de almacén central', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/distribucion', icon: Truck, label: 'Distribución', description: 'Enviar insumos a hospitales', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/rutas-distribucion', icon: Route, label: 'Rutas de Distribución', description: 'Gestionar rutas', colorClass: 'bg-success/10 hover:bg-success/20 text-success' },
    { path: '/insumos', icon: Package, label: 'Insumos', description: 'Catálogo de insumos', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/almacenes-provisionales', icon: Warehouse, label: 'Almacenes Provisionales', description: 'Gestionar almacenes', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/alertas-transferencia', icon: AlertTriangle, label: 'Recepción Insumos', description: 'Recibir transferencias', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/registro-actividad', icon: Clock, label: 'Registro Actividad', description: 'Historial de actividades', colorClass: 'bg-muted hover:bg-muted/80 text-muted-foreground' },
  ],
  cadena_suministros: [
    { path: '/alertas-operaciones', icon: AlertTriangle, label: 'Alertas y Necesidades', description: 'Ver consolidado de alertas', colorClass: 'bg-warning/10 hover:bg-warning/20 text-warning' },
    { path: '/almacen-central', icon: Warehouse, label: 'LOAD', description: 'Gestión de almacén central', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/distribucion', icon: Truck, label: 'Distribución', description: 'Enviar insumos a hospitales', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/rutas-distribucion', icon: Route, label: 'Rutas de Distribución', description: 'Gestionar rutas', colorClass: 'bg-success/10 hover:bg-success/20 text-success' },
    { path: '/insumos', icon: Package, label: 'Insumos', description: 'Catálogo de insumos', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/almacenes-provisionales', icon: Warehouse, label: 'Almacenes Provisionales', description: 'Gestionar almacenes', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/alertas-transferencia', icon: AlertTriangle, label: 'Recepción Insumos', description: 'Recibir transferencias', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/registro-actividad', icon: Clock, label: 'Registro Actividad', description: 'Historial de actividades', colorClass: 'bg-muted hover:bg-muted/80 text-muted-foreground' },
  ],
  finanzas: [
    { path: '/finanzas', icon: DollarSign, label: 'Pagos Pendientes', description: 'Aprobar y pagar órdenes', colorClass: 'bg-destructive/10 hover:bg-destructive/20 text-destructive' },
    { path: '/finanzas-presupuestos', icon: TrendingUp, label: 'Presupuestos', description: 'Límites por hospital', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/finanzas-reportes', icon: FileSpreadsheet, label: 'Reportes de Costos', description: 'Análisis por hospital', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/rentabilidad', icon: TrendingUp, label: 'Rentabilidad', description: 'Margen por procedimiento', colorClass: 'bg-success/10 hover:bg-success/20 text-success' },
    { path: '/finanzas-precios', icon: Package, label: 'Precios Insumos', description: 'Configurar precios', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/configuracion-tarifas', icon: DollarSign, label: 'Tarifas', description: 'Por procedimiento', colorClass: 'bg-warning/10 hover:bg-warning/20 text-warning' },
    { path: '/registro-actividad', icon: Clock, label: 'Registro Actividad', description: 'Ver historial', colorClass: 'bg-muted hover:bg-muted/80 text-muted-foreground' },
  ],
};

const Dashboard = ({ userRole }: DashboardProps) => {
  const roleLabels: Record<UserRole, string> = {
    auxiliar: 'Auxiliar de Anestesia',
    almacenista: 'Almacenista',
    lider: 'Líder Hospitalario',
    supervisor: 'Supervisor Hospitalario',
    gerente: 'Gerente de Operaciones',
    gerente_operaciones: 'Gerente de Operaciones',
    gerente_almacen: 'Gerente de Almacén',
    cadena_suministros: 'Cadena de Suministros',
    finanzas: 'Finanzas',
  };

  const stats = [
    { 
      title: 'Folios Registrados', 
      value: '248', 
      icon: FileText,
      trend: '+12%',
      visible: ['auxiliar', 'lider', 'supervisor', 'gerente', 'gerente_operaciones']
    },
    { 
      title: 'Insumos en Stock', 
      value: '1,234', 
      icon: Package,
      trend: '-5%',
      visible: ['almacenista', 'lider', 'supervisor', 'gerente', 'gerente_operaciones']
    },
    { 
      title: 'Procedimientos Hoy', 
      value: '18', 
      icon: TrendingUp,
      trend: '+8%',
      visible: ['auxiliar', 'lider', 'supervisor', 'gerente', 'gerente_operaciones']
    },
    { 
      title: 'Médicos Activos', 
      value: '45', 
      icon: Users,
      trend: '+3%',
      visible: ['lider', 'supervisor', 'gerente', 'gerente_operaciones']
    },
  ];

  const alerts = [
    { 
      type: 'warning', 
      message: '5 insumos próximos a caducar',
      visible: ['almacenista', 'lider', 'supervisor', 'gerente', 'gerente_operaciones']
    },
    { 
      type: 'info', 
      message: '3 traspasos pendientes',
      visible: ['gerente', 'gerente_operaciones']
    },
    { 
      type: 'success', 
      message: 'Todos los reportes del mes completados',
      visible: ['lider', 'supervisor', 'gerente', 'gerente_operaciones']
    },
  ];

  const filteredStats = stats.filter(stat => stat.visible.includes(userRole));
  const filteredAlerts = alerts.filter(alert => alert.visible.includes(userRole));
  const quickActions = quickActionsByRole[userRole] || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Bienvenido, {roleLabels[userRole]}</p>
      </div>

      {filteredStats.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {filteredStats.map((stat) => (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <stat.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  <span className={stat.trend.startsWith('+') ? 'text-success' : 'text-destructive'}>
                    {stat.trend}
                  </span>
                  {' '}vs. mes anterior
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {filteredAlerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Alertas y Notificaciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredAlerts.map((alert, index) => (
              <div 
                key={index}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                {alert.type === 'warning' && <AlertCircle className="h-5 w-5 text-warning" />}
                {alert.type === 'info' && <AlertCircle className="h-5 w-5 text-primary" />}
                {alert.type === 'success' && <CheckCircle className="h-5 w-5 text-success" />}
                <span className="text-sm">{alert.message}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {quickActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Acciones Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {quickActions.map((action) => (
                <Link 
                  key={action.path}
                  to={action.path} 
                  className={`rounded-lg border p-4 transition-colors flex flex-col items-center text-center ${action.colorClass}`}
                >
                  <action.icon className="h-6 w-6 mb-2" />
                  <h4 className="font-semibold text-sm">{action.label}</h4>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;