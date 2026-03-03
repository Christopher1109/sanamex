import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TrendingUp, DollarSign, Percent, Download, Search } from 'lucide-react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

interface ProductoMargen {
  producto_id: string;
  sku: string;
  nombre: string;
  costoPromedio: number;
  precioVenta: number;
  unidadesVendidas: number;
  costoTotal: number;
  ingresoTotal: number;
  ganancia: number;
  margen: number;
}

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MargenesPage = () => {
  const { selectedSucursal } = useSucursal();
  const [data, setData] = useState<ProductoMargen[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => { if (selectedSucursal) loadData(); }, [selectedSucursal]);

  const loadData = async () => {
    if (!selectedSucursal) return;
    setLoading(true);
    try {
      // Get ventas for this sucursal
      const { data: ventas } = await supabase.from('ventas')
        .select('id').eq('sucursal_id', selectedSucursal.id).eq('estado', 'completada');

      if (!ventas?.length) { setData([]); setLoading(false); return; }

      const ventaIds = ventas.map(v => v.id);

      // Get venta_lineas with product and lote info
      const { data: lineas } = await supabase.from('venta_lineas')
        .select('*, productos(id, nombre, sku), lotes(costo_unitario)')
        .in('venta_id', ventaIds);

      if (!lineas?.length) { setData([]); setLoading(false); return; }

      // Aggregate by product
      const aggMap: Record<string, ProductoMargen> = {};
      for (const l of lineas) {
        const pid = l.producto_id;
        const costo = Number((l.lotes as any)?.costo_unitario || 0);
        const precio = Number(l.precio_unitario);
        const cant = l.cantidad;

        if (!aggMap[pid]) {
          aggMap[pid] = {
            producto_id: pid,
            sku: (l.productos as any)?.sku || '',
            nombre: (l.productos as any)?.nombre || '',
            costoPromedio: 0,
            precioVenta: 0,
            unidadesVendidas: 0,
            costoTotal: 0,
            ingresoTotal: 0,
            ganancia: 0,
            margen: 0,
          };
        }
        aggMap[pid].unidadesVendidas += cant;
        aggMap[pid].costoTotal += costo * cant;
        aggMap[pid].ingresoTotal += precio * cant;
      }

      const result = Object.values(aggMap).map(p => {
        p.ganancia = p.ingresoTotal - p.costoTotal;
        p.margen = p.ingresoTotal > 0 ? (p.ganancia / p.ingresoTotal) * 100 : 0;
        p.costoPromedio = p.unidadesVendidas > 0 ? p.costoTotal / p.unidadesVendidas : 0;
        p.precioVenta = p.unidadesVendidas > 0 ? p.ingresoTotal / p.unidadesVendidas : 0;
        return p;
      }).sort((a, b) => b.ingresoTotal - a.ingresoTotal);

      setData(result);
    } catch (err) {
      console.error(err);
      toast.error('Error cargando márgenes');
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    if (!search) return data;
    const s = search.toLowerCase();
    return data.filter(p => p.nombre.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s));
  }, [data, search]);

  const totals = useMemo(() => {
    const costoTotal = filtered.reduce((s, p) => s + p.costoTotal, 0);
    const ingresoTotal = filtered.reduce((s, p) => s + p.ingresoTotal, 0);
    const gananciaTotal = filtered.reduce((s, p) => s + p.ganancia, 0);
    const margenPromedio = ingresoTotal > 0 ? (gananciaTotal / ingresoTotal) * 100 : 0;
    return { costoTotal, ingresoTotal, gananciaTotal, margenPromedio };
  }, [filtered]);

  const exportExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Márgenes');
    ws.columns = [
      { header: 'SKU', key: 'sku', width: 12 },
      { header: 'Producto', key: 'nombre', width: 30 },
      { header: 'Costo Prom.', key: 'costoPromedio', width: 14 },
      { header: 'Precio Venta', key: 'precioVenta', width: 14 },
      { header: 'Uds. Vendidas', key: 'unidadesVendidas', width: 14 },
      { header: 'Costo Total', key: 'costoTotal', width: 14 },
      { header: 'Ingreso Total', key: 'ingresoTotal', width: 14 },
      { header: 'Ganancia', key: 'ganancia', width: 14 },
      { header: 'Margen %', key: 'margen', width: 12 },
    ];
    filtered.forEach(r => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `margenes_${selectedSucursal?.nombre || ''}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(16);
    doc.text(`Márgenes — ${selectedSucursal?.nombre || ''}`, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-MX')}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [['SKU', 'Producto', 'Costo Prom.', 'Precio Venta', 'Uds.', 'Costo Total', 'Ingreso Total', 'Ganancia', 'Margen %']],
      body: filtered.map(r => [r.sku, r.nombre, `$${fmt(r.costoPromedio)}`, `$${fmt(r.precioVenta)}`, r.unidadesVendidas, `$${fmt(r.costoTotal)}`, `$${fmt(r.ingresoTotal)}`, `$${fmt(r.ganancia)}`, `${fmt(r.margen)}%`]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
    });
    doc.save(`margenes_${selectedSucursal?.nombre || ''}.pdf`);
  };

  const getMargenBadge = (margen: number) => {
    if (margen >= 55) return <Badge className="bg-green-600 text-white">{fmt(margen)}%</Badge>;
    if (margen >= 45) return <Badge className="bg-yellow-600 text-white">{fmt(margen)}%</Badge>;
    return <Badge variant="destructive">{fmt(margen)}%</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Márgenes y Rentabilidad</h1>
          <p className="text-muted-foreground">{selectedSucursal?.nombre} — Análisis de costo, precio, ganancia y margen por producto</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel}><Download className="h-4 w-4 mr-2" />Excel</Button>
          <Button variant="outline" onClick={exportPDF}><Download className="h-4 w-4 mr-2" />PDF</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Costo Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">${fmt(totals.costoTotal)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingreso Total</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">${fmt(totals.ingresoTotal)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ganancia Total</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-600">${fmt(totals.gananciaTotal)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Margen Promedio</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold">{fmt(totals.margenPromedio)}%</div></CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre o SKU..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">Sin datos de ventas para calcular márgenes en esta sucursal</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead className="text-right">Costo Prom.</TableHead>
                  <TableHead className="text-right">Precio Venta</TableHead>
                  <TableHead className="text-right">Uds. Vendidas</TableHead>
                  <TableHead className="text-right">Costo Total</TableHead>
                  <TableHead className="text-right">Ingreso Total</TableHead>
                  <TableHead className="text-right">Ganancia</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.producto_id}>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell className="text-right">${fmt(p.costoPromedio)}</TableCell>
                    <TableCell className="text-right">${fmt(p.precioVenta)}</TableCell>
                    <TableCell className="text-right">{p.unidadesVendidas}</TableCell>
                    <TableCell className="text-right text-destructive">${fmt(p.costoTotal)}</TableCell>
                    <TableCell className="text-right text-green-600">${fmt(p.ingresoTotal)}</TableCell>
                    <TableCell className="text-right font-semibold text-green-600">${fmt(p.ganancia)}</TableCell>
                    <TableCell className="text-right">{getMargenBadge(p.margen)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default MargenesPage;
