import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, AlertTriangle, Warehouse } from 'lucide-react';
import { toast } from 'sonner';

const InventarioPage = () => {
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [selectedSucId, setSelectedSucId] = useState<string>('all');
  const [inventario, setInventario] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchProducto, setSearchProducto] = useState('');
  const [searchLote, setSearchLote] = useState('');

  useEffect(() => { loadSucursales(); }, []);
  useEffect(() => { loadInventario(); }, [selectedSucId]);

  const loadSucursales = async () => {
    const { data } = await supabase.from('sucursales').select('id, nombre, codigo').eq('activo', true);
    setSucursales(data || []);
  };

  const loadInventario = async () => {
    setLoading(true);
    // Get almacenes
    let almQuery = supabase.from('almacenes').select('id, nombre, sucursal_id, sucursales(nombre, codigo)');
    if (selectedSucId !== 'all') almQuery = almQuery.eq('sucursal_id', selectedSucId);
    const { data: almacenes } = await almQuery;

    if (!almacenes || almacenes.length === 0) { setInventario([]); setLoading(false); return; }

    const almacenIds = almacenes.map(a => a.id);
    const { data, error } = await supabase
      .from('inventario')
      .select('*, lotes(*, productos(*)), almacenes(nombre, sucursales(nombre, codigo))')
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

  // Group by sucursal for consolidated view
  const groupedBySucursal = filtered.reduce((acc, inv) => {
    const sucName = (inv as any).almacenes?.sucursales?.nombre || 'Sin sucursal';
    if (!acc[sucName]) acc[sucName] = [];
    acc[sucName].push(inv);
    return acc;
  }, {} as Record<string, any[]>);

  const totalUnidades = filtered.reduce((sum, inv) => sum + inv.cantidad, 0);
  const vencidos = filtered.filter(inv => isExpired(inv.lotes?.fecha_caducidad)).length;
  const proximos = filtered.filter(inv => isNearExpiry(inv.lotes?.fecha_caducidad)).length;

  const renderTable = (items: any[], showSucursal = false) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>SKU</TableHead>
          <TableHead>Producto</TableHead>
          <TableHead>Lote</TableHead>
          <TableHead>Caducidad</TableHead>
          {showSucursal && <TableHead>Sucursal</TableHead>}
          <TableHead>Almacén</TableHead>
          <TableHead className="text-right">Cantidad</TableHead>
          <TableHead>Estado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow><TableCell colSpan={showSucursal ? 8 : 7} className="text-center text-muted-foreground py-8">Sin inventario</TableCell></TableRow>
        ) : items.map((inv: any) => {
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
              {showSucursal && <TableCell>{(inv.almacenes as any)?.sucursales?.nombre}</TableCell>}
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
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inventario por Lote</h1>
        <p className="text-muted-foreground">Vista global de inventario por sucursal</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Registros</p><p className="text-2xl font-bold">{filtered.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Unidades</p><p className="text-2xl font-bold">{totalUnidades.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Vencidos</p><p className="text-2xl font-bold text-destructive">{vencidos}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Próx. a Vencer</p><p className="text-2xl font-bold text-warning">{proximos}</p></CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Warehouse className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedSucId} onValueChange={setSelectedSucId}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las sucursales</SelectItem>
                  {sucursales.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
          ) : selectedSucId === 'all' ? (
            // Consolidated view grouped by sucursal
            <div className="space-y-6">
              {Object.entries(groupedBySucursal).map(([sucName, items]: [string, any[]]) => (
                <div key={sucName}>
                  <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                    <Warehouse className="h-4 w-4" /> {sucName}
                    <Badge variant="outline">{items.length} registros — {items.reduce((s: number, i: any) => s + i.cantidad, 0)} uds</Badge>
                  </h3>
                  {renderTable(items, false)}
                </div>
              ))}
              {Object.keys(groupedBySucursal).length === 0 && <p className="text-center text-muted-foreground py-8">Sin inventario</p>}
            </div>
          ) : (
            renderTable(filtered, false)
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InventarioPage;
