import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeRow, parseDate, parseInt2, parseNum } from '@/lib/headerNorm';

type Row = { fila: number; clave: string; proveedor_codigo: string; precio: number | null; fecha_inicio: string | null; fecha_fin: string | null; accion: 'INSERT' | 'OMIT'; motivo?: string; insert?: any };

export default function OfertasUploader({ onDone }: { onDone?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState('');
  const [open, setOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function descargar() {
    const ws = XLSX.utils.json_to_sheet([
      { proveedor_codigo: 'FANASA', clave_producto: '7501000000001', precio_oferta: 10.50, descuento_pct: 16, cantidad_minima: 24, fecha_inicio: '2026-01-01', fecha_fin: '2026-01-31', notas: 'Promo enero' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'ofertas');
    XLSX.writeFile(wb, 'plantilla_ofertas.xlsx');
  }

  async function leer(f: File) {
    setFileName(f.name);
    const ab = await f.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array', cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const normalized = raw.map(normalizeRow);

    const claves = Array.from(new Set(normalized.map(r => String(r.clave_producto || r.clave || '').trim()).filter(Boolean)));
    const productoByClave = new Map<string, string>();
    const CHUNK = 250;
    for (let i = 0; i < claves.length; i += CHUNK) {
      const slice = claves.slice(i, i + CHUNK);
      const [a, b] = await Promise.all([
        supabase.from('productos').select('id, sku, codigo_barras').in('sku', slice),
        supabase.from('productos').select('id, sku, codigo_barras').in('codigo_barras', slice),
      ]);
      for (const p of [...(a.data || []), ...(b.data || [])] as any[]) {
        if (p.codigo_barras) productoByClave.set(String(p.codigo_barras), p.id);
        if (p.sku && !productoByClave.has(String(p.sku))) productoByClave.set(String(p.sku), p.id);
      }
    }
    const { data: provs } = await supabase.from('proveedores').select('id, codigo').not('codigo', 'is', null);
    const provByCodigo = new Map<string, string>();
    (provs || []).forEach((p: any) => provByCodigo.set(String(p.codigo).toUpperCase(), p.id));

    const preview: Row[] = normalized.map((r, idx) => {
      const fila = idx + 2;
      const clave = String(r.clave_producto || r.clave || '').trim();
      const provCode = String(r.proveedor_codigo || '').trim().toUpperCase();
      const precio = parseNum(r.precio_oferta);
      const fIni = parseDate(r.fecha_inicio);
      const fFin = parseDate(r.fecha_fin);
      if (!clave || !provCode) return { fila, clave, proveedor_codigo: provCode, precio, fecha_inicio: fIni, fecha_fin: fFin, accion: 'OMIT', motivo: 'Faltan clave o proveedor' };
      if (precio == null || precio < 0) return { fila, clave, proveedor_codigo: provCode, precio, fecha_inicio: fIni, fecha_fin: fFin, accion: 'OMIT', motivo: 'Precio inválido' };
      if (!fIni || !fFin) return { fila, clave, proveedor_codigo: provCode, precio, fecha_inicio: fIni, fecha_fin: fFin, accion: 'OMIT', motivo: 'Fechas inválidas' };
      if (fFin < fIni) return { fila, clave, proveedor_codigo: provCode, precio, fecha_inicio: fIni, fecha_fin: fFin, accion: 'OMIT', motivo: 'fecha_fin < fecha_inicio' };

      const pid = productoByClave.get(clave);
      const provId = provByCodigo.get(provCode);
      if (!pid) return { fila, clave, proveedor_codigo: provCode, precio, fecha_inicio: fIni, fecha_fin: fFin, accion: 'OMIT', motivo: 'Producto no encontrado' };
      if (!provId) return { fila, clave, proveedor_codigo: provCode, precio, fecha_inicio: fIni, fecha_fin: fFin, accion: 'OMIT', motivo: 'Proveedor no encontrado' };

      return {
        fila, clave, proveedor_codigo: provCode, precio, fecha_inicio: fIni, fecha_fin: fFin, accion: 'INSERT',
        insert: {
          proveedor_id: provId, producto_id: pid, precio_oferta: precio,
          descuento_pct: parseNum(r.descuento_pct), cantidad_minima: parseInt2(r.cantidad_minima) ?? 1,
          fecha_inicio: fIni, fecha_fin: fFin, notas: r.notas || null, activo: true,
        },
      };
    });

    setRows(preview);
    setOpen(true);
  }

  async function ejecutar() {
    setCommitting(true);
    let ins = 0, err = 0;
    try {
      const inserts = rows.filter(r => r.accion === 'INSERT');
      for (let i = 0; i < inserts.length; i += 500) {
        const slice = inserts.slice(i, i + 500);
        const { error, count } = await supabase.from('ofertas_proveedor').insert(slice.map(s => s.insert), { count: 'exact' });
        if (error) { toast.error(error.message); err += slice.length; } else ins += count || slice.length;
      }
      toast.success(`Ofertas: ${ins} insertadas · ${err} errores`);
      setOpen(false); setRows([]); onDone?.();
    } finally {
      setCommitting(false);
    }
  }

  const counts = { INSERT: rows.filter(r => r.accion === 'INSERT').length, OMIT: rows.filter(r => r.accion === 'OMIT').length };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Columnas: proveedor_codigo, clave_producto, precio_oferta, descuento_pct (opc), cantidad_minima, fecha_inicio (YYYY-MM-DD), fecha_fin, notas. Cada fila crea una oferta nueva (no upsert).</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={descargar}><Download className="h-4 w-4 mr-2" />Plantilla</Button>
        <Button onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Subir Excel</Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ''; }} />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Vista previa — Ofertas ({fileName})</DialogTitle></DialogHeader>
          <div className="flex gap-2">
            <Badge className="bg-green-600">INSERT: {counts.INSERT}</Badge>
            <Badge variant="destructive">OMIT: {counts.OMIT}</Badge>
          </div>
          <div className="max-h-[55vh] overflow-auto border rounded-md">
            <Table>
              <TableHeader><TableRow><TableHead>Fila</TableHead><TableHead>Acción</TableHead><TableHead>Proveedor</TableHead><TableHead>Clave</TableHead><TableHead>Precio</TableHead><TableHead>Vigencia</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.slice(0, 300).map(r => (
                  <TableRow key={r.fila}>
                    <TableCell className="text-xs">{r.fila}</TableCell>
                    <TableCell>{r.accion === 'INSERT' ? <Badge className="bg-green-600">INSERT</Badge> : <Badge variant="destructive">OMIT</Badge>}</TableCell>
                    <TableCell className="text-xs">{r.proveedor_codigo}</TableCell>
                    <TableCell className="font-mono text-xs">{r.clave || '—'}</TableCell>
                    <TableCell className="text-xs">{r.precio != null ? `$${r.precio.toFixed(2)}` : '—'}</TableCell>
                    <TableCell className="text-xs">{r.fecha_inicio} → {r.fecha_fin}</TableCell>
                    <TableCell className="text-xs text-red-600">{r.motivo || ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={ejecutar} disabled={committing || counts.INSERT === 0}>
              {committing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Importar {counts.INSERT}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
