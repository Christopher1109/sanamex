import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TrendingUp, TrendingDown, AlertTriangle, Package, DollarSign, Eye } from 'lucide-react';

const RotacionPage = () => {
  const { selectedSucursal } = useSucursal();
  const [loading, setLoading] = useState(true);
  const [diasPeriodo, setDiasPeriodo] = useState(30);
  const [umbralRotacion, setUmbralRotacion] = useState(0.3); // veces/mes
  const [desplazamiento, setDesplazamiento] = useState<any[]>([]);
  const [recuperacion, setRecuperacion] = useState<any[]>([]);
  const [bajaRotacion, setBajaRotacion] = useState<any[]>([]);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [kpis, setKpis] = useState({ valorInventario: 0, diasInventario: 0, rotacionAnual: 0, productosActivos: 0 });
  const [detalle, setDetalle] = useState<{ producto: any; ventas: any[]; loading: boolean } | null>(null);

  useEffect(() => { if (selectedSucursal) load(); }, [selectedSucursal, diasPeriodo, umbralRotacion]);

  const load = async () => {
    if (!selectedSucursal) return;
    setLoading(true);

    const desde = new Date(); desde.setDate(desde.getDate() - diasPeriodo);
    const desdeStr = desde.toISOString();

    // 1) Almacenes de la sucursal
    const { data: almacenes } = await supabase.from('almacenes').select('id').eq('sucursal_id', selectedSucursal.id);
    const almacenIds = (almacenes || []).map(a => a.id);
    if (almacenIds.length === 0) { setLoading(false); return; }

    // 2) Ventas del periodo (con sucursal)
    const { data: ventasIds } = await supabase.from('ventas')
      .select('id').eq('sucursal_id', selectedSucursal.id)
      .eq('estado', 'completada').gte('fecha', desdeStr);
    const ventaIdSet = new Set((ventasIds || []).map(v => v.id));

    // 3) Líneas de venta del periodo
    const { data: lineas } = await supabase.from('venta_lineas')
      .select('producto_id, lote_id, cantidad, subtotal').limit(50000);
    const lineasPeriodo = (lineas || []).filter(l => ventaIdSet.has((l as any).venta_id) || true);
    // Filter properly using a fresh query joined
    const { data: lineasJoin } = await supabase
      .from('venta_lineas')
      .select('producto_id, lote_id, cantidad, subtotal, ventas!inner(sucursal_id, fecha, estado)')
      .eq('ventas.sucursal_id', selectedSucursal.id)
      .eq('ventas.estado', 'completada')
      .gte('ventas.fecha', desdeStr)
      .limit(50000);
    const ventasLineas = (lineasJoin || []) as any[];

    // 4) Inventario actual con lotes y producto
    const { data: inv } = await supabase
      .from('inventario')
      .select('cantidad, lote_id, lotes!inner(id, producto_id, costo_unitario, fecha_caducidad, fecha_pago_proveedor, productos(id, nombre, sku))')
      .in('almacen_id', almacenIds)
      .gt('cantidad', 0)
      .limit(10000);
    const inventario = (inv || []) as any[];

    // ===== Desplazamiento por producto =====
    const ventasPorProducto = new Map<string, { qty: number; monto: number }>();
    ventasLineas.forEach(l => {
      const cur = ventasPorProducto.get(l.producto_id) || { qty: 0, monto: 0 };
      cur.qty += Number(l.cantidad); cur.monto += Number(l.subtotal);
      ventasPorProducto.set(l.producto_id, cur);
    });

    const stockPorProducto = new Map<string, { qty: number; valor: number; nombre: string; sku: string }>();
    inventario.forEach(i => {
      const pid = i.lotes.producto_id;
      const cur = stockPorProducto.get(pid) || { qty: 0, valor: 0, nombre: i.lotes.productos?.nombre || '', sku: i.lotes.productos?.sku || '' };
      cur.qty += Number(i.cantidad); cur.valor += Number(i.cantidad) * Number(i.lotes.costo_unitario || 0);
      stockPorProducto.set(pid, cur);
    });

    // Backfill nombres para productos vendidos pero sin stock actual
    const missingIds = Array.from(ventasPorProducto.keys()).filter(pid => !stockPorProducto.has(pid));
    if (missingIds.length > 0) {
      const { data: prods } = await supabase.from('productos').select('id, nombre, sku').in('id', missingIds);
      (prods || []).forEach((p: any) => {
        stockPorProducto.set(p.id, { qty: 0, valor: 0, nombre: p.nombre, sku: p.sku });
      });
    }

    const desp = Array.from(ventasPorProducto.entries()).map(([pid, v]) => {
      const stock = stockPorProducto.get(pid);
      const rotMes = stock && stock.qty > 0 ? (v.qty / stock.qty) * (30 / diasPeriodo) : 0;
      return {
        producto_id: pid, nombre: stock?.nombre || '—', sku: stock?.sku || '—',
        qty_vendida: v.qty, monto: v.monto, stock_actual: stock?.qty || 0, rotacion_mes: rotMes,
      };
    }).sort((a, b) => b.qty_vendida - a.qty_vendida);
    setDesplazamiento(desp);

    // ===== Baja rotación =====
    const bajaArr: any[] = [];
    stockPorProducto.forEach((s, pid) => {
      const v = ventasPorProducto.get(pid);
      const qtyV = v?.qty || 0;
      const rotMes = s.qty > 0 ? (qtyV / s.qty) * (30 / diasPeriodo) : 0;
      if (rotMes < umbralRotacion && s.qty > 0) {
        bajaArr.push({ producto_id: pid, nombre: s.nombre, sku: s.sku, stock_actual: s.qty, valor: s.valor, qty_vendida: qtyV, rotacion_mes: rotMes });
      }
    });
    setBajaRotacion(bajaArr.sort((a, b) => b.valor - a.valor));

    // ===== Recuperación antes del vencimiento (por lote con fecha_pago_proveedor) =====
    const ventasPorLote = new Map<string, { qty: number; monto: number }>();
    ventasLineas.forEach(l => {
      if (!l.lote_id) return;
      const cur = ventasPorLote.get(l.lote_id) || { qty: 0, monto: 0 };
      cur.qty += Number(l.cantidad); cur.monto += Number(l.subtotal);
      ventasPorLote.set(l.lote_id, cur);
    });

    const { data: lotesPag } = await supabase
      .from('lotes')
      .select('id, numero_lote, costo_unitario, fecha_pago_proveedor, fecha_caducidad, productos(nombre, sku), proveedores(nombre)')
      .not('fecha_pago_proveedor', 'is', null)
      .limit(5000);

    // Sumar TODAS las ventas históricas por lote (no solo periodo) para recuperación real
    const { data: ventasLotesHist } = await supabase
      .from('venta_lineas')
      .select('lote_id, cantidad, subtotal')
      .in('lote_id', (lotesPag || []).map((l: any) => l.id))
      .limit(50000);
    const histPorLote = new Map<string, { qty: number; monto: number }>();
    (ventasLotesHist || []).forEach((l: any) => {
      if (!l.lote_id) return;
      const cur = histPorLote.get(l.lote_id) || { qty: 0, monto: 0 };
      cur.qty += Number(l.cantidad); cur.monto += Number(l.subtotal);
      histPorLote.set(l.lote_id, cur);
    });

    // Cantidad original recibida del lote (movimientos entrada)
    const { data: entradas } = await supabase
      .from('movimientos_inventario').select('lote_id, cantidad')
      .in('lote_id', (lotesPag || []).map((l: any) => l.id))
      .eq('tipo', 'entrada_compra').limit(50000);
    const recibidoPorLote = new Map<string, number>();
    (entradas || []).forEach((e: any) => {
      recibidoPorLote.set(e.lote_id, (recibidoPorLote.get(e.lote_id) || 0) + Number(e.cantidad));
    });

    const rec = (lotesPag || []).map((l: any) => {
      const hist = histPorLote.get(l.id) || { qty: 0, monto: 0 };
      const recibido = recibidoPorLote.get(l.id) || 0;
      const costoTotal = recibido * Number(l.costo_unitario || 0);
      const pct = costoTotal > 0 ? (hist.monto / costoTotal) * 100 : 0;
      const dias = l.fecha_pago_proveedor ? Math.floor((new Date(l.fecha_pago_proveedor).getTime() - Date.now()) / 86400000) : null;
      return {
        lote_id: l.id, numero_lote: l.numero_lote,
        producto: l.productos?.nombre || '—', sku: l.productos?.sku || '—',
        proveedor: l.proveedores?.nombre || '—',
        recibido, vendido: hist.qty, recuperado_monto: hist.monto,
        costo_total: costoTotal, pct_recuperado: pct,
        fecha_pago: l.fecha_pago_proveedor, dias_para_pagar: dias,
      };
    }).sort((a, b) => (a.dias_para_pagar ?? 9999) - (b.dias_para_pagar ?? 9999));
    setRecuperacion(rec);

    // ===== Alertas de riesgo =====
    const alertasArr: any[] = [];
    rec.forEach(r => {
      const riesgoPago = r.dias_para_pagar !== null && r.dias_para_pagar <= 15 && r.pct_recuperado < 50;
      const cadProx = r.fecha_pago !== null; // simplified
      if (riesgoPago) {
        alertasArr.push({
          tipo: r.pct_recuperado < 25 ? 'critico' : 'alto',
          mensaje: `${r.producto} (lote ${r.numero_lote}): ${r.pct_recuperado.toFixed(0)}% recuperado, pago en ${r.dias_para_pagar}d`,
          ...r,
        });
      }
    });
    // Caducidades con stock
    inventario.forEach(i => {
      if (!i.lotes.fecha_caducidad) return;
      const dias = Math.floor((new Date(i.lotes.fecha_caducidad).getTime() - Date.now()) / 86400000);
      if (dias <= 60 && dias > 0 && i.cantidad > 0) {
        alertasArr.push({
          tipo: dias <= 15 ? 'critico' : 'medio',
          mensaje: `${i.lotes.productos?.nombre}: ${i.cantidad}u por caducar en ${dias}d`,
          producto: i.lotes.productos?.nombre, dias_para_pagar: dias,
        });
      }
    });
    setAlertas(alertasArr.sort((a, b) => (a.dias_para_pagar ?? 9999) - (b.dias_para_pagar ?? 9999)));

    // ===== KPIs =====
    const valorTotal = Array.from(stockPorProducto.values()).reduce((s, p) => s + p.valor, 0);
    const costoVentasPeriodo = ventasLineas.reduce((s, l) => {
      const lote = inventario.find(i => i.lote_id === l.lote_id);
      return s + Number(l.cantidad) * Number(lote?.lotes?.costo_unitario || 0);
    }, 0);
    const costoVentasAnual = costoVentasPeriodo * (365 / diasPeriodo);
    const rotacionAnual = valorTotal > 0 ? costoVentasAnual / valorTotal : 0;
    const consumoDiario = ventasLineas.reduce((s, l) => s + Number(l.cantidad), 0) / diasPeriodo;
    const stockTotalQty = Array.from(stockPorProducto.values()).reduce((s, p) => s + p.qty, 0);
    const diasInv = consumoDiario > 0 ? stockTotalQty / consumoDiario : 0;
    setKpis({
      valorInventario: valorTotal, diasInventario: diasInv, rotacionAnual,
      productosActivos: stockPorProducto.size,
    });

    setLoading(false);
  };

  const verDetalle = async (producto: { producto_id: string; nombre: string; sku: string; stock_actual?: number }) => {
    setDetalle({ producto, ventas: [], loading: true });
    const { data } = await supabase
      .from('venta_lineas')
      .select('cantidad, precio_unitario, subtotal, lote_id, lotes(numero_lote, fecha_caducidad), ventas!inner(numero_venta, fecha, lista_precio_aplicada, sucursales:sucursal_id(nombre), clientes:cliente_id(nombre))')
      .eq('producto_id', producto.producto_id)
      .order('created_at', { ascending: false })
      .limit(200);
    setDetalle({ producto, ventas: (data || []) as any[], loading: false });
  };


  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Inteligencia de Rotación de Inventario</h1>
          <p className="text-muted-foreground">{selectedSucursal?.nombre}</p>
        </div>
        <div className="flex gap-3">
          <div>
            <Label className="text-xs">Periodo análisis (días)</Label>
            <Input type="number" min={7} max={365} value={diasPeriodo} onChange={e => setDiasPeriodo(Number(e.target.value) || 30)} className="w-28" />
          </div>
          <div>
            <Label className="text-xs">Umbral baja rot. (veces/mes)</Label>
            <Input type="number" step="0.1" min={0} value={umbralRotacion} onChange={e => setUmbralRotacion(Number(e.target.value) || 0.3)} className="w-28" />
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Valor inventario</p><DollarSign className="h-4 w-4 text-muted-foreground" /></div>
          <p className="text-2xl font-bold mt-1">${kpis.valorInventario.toLocaleString('es-MX', { maximumFractionDigits: 0 })}</p>
          <p className="text-xs text-muted-foreground">comprometido en stock</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Días de inventario</p><Package className="h-4 w-4 text-muted-foreground" /></div>
          <p className="text-2xl font-bold mt-1">{kpis.diasInventario.toFixed(0)}</p>
          <p className="text-xs text-muted-foreground">a ritmo actual</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Rotación anual</p><TrendingUp className="h-4 w-4 text-muted-foreground" /></div>
          <p className="text-2xl font-bold mt-1">{kpis.rotacionAnual.toFixed(2)}x</p>
          <p className="text-xs text-muted-foreground">veces/año</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">Productos activos</p><Package className="h-4 w-4 text-muted-foreground" /></div>
          <p className="text-2xl font-bold mt-1">{kpis.productosActivos}</p>
          <p className="text-xs text-muted-foreground">con stock {'>'} 0</p>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="desplazamiento">
        <TabsList>
          <TabsTrigger value="desplazamiento">Desplazamiento</TabsTrigger>
          <TabsTrigger value="recuperacion">Recuperación antes de pago</TabsTrigger>
          <TabsTrigger value="baja">Baja rotación ({bajaRotacion.length})</TabsTrigger>
          <TabsTrigger value="alertas">Alertas ({alertas.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="desplazamiento">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Producto</TableHead><TableHead>SKU</TableHead>
                <TableHead className="text-right">Vendido</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Rotación/mes</TableHead>
                <TableHead className="text-right">Detalle</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8">Calculando...</TableCell></TableRow>
                : desplazamiento.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin ventas en el periodo</TableCell></TableRow>
                : desplazamiento.slice(0, 100).map(d => (
                  <TableRow key={d.producto_id} className="cursor-pointer" onClick={() => verDetalle(d)}>
                    <TableCell className="font-medium">{d.nombre}</TableCell>
                    <TableCell className="text-xs font-mono">{d.sku}</TableCell>
                    <TableCell className="text-right">{d.qty_vendida}</TableCell>
                    <TableCell className="text-right">${d.monto.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{d.stock_actual}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={d.rotacion_mes >= 1 ? 'default' : d.rotacion_mes >= 0.3 ? 'secondary' : 'outline'}>
                        {d.rotacion_mes.toFixed(2)}x
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right"><Eye className="h-4 w-4 text-muted-foreground inline" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="recuperacion">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Producto</TableHead><TableHead>Lote</TableHead><TableHead>Proveedor</TableHead>
                <TableHead className="text-right">Recibido</TableHead>
                <TableHead className="text-right">Vendido</TableHead>
                <TableHead className="text-right">% Recuperado</TableHead>
                <TableHead>Pago al proveedor</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {recuperacion.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Aún no hay lotes con fecha de pago al proveedor. Captura fecha de factura al recibir compras nuevas.</TableCell></TableRow>
                : recuperacion.slice(0, 100).map(r => (
                  <TableRow key={r.lote_id}>
                    <TableCell className="font-medium">{r.producto}</TableCell>
                    <TableCell className="text-xs font-mono">{r.numero_lote}</TableCell>
                    <TableCell className="text-sm">{r.proveedor}</TableCell>
                    <TableCell className="text-right">{r.recibido}</TableCell>
                    <TableCell className="text-right">{r.vendido}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={r.pct_recuperado >= 100 ? 'default' : r.pct_recuperado >= 50 ? 'secondary' : 'destructive'}>
                        {r.pct_recuperado.toFixed(0)}%
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.fecha_pago} {r.dias_para_pagar !== null && (
                        <span className={r.dias_para_pagar < 0 ? 'text-destructive font-bold' : r.dias_para_pagar <= 15 ? 'text-amber-600' : 'text-muted-foreground'}>
                          ({r.dias_para_pagar < 0 ? `vencido ${Math.abs(r.dias_para_pagar)}d` : `en ${r.dias_para_pagar}d`})
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="baja">
          <Card><CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Producto</TableHead><TableHead>SKU</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Vendido</TableHead>
                <TableHead className="text-right">Rotación/mes</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {bajaRotacion.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin productos por debajo del umbral</TableCell></TableRow>
                : bajaRotacion.slice(0, 100).map(b => (
                  <TableRow key={b.producto_id} className="cursor-pointer" onClick={() => verDetalle(b)}>
                    <TableCell className="font-medium">{b.nombre}</TableCell>
                    <TableCell className="text-xs font-mono">{b.sku}</TableCell>
                    <TableCell className="text-right">{b.stock_actual}</TableCell>
                    <TableCell className="text-right font-bold">${b.valor.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{b.qty_vendida}</TableCell>
                    <TableCell className="text-right"><Badge variant="destructive"><TrendingDown className="h-3 w-3 mr-1" />{b.rotacion_mes.toFixed(2)}x</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="alertas">
          <Card><CardContent className="p-4 space-y-2">
            {alertas.length === 0 ? <p className="text-center py-8 text-muted-foreground">Sin alertas activas</p>
            : alertas.slice(0, 200).map((a, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-md border ${a.tipo === 'critico' ? 'bg-destructive/10 border-destructive/30' : a.tipo === 'alto' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-muted/40 border-border'}`}>
                <AlertTriangle className={`h-5 w-5 mt-0.5 ${a.tipo === 'critico' ? 'text-destructive' : 'text-amber-600'}`} />
                <div className="flex-1">
                  <p className="text-sm font-medium">{a.mensaje}</p>
                </div>
                <Badge variant={a.tipo === 'critico' ? 'destructive' : 'secondary'}>{a.tipo}</Badge>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detalle} onOpenChange={o => { if (!o) setDetalle(null); }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detalle?.producto.nombre}
              <span className="ml-2 text-xs font-mono text-muted-foreground">{detalle?.producto.sku}</span>
            </DialogTitle>
          </DialogHeader>
          {detalle?.loading ? (
            <p className="text-center py-6 text-muted-foreground">Cargando historial...</p>
          ) : detalle && detalle.ventas.length === 0 ? (
            <p className="text-center py-6 text-muted-foreground">Sin ventas registradas para este producto</p>
          ) : detalle ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <Card><CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Unidades vendidas</p>
                  <p className="text-xl font-bold">{detalle.ventas.reduce((s, v) => s + Number(v.cantidad), 0)}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Monto total</p>
                  <p className="text-xl font-bold">${detalle.ventas.reduce((s, v) => s + Number(v.subtotal || 0), 0).toFixed(2)}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Precio promedio</p>
                  <p className="text-xl font-bold">
                    ${(detalle.ventas.reduce((s, v) => s + Number(v.subtotal || 0), 0) /
                      Math.max(1, detalle.ventas.reduce((s, v) => s + Number(v.cantidad), 0))).toFixed(2)}
                  </p>
                </CardContent></Card>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Fecha</TableHead><TableHead># Venta</TableHead>
                  <TableHead>Sucursal</TableHead><TableHead>Cliente</TableHead>
                  <TableHead>Lista</TableHead><TableHead>Lote</TableHead>
                  <TableHead className="text-right">Cant.</TableHead>
                  <TableHead className="text-right">P.Unit</TableHead>
                  <TableHead className="text-right">Subtotal</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {detalle.ventas.map((v, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{new Date(v.ventas.fecha).toLocaleDateString('es-MX')}</TableCell>
                      <TableCell className="font-mono text-xs">{v.ventas.numero_venta}</TableCell>
                      <TableCell className="text-sm">{v.ventas.sucursales?.nombre || '—'}</TableCell>
                      <TableCell className="text-sm">{v.ventas.clientes?.nombre || 'Público'}</TableCell>
                      <TableCell><Badge variant="outline" className="text-xs">{v.ventas.lista_precio_aplicada || 'LP1'}</Badge></TableCell>
                      <TableCell className="text-xs font-mono">{v.lotes?.numero_lote || '—'}</TableCell>
                      <TableCell className="text-right">{v.cantidad}</TableCell>
                      <TableCell className="text-right">${Number(v.precio_unitario).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">${Number(v.subtotal).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RotacionPage;
