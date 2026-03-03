import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const MermasPage = () => {
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [selectedSucId, setSelectedSucId] = useState<string>('all');
  const [mermas, setMermas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    supabase.from('sucursales').select('id, nombre').eq('activo', true).then(({ data }) => setSucursales(data || []));
  }, []);

  useEffect(() => { loadMermas(); }, [selectedSucId]);

  const loadMermas = async () => {
    setLoading(true);
    let query = supabase.from('movimientos_inventario')
      .select('*, lotes(numero_lote, costo_unitario, productos(nombre, sku)), motivos_ajuste(nombre), profiles:usuario_id(nombre), sucursales:sucursal_id(nombre)')
      .eq('tipo', 'merma')
      .order('created_at', { ascending: false })
      .limit(200);

    if (selectedSucId !== 'all') query = query.eq('sucursal_id', selectedSucId);

    const { data, error } = await query;
    if (error) { toast.error('Error cargando mermas'); console.error(error); }
    else setMermas(data || []);
    setLoading(false);
  };

  const filtered = mermas.filter(m => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (m.lotes as any)?.productos?.nombre?.toLowerCase().includes(s) ||
      (m.lotes as any)?.numero_lote?.toLowerCase().includes(s) ||
      m.notas?.toLowerCase().includes(s);
  });

  const totalCostoPerdido = filtered.reduce((sum, m) => sum + (m.cantidad * (m.costo_unitario || (m.lotes as any)?.costo_unitario || 0)), 0);
  const totalUnidades = filtered.reduce((sum, m) => sum + m.cantidad, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="h-6 w-6 text-destructive" /> Mermas</h1>
        <p className="text-muted-foreground">Registro detallado de pérdidas con impacto financiero</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Mermas</p><p className="text-2xl font-bold">{filtered.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Unidades Perdidas</p><p className="text-2xl font-bold text-destructive">{totalUnidades.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Costo Total Perdido</p><p className="text-2xl font-bold text-destructive">${totalCostoPerdido.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p></CardContent></Card>
      </div>

      <div className="flex gap-3">
        <Select value={selectedSucId} onValueChange={setSelectedSucId}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las sucursales</SelectItem>
            {sucursales.map(s => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="w-[250px]" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Lote</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Costo Unit.</TableHead>
                <TableHead className="text-right">Costo Total</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={11} className="text-center py-8">Cargando...</TableCell></TableRow> :
               filtered.length === 0 ? <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Sin mermas registradas</TableCell></TableRow> :
               filtered.map(m => {
                const costoUnit = m.costo_unitario || (m.lotes as any)?.costo_unitario || 0;
                const costoTotal = m.cantidad * costoUnit;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs">{new Date(m.created_at).toLocaleDateString('es-MX')}</TableCell>
                    <TableCell className="font-medium">{(m.lotes as any)?.productos?.nombre}</TableCell>
                    <TableCell className="font-mono text-xs">{(m.lotes as any)?.numero_lote}</TableCell>
                    <TableCell>{(m.sucursales as any)?.nombre || '—'}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">{m.cantidad}</TableCell>
                    <TableCell className="text-right">${Number(costoUnit).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">${costoTotal.toFixed(2)}</TableCell>
                    <TableCell>{(m.profiles as any)?.nombre || '—'}</TableCell>
                    <TableCell>{(m.motivos_ajuste as any)?.nombre || '—'}</TableCell>
                    <TableCell className="text-xs">
                      {m.referencia_tipo ? <Badge variant="outline">{m.referencia_tipo}</Badge> : '—'}
                    </TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{m.notas || '—'}</TableCell>
                  </TableRow>
                );
               })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default MermasPage;
