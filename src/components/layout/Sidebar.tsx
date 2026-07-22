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
  Undo2, Upload, UserCog, ClipboardEdit
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
  ajustes_inventario: ClipboardEdit,
  rotacion: TrendingUp, rentabilidad_lotes: DollarSign, reportes: FileSpreadsheet,
  cuentas_por_pagar: Wallet, bancos: DollarSign, conciliacion: ArrowLeftRight,
  contabilidad: FileSpreadsheet, reportes_admin: FileSpreadsheet, cfdi: Receipt,
  impuestos: Receipt, nomina: Wallet, incidencias_nomina: UserCog, cargas_masivas: Upload, ventas_offline: CloudOff,
  actividad: History, super_admin: Shield,
};

const Sidebar = ({ userRole, onLogout }: SidebarProps) => {
  const location = useLocation();
  const { user } = useAuth();
  const { getNivel, isBypass, loading } = useModuleAccess(user?.id, userRole);
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
          {/* Dashboard siempre */}
          <div className="mb-3">
            <Link to="/dashboard"
              className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                location.pathname === '/dashboard'
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent')}>
              <LayoutDashboard className="h-5 w-5" />
              <span className="flex-1">Dashboard</span>
            </Link>
            <Link to="/mi-nomina"
              className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                location.pathname === '/mi-nomina'
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent')}>
              <Wallet className="h-5 w-5" />
              <span className="flex-1">Mi Nómina</span>
            </Link>
          </div>

          {CAT_ORDER.filter(c => grouped[c]?.length).map(cat => (
            <div key={cat} className="mb-3">
              <p className="px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">{cat}</p>
              {grouped[cat].map(m => {
                const isActive = location.pathname === m.path;
                const Icon = ICONS[m.key] || Package;
                return (
                  <Link key={m.key} to={m.path}
                    className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                               : 'text-sidebar-foreground hover:bg-sidebar-accent')}>
                    <Icon className="h-5 w-5" />
                    <span className="flex-1">{m.label}</span>
                    {m.key === 'compras' && esAprobador && pendientesAprob > 0 && (
                      <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{pendientesAprob}</Badge>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}

          {showGestion && (
            <div className="mb-3">
              <p className="px-3 py-2 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider">Administración</p>
              <Link to="/super-admin/usuarios"
                className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  location.pathname === '/super-admin/usuarios'
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent')}>
                <UserCog className="h-5 w-5" />
                <span className="flex-1">Gestión de Usuarios</span>
              </Link>
            </div>
          )}
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
