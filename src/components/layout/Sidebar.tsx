import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import sanamexLogo from '@/assets/sanamex-logo.png.asset.json';
import { UserRole } from '@/types';
import { canAccessFase2 } from '@/config/faseAccess';
import {
  LayoutDashboard, Package, Users, LogOut,
  Warehouse, ArrowLeftRight,
  Store, ShoppingCart,
  PackageCheck, AlertCircle, History, FileSpreadsheet,
  Monitor, CloudOff, Shield, Receipt, Wallet, TrendingUp, DollarSign,
  Undo2, Upload
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SucursalSelector } from '@/components/SucursalSelector';
import { supabase } from '@/integrations/supabase/client';

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
  fase?: 1 | 2;
}

const Sidebar = ({ userRole, onLogout }: SidebarProps) => {
  const location = useLocation();
  const [pendientesAprob, setPendientesAprob] = useState(0);
  const esAprobador = ['gerente','admin','super_admin'].includes(userRole);

  useEffect(() => {
    if (!esAprobador) return;
    let active = true;
    const fetchCount = async () => {
      const { count } = await supabase
        .from('ordenes_compra')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'pendiente_aprobacion');
      if (active) setPendientesAprob(count ?? 0);
    };
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    return () => { active = false; clearInterval(t); };
  }, [esAprobador]);

  const roleLabels: Record<UserRole, string> = {
    super_admin: 'Super Administrador',
    admin: 'Administrador',
    gerente: 'Gerente',
    subgerente: 'Subgerente',
    supervisor: 'Supervisor',
    ventas: 'Ventas',
    almacen: 'Almacén',
    almacen_ventas: 'Almacén y Ventas',
    repartidor: 'Repartidor',
    auditoria: 'Auditoría',
    contador: 'Contador',
    contraloria: 'Contraloría',
    tesoreria: 'Tesorería',
  };

  const ALL: UserRole[] = ['super_admin','admin','gerente','subgerente','supervisor','ventas','almacen','almacen_ventas','repartidor','auditoria','contador','contraloria','tesoreria'];
  const MGMT: UserRole[] = ['super_admin','admin','gerente','subgerente'];
  const FINANZAS: UserRole[] = ['super_admin','admin','gerente','contador','contraloria','tesoreria'];
  const FISCAL: UserRole[] = ['super_admin','admin','contador','contraloria'];
  const NOMINA: UserRole[] = ['super_admin','admin','contador'];
  const OPS: UserRole[] = ['super_admin','admin','gerente','subgerente','almacen','almacen_ventas'];
  const SALES: UserRole[] = ['super_admin','admin','gerente','subgerente','ventas','almacen_ventas'];
  const AUDIT: UserRole[] = ['super_admin','admin','gerente','auditoria','supervisor','contador'];

  const menuItems: MenuItem[] = [
    { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ALL, category: 'Principal' },
    // Catálogos (Fase 2)
    { path: '/productos', icon: Package, label: 'Artículos', roles: ['super_admin','admin','gerente','subgerente','almacen','almacen_ventas'], category: 'Catálogos', fase: 2 },
    { path: '/proveedores', icon: Store, label: 'Proveedores', roles: MGMT, category: 'Catálogos', fase: 2 },
    { path: '/listas-precios', icon: DollarSign, label: 'Listas de Precios', roles: MGMT, category: 'Catálogos', fase: 2 },
    { path: '/clientes', icon: Users, label: 'Clientes', roles: [...MGMT,'ventas'], category: 'Catálogos', fase: 2 },
    // Operaciones (Fase 2)
    { path: '/compras', icon: ShoppingCart, label: 'Compras', roles: OPS, category: 'Operaciones', fase: 2 },
    { path: '/pedidos', icon: PackageCheck, label: 'Ventas', roles: SALES, category: 'Operaciones', fase: 2 },
    { path: '/pos', icon: Monitor, label: 'Punto de Venta', roles: SALES, category: 'Operaciones', fase: 2 },
    { path: '/traspasos', icon: ArrowLeftRight, label: 'Traspasos', roles: OPS, category: 'Operaciones', fase: 2 },
    { path: '/devoluciones-proveedor', icon: Undo2, label: 'Devoluciones a Proveedor', roles: OPS, category: 'Operaciones', fase: 2 },
    // Inventario (Fase 2)
    { path: '/inventario', icon: Warehouse, label: 'Inventario', roles: ['super_admin','admin','gerente','subgerente','almacen','almacen_ventas'], category: 'Inventario', fase: 2 },
    { path: '/caducidades', icon: AlertCircle, label: 'Caducidades', roles: [...OPS,'auditoria'], category: 'Inventario', fase: 2 },
    // Análisis (Fase 2)
    { path: '/rotacion', icon: TrendingUp, label: 'Inteligencia de Rotación', roles: MGMT, category: 'Análisis', fase: 2 },
    { path: '/rentabilidad-lotes', icon: DollarSign, label: 'Rentabilidad por Lote', roles: MGMT, category: 'Análisis', fase: 2 },
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes', roles: MGMT, category: 'Análisis', fase: 2 },
    // Finanzas (Fase 1)
    { path: '/cuentas-por-pagar', icon: Wallet, label: 'Cuentas por Pagar', roles: FINANZAS, category: 'Finanzas', fase: 1 },
    { path: '/bancos', icon: DollarSign, label: 'Bancos', roles: FINANZAS, category: 'Finanzas', fase: 1 },
    { path: '/conciliacion', icon: ArrowLeftRight, label: 'Conciliación', roles: FINANZAS, category: 'Finanzas', fase: 1 },
    { path: '/contabilidad', icon: FileSpreadsheet, label: 'Contabilidad', roles: FINANZAS, category: 'Finanzas', fase: 1 },
    { path: '/reportes-admin', icon: FileSpreadsheet, label: 'Reportes administrativos', roles: FINANZAS, category: 'Finanzas', fase: 1 },
    { path: '/fiscal', icon: Receipt, label: 'Facturación (CFDI)', roles: FISCAL, category: 'Fiscal', fase: 1 },
    { path: '/impuestos', icon: Receipt, label: 'Impuestos', roles: FISCAL, category: 'Fiscal', fase: 1 },
    { path: '/nomina', icon: Wallet, label: 'Nómina', roles: NOMINA, category: 'Nómina', fase: 1 },
    // Sistema
    { path: '/cargas-masivas', icon: Upload, label: 'Cargas Masivas', roles: MGMT, category: 'Sistema', fase: 2 },
    { path: '/conflictos', icon: CloudOff, label: 'Ventas Offline', roles: SALES, category: 'Sistema', fase: 2 },
    { path: '/actividad', icon: History, label: 'Registro de Actividad', roles: AUDIT, category: 'Sistema' },
    { path: '/super-admin', icon: Shield, label: 'Super Admin', roles: ['super_admin'], category: 'Sistema' },
  ];

  const filtered = menuItems
    .filter(item => canAccessFase2(userRole) || item.fase !== 2)
    .filter(item => item.roles.includes(userRole));
  const grouped = filtered.reduce((acc, item) => {
    const cat = item.category || 'Otros';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, MenuItem[]>);

  return (
    <div className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground">
      <div className="sticky top-0 z-10 border-b border-sidebar-border bg-sidebar">
        <div className="flex h-20 items-center justify-center px-4">
          <img src={sanamexLogo.url} alt="Sanamex" className="h-12 w-auto rounded-xl object-contain shadow-sm" />
        </div>
        <div className="px-3 pb-3 space-y-2">
          <div className="rounded-lg bg-sidebar-accent p-3">
            <p className="text-xs text-sidebar-accent-foreground/70">Rol</p>
            <p className="font-semibold text-sidebar-accent-foreground">{roleLabels[userRole]}</p>
          </div>
          <SucursalSelector />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">

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
                    <span className="flex-1">{item.label}</span>
                    {item.path === '/compras' && esAprobador && pendientesAprob > 0 && (
                      <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{pendientesAprob}</Badge>
                    )}
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
