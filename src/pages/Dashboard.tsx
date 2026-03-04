import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { UserRole } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Package, Truck, AlertCircle, Warehouse, FileSpreadsheet, BarChart3,
  ArrowLeftRight, Clock, CheckCircle2, AlertTriangle, ShoppingCart,
  PackageCheck, Activity, CalendarDays, ArrowRight, ArrowUpRight
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

interface DashboardProps {
  userRole: UserRole;
}

interface PendingItem {
  id: string;
  type: 'compra' | 'pedido' | 'traspaso';
  label: string;
  detail: string;
  estado: string;
  path: string;
}

interface AlertItem {
  id: string;
  type: 'caducidad' | 'stock_bajo';
  product: string;
  detail: string;
  severity: 'warning' | 'destructive';
}

interface RecentActivity {
  id: string;
  description: string;
  timestamp: string;
  tipo: string;
}

const quickActionsByRole: Record<UserRole, Array<{ path: string; icon: any; label: string }>> = {
  admin: [
    { path: '/productos', icon: Package, label: 'Productos' },
    { path: '/inventario', icon: Warehouse, label: 'Inventario' },
    { path: '/compras', icon: ShoppingCart, label: 'Compras' },
    { path: '/pedidos', icon: PackageCheck, label: 'Pedidos' },
    { path: '/traspasos', icon: ArrowLeftRight, label: 'Traspasos' },
    { path: '/margenes', icon: BarChart3, label: 'Márgenes' },
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes' },
  ],
  gerente: [
    { path: '/inventario', icon: Warehouse, label: 'Inventario' },
    { path: '/compras', icon: ShoppingCart, label: 'Compras' },
    { path: '/rutas', icon: Truck, label: 'Rutas' },
    { path: '/margenes', icon: BarChart3, label: 'Márgenes' },
  ],
  cajero: [
    { path: '/inventario', icon: Warehouse, label: 'Inventario' },
    { path: '/pedidos', icon: PackageCheck, label: 'Pedidos' },
  ],
  almacen: [
    { path: '/inventario', icon: Warehouse, label: 'Inventario' },
    { path: '/traspasos', icon: ArrowLeftRight, label: 'Traspasos' },
    { path: '/compras', icon: ShoppingCart, label: 'Compras' },
  ],
  repartidor: [
    { path: '/rutas', icon: Truck, label: 'Mis Rutas' },
  ],
  auditor: [
    { path: '/actividad', icon: Activity, label: 'Auditoría' },
    { path: '/margenes', icon: BarChart3, label: 'Márgenes' },
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes' },
  ],
};

const estadoBadge = (estado: string) => {
  const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    en_transito: { variant: 'default', label: 'En Tránsito' },
    ordenada: { variant: 'secondary', label: 'Ordenada' },
    pendiente: { variant: 'outline', label: 'Pendiente' },
    en_ruta: { variant: 'default', label: 'En Ruta' },
    preparando: { variant: 'secondary', label: 'Preparando' },
    aprobado: { variant: 'secondary', label: 'Aprobado' },
  };
  const m = map[estado] || { variant: 'outline' as const, label: estado };
  return <Badge variant={m.variant} className="text-[10px] px-1.5 py-0">{m.label}</Badge>;
};

const tipoIcon: Record<string, string> = {
  entrada: '📥',
  salida: '📤',
  ajuste: '🔧',
  merma: '⚠️',
  traspaso_entrada: '📥',
  traspaso_salida: '📤',
};

