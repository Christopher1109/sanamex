import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import SheetPickerDialog from './SheetPickerDialog';

const COLUMNAS = [
  'clave', 'descripcion', 'nombre', 'laboratorio', 'categoria',
  'departamento', 'agrupador', 'sustancia', 'iva', 'estatus', 'clasificacion',
] as const;

// Nota: el campo `clasificacion` es texto libre del cliente (A-W, DESCLASIFICADO, etc.).
// La clasificación ABC (A/B/C/D/O) es calculada por el sistema en `clasificacion_80_20` y NO se carga desde Excel.

type PreviewRow = {
  fila: number;             // row number in Excel (1-based, header excluded)
  raw: Record<string, any>;
  clave: string;
  accion: 'INSERT' | 'UPDATE' | 'OMIT';
  motivo?: string;
  patch?: Record<string, any>;
  existenteId?: string;
};

const norm = (v: any) => (v == null ? '' : String(v).trim());
const notEmpty = (v: any) => norm(v) !== '';

function parseIva(raw: any): { ok: boolean; value: number | null; err?: string } {
  if (!notEmpty(raw)) return { ok: true, value: null };
  const n = Number(String(raw).replace(/[%\s]/g, '').replace(',', '.'));
  if (isNaN(n)) return { ok: false, value: null, err: 'IVA no numérico' };
  // Normaliza a 0–100
  const v = n > 1 ? n : n * 100;
  if (v < 0 || v > 100) return { ok: false, value: null, err: 'IVA fuera de rango 0–100' };
  return { ok: true, value: v };
}

