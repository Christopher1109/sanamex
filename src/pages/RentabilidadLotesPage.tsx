import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TrendingUp, DollarSign, Percent, Download, Search, Package, Tag } from 'lucide-react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

interface LoteRow {
  lote_id: string;
  numero_lote: string;
  producto_id: string;
  producto_nombre: string;
  producto_sku: string;
  fecha_recepcion: string | null;
  fecha_caducidad: string | null;
  costo_unitario: number;
  unidades_recibidas: number;
  unidades_vendidas: number;
  stock_actual: number;
  costo_total: number;
  ingreso_total: number;
  precio_promedio: number;
  ganancia: number;
  margen_pct: number;
  precio_especial: number | null;
  motivo_precio_especial: string | null;
  descuento_otorgado: number;
}

interface VentaDetalle {
  venta_id: string;
  numero_venta: string;
  fecha: string;
  sucursal_nombre: string;
  cliente_nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  lista_precio: string | null;
  precio_lista: number | null;
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const RentabilidadLotesPage = () => {
  const { selectedSucursal } = useSucursal();
  const [rows, setRows] = useState<LoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [detalleLote, setDetalleLote] = useState<LoteRow | null>(null);
  const [detalleVentas, setDetalleVentas] = useState<VentaDetalle[]>([]);

  useEffect(() => {
    load();
  }, [selectedSucursal, fechaDesde, fechaHasta]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('rentabilidad_por_lote', {
        p_sucursal_id: selectedSucursal?.id ?? null,
        p_fecha_desde: fechaDesde || null,
        p_fecha_hasta: fechaHasta || null,
      });
      if (error) throw error;
      setRows((data || []) as LoteRow[]);
    } catch (err: any) {
      console.error(err);
      toast.error('Error al cargar rentabilidad por lote');
    }
    setLoading(false);
  };

  const verDetalle = async (lote: LoteRow) => {
    setDetalleLote(lote);
    setDetalleVentas([]);
    const { data, error } = await supabase.rpc('ventas_por_lote', { p_lote_id: lote.lote_id });
    if (error) {
      toast.error('Error al cargar ventas del lote');
      return;
    }
    setDetalleVentas((data || []) as VentaDetalle[]);
  };

  const filtered = useMemo(() => {
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.producto_nombre?.toLowerCase().includes(s) ||
        r.producto_sku?.toLowerCase().includes(s) ||
        r.numero_lote?.toLowerCase().includes(s),
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    const costoTotal = filtered.reduce((a, r) => a + Number(r.costo_total || 0), 0);
    const ingresoTotal = filtered.reduce((a, r) => a + Number(r.ingreso_total || 0), 0);
    const gananciaTotal = filtered.reduce((a, r) => a + Number(r.ganancia || 0), 0);
    const margenProm = ingresoTotal > 0 ? (gananciaTotal / ingresoTotal) * 100 : 0;
    const lotesVendidos = filtered.filter((r) => Number(r.unidades_vendidas) > 0).length;
    const descuentoTotal = filtered.reduce((a, r) => a + Number(r.descuento_otorgado || 0), 0);
    return { costoTotal, ingresoTotal, gananciaTotal, margenProm, lotesVendidos, descuentoTotal };
  }, [filtered]);

  const margenBadge = (m: number, vendidas: number) => {
    if (vendidas === 0) return <Badge variant="outline">Sin venta</Badge>;
    if (m >= 30) return <Badge className="bg-green-600 text-white">{fmt(m)}%</Badge>;
    if (m >= 15) return <Badge className="bg-yellow-600 text-white">{fmt(m)}%</Badge>;
    return <Badge variant="destructive">{fmt(m)}%</Badge>;
  };

