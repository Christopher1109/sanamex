import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { UserRole } from '@/types';
import {
  LayoutDashboard, Package, Users, LogOut,
  Warehouse, ArrowLeftRight, ClipboardList,
  Store, ShoppingCart,
  PackageCheck, AlertTriangle, AlertCircle, History, FileSpreadsheet,
  Monitor, CloudOff
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
    admin: 'Administrador',
    gerente: 'Gerente',
    cajero: 'Cajero',
    almacen: 'Almacén',
    repartidor: 'Repartidor',
    auditor: 'Auditor',
  };

  const menuItems: MenuItem[] = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'gerente', 'cajero', 'almacen', 'repartidor', 'auditor'], category: 'Principal' },
    // Catálogos
    { path: '/productos', icon: Package, label: 'Productos', roles: ['admin', 'gerente', 'almacen'], category: 'Catálogos' },
    { path: '/proveedores', icon: Store, label: 'Proveedores', roles: ['admin', 'gerente'], category: 'Catálogos' },
    { path: '/clientes', icon: Users, label: 'Clientes', roles: ['admin', 'gerente', 'cajero'], category: 'Catálogos' },
    // Operaciones
    { path: '/compras', icon: ShoppingCart, label: 'Compras', roles: ['admin', 'gerente', 'almacen'], category: 'Operaciones' },
    { path: '/pedidos', icon: PackageCheck, label: 'Ventas', roles: ['admin', 'gerente', 'almacen', 'cajero'], category: 'Operaciones' },
    { path: '/pos', icon: Monitor, label: 'Punto de Venta', roles: ['admin', 'gerente', 'cajero'], category: 'Operaciones' },
    { path: '/traspasos', icon: ArrowLeftRight, label: 'Traspasos', roles: ['admin', 'gerente', 'almacen'], category: 'Operaciones' },
    // Inventario
    { path: '/inventario', icon: Warehouse, label: 'Inventario', roles: ['admin', 'gerente', 'almacen'], category: 'Inventario' },
    { path: '/kardex', icon: ClipboardList, label: 'Kardex', roles: ['admin', 'gerente', 'almacen', 'auditor'], category: 'Inventario' },
    { path: '/mermas', icon: AlertTriangle, label: 'Mermas', roles: ['admin', 'gerente', 'almacen', 'auditor'], category: 'Inventario' },
    { path: '/caducidades', icon: AlertCircle, label: 'Caducidades', roles: ['admin', 'gerente', 'almacen', 'auditor'], category: 'Inventario' },
    // Análisis
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes', roles: ['admin', 'gerente', 'auditor'], category: 'Análisis' },
    // Sistema
    { path: '/conflictos', icon: CloudOff, label: 'Ventas Offline', roles: ['admin', 'gerente', 'cajero'], category: 'Sistema' },
    { path: '/actividad', icon: History, label: 'Registro de Actividad', roles: ['admin', 'gerente', 'auditor'], category: 'Sistema' },
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