export default function AtributosMaestrosUploader({ onDone }: { onDone?: () => void }) {
  const [estatusCatalog, setEstatusCatalog] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [open, setOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from('productos_status').select('codigo').then(({ data }) => {
      setEstatusCatalog(new Set((data || []).map((r: any) => String(r.codigo).toUpperCase())));
    });
  }, []);

  const descargarPlantilla = () => {
    const ws = XLSX.utils.json_to_sheet([{
      clave: '7501000000001', descripcion: 'PARACETAMOL 500MG C/10', nombre: 'PARACETAMOL 500MG',
      laboratorio: 'GENOMMA', categoria: 'ANALGÉSICOS', departamento: 'GENERICO',
      agrupador: 'GENÉRICOS', sustancia: 'PARACETAMOL', iva: '0', estatus: 'A', clasificacion: 'W',
    }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'atributos_maestros');
    XLSX.writeFile(wb, 'plantilla_atributos_maestros.xlsx');
  };

  const procesarArchivo = async (file: File) => {
    setFileName(file.name);
    setProgress('Leyendo archivo...');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const raw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    if (!raw.length) { toast.error('Archivo vacío'); setProgress(''); return; }

    // Normaliza headers a lowercase
    const normalized = raw.map((r) => {
      const o: any = {};
      for (const k of Object.keys(r)) o[k.toLowerCase().trim()] = r[k];
      return o;
    });

    // Carga existentes por clave en LOTES (PostgREST falla con URLs > ~16KB
    // cuando se hace .or(sku.in.(...),codigo_barras.in.(...)) con miles de claves).
    // Para cada lote: 2 queries en paralelo (sku + codigo_barras), dedupe por id.
    const claves = Array.from(new Set(normalized.map((r) => norm(r.clave)).filter(Boolean)));
    const CHUNK = 250;
    const totalLotes = Math.max(1, Math.ceil(claves.length / CHUNK));
    const SELECT_COLS = 'id,sku,codigo_barras,nombre,descripcion,laboratorio,categoria,departamento,agrupador,sustancia_activa,iva_tasa,estatus,clasificacion';
    const existentesById = new Map<string, any>();

    const fetchChunk = async (chunk: string[], loteNum: number): Promise<any[]> => {
      const run = () => Promise.all([
        supabase.from('productos').select(SELECT_COLS).in('sku', chunk),
        supabase.from('productos').select(SELECT_COLS).in('codigo_barras', chunk),
      ]);
      for (let attempt = 1; attempt <= 2; attempt++) {
        const [a, b] = await run();
        if (!a.error && !b.error) return [...(a.data || []), ...(b.data || [])];
        if (attempt === 2) throw new Error(`Lote ${loteNum} falló: ${a.error?.message || b.error?.message}`);
      }
      return [];
    };

    try {
      for (let i = 0; i < claves.length; i += CHUNK) {
        const loteNum = Math.floor(i / CHUNK) + 1;
        setProgress(`Validando lote ${loteNum} de ${totalLotes} (${claves.length} claves)...`);
        const found = await fetchChunk(claves.slice(i, i + CHUNK), loteNum);
        for (const p of found) existentesById.set(p.id, p);
      }
    } catch (e: any) {
      toast.error(e.message || 'Error validando lotes');
      setProgress('');
      return;
    }

    const byClave = new Map<string, any>();
    existentesById.forEach((p) => {
      if (p.codigo_barras) byClave.set(String(p.codigo_barras), p);
      if (p.sku && !byClave.has(String(p.sku))) byClave.set(String(p.sku), p);
    });
    setProgress('');

    const seen = new Set<string>();
    const preview: PreviewRow[] = normalized.map((r, idx) => {
      const fila = idx + 2; // header en 1
      const clave = norm(r.clave);
      if (!clave) return { fila, raw: r, clave, accion: 'OMIT', motivo: 'Clave vacía' };
      if (seen.has(clave)) return { fila, raw: r, clave, accion: 'OMIT', motivo: 'Clave duplicada en el archivo' };
      seen.add(clave);

      // Validar estatus
      const estatus = norm(r.estatus).toUpperCase();
      if (estatus && !estatusCatalog.has(estatus)) {
        return { fila, raw: r, clave, accion: 'OMIT', motivo: `Estatus inválido: "${estatus}" (no existe en catálogo)` };
      }
      // Clasificación del cliente: TEXTO LIBRE. No se valida (acepta A-W, DESCLASIFICADO, vacío).
      const clasif = norm(r.clasificacion);
      // Validar IVA
      const iva = parseIva(r.iva);
      if (!iva.ok) return { fila, raw: r, clave, accion: 'OMIT', motivo: iva.err };

      const patch: any = {};
      if (notEmpty(r.descripcion)) patch.descripcion = norm(r.descripcion);
      if (notEmpty(r.nombre)) patch.nombre = norm(r.nombre);
      if (notEmpty(r.laboratorio)) patch.laboratorio = norm(r.laboratorio);
      if (notEmpty(r.categoria)) patch.categoria = norm(r.categoria);
      if (notEmpty(r.departamento)) patch.departamento = norm(r.departamento).toUpperCase();
      if (notEmpty(r.agrupador)) patch.agrupador = norm(r.agrupador);
      if (notEmpty(r.sustancia)) patch.sustancia_activa = norm(r.sustancia);
      if (notEmpty(r.iva)) patch.iva_tasa = iva.value;
      if (estatus) patch.estatus = estatus;
      if (clasif) patch.clasificacion = clasif;

      const existente = byClave.get(clave);
      if (existente) {
        // Idempotencia: descartar campos cuyo valor ya coincide
        const realPatch: any = {};
        for (const k of Object.keys(patch)) {
          const cur = existente[k];
          const next = patch[k];
          const curN = cur == null ? null : (typeof cur === 'string' ? cur.trim() : cur);
          const nextN = next == null ? null : (typeof next === 'string' ? next.trim() : next);
          if (curN !== nextN) realPatch[k] = next;
        }
        if (Object.keys(realPatch).length === 0) {
          return { fila, raw: r, clave, accion: 'UPDATE', existenteId: existente.id, patch: {}, motivo: 'Sin cambios (idempotente)' };
        }
        return { fila, raw: r, clave, accion: 'UPDATE', existenteId: existente.id, patch: realPatch };
      }

      // Producto nuevo — requiere al menos nombre (o descripcion como fallback)
      const nombreInsert = patch.nombre || patch.descripcion;
      if (!nombreInsert) {
        return { fila, raw: r, clave, accion: 'OMIT', motivo: 'Producto nuevo sin nombre ni descripción' };
      }
      const insertObj: any = {
        sku: clave,
        codigo_barras: /^\d{8,}$/.test(clave) ? clave : null,
        nombre: nombreInsert,
        precio_base: 0,
        activo: true,
        ...patch,
      };
      return { fila, raw: r, clave, accion: 'INSERT', patch: insertObj };
    });

    setRows(preview);
    setOpen(true);
  };

  const ejecutar = async () => {
    setCommitting(true);
    let inserted = 0, updated = 0, errors: any[] = [];
    try {
      const inserts = rows.filter((r) => r.accion === 'INSERT');
      const updates = rows.filter((r) => r.accion === 'UPDATE' && r.patch && Object.keys(r.patch).length > 0);

      if (inserts.length) {
        const { error, count } = await supabase
          .from('productos')
          .insert(inserts.map((r) => r.patch) as any, { count: 'exact' });
        if (error) errors.push({ fase: 'INSERT', error: error.message });
        else inserted = count || inserts.length;
      }
      for (const u of updates) {
        const { error } = await supabase.from('productos').update(u.patch as any).eq('id', u.existenteId!);
        if (error) errors.push({ fila: u.fila, clave: u.clave, error: error.message });
        else updated++;
      }

      await supabase.from('cargas_masivas_historico').insert({
        tipo: 'atributos_maestros',
        nombre_archivo: fileName,
        total_filas: rows.length,
        filas_ok: inserted + updated,
        filas_error: errors.length + rows.filter((r) => r.accion === 'OMIT').length,
        errores: errors.length || rows.some((r) => r.accion === 'OMIT')
          ? [
              ...errors,
              ...rows.filter((r) => r.accion === 'OMIT').slice(0, 40).map((r) => ({ fila: r.fila, clave: r.clave, error: r.motivo })),
            ].slice(0, 80)
          : null,
      });

      toast.success(`Atributos Maestros: ${inserted} insertados · ${updated} actualizados · ${errors.length} errores`);
      setOpen(false);
      setRows([]);
      onDone?.();
    } finally {
      setCommitting(false);
    }
  };

  const counts = {
    INSERT: rows.filter((r) => r.accion === 'INSERT').length,
    UPDATE: rows.filter((r) => r.accion === 'UPDATE' && r.patch && Object.keys(r.patch).length > 0).length,
    NOOP: rows.filter((r) => r.accion === 'UPDATE' && (!r.patch || Object.keys(r.patch).length === 0)).length,
    OMIT: rows.filter((r) => r.accion === 'OMIT').length,
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">Columnas aceptadas (11):</p>
        <div className="flex flex-wrap gap-1 mt-2">
          {COLUMNAS.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
        </div>
        <ul className="text-xs text-muted-foreground mt-2 space-y-1">
          <li>• <b>clave</b> hace match contra <code>codigo_barras</code> o <code>sku</code>.</li>
          <li>• UPSERT por clave: solo se actualizan los campos NO vacíos del Excel; celdas en blanco no sobreescriben.</li>
          <li>• <b>iva</b> acepta vacío (queda NULL = "Sin definir"), 0, 0.16, 16, "16%".</li>
          <li>• <b>estatus</b> se valida contra el catálogo <code>productos_status</code>.</li>
          <li>• <b>clasificacion</b> es <b>texto libre del cliente</b> (A-W, DESCLASIFICADO, vacío). NO se valida.</li>
          <li>• La clasificación <b>ABC (A/B/C/D/O) es calculada por el sistema</b> en otra columna; NO se carga desde Excel.</li>
          <li>• Idempotente: una segunda corrida del mismo archivo muestra 0 INSERT y solo UPDATEs con cambio real.</li>
        </ul>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={descargarPlantilla}><Download className="h-4 w-4 mr-2" />Descargar plantilla</Button>
        <Button onClick={() => fileRef.current?.click()} disabled={!!progress}>
          {progress ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
          {progress || 'Subir Excel'}
        </Button>
        <input
          ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) procesarArchivo(f); e.target.value = ''; }}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Vista previa — Atributos Maestros ({fileName})</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge className="bg-green-600">INSERT: {counts.INSERT}</Badge>
            <Badge className="bg-blue-600">UPDATE con cambios: {counts.UPDATE}</Badge>
            <Badge variant="outline">UPDATE sin cambios (idempotente): {counts.NOOP}</Badge>
            <Badge variant="destructive">OMITIDAS: {counts.OMIT}</Badge>
            <Badge variant="secondary">Total: {rows.length}</Badge>
          </div>
          <div className="max-h-[55vh] overflow-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fila</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Clave</TableHead>
                  <TableHead>Descripción / Motivo</TableHead>
                  <TableHead>Campos a aplicar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 500).map((r) => (
                  <TableRow key={r.fila}>
                    <TableCell className="font-mono text-xs">{r.fila}</TableCell>
                    <TableCell>
                      {r.accion === 'INSERT' && <Badge className="bg-green-600">INSERT</Badge>}
                      {r.accion === 'UPDATE' && (r.patch && Object.keys(r.patch).length > 0
                        ? <Badge className="bg-blue-600">UPDATE</Badge>
                        : <Badge variant="outline">SIN CAMBIO</Badge>)}
                      {r.accion === 'OMIT' && <Badge variant="destructive">OMIT</Badge>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{r.clave || '—'}</TableCell>
                    <TableCell className="text-xs">
                      {r.accion === 'OMIT' ? <span className="text-red-600">{r.motivo}</span>
                        : (r.raw.descripcion || r.raw.nombre || '—')}
                      {r.accion === 'UPDATE' && r.motivo && <div className="text-muted-foreground">{r.motivo}</div>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.patch && Object.keys(r.patch).length > 0
                        ? Object.keys(r.patch).filter((k) => !['sku', 'codigo_barras', 'precio_base', 'activo'].includes(k)).join(', ')
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > 500 && (
              <div className="p-2 text-xs text-muted-foreground text-center">
                Mostrando primeras 500 filas de {rows.length}. Al confirmar se procesan todas.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={committing}>Cancelar</Button>
            <Button
              onClick={ejecutar}
              disabled={committing || (counts.INSERT + counts.UPDATE === 0)}
            >
              {committing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Importar válidas ({counts.INSERT + counts.UPDATE} filas)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
