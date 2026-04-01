import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { UserRole } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Package, AlertCircle, Warehouse, FileSpreadsheet,
  ArrowLeftRight, Clock, CheckCircle2, AlertTriangle, ShoppingCart,
  PackageCheck, Activity, CalendarDays, ArrowRight, TrendingDown
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
  date: string;
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
  type: string;
}

const quickActionsByRole: Record<UserRole, Array<{
  path: string;
  icon: any;
  label: string;
  description: string;
}>> = {
  admin: [
    { path: '/productos', icon: Package, label: 'Productos', description: 'Gestionar catálogo' },
    { path: '/inventario', icon: Warehouse, label: 'Inventario', description: 'Ver existencias' },
    { path: '/compras', icon: ShoppingCart, label: 'Compras', description: 'Órdenes de compra' },
    { path: '/caducidades', icon: AlertCircle, label: 'Caducidades', description: 'Vencimientos' },
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes', description: 'Ver reportes' },
    { path: '/traspasos', icon: ArrowLeftRight, label: 'Traspasos', description: 'Entre sucursales' },
  ],
  gerente: [
    { path: '/inventario', icon: Warehouse, label: 'Inventario', description: 'Ver existencias' },
    { path: '/compras', icon: ShoppingCart, label: 'Compras', description: 'Órdenes de compra' },
    { path: '/caducidades', icon: AlertCircle, label: 'Caducidades', description: 'Vencimientos' },
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes', description: 'Ver reportes' },
  ],
  cajero: [
    { path: '/inventario', icon: Warehouse, label: 'Inventario', description: 'Ver existencias' },
    { path: '/pedidos', icon: PackageCheck, label: 'Pedidos', description: 'Gestionar pedidos' },
  ],
  almacen: [
    { path: '/inventario', icon: Warehouse, label: 'Inventario', description: 'Gestionar existencias' },
    { path: '/kardex', icon: FileSpreadsheet, label: 'Kardex', description: 'Ver movimientos' },
    { path: '/traspasos', icon: ArrowLeftRight, label: 'Traspasos', description: 'Entre sucursales' },
    { path: '/compras', icon: ShoppingCart, label: 'Compras', description: 'Recibir compras' },
  ],
  repartidor: [
    { path: '/pedidos', icon: PackageCheck, label: 'Mis Pedidos', description: 'Ver entregas' },
  ],
  auditor: [
    { path: '/actividad', icon: Activity, label: 'Auditoría', description: 'Ver logs' },
    { path: '/caducidades', icon: AlertCircle, label: 'Caducidades', description: 'Vencimientos' },
    { path: '/reportes', icon: FileSpreadsheet, label: 'Reportes', description: 'Operativos' },
  ],
};

const estadoBadge = (estado: string) => {
  const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
    en_transito: { variant: 'default', label: 'En Tránsito' },
    ordenada: { variant: 'secondary', label: 'Ordenada' },
    pendiente: { variant: 'outline', label: 'Pendiente' },
    en_ruta: { variant: 'default', label: 'En Ruta' },
    preparando: { variant: 'secondary', label: 'Preparando' },
  };
  const m = map[estado] || { variant: 'outline' as const, label: estado };
  return <Badge variant={m.variant}>{m.label}</Badge>;
};

