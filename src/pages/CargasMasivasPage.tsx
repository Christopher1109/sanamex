import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useSucursal } from '@/contexts/SucursalContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, Download, FileSpreadsheet } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import AtributosMaestrosUploader from '@/components/cargas/AtributosMaestrosUploader';

type TipoCarga = 'productos' | 'proveedores' | 'clientes' | 'historico_ventas' | 'atributos_maestros';

const PLANTILLAS: Record<TipoCarga, { columnas: string[]; ejemplo: any[] }> = {
  productos: {
    columnas: ['sku', 'nombre', 'categoria', 'unidad', 'precio_base', 'stock_minimo', 'codigo_barras'],
    ejemplo: [{ sku: 'MED-001', nombre: 'Paracetamol 500mg', categoria: 'Analgésicos', unidad: 'caja', precio_base: 45, stock_minimo: 30, codigo_barras: '7501000000001' }],
  },
  proveedores: {
    columnas: ['nombre', 'rfc', 'contacto', 'telefono', 'email'],
    ejemplo: [{ nombre: 'Laboratorios ABC', rfc: 'ABC010101AA1', contacto: 'Juan Pérez', telefono: '5551234567', email: 'ventas@abc.com' }],
  },
  clientes: {
    columnas: ['nombre', 'rfc', 'tipo', 'telefono', 'email', 'direccion'],
    ejemplo: [{ nombre: 'Farmacia Sol', rfc: 'FSO010101AA1', tipo: 'mayoreo', telefono: '5559876543', email: 'compras@sol.com', direccion: 'Av. Reforma 100' }],
  },
  historico_ventas: {
    columnas: ['producto_sku', 'producto_nombre', 'cantidad', 'precio_unitario', 'fecha', 'proveedor_sugerido'],
    ejemplo: [{ producto_sku: 'MED-001', producto_nombre: 'Paracetamol 500mg', cantidad: 25, precio_unitario: 45, fecha: '2025-01-15', proveedor_sugerido: 'Laboratorios ABC' }],
  },
  atributos_maestros: {
    columnas: ['clave', 'descripcion', 'nombre', 'laboratorio', 'categoria', 'departamento', 'agrupador', 'sustancia', 'iva', 'estatus', 'clasificacion'],
    ejemplo: [{ clave: '7501000000001', descripcion: 'PARACETAMOL 500MG C/10', nombre: 'PARACETAMOL 500MG', laboratorio: 'GENOMMA', categoria: 'ANALGÉSICOS', departamento: 'GENERICO', agrupador: 'GENÉRICOS', sustancia: 'PARACETAMOL', iva: 0, estatus: 'A', clasificacion: 'B' }],
  },
};

