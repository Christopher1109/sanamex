import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Upload, Save } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sucursales: { id: string; codigo: string; nombre: string }[];
  onSaved: () => void;
}

export const CapturaCorteDialog: React.FC<Props> = ({ open, onOpenChange, sucursales, onSaved }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Record<string, { diferencia: string; observaciones: string }>>({});
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // Load existing cortes for selected date
    supabase.from('cortes_caja').select('sucursal_id, diferencia, notas').eq('fecha', fecha)
      .then(({ data }) => {
        const map: Record<string, { diferencia: string; observaciones: string }> = {};
        (data || []).forEach((r: any) => {
          map[r.sucursal_id] = { diferencia: String(r.diferencia ?? ''), observaciones: r.notas || '' };
        });
        setRows(map);
      });
  }, [open, fecha]);

  const update = (sid: string, field: 'diferencia' | 'observaciones', value: string) => {
    setRows(prev => ({ ...prev, [sid]: { ...(prev[sid] || { diferencia: '', observaciones: '' }), [field]: value } }));
  };

  const guardar = async () => {
    if (!user) return;
    setSaving(true);
    const records = Object.entries(rows)
      .filter(([, v]) => v.diferencia !== '' && !isNaN(parseFloat(v.diferencia)))
      .map(([sid, v]) => ({
        sucursal_id: sid,
        cajero_id: user.id,
        cerrado_por: user.id,
        fecha,
        diferencia: parseFloat(v.diferencia),
        efectivo_esperado: 0,
        efectivo_recibido: parseFloat(v.diferencia),
        estado: 'cerrado',
        notas: v.observaciones || null,
        cerrado_at: new Date().toISOString(),
      }));

    if (!records.length) {
      toast({ title: 'Sin datos', description: 'Captura al menos un corte.' });
      setSaving(false);
      return;
    }

    // Delete existing for that date+sucursal then insert (no unique constraint, do manual upsert)
    const sids = records.map(r => r.sucursal_id);
    await supabase.from('cortes_caja').delete().eq('fecha', fecha).in('sucursal_id', sids);
    const { error } = await supabase.from('cortes_caja').insert(records);
    setSaving(false);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Guardado', description: `${records.length} corte(s) registrado(s).` });
    onSaved();
    onOpenChange(false);
  };

  const importExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf);
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data: any[] = XLSX.utils.sheet_to_json(ws);
    const sucMap = new Map(sucursales.map(s => [s.codigo.toUpperCase(), s.id]));
    const records: any[] = [];
    let skipped = 0;
    data.forEach(r => {
      const cod = String(r.sucursal || r.Sucursal || '').toUpperCase().trim();
      const sid = sucMap.get(cod);
      const f = r.fecha || r.Fecha;
      const dif = parseFloat(r.diferencia || r.Diferencia);
      if (!sid || !f || isNaN(dif)) { skipped++; return; }
      const fechaStr = typeof f === 'number'
        ? new Date(Math.round((f - 25569) * 86400 * 1000)).toISOString().slice(0, 10)
        : String(f).slice(0, 10);
      records.push({
        sucursal_id: sid, cajero_id: user.id, cerrado_por: user.id,
        fecha: fechaStr, diferencia: dif, efectivo_esperado: 0, efectivo_recibido: dif,
        estado: 'cerrado', notas: r.observaciones || r.Observaciones || null,
        cerrado_at: new Date().toISOString(),
      });
    });
    if (!records.length) {
      toast({ title: 'Sin datos válidos', description: `Filas omitidas: ${skipped}`, variant: 'destructive' });
      return;
    }
    // Manual upsert: delete then insert
    for (const r of records) {
      await supabase.from('cortes_caja').delete().eq('fecha', r.fecha).eq('sucursal_id', r.sucursal_id);
    }
    const { error } = await supabase.from('cortes_caja').insert(records);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Importado', description: `${records.length} cortes (omitidas: ${skipped})` });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Capturar Cortes de Caja</DialogTitle></DialogHeader>
        <div className="flex items-end gap-3">
          <div>
            <Label>Fecha</Label>
            <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" />Importar Excel
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={importExcel} />
        </div>
        <p className="text-xs text-muted-foreground">
          Captura la diferencia en MXN. Positivo = sobrante, negativo = faltante, 0 = cuadrado.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sucursal</TableHead>
              <TableHead className="w-40">Diferencia $</TableHead>
              <TableHead>Observaciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sucursales.map(s => (
              <TableRow key={s.id}>
                <TableCell>{s.codigo} — {s.nombre}</TableCell>
                <TableCell>
                  <Input type="number" step="0.01" placeholder="0.00"
                    value={rows[s.id]?.diferencia || ''}
                    onChange={e => update(s.id, 'diferencia', e.target.value)} />
                </TableCell>
                <TableCell>
                  <Textarea rows={1} placeholder="opcional"
                    value={rows[s.id]?.observaciones || ''}
                    onChange={e => update(s.id, 'observaciones', e.target.value)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />{saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