  const exportExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Rentabilidad por Lote');
    ws.columns = [
      { header: 'Lote', key: 'numero_lote', width: 16 },
      { header: 'SKU', key: 'producto_sku', width: 14 },
      { header: 'Producto', key: 'producto_nombre', width: 36 },
      { header: 'Recepción', key: 'fecha_recepcion', width: 12 },
      { header: 'Caducidad', key: 'fecha_caducidad', width: 12 },
      { header: 'Costo unit.', key: 'costo_unitario', width: 12 },
      { header: 'Uds. recibidas', key: 'unidades_recibidas', width: 14 },
      { header: 'Uds. vendidas', key: 'unidades_vendidas', width: 14 },
      { header: 'Stock actual', key: 'stock_actual', width: 12 },
      { header: 'Costo total', key: 'costo_total', width: 14 },
      { header: 'Ingreso total', key: 'ingreso_total', width: 14 },
      { header: 'Precio prom.', key: 'precio_promedio', width: 14 },
      { header: 'Ganancia', key: 'ganancia', width: 14 },
      { header: 'Margen %', key: 'margen_pct', width: 12 },
      { header: 'Precio especial', key: 'precio_especial', width: 14 },
      { header: 'Motivo', key: 'motivo_precio_especial', width: 16 },
      { header: 'Descuento otorgado', key: 'descuento_otorgado', width: 16 },
    ];
    filtered.forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentabilidad_lotes_${selectedSucursal?.codigo || 'global'}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(14);
    doc.text(`Rentabilidad por Lote — ${selectedSucursal?.nombre || 'Todas'}`, 14, 14);
    doc.setFontSize(9);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-MX')}`, 14, 20);
    autoTable(doc, {
      startY: 25,
      head: [['Lote', 'Producto', 'Recep.', 'Costo', 'Recib.', 'Vend.', 'Costo T.', 'Ingreso', 'Ganancia', 'Margen']],
      body: filtered.map((r) => [
        r.numero_lote,
        r.producto_nombre.substring(0, 28),
        r.fecha_recepcion?.substring(0, 10) || '-',
        `$${fmt(r.costo_unitario)}`,
        r.unidades_recibidas,
        r.unidades_vendidas,
        `$${fmt(r.costo_total)}`,
        `$${fmt(r.ingreso_total)}`,
        `$${fmt(r.ganancia)}`,
        `${fmt(r.margen_pct)}%`,
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [41, 128, 185] },
    });
    doc.save(`rentabilidad_lotes_${selectedSucursal?.codigo || 'global'}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rentabilidad por Lote</h1>
          <p className="text-muted-foreground">
            Costeo real farmacéutico: costo de entrada vs ingreso real por cada lote
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel}>
            <Download className="h-4 w-4 mr-2" />
            Excel
          </Button>
          <Button variant="outline" onClick={exportPDF}>
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm">Lotes con venta</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totals.lotesVendidos}</div>
            <p className="text-xs text-muted-foreground">de {filtered.length} totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm">Costo total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${fmt(totals.costoTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm">Ingreso total</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${fmt(totals.ingresoTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm">Ganancia real</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${fmt(totals.gananciaTotal)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm">Margen prom.</CardTitle>
            <Percent className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmt(totals.margenProm)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm">Descuento por remate</CardTitle>
            <Tag className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">${fmt(totals.descuentoTotal)}</div>
            <p className="text-xs text-muted-foreground">vs. precio de lista</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por lote, SKU o producto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Input
          type="date"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          className="w-44"
          placeholder="Desde"
        />
        <Input
          type="date"
          value={fechaHasta}
          onChange={(e) => setFechaHasta(e.target.value)}
          className="w-44"
          placeholder="Hasta"
        />
        {(fechaDesde || fechaHasta) && (
          <Button
            variant="ghost"
            onClick={() => {
              setFechaDesde('');
              setFechaHasta('');
            }}
          >
            Limpiar fechas
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Cargando lotes...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No hay lotes con los filtros aplicados
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lote</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Recepción</TableHead>
                  <TableHead className="text-right">Costo unit.</TableHead>
                  <TableHead className="text-right">Recib.</TableHead>
                  <TableHead className="text-right">Vend.</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Costo total</TableHead>
                  <TableHead className="text-right">Ingreso</TableHead>
                  <TableHead className="text-right">Ganancia</TableHead>
                  <TableHead className="text-right">Margen</TableHead>
                  <TableHead className="text-center">Precio especial</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 500).map((r) => (
                  <TableRow
                    key={r.lote_id}
                    className="cursor-pointer"
                    onClick={() => verDetalle(r)}
                  >
                    <TableCell className="font-mono text-xs">{r.numero_lote}</TableCell>
                    <TableCell>
                      <div className="font-medium">{r.producto_nombre}</div>
                      <div className="text-xs text-muted-foreground">{r.producto_sku}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.fecha_recepcion?.substring(0, 10) || '-'}
                    </TableCell>
                    <TableCell className="text-right">${fmt(r.costo_unitario)}</TableCell>
                    <TableCell className="text-right">{r.unidades_recibidas}</TableCell>
                    <TableCell className="text-right">{r.unidades_vendidas}</TableCell>
                    <TableCell className="text-right">{r.stock_actual}</TableCell>
                    <TableCell className="text-right text-destructive">
                      ${fmt(r.costo_total)}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      ${fmt(r.ingreso_total)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        r.ganancia >= 0 ? 'text-green-600' : 'text-destructive'
                      }`}
                    >
                      ${fmt(r.ganancia)}
                    </TableCell>
                    <TableCell className="text-right">
                      {margenBadge(Number(r.margen_pct), Number(r.unidades_vendidas))}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.precio_especial != null ? (
                        <Badge className="bg-amber-500 text-white gap-1">
                          <Tag className="h-3 w-3" />${fmt(r.precio_especial)}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {filtered.length > 500 && (
            <div className="p-3 text-xs text-center text-muted-foreground">
              Mostrando 500 de {filtered.length}. Exporta a Excel/PDF para ver el listado completo.
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detalleLote} onOpenChange={(o) => !o && setDetalleLote(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>
              Lote {detalleLote?.numero_lote} — {detalleLote?.producto_nombre}
            </DialogTitle>
          </DialogHeader>
          {detalleLote && (
            <>
              <div className="grid grid-cols-4 gap-3 mb-4">
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Costo unitario</p>
                    <p className="text-lg font-bold">${fmt(detalleLote.costo_unitario)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Precio promedio</p>
                    <p className="text-lg font-bold">${fmt(detalleLote.precio_promedio)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Ganancia</p>
                    <p className="text-lg font-bold text-green-600">${fmt(detalleLote.ganancia)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-xs text-muted-foreground">Margen</p>
                    <p className="text-lg font-bold">{fmt(detalleLote.margen_pct)}%</p>
                  </CardContent>
                </Card>
              </div>

              {detalleLote.precio_especial != null && (
                <Card className="mb-4 border-amber-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Tag className="h-4 w-4 text-amber-600" />
                      <h3 className="font-semibold text-sm">Precio especial de este lote</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Se vende a <span className="font-semibold text-amber-600">${fmt(detalleLote.precio_especial)}</span>{' '}
                      en vez del precio normal. Motivo: {detalleLote.motivo_precio_especial || 'no especificado'}.
                      Se asigna y modifica desde <span className="font-medium">Caducidades</span> (gerencia o superior).
                    </p>
                  </CardContent>
                </Card>
              )}
              <h3 className="font-semibold mb-2">Ventas donde se consumió este lote</h3>
              <div className="max-h-96 overflow-auto">
                {detalleVentas.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-6">
                    Sin ventas registradas para este lote
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Folio</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Sucursal</TableHead>
                        <TableHead>Cliente</TableHead>
                        <TableHead>Lista</TableHead>
                        <TableHead className="text-right">Cant.</TableHead>
                        <TableHead className="text-right">Precio</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead className="text-right">Descuento</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalleVentas.map((v) => {
                        const descuentoLinea =
                          v.precio_lista != null ? (v.precio_lista - v.precio_unitario) * v.cantidad : 0;
                        return (
                        <TableRow key={v.venta_id}>
                          <TableCell className="font-mono text-xs">{v.numero_venta}</TableCell>
                          <TableCell className="text-xs">
                            {new Date(v.fecha).toLocaleDateString('es-MX')}
                          </TableCell>
                          <TableCell className="text-xs">{v.sucursal_nombre}</TableCell>
                          <TableCell className="text-xs">{v.cliente_nombre}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {v.lista_precio || 'LP1'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{v.cantidad}</TableCell>
                          <TableCell className="text-right">${fmt(v.precio_unitario)}</TableCell>
                          <TableCell className="text-right font-semibold">
                            ${fmt(v.subtotal)}
                          </TableCell>
                          <TableCell className="text-right">
                            {descuentoLinea > 0 ? (
                              <span className="text-amber-600">${fmt(descuentoLinea)}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RentabilidadLotesPage;
