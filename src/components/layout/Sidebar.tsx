import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { UserRole } from '@/types';
import {
  LayoutDashboard, Package, LogOut, Warehouse, ArrowLeftRight, ShoppingCart,
  Monitor, Sparkles, Receipt, Undo2, Settings, BarChart3, BookOpen,
  ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen, DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
  badgeKey?: 'oc' | 'traspasos';
}

interface Group {
  key: string;
  label: string;
  items: MenuItem[];
}

const Sidebar = ({ userRole, onLogout }: SidebarProps) => {
  const location = useLocation();
  const [pendientesAprob, setPendientesAprob] = useState(0);
  const [traspasosPendientes, setTraspasosPendientes] = useState(0);
  const esAprobador = ['gerente','admin','super_admin','subgerente'].includes(userRole);

  // Sidebar collapse state
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('sidebar:collapsed') === '1';
  });
  useEffect(() => { localStorage.setItem('sidebar:collapsed', collapsed ? '1' : '0'); }, [collapsed]);

  // Group open state
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('sidebar:groups') || '{}'); } catch { return {}; }
  });
  useEffect(() => { localStorage.setItem('sidebar:groups', JSON.stringify(openGroups)); }, [openGroups]);

  useEffect(() => {
    if (!esAprobador) return;
    let active = true;
    const fetchCount = async () => {
      const { count } = await supabase
        .from('ordenes_compra')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'pendiente_aprobacion');
      if (active) setPendientesAprob(count ?? 0);
      const { count: t } = await supabase
        .from('traspasos')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'enviado');
      if (active) setTraspasosPendientes(t ?? 0);
    };
    fetchCount();
    const i = setInterval(fetchCount, 30000);
    return () => { active = false; clearInterval(i); };
  }, [esAprobador]);

  const roleLabels: Record<UserRole, string> = {
    super_admin: 'Super Administrador', admin: 'Administrador', gerente: 'Gerente',
    subgerente: 'Subgerente', supervisor: 'Supervisor', ventas: 'Ventas',
    almacen: 'Almacén', almacen_ventas: 'Almacén y Ventas', repartidor: 'Repartidor',
    auditoria: 'Auditoría',
  };

  const ALL: UserRole[] = ['super_admin','admin','gerente','subgerente','supervisor','ventas','almacen','almacen_ventas','repartidor','auditoria'];
  const MGMT: UserRole[] = ['super_admin','admin','gerente','subgerente'];
  const OPS: UserRole[] = ['super_admin','admin','gerente','subgerente','almacen','almacen_ventas'];
  const SALES: UserRole[] = ['super_admin','admin','gerente','subgerente','ventas','almacen_ventas'];
  const INV_AUD: UserRole[] = [...OPS, 'auditoria'];
  const AUDIT: UserRole[] = ['super_admin','admin','gerente','auditoria','supervisor'];

  const groups: Group[] = [
    {
      key: 'principal', label: 'Principal',
      items: [{ path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ALL }],
    },
    {
      key: 'operaciones', label: 'Operaciones',
      items: [
        { path: '/compras', icon: ShoppingCart, label: 'Compras', roles: OPS, badgeKey: 'oc' },
        { path: '/pos', icon: Monitor, label: 'Punto de Venta', roles: SALES },
        { path: '/ventas', icon: Package, label: 'Ventas', roles: SALES },
        { path: '/traspasos', icon: ArrowLeftRight, label: 'Traspasos', roles: OPS, badgeKey: 'traspasos' },
        { path: '/devoluciones', icon: Undo2, label: 'Devoluciones', roles: OPS },
      ],
    },
    {
      key: 'inventario', label: 'Inventario',
      items: [
        { path: '/inventario', icon: Warehouse, label: 'Inventario', roles: INV_AUD },
        { path: '/cotizador', icon: Sparkles, label: 'Cotizador', roles: MGMT },
      ],
    },
    {
      key: 'analisis', label: 'Análisis',
      items: [{ path: '/reportes', icon: BarChart3, label: 'Reportes', roles: MGMT }],
    },
    {
      key: 'finanzas', label: 'Finanzas',
      items: [{ path: '/finanzas', icon: DollarSign, label: 'Finanzas', roles: MGMT }],
    },
    {
      key: 'catalogos', label: 'Catálogos',
      items: [{ path: '/catalogos', icon: BookOpen, label: 'Catálogos', roles: [...MGMT, 'ventas', 'almacen', 'almacen_ventas'] }],
    },
    {
      key: 'sistema', label: 'Sistema',
      items: [{ path: '/sistema', icon: Settings, label: 'Sistema', roles: [...AUDIT, ...SALES] as UserRole[] }],
    },
  ];

  // Filter by role
  const visibleGroups = groups
    .map(g => ({ ...g, items: g.items.filter(i => i.roles.includes(userRole)) }))
    .filter(g => g.items.length > 0);

  // Auto-expand group containing active route on mount/route change
  const activePath = location.pathname;
  useEffect(() => {
    const match = visibleGroups.find(g => g.items.some(i => activePath.startsWith(i.path)));
    if (match && !openGroups[match.key]) {
      setOpenGroups(prev => ({ ...prev, [match.key]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);

  const isItemActive = (path: string) => activePath === path || activePath.startsWith(path + '/');

  const badgeFor = (key?: 'oc' | 'traspasos') => {
    if (key === 'oc' && esAprobador && pendientesAprob > 0) return pendientesAprob;
    if (key === 'traspasos' && traspasosPendientes > 0) return traspasosPendientes;
    return null;
  };

  // Initialize default open: 'principal' always; group with active route
  const isGroupOpen = (g: Group) => {
    if (collapsed) return true; // not used; collapsed renders icons only
    if (g.items.some(i => isItemActive(i.path))) return true;
    return openGroups[g.key] ?? (g.key === 'principal' || g.key === 'operaciones');
  };

  // ICON-COLLAPSED rendering
  if (collapsed) {
    const flat = visibleGroups.flatMap(g => g.items);
    return (
      <div className="flex h-screen w-16 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="flex h-16 items-center justify-center border-b border-sidebar-border">
          <button onClick={() => setCollapsed(false)} className="rounded p-2 hover:bg-sidebar-accent" aria-label="Expandir sidebar">
            <PanelLeftOpen className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-3 space-y-1 px-2">
          {flat.map(item => {
            const active = isItemActive(item.path);
            const badge = badgeFor(item.badgeKey);
            return (
              <Tooltip key={item.path} delayDuration={100}>
                <TooltipTrigger asChild>
                  <Link to={item.path} className={cn(
                    'relative flex items-center justify-center rounded-lg p-2.5 transition-colors',
                    active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'hover:bg-sidebar-accent'
                  )}>
                    <item.icon className="h-5 w-5" />
                    {badge && (
                      <Badge variant="destructive" className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[9px]">{badge}</Badge>
                    )}
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="border-t border-sidebar-border p-2">
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <button onClick={onLogout} className="flex w-full items-center justify-center rounded-lg p-2.5 hover:bg-sidebar-accent">
                <LogOut className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Cerrar sesión</TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  }

  // EXPANDED rendering
  return (
    <div className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="sticky top-0 z-10 border-b border-sidebar-border bg-sidebar">
        <div className="flex h-16 items-center justify-between px-4">
          <h1 className="text-lg font-bold text-sidebar-primary">Sanamex</h1>
          <button onClick={() => setCollapsed(true)} className="rounded p-1.5 hover:bg-sidebar-accent" aria-label="Colapsar sidebar">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <div className="px-3 pb-3 space-y-2">
          <div className="rounded-lg bg-sidebar-accent p-2.5">
            <p className="text-[10px] text-sidebar-accent-foreground/70 uppercase tracking-wider">Rol</p>
            <p className="text-sm font-semibold text-sidebar-accent-foreground">{roleLabels[userRole]}</p>
          </div>
          <SucursalSelector />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-3">
        <nav className="space-y-0.5">
          {visibleGroups.map(g => {
            const open = isGroupOpen(g);
            const single = g.items.length === 1 && g.key !== 'principal';
            // Single-item group: render as a flat item, no chevron, but keep the group label
            if (g.key === 'principal') {
              // No header for principal
              return (
                <div key={g.key} className="mb-2">
                  {g.items.map(item => {
                    const active = isItemActive(item.path);
                    const badge = badgeFor(item.badgeKey);
                    return (
                      <Link key={item.path} to={item.path} className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'hover:bg-sidebar-accent'
                      )}>
                        <item.icon className="h-5 w-5" />
                        <span className="flex-1">{item.label}</span>
                        {badge && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{badge}</Badge>}
                      </Link>
                    );
                  })}
                </div>
              );
            }

            return (
              <div key={g.key} className="mb-1">
                <button
                  onClick={() => setOpenGroups(prev => ({ ...prev, [g.key]: !open }))}
                  className="flex w-full items-center justify-between px-3 py-1.5 text-[11px] font-semibold text-sidebar-foreground/60 uppercase tracking-wider hover:text-sidebar-foreground"
                >
                  <span>{g.label}</span>
                  {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </button>
                {open && (
                  <div className="space-y-0.5">
                    {g.items.map(item => {
                      const active = isItemActive(item.path);
                      const badge = badgeFor(item.badgeKey);
                      return (
                        <Link key={item.path} to={item.path} className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          active ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'hover:bg-sidebar-accent'
                        )}>
                          <item.icon className="h-5 w-5" />
                          <span className="flex-1">{item.label}</span>
                          {badge && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{badge}</Badge>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-sidebar-border p-3">
        <Button variant="ghost" className="w-full justify-start gap-3 hover:bg-sidebar-accent" onClick={onLogout}>
          <LogOut className="h-5 w-5" />
          Cerrar Sesión
        </Button>
      </div>
    </div>
  );
};

export default Sidebar;
