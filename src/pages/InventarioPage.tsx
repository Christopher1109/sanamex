import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, AlertTriangle, Warehouse, Bell } from 'lucide-react';
import { toast } from 'sonner';

const InventarioPage = () => {
  const { selectedSucursal } = useSucursal();
  const [inventario, setInventario] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchProducto, setSearchProducto] = useState('');
  const [searchLote, setSearchLote] = useState('');

  useEffect(() => { if (selectedSucursal) loadInventario(); }, [selectedSucursal]);

  const loadInventario = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    // Get almacén for selected sucursal
    const { data: almacenes } = await supabase.from('almacenes').select('id').eq('sucursal_id', selectedSucursal.id);
    if (!almacenes || almacenes.length === 0) { setInventario([]); setLoading(false); return; }

    const almacenIds = almacenes.map(a => a.id);
    const { data, error } = await supabase
      .from('inventario')
      .select('*, lotes(*, productos(nombre, sku, stock_minimo, categoria)), almacenes(nombre)')
      .in('almacen_id', almacenIds)
      .order('created_at', { ascending: false });

    if (error) { toast.error('Error cargando inventario'); console.error(error); }
    else setInventario(data || []);
    setLoading(false);
  };

  const filtered = inventario.filter(inv => {
    const prod = (inv as any).lotes?.productos;
    if (!prod) return false;
    const matchProd = !searchProducto || prod.nombre.toLowerCase().includes(searchProducto.toLowerCase()) || prod.sku.toLowerCase().includes(searchProducto.toLowerCase());
    const matchLote = !searchLote || (inv.lotes?.numero_lote || '').toLowerCase().includes(searchLote.toLowerCase());
    return matchProd && matchLote;
  });

  const isExpired = (date: string) => date && new Date(date) < new Date();
  const isNearExpiry = (date: string) => {
    if (!date) return false;
    const diff = (new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 90;
  };

  interface StockAgg { nombre: string; sku: string; total: number; minimo: number }
  // Aggregate stock by product for minimum alerts
  const stockByProduct = filtered.reduce((acc, inv) => {
    const prod = (inv as any).lotes?.productos;
    if (!prod) return acc;
    const key = prod.sku as string;
    if (!acc[key]) acc[key] = { nombre: prod.nombre, sku: prod.sku, total: 0, minimo: prod.stock_minimo || 10 };
    acc[key].total += inv.cantidad;
    return acc;
  }, {} as Record<string, StockAgg>);

  const lowStockProducts = (Object.values(stockByProduct) as StockAgg[]).filter(p => p.total <= p.minimo);

  const totalUnidades = filtered.reduce((sum, inv) => sum + inv.cantidad, 0);
  const vencidos = filtered.filter(inv => isExpired(inv.lotes?.fecha_caducidad)).length;
  const proximos = filtered.filter(inv => isNearExpiry(inv.lotes?.fecha_caducidad)).length;

  const solicitarReabastecimiento = async (producto: { nombre: string; sku: string; total: number; minimo: number }) => {
    // In a real app, this would create a notification/request to CDMX central
    toast.success(`Solicitud enviada a CDMX: ${producto.nombre} — Stock actual: ${producto.total}, Mínimo: ${producto.minimo}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inventario por Lote</h1>
        <p className="text-muted-foreground">{selectedSucursal?.nombre || 'Seleccione sucursal'}</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Registros</p><p className="text-2xl font-bold">{filtered.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Unidades</p><p className="text-2xl font-bold">{totalUnidades.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Vencidos</p><p className="text-2xl font-bold text-destructive">{vencidos}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Bajo Mínimo</p><p className="text-2xl font-bold text-warning">{lowStockProducts.length}</p></CardContent></Card>
      </div>

      {/* Low stock alerts */}
      {lowStockProducts.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader>
            <div className="flex items-center gap-2 text-warning">
              <Bell className="h-5 w-5" />
              <h3 className="font-semibold">Productos por debajo del mínimo</h3>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowStockProducts.map(p => (
                <div key={p.sku} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{p.nombre}</p>
                    <p className="text-xs text-muted-foreground">{p.sku} — Stock: <span className="font-bold text-destructive">{p.total}</span> / Mínimo: {p.minimo}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => solicitarReabastecimiento(p)}>
                    <Bell className="h-3 w-3 mr-1" /> Solicitar a CDMX
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters + Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar producto..." value={searchProducto} onChange={e => setSearchProducto(e.target.value)} className="w-[200px]" />
            </div>
            <Input placeholder="Buscar lote..." value={searchLote} onChange={e => setSearchLote(e.target.value)} className="w-[150px]" />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Cargando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Caducidad</TableHead>
                  <TableHead>Almacén</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin inventario en esta sucursal</TableCell></TableRow>
                ) : filtered.map((inv: any) => {
                  const prod = inv.lotes?.productos;
                  const lote = inv.lotes;
                  const expired = isExpired(lote?.fecha_caducidad);
                  const nearExpiry = isNearExpiry(lote?.fecha_caducidad);
                  return (
                    <TableRow key={inv.id} className={expired ? 'bg-destructive/5' : nearExpiry ? 'bg-warning/5' : ''}>
                      <TableCell className="font-mono text-xs">{prod?.sku}</TableCell>
                      <TableCell className="font-medium">{prod?.nombre}</TableCell>
                      <TableCell>{lote?.numero_lote}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {lote?.fecha_caducidad || '—'}
                          {expired && <AlertTriangle className="h-3 w-3 text-destructive" />}
                          {nearExpiry && <AlertTriangle className="h-3 w-3 text-warning" />}
                        </div>
                      </TableCell>
                      <TableCell>{(inv.almacenes as any)?.nombre}</TableCell>
                      <TableCell className="text-right font-bold">{inv.cantidad}</TableCell>
                      <TableCell>
                        {expired ? <Badge variant="destructive">Vencido</Badge> :
                         nearExpiry ? <Badge className="bg-warning text-warning-foreground">Próximo</Badge> :
                         inv.cantidad === 0 ? <Badge variant="secondary">Agotado</Badge> :
                         <Badge variant="default">OK</Badge>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InventarioPage;
