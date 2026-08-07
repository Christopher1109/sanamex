import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import sanamexLogo from '@/assets/sanamex-logo.png.asset.json';
import { UserRole } from '@/types';
import { MODULOS } from '@/config/modulos';
import { useModuleAccess } from '@/hooks/useModuleAccess';
import { useAuth } from '@/hooks/useAuth';
import {
  LayoutDashboard, Package, Users, LogOut,
  Warehouse, ArrowLeftRight,
  Store, ShoppingCart,
  PackageCheck, AlertCircle, History, FileSpreadsheet,
  Monitor, CloudOff, Shield, Receipt, Wallet, TrendingUp, DollarSign,
  Undo2, Upload, UserCog, ClipboardEdit, Lock, PanelLeftOpen, PanelLeftClose
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SucursalSelector } from '@/components/SucursalSelector';
import { supabase } from '@/integrations/supabase/client';

interface SidebarProps {
  userRole: UserRole;
  onLogout: () => void;
}

// Iconos por clave de módulo
const ICONS: Record<string, any> = {
  articulos: Package, proveedores: Store, listas_precios: DollarSign, clientes: Users,
  compras: ShoppingCart, ventas: PackageCheck, pos: Monitor, traspasos: ArrowLeftRight,
  devoluciones_proveedor: Undo2, inventario: Warehouse, caducidades: AlertCircle,
  ajustes_inventario: ClipboardEdit, corte_caja: Lock,
  rotacion: TrendingUp, rentabilidad_lotes: DollarSign, reportes: FileSpreadsheet,
  cuentas_por_pagar: Wallet, bancos: DollarSign, conciliacion: ArrowLeftRight,
  contabilidad: FileSpreadsheet, reportes_admin: FileSpreadsheet, cfdi: Receipt,
  impuestos: Receipt, nomina: Wallet, incidencias_nomina: UserCog, cargas_masivas: Upload, ventas_offline: CloudOff,
  actividad: History, super_admin: Shield,
};

const COLLAPSE_KEY = 'sanamex_sidebar_colapsado';

