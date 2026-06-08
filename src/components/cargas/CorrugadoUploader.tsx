import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeRow, parseInt2 } from '@/lib/headerNorm';

type Row = { fila: number; clave: string; proveedor_codigo: string; accion: 'INSERT' | 'UPDATE' | 'OMIT'; motivo?: string; patch?: any; existenteId?: string };

export default function CorrugadoUploader({ onDone }: { onDone?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState('');
  const [open, setOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function descargar() {
    const ws = XLSX.utils.json_to_sheet([
      { clave: '7501000000001', proveedor_codigo: '', piezas_por_corrugado: 12, piezas_por_caja_master: 144, unidad_minima_compra: 1, notas: 'Genérico para todos los proveedores' },
      { clave: '7501000000002', proveedor_codigo: 'FANASA', piezas_por_corrugado: 24, piezas_por_caja_master: 240, unidad_minima_compra: 24, notas: 'Específico de Fanasa' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'corrugado');
    XLSX.writeFile(wb, 'plantilla_corrugado.xlsx');
  }

  async function leer(f: File) {
    setFileName(f.name);
    const ab = await f.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const normalized = raw.map(normalizeRow);

    const claves = Array.from(new Set(normalized.map(r => String(r.clave || '').trim()).filter(Boolean)));
    const provCodes = Array.from(new Set(normalized.map(r => String(r.proveedor_codigo || '').trim().toUpperCase()).filter(Boolean)));

    // Fetch productos + proveedores
    const CHUNK = 250;
    const productoByClave = new Map<string, string>();
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
    (provs || []).forEach((p: any) => { if (p.codigo) provByCodigo.set(String(p.codigo).toUpperCase(), p.id); });

    // Existing corrugado entries to detect UPDATE vs INSERT
    const { data: existing } = await supabase.from('producto_corrugado').select('id, producto_id, proveedor_id');
    const exKey = (pid: string, prov: string | null) => `${pid}::${prov || ''}`;
    const exMap = new Map<string, string>();
    (existing || []).forEach((e: any) => exMap.set(exKey(e.producto_id, e.proveedor_id), e.id));

    const preview: Row[] = normalized.map((r, idx) => {
      const fila = idx + 2;
      const clave = String(r.clave || '').trim();
      const provCode = String(r.proveedor_codigo || '').trim().toUpperCase();
      const piezas = parseInt2(r.piezas_por_corrugado);
      if (!clave) return { fila, clave: '', proveedor_codigo: provCode, accion: 'OMIT', motivo: 'Clave vacía' };
      if (!piezas || piezas <= 0) return { fila, clave, proveedor_codigo: provCode, accion: 'OMIT', motivo: 'piezas_por_corrugado inválido' };
      const pid = productoByClave.get(clave);
      if (!pid) return { fila, clave, proveedor_codigo: provCode, accion: 'OMIT', motivo: 'Producto no encontrado' };
      const provId = provCode ? provByCodigo.get(provCode) : null;
      if (provCode && !provId) return { fila, clave, proveedor_codigo: provCode, accion: 'OMIT', motivo: 'Proveedor no encontrado' };

      const patch: any = {
        producto_id: pid,
        proveedor_id: provId || null,
        piezas_por_corrugado: piezas,
        piezas_por_caja_master: parseInt2(r.piezas_por_caja_master),
        unidad_minima_compra: parseInt2(r.unidad_minima_compra) ?? 1,
        notas: r.notas || null,
      };
      const existingId = exMap.get(exKey(pid, provId || null));
      if (existingId) return { fila, clave, proveedor_codigo: provCode, accion: 'UPDATE', existenteId: existingId, patch };
      return { fila, clave, proveedor_codigo: provCode, accion: 'INSERT', patch };
    });

    setRows(preview);
    setOpen(true);
  }

  async function ejecutar() {
    setCommitting(true);
    let ins = 0, upd = 0, err = 0;
    try {
      const inserts = rows.filter(r => r.accion === 'INSERT');
      const updates = rows.filter(r => r.accion === 'UPDATE');
      if (inserts.length) {
        for (let i = 0; i < inserts.length; i += 500) {
          const slice = inserts.slice(i, i + 500);
          const { error, count } = await supabase.from('producto_corrugado').insert(slice.map(s => s.patch), { count: 'exact' });
          if (error) { toast.error('Error: ' + error.message); err += slice.length; } else ins += count || slice.length;
        }
      }
      for (const u of updates) {
        const { error } = await supabase.from('producto_corrugado').update(u.patch).eq('id', u.existenteId!);
        if (error) err++; else upd++;
      }
      toast.success(`Corrugado: ${ins} nuevos · ${upd} actualizados · ${err} errores`);
      setOpen(false); setRows([]); onDone?.();
    } finally {
      setCommitting(false);
    }
  }

  const counts = { INSERT: rows.filter(r => r.accion === 'INSERT').length, UPDATE: rows.filter(r => r.accion === 'UPDATE').length, OMIT: rows.filter(r => r.accion === 'OMIT').length };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Columnas: clave, proveedor_codigo (vacío = aplica a todos), piezas_por_corrugado, piezas_por_caja_master, unidad_minima_compra, notas. UPSERT por (producto, proveedor).</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={descargar}><Download className="h-4 w-4 mr-2" />Plantilla</Button>
        <Button onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Subir Excel</Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ''; }} />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Vista previa — Corrugado ({fileName})</DialogTitle></DialogHeader>
          <div className="flex gap-2">
            <Badge className="bg-green-600">INSERT: {counts.INSERT}</Badge>
            <Badge className="bg-blue-600">UPDATE: {counts.UPDATE}</Badge>
            <Badge variant="destructive">OMIT: {counts.OMIT}</Badge>
          </div>
          <div className="max-h-[55vh] overflow-auto border rounded-md">
            <Table>
              <TableHeader><TableRow><TableHead>Fila</TableHead><TableHead>Acción</TableHead><TableHead>Clave</TableHead><TableHead>Proveedor</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.slice(0, 300).map(r => (
                  <TableRow key={r.fila}>
                    <TableCell className="text-xs">{r.fila}</TableCell>
                    <TableCell>
                      {r.accion === 'INSERT' && <Badge className="bg-green-600">INSERT</Badge>}
                      {r.accion === 'UPDATE' && <Badge className="bg-blue-600">UPDATE</Badge>}
                      {r.accion === 'OMIT' && <Badge variant="destructive">OMIT</Badge>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.clave || '—'}</TableCell>
                    <TableCell className="text-xs">{r.proveedor_codigo || '(genérico)'}</TableCell>
                    <TableCell className="text-xs text-red-600">{r.motivo || ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={ejecutar} disabled={committing || counts.INSERT + counts.UPDATE === 0}>
              {committing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Importar {counts.INSERT + counts.UPDATE}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
