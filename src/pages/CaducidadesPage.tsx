import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { AlertCircle, AlertTriangle, Clock, Search, TrendingDown, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format, differenceInDays, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

interface LoteCaducidad {
  lote_id: string;
  numero_lote: string;
  fecha_caducidad: string;
  producto_nombre: string;
  producto_sku: string;
  categoria: string | null;
  cantidad: number;
  dias_restantes: number;
  costo_unitario: number;
}

interface ProductoLento {
  producto_id: string;
  producto_nombre: string;
  producto_sku: string;
  stock_actual: number;
  movimientos_30d: number;
  dias_cobertura: number | null;
}

const CaducidadesPage = () => {
  const { selectedSucursal } = useSucursal();
  const { user } = useAuth();
  const [lotes, setLotes] = useState<LoteCaducidad[]>([]);
  const [productosLentos, setProductosLentos] = useState<ProductoLento[]>([]);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [filtro, setFiltro] = useState('todos');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'caducidades' | 'lento_movimiento'>('caducidades');

  useEffect(() => {
    if (selectedSucursal) {
      loadData();
    }
  }, [selectedSucursal]);

  const getAlmacenIds = async (): Promise<string[]> => {
    if (!selectedSucursal) return [];
    const { data } = await supabase.from('almacenes').select('id').eq('sucursal_id', selectedSucursal.id);
    return (data || []).map(a => a.id);
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadCaducidades(), loadProductosLentos()]);
    setLoading(false);
  };

  const loadCaducidades = async () => {
    const almacenIds = await getAlmacenIds();
    if (almacenIds.length === 0) { setLotes([]); return; }

    const { data } = await supabase
      .from('inventario')
      .select('cantidad, lote_id, lotes(id, numero_lote, fecha_caducidad, costo_unitario, productos(nombre, sku, categoria))')
      .in('almacen_id', almacenIds)
      .gt('cantidad', 0);

    if (!data) { setLotes([]); return; }

    const today = new Date();
    const lotesMap = new Map<string, LoteCaducidad>();

    for (const inv of data) {
      const lote = (inv as any).lotes;
      const prod = lote?.productos;
      if (!lote?.fecha_caducidad || !prod) continue;

      const dias = differenceInDays(new Date(lote.fecha_caducidad), today);
      const existing = lotesMap.get(lote.id);

      if (existing) {
        existing.cantidad += inv.cantidad;
      } else {
        lotesMap.set(lote.id, {
          lote_id: lote.id,
          numero_lote: lote.numero_lote,
          fecha_caducidad: lote.fecha_caducidad,
          producto_nombre: prod.nombre,
          producto_sku: prod.sku,
          categoria: prod.categoria,
          cantidad: inv.cantidad,
          dias_restantes: dias,
          costo_unitario: lote.costo_unitario,
        });
      }
    }

    const sorted = Array.from(lotesMap.values()).sort((a, b) => a.dias_restantes - b.dias_restantes);
    setLotes(sorted);
  };

  const loadProductosLentos = async () => {
    const almacenIds = await getAlmacenIds();
    if (almacenIds.length === 0) { setProductosLentos([]); return; }

    const hace30 = addDays(new Date(), -30).toISOString();

    const [{ data: invData }, { data: movData }] = await Promise.all([
      supabase
        .from('inventario')
        .select('cantidad, lotes(producto_id, productos(id, nombre, sku))')
        .in('almacen_id', almacenIds)
        .gt('cantidad', 0),
      supabase
        .from('movimientos_inventario')
        .select('cantidad, tipo, lotes(producto_id)')
        .in('almacen_id', almacenIds)
        .eq('tipo', 'salida')
        .gte('created_at', hace30),
    ]);

    const stockMap = new Map<string, { nombre: string; sku: string; total: number }>();
    for (const inv of (invData || [])) {
      const prod = (inv as any).lotes?.productos;
      if (!prod) continue;
      const existing = stockMap.get(prod.id);
      if (existing) {
        existing.total += inv.cantidad;
      } else {
        stockMap.set(prod.id, { nombre: prod.nombre, sku: prod.sku, total: inv.cantidad });
      }
    }

    const salesMap = new Map<string, number>();
    for (const mov of (movData || [])) {
      const pid = (mov as any).lotes?.producto_id;
      if (!pid) continue;
      salesMap.set(pid, (salesMap.get(pid) || 0) + Math.abs(mov.cantidad));
    }

    const result: ProductoLento[] = [];
    for (const [pid, info] of stockMap) {
      const ventas30 = salesMap.get(pid) || 0;
      const diasCobertura = ventas30 > 0 ? Math.round((info.total / ventas30) * 30) : null;

      if (ventas30 <= 2 || (diasCobertura !== null && diasCobertura > 90)) {
        result.push({
          producto_id: pid,
          producto_nombre: info.nombre,
          producto_sku: info.sku,
          stock_actual: info.total,
          movimientos_30d: ventas30,
          dias_cobertura: diasCobertura,
        });
      }
    }

    result.sort((a, b) => a.movimientos_30d - b.movimientos_30d);
    setProductosLentos(result);
  };

  const getSeverity = (dias: number) => {
    if (dias < 0) return { label: 'Vencido', variant: 'destructive' as const, color: 'text-destructive' };
    if (dias <= 7) return { label: 'Crítico', variant: 'destructive' as const, color: 'text-destructive' };
    if (dias <= 15) return { label: 'Urgente', variant: 'default' as const, color: 'text-warning' };
    if (dias <= 30) return { label: 'Próximo', variant: 'secondary' as const, color: 'text-warning' };
    return { label: 'OK', variant: 'outline' as const, color: 'text-muted-foreground' };
  };

  const limpiarCaducados = async () => {
    if (!selectedSucursal) return;
    setCleaning(true);
    try {
      const almacenIds = await getAlmacenIds();
      if (almacenIds.length === 0) { toast.error('Sin almacenes'); return; }

      // Lotes vencidos con stock > 0
      const { data: invVencidos, error } = await supabase
        .from('inventario')
        .select('id, cantidad, almacen_id, lote_id, lotes!inner(id, numero_lote, fecha_caducidad, costo_unitario, producto_id, productos(nombre))')
        .in('almacen_id', almacenIds)
        .gt('cantidad', 0);

      if (error) { toast.error('Error consultando inventario'); console.error(error); return; }

      const hoy = new Date().toISOString().split('T')[0];
      const vencidosConStock = (invVencidos || []).filter((r: any) => r.lotes?.fecha_caducidad && r.lotes.fecha_caducidad < hoy);

      if (vencidosConStock.length === 0) {
        toast.info('No hay lotes caducados con stock para limpiar');
        return;
      }

      // Buscar motivo "Caducidad"
      const { data: motivo } = await supabase.from('motivos_ajuste').select('id').eq('nombre', 'Caducidad').limit(1).maybeSingle();

      let okCount = 0;
      let errCount = 0;
      for (const inv of vencidosConStock) {
        const lote: any = inv.lotes;
        // Movimiento de merma (Kardex)
        const { error: movErr } = await supabase.from('movimientos_inventario').insert({
          almacen_id: inv.almacen_id,
          lote_id: inv.lote_id,
          tipo: 'merma',
          cantidad: inv.cantidad,
          costo_unitario: lote?.costo_unitario || 0,
          motivo_id: motivo?.id || null,
          referencia_tipo: 'caducidad',
          sucursal_id: selectedSucursal.id,
          usuario_id: user?.id,
          notas: `Limpieza automática por caducidad. Lote ${lote?.numero_lote} (cad: ${lote?.fecha_caducidad}) — ${lote?.productos?.nombre}`,
        });
        if (movErr) { errCount++; continue; }
        // Poner inventario en 0
        const { error: updErr } = await supabase.from('inventario').update({ cantidad: 0 }).eq('id', inv.id);
        if (updErr) errCount++; else okCount++;
      }

      // Auditoría
      await supabase.from('audit_log').insert({
        entidad: 'inventario', accion: 'Limpieza de caducados',
        usuario_id: user?.id, usuario_nombre: user?.email,
        sucursal_id: selectedSucursal.id,
        datos_despues: { lotes_limpiados: okCount, errores: errCount },
      });

      toast.success(`Limpieza completa: ${okCount} lote(s) movidos a merma${errCount ? `, ${errCount} con error` : ''}`);
      await loadData();
    } finally {
      setCleaning(false);
    }
  };

  const filteredLotes = lotes.filter(l => {
    if (filtro === 'vencidos') return l.dias_restantes < 0;
    if (filtro === '7dias') return l.dias_restantes >= 0 && l.dias_restantes <= 7;
    if (filtro === '15dias') return l.dias_restantes >= 0 && l.dias_restantes <= 15;
    if (filtro === '30dias') return l.dias_restantes >= 0 && l.dias_restantes <= 30;
    return true;
  }).filter(l =>
    !search || l.producto_nombre.toLowerCase().includes(search.toLowerCase()) || l.numero_lote.toLowerCase().includes(search.toLowerCase())
  );

  const vencidos = lotes.filter(l => l.dias_restantes < 0).length;
  const criticos = lotes.filter(l => l.dias_restantes >= 0 && l.dias_restantes <= 7).length;
  const urgentes = lotes.filter(l => l.dias_restantes > 7 && l.dias_restantes <= 15).length;
  const proximos = lotes.filter(l => l.dias_restantes > 15 && l.dias_restantes <= 30).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Control de Caducidades y Alertas</h1>
        <p className="text-muted-foreground">
          Monitoreo de vencimientos y productos de lento movimiento — {selectedSucursal?.nombre}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <Card className={vencidos > 0 ? 'border-destructive/50 bg-destructive/5' : ''}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{vencidos}</p>
              <p className="text-xs text-muted-foreground">Vencidos</p>
            </div>
          </CardContent>
        </Card>
        <Card className={criticos > 0 ? 'border-destructive/30 bg-destructive/5' : ''}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{criticos}</p>
              <p className="text-xs text-muted-foreground">≤ 7 días</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-warning/10">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{urgentes}</p>
              <p className="text-xs text-muted-foreground">8–15 días</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{proximos}</p>
              <p className="text-xs text-muted-foreground">16–30 días</p>
            </div>
          </CardContent>
        </Card>
        <Card className={productosLentos.length > 0 ? 'border-warning/30 bg-warning/5' : ''}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-warning/10">
              <TrendingDown className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{productosLentos.length}</p>
              <p className="text-xs text-muted-foreground">Lento mov.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setTab('caducidades')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'caducidades' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          <AlertCircle className="h-4 w-4 inline mr-2" />
          Caducidades ({lotes.length})
        </button>
        <button
          onClick={() => setTab('lento_movimiento')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'lento_movimiento' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          <TrendingDown className="h-4 w-4 inline mr-2" />
          Lento Movimiento ({productosLentos.length})
        </button>
      </div>

      {tab === 'caducidades' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <CardTitle>Lotes con Fecha de Caducidad</CardTitle>
              <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar producto o lote..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9 w-[200px]"
                  />
                </div>
                <Select value={filtro} onValueChange={setFiltro}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    <SelectItem value="vencidos">Vencidos</SelectItem>
                    <SelectItem value="7dias">≤ 7 días</SelectItem>
                    <SelectItem value="15dias">≤ 15 días</SelectItem>
                    <SelectItem value="30dias">≤ 30 días</SelectItem>
                  </SelectContent>
                </Select>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" disabled={cleaning || vencidos === 0}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      {cleaning ? 'Limpiando…' : `Limpiar caducados (${vencidos})`}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Limpiar lotes caducados?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta acción generará un movimiento de <strong>merma por caducidad</strong> en el Kardex y dejará en 0 el inventario de todos los lotes ya vencidos con stock en {selectedSucursal?.nombre}. La operación queda registrada en auditoría y no se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={limpiarCaducados} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Sí, registrar mermas y limpiar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Caducidad</TableHead>
                  <TableHead className="text-center">Días</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow>
                ) : filteredLotes.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin lotes que mostrar</TableCell></TableRow>
                ) : (
                  filteredLotes.map(l => {
                    const sev = getSeverity(l.dias_restantes);
                    return (
                      <TableRow key={l.lote_id} className={l.dias_restantes < 0 ? 'bg-destructive/5' : l.dias_restantes <= 7 ? 'bg-destructive/3' : ''}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{l.producto_nombre}</p>
                            <p className="text-xs text-muted-foreground">{l.producto_sku}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{l.numero_lote}</TableCell>
                        <TableCell className="text-sm">{format(new Date(l.fecha_caducidad), 'dd MMM yyyy', { locale: es })}</TableCell>
                        <TableCell className={`text-center font-bold ${sev.color}`}>
                          {l.dias_restantes < 0 ? l.dias_restantes : `+${l.dias_restantes}`}
                        </TableCell>
                        <TableCell className="text-right">{l.cantidad}</TableCell>
                        <TableCell className="text-right text-sm">${(l.cantidad * l.costo_unitario).toFixed(2)}</TableCell>
                        <TableCell><Badge variant={sev.variant}>{sev.label}</Badge></TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {tab === 'lento_movimiento' && (
        <Card>
          <CardHeader>
            <CardTitle>Productos de Lento Movimiento</CardTitle>
            <p className="text-sm text-muted-foreground">Productos con ≤2 salidas en 30 días o cobertura &gt;90 días</p>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Stock Actual</TableHead>
                  <TableHead className="text-right">Salidas (30d)</TableHead>
                  <TableHead className="text-right">Cobertura</TableHead>
                  <TableHead>Alerta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Cargando...</TableCell></TableRow>
                ) : productosLentos.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Todos los productos tienen rotación normal</TableCell></TableRow>
                ) : (
                  productosLentos.map(p => (
                    <TableRow key={p.producto_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{p.producto_nombre}</p>
                          <p className="text-xs text-muted-foreground">{p.producto_sku}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{p.stock_actual}</TableCell>
                      <TableCell className="text-right">
                        <span className={p.movimientos_30d === 0 ? 'text-destructive font-bold' : 'text-warning font-medium'}>
                          {p.movimientos_30d}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {p.dias_cobertura !== null ? `${p.dias_cobertura} días` : 'Sin salidas'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.movimientos_30d === 0 ? 'destructive' : 'secondary'}>
                          {p.movimientos_30d === 0 ? 'Sin rotación' : 'Baja rotación'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default CaducidadesPage;
