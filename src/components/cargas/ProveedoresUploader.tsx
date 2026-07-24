import { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { normalizeRow, parseBool, parseInt2, parseNum } from '@/lib/headerNorm';

type Row = { fila: number; codigo: string; nombre: string; accion: 'INSERT' | 'UPDATE' | 'OMIT'; motivo?: string; patch?: any; existenteId?: string };

export default function ProveedoresUploader({ onDone }: { onDone?: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState('');
  const [open, setOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function descargar() {
    const ws = XLSX.utils.json_to_sheet([{
      codigo: 'FANASA', nombre: 'Fanasa', razon_social: 'FANASA SA DE CV', rfc: 'FAN800101AAA',
      contacto_nombre: 'Juan Pérez', contacto_telefono: '5555555555', contacto_email: 'ventas@fanasa.com',
      dias_credito: 30, dias_entrega: 3, entrega_por_sucursal: 'no',
      tiene_lista_regular: 'sí', frecuencia_listas: 'semanal',
      acepta_devoluciones: 'sí', pago_contra_entrega: 'no', notas_credito: 'sí',
      lead_time_dias: 3, monto_minimo_pedido: 5000, observaciones: 'Mayoreo farmacéutico nacional',
    }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'proveedores');
    XLSX.writeFile(wb, 'plantilla_proveedores.xlsx');
  }

  async function leer(f: File) {
    setFileName(f.name);
    const ab = await f.arrayBuffer();
    const wb = XLSX.read(ab, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const normalized = raw.map(normalizeRow);

    const codigos = Array.from(new Set(normalized.map(r => String(r.codigo || '').trim().toUpperCase()).filter(Boolean)));
    const { data: existentes } = await supabase.from('proveedores').select('id, codigo, nombre').not('codigo', 'is', null);
    const byCodigo = new Map<string, any>();
    (existentes || []).forEach(p => { if (p.codigo) byCodigo.set(String(p.codigo).toUpperCase(), p); });

    const seen = new Set<string>();
    const preview: Row[] = normalized.map((r, idx) => {
      const fila = idx + 2;
      const codigo = String(r.codigo || '').trim().toUpperCase();
      const nombre = String(r.nombre || '').trim();
      if (!codigo) return { fila, codigo: '', nombre, accion: 'OMIT', motivo: 'Código vacío' };
      if (!nombre) return { fila, codigo, nombre: '', accion: 'OMIT', motivo: 'Nombre vacío' };
      if (seen.has(codigo)) return { fila, codigo, nombre, accion: 'OMIT', motivo: 'Código duplicado en archivo' };
      seen.add(codigo);

      const patch: any = {
        codigo,
        nombre,
        razon_social: r.razon_social || null,
        rfc: r.rfc || null,
        contacto: r.contacto_nombre || r.contacto || null,
        telefono: r.contacto_telefono || r.telefono || null,
        email: r.contacto_email || r.email || null,
        plazo_pago_dias: parseInt2(r.dias_credito) ?? 0,
        dias_entrega: parseInt2(r.dias_entrega) ?? parseInt2(r.lead_time_dias) ?? null,
        entrega_por_sucursal: parseBool(r.entrega_por_sucursal) ?? false,
        tiene_lista_regular: parseBool(r.tiene_lista_regular) ?? true,
        frecuencia_listas: r.frecuencia_listas || null,
        acepta_devoluciones: parseBool(r.acepta_devoluciones) ?? false,
        pago_contra_entrega: parseBool(r.pago_contra_entrega) ?? false,
        acepta_notas_credito: parseBool(r.notas_credito) ?? false,
        lead_time_prometido_dias: parseInt2(r.lead_time_dias) ?? null,
        monto_minimo_pedido: parseNum(r.monto_minimo_pedido) ?? 0,
        notas: r.observaciones || null,
        activo: true,
      };

      const existente = byCodigo.get(codigo);
      if (existente) return { fila, codigo, nombre, accion: 'UPDATE', existenteId: existente.id, patch };
      return { fila, codigo, nombre, accion: 'INSERT', patch };
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
        const { error, count } = await supabase.from('proveedores').insert(inserts.map(r => r.patch), { count: 'exact' });
        if (error) { toast.error('Error insert: ' + error.message); err += inserts.length; } else ins = count || inserts.length;
      }
      for (const u of updates) {
        const { error } = await supabase.from('proveedores').update(u.patch).eq('id', u.existenteId!);
        if (error) err++; else upd++;
      }
      toast.success(`Proveedores: ${ins} nuevos · ${upd} actualizados · ${err} errores`);
      setOpen(false); setRows([]); onDone?.();
    } finally {
      setCommitting(false);
    }
  }

  const counts = {
    INSERT: rows.filter(r => r.accion === 'INSERT').length,
    UPDATE: rows.filter(r => r.accion === 'UPDATE').length,
    OMIT: rows.filter(r => r.accion === 'OMIT').length,
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Columnas: codigo (PK), nombre, razon_social, rfc, contacto_nombre, contacto_telefono, contacto_email, dias_credito, acepta_devoluciones (sí/no), pago_contra_entrega, notas_credito, lead_time_dias, monto_minimo_pedido, observaciones. UPSERT por código.</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={descargar}><Download className="h-4 w-4 mr-2" />Plantilla</Button>
        <Button onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Subir Excel</Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ''; }} />
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Vista previa — Proveedores ({fileName})</DialogTitle></DialogHeader>
          <div className="flex gap-2">
            <Badge className="bg-green-600">INSERT: {counts.INSERT}</Badge>
            <Badge className="bg-blue-600">UPDATE: {counts.UPDATE}</Badge>
            <Badge variant="destructive">OMIT: {counts.OMIT}</Badge>
          </div>
          <div className="max-h-[55vh] overflow-auto border rounded-md">
            <Table>
              <TableHeader><TableRow><TableHead>Fila</TableHead><TableHead>Acción</TableHead><TableHead>Código</TableHead><TableHead>Nombre / Motivo</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.slice(0, 300).map(r => (
                  <TableRow key={r.fila}>
                    <TableCell className="text-xs">{r.fila}</TableCell>
                    <TableCell>
                      {r.accion === 'INSERT' && <Badge className="bg-green-600">INSERT</Badge>}
                      {r.accion === 'UPDATE' && <Badge className="bg-blue-600">UPDATE</Badge>}
                      {r.accion === 'OMIT' && <Badge variant="destructive">OMIT</Badge>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.codigo || '—'}</TableCell>
                    <TableCell className="text-xs">{r.accion === 'OMIT' ? <span className="text-red-600">{r.motivo}</span> : r.nombre}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={ejecutar} disabled={committing || counts.INSERT + counts.UPDATE === 0}>
              {committing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Importar {counts.INSERT + counts.UPDATE} filas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
