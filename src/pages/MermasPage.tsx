import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Search, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const origenLabels: Record<string, { label: string; color: string }> = {
  compra: { label: 'Recepción', color: 'default' },
  traspaso: { label: 'Traspaso', color: 'secondary' },
  pedido: { label: 'Entrega/Ruta', color: 'outline' },
  ajuste: { label: 'Almacén', color: 'destructive' },
};

const MermasPage = () => {
  const { selectedSucursal } = useSucursal();
  const [mermas, setMermas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('todas');

  useEffect(() => { if (selectedSucursal) loadMermas(); }, [selectedSucursal]);

  const loadMermas = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    const { data, error } = await supabase.from('movimientos_inventario')
      .select('*, lotes(numero_lote, costo_unitario, productos(nombre, sku)), motivos_ajuste(nombre), profiles:usuario_id(nombre)')
      .eq('tipo', 'merma')
      .eq('sucursal_id', selectedSucursal.id)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) { toast.error('Error cargando mermas'); console.error(error); }
    else setMermas(data || []);
    setLoading(false);
  };

  const filtered = mermas.filter(m => {
    if (tab !== 'todas' && m.referencia_tipo !== tab) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return (m.lotes as any)?.productos?.nombre?.toLowerCase().includes(s) ||
      (m.lotes as any)?.numero_lote?.toLowerCase().includes(s) ||
      m.notas?.toLowerCase().includes(s);
  });

  const totalCostoPerdido = filtered.reduce((sum, m) => sum + (m.cantidad * (m.costo_unitario || (m.lotes as any)?.costo_unitario || 0)), 0);
  const totalUnidades = filtered.reduce((sum, m) => sum + m.cantidad, 0);

  const mermasPorOrigen = {
    compra: mermas.filter(m => m.referencia_tipo === 'compra').length,
    traspaso: mermas.filter(m => m.referencia_tipo === 'traspaso').length,
    pedido: mermas.filter(m => m.referencia_tipo === 'pedido').length,
    ajuste: mermas.filter(m => !m.referencia_tipo || m.referencia_tipo === 'ajuste').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="h-6 w-6 text-destructive" /> Mermas</h1>
        <p className="text-muted-foreground">{selectedSucursal?.nombre} — Registro detallado de pérdidas con impacto financiero</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Mermas</p><p className="text-2xl font-bold">{filtered.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Unidades Perdidas</p><p className="text-2xl font-bold text-destructive">{totalUnidades.toLocaleString()}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Costo Total Perdido</p><p className="text-2xl font-bold text-destructive">${totalCostoPerdido.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Costo Promedio</p><p className="text-2xl font-bold">${filtered.length > 0 ? (totalCostoPerdido / filtered.length).toFixed(2) : '0.00'}</p></CardContent></Card>
      </div>

      {/* Origin breakdown */}
      <div className="grid grid-cols-4 gap-3">
        {Object.entries(origenLabels).map(([key, cfg]) => (
          <Card key={key} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setTab(key)}>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">{cfg.label}</p>
              <p className="text-xl font-bold">{mermasPorOrigen[key as keyof typeof mermasPorOrigen]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-3 items-center">
        <Tabs value={tab} onValueChange={setTab} className="flex-1">
          <TabsList>
            <TabsTrigger value="todas">Todas</TabsTrigger>
            <TabsTrigger value="compra">Recepción</TabsTrigger>
            <TabsTrigger value="traspaso">Traspaso</TabsTrigger>
            <TabsTrigger value="pedido">Entrega</TabsTrigger>
            <TabsTrigger value="ajuste">Almacén</TabsTrigger>
          </TabsList>
        </Tabs>
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
                <TableHead>Origen</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
                <TableHead className="text-right">Costo Unit.</TableHead>
                <TableHead className="text-right">Costo Total</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={10} className="text-center py-8">Cargando...</TableCell></TableRow> :
               filtered.length === 0 ? <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Sin mermas registradas</TableCell></TableRow> :
               filtered.map(m => {
                const costoUnit = m.costo_unitario || (m.lotes as any)?.costo_unitario || 0;
                const costoTotal = m.cantidad * costoUnit;
                const origen = origenLabels[m.referencia_tipo] || origenLabels.ajuste;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs">{new Date(m.created_at).toLocaleDateString('es-MX')}</TableCell>
                    <TableCell className="font-medium">{(m.lotes as any)?.productos?.nombre}</TableCell>
                    <TableCell className="font-mono text-xs">{(m.lotes as any)?.numero_lote}</TableCell>
                    <TableCell><Badge variant={origen.color as any}>{origen.label}</Badge></TableCell>
                    <TableCell className="text-right font-bold text-destructive">{m.cantidad}</TableCell>
                    <TableCell className="text-right">${Number(costoUnit).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">${costoTotal.toFixed(2)}</TableCell>
                    <TableCell>{(m.profiles as any)?.nombre || '—'}</TableCell>
                    <TableCell>{(m.motivos_ajuste as any)?.nombre || '—'}</TableCell>
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