const Dashboard = ({ userRole }: DashboardProps) => {
  const { selectedSucursal } = useSucursal();
  const [productosActivos, setProductosActivos] = useState(0);
  const [lotesPorVencer, setLotesPorVencer] = useState(0);
  const [comprasPendientes, setComprasPendientes] = useState(0);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [stockBajoCount, setStockBajoCount] = useState(0);

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

  const getAlmacenIds = async (): Promise<string[]> => {
    if (!selectedSucursal) return [];
    const { data } = await supabase.from('almacenes').select('id').eq('sucursal_id', selectedSucursal.id);
    return (data || []).map(a => a.id);
  };

  const loadAll = async () => {
    await Promise.all([loadKPIs(), loadPendingItems(), loadAlerts(), loadRecentActivity()]);
  };

  const loadKPIs = async () => {
    if (!selectedSucursal) return;
    const today = new Date().toISOString().split('T')[0];
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const almacenIds = await getAlmacenIds();

    const [prodRes, comprasRes] = await Promise.all([
      supabase.from('productos').select('id', { count: 'exact', head: true }).eq('activo', true),
      supabase.from('compras').select('id', { count: 'exact', head: true }).eq('sucursal_id', selectedSucursal.id).in('estado', ['ordenada', 'en_transito']),
    ]);

    let lotesCount = 0;
    if (almacenIds.length > 0) {
      const { data: invLotes } = await supabase
        .from('inventario')
        .select('lote_id, lotes(fecha_caducidad)')
        .in('almacen_id', almacenIds)
        .gt('cantidad', 0);
      if (invLotes) {
        const seen = new Set<string>();
        for (const inv of invLotes) {
          const cad = (inv as any).lotes?.fecha_caducidad;
          if (cad && cad >= today && cad <= in30.toISOString().split('T')[0] && !seen.has(inv.lote_id)) {
            seen.add(inv.lote_id);
            lotesCount++;
          }
        }
      }
    }

    setProductosActivos(prodRes.count || 0);
    setLotesPorVencer(lotesCount);
    setComprasPendientes(comprasRes.count || 0);
  };

  const loadPendingItems = async () => {
    if (!selectedSucursal) return;
    const items: PendingItem[] = [];

    const [{ data: compras }, { data: pedidos }, { data: traspasos }] = await Promise.all([
      supabase.from('compras').select('id, numero_compra, estado, created_at').eq('sucursal_id', selectedSucursal.id).in('estado', ['ordenada', 'en_transito']).order('created_at', { ascending: false }).limit(5),
      supabase.from('pedidos').select('id, numero_pedido, estado, created_at').eq('sucursal_id', selectedSucursal.id).in('estado', ['en_ruta', 'pendiente']).order('created_at', { ascending: false }).limit(5),
      supabase.from('traspasos').select('id, estado, created_at, almacen_origen_id, almacenes!traspasos_almacen_origen_id_fkey(sucursal_id)').in('estado', ['pendiente', 'aprobado']).order('created_at', { ascending: false }).limit(5),
    ]);

    compras?.forEach(c => items.push({
      id: c.id, type: 'compra', label: `Compra ${c.numero_compra}`,
      detail: c.estado === 'en_transito' ? 'Pendiente de recepción' : 'Pendiente de envío',
      estado: c.estado, date: c.created_at || '', path: '/compras',
    }));

    pedidos?.forEach(p => items.push({
      id: p.id, type: 'pedido', label: `Pedido ${p.numero_pedido}`,
      detail: p.estado === 'en_ruta' ? 'En camino al cliente' : 'Pendiente de enviar',
      estado: p.estado, date: p.created_at || '', path: '/pedidos',
    }));

    traspasos?.forEach(t => {
      const sucId = (t as any).almacenes?.sucursal_id;
      if (sucId === selectedSucursal.id) {
        items.push({
          id: t.id, type: 'traspaso', label: 'Traspaso',
          detail: t.estado === 'pendiente' ? 'Esperando aprobación' : 'Aprobado, pendiente de completar',
          estado: t.estado, date: t.created_at || '', path: '/traspasos',
        });
      }
    });

    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setPendingItems(items.slice(0, 8));
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

          if (lote.fecha_caducidad && lote.fecha_caducidad >= today && lote.fecha_caducidad <= in15.toISOString().split('T')[0] && !seenLotes.has(lote.id)) {
            seenLotes.add(lote.id);
            alertItems.push({
              id: lote.id, type: 'caducidad', product: prod.nombre,
              detail: `Lote ${lote.numero_lote} vence el ${lote.fecha_caducidad}`,
              severity: 'warning',
            });
          }

          const pid = lote.producto_id;
          if (!stockByProduct[pid]) stockByProduct[pid] = { nombre: prod.nombre, total: 0, minimo: prod.stock_minimo || 10 };
          stockByProduct[pid].total += inv.cantidad;
        }

        let lowCount = 0;
        for (const [id, info] of Object.entries(stockByProduct)) {
          if (info.total < info.minimo) {
            lowCount++;
            if (alertItems.length < 8) {
              alertItems.push({
                id, type: 'stock_bajo', product: info.nombre,
                detail: `Stock: ${info.total} / Mín: ${info.minimo}`,
                severity: 'destructive',
              });
            }
          }
        }
        setStockBajoCount(lowCount);
      }
    }

    setAlerts(alertItems);
  };

  const loadRecentActivity = async () => {
    if (!selectedSucursal) return;
    const almacenIds = await getAlmacenIds();
    if (almacenIds.length === 0) { setRecentActivity([]); return; }

    const { data } = await supabase
      .from('movimientos_inventario')
      .select('id, tipo, cantidad, created_at, notas, lotes(numero_lote, productos(nombre))')
      .in('almacen_id', almacenIds)
      .order('created_at', { ascending: false })
      .limit(6);

    if (data) {
      const tipoLabel: Record<string, string> = {
        entrada: '📥 Entrada', salida: '📤 Salida', ajuste: '🔧 Ajuste',
        merma: '⚠️ Merma', traspaso_entrada: '📥 Traspaso entrada', traspaso_salida: '📤 Traspaso salida',
      };
      setRecentActivity(data.map(m => ({
        id: m.id,
        description: `${tipoLabel[m.tipo] || m.tipo} — ${(m as any).lotes?.productos?.nombre || 'Producto'} (${Math.abs(m.cantidad)} uds) ${(m as any).lotes?.numero_lote ? `Lote: ${(m as any).lotes.numero_lote}` : ''}`,
        timestamp: m.created_at || '',
        type: m.tipo,
      })));
    }
  };

  const quickActions = quickActionsByRole[userRole] || [];
  const pendingCount = pendingItems.length;
  const alertCount = alerts.length;

  const kpiCards = [
    { title: 'Productos Activos', value: productosActivos, subtitle: 'En catálogo', icon: Package, color: 'text-primary', bgColor: 'bg-primary/10' },
    { title: 'Compras Pendientes', value: comprasPendientes, subtitle: 'Por recibir', icon: ShoppingCart, color: 'text-warning', bgColor: 'bg-warning/10' },
    { title: 'Lotes por Vencer', value: lotesPorVencer, subtitle: 'Próximos 30 días', icon: AlertCircle,
      color: lotesPorVencer > 0 ? 'text-destructive' : 'text-muted-foreground',
      bgColor: lotesPorVencer > 0 ? 'bg-destructive/10' : 'bg-muted' },
    { title: 'Stock Bajo', value: stockBajoCount, subtitle: 'Bajo mínimo', icon: TrendingDown,
      color: stockBajoCount > 0 ? 'text-destructive' : 'text-muted-foreground',
      bgColor: stockBajoCount > 0 ? 'bg-destructive/10' : 'bg-muted' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            {roleLabels[userRole]} — {selectedSucursal?.nombre || 'Sin sucursal'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="h-4 w-4" />
          {format(new Date(), "EEEE d 'de' MMMM, yyyy", { locale: es })}
        </div>
      </div>

      {/* Summary banner */}
      {(pendingCount > 0 || alertCount > 0) && (
        <div className="rounded-lg border bg-card p-4 flex items-center gap-4 flex-wrap">
          {pendingCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10">
                <Clock className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-medium">{pendingCount} pendiente{pendingCount !== 1 ? 's' : ''}</span>
            </div>
          )}
          {alertCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-destructive/10">
                <AlertTriangle className="h-4 w-4 text-destructive" />
              </div>
              <span className="text-sm font-medium">{alertCount} alerta{alertCount !== 1 ? 's' : ''}</span>
            </div>
          )}
          {stockBajoCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center h-8 w-8 rounded-full bg-warning/10">
                <Package className="h-4 w-4 text-warning" />
              </div>
              <span className="text-sm font-medium">{stockBajoCount} producto{stockBajoCount !== 1 ? 's' : ''} con stock bajo</span>
            </div>
          )}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.title} className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{kpi.title}</p>
                  <p className="text-3xl font-bold mt-1">{kpi.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{kpi.subtitle}</p>
                </div>
                <div className={`flex items-center justify-center h-12 w-12 rounded-xl ${kpi.bgColor}`}>
                  <kpi.icon className={`h-6 w-6 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main content: Pending + Alerts side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending items */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Pendientes</CardTitle>
              </div>
              {pendingCount > 0 && <Badge variant="secondary">{pendingCount}</Badge>}
            </div>
            <CardDescription>Operaciones que requieren atención</CardDescription>
          </CardHeader>
          <CardContent>
            {pendingItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mb-2 text-accent" />
                <p className="font-medium">¡Todo al día!</p>
                <p className="text-xs">No hay operaciones pendientes</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingItems.map((item) => (
                  <Link key={item.id} to={item.path}
                    className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors group">
                    <div className={`flex items-center justify-center h-9 w-9 rounded-lg shrink-0 ${
                      item.type === 'compra' ? 'bg-primary/10' : item.type === 'pedido' ? 'bg-accent/10' : 'bg-warning/10'
                    }`}>
                      {item.type === 'compra' && <ShoppingCart className="h-4 w-4 text-primary" />}
                      {item.type === 'pedido' && <PackageCheck className="h-4 w-4 text-accent" />}
                      {item.type === 'traspaso' && <ArrowLeftRight className="h-4 w-4 text-warning" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {estadoBadge(item.estado)}
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                <CardTitle className="text-lg">Alertas</CardTitle>
              </div>
              {alertCount > 0 && <Badge variant="destructive">{alertCount}</Badge>}
            </div>
            <CardDescription>Caducidades próximas y stock bajo</CardDescription>
          </CardHeader>
          <CardContent>
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-10 w-10 mb-2 text-accent" />
                <p className="font-medium">Sin alertas</p>
                <p className="text-xs">Todo dentro de los parámetros normales</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((alert) => (
                  <div key={alert.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 ${
                      alert.severity === 'destructive' ? 'border-destructive/30 bg-destructive/5' : 'border-warning/30 bg-warning/5'
                    }`}>
                    <div className={`flex items-center justify-center h-9 w-9 rounded-lg shrink-0 ${
                      alert.severity === 'destructive' ? 'bg-destructive/10' : 'bg-warning/10'
                    }`}>
                      {alert.type === 'caducidad'
                        ? <AlertCircle className={`h-4 w-4 ${alert.severity === 'destructive' ? 'text-destructive' : 'text-warning'}`} />
                        : <Package className="h-4 w-4 text-destructive" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{alert.product}</p>
                      <p className="text-xs text-muted-foreground">{alert.detail}</p>
                    </div>
                    <Badge variant={alert.severity === 'destructive' ? 'destructive' : 'outline'}>
                      {alert.type === 'caducidad' ? 'Vence pronto' : 'Stock bajo'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Actividad Reciente</CardTitle>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/actividad" className="flex items-center gap-1">
                Ver todo <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Sin actividad reciente</p>
          ) : (
            <div className="space-y-3">
              {recentActivity.map((act, idx) => (
                <div key={act.id} className="flex items-start gap-3">
                  <div className="relative flex flex-col items-center">
                    <div className="h-2 w-2 rounded-full bg-primary mt-2" />
                    {idx < recentActivity.length - 1 && (
                      <div className="w-px flex-1 bg-border mt-1" style={{ minHeight: '24px' }} />
                    )}
                  </div>
                  <div className="flex-1 pb-3">
                    <p className="text-sm">{act.description}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {act.timestamp && formatDistanceToNow(new Date(act.timestamp), { addSuffix: true, locale: es })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      {quickActions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Acciones Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              {quickActions.map((action) => (
                <Link key={action.path} to={action.path}
                  className="rounded-xl border p-4 transition-all hover:shadow-md hover:border-primary/30 flex flex-col items-center text-center group">
                  <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors mb-2">
                    <action.icon className="h-5 w-5 text-primary" />
                  </div>
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
