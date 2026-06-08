import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeRow } from '@/lib/headerNorm';

const ESTATUS_VALIDOS = ['A', 'I', 'C', 'S', 'N', 'E', 'K', 'G'];

// Legacy mapping: F37 -> F36, F35/IZTAPALAPA -> omit
function mapSucLegacy(code: string): string | null {
  const c = code.trim().toUpperCase();
  if (c === 'F37') return 'F36';
  if (c === 'F35' || c === 'IZTAPALAPA' || c === '') return null;
  return c;
}

type Row = { fila: number; clave: string; sucursal_codigo: string; estatus: string; accion: 'INSERT' | 'UPDATE' | 'OMIT'; motivo?: string; patch?: any; existenteId?: string };

export default function EstatusSucursalUploader({ onDone }: { onDone?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState('');
  const [open, setOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function descargar() {
    const ws = XLSX.utils.json_to_sheet([
      { clave: '7501000000001', sucursal_codigo: 'SV', estatus: 'A', motivo: '' },
      { clave: '7501000000001', sucursal_codigo: 'GH', estatus: 'I', motivo: 'Sucursal no vende esta categoría' },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'estatus_sucursal');
    XLSX.writeFile(wb, 'plantilla_estatus_sucursal.xlsx');
  }

  async function leer(f: File) {
    setFileName(f.name);
    const ab = await f.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const normalized = raw.map(normalizeRow);

    const claves = Array.from(new Set(normalized.map(r => String(r.clave || '').trim()).filter(Boolean)));
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

    const { data: sucs } = await supabase.from('sucursales').select('id, codigo');
    const sucByCodigo = new Map<string, string>();
    (sucs || []).forEach((s: any) => sucByCodigo.set(String(s.codigo).toUpperCase(), s.id));

    const { data: existing } = await supabase.from('producto_sucursal_estatus').select('id, producto_id, sucursal_id');
    const exMap = new Map<string, string>();
    (existing || []).forEach((e: any) => exMap.set(`${e.producto_id}::${e.sucursal_id}`, e.id));

    const preview: Row[] = normalized.map((r, idx) => {
      const fila = idx + 2;
      const clave = String(r.clave || '').trim();
      const sucRaw = String(r.sucursal_codigo || '').trim().toUpperCase();
      const sucCode = mapSucLegacy(sucRaw);
      const estatus = String(r.estatus || '').trim().toUpperCase();

      if (!clave) return { fila, clave: '', sucursal_codigo: sucRaw, estatus, accion: 'OMIT', motivo: 'Clave vacía' };
      if (!sucCode) return { fila, clave, sucursal_codigo: sucRaw, estatus, accion: 'OMIT', motivo: `Sucursal omitida (legacy): ${sucRaw}` };
      if (!ESTATUS_VALIDOS.includes(estatus)) return { fila, clave, sucursal_codigo: sucCode, estatus, accion: 'OMIT', motivo: `Estatus inválido: ${estatus}` };
      const pid = productoByClave.get(clave);
      if (!pid) return { fila, clave, sucursal_codigo: sucCode, estatus, accion: 'OMIT', motivo: 'Producto no encontrado' };
      const sid = sucByCodigo.get(sucCode);
      if (!sid) return { fila, clave, sucursal_codigo: sucCode, estatus, accion: 'OMIT', motivo: 'Sucursal no encontrada' };

      const patch: any = {
        producto_id: pid,
        sucursal_id: sid,
        estatus,
        motivo: r.motivo || null,
        fecha_cambio: new Date().toISOString().slice(0, 10),
      };
      const exId = exMap.get(`${pid}::${sid}`);
      if (exId) return { fila, clave, sucursal_codigo: sucCode, estatus, accion: 'UPDATE', existenteId: exId, patch };
      return { fila, clave, sucursal_codigo: sucCode, estatus, accion: 'INSERT', patch };
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
      for (let i = 0; i < inserts.length; i += 500) {
        const slice = inserts.slice(i, i + 500);
        const { error, count } = await supabase.from('producto_sucursal_estatus').insert(slice.map(s => s.patch), { count: 'exact' });
        if (error) { toast.error(error.message); err += slice.length; } else ins += count || slice.length;
      }
      for (const u of updates) {
        const { error } = await supabase.from('producto_sucursal_estatus').update(u.patch).eq('id', u.existenteId!);
        if (error) err++; else upd++;
      }
      toast.success(`Estatus: ${ins} nuevos · ${upd} actualizados · ${err} errores`);
      setOpen(false); setRows([]); onDone?.();
    } finally {
      setCommitting(false);
    }
  }

  const counts = { INSERT: rows.filter(r => r.accion === 'INSERT').length, UPDATE: rows.filter(r => r.accion === 'UPDATE').length, OMIT: rows.filter(r => r.accion === 'OMIT').length };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Columnas: clave, sucursal_codigo (SV/ECA/F36/GH/CEDIS), estatus (A/I/C/S/N/E/K/G), motivo. Aplica mapeo legacy F37→F36 y omite F35/IZTAPALAPA.</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={descargar}><Download className="h-4 w-4 mr-2" />Plantilla</Button>
        <Button onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Subir Excel</Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ''; }} />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Vista previa — Estatus por sucursal ({fileName})</DialogTitle></DialogHeader>
          <div className="flex gap-2">
            <Badge className="bg-green-600">INSERT: {counts.INSERT}</Badge>
            <Badge className="bg-blue-600">UPDATE: {counts.UPDATE}</Badge>
            <Badge variant="destructive">OMIT: {counts.OMIT}</Badge>
          </div>
          <div className="max-h-[55vh] overflow-auto border rounded-md">
            <Table>
              <TableHeader><TableRow><TableHead>Fila</TableHead><TableHead>Acción</TableHead><TableHead>Clave</TableHead><TableHead>Sucursal</TableHead><TableHead>Estatus</TableHead><TableHead>Motivo</TableHead></TableRow></TableHeader>
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
                    <TableCell className="text-xs">{r.sucursal_codigo}</TableCell>
                    <TableCell className="text-xs">{r.estatus}</TableCell>
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
