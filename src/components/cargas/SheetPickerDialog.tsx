import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, FileSpreadsheet } from 'lucide-react';

// Reusable sheet picker: prevents the "lee la primera hoja" bug.
// Reads workbook in-memory, shows a dropdown with row counts per sheet,
// preselects a "preferred" name if present (e.g. "BD"), otherwise the
// sheet with most rows (better default than #1 for multi-sheet client files).

type SheetMeta = { name: string; rows: number };

export default function SheetPickerDialog({
  file,
  open,
  preferred = [],
  cellDates = false,
  onCancel,
  onConfirm,
}: {
  file: File | null;
  open: boolean;
  preferred?: string[];
  cellDates?: boolean;
  onCancel: () => void;
  onConfirm: (workbook: XLSX.WorkBook, sheetName: string, fileName: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheets, setSheets] = useState<SheetMeta[]>([]);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    setLoading(true);
    setWorkbook(null);
    setSheets([]);
    setSelected('');
    (async () => {
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { cellDates });
        if (cancelled) return;
        const meta: SheetMeta[] = wb.SheetNames.map((name) => {
          const sh = wb.Sheets[name];
          const ref = sh && sh['!ref'];
          let rows = 0;
          if (ref) {
            const range = XLSX.utils.decode_range(ref);
            rows = Math.max(0, range.e.r - range.s.r); // exclude header
          }
          return { name, rows };
        });
        const prefUpper = preferred.map((p) => p.toUpperCase());
        const preferredHit = meta.find((m) => prefUpper.includes(m.name.toUpperCase()));
        const biggest = [...meta].sort((a, b) => b.rows - a.rows)[0];
        const def = preferredHit?.name || biggest?.name || meta[0]?.name || '';
        setWorkbook(wb);
        setSheets(meta);
        setSelected(def);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, file, cellDates, preferred.join('|')]);

  const selRows = useMemo(() => sheets.find((s) => s.name === selected)?.rows ?? 0, [sheets, selected]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" /> Selecciona la hoja a procesar
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="h-4 w-4 animate-spin" /> Leyendo archivo...
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Archivo: <span className="font-mono">{file?.name}</span> · {sheets.length} hoja(s) detectada(s).
              {preferred.length > 0 && (
                <> Preseleccionada: <span className="font-mono">{preferred.join(' / ')}</span> si existe.</>
              )}
            </p>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger><SelectValue placeholder="Hoja..." /></SelectTrigger>
              <SelectContent className="max-h-[50vh]">
                {sheets.map((s) => (
                  <SelectItem key={s.name} value={s.name}>
                    {s.name} — {s.rows.toLocaleString()} filas
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Hoja seleccionada: <b>{selected || '—'}</b> ({selRows.toLocaleString()} filas)
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button
            disabled={loading || !workbook || !selected}
            onClick={() => workbook && selected && file && onConfirm(workbook, selected, file.name)}
          >
            Procesar hoja
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
