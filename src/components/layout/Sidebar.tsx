import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { UserRole } from '@/types';
import {
  LayoutDashboard, Package, Users, Truck, LogOut,
  Warehouse, ArrowLeftRight, ClipboardList, DollarSign,
  Scissors, History, BarChart3, Landmark, ShieldCheck,
  Store, UserCog, Tag, FileSpreadsheet, ShoppingCart,
  PackageCheck, AlertTriangle
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
    // Compras
    { path: '/compras', icon: ShoppingCart, label: 'Compras', roles: ['admin', 'gerente', 'almacen'], category: 'Compras' },
    // Inventario
    { path: '/inventario', icon: Warehouse, label: 'Inventario', roles: ['admin', 'gerente', 'almacen'], category: 'Inventario' },
    { path: '/kardex', icon: ClipboardList, label: 'Kardex', roles: ['admin', 'gerente', 'almacen', 'auditor'], category: 'Inventario' },
    { path: '/traspasos', icon: ArrowLeftRight, label: 'Traspasos', roles: ['admin', 'gerente', 'almacen'], category: 'Inventario' },
    { path: '/ajustes', icon: Scissors, label: 'Ajustes / Mermas', roles: ['admin', 'gerente', 'almacen'], category: 'Inventario' },
    { path: '/mermas', icon: AlertTriangle, label: 'Mermas Detalle', roles: ['admin', 'gerente', 'auditor'], category: 'Inventario' },
    // Pedidos & Rutas
    { path: '/pedidos', icon: PackageCheck, label: 'Pedidos', roles: ['admin', 'gerente', 'almacen', 'cajero'], category: 'Pedidos' },
    { path: '/rutas', icon: Truck, label: 'Rutas', roles: ['admin', 'gerente', 'almacen', 'repartidor'], category: 'Pedidos' },
    // Finanzas
    { path: '/margenes', icon: BarChart3, label: 'Márgenes', roles: ['admin', 'gerente', 'auditor'], category: 'Finanzas' },
    // Reportes
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes', roles: ['admin', 'gerente', 'auditor'], category: 'Reportes' },
    // Admin
    { path: '/usuarios', icon: UserCog, label: 'Usuarios', roles: ['admin'], category: 'Administración' },
    { path: '/auditoria', icon: ShieldCheck, label: 'Auditoría', roles: ['admin', 'auditor'], category: 'Administración' },
    { path: '/registro-actividad', icon: History, label: 'Registro Actividad', roles: ['admin', 'gerente', 'auditor'], category: 'Administración' },
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
