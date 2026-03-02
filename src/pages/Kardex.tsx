import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { toast } from 'sonner';
import { Search, TrendingUp, TrendingDown, RefreshCw, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const Kardex = () => {
  const { selectedSucursal } = useSucursal();
  const [searchTerm, setSearchTerm] = useState('');
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tipoFiltro, setTipoFiltro] = useState<string>('todos');

  useEffect(() => {
    if (selectedSucursal) fetchMovimientos();
  }, [selectedSucursal, tipoFiltro]);

  const fetchMovimientos = async () => {
    try {
      if (!selectedSucursal) return;
      setLoading(true);

      let query = supabase
        .from('movimientos_inventario')
        .select('*')
        .eq('sucursal_id', selectedSucursal.id)
        .order('created_at', { ascending: false })
        .limit(200);

      if (tipoFiltro !== 'todos') {
        query = query.eq('tipo', tipoFiltro);
      }

      const { data, error } = await query;
      if (error) throw error;
      setMovimientos(data || []);
    } catch (error: any) {
      toast.error('Error al cargar movimientos', { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const getTipoBadge = (tipo: string) => {
    const map: Record<string, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
      entrada: { label: 'Entrada', variant: 'default' },
      salida: { label: 'Salida', variant: 'destructive' },
      ajuste: { label: 'Ajuste', variant: 'secondary' },
      merma: { label: 'Merma', variant: 'destructive' },
      traspaso_entrada: { label: 'Traspaso +', variant: 'default' },
      traspaso_salida: { label: 'Traspaso -', variant: 'destructive' },
      venta: { label: 'Venta', variant: 'destructive' },
      devolucion: { label: 'Devolución', variant: 'default' },
    };
    return map[tipo] || { label: tipo, variant: 'outline' as const };
  };

  const totalEntradas = movimientos.filter(m => ['entrada', 'traspaso_entrada', 'devolucion'].includes(m.tipo)).reduce((s, m) => s + m.cantidad, 0);
  const totalSalidas = movimientos.filter(m => ['salida', 'venta', 'traspaso_salida', 'merma'].includes(m.tipo)).reduce((s, m) => s + m.cantidad, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kardex de Inventario</h1>
        <p className="text-muted-foreground mt-1">Registro de movimientos por lote y sucursal</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" /> Entradas
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">{totalEntradas}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" /> Salidas
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-red-600">{totalSalidas}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-blue-600" /> Total Movimientos
            </CardTitle>
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-blue-600">{movimientos.length}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle>Movimientos Recientes</CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filtrar por tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="entrada">Entradas</SelectItem>
                  <SelectItem value="salida">Salidas</SelectItem>
                  <SelectItem value="venta">Ventas</SelectItem>
                  <SelectItem value="ajuste">Ajustes</SelectItem>
                  <SelectItem value="merma">Mermas</SelectItem>
                  <SelectItem value="traspaso_entrada">Traspaso +</SelectItem>
                  <SelectItem value="traspaso_salida">Traspaso -</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8" />
              </div>
            </div>
          </div>
          <CardDescription>Últimos 200 movimientos</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : movimientos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No hay movimientos registrados</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Cantidad</TableHead>
                    <TableHead className="text-right">Costo Unit.</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead>Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimientos.map((mov) => {
                    const badge = getTipoBadge(mov.tipo);
                    return (
                      <TableRow key={mov.id}>
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(mov.created_at), 'dd/MM/yy HH:mm', { locale: es })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold">{mov.cantidad}</TableCell>
                        <TableCell className="text-right">{mov.costo_unitario ? `$${Number(mov.costo_unitario).toFixed(2)}` : '—'}</TableCell>
                        <TableCell className="text-xs">{mov.referencia_tipo || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{mov.notas || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Kardex;
