import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { UserRole } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, DollarSign, Truck, AlertCircle, Warehouse, FileSpreadsheet, ShoppingCart, Banknote } from 'lucide-react';

interface DashboardProps {
  userRole: UserRole;
}

const quickActionsByRole: Record<UserRole, Array<{
  path: string;
  icon: any;
  label: string;
  description: string;
  colorClass: string;
}>> = {
  admin: [
    { path: '/productos', icon: Package, label: 'Productos', description: 'Gestionar catálogo', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/inventario', icon: Warehouse, label: 'Inventario', description: 'Ver existencias', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/pos', icon: ShoppingCart, label: 'Punto de Venta', description: 'Abrir caja', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes', description: 'Ver reportes', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
  ],
  gerente: [
    { path: '/inventario', icon: Warehouse, label: 'Inventario', description: 'Ver existencias', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/cortes', icon: Banknote, label: 'Cortes de Caja', description: 'Revisar cortes', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes', description: 'Ver reportes', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/rutas', icon: Truck, label: 'Rutas', description: 'Gestionar rutas', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
  ],
  cajero: [
    { path: '/pos', icon: ShoppingCart, label: 'Punto de Venta', description: 'Abrir caja', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/cortes', icon: Banknote, label: 'Corte de Caja', description: 'Realizar corte', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
  ],
  almacen: [
    { path: '/inventario', icon: Warehouse, label: 'Inventario', description: 'Gestionar existencias', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/kardex', icon: FileSpreadsheet, label: 'Kardex', description: 'Ver movimientos', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/traspasos', icon: Truck, label: 'Traspasos', description: 'Entre sucursales', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
  ],
  repartidor: [
    { path: '/rutas', icon: Truck, label: 'Mis Rutas', description: 'Ver entregas', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
  ],
  auditor: [
    { path: '/auditoria', icon: FileSpreadsheet, label: 'Auditoría', description: 'Ver logs', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/conciliacion', icon: DollarSign, label: 'Conciliación', description: 'Bancaria', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes', description: 'Operativos', colorClass: 'bg-primary/10 hover:bg-primary/20 text-primary' },
  ],
};

const Dashboard = ({ userRole }: DashboardProps) => {
  const { selectedSucursal } = useSucursal();
  const [ventasHoy, setVentasHoy] = useState(0);
  const [productosActivos, setProductosActivos] = useState(0);
  const [lotesPorVencer, setLotesPorVencer] = useState(0);
  const [rutasActivas, setRutasActivas] = useState(0);

  const roleLabels: Record<UserRole, string> = {
    admin: 'Administrador',
    gerente: 'Gerente de Sucursal',
    cajero: 'Cajero',
    almacen: 'Almacenista',
    repartidor: 'Repartidor',
    auditor: 'Auditor',
  };

  useEffect(() => {
    loadKPIs();
  }, [selectedSucursal]);

  const loadKPIs = async () => {
    const today = new Date().toISOString().split('T')[0];

    // Ventas hoy
    const { data: ventas } = await supabase
      .from('ventas')
      .select('total')
      .gte('fecha', today + 'T00:00:00')
      .eq('estado', 'completada');
    setVentasHoy((ventas || []).reduce((s, v) => s + Number(v.total), 0));

    // Productos activos
    const { count } = await supabase
      .from('productos')
      .select('id', { count: 'exact', head: true })
      .eq('activo', true);
    setProductosActivos(count || 0);

    // Lotes por vencer (próximos 30 días)
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const { count: lotesCount } = await supabase
      .from('lotes')
      .select('id', { count: 'exact', head: true })
      .gte('fecha_caducidad', today)
      .lte('fecha_caducidad', in30.toISOString().split('T')[0]);
    setLotesPorVencer(lotesCount || 0);

    // Rutas activas
    const { count: rutasCount } = await supabase
      .from('rutas')
      .select('id', { count: 'exact', head: true })
      .in('estado', ['preparando', 'en_ruta']);
    setRutasActivas(rutasCount || 0);
  };

  const quickActions = quickActionsByRole[userRole] || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Bienvenido, {roleLabels[userRole]}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ventas Hoy</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${ventasHoy.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground">Total del día</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Productos Activos</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{productosActivos}</div>
            <p className="text-xs text-muted-foreground">En catálogo</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lotes por Vencer</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lotesPorVencer}</div>
            <p className="text-xs text-muted-foreground">Próximos 30 días</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rutas Activas</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rutasActivas}</div>
            <p className="text-xs text-muted-foreground">En tránsito hoy</p>
          </CardContent>
        </Card>
      </div>

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
