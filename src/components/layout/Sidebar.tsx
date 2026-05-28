import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { UserRole } from '@/types';
import {
  LayoutDashboard, Package, Users, LogOut,
  Warehouse, ArrowLeftRight, ClipboardList,
  Store, ShoppingCart,
  PackageCheck, AlertTriangle, AlertCircle, History, FileSpreadsheet,
  Monitor, CloudOff, Shield, Sparkles, Upload, Receipt, Bell
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SucursalSelector } from '@/components/SucursalSelector';

interface SidebarProps {
  userRole: UserRole;
  onLogout: () => void;
}

interface MenuItem {
  path: string;
  icon: any;
  label: string;
  roles: UserRole[];
  category?: string;
}

const Sidebar = ({ userRole, onLogout }: SidebarProps) => {
  const location = useLocation();

  const roleLabels: Record<UserRole, string> = {
    super_admin: 'Super Administrador',
    admin: 'Administrador',
    gerente: 'Gerente',
    subgerente: 'Subgerente',
    supervisor: 'Supervisor',
    cajero: 'Cajero',
    ventas: 'Ventas',
    almacen: 'Almacén',
    almacen_ventas: 'Almacén y Ventas',
    repartidor: 'Repartidor',
    auditor: 'Auditor',
    auditoria: 'Auditoría',
  };

  const ALL: UserRole[] = ['super_admin','admin','gerente','subgerente','supervisor','cajero','ventas','almacen','almacen_ventas','repartidor','auditor','auditoria'];
  const MGMT: UserRole[] = ['super_admin','admin','gerente','subgerente'];
  const OPS: UserRole[] = ['super_admin','admin','gerente','subgerente','almacen','almacen_ventas'];
  const SALES: UserRole[] = ['super_admin','admin','gerente','subgerente','cajero','ventas','almacen_ventas'];
  const AUDIT: UserRole[] = ['super_admin','admin','gerente','auditor','auditoria','supervisor'];

  const menuItems: MenuItem[] = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ALL, category: 'Principal' },
    // Catálogos
    { path: '/productos', icon: Package, label: 'Productos', roles: ['super_admin','admin','gerente','subgerente','almacen','almacen_ventas'], category: 'Catálogos' },
    { path: '/proveedores', icon: Store, label: 'Proveedores', roles: MGMT, category: 'Catálogos' },
    { path: '/clientes', icon: Users, label: 'Clientes', roles: [...MGMT,'cajero','ventas'], category: 'Catálogos' },
    // Operaciones
    { path: '/compras', icon: ShoppingCart, label: 'Compras', roles: OPS, category: 'Operaciones' },
    { path: '/pedidos', icon: PackageCheck, label: 'Ventas', roles: SALES, category: 'Operaciones' },
    { path: '/pos', icon: Monitor, label: 'Punto de Venta', roles: SALES, category: 'Operaciones' },
    { path: '/traspasos', icon: ArrowLeftRight, label: 'Traspasos', roles: OPS, category: 'Operaciones' },
    // Inventario
    { path: '/inventario', icon: Warehouse, label: 'Inventario', roles: ['super_admin','admin','gerente','subgerente','almacen','almacen_ventas'], category: 'Inventario' },
    { path: '/kardex', icon: ClipboardList, label: 'Kardex', roles: [...OPS,'auditor','auditoria'], category: 'Inventario' },
    { path: '/mermas', icon: AlertTriangle, label: 'Mermas', roles: [...OPS,'auditor','auditoria'], category: 'Inventario' },
    { path: '/caducidades', icon: AlertCircle, label: 'Caducidades', roles: [...OPS,'auditor','auditoria'], category: 'Inventario' },
    // Análisis
    { path: '/recomendaciones', icon: Sparkles, label: 'Recomendaciones IA', roles: MGMT, category: 'Análisis' },
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes', roles: AUDIT, category: 'Análisis' },
    // Fiscal
    { path: '/fiscal', icon: Receipt, label: 'Facturación (CFDI)', roles: MGMT, category: 'Fiscal' },
    // Sistema
    { path: '/cargas-masivas', icon: Upload, label: 'Cargas Masivas', roles: MGMT, category: 'Sistema' },
    { path: '/conflictos', icon: CloudOff, label: 'Ventas Offline', roles: SALES, category: 'Sistema' },
    { path: '/actividad', icon: History, label: 'Registro de Actividad', roles: AUDIT, category: 'Sistema' },
    { path: '/super-admin', icon: Shield, label: 'Super Admin', roles: ['super_admin'], category: 'Sistema' },
  ];

  const filtered = menuItems.filter(item => item.roles.includes(userRole));
  const grouped = filtered.reduce((acc, item) => {
    const cat = item.category || 'Otros';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  return (
    <div className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center border-b border-sidebar-border px-6">
        <h1 className="text-lg font-bold text-sidebar-primary">MedDistributor</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-3 rounded-lg bg-sidebar-accent p-3">
          <p className="text-xs text-sidebar-accent-foreground/70">Rol</p>
          <p className="font-semibold text-sidebar-accent-foreground">{roleLabels[userRole]}</p>
        </div>

        <div className="mb-3">
          <SucursalSelector />
        </div>

        <nav className="space-y-1">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="mb-3">
              {category !== 'Principal' && (
                <p className="px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">{category}</p>
              )}
              {items.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                  <Link key={item.path} to={item.path}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent'
                    )}>
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      <div className="border-t border-sidebar-border p-4">
        <Button variant="ghost" className="w-full justify-start gap-3 text-sidebar-foreground hover:bg-sidebar-accent" onClick={onLogout}>
          <LogOut className="h-5 w-5" />
          Cerrar Sesión
        </Button>
      </div>
    </div>
  );
};

export default Sidebar;
