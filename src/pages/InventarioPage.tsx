import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const InventarioPage = () => {
  const { selectedSucursal } = useSucursal();
  const [inventario, setInventario] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (selectedSucursal) loadInventario();
  }, [selectedSucursal]);

  const loadInventario = async () => {
    if (!selectedSucursal) return;
    setLoading(true);

    // Get almacen for this sucursal
    const { data: almacenes } = await supabase
      .from('almacenes')
      .select('id')
      .eq('sucursal_id', selectedSucursal.id);

    if (!almacenes || almacenes.length === 0) {
      setInventario([]);
      setLoading(false);
      return;
    }

    const almacenIds = almacenes.map(a => a.id);

    const { data, error } = await supabase
      .from('inventario')
      .select(`*, lotes(*, productos(*))`)
      .in('almacen_id', almacenIds)
      .order('created_at', { ascending: false });

    if (error) { toast.error('Error cargando inventario'); console.error(error); }
    else setInventario(data || []);
    setLoading(false);
  };

  const filtered = inventario.filter(inv => {
    const prod = (inv as any).lotes?.productos;
    if (!prod) return false;
    return prod.nombre.toLowerCase().includes(search.toLowerCase()) ||
      prod.sku.toLowerCase().includes(search.toLowerCase());
  });

  const isExpired = (date: string) => date && new Date(date) < new Date();
  const isNearExpiry = (date: string) => {
    if (!date) return false;
    const d = new Date(date);
    const now = new Date();
    const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff > 0 && diff <= 90;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Inventario por Lote</h1>
        <p className="text-muted-foreground">
          {selectedSucursal ? `Sucursal: ${selectedSucursal.nombre}` : 'Seleccione una sucursal'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar producto..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
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
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin inventario</TableCell></TableRow>
                ) : (
                  filtered.map((inv: any) => {
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
                        <TableCell className="text-right font-bold">{inv.cantidad}</TableCell>
                        <TableCell>
                          {expired ? <Badge variant="destructive">Vencido</Badge> :
                           nearExpiry ? <Badge className="bg-warning text-warning-foreground">Próximo</Badge> :
                           inv.cantidad === 0 ? <Badge variant="secondary">Agotado</Badge> :
                           <Badge variant="default">OK</Badge>}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default InventarioPage;