const Dashboard = ({ userRole }: DashboardProps) => {
  const { selectedSucursal } = useSucursal();
  const [productosActivos, setProductosActivos] = useState(0);
  const [lotesPorVencer, setLotesPorVencer] = useState(0);
  const [rutasActivas, setRutasActivas] = useState(0);
  const [comprasPendientes, setComprasPendientes] = useState(0);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);

  const roleLabels: Record<UserRole, string> = {
    admin: 'Administrador',
    gerente: 'Gerente de Sucursal',
    cajero: 'Cajero',
    almacen: 'Almacenista',
    repartidor: 'Repartidor',
    auditor: 'Auditor',
  };

  useEffect(() => {
    if (selectedSucursal) loadAll();
  }, [selectedSucursal]);

  const loadAll = async () => {
    await Promise.all([loadKPIs(), loadPendingItems(), loadAlerts(), loadRecentActivity()]);
  };

  const getAlmacenIds = async (): Promise<string[]> => {
    if (!selectedSucursal) return [];
    const { data } = await supabase.from('almacenes').select('id').eq('sucursal_id', selectedSucursal.id);
    return (data || []).map(a => a.id);
  };

  const loadKPIs = async () => {
    if (!selectedSucursal) return;
    const today = new Date().toISOString().split('T')[0];
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);

    const almacenIds = await getAlmacenIds();

    const [prodRes, rutasRes, comprasRes] = await Promise.all([
      supabase.from('productos').select('id', { count: 'exact', head: true }).eq('activo', true),
      supabase.from('rutas').select('id', { count: 'exact', head: true }).eq('sucursal_id', selectedSucursal.id).in('estado', ['preparando', 'en_ruta']),
      supabase.from('compras').select('id', { count: 'exact', head: true }).eq('sucursal_id', selectedSucursal.id).in('estado', ['ordenada', 'en_transito']),
    ]);

    // Count lotes por vencer in this sucursal's almacenes
    let lotesCount = 0;
    if (almacenIds.length > 0) {
      const { data: invLotes } = await supabase
        .from('inventario')
        .select('lote_id, lotes(fecha_caducidad)')
        .in('almacen_id', almacenIds)
        .gt('cantidad', 0);
      if (invLotes) {
        const loteIds = new Set<string>();
        for (const inv of invLotes) {
          const cad = (inv as any).lotes?.fecha_caducidad;
          if (cad && cad >= today && cad <= in30.toISOString().split('T')[0] && !loteIds.has(inv.lote_id)) {
            loteIds.add(inv.lote_id);
            lotesCount++;
          }
        }
      }
    }

    setProductosActivos(prodRes.count || 0);
    setLotesPorVencer(lotesCount);
    setRutasActivas(rutasRes.count || 0);
    setComprasPendientes(comprasRes.count || 0);
  };

  const loadPendingItems = async () => {
    if (!selectedSucursal) return;
    const items: PendingItem[] = [];

    const [{ data: compras }, { data: pedidos }, { data: traspasos }] = await Promise.all([
      supabase.from('compras').select('id, numero_compra, estado').eq('sucursal_id', selectedSucursal.id).in('estado', ['ordenada', 'en_transito']).order('created_at', { ascending: false }).limit(4),
      supabase.from('pedidos').select('id, numero_pedido, estado').eq('sucursal_id', selectedSucursal.id).in('estado', ['en_ruta', 'pendiente']).order('created_at', { ascending: false }).limit(4),
      supabase.from('traspasos').select('id, estado, almacen_origen_id, almacenes!traspasos_almacen_origen_id_fkey(sucursal_id)').in('estado', ['pendiente', 'aprobado']).order('created_at', { ascending: false }).limit(4),
    ]);

    compras?.forEach(c => items.push({
      id: c.id, type: 'compra', label: c.numero_compra,
      detail: c.estado === 'en_transito' ? 'Pendiente de recepción' : 'Pendiente de envío',
      estado: c.estado, path: '/compras',
    }));

    pedidos?.forEach(p => items.push({
      id: p.id, type: 'pedido', label: p.numero_pedido,
      detail: p.estado === 'en_ruta' ? 'En camino' : 'Por enviar',
      estado: p.estado, path: '/pedidos',
    }));

    // Filter traspasos by sucursal
    traspasos?.forEach(t => {
      const sucId = (t as any).almacenes?.sucursal_id;
      if (sucId === selectedSucursal.id) {
        items.push({
          id: t.id, type: 'traspaso', label: 'Traspaso',
          detail: t.estado === 'pendiente' ? 'Esperando aprobación' : 'Por completar',
          estado: t.estado, path: '/traspasos',
        });
      }
    });

    setPendingItems(items.slice(0, 6));
  };

  const loadAlerts = async () => {
    if (!selectedSucursal) return;
    const alertItems: AlertItem[] = [];
    const today = new Date().toISOString().split('T')[0];
    const in15 = new Date();
    in15.setDate(in15.getDate() + 15);
    const almacenIds = await getAlmacenIds();

    if (almacenIds.length > 0) {
      const { data: invData } = await supabase
        .from('inventario')
        .select('cantidad, lotes(id, numero_lote, fecha_caducidad, producto_id, productos(nombre, stock_minimo))')
        .in('almacen_id', almacenIds)
        .gt('cantidad', 0);

      if (invData) {
        const seenLotes = new Set<string>();
        const stockByProduct: Record<string, { nombre: string; total: number; minimo: number }> = {};

        for (const inv of invData) {
          const lote = (inv as any).lotes;
          const prod = lote?.productos;
          if (!lote || !prod) continue;

          // Caducidad
          if (lote.fecha_caducidad && lote.fecha_caducidad >= today && lote.fecha_caducidad <= in15.toISOString().split('T')[0] && !seenLotes.has(lote.id)) {
            seenLotes.add(lote.id);
            alertItems.push({
              id: lote.id, type: 'caducidad', product: prod.nombre,
              detail: `Lote ${lote.numero_lote} — vence ${lote.fecha_caducidad}`,
              severity: 'warning',
            });
          }

          // Stock
          const pid = lote.producto_id;
          if (!stockByProduct[pid]) stockByProduct[pid] = { nombre: prod.nombre, total: 0, minimo: prod.stock_minimo || 10 };
          stockByProduct[pid].total += inv.cantidad;
        }

        for (const [id, info] of Object.entries(stockByProduct)) {
          if (info.total < info.minimo && alertItems.length < 6) {
            alertItems.push({
              id, type: 'stock_bajo', product: info.nombre,
              detail: `${info.total} uds (mín. ${info.minimo})`,
              severity: 'destructive',
            });
          }
        }
      }
    }

    setAlerts(alertItems.slice(0, 6));
  };

  const loadRecentActivity = async () => {
    if (!selectedSucursal) return;
    const almacenIds = await getAlmacenIds();
    if (almacenIds.length === 0) { setRecentActivity([]); return; }

    const { data } = await supabase
      .from('movimientos_inventario')
      .select('id, tipo, cantidad, created_at, lotes(numero_lote, productos(nombre))')
      .in('almacen_id', almacenIds)
      .order('created_at', { ascending: false })
      .limit(5);

    if (data) {
      setRecentActivity(data.map(m => ({
        id: m.id,
        tipo: m.tipo,
        description: `${(m as any).lotes?.productos?.nombre || 'Producto'} — ${Math.abs(m.cantidad)} uds`,
        timestamp: m.created_at || '',
      })));
    }
  };

  const quickActions = quickActionsByRole[userRole] || [];

  const kpiCards = [
    { title: 'Productos', value: productosActivos, icon: Package, color: 'text-primary', bg: 'bg-primary/10' },
    { title: 'Compras Pendientes', value: comprasPendientes, icon: ShoppingCart, color: 'text-warning', bg: 'bg-warning/10' },
    { title: 'Lotes por Vencer', value: lotesPorVencer, icon: AlertCircle, color: lotesPorVencer > 0 ? 'text-destructive' : 'text-muted-foreground', bg: lotesPorVencer > 0 ? 'bg-destructive/10' : 'bg-muted' },
    { title: 'Rutas Activas', value: rutasActivas, icon: Truck, color: 'text-accent', bg: 'bg-accent/10' },
  ];

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{roleLabels[userRole]} · {selectedSucursal?.nombre || '—'}</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {format(new Date(), "d MMM yyyy", { locale: es })}
          </span>
          {/* Quick nav pills */}
          <div className="flex gap-1">
            {quickActions.slice(0, 5).map(a => (
              <Link key={a.path} to={a.path}
                className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                <a.icon className="h-3 w-3" />
                <span className="hidden md:inline">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {kpiCards.map(kpi => (
          <Card key={kpi.title} className="border-none shadow-sm">
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${kpi.bg}`}>
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold leading-none">{kpi.value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 tracking-wide">{kpi.title}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main 3-column grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Pendientes */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">Pendientes</CardTitle>
              </div>
              {pendingItems.length > 0 && <Badge variant="secondary" className="text-[10px]">{pendingItems.length}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {pendingItems.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mb-1 text-accent" />
                <p className="text-xs font-medium">Todo al día</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {pendingItems.map(item => (
                  <Link key={item.id} to={item.path}
                    className="flex items-center gap-2.5 rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors group">
                    {item.type === 'compra' && <ShoppingCart className="h-3.5 w-3.5 text-primary shrink-0" />}
                    {item.type === 'pedido' && <PackageCheck className="h-3.5 w-3.5 text-accent shrink-0" />}
                    {item.type === 'traspaso' && <ArrowLeftRight className="h-3.5 w-3.5 text-warning shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.label}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{item.detail}</p>
                    </div>
                    {estadoBadge(item.estado)}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alertas */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <CardTitle className="text-sm font-semibold">Alertas</CardTitle>
              </div>
              {alerts.length > 0 && <Badge variant="destructive" className="text-[10px]">{alerts.length}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center py-6 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mb-1 text-accent" />
                <p className="text-xs font-medium">Sin alertas</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {alerts.map(alert => (
                  <div key={alert.id}
                    className={`flex items-center gap-2.5 rounded-md border px-3 py-2 ${
                      alert.severity === 'destructive' ? 'border-destructive/20 bg-destructive/5' : 'border-warning/20 bg-warning/5'
                    }`}>
                    {alert.type === 'caducidad'
                      ? <AlertCircle className={`h-3.5 w-3.5 shrink-0 ${alert.severity === 'destructive' ? 'text-destructive' : 'text-warning'}`} />
                      : <Package className="h-3.5 w-3.5 text-destructive shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{alert.product}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{alert.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actividad Reciente */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2 px-4 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-semibold">Actividad Reciente</CardTitle>
              </div>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" asChild>
                <Link to="/actividad">Ver todo <ArrowUpRight className="h-3 w-3 ml-0.5" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {recentActivity.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">Sin actividad reciente</p>
            ) : (
              <div className="space-y-0">
                {recentActivity.map((act, idx) => (
                  <div key={act.id} className="flex gap-3 items-start">
                    <div className="flex flex-col items-center pt-1.5">
                      <span className="text-sm leading-none">{tipoIcon[act.tipo] || '📋'}</span>
                      {idx < recentActivity.length - 1 && <div className="w-px flex-1 bg-border mt-1" style={{ minHeight: 16 }} />}
                    </div>
                    <div className="pb-3 flex-1 min-w-0">
                      <p className="text-xs leading-snug">{act.description}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {act.timestamp && formatDistanceToNow(new Date(act.timestamp), { addSuffix: true, locale: es })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