export default function CargasMasivasPage() {
  const { selectedSucursal } = useSucursal();
  const [tipo, setTipo] = useState<TipoCarga>('productos');
  const [historico, setHistorico] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadHist(); }, []);

  async function loadHist() {
    const { data } = await supabase.from('cargas_masivas_historico').select('*').order('created_at', { ascending: false }).limit(30);
    setHistorico(data || []);
  }

  function descargarPlantilla() {
    const tmpl = PLANTILLAS[tipo];
    const ws = XLSX.utils.json_to_sheet(tmpl.ejemplo);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tipo);
    XLSX.writeFile(wb, `plantilla_${tipo}.xlsx`);
  }

  async function procesarArchivo(file: File) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);
    if (!rows.length) { toast.error('Archivo vacío'); return; }

    let ok = 0, err = 0;
    const errores: any[] = [];

    if (tipo === 'productos') {
      for (const r of rows) {
        if (!r.sku || !r.nombre) { err++; errores.push({ fila: r, error: 'Faltan SKU o nombre' }); continue; }
        const { error } = await supabase.from('productos').upsert({
          sku: String(r.sku), nombre: String(r.nombre), categoria: r.categoria, unidad: r.unidad || 'pieza',
          precio_base: Number(r.precio_base || 0), stock_minimo: Number(r.stock_minimo || 10), codigo_barras: r.codigo_barras ? String(r.codigo_barras) : null,
        }, { onConflict: 'sku' });
        if (error) { err++; errores.push({ fila: r, error: error.message }); } else ok++;
      }
    } else if (tipo === 'proveedores') {
      for (const r of rows) {
        if (!r.nombre) { err++; errores.push({ fila: r, error: 'Falta nombre' }); continue; }
        const { error } = await supabase.from('proveedores').insert({
          nombre: String(r.nombre), rfc: r.rfc, contacto: r.contacto, telefono: r.telefono?.toString(), email: r.email,
        });
        if (error) { err++; errores.push({ fila: r, error: error.message }); } else ok++;
      }
    } else if (tipo === 'clientes') {
      for (const r of rows) {
        if (!r.nombre) { err++; errores.push({ fila: r, error: 'Falta nombre' }); continue; }
        const { error } = await supabase.from('clientes').insert({
          nombre: String(r.nombre), rfc: r.rfc, tipo: r.tipo || 'mayoreo', telefono: r.telefono?.toString(), email: r.email, direccion: r.direccion,
        });
        if (error) { err++; errores.push({ fila: r, error: error.message }); } else ok++;
      }
    } else if (tipo === 'historico_ventas') {
      const batch = rows.map((r: any) => ({
        sucursal_id: selectedSucursal?.id || null,
        producto_sku: String(r.producto_sku || ''),
        producto_nombre: r.producto_nombre,
        cantidad: Number(r.cantidad || 0),
        precio_unitario: Number(r.precio_unitario || 0),
        fecha: r.fecha,
        proveedor_sugerido: r.proveedor_sugerido,
      })).filter(r => r.producto_sku && r.fecha);
      const { error, count } = await supabase.from('ventas_historicas').insert(batch, { count: 'exact' });
      if (error) { err = batch.length; errores.push({ error: error.message }); } else ok = count || batch.length;
    } else if (tipo === 'atributos_maestros') {
      // Handled via dedicated component with preview dialog. No-op here.
      return;
    }

    await supabase.from('cargas_masivas_historico').insert({
      tipo, nombre_archivo: file.name, total_filas: rows.length, filas_ok: ok, filas_error: err,
      errores: errores.length ? errores.slice(0, 50) : null,
      sucursal_id: selectedSucursal?.id || null,
    });

    toast.success(`Procesado: ${ok} ok / ${err} con error`);
    loadHist();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileSpreadsheet className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Cargas Masivas</h1>
          <p className="text-sm text-muted-foreground">Importa productos, proveedores, clientes e históricos desde Excel.</p>
        </div>
      </div>

      <Tabs value={tipo} onValueChange={v => setTipo(v as TipoCarga)}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="productos">Productos</TabsTrigger>
          <TabsTrigger value="atributos_maestros">Atributos Maestros</TabsTrigger>
          <TabsTrigger value="proveedores">Proveedores</TabsTrigger>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="historico_ventas">Histórico ventas</TabsTrigger>
        </TabsList>

        {(['productos', 'atributos_maestros', 'proveedores', 'clientes', 'historico_ventas'] as TipoCarga[]).map(t => (
          <TabsContent key={t} value={t}>
            <Card className="p-5 space-y-4">
              {t === 'atributos_maestros' ? (
                <AtributosMaestrosUploader onDone={loadHist} />
              ) : (
                <>
                  <div>
                    <h3 className="font-semibold">Columnas esperadas:</h3>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {PLANTILLAS[t].columnas.map(c => <Badge key={c} variant="outline">{c}</Badge>)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={descargarPlantilla}><Download className="h-4 w-4 mr-2" />Descargar plantilla</Button>
                    <Button onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Subir Excel</Button>
                    <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) procesarArchivo(f); e.target.value = ''; }} />
                  </div>
                  {t === 'historico_ventas' && (
                    <p className="text-sm text-muted-foreground">Este histórico alimenta el módulo de Recomendaciones IA.</p>
                  )}
                </>
              )}
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Card>
        <div className="p-4 border-b"><h2 className="font-semibold">Historial de cargas</h2></div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Archivo</TableHead>
              <TableHead className="text-right">Filas</TableHead>
              <TableHead className="text-right">OK</TableHead>
              <TableHead className="text-right">Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {historico.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">Sin cargas previas.</TableCell></TableRow>}
            {historico.map(h => (
              <TableRow key={h.id}>
                <TableCell className="text-sm">{new Date(h.created_at).toLocaleString()}</TableCell>
                <TableCell><Badge variant="outline">{h.tipo}</Badge></TableCell>
                <TableCell className="text-sm">{h.nombre_archivo || '—'}</TableCell>
                <TableCell className="text-right">{h.total_filas}</TableCell>
                <TableCell className="text-right text-green-600">{h.filas_ok}</TableCell>
                <TableCell className="text-right text-red-600">{h.filas_error}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