const Sidebar = ({ userRole, onLogout }: SidebarProps) => {
  const location = useLocation();
  const { user } = useAuth();
  const { getNivel, isBypass, loading } = useModuleAccess(user?.id, userRole);
  const [pendientesAprob, setPendientesAprob] = useState(0);
  const esAprobador = ['gerente','admin','super_admin'].includes(userRole);

  // Colapsado "fijo" (se recuerda entre sesiones) + expansión temporal al pasar
  // el cursor, que no empuja el contenido de la página (flyout absoluto).
  const [colapsado, setColapsado] = useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [hover, setHover] = useState(false);
  const expandido = !colapsado || hover;

  const toggleColapsado = () => {
    setColapsado(prev => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      return next;
    });
    setHover(false);
  };


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
    super_admin: 'Super Administrador', admin: 'Administrador', direccion: 'Dirección',
    gerente: 'Gerente', subgerente: 'Subgerente', supervisor: 'Supervisor',
    ventas: 'Ventas', cajero: 'Cajero', almacen: 'Almacén', almacen_ventas: 'Almacén y Ventas',
    compras: 'Compras', repartidor: 'Repartidor',
    auditoria: 'Auditoría', auditor: 'Auditor',
    contabilidad: 'Contabilidad', contador: 'Contador',
    contraloria: 'Contraloría', tesoreria: 'Tesorería',
  };

  // Filtrar módulos por acceso
  const visibles = MODULOS.filter(m => {
    if (isBypass) return true;
    return getNivel(m.key) !== 'sin_acceso';
  });

  // Categorías con orden
  const CAT_ORDER = ['Catálogos','Operaciones','Inventario','Análisis','Finanzas','Fiscal','Nómina','Sistema'];
  const grouped = visibles.reduce((acc, m) => {
    (acc[m.categoria] = acc[m.categoria] || []).push(m);
    return acc;
  }, {} as Record<string, typeof MODULOS>);

  // Ítem de gestión de usuarios (solo super_admin)
  const showGestion = userRole === 'super_admin';

  return (
    <div
      className={cn('relative h-screen shrink-0 transition-[width] duration-200', colapsado ? 'w-16' : 'w-64')}
      onMouseEnter={() => colapsado && setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className={cn(
          'absolute inset-y-0 left-0 flex h-screen flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200',
          expandido ? 'w-64' : 'w-16',
          colapsado && hover ? 'z-50 shadow-2xl' : 'z-30'
        )}
      >
      <div className="sticky top-0 z-10 border-b border-sidebar-border bg-sidebar">
        <div className="flex h-20 items-center justify-between gap-2 px-3">
          <img src={sanamexLogo.url} alt="Sanamex"
            className={cn('w-auto rounded-xl object-contain shadow-sm transition-all', expandido ? 'h-12' : 'h-9')} />
          {expandido && (
            <Button variant="ghost" size="icon"
              className="h-8 w-8 shrink-0 text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={toggleColapsado}
              title={colapsado ? 'Fijar sidebar expandido' : 'Colapsar sidebar'}>
              {colapsado ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </Button>
          )}
        </div>
        {expandido && (
          <div className="px-3 pb-3 space-y-2">
            <div className="rounded-lg bg-sidebar-accent p-3">
              <p className="text-xs text-sidebar-accent-foreground/70">Rol</p>
              <p className="font-semibold text-sidebar-accent-foreground">{roleLabels[userRole]}</p>
            </div>
            <SucursalSelector />
          </div>
        )}
      </div>

      <div className={cn('flex-1 overflow-y-auto py-4', expandido ? 'px-3' : 'px-2')}>
        <nav className="space-y-1">
          {/* Dashboard siempre */}
          <div className="mb-3">
            <Link to="/dashboard" title="Dashboard"
              className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                !expandido && 'justify-center px-0',
                location.pathname === '/dashboard'
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent')}>
              <LayoutDashboard className="h-5 w-5 shrink-0" />
              {expandido && <span className="flex-1 truncate">Dashboard</span>}
            </Link>
            <Link to="/mi-nomina" title="Mi Nómina"
              className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                !expandido && 'justify-center px-0',
                location.pathname === '/mi-nomina'
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent')}>
              <Wallet className="h-5 w-5 shrink-0" />
              {expandido && <span className="flex-1 truncate">Mi Nómina</span>}
            </Link>
          </div>

          {CAT_ORDER.filter(c => grouped[c]?.length).map(cat => (
            <div key={cat} className="mb-3">
              {expandido
                ? <p className="px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">{cat}</p>
                : <div className="mx-2 my-2 border-t border-sidebar-border" />}
              {grouped[cat].map(m => {
                const isActive = location.pathname === m.path;
                const Icon = ICONS[m.key] || Package;
                const badge = m.key === 'compras' && esAprobador && pendientesAprob > 0;
                return (
                  <Link key={m.key} to={m.path} title={m.label}
                    className={cn('relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      !expandido && 'justify-center px-0',
                      isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                               : 'text-sidebar-foreground hover:bg-sidebar-accent')}>
                    <Icon className="h-5 w-5 shrink-0" />
                    {expandido && <span className="flex-1 truncate">{m.label}</span>}
                    {badge && (expandido
                      ? <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{pendientesAprob}</Badge>
                      : <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />)}
                  </Link>
                );
              })}
            </div>
          ))}

          {showGestion && (
            <div className="mb-3">
              {expandido
                ? <p className="px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">Administración</p>
                : <div className="mx-2 my-2 border-t border-sidebar-border" />}
              <Link to="/super-admin/usuarios" title="Gestión de Usuarios"
                className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  !expandido && 'justify-center px-0',
                  location.pathname === '/super-admin/usuarios'
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent')}>
                <UserCog className="h-5 w-5 shrink-0" />
                {expandido && <span className="flex-1 truncate">Gestión de Usuarios</span>}
              </Link>
            </div>
          )}
        </nav>
      </div>

      <div className={cn('border-t border-sidebar-border', expandido ? 'p-4' : 'p-2')}>
        {!expandido && (
          <Button variant="ghost" size="icon"
            className="mb-1 w-full text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={toggleColapsado} title="Fijar sidebar expandido">
            <PanelLeftOpen className="h-5 w-5" />
          </Button>
        )}
        <Button variant="ghost"
          className={cn('w-full gap-3 text-sidebar-foreground hover:bg-sidebar-accent',
            expandido ? 'justify-start' : 'justify-center px-0')}
          onClick={onLogout} title="Cerrar Sesión">
          <LogOut className="h-5 w-5 shrink-0" />
          {expandido && 'Cerrar Sesión'}
        </Button>
      </div>
      </div>
    </div>
  );
};


export default Sidebar;
