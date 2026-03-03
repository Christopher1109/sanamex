import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, DollarSign, Percent, Download, Search } from 'lucide-react';
import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ProductoMargen {
  id: string;
  sku: string;
  nombre: string;
  categoria: string;
  costoUnitario: number;
  precioVenta: number;
  unidadesVendidas: number;
  costoTotal: number;
  ingresoTotal: number;
  ganancia: number;
  margen: number;
}

// Demo data
const demoData: ProductoMargen[] = [
  { id: '1', sku: 'MED-001', nombre: 'Paracetamol 500mg', categoria: 'Analgésicos', costoUnitario: 12.50, precioVenta: 28.00, unidadesVendidas: 340, costoTotal: 4250, ingresoTotal: 9520, ganancia: 5270, margen: 55.36 },
  { id: '2', sku: 'MED-002', nombre: 'Ibuprofeno 400mg', categoria: 'Analgésicos', costoUnitario: 18.00, precioVenta: 35.50, unidadesVendidas: 280, costoTotal: 5040, ingresoTotal: 9940, ganancia: 4900, margen: 49.30 },
  { id: '3', sku: 'MED-003', nombre: 'Amoxicilina 500mg', categoria: 'Antibióticos', costoUnitario: 45.00, precioVenta: 89.00, unidadesVendidas: 120, costoTotal: 5400, ingresoTotal: 10680, ganancia: 5280, margen: 49.44 },
  { id: '4', sku: 'MED-004', nombre: 'Omeprazol 20mg', categoria: 'Gastrointestinal', costoUnitario: 22.00, precioVenta: 55.00, unidadesVendidas: 200, costoTotal: 4400, ingresoTotal: 11000, ganancia: 6600, margen: 60.00 },
  { id: '5', sku: 'MED-005', nombre: 'Losartán 50mg', categoria: 'Cardiovascular', costoUnitario: 35.00, precioVenta: 72.00, unidadesVendidas: 150, costoTotal: 5250, ingresoTotal: 10800, ganancia: 5550, margen: 51.39 },
  { id: '6', sku: 'MED-006', nombre: 'Metformina 850mg', categoria: 'Diabetes', costoUnitario: 28.00, precioVenta: 48.00, unidadesVendidas: 180, costoTotal: 5040, ingresoTotal: 8640, ganancia: 3600, margen: 41.67 },
  { id: '7', sku: 'MED-007', nombre: 'Ciprofloxacino 500mg', categoria: 'Antibióticos', costoUnitario: 52.00, precioVenta: 95.00, unidadesVendidas: 90, costoTotal: 4680, ingresoTotal: 8550, ganancia: 3870, margen: 45.26 },
  { id: '8', sku: 'MED-008', nombre: 'Salbutamol Inhalador', categoria: 'Respiratorio', costoUnitario: 85.00, precioVenta: 180.00, unidadesVendidas: 65, costoTotal: 5525, ingresoTotal: 11700, ganancia: 6175, margen: 52.78 },
  { id: '9', sku: 'MED-009', nombre: 'Diclofenaco 100mg', categoria: 'Analgésicos', costoUnitario: 15.00, precioVenta: 32.00, unidadesVendidas: 260, costoTotal: 3900, ingresoTotal: 8320, ganancia: 4420, margen: 53.13 },
  { id: '10', sku: 'MED-010', nombre: 'Atorvastatina 20mg', categoria: 'Cardiovascular', costoUnitario: 42.00, precioVenta: 98.00, unidadesVendidas: 110, costoTotal: 4620, ingresoTotal: 10780, ganancia: 6160, margen: 57.14 },
  { id: '11', sku: 'MED-011', nombre: 'Insulina Glargina', categoria: 'Diabetes', costoUnitario: 320.00, precioVenta: 520.00, unidadesVendidas: 25, costoTotal: 8000, ingresoTotal: 13000, ganancia: 5000, margen: 38.46 },
  { id: '12', sku: 'MED-012', nombre: 'Cefalexina 500mg', categoria: 'Antibióticos', costoUnitario: 38.00, precioVenta: 68.00, unidadesVendidas: 95, costoTotal: 3610, ingresoTotal: 6460, ganancia: 2850, margen: 44.12 },
  { id: '13', sku: 'MED-013', nombre: 'Ranitidina 150mg', categoria: 'Gastrointestinal', costoUnitario: 14.00, precioVenta: 30.00, unidadesVendidas: 220, costoTotal: 3080, ingresoTotal: 6600, ganancia: 3520, margen: 53.33 },
  { id: '14', sku: 'MED-014', nombre: 'Clonazepam 2mg', categoria: 'Neurología', costoUnitario: 55.00, precioVenta: 120.00, unidadesVendidas: 45, costoTotal: 2475, ingresoTotal: 5400, ganancia: 2925, margen: 54.17 },
  { id: '15', sku: 'MED-015', nombre: 'Vitamina B12 Inyectable', categoria: 'Vitaminas', costoUnitario: 8.00, precioVenta: 25.00, unidadesVendidas: 400, costoTotal: 3200, ingresoTotal: 10000, ganancia: 6800, margen: 68.00 },
];

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MargenesPage = () => {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('all');

  const categorias = useMemo(() => [...new Set(demoData.map(d => d.categoria))], []);

  const filtered = useMemo(() => {
    return demoData.filter(p => {
      const matchSearch = !search || p.nombre.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
      const matchCat = catFilter === 'all' || p.categoria === catFilter;
      return matchSearch && matchCat;
    });
  }, [search, catFilter]);

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
      { header: 'Categoría', key: 'categoria', width: 18 },
      { header: 'Costo Unit.', key: 'costoUnitario', width: 14 },
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
    const a = document.createElement('a'); a.href = url; a.download = 'margenes_rentabilidad.xlsx'; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    doc.setFontSize(16);
    doc.text('Reporte de Márgenes y Rentabilidad', 14, 15);
    doc.setFontSize(10);
    doc.text(`Generado: ${new Date().toLocaleDateString('es-MX')}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [['SKU', 'Producto', 'Categoría', 'Costo Unit.', 'Precio Venta', 'Uds.', 'Costo Total', 'Ingreso Total', 'Ganancia', 'Margen %']],
      body: filtered.map(r => [r.sku, r.nombre, r.categoria, `$${fmt(r.costoUnitario)}`, `$${fmt(r.precioVenta)}`, r.unidadesVendidas, `$${fmt(r.costoTotal)}`, `$${fmt(r.ingresoTotal)}`, `$${fmt(r.ganancia)}`, `${fmt(r.margen)}%`]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [41, 128, 185] },
    });
    doc.save('margenes_rentabilidad.pdf');
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
          <p className="text-muted-foreground">Análisis de costo, precio de venta, ganancia y margen por producto</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel}><Download className="h-4 w-4 mr-2" />Excel</Button>
          <Button variant="outline" onClick={exportPDF}><Download className="h-4 w-4 mr-2" />PDF</Button>
        </div>
      </div>

      {/* KPI Cards */}
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

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre o SKU..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={catFilter} onValueChange={setCatFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Categoría" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead className="text-right">Costo Unit.</TableHead>
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
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell className="font-medium">{p.nombre}</TableCell>
                  <TableCell><Badge variant="outline">{p.categoria}</Badge></TableCell>
                  <TableCell className="text-right">${fmt(p.costoUnitario)}</TableCell>
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
        </CardContent>
      </Card>
    </div>
  );
};

export default MargenesPage;
