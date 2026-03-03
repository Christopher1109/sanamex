import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, Package, AlertTriangle, TrendingUp } from 'lucide-react';

const ReportesPage = () => {
  const { selectedSucursal } = useSucursal();
  const [stats, setStats] = useState({ ventasMes: 0, totalProductos: 0, lotesVencidos: 0, movimientosMes: 0 });

  useEffect(() => { load(); }, [selectedSucursal]);

  const load = async () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const today = now.toISOString().split('T')[0];

    const [ventasRes, prodRes, lotesRes, movRes] = await Promise.all([
      supabase.from('ventas').select('total').gte('fecha', firstDay).eq('estado', 'completada'),
      supabase.from('productos').select('id', { count: 'exact', head: true }).eq('activo', true),
      supabase.from('lotes').select('id', { count: 'exact', head: true }).lt('fecha_caducidad', today),
      supabase.from('movimientos_inventario').select('id', { count: 'exact', head: true }).gte('created_at', firstDay),
    ]);

    setStats({
      ventasMes: (ventasRes.data || []).reduce((s, v) => s + Number(v.total), 0),
      totalProductos: prodRes.count || 0,
      lotesVencidos: lotesRes.count || 0,
      movimientosMes: movRes.count || 0,
    });
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Reportes</h1><p className="text-muted-foreground">Resumen operativo del mes</p></div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Ventas del Mes</CardTitle><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">${stats.ventasMes.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Productos Activos</CardTitle><Package className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.totalProductos}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Lotes Vencidos</CardTitle><AlertTriangle className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{stats.lotesVencidos}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Movimientos del Mes</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.movimientosMes}</div></CardContent></Card>
      </div>
    </div>
  );
};

export default ReportesPage;
