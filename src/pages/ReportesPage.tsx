import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, Package, AlertTriangle, TrendingUp, Download, Truck, ArrowLeftRight } from 'lucide-react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const ReportesPage = () => {
  const { selectedSucursal } = useSucursal();
  const [stats, setStats] = useState({ totalProductos: 0, lotesVencidos: 0, movimientosMes: 0, rutasActivas: 0 });
  const [productos, setProductos] = useState<any[]>([]);
  const [lotes, setLotes] = useState<any[]>([]);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [traspasos, setTraspasos] = useState<any[]>([]);
  const [rutas, setRutas] = useState<any[]>([]);
  const [tab, setTab] = useState('resumen');

  useEffect(() => { load(); }, [selectedSucursal]);

  const load = async () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const today = now.toISOString().split('T')[0];

    const [prodRes, lotesRes, movRes, rutasRes] = await Promise.all([
      supabase.from('productos').select('id', { count: 'exact', head: true }).eq('activo', true),
      supabase.from('lotes').select('id', { count: 'exact', head: true }).lt('fecha_caducidad', today),
      supabase.from('movimientos_inventario').select('id', { count: 'exact', head: true }).gte('created_at', firstDay),
      supabase.from('rutas').select('id', { count: 'exact', head: true }).in('estado', ['preparando', 'en_ruta']),
    ]);

    setStats({
      totalProductos: prodRes.count || 0,
      lotesVencidos: lotesRes.count || 0,
      movimientosMes: movRes.count || 0,
      rutasActivas: rutasRes.count || 0,
    });

    // Load detailed data
    const [prodData, lotesData, movData, traspData, rutasData] = await Promise.all([
      supabase.from('productos').select('*').eq('activo', true).order('nombre').limit(200),
      supabase.from('lotes').select('*, productos(nombre, sku), proveedores(nombre)').order('fecha_caducidad', { ascending: true }).limit(200),
      supabase.from('movimientos_inventario').select('*, lotes(numero_lote, productos(nombre))').order('created_at', { ascending: false }).limit(200),
      supabase.from('traspasos').select('*, almacen_origen:almacen_origen_id(nombre, sucursales:sucursal_id(nombre)), almacen_destino:almacen_destino_id(nombre, sucursales:sucursal_id(nombre))').order('created_at', { ascending: false }).limit(100),
      supabase.from('rutas').select('*, profiles:repartidor_id(nombre)').order('fecha', { ascending: false }).limit(100),
    ]);

    setProductos(prodData.data || []);
    setLotes(lotesData.data || []);
    setMovimientos(movData.data || []);
    setTraspasos(traspData.data || []);
    setRutas(rutasData.data || []);
  };

  const exportGenericExcel = async (title: string, columns: {header: string, key: string, width: number}[], rows: any[]) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(title);
    ws.columns = columns;
    rows.forEach(r => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${title.toLowerCase().replace(/ /g, '_')}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportGenericPDF = (title: string, headers: string[], rows: string[][]) => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-MX')}`, 14, 22);
    autoTable(doc, { startY: 28, head: [headers], body: rows, styles: { fontSize: 7 }, headStyles: { fillColor: [41, 128, 185] } });
    doc.save(`${title.toLowerCase().replace(/ /g, '_')}.pdf`);
  };

  const exportProductos = (format: 'excel' | 'pdf') => {
    const cols = [
      { header: 'SKU', key: 'sku', width: 12 },
      { header: 'Nombre', key: 'nombre', width: 30 },
      { header: 'Categoría', key: 'categoria', width: 15 },
      { header: 'Precio Base', key: 'precio_base', width: 14 },
      { header: 'Unidad', key: 'unidad', width: 10 },
      { header: 'Código Barras', key: 'codigo_barras', width: 16 },
    ];
    const rows = productos.map(p => ({ sku: p.sku, nombre: p.nombre, categoria: p.categoria || '—', precio_base: p.precio_base, unidad: p.unidad, codigo_barras: p.codigo_barras || '—' }));
    if (format === 'excel') exportGenericExcel('Reporte Productos', cols, rows);
    else exportGenericPDF('Reporte de Productos', cols.map(c => c.header), rows.map(r => [r.sku, r.nombre, r.categoria, `$${fmt(r.precio_base)}`, r.unidad, r.codigo_barras]));
  };

  const exportLotes = (format: 'excel' | 'pdf') => {
    const cols = [
      { header: 'Lote', key: 'lote', width: 14 },
      { header: 'Producto', key: 'producto', width: 28 },
      { header: 'Proveedor', key: 'proveedor', width: 20 },
      { header: 'Costo Unit.', key: 'costo', width: 12 },
      { header: 'Caducidad', key: 'caducidad', width: 12 },
    ];
    const rows = lotes.map(l => ({ lote: l.numero_lote, producto: (l.productos as any)?.nombre || '—', proveedor: (l.proveedores as any)?.nombre || '—', costo: l.costo_unitario, caducidad: l.fecha_caducidad || 'N/A' }));
    if (format === 'excel') exportGenericExcel('Reporte Lotes', cols, rows);
    else exportGenericPDF('Reporte de Lotes', cols.map(c => c.header), rows.map(r => [r.lote, r.producto, r.proveedor, `$${fmt(r.costo)}`, r.caducidad]));
  };

  const exportMovimientos = (format: 'excel' | 'pdf') => {
    const cols = [
      { header: 'Fecha', key: 'fecha', width: 18 },
      { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Producto', key: 'producto', width: 28 },
      { header: 'Lote', key: 'lote', width: 14 },
      { header: 'Cantidad', key: 'cantidad', width: 10 },
      { header: 'Notas', key: 'notas', width: 25 },
    ];
    const rows = movimientos.map(m => ({ fecha: new Date(m.created_at).toLocaleString('es-MX'), tipo: m.tipo, producto: (m.lotes as any)?.productos?.nombre || '—', lote: (m.lotes as any)?.numero_lote || '—', cantidad: m.cantidad, notas: m.notas || '—' }));
    if (format === 'excel') exportGenericExcel('Reporte Movimientos', cols, rows);
    else exportGenericPDF('Reporte de Movimientos de Inventario', cols.map(c => c.header), rows.map(r => [r.fecha, r.tipo, r.producto, r.lote, String(r.cantidad), r.notas]));
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reportes</h1>
        <p className="text-muted-foreground">Resumen operativo completo con exportación</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Productos Activos</CardTitle><Package className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.totalProductos}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Lotes Vencidos</CardTitle><AlertTriangle className="h-4 w-4 text-destructive" /></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{stats.lotesVencidos}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Movimientos del Mes</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.movimientosMes}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Rutas Activas</CardTitle><Truck className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.rutasActivas}</div></CardContent></Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="productos">Productos ({productos.length})</TabsTrigger>
          <TabsTrigger value="lotes">Lotes ({lotes.length})</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos ({movimientos.length})</TabsTrigger>
          <TabsTrigger value="traspasos">Traspasos ({traspasos.length})</TabsTrigger>
          <TabsTrigger value="rutas">Rutas ({rutas.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="resumen">
          <Card><CardContent className="p-6">
            <p className="text-muted-foreground mb-4">Selecciona una pestaña para ver el detalle y exportar los datos.</p>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div className="border rounded-lg p-4"><h4 className="font-semibold mb-1">Catálogo de Productos</h4><p className="text-sm text-muted-foreground">{stats.totalProductos} productos activos</p></div>
              <div className="border rounded-lg p-4"><h4 className="font-semibold mb-1">Lotes y Caducidades</h4><p className="text-sm text-muted-foreground">{stats.lotesVencidos} lotes vencidos</p></div>
              <div className="border rounded-lg p-4"><h4 className="font-semibold mb-1">Movimientos Kardex</h4><p className="text-sm text-muted-foreground">{stats.movimientosMes} este mes</p></div>
              <div className="border rounded-lg p-4"><h4 className="font-semibold mb-1">Traspasos</h4><p className="text-sm text-muted-foreground">{traspasos.length} registrados</p></div>
              <div className="border rounded-lg p-4"><h4 className="font-semibold mb-1">Rutas de Entrega</h4><p className="text-sm text-muted-foreground">{stats.rutasActivas} activas</p></div>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="productos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Catálogo de Productos</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportProductos('excel')}><Download className="h-4 w-4 mr-1" />Excel</Button>
                <Button size="sm" variant="outline" onClick={() => exportProductos('pdf')}><Download className="h-4 w-4 mr-1" />PDF</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Nombre</TableHead><TableHead>Categoría</TableHead><TableHead className="text-right">Precio Base</TableHead><TableHead>Unidad</TableHead><TableHead>Código Barras</TableHead></TableRow></TableHeader>
                <TableBody>
                  {productos.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="font-medium">{p.nombre}</TableCell>
                      <TableCell><Badge variant="outline">{p.categoria || '—'}</Badge></TableCell>
                      <TableCell className="text-right">${fmt(p.precio_base)}</TableCell>
                      <TableCell>{p.unidad}</TableCell>
                      <TableCell className="font-mono text-xs">{p.codigo_barras || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lotes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Lotes y Caducidades</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportLotes('excel')}><Download className="h-4 w-4 mr-1" />Excel</Button>
                <Button size="sm" variant="outline" onClick={() => exportLotes('pdf')}><Download className="h-4 w-4 mr-1" />PDF</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Lote</TableHead><TableHead>Producto</TableHead><TableHead>Proveedor</TableHead><TableHead className="text-right">Costo Unit.</TableHead><TableHead>Caducidad</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                <TableBody>
                  {lotes.map(l => {
                    const vencido = l.fecha_caducidad && l.fecha_caducidad < today;
                    const proximo = l.fecha_caducidad && !vencido && l.fecha_caducidad <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-xs">{l.numero_lote}</TableCell>
                        <TableCell>{(l.productos as any)?.nombre}</TableCell>
                        <TableCell>{(l.proveedores as any)?.nombre || '—'}</TableCell>
                        <TableCell className="text-right">${fmt(l.costo_unitario)}</TableCell>
                        <TableCell>{l.fecha_caducidad || 'N/A'}</TableCell>
                        <TableCell>{vencido ? <Badge variant="destructive">Vencido</Badge> : proximo ? <Badge className="bg-yellow-600 text-white">Próximo</Badge> : <Badge variant="outline">Vigente</Badge>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movimientos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Movimientos de Inventario</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportMovimientos('excel')}><Download className="h-4 w-4 mr-1" />Excel</Button>
                <Button size="sm" variant="outline" onClick={() => exportMovimientos('pdf')}><Download className="h-4 w-4 mr-1" />PDF</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Tipo</TableHead><TableHead>Producto</TableHead><TableHead>Lote</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead>Notas</TableHead></TableRow></TableHeader>
                <TableBody>
                  {movimientos.map(m => (
                    <TableRow key={m.id}>
                      <TableCell className="text-xs">{new Date(m.created_at).toLocaleString('es-MX')}</TableCell>
                      <TableCell><Badge variant={m.tipo === 'entrada' ? 'default' : m.tipo === 'salida' ? 'destructive' : 'secondary'}>{m.tipo}</Badge></TableCell>
                      <TableCell>{(m.lotes as any)?.productos?.nombre || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{(m.lotes as any)?.numero_lote || '—'}</TableCell>
                      <TableCell className="text-right font-semibold">{m.cantidad}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{m.notas || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="traspasos">
          <Card>
            <CardHeader><CardTitle>Traspasos entre Almacenes</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Origen</TableHead><TableHead>Destino</TableHead><TableHead>Estado</TableHead><TableHead>Notas</TableHead></TableRow></TableHeader>
                <TableBody>
                  {traspasos.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs">{new Date(t.created_at).toLocaleDateString('es-MX')}</TableCell>
                      <TableCell>{(t.almacen_origen as any)?.nombre} — {(t.almacen_origen as any)?.sucursales?.nombre}</TableCell>
                      <TableCell>{(t.almacen_destino as any)?.nombre} — {(t.almacen_destino as any)?.sucursales?.nombre}</TableCell>
                      <TableCell><Badge variant={t.estado === 'completado' ? 'default' : t.estado === 'pendiente' ? 'secondary' : 'outline'}>{t.estado}</Badge></TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{t.notas || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rutas">
          <Card>
            <CardHeader><CardTitle>Rutas de Entrega</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Repartidor</TableHead><TableHead>Estado</TableHead><TableHead>Notas</TableHead></TableRow></TableHeader>
                <TableBody>
                  {rutas.map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.fecha}</TableCell>
                      <TableCell>{(r.profiles as any)?.nombre || '—'}</TableCell>
                      <TableCell><Badge variant={r.estado === 'completada' ? 'default' : r.estado === 'en_ruta' ? 'outline' : 'secondary'}>{r.estado}</Badge></TableCell>
                      <TableCell className="text-xs max-w-[300px] truncate">{r.notas || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReportesPage;
