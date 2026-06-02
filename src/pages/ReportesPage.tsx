import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, Package, AlertTriangle, TrendingUp, Download, Truck, Receipt, Filter } from 'lucide-react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

const fmt = (n: number) => (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().split('T')[0];
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().split('T')[0]; };

const ReportesPage = () => {
  const { selectedSucursal } = useSucursal();
  const [stats, setStats] = useState({ totalProductos: 0, lotesVencidos: 0, movimientosMes: 0, rutasActivas: 0 });
  const [productos, setProductos] = useState<any[]>([]);
  const [lotes, setLotes] = useState<any[]>([]);
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [traspasos, setTraspasos] = useState<any[]>([]);
  const [rutas, setRutas] = useState<any[]>([]);
  const [tab, setTab] = useState('ventas');

  // Unified sales report state
  const [ventas, setVentas] = useState<any[]>([]);
  const [ventasLoading, setVentasLoading] = useState(false);
  const [sucursales, setSucursales] = useState<any[]>([]);
  const [cajeros, setCajeros] = useState<any[]>([]);
  const [clientes, setClientes] = useState<any[]>([]);
  const [filtros, setFiltros] = useState({
    desde: daysAgo(30),
    hasta: today(),
    sucursal_id: 'todas',
    cajero_id: 'todos',
    cliente_id: 'todos',
    lista_precio: 'todas',
    estado: 'completada',
  });

  useEffect(() => { load(); loadFiltros(); }, [selectedSucursal]);
  useEffect(() => { loadVentas(); }, [filtros, selectedSucursal]);

  const load = async () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const t = today();

    const [prodRes, lotesRes, movRes, rutasRes] = await Promise.all([
      supabase.from('productos').select('id', { count: 'exact', head: true }).eq('activo', true),
      supabase.from('lotes').select('id', { count: 'exact', head: true }).lt('fecha_caducidad', t),
      supabase.from('movimientos_inventario').select('id', { count: 'exact', head: true }).gte('created_at', firstDay),
      supabase.from('rutas').select('id', { count: 'exact', head: true }).in('estado', ['preparando', 'en_ruta']),
    ]);

    setStats({
      totalProductos: prodRes.count || 0,
      lotesVencidos: lotesRes.count || 0,
      movimientosMes: movRes.count || 0,
      rutasActivas: rutasRes.count || 0,
    });

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

  const loadFiltros = async () => {
    const [sucRes, profRes, cliRes] = await Promise.all([
      supabase.from('sucursales').select('id, nombre, codigo').eq('activo', true).order('nombre'),
      supabase.from('profiles').select('id, nombre, email').eq('activo', true).order('nombre'),
      supabase.from('clientes').select('id, nombre').eq('activo', true).order('nombre').limit(1000),
    ]);
    setSucursales(sucRes.data || []);
    setCajeros(profRes.data || []);
    setClientes(cliRes.data || []);
  };

  const loadVentas = async () => {
    setVentasLoading(true);
    let q = supabase.from('ventas')
      .select('id, numero_venta, fecha, sucursal_id, cajero_id, cliente_id, subtotal, impuestos, total, estado, lista_precio_aplicada, sucursales:sucursal_id(nombre, codigo), profiles:cajero_id(nombre), clientes:cliente_id(nombre, tipo)')
      .gte('fecha', `${filtros.desde}T00:00:00`)
      .lte('fecha', `${filtros.hasta}T23:59:59`)
      .order('fecha', { ascending: false })
      .limit(5000);

    if (filtros.sucursal_id !== 'todas') q = q.eq('sucursal_id', filtros.sucursal_id);
    if (filtros.cajero_id !== 'todos') q = q.eq('cajero_id', filtros.cajero_id);
    if (filtros.cliente_id !== 'todos') q = q.eq('cliente_id', filtros.cliente_id);
    if (filtros.lista_precio !== 'todas') q = q.eq('lista_precio_aplicada', filtros.lista_precio);
    if (filtros.estado !== 'todos') q = q.eq('estado', filtros.estado);

    const { data, error } = await q;
    if (error) toast.error('Error al cargar ventas');
    setVentas(data || []);
    setVentasLoading(false);
  };

  const kpisVentas = useMemo(() => {
    const totalVentas = ventas.reduce((s, v) => s + Number(v.total || 0), 0);
    const totalTickets = ventas.length;
    const ticketPromedio = totalTickets > 0 ? totalVentas / totalTickets : 0;
    const totalImpuestos = ventas.reduce((s, v) => s + Number(v.impuestos || 0), 0);
    return { totalVentas, totalTickets, ticketPromedio, totalImpuestos };
  }, [ventas]);

  const ventasPorSucursal = useMemo(() => {
    const map = new Map<string, { nombre: string; total: number; tickets: number }>();
    for (const v of ventas) {
      const key = v.sucursal_id;
      const nombre = (v.sucursales as any)?.nombre || '—';
      const ex = map.get(key) || { nombre, total: 0, tickets: 0 };
      ex.total += Number(v.total || 0);
      ex.tickets += 1;
      map.set(key, ex);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [ventas]);

  const ventasPorLista = useMemo(() => {
    const map = new Map<string, { lista: string; total: number; tickets: number }>();
    for (const v of ventas) {
      const lista = v.lista_precio_aplicada || 'LP1';
      const ex = map.get(lista) || { lista, total: 0, tickets: 0 };
      ex.total += Number(v.total || 0);
      ex.tickets += 1;
      map.set(lista, ex);
    }
    return Array.from(map.values()).sort((a, b) => a.lista.localeCompare(b.lista));
  }, [ventas]);

  // ── Generic exporters ──
  const exportGenericExcel = async (title: string, columns: { header: string; key: string; width: number }[], rows: any[]) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(title.substring(0, 30));
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

  // Paged fetch helper to bypass Supabase's 1000-row default
  const fetchAll = async <T,>(buildQuery: (from: number, to: number) => any): Promise<T[]> => {
    const pageSize = 1000;
    const out: T[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await buildQuery(from, from + pageSize - 1);
      if (error) throw error;
      out.push(...((data || []) as T[]));
      if (!data || data.length < pageSize) break;
      from += pageSize;
      if (from > 100000) break; // safety cap
    }
    return out;
  };

  const exportProductos = async (format: 'excel' | 'pdf') => {
    toast.info('Generando archivo...');
    const all = await fetchAll<any>((from, to) =>
      supabase.from('productos').select('*').eq('activo', true).order('nombre').range(from, to)
    );
    const cols = [
      { header: 'SKU', key: 'sku', width: 12 },
      { header: 'Nombre', key: 'nombre', width: 30 },
      { header: 'Categoría', key: 'categoria', width: 15 },
      { header: 'Precio Base', key: 'precio_base', width: 14 },
      { header: 'Unidad', key: 'unidad', width: 10 },
      { header: 'Código Barras', key: 'codigo_barras', width: 16 },
    ];
    const rows = all.map(p => ({ sku: p.sku, nombre: p.nombre, categoria: p.categoria || '—', precio_base: p.precio_base, unidad: p.unidad, codigo_barras: p.codigo_barras || '—' }));
    if (format === 'excel') await exportGenericExcel('Reporte Productos', cols, rows);
    else exportGenericPDF('Reporte de Productos', cols.map(c => c.header), rows.map(r => [r.sku, r.nombre, r.categoria, `$${fmt(r.precio_base)}`, r.unidad, r.codigo_barras]));
    toast.success(`${all.length} productos exportados`);
  };

  const exportLotes = async (format: 'excel' | 'pdf') => {
    toast.info('Generando archivo...');
    const all = await fetchAll<any>((from, to) =>
      supabase.from('lotes').select('*, productos(nombre, sku), proveedores(nombre)').order('fecha_caducidad', { ascending: true }).range(from, to)
    );
    const cols = [
      { header: 'Lote', key: 'lote', width: 14 },
      { header: 'Producto', key: 'producto', width: 28 },
      { header: 'Proveedor', key: 'proveedor', width: 20 },
      { header: 'Costo Unit.', key: 'costo', width: 12 },
      { header: 'Caducidad', key: 'caducidad', width: 12 },
    ];
    const rows = all.map(l => ({ lote: l.numero_lote, producto: (l.productos as any)?.nombre || '—', proveedor: (l.proveedores as any)?.nombre || '—', costo: l.costo_unitario, caducidad: l.fecha_caducidad || 'N/A' }));
    if (format === 'excel') await exportGenericExcel('Reporte Lotes', cols, rows);
    else exportGenericPDF('Reporte de Lotes', cols.map(c => c.header), rows.map(r => [r.lote, r.producto, r.proveedor, `$${fmt(r.costo)}`, r.caducidad]));
    toast.success(`${all.length} lotes exportados`);
  };

  const exportMovimientos = async (format: 'excel' | 'pdf') => {
    toast.info('Generando archivo...');
    const all = await fetchAll<any>((from, to) =>
      supabase.from('movimientos_inventario').select('*, lotes(numero_lote, productos(nombre))').order('created_at', { ascending: false }).range(from, to)
    );
    const cols = [
      { header: 'Fecha', key: 'fecha', width: 18 },
      { header: 'Tipo', key: 'tipo', width: 12 },
      { header: 'Producto', key: 'producto', width: 28 },
      { header: 'Lote', key: 'lote', width: 14 },
      { header: 'Cantidad', key: 'cantidad', width: 10 },
      { header: 'Notas', key: 'notas', width: 25 },
    ];
    const rows = all.map(m => ({ fecha: new Date(m.created_at).toLocaleString('es-MX'), tipo: m.tipo, producto: (m.lotes as any)?.productos?.nombre || '—', lote: (m.lotes as any)?.numero_lote || '—', cantidad: m.cantidad, notas: m.notas || '—' }));
    if (format === 'excel') await exportGenericExcel('Reporte Movimientos', cols, rows);
    else exportGenericPDF('Reporte de Movimientos', cols.map(c => c.header), rows.map(r => [r.fecha, r.tipo, r.producto, r.lote, String(r.cantidad), r.notas]));
    toast.success(`${all.length} movimientos exportados`);
  };

  const exportVentas = async (format: 'excel' | 'pdf') => {
    toast.info('Generando archivo...');
    const cols = [
      { header: 'Fecha', key: 'fecha', width: 20 },
      { header: 'Número', key: 'numero_venta', width: 22 },
      { header: 'Sucursal', key: 'sucursal', width: 18 },
      { header: 'Cajero', key: 'cajero', width: 18 },
      { header: 'Cliente', key: 'cliente', width: 22 },
      { header: 'Tipo Cliente', key: 'tipo_cliente', width: 14 },
      { header: 'Lista Precio', key: 'lista_precio', width: 10 },
      { header: 'Subtotal', key: 'subtotal', width: 12 },
      { header: 'Impuestos', key: 'impuestos', width: 12 },
      { header: 'Total', key: 'total', width: 12 },
      { header: 'Estado', key: 'estado', width: 14 },
    ];
    const rows = ventas.map(v => ({
      fecha: new Date(v.fecha).toLocaleString('es-MX'),
      numero_venta: v.numero_venta,
      sucursal: (v.sucursales as any)?.nombre || '—',
      cajero: (v.profiles as any)?.nombre || '—',
      cliente: (v.clientes as any)?.nombre || 'Público general',
      tipo_cliente: (v.clientes as any)?.tipo || 'publico',
      lista_precio: v.lista_precio_aplicada || 'LP1',
      subtotal: Number(v.subtotal || 0),
      impuestos: Number(v.impuestos || 0),
      total: Number(v.total || 0),
      estado: v.estado,
    }));
    if (format === 'excel') await exportGenericExcel('Reporte Ventas Unificado', cols, rows);
    else exportGenericPDF('Reporte Unificado de Ventas', cols.map(c => c.header), rows.map(r => [r.fecha, r.numero_venta, r.sucursal, r.cajero, r.cliente, r.tipo_cliente, r.lista_precio, `$${fmt(r.subtotal)}`, `$${fmt(r.impuestos)}`, `$${fmt(r.total)}`, r.estado]));
    toast.success(`${rows.length} ventas exportadas`);
  };

  const tToday = today();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reportes</h1>
        <p className="text-muted-foreground">Reporte unificado de ventas con filtros, más exportaciones operativas completas</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Productos Activos</CardTitle><Package className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.totalProductos}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Lotes Vencidos</CardTitle><AlertTriangle className="h-4 w-4 text-destructive" /></CardHeader><CardContent><div className="text-2xl font-bold text-destructive">{stats.lotesVencidos}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Movimientos del Mes</CardTitle><TrendingUp className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.movimientosMes}</div></CardContent></Card>
        <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium">Rutas Activas</CardTitle><Truck className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{stats.rutasActivas}</div></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ventas"><Receipt className="h-3 w-3 mr-1" />Ventas (Unificado)</TabsTrigger>
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="lotes">Lotes ({lotes.length})</TabsTrigger>
          <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          <TabsTrigger value="traspasos">Traspasos ({traspasos.length})</TabsTrigger>
          <TabsTrigger value="rutas">Rutas ({rutas.length})</TabsTrigger>
        </TabsList>

        {/* ── UNIFIED SALES REPORT ── */}
        <TabsContent value="ventas" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Filter className="h-4 w-4" />Filtros</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-4">
                <div><Label className="text-xs">Desde</Label><Input type="date" value={filtros.desde} onChange={e => setFiltros({ ...filtros, desde: e.target.value })} /></div>
                <div><Label className="text-xs">Hasta</Label><Input type="date" value={filtros.hasta} onChange={e => setFiltros({ ...filtros, hasta: e.target.value })} /></div>
                <div><Label className="text-xs">Sucursal</Label>
                  <Select value={filtros.sucursal_id} onValueChange={v => setFiltros({ ...filtros, sucursal_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      {sucursales.map(s => <SelectItem key={s.id} value={s.id}>{s.codigo} — {s.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Cajero/Vendedor</Label>
                  <Select value={filtros.cajero_id} onValueChange={v => setFiltros({ ...filtros, cajero_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {cajeros.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre || c.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Cliente</Label>
                  <Select value={filtros.cliente_id} onValueChange={v => setFiltros({ ...filtros, cliente_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {clientes.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Lista de Precio</Label>
                  <Select value={filtros.lista_precio} onValueChange={v => setFiltros({ ...filtros, lista_precio: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas</SelectItem>
                      <SelectItem value="LP1">LP1 — Público</SelectItem>
                      <SelectItem value="LP2">LP2 — Mayoreo</SelectItem>
                      <SelectItem value="LP3">LP3 — Especial</SelectItem>
                      <SelectItem value="LP4">LP4 — Institucional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Estado</Label>
                  <Select value={filtros.estado} onValueChange={v => setFiltros({ ...filtros, estado: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="completada">Completadas</SelectItem>
                      <SelectItem value="cancelada">Canceladas</SelectItem>
                      <SelectItem value="requiere_revision">Requieren revisión</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => exportVentas('excel')}><Download className="h-4 w-4 mr-1" />Excel</Button>
                  <Button variant="outline" size="sm" onClick={() => exportVentas('pdf')}><Download className="h-4 w-4 mr-1" />PDF</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-4">
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Total Vendido</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">${fmt(kpisVentas.totalVentas)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Tickets</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">{kpisVentas.totalTickets}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Ticket Promedio</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">${fmt(kpisVentas.ticketPromedio)}</div></CardContent></Card>
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Impuestos</CardTitle></CardHeader><CardContent><div className="text-2xl font-bold">${fmt(kpisVentas.totalImpuestos)}</div></CardContent></Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Ventas por Sucursal</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Sucursal</TableHead><TableHead className="text-right">Tickets</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {ventasPorSucursal.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground text-sm">Sin datos</TableCell></TableRow> :
                      ventasPorSucursal.map((r, i) => (
                        <TableRow key={i}><TableCell>{r.nombre}</TableCell><TableCell className="text-right">{r.tickets}</TableCell><TableCell className="text-right font-semibold">${fmt(r.total)}</TableCell></TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Ventas por Lista de Precio</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow><TableHead>Lista</TableHead><TableHead className="text-right">Tickets</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {ventasPorLista.length === 0 ? <TableRow><TableCell colSpan={3} className="text-center py-4 text-muted-foreground text-sm">Sin datos</TableCell></TableRow> :
                      ventasPorLista.map((r, i) => (
                        <TableRow key={i}><TableCell><Badge variant="outline">{r.lista}</Badge></TableCell><TableCell className="text-right">{r.tickets}</TableCell><TableCell className="text-right font-semibold">${fmt(r.total)}</TableCell></TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Detalle de Ventas ({ventas.length})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Número</TableHead><TableHead>Sucursal</TableHead><TableHead>Cajero</TableHead><TableHead>Cliente</TableHead><TableHead>Lista</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                <TableBody>
                  {ventasLoading ? <TableRow><TableCell colSpan={8} className="text-center py-8">Cargando...</TableCell></TableRow> :
                    ventas.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sin ventas en el rango seleccionado</TableCell></TableRow> :
                      ventas.slice(0, 500).map(v => (
                        <TableRow key={v.id}>
                          <TableCell className="text-xs">{new Date(v.fecha).toLocaleString('es-MX')}</TableCell>
                          <TableCell className="font-mono text-xs">{v.numero_venta}</TableCell>
                          <TableCell>{(v.sucursales as any)?.nombre || '—'}</TableCell>
                          <TableCell>{(v.profiles as any)?.nombre || '—'}</TableCell>
                          <TableCell>{(v.clientes as any)?.nombre || 'Público general'}</TableCell>
                          <TableCell><Badge variant="outline">{v.lista_precio_aplicada || 'LP1'}</Badge></TableCell>
                          <TableCell className="text-right font-semibold">${fmt(Number(v.total))}</TableCell>
                          <TableCell><Badge variant={v.estado === 'completada' ? 'default' : v.estado === 'cancelada' ? 'destructive' : 'secondary'}>{v.estado}</Badge></TableCell>
                        </TableRow>
                      ))}
                </TableBody>
              </Table>
              {ventas.length > 500 && <p className="text-xs text-muted-foreground text-center py-2">Mostrando primeros 500 — exporta a Excel/PDF para ver todos</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="productos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Catálogo de Productos</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportProductos('excel')}><Download className="h-4 w-4 mr-1" />Excel (todos)</Button>
                <Button size="sm" variant="outline" onClick={() => exportProductos('pdf')}><Download className="h-4 w-4 mr-1" />PDF (todos)</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>Nombre</TableHead><TableHead>Categoría</TableHead><TableHead className="text-right">Precio Base</TableHead><TableHead>Unidad</TableHead></TableRow></TableHeader>
                <TableBody>
                  {productos.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="font-medium">{p.nombre}</TableCell>
                      <TableCell><Badge variant="outline">{p.categoria || '—'}</Badge></TableCell>
                      <TableCell className="text-right">${fmt(p.precio_base)}</TableCell>
                      <TableCell>{p.unidad}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground text-center py-2">Vista previa de 200 — la exportación incluye todos los productos.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lotes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Lotes y Caducidades</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => exportLotes('excel')}><Download className="h-4 w-4 mr-1" />Excel (todos)</Button>
                <Button size="sm" variant="outline" onClick={() => exportLotes('pdf')}><Download className="h-4 w-4 mr-1" />PDF (todos)</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Lote</TableHead><TableHead>Producto</TableHead><TableHead>Proveedor</TableHead><TableHead className="text-right">Costo Unit.</TableHead><TableHead>Caducidad</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                <TableBody>
                  {lotes.map(l => {
                    const vencido = l.fecha_caducidad && l.fecha_caducidad < tToday;
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
                <Button size="sm" variant="outline" onClick={() => exportMovimientos('excel')}><Download className="h-4 w-4 mr-1" />Excel (todos)</Button>
                <Button size="sm" variant="outline" onClick={() => exportMovimientos('pdf')}><Download className="h-4 w-4 mr-1" />PDF (todos)</Button>
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
            <CardHeader><CardTitle>Traspasos entre Sucursales</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Origen</TableHead><TableHead>Destino</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
                <TableBody>
                  {traspasos.map(t => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs">{new Date(t.created_at).toLocaleDateString('es-MX')}</TableCell>
                      <TableCell>{(t.almacen_origen as any)?.sucursales?.nombre}</TableCell>
                      <TableCell>{(t.almacen_destino as any)?.sucursales?.nombre}</TableCell>
                      <TableCell><Badge variant={t.estado === 'completado' ? 'default' : t.estado === 'pendiente' ? 'secondary' : 'outline'}>{t.estado}</Badge></TableCell>
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
