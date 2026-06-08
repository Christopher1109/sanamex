import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Upload, Save, Wand2 } from 'lucide-react';

interface Sucursal { id: string; codigo: string; nombre: string; }

interface Row {
  dia: number;
  venta: string;
  margen: string;
  utilidad: string;
}

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate();

export const CapturaPresupuestoDialog = ({
  open, onOpenChange, sucursales, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sucursales: Sucursal[];
  onSaved?: () => void;
}) => {
  const now = new Date();
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [sucursalId, setSucursalId] = useState<string>('');
  const [rows, setRows] = useState<Row[]>([]);
  const [bulkVenta, setBulkVenta] = useState('');
  const [bulkMargen, setBulkMargen] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (!sucursalId && sucursales.length) setSucursalId(sucursales[0].id);
  }, [open, sucursales, sucursalId]);

  useEffect(() => {
    if (!open || !sucursalId) return;
    const n = daysInMonth(anio, mes);
    const init: Row[] = Array.from({ length: n }, (_, i) => ({
      dia: i + 1, venta: '', margen: '', utilidad: '',
    }));
    (async () => {
      const { data } = await supabase
        .from('presupuesto_ventas')
        .select('dia, venta_presupuestada, margen_presupuestado, utilidad_presupuestada')
        .eq('sucursal_id', sucursalId)
        .eq('anio', anio)
        .eq('mes', mes)
        .not('dia', 'is', null);
      (data || []).forEach((r: any) => {
        const row = init[r.dia - 1];
        if (!row) return;
        row.venta = r.venta_presupuestada?.toString() ?? '';
        row.margen = r.margen_presupuestado?.toString() ?? '';
        row.utilidad = r.utilidad_presupuestada?.toString() ?? '';
      });
      setRows([...init]);
    })();
  }, [open, sucursalId, anio, mes]);

  const applyBulk = () => {
    setRows(rows.map(r => ({
      ...r,
      venta: bulkVenta || r.venta,
      margen: bulkMargen || r.margen,
      utilidad: (bulkVenta && bulkMargen)
        ? (parseFloat(bulkVenta) * parseFloat(bulkMargen) / 100).toFixed(2)
        : r.utilidad,
    })));
  };

  const handleSave = async () => {
    if (!sucursalId) return;
    setSaving(true);
    try {
      const payload = rows
        .filter(r => r.venta && parseFloat(r.venta) >= 0)
        .map(r => ({
          sucursal_id: sucursalId,
          anio, mes, dia: r.dia,
          venta_presupuestada: parseFloat(r.venta) || 0,
          margen_presupuestado: r.margen ? parseFloat(r.margen) : null,
          utilidad_presupuestada: r.utilidad ? parseFloat(r.utilidad) : null,
        }));
      if (!payload.length) {
        toast({ title: 'Nada que guardar', description: 'Captura al menos un día con venta.' });
        return;
      }
      const { error } = await supabase
        .from('presupuesto_ventas')
        .upsert(payload, { onConflict: 'sucursal_id,anio,mes,dia' });
      if (error) throw error;
      toast({ title: 'Presupuesto guardado', description: `${payload.length} día(s) actualizado(s).` });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error al guardar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleExcel = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(sheet);
      const sucMap = new Map(sucursales.map(s => [s.codigo.toUpperCase(), s.id]));
      const payload = json.map(r => {
        const cod = String(r.sucursal || r.Sucursal || '').toUpperCase().trim();
        const sid = sucMap.get(cod);
        if (!sid) return null;
        return {
          sucursal_id: sid,
          anio: parseInt(r.anio || r['año'] || r.Año),
          mes: parseInt(r.mes || r.Mes),
          dia: r.dia || r.Dia || r['día'] ? parseInt(r.dia || r.Dia || r['día']) : null,
          venta_presupuestada: parseFloat(r.venta_presup || r['venta_presupuestada'] || 0) || 0,
          margen_presupuestado: r.margen_presup ? parseFloat(r.margen_presup) : null,
          utilidad_presup: r.utilidad_presup ? parseFloat(r.utilidad_presup) : null,
        };
      }).filter(Boolean) as any[];
      if (!payload.length) {
        toast({ title: 'Archivo vacío', description: 'No se encontraron filas válidas.', variant: 'destructive' });
        return;
      }
      const { error } = await supabase
        .from('presupuesto_ventas')
        .upsert(payload, { onConflict: 'sucursal_id,anio,mes,dia' });
      if (error) throw error;
      toast({ title: 'Carga masiva OK', description: `${payload.length} filas importadas.` });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Error en carga', description: e.message, variant: 'destructive' });
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 1 + i);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Capturar presupuesto de ventas</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-3 mb-4">
          <div>
            <Label className="text-xs">Sucursal</Label>
            <Select value={sucursalId} onValueChange={setSucursalId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {sucursales.map(s => <SelectItem key={s.id} value={s.id}>{s.codigo} — {s.nombre}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Año</Label>
            <Select value={String(anio)} onValueChange={v => setAnio(parseInt(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Mes</Label>
            <Select value={String(mes)} onValueChange={v => setMes(parseInt(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Importar Excel</Label>
            <label className="flex items-center gap-2 h-10 px-3 border rounded-md cursor-pointer hover:bg-muted text-sm">
              <Upload className="h-4 w-4" />
              <span>Subir</span>
              <input type="file" accept=".xlsx,.xls" className="hidden"
                onChange={e => e.target.files?.[0] && handleExcel(e.target.files[0])} />
            </label>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-4 p-3 bg-muted/40 rounded">
          <div className="col-span-4 text-xs font-medium">Aplicar misma meta a todos los días:</div>
          <Input placeholder="Venta diaria" value={bulkVenta} onChange={e => setBulkVenta(e.target.value)} type="number" />
          <Input placeholder="Margen % esperado" value={bulkMargen} onChange={e => setBulkMargen(e.target.value)} type="number" />
          <div />
          <Button variant="secondary" onClick={applyBulk}><Wand2 className="h-4 w-4 mr-1" />Aplicar</Button>
        </div>

        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Día</TableHead>
                <TableHead>Venta presupuestada</TableHead>
                <TableHead>Margen % esperado</TableHead>
                <TableHead>Utilidad esperada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.dia}>
                  <TableCell className="font-medium">{r.dia}</TableCell>
                  <TableCell>
                    <Input type="number" value={r.venta} onChange={e => {
                      const c = [...rows]; c[i].venta = e.target.value;
                      if (c[i].margen) c[i].utilidad = (parseFloat(e.target.value || '0') * parseFloat(c[i].margen) / 100).toFixed(2);
                      setRows(c);
                    }} className="h-8" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={r.margen} onChange={e => {
                      const c = [...rows]; c[i].margen = e.target.value;
                      if (c[i].venta) c[i].utilidad = (parseFloat(c[i].venta) * parseFloat(e.target.value || '0') / 100).toFixed(2);
                      setRows(c);
                    }} className="h-8" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" value={r.utilidad} onChange={e => {
                      const c = [...rows]; c[i].utilidad = e.target.value; setRows(c);
                    }} className="h-8" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4 mr-1" />{saving ? 'Guardando...' : 'Guardar presupuesto'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
